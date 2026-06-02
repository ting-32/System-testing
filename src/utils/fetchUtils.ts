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
  delayMs = 1500
): Promise<Response> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      // JSON syntax error usually occurs when GAS returns HTML (error page)
      // We check for ok response
      if (!response.ok && attempt < maxRetries) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      if (attempt > 0) {
        window.dispatchEvent(new CustomEvent('networkRetryEnd'));
      }
      return response;
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        window.dispatchEvent(new CustomEvent('networkRetryEnd'));
        window.dispatchEvent(new CustomEvent('networkDeadlock'));
        throw error;
      }
      
      if (onRetry) {
        onRetry(attempt + 1);
      }
      window.dispatchEvent(new CustomEvent('networkRetryStart'));
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError; 
}
