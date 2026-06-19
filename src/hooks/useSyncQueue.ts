import { useState, useEffect, useCallback } from 'react';
import { SyncTask } from '../types';
import { fetchWithRetry } from '../utils/fetchUtils';
import localforage from 'localforage';

// 建立獨立的 Queue Store (LocalForage)
const queueStore = localforage.createInstance({
  name: 'NMR_App_DB',
  storeName: 'nmr_action_queue',
});

export function useSyncQueue(
  apiEndpoint: string, 
  addToast?: (msg: string, type: 'success'|'error'|'info'|'warning') => void,
  onSyncSuccess?: (task: SyncTask, newLastUpdatedTs: number) => void,
  onSyncError?: (task: SyncTask, errorMsg: string) => void,
  onSyncGiveUp?: (task: SyncTask) => void
) {
  const [syncQueue, setSyncQueue] = useState<SyncTask[]>([]);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // 4. 啟動喚醒 (Hydration)：自動掃描未完成任務並推入 Queue
  useEffect(() => {
    const hydrateQueue = async () => {
      try {
        const tasks: SyncTask[] = [];
        await queueStore.iterate((value: SyncTask) => {
          tasks.push(value);
        });
        
        // 確保依照發生順序打 API
        tasks.sort((a, b) => a.timestamp - b.timestamp);
        
        if (tasks.length > 0) {
          console.log(`[SyncQueue] Hydrated ${tasks.length} pending tasks from persistent store`);
          setSyncQueue(tasks);
        }
      } catch (err) {
        console.error('[SyncQueue] Failed to hydrate queue:', err);
      } finally {
        setIsHydrated(true); // 標記為已掃描完成
      }
    };
    
    hydrateQueue();
  }, []);

  // 2. 寫入攔截：同時寫入 React State 與 nmr_action_queue
  const addSyncTask = useCallback(async (task: SyncTask) => {
    try {
      let finalTask = { ...task };
      let dropRequest = false;

      setSyncQueue(prev => {
        if (task.type === 'UPDATE_STATUS' || task.type === 'BATCH_UPDATE') {
          const newUpdates = task.payload?.updates || [];
          if (newUpdates.length > 0) {
            // 飛行中或等冪攔截 (In-Flight Drop)：
            // 如果這筆訂單的狀態切換「已經在路上」或者是重複操作，且狀態目標跟現有一模一樣，直接捨棄。
            const hasIdenticalIntent = prev.some(t => {
              if (t.type !== task.type) return false;
              const pendingUpdates = t.payload?.updates || [];
              return newUpdates.every((nu: any) => 
                pendingUpdates.some((pu: any) => pu.id === nu.id && pu.status === nu.status && pu.trip === nu.trip)
              );
            });
            
            if (hasIdenticalIntent) {
              dropRequest = true;
              return prev;
            }

            // 重複任務覆蓋 (例如同一筆訂單短時間內改成不同狀態，後者覆蓋前者)
            const existingIdx = prev.findIndex(t => {
              if (t.type !== task.type) return false;
              const pendingUpdates = t.payload?.updates || [];
              return newUpdates.some((nu: any) => pendingUpdates.some((pu: any) => pu.id === nu.id));
            });

            if (existingIdx >= 0) {
              const newQueue = [...prev];
              finalTask = { 
                ...task, 
                taskId: newQueue[existingIdx].taskId, 
                timestamp: Date.now(), 
                retryCount: newQueue[existingIdx].retryCount 
              };
              newQueue[existingIdx] = finalTask;
              return newQueue;
            }
          }
        }
        
        // 其他類型的覆蓋機制 (UPDATE_ORDER / DELETE_ORDER等)
        if (task.payload?.id) {
           const existingIdx = prev.findIndex(t => t.type === task.type && t.payload?.id === task.payload.id);
           if (existingIdx >= 0) {
             const newQueue = [...prev];
             finalTask = { 
               ...task, 
               taskId: newQueue[existingIdx].taskId, 
               timestamp: Date.now(), 
               retryCount: newQueue[existingIdx].retryCount 
             };
             newQueue[existingIdx] = finalTask;
             return newQueue;
           }
        }

        return [...prev, task];
      });

      if (dropRequest) {
        console.log('[SyncQueue] Intercepted identical intent. Request dropped.');
        return;
      }

      // 同步寫入 IndexedDB 持久化
      await queueStore.setItem(finalTask.taskId, finalTask);
    } catch (err) {
      console.error('[SyncQueue] Failed to persist task:', err);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated || syncQueue.length === 0 || isSyncingQueue) return;

    const processQueue = async () => {
      setIsSyncingQueue(true);
      const task = syncQueue[0];

      try {
        if (!apiEndpoint) throw new Error('No API endpoint');
        const token = localStorage.getItem('APP_SESSION_TOKEN');
        let bodyPayload: any;

        if (task.type === 'UPDATE_STATUS' || task.type === 'BATCH_UPDATE') {
           bodyPayload = {
             action: 'batchUpdateOrders',
             token: token || "",
             data: task.payload
           };
        }

        const res = await fetchWithRetry(
          apiEndpoint, 
          {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(bodyPayload)
          },
          undefined,
          2, // retries
          4000, // delay
          true, // silentFail
          30000 // timeout
        );

        if (res.ok) {
           const json = await res.json();
           if (json.success) {
               // 3. 刪除機制：只有當收到 GAS 回傳 HTTP 200 成功時才刪除
               await queueStore.removeItem(task.taskId);
               setSyncQueue(prev => prev.filter(t => t.taskId !== task.taskId));
               
               if (onSyncSuccess) {
                   onSyncSuccess(task, json.data?.newLastUpdatedTs || Date.now());
               }
           } else {
               if (json.errorCode === 'VERSION_CONFLICT' || json.errorCode === 'ERR_VERSION_CONFLICT') {
                   // 發生不可逆的格式或版本錯誤，也是丟棄任務
                   await queueStore.removeItem(task.taskId);
                   setSyncQueue(prev => prev.filter(t => t.taskId !== task.taskId));
                   
               addToast?.('⚠️ 資料版本衝突，有其他人員正在更新此訂單。正在為您重新載入最新版本！', 'warning');
                   if (onSyncGiveUp) {
                       onSyncGiveUp(task);
                   }
               } else {
                   throw new Error(json.error || 'Server error');
               }
           }
        } else {
           throw new Error('HTTP error');
        }
      } catch (err: any) {
        let isTaskGivenUp = false;
        
        setSyncQueue(prev => prev.map(t => {
           if (t.taskId === task.taskId) {
               const newRetries = t.retryCount + 1;
               if (newRetries > 10) {
                 // 10 retries (~3-5 mins) then give up. 
                 isTaskGivenUp = true;
                 addToast?.(`訂單更新背景同步失敗過多次，請整理畫面重試`, 'error');
                 if (onSyncError) {
                     onSyncError(task, '同步失敗過多次');
                 }
                 return null as any; 
               }
               
               // 更新 DB 內任務的重試次數狀態
               queueStore.setItem(t.taskId, { ...t, retryCount: newRetries });
               
               return { ...t, retryCount: newRetries };
           }
           return t;
        }).filter(Boolean));

        if (isTaskGivenUp) {
           await queueStore.removeItem(task.taskId);
           if (onSyncGiveUp) {
               onSyncGiveUp(task);
           }
        }

        // Add a delay before next attempt so we don't spam if it's an immediate failure
        await new Promise(r => setTimeout(r, 6000));
      } finally {
        setIsSyncingQueue(false);
      }
    };

    // run immediately without waiting for an interval
    processQueue();

  }, [syncQueue, isSyncingQueue, isHydrated, apiEndpoint, addToast]);

  // 5. 攔截關閉事件 (BeforeUnload)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (syncQueue.length > 0) {
        e.preventDefault();
        // 觸發瀏覽器原生的警告
        e.returnValue = '您尚有變更未同步至伺服器，確定要離開嗎？';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [syncQueue]);

  const removeTaskByPayloadId = useCallback(async (payloadId: string) => {
    // 找出符合的 task
    const tasksToRemove = syncQueue.filter(t => t.payload?.id === payloadId || (t.payload?.updates && t.payload.updates.some((u: any) => u.id === payloadId)));
    
    if (tasksToRemove.length > 0) {
      for (const t of tasksToRemove) {
        await queueStore.removeItem(t.taskId);
      }
      setSyncQueue(prev => prev.filter(t => !tasksToRemove.includes(t)));
    }
  }, [syncQueue]);

  return { syncQueue, addSyncTask, removeTaskByPayloadId, isSyncingQueue };
}
