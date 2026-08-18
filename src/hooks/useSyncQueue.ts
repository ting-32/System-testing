import { useState, useEffect, useCallback, useRef } from 'react';
import { SyncTask } from '../types';
import { fetchWithRetry } from '../utils/fetchUtils';
import localforage from 'localforage';

// 建立獨立的 Queue Store (LocalForage)
const queueStore = localforage.createInstance({
  name: 'NMR_App_DB',
  storeName: 'nmr_action_queue',
});

// 方案二：智慧防抖視窗 (400ms 為使用者連環滑動的黃金聚合時間)
const STATUS_DEBOUNCE_MS = 400;

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

  // 智慧防抖：狀態更新專用記憶體緩衝區與計時器
  const statusBufferRef = useRef<Map<string, any>>(new Map());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // 將狀態緩衝池內的變更 Flush 到真正的 SyncQueue 與 LocalForage
  const flushStatusBuffer = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (statusBufferRef.current.size === 0) return;

    const mergedUpdates = Array.from(statusBufferRef.current.values());
    statusBufferRef.current.clear();

    const compressedTask: SyncTask = {
      taskId: crypto.randomUUID(),
      type: 'BATCH_UPDATE',
      payload: { updates: mergedUpdates },
      retryCount: 0,
      timestamp: Date.now()
    };

    // 一次性寫入 localForage 與 React State
    queueStore.setItem(compressedTask.taskId, compressedTask).catch(console.error);
    setSyncQueue(prev => [...prev, compressedTask]);
  }, []);

  // 頁面背景切換或視窗即將關閉時，強制 Flush 緩衝區確保不遺漏
  useEffect(() => {
    const handleVisibilityOrUnload = () => {
      if (document.visibilityState === 'hidden') {
        flushStatusBuffer();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityOrUnload);
      flushStatusBuffer();
    };
  }, [flushStatusBuffer]);

  // 2. 寫入攔截：整合方案二的防抖吸收與方案一的合併機制
  const addSyncTask = useCallback(async (newTask: SyncTask) => {
    try {
      // 針對「狀態更新 (UPDATE_STATUS / BATCH_UPDATE)」實施智慧防抖壓縮 (Smart Debounce)
      if (newTask.type === 'UPDATE_STATUS' || newTask.type === 'BATCH_UPDATE') {
        const newUpdates = newTask.payload?.updates || [];
        if (newUpdates.length > 0) {
          // 放入防抖記憶體緩衝區
          newUpdates.forEach((u: any) => {
            if (u && u.id) {
              statusBufferRef.current.set(u.id, u);
            }
          });

          // 重設防抖計時器
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }

          debounceTimerRef.current = setTimeout(() => {
            flushStatusBuffer();
          }, STATUS_DEBOUNCE_MS);

          return; // 已被防抖吸收，等待 400ms 停手後自動打包寫入
        }
      }

      // 如果是其他操作（如 delete_order 或 UPDATE_CONTENT），先將現有緩衝區 Flush，維持時序正確
      if (statusBufferRef.current.size > 0) {
        flushStatusBuffer();
      }

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
        
        // 3. 針對「刪除訂單」的處理
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

        // 4. 若沒有可合併的對象，就當作全新的一般任務插入
        if (!newTask.taskId) newTask.taskId = crypto.randomUUID();
        activeTasks.push(newTask);
        queueStore.setItem(newTask.taskId, newTask).catch(console.error);
        
        return activeTasks;
      });
    } catch (err) {
      console.error('[SyncQueue] Failed to persist task:', err);
    }
  }, [flushStatusBuffer]);

  // 3. 佇列發送 (Process Queue) - 實施方案一（自動批次合併）+ 方案三（動態零延遲連續出列）
  useEffect(() => {
    if (!isHydrated || syncQueue.length === 0 || isSyncingQueue) return;

    const processQueue = async () => {
      setIsSyncingQueue(true);
      const firstTask = syncQueue[0];

      // 檢查是否可批次打包合併 (Auto Batch Merging)
      const isBatchable = firstTask.type === 'UPDATE_STATUS' || firstTask.type === 'BATCH_UPDATE';
      let batchTasks: SyncTask[] = [];

      if (isBatchable) {
        // 撈出前段所有同為 UPDATE_STATUS / BATCH_UPDATE 的任務（最多 40 筆為一個 Chunk）
        for (const t of syncQueue) {
          if ((t.type === 'UPDATE_STATUS' || t.type === 'BATCH_UPDATE') && batchTasks.length < 40) {
            batchTasks.push(t);
          } else {
            break;
          }
        }
      } else {
        batchTasks = [firstTask];
      }

      const processedTaskIds = batchTasks.map(t => t.taskId);

      try {
        if (!apiEndpoint) throw new Error('No API endpoint');
        const token = localStorage.getItem('APP_SESSION_TOKEN');
        let bodyPayload: any;

        if (isBatchable) {
          // 合併 updates 並以最新狀態去重
          const updateMap = new Map<string, any>();
          batchTasks.forEach(t => {
            (t.payload?.updates || []).forEach((u: any) => {
              if (u && u.id) {
                updateMap.set(u.id, u);
              }
            });
          });
          const mergedUpdates = Array.from(updateMap.values());

          bodyPayload = {
            action: 'batchUpdateOrders',
            token: token || "",
            data: { updates: mergedUpdates }
          };
        } else if (firstTask.type === 'UPDATE_CONTENT') {
          bodyPayload = { action: 'updateOrderContent', token: token || "", data: firstTask.payload };
        } else if (firstTask.type === 'delete_order') {
          bodyPayload = { action: 'deleteOrder', token: token || "", data: firstTask.payload };
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
          2000, // delay
          true, // silentFail
          30000 // timeout
        );

        if (res.ok) {
           const json = await res.json();
           if (json.success) {
               // 成功：平行批次清除 localForage 與 React State
               await Promise.all(processedTaskIds.map(id => queueStore.removeItem(id).catch(console.error)));
               setSyncQueue(prev => prev.filter(t => !processedTaskIds.includes(t.taskId)));
               
               if (onSyncSuccess) {
                   batchTasks.forEach(t => onSyncSuccess(t, json.data || {}));
               }
           } else {
               if (json.errorCode === 'VERSION_CONFLICT' || json.errorCode === 'ERR_VERSION_CONFLICT') {
                   console.log('[SyncQueue] Auto recovering from VERSION_CONFLICT...');
                   try {
                       let targets: string[] = [];
                       if (firstTask.type === 'UPDATE_CONTENT' || firstTask.type === 'delete_order') {
                           targets.push(firstTask.payload.id);
                       } else if (isBatchable) {
                           batchTasks.forEach(t => {
                             (t.payload?.updates || []).forEach((u: any) => {
                               if (u?.id && !targets.includes(u.id)) targets.push(u.id);
                             });
                           });
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
                                    const newPayload = { ...firstTask.payload };
                                    if (firstTask.type === 'UPDATE_CONTENT') {
                                        newPayload.version = latestVersion;
                                    } else if (isBatchable) {
                                        if (newPayload.updates && newPayload.updates[0]) {
                                            newPayload.updates[0].version = latestVersion;
                                        }
                                    } else if (firstTask.type === 'delete_order') {
                                        newPayload.originalLastUpdated = orderData.data.lastUpdated; 
                                    }
                                    const recoveredTask = {
                                        ...firstTask,
                                        payload: newPayload,
                                        retryCount: 0
                                    };
                                    setSyncQueue(prev => prev.map(t => t.taskId === firstTask.taskId ? recoveredTask : t));
                                    await queueStore.setItem(firstTask.taskId, recoveredTask);
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
                   await Promise.all(processedTaskIds.map(id => queueStore.removeItem(id).catch(console.error)));
                   setSyncQueue(prev => prev.filter(t => !processedTaskIds.includes(t.taskId)));
                   
                   addToast?.('⚠️ 發生無法自動修復的版本衝突，請重新整理頁面後再試一次！', 'error');
                   if (onSyncGiveUp) {
                       batchTasks.forEach(t => onSyncGiveUp(t));
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
           if (processedTaskIds.includes(t.taskId)) {
               const currentRetries = typeof t.retryCount === 'number' && !isNaN(t.retryCount) ? t.retryCount : 0;
               const newRetries = currentRetries + 1;
               if (newRetries > 10) {
                 // 10 retries (~3-5 mins) then give up. 
                 isTaskGivenUp = true;
                 addToast?.(`訂單更新背景同步失敗過多次，請整理畫面重試`, 'error');
                 if (onSyncError) {
                     onSyncError(t, '同步失敗過多次');
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
           await Promise.all(processedTaskIds.map(id => queueStore.removeItem(id).catch(console.error)));
           if (onSyncGiveUp) {
               batchTasks.forEach(t => onSyncGiveUp(t));
           }
        }

        // 失敗時使用退避延遲 (Error Backoff Delay)，避免網路故障時狂發請求
        await new Promise(r => setTimeout(r, 4000));
      } finally {
        setIsSyncingQueue(false);
      }
    };

    // ==========================================
    // UI/UX 防呆：前端的「離峰靜默期 (Maintenance Window)」
    // ==========================================
    const currentHour = new Date().getHours();
    const isMaintenanceWindow = currentHour >= 3 && currentHour < 4;

    // 【方案三：動態縮短任務間隔 (Zero Delay on Queue Flush)】
    // 一般正常白天營運時段：0ms 零延遲立即推進出列（全速發送下一筆異質任務）
    // 凌晨 3:00 ~ 4:00 維護期：延遲 15 分鐘避免與伺服器排程鎖定衝突
    const timeout = isMaintenanceWindow ? 15 * 60 * 1000 : 0;
    
    if (isMaintenanceWindow && syncQueue.length > 0 && !isSyncingQueue) {
       console.log(`[SyncQueue] 進入凌晨維護期，延遲同步操作 ${timeout/60000} 分鐘`);
    }

    const timerId = setTimeout(() => {
      processQueue();
    }, timeout);

    return () => clearTimeout(timerId);

  }, [syncQueue, isSyncingQueue, isHydrated, apiEndpoint, addToast]);

  // 5. 攔截關閉事件 (BeforeUnload)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      flushStatusBuffer(); // 關閉前確保緩衝區寫入
      if (syncQueue.length > 0 || isSyncingQueue) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [syncQueue.length, isSyncingQueue, flushStatusBuffer]);

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
