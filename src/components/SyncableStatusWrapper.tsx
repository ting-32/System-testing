import React from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';

interface SyncableStatusWrapperProps {
  syncStatus?: 'pending' | 'synced' | 'error' | string;
  onRetry?: () => void;
  children: React.ReactNode;
  className?: string;
  roundedClass?: string;
}

export const SyncableStatusWrapper: React.FC<SyncableStatusWrapperProps> = ({ 
  syncStatus, 
  onRetry, 
  children, 
  className = '',
  roundedClass = 'rounded-[32px]' // 預設提供一個圓角，可由外部覆寫
}) => {
  const isPending = syncStatus === 'pending';
  const isError = syncStatus === 'error';

  return (
    <div className={`relative ${className} ${isPending ? 'opacity-70 pointer-events-none' : ''}`}>
      {children}
      
      {isPending && (
        <div className={`absolute top-0 right-0 bg-blue-100/90 backdrop-blur-sm text-blue-600 text-[10px] font-bold px-3 py-1.5 rounded-bl-xl z-20 flex items-center gap-1.5 pointer-events-none border-b border-l border-blue-200/50`}>
          <RefreshCw className="w-3 h-3 animate-spin"/> 同步中...
        </div>
      )}
      
      {isError && (
        <div 
          className={`absolute top-0 right-0 bg-rose-500 text-white shadow-lg text-[10px] font-bold px-3 py-1.5 rounded-bl-xl z-20 flex items-center gap-1.5 cursor-pointer hover:bg-rose-600 transition pointer-events-auto active:scale-95 origin-top-right`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onRetry) onRetry();
          }}
        >
          <AlertCircle className="w-3 h-3" />
          儲存失敗，點擊重試
        </div>
      )}
      
      {/* 視覺框線覆蓋，獨立拉出以避免影響內部元件 */}
      {(isError || isPending) && (
        <div className={`absolute inset-0 border-2 pointer-events-none z-10 ${roundedClass} ${isError ? 'border-rose-400' : 'border-blue-200'}`} />
      )}
    </div>
  );
};
