import { container } from '../core/di/AppContainer';

export const logSystemError = async (
  actionType: string,
  level: 'INFO' | 'WARN' | 'ERROR',
  source: 'JSRuntime' | 'Network' | 'Console' | 'React',
  message: string,
  details: any
) => {
  try {
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
    
    // 呼叫您現有的寫入 API
    if (container.apiClient.getEndpoint()) {
      await container.apiClient.post('writeLog', logData, { silentFail: true, timeoutMs: 5000 });
    }
  } catch (e) {
    // 注意：如果日誌本身又發生網路錯誤，這裡要靜默處理，避免引發無限迴圈崩潰
  }
};
