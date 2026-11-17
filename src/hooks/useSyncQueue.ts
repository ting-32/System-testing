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

const MAX_QUEUE_RETRIES = 4;

function formatQueueErrorMessage(raw: string): string {
  const msg = String(raw || '').trim();
  if (!msg) return '同步失敗，請點擊重試';
  if (msg.includes('UNAUTHORIZED_OR_EXPIRED')) return '登入憑證已過期，請重新登入後再試';
  if (msg.includes('FORBIDDEN_ACTION')) return msg.replace(/^FORBIDDEN_ACTION:\s*/, '');
  if (msg.includes('ReferenceError') || msg.includes('SyntaxError') || msg.includes('Unknown action')) {
    return `後端腳本錯誤（請確認已更新部署 GAS）：${msg}`;
  }
  if (msg.includes('HTML_RESPONSE')) return '伺服器回傳網頁而非資料，請確認 Apps Script 已重新部署為正式版 (/exec)';
  if (msg.includes('TIMEOUT') || msg.includes('AbortError')) return '連線逾時（伺服器忙碌或網路較慢），請點擊重試';
  if (msg.includes('Failed to fetch')) return '網路連線中斷或 CORS 阻擋，請確認網路後點擊重試';
  if (msg.includes('更新過於頻繁') || msg.includes('Lock') || msg.includes('Timeout')) return '同時操作人數較多導致鎖定逾時，請點擊重試';
  return msg.length > 80 ? msg.slice(0, 80) + '…' : msg;
}

