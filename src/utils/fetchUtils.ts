/**
 * 具有自動重試機制的 fetch API 包裝器
 * @param url 目標 API 網址
 * @param options fetch 配置 (method, body 等)
 * @param onRetry 當發生重試時的 Callback (用來通知 UI 變更狀態)
 * @param maxRetries 最大重試次數 (預設 2 次，加上原來的 1 次 = 總共 3 次)
 * @param delayMs 每次重試的間隔毫秒數
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  onRetry?: (attempt: number) => void,
  maxRetries = 2,
  delayMs = 1500,
  silentFail = false,
  timeoutMs = 25000
): Promise<Response> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs); 
    
    // 如果外部傳入了 signal，也要同步中止
    let externalAbortHandler: (() => void) | null = null;
    if (options.signal) {
      if (options.signal.aborted) {
        throw new Error('ABORTED');
      }
      externalAbortHandler = () => controller.abort();
      options.signal.addEventListener('abort', externalAbortHandler);
    }

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      if (externalAbortHandler && options.signal) {
        options.signal.removeEventListener('abort', externalAbortHandler);
      }

      // JSON syntax error usually occurs when GAS returns HTML (error page)
      // We check for ok response
      if (!response.ok && attempt < maxRetries) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      if (attempt > 0 && !silentFail) {
        window.dispatchEvent(new CustomEvent('networkRetryEnd'));
      }
      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (externalAbortHandler && options.signal) {
        options.signal.removeEventListener('abort', externalAbortHandler);
      }
      
      // 如果是被外部中止，不重試
      if (options.signal && options.signal.aborted) {
        throw new Error('ABORTED_BY_USER');
      }

      // 如果是 Timeout 也當作失敗
      if (error.name === 'AbortError') {
        lastError = new Error('TIMEOUT');
      } else {
        lastError = error;
      }
      
      if (attempt === maxRetries) {
        if (!silentFail) {
          window.dispatchEvent(new CustomEvent('networkRetryEnd'));
          window.dispatchEvent(new CustomEvent('networkDeadlock'));
        }
        throw lastError;
      }
      
      if (onRetry && !silentFail) {
        onRetry(attempt + 1);
      }
      if (!silentFail) {
        window.dispatchEvent(new CustomEvent('networkRetryStart'));
      }
      const currentDelay = delayMs * Math.pow(2, attempt) + (Math.random() * 500);
      await new Promise(resolve => setTimeout(resolve, currentDelay));
    }
  }
  
  throw lastError; 
}
