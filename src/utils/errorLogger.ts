import { container } from '../core/di/AppContainer';

const OFFLINE_QUEUE_KEY = 'system_logs_offline_queue';

// 輔助寫入 LocalStorage 的函式
const saveToOfflineQueue = (log: any) => {
  try {
    const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    queue.push(log);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    // 忽略 storage 錯誤
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', async () => {
    if (!container.apiClient.getEndpoint()) return;
    const queueData = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!queueData) return;

    try {
      const queue = JSON.parse(queueData);
      if (queue.length > 0) {
        for (const log of queue) {
           await container.apiClient.post('writeLog', log, { silentFail: true, timeoutMs: 5000 });
        }
        localStorage.removeItem(OFFLINE_QUEUE_KEY);
        console.log(`[System] 已成功將 ${queue.length} 筆離線日誌同步至雲端`);
      }
    } catch (e) {
        // 若補傳過程又失敗，保留佇列等待下次恢復
    }
  });
}

export const logSystemError = async (
  actionType: string,
  level: 'INFO' | 'WARN' | 'ERROR',
  source: 'JSRuntime' | 'Network' | 'Console' | 'React',
  message: string,
  details: any
) => {
  const logData = {
    actionType,
    level,
    target: `[${source}] 系統異常`, // 設定容易辨別的標題
    details: JSON.stringify({
      errorMessage: message,
      stack: details?.stack || '',
      ...details
    }),
    timestamp: Date.now(),
  };

  // 1. 檢查目前本身是否已經處於斷線狀態
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
     saveToOfflineQueue(logData);
     return;
  }

  try {
    // 呼叫您現有的寫入 API
    if (container.apiClient.getEndpoint()) {
      await container.apiClient.post('writeLog', logData, { silentFail: true, timeoutMs: 5000 });
    }
  } catch (e) {
    // 2. Timeout 或伺服器 500 無法接收，退回本地佇列
    saveToOfflineQueue(logData);
  }
};
