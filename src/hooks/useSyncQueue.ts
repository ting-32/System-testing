import { useState, useEffect } from 'react';
import { SyncTask } from '../types';
import { fetchWithRetry } from '../utils/fetchUtils';

export function useSyncQueue(
  apiEndpoint: string, 
  addToast?: (msg: string, type: 'success'|'error'|'info'|'warning') => void,
  onSyncSuccess?: (task: SyncTask, newLastUpdatedTs: number) => void,
  onSyncError?: (task: SyncTask, errorMsg: string) => void
) {
  const [syncQueue, setSyncQueue] = useState<SyncTask[]>([]);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);

  const addSyncTask = (task: SyncTask) => {
    setSyncQueue(prev => {
      // Deduplication: if there's already a task for the same payload.id and type, overwrite it
      if (task.type === 'UPDATE_STATUS' && task.payload?.id) {
        const existingIdx = prev.findIndex(t => t.type === 'UPDATE_STATUS' && t.payload?.id === task.payload.id);
        if (existingIdx >= 0) {
          const newQueue = [...prev];
          newQueue[existingIdx] = { ...task, timestamp: Date.now(), retryCount: newQueue[existingIdx].retryCount };
          return newQueue;
        }
      }
      return [...prev, task];
    });
  };

  useEffect(() => {
    if (syncQueue.length === 0 || isSyncingQueue) return;

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
               setSyncQueue(prev => prev.filter(t => t.taskId !== task.taskId));
               if (onSyncSuccess) {
                   onSyncSuccess(task, json.data?.newLastUpdatedTs || Date.now());
               }
           } else {
               if (json.errorCode === 'VERSION_CONFLICT' || json.errorCode === 'ERR_VERSION_CONFLICT') {
                   setSyncQueue(prev => prev.filter(t => t.taskId !== task.taskId));
                   addToast?.('部分更新遇到版本衝突，已取消背景同步', 'warning');
                   if (onSyncError) {
                       onSyncError(task, '版本衝突');
                   }
                   // We could theoretically mark it conflict but silent sync is silent.
               } else {
                   throw new Error(json.error || 'Server error');
               }
           }
        } else {
           throw new Error('HTTP error');
        }
      } catch (err: any) {
        setSyncQueue(prev => prev.map(t => {
           if (t.taskId === task.taskId) {
               const newRetries = t.retryCount + 1;
               if (newRetries > 10) {
                 // 10 retries (~3-5 mins) then give up. 
                 addToast?.(`訂單更新背景同步失敗過多次，請整理畫面重試`, 'error');
                 if (onSyncError) {
                     onSyncError(task, '同步失敗過多次');
                 }
                 return null as any; 
               }
               return { ...t, retryCount: newRetries };
           }
           return t;
        }).filter(Boolean));
        // Add a delay before next attempt so we don't spam if it's an immediate failure
        await new Promise(r => setTimeout(r, 6000));
      } finally {
        setIsSyncingQueue(false);
      }
    };

    // run immediately without waiting for an interval
    processQueue();

  }, [syncQueue, isSyncingQueue, apiEndpoint, addToast]);

  return { syncQueue, addSyncTask, isSyncingQueue };
}
