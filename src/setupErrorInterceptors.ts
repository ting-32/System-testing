import { logSystemError } from './utils/errorLogger';

export const setupGlobalErrorInterceptors = () => {
  // 1. 攔截 Console Error / Warn
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  console.error = (...args: any[]) => {
    originalConsoleError(...args); // 維持原本在開發者工具的輸出功能
    logSystemError('CONSOLE_ERROR', 'ERROR', 'Console', args.join(' '), { rawArgs: args }); // 偷偷發送一筆日誌
  };

  console.warn = (...args: any[]) => {
    originalConsoleWarn(...args);
    logSystemError('CONSOLE_ERROR', 'WARN', 'Console', args.join(' '), { rawArgs: args });
  };

  // 2. 攔截未捕獲的常規 JS 錯誤 (JS Runtime Error)
  window.addEventListener('error', (event) => {
    logSystemError('SYSTEM_ERROR', 'ERROR', 'JSRuntime', event.message, { 
      filename: event.filename, 
      lineno: event.lineno, 
      stack: event.error?.stack 
    });
  });

  // 3. 攔截未捕獲的 Promise 錯誤 (Async / Await 未處理的崩潰)
  window.addEventListener('unhandledrejection', (event) => {
    logSystemError('SYSTEM_ERROR', 'ERROR', 'JSRuntime', `Unhandled Promise: ${event.reason}`, {
      reason: event.reason
    });
  });
};
