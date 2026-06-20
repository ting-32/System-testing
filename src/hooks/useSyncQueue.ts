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
        await queueStore.iterate((value: any, key: string) => {
          let fixedValue = { ...value };
          if (!fixedValue.taskId) {
            fixedValue.taskId = key || fixedValue.id || crypto.randomUUID();
          }
          if (typeof fixedValue.retryCount !== 'number' || isNaN(fixedValue.retryCount)) {
            fixedValue.retryCount = 0;
          }
          if (!fixedValue.timestamp) {
            fixedValue.timestamp = Date.now();
          }
          tasks.push(fixedValue as SyncTask);
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
  const addSyncTask = useCallback(async (newTask: SyncTask) => {
    try {
      setSyncQueue(prevQueue => {
        // 1. 複製一份目前的佇列以便操作
        const activeTasks = [...prevQueue];
        
        // 2. 針對「訂單內容更新」實行去重合併
        if (newTask.type === 'UPDATE_CONTENT') {
          const targetOrderId = newTask.payload.id;
          
          // 尋找佇列中是否已經存在對「同一筆訂單」的「內容更新」
          const existingTaskIndex = activeTasks.findIndex(
            t => t.type === 'UPDATE_CONTENT' && t.payload.id === targetOrderId
          );
          
          if (existingTaskIndex !== -1) {
            // [關鍵] 找到了任務！我們不新增，而是「蓋掉它」的 payload 和更新時間
            activeTasks[existingTaskIndex] = {
              ...activeTasks[existingTaskIndex],
              payload: newTask.payload, // 直接覆蓋為最新的更改內容
              timestamp: Date.now(),    // 更新時間標記
              retryCount: 0             // 既然是一次全新的更新，重置重試計數
            };
            
            // 更新 localForage (需利用該存在的 taskId 去覆寫資料庫)
            queueStore.setItem(activeTasks[existingTaskIndex].taskId, activeTasks[existingTaskIndex]).catch(console.error);
            return activeTasks;
          }
        }
        
        // 3. 針對「刪除訂單」的處理 (選做，但強烈建議)
        if (newTask.type === 'delete_order') {
           const targetOrderId = newTask.payload.id;
           const filteredTasks = activeTasks.filter(t => {
             if (t.type === 'UPDATE_CONTENT' && t.payload.id === targetOrderId) {
                // 同步刪除 localForage 中被剔除的任務 (依據 taskId)
                queueStore.removeItem(t.taskId).catch(console.error);
                return false;
             }
             return true;
           });
           
           if (!newTask.taskId) newTask.taskId = crypto.randomUUID();
           filteredTasks.push(newTask);
           queueStore.setItem(newTask.taskId, newTask).catch(console.error);
           return filteredTasks;
        }

        // UPDATE_STATUS or BATCH_UPDATE handling
        if (newTask.type === 'UPDATE_STATUS' || newTask.type === 'BATCH_UPDATE') {
          const newUpdates = newTask.payload?.updates || [];
          if (newUpdates.length > 0) {
            // 飛行中或等冪攔截 (In-Flight Drop)：
            const hasIdenticalIntent = activeTasks.some(t => {
              if (t.type !== newTask.type) return false;
              const pendingUpdates = t.payload?.updates || [];
              return newUpdates.every((nu: any) => 
                pendingUpdates.some((pu: any) => pu.id === nu.id && pu.status === nu.status && pu.trip === nu.trip)
              );
            });
            
            if (hasIdenticalIntent) {
              console.log('[SyncQueue] Intercepted identical intent. Request dropped.');
              return activeTasks;
            }

            // 重複任務覆蓋 (例如同一筆訂單短時間內改成不同狀態，後者覆蓋前者)
            const existingIdx = activeTasks.findIndex(t => {
              if (t.type !== newTask.type) return false;
              const pendingUpdates = t.payload?.updates || [];
              return newUpdates.some((nu: any) => pendingUpdates.some((pu: any) => pu.id === nu.id));
            });

            if (existingIdx >= 0) {
              activeTasks[existingIdx] = { 
                ...newTask, 
                taskId: activeTasks[existingIdx].taskId, 
                timestamp: Date.now(), 
                retryCount: 0 
              };
              queueStore.setItem(activeTasks[existingIdx].taskId, activeTasks[existingIdx]).catch(console.error);
              return activeTasks;
            }
          }
        }

        // 4. 若沒有可合併的對象，就當作全新的一般任務插入
        if (!newTask.taskId) newTask.taskId = crypto.randomUUID();
        activeTasks.push(newTask);
        queueStore.setItem(newTask.taskId, newTask).catch(console.error);
        
        return activeTasks;
      });
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
        } else if (task.type === 'UPDATE_CONTENT') {
           bodyPayload = { action: 'updateOrderContent', token: token || "", data: task.payload };
        } else if (task.type === 'delete_order') {
           bodyPayload = { action: 'deleteOrder', token: token || "", data: task.payload };
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
                   onSyncSuccess(task, json.data || {});
               }
           } else {
               if (json.errorCode === 'VERSION_CONFLICT' || json.errorCode === 'ERR_VERSION_CONFLICT') {
                   console.log('[SyncQueue] Auto recovering from VERSION_CONFLICT...');
                   try {
                       let targets: string[] = [];
                       if (task.type === 'UPDATE_CONTENT' || task.type === 'delete_order') {
                           targets.push(task.payload.id);
                       } else if (task.type === 'UPDATE_STATUS' || task.type === 'BATCH_UPDATE') {
                           targets = (task.payload?.updates || []).map((u: any) => u.id);
                       }
                       if (targets.length === 1 && targets[0]) {
                            const getOrderRes = await fetchWithRetry(apiEndpoint, {
                                method: 'POST',
                                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                                body: JSON.stringify({ action: 'getOrder', token: token || "", data: { id: targets[0] } })
                            }, undefined, 1, 1000, true);
                            if (getOrderRes.ok) {
                                const orderData = await getOrderRes.json();
                                if (orderData.success && orderData.data) {
                                    const latestVersion = orderData.data.version || orderData.data.Version || 0;
                                    const newPayload = { ...task.payload };
                                    if (task.type === 'UPDATE_CONTENT') {
                                        newPayload.version = latestVersion;
                                    } else if (task.type === 'UPDATE_STATUS' || task.type === 'BATCH_UPDATE') {
                                        if (newPayload.updates && newPayload.updates[0]) {
                                            newPayload.updates[0].version = latestVersion;
                                        }
                                    } else if (task.type === 'delete_order') {
                                        newPayload.originalLastUpdated = orderData.data.lastUpdated; 
                                    }
                                    const recoveredTask = {
                                        ...task,
                                        payload: newPayload,
                                        retryCount: 0
                                    };
                                    setSyncQueue(prev => prev.map(t => t.taskId === task.taskId ? recoveredTask : t));
                                    await queueStore.setItem(task.taskId, recoveredTask);
                                    addToast?.('已在背景自動修復資料衝突，即將重試更新', 'info');
                                    setIsSyncingQueue(false);
                                    return; 
                                }
                            }
                       }
                   } catch (e) {
                       console.error('[SyncQueue] Failed to auto-recover', e);
                   }
                   // 發生不可逆的格式或版本錯誤，也是丟棄任務
                   await queueStore.removeItem(task.taskId);
                   setSyncQueue(prev => prev.filter(t => t.taskId !== task.taskId));
                   
               addToast?.('⚠️ 發生無法自動修復的版本衝突，請重新整理頁面後再試一次！', 'error');
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
               const currentRetries = typeof t.retryCount === 'number' && !isNaN(t.retryCount) ? t.retryCount : 0;
               const newRetries = currentRetries + 1;
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

    // 實作短暫防抖 (Debounce / Throttle) 延遲出列
    // 給予大約 1000ms 的聚合時間，讓前端可以整併多個連續動作
    const timerId = setTimeout(() => {
      processQueue();
    }, 1000);

    return () => clearTimeout(timerId);

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
