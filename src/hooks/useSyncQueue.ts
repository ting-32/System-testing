import { useState, useEffect } from 'react';
import { SyncTask } from '../types';

export function useSyncQueue(
  apiEndpoint: string, 
  addToast?: (msg: string, type: 'success'|'error'|'info'|'warning') => void,
  onSyncSuccess?: (task: SyncTask, newLastUpdatedTs: number) => void
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

        const res = await fetch(apiEndpoint, {
          method: 'POST',
          body: JSON.stringify(bodyPayload)
        });

        // if success, remove task
        if (res.ok) {
           const json = await res.json();
           if (json.success) {
               setSyncQueue(prev => prev.filter(t => t.taskId !== task.taskId));
               if (onSyncSuccess) {
                   onSyncSuccess(task, json.data?.newLastUpdatedTs || Date.now());
               }
           } else {
               if (json.errorCode === 'VERSION_CONFLICT' || json.errorCode === 'ERR_VERSION_CONFLICT') {
                   // Dead letter or conflict. We remove it and maybe let user handle, but user said background sync is silent.
                   // Actually we will remove it so it doesn't block
                   setSyncQueue(prev => prev.filter(t => t.taskId !== task.taskId));
                   addToast?.('部分更新遇到版本衝突，已取消背景同步', 'warning');
               } else {
                   throw new Error(json.error || 'Server error');
               }
           }
        } else {
           throw new Error('HTTP error');
        }
      } catch (err) {
        // failed, leave in queue. update retry count
        setSyncQueue(prev => prev.map(t => {
           if (t.taskId === task.taskId) {
               const newRetries = t.retryCount + 1;
               if (newRetries > 20) {
                 addToast?.(`訂單更新失敗20次，請檢查網路`, 'error');
                 return null as any; // later filter out
               }
               return { ...t, retryCount: newRetries };
           }
           return t;
        }).filter(Boolean));
      } finally {
        setIsSyncingQueue(false);
      }
    };

    const timer = setInterval(processQueue, 5000);
    return () => clearInterval(timer);
  }, [syncQueue, isSyncingQueue, apiEndpoint, addToast]);

  return { syncQueue, addSyncTask, isSyncingQueue };
}
