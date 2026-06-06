import React, { ErrorInfo, ReactNode } from 'react';
import { logSystemError } from '../utils/errorLogger';

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false
  };

  static getDerivedStateFromError(_: Error): State {
    return { hasError: true }; // 切換至備用錯誤狀態
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 捕捉到了 React 元件崩潰，寫入系統日誌
    logSystemError('SYSTEM_ERROR', 'ERROR', 'React', error.message, { componentStack: errorInfo.componentStack, stack: error.stack });
  }

  render() {
    if (this.state.hasError) {
      // 替換崩潰畫面的友善備用 UI
      return (
         <div className="p-8 text-center bg-rose-50 border border-rose-200 text-rose-700 rounded-xl m-4">
           我們遇到了一點問題，已自動通報系統列入日誌追蹤。請嘗試重新整理此頁面。
           <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-rose-600 text-white rounded-lg block mx-auto hover:bg-rose-700">重新整理</button>
         </div>
      );
    }
    return (this as any).props.children;
  }
}