function isNonRetryableQueueError(msg: string): boolean {
  return (
    msg.includes('UNAUTHORIZED_OR_EXPIRED') ||
    msg.includes('FORBIDDEN_ACTION') ||
    msg.includes('ReferenceError') ||
    msg.includes('SyntaxError') ||
    msg.includes('Unknown action') ||
    msg.includes('HTML_RESPONSE')
  );
}

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
        // 撈出前段所有同為 UPDATE_STATUS / BATCH_UPDATE 的任務（最多 25 筆為一個 Chunk，降低單包逾時風險）
        for (const t of syncQueue) {
          if ((t.type === 'UPDATE_STATUS' || t.type === 'BATCH_UPDATE') && batchTasks.length < 25) {
            batchTasks.push(t);
          } else {
            break;
          }
        }
      } else {
        batchTasks = [firstTask];
      }

      const processedTaskIds = batchTasks.map(t => t.taskId);
      let actionName = '';

      try {
        if (!apiEndpoint) throw new Error('No API endpoint');
        const tokenBefore = localStorage.getItem('APP_SESSION_TOKEN') || '';
        let bodyPayload: any;

        if (isBatchable) {
          // 合併 updates 並以最新狀態去重
          const updateMap = new Map<string, any>();
          batchTasks.forEach(t => {
            (t.payload?.updates || []).forEach((u: any) => {
              if (u && u.id) {
                updateMap.set(u.id, { ...u, force: u.force !== false });
              }
            });
          });
          const mergedUpdates = Array.from(updateMap.values());
          actionName = 'batchUpdateOrders';
          bodyPayload = {
            action: actionName,
            token: tokenBefore,
            data: { updates: mergedUpdates }
          };
        } else if (firstTask.type === 'UPDATE_CONTENT') {
          actionName = 'updateOrderContent';
          bodyPayload = { action: actionName, token: tokenBefore, data: firstTask.payload };
        } else if (firstTask.type === 'delete_order') {
          actionName = 'deleteOrder';
          bodyPayload = { action: actionName, token: tokenBefore, data: firstTask.payload };
        }

        const res = await fetchWithRetry(
          apiEndpoint, 
          {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(bodyPayload)
          },
          undefined,
          1, // 單次內層重試 1 次，避免單輪卡太久
          1500,
          true, // silentFail
          35000 // timeout
        );

        if (!res.ok) {
          throw new Error(`HTTP_${res.status}`);
        }

        const rawText = await res.text();
        let json: any;
        try {
          json = JSON.parse(rawText);
        } catch {
          if (rawText.trim().startsWith('<')) {
            throw new Error('HTML_RESPONSE');
          }
          throw new Error(`INVALID_JSON: ${rawText.slice(0, 60)}`);
        }

        if (json.success) {
          // 成功：平行批次清除 localForage 與 React State
          await Promise.all(processedTaskIds.map(id => queueStore.removeItem(id).catch(console.error)));
          setSyncQueue(prev => prev.filter(t => !processedTaskIds.includes(t.taskId)));

          const respData = json.data || {};
          const failedItems: Array<{ id: string; reason?: string; message?: string }> = Array.isArray(respData.failedItems)
            ? respData.failedItems
            : [];

          if (isBatchable && failedItems.length > 0 && onSyncError) {
            const failedMap = new Map(failedItems.map(fi => [String(fi.id), fi]));
            // 拆出成功的更新與失敗的項目，只讓失敗卡片顯示錯誤、不連累其他成功訂單
            if (onSyncSuccess) {
              batchTasks.forEach(t => {
                const okUpdates = (t.payload?.updates || []).filter((u: any) => u?.id && !failedMap.has(String(u.id)));
                if (okUpdates.length > 0) {
                  onSyncSuccess({ ...t, payload: { ...t.payload, updates: okUpdates } }, respData);
                }
              });
            }
            failedItems.forEach(fi => {
              const reasonText = fi.message || formatQueueErrorMessage(fi.reason || '同步失敗');
              const singleFailTask: SyncTask = {
                taskId: firstTask.taskId,
                type: 'UPDATE_STATUS',
                payload: { updates: [{ id: fi.id }] },
                retryCount: firstTask.retryCount,
                timestamp: firstTask.timestamp
              };
              onSyncError(singleFailTask, reasonText);
            });
            addToast?.(`部分訂單更新失敗（${failedItems.length} 筆），其餘已同步完成`, 'warning');
          } else if (onSyncSuccess) {
            batchTasks.forEach(t => onSyncSuccess(t, respData));
          }
          return;
        }

        // 處理後端明確回傳的失敗原因
        if (json.error === 'UNAUTHORIZED_OR_EXPIRED') {
          window.dispatchEvent(new CustomEvent('app-unauthorized', {
            detail: {
              action: actionName || 'syncQueue',
              message: '連線憑證無效或已過期，請重新登入後再試。'
            }
          }));
          // 若是 LIFF 模式，等待 1.5 秒看 useLiffSession 是否已自動靜默換回新 Token
          await new Promise(r => setTimeout(r, 1500));
          const tokenAfter = localStorage.getItem('APP_SESSION_TOKEN') || '';
          if (tokenAfter && tokenAfter !== tokenBefore) {
            return; // 拿回新 Token 了，讓下一輪立即用新 Token 重送
          }
          throw new Error('UNAUTHORIZED_OR_EXPIRED');
        }

        if (json.errorCode === 'VERSION_CONFLICT' || json.errorCode === 'ERR_VERSION_CONFLICT') {
          console.log('[SyncQueue] Auto recovering from VERSION_CONFLICT...');
          try {
            if (isBatchable) {
              // 狀態更新屬於最新人工點擊勝出：自動全部加上 force: true 重試一次，不因版本衝突連坐棄單
              const retriedFlag = batchTasks.some(t => t.payload?._forcedRetry);
              if (!retriedFlag) {
                const forcedTasks = batchTasks.map(t => ({
                  ...t,
                  payload: {
                    ...t.payload,
                    _forcedRetry: true,
                    updates: (t.payload?.updates || []).map((u: any) => ({ ...u, force: true }))
                  }
                }));
                const forcedMap = new Map(forcedTasks.map(t => [t.taskId, t]));
                await Promise.all(forcedTasks.map(t => queueStore.setItem(t.taskId, t).catch(console.error)));
                setSyncQueue(prev => prev.map(t => forcedMap.get(t.taskId) || t));
                addToast?.('偵測到版本變動，正在自動強制同步最新狀態…', 'info');
                return;
              }
            } else if ((firstTask.type === 'UPDATE_CONTENT' || firstTask.type === 'delete_order') && firstTask.payload?.id) {
              const getOrderRes = await fetchWithRetry(apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'getOrder', token: tokenBefore, data: { id: firstTask.payload.id } })
              }, undefined, 1, 1000, true);
              if (getOrderRes.ok) {
                const orderData = await getOrderRes.json();
                if (orderData.success && orderData.data) {
                  const latestVersion = orderData.data.version || orderData.data.Version || 0;
                  const newPayload = { ...firstTask.payload };
                  if (firstTask.type === 'UPDATE_CONTENT') {
                    newPayload.version = latestVersion;
                  } else if (firstTask.type === 'delete_order') {
                    newPayload.originalLastUpdated = orderData.data.lastUpdated;
                    newPayload.version = latestVersion;
                  }
                  const recoveredTask = {
                    ...firstTask,
                    payload: newPayload,
                    retryCount: 0
                  };
                  await queueStore.setItem(firstTask.taskId, recoveredTask);
                  setSyncQueue(prev => prev.map(t => t.taskId === firstTask.taskId ? recoveredTask : t));
                  addToast?.('已在背景自動修復資料衝突，即將重試更新', 'info');
                  return;
                }
              }
            }
          } catch (recoverErr) {
            console.error('[SyncQueue] Failed to auto-recover:', recoverErr);
          }

          await Promise.all(processedTaskIds.map(id => queueStore.removeItem(id).catch(console.error)));
          setSyncQueue(prev => prev.filter(t => !processedTaskIds.includes(t.taskId)));
          addToast?.('⚠️ 發生無法自動修復的版本衝突，已為您還原為雲端最新狀態', 'error');
          if (onSyncGiveUp) {
            batchTasks.forEach(t => onSyncGiveUp(t));
          }
          return;
        }

        throw new Error(json.error || 'Server error');
      } catch (err: any) {
        const rawErrMsg = err?.message || String(err || 'Unknown error');
        const readableErrMsg = formatQueueErrorMessage(rawErrMsg);
        const failFast = isNonRetryableQueueError(rawErrMsg);

        const givenUpTasks: SyncTask[] = [];
        const updatedRetryMap = new Map<string, SyncTask>();

        batchTasks.forEach(t => {
          const currentRetries = typeof t.retryCount === 'number' && !isNaN(t.retryCount) ? t.retryCount : 0;
          const newRetries = currentRetries + 1;
          if (failFast || newRetries > MAX_QUEUE_RETRIES) {
            givenUpTasks.push(t);
          } else {
            updatedRetryMap.set(t.taskId, { ...t, retryCount: newRetries });
          }
        });

        const givenUpIds = new Set(givenUpTasks.map(t => t.taskId));

        // 先確定性地同步清理/更新 IndexedDB，避免 React 18 deferred updater 造成死鎖或殘留
        await Promise.all([
          ...givenUpTasks.map(t => queueStore.removeItem(t.taskId).catch(console.error)),
          ...Array.from(updatedRetryMap.values()).map(t => queueStore.setItem(t.taskId, t).catch(console.error)),
        ]);

        setSyncQueue(prev =>
          prev
            .filter(t => !givenUpIds.has(t.taskId))
            .map(t => updatedRetryMap.get(t.taskId) || t)
        );

        if (givenUpTasks.length > 0) {
          addToast?.(`訂單同步失敗：${readableErrMsg}`, 'error');
          if (onSyncError) {
            givenUpTasks.forEach(t => onSyncError(t, readableErrMsg));
          }
        }

        if (!failFast) {
          // 失敗時使用退避延遲 (Error Backoff Delay)，避免網路故障時狂發請求
          await new Promise(r => setTimeout(r, 3500));
        }
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

  }, [syncQueue, isSyncingQueue, isHydrated, apiEndpoint, addToast, onSyncSuccess, onSyncError, onSyncGiveUp]);

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
    // 若防抖緩衝區內還有這筆訂單，也一併移除
    if (statusBufferRef.current.has(payloadId)) {
      statusBufferRef.current.delete(payloadId);
    }

    const modifiedTasks: SyncTask[] = [];
    const removedTaskIds: string[] = [];

    for (const t of syncQueue) {
      if (t.payload?.id === payloadId) {
        removedTaskIds.push(t.taskId);
      } else if (Array.isArray(t.payload?.updates) && t.payload.updates.some((u: any) => u?.id === payloadId)) {
        const remainingUpdates = t.payload.updates.filter((u: any) => u?.id !== payloadId);
        if (remainingUpdates.length === 0) {
          removedTaskIds.push(t.taskId);
        } else {
          modifiedTasks.push({
            ...t,
            payload: { ...t.payload, updates: remainingUpdates }
          });
        }
      }
    }

    if (removedTaskIds.length > 0 || modifiedTasks.length > 0) {
      await Promise.all([
        ...removedTaskIds.map(id => queueStore.removeItem(id).catch(console.error)),
        ...modifiedTasks.map(t => queueStore.setItem(t.taskId, t).catch(console.error))
      ]);
      const modifiedMap = new Map(modifiedTasks.map(t => [t.taskId, t]));
      setSyncQueue(prev =>
        prev
          .filter(t => !removedTaskIds.includes(t.taskId))
          .map(t => modifiedMap.get(t.taskId) || t)
      );
    }
  }, [syncQueue]);

  return { syncQueue, addSyncTask, removeTaskByPayloadId, isSyncingQueue };
}
