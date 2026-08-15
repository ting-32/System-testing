import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Unlock, Lock, BellRing, Settings, Loader2, RefreshCw, CloudCheck, CloudAlert } from 'lucide-react';
import { buttonTap } from '../animations';
import { useUIStore } from '../../store/useUIStore';
import { useLogStore } from '../../store/useLogStore';

interface HeaderProps {
  isBackgroundSyncing: boolean;
  isInitialLoading: boolean;
  isUnlocked: boolean;
  setIsUnlocked: (val: boolean) => void;
  isOnline: boolean;
  syncQueue?: any[];
  isSyncingQueue?: boolean;
}

export function Header({
  isBackgroundSyncing,
  isInitialLoading,
  isUnlocked,
  setIsUnlocked,
  isOnline,
  syncQueue = [],
  isSyncingQueue = false
}: HeaderProps) {
  const ui = useUIStore();
  const { hasUnreadLogs } = useLogStore();

  return (
    <header className="px-4 py-3 bg-white border-b border-gray-100 flex justify-between items-center sticky top-0 z-40">
      <div>
        <h1 className="text-xl font-extrabold text-morandi-charcoal tracking-tight">麵廠職人</h1>
        <p className="text-[10px] text-morandi-pebble font-bold uppercase tracking-widest mt-0.5">專業訂單管理系統</p>
      </div>
      <div className="flex gap-2 items-center">
        <AnimatePresence>
          {!isInitialLoading && (
            <motion.div 
              key="background-sync-indicator"
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-100 bg-slate-50 shadow-sm font-bold tracking-widest"
            >
              {!isOnline ? (
                <div className="flex items-center text-xs text-rose-500">
                  <CloudAlert className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">離線模式</span>
                </div>
              ) : (syncQueue.length > 0 || isSyncingQueue || isBackgroundSyncing) ? (
                <div className="flex items-center text-xs text-yellow-600">
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                  <span className="hidden sm:inline">正在儲存</span>
                  {syncQueue.length > 0 && <span className="ml-1">({syncQueue.length})</span>}
                </div>
              ) : (
                <div className="flex items-center text-xs text-emerald-500/80">
                  <CloudCheck className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">已儲存至雲端</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <button 
          onClick={() => isUnlocked ? setIsUnlocked(false) : ui.openUnlockModal()}
          className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
            isUnlocked 
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
        >
          {isUnlocked ? (
            <><Unlock className="w-3.5 h-3.5" /> 編輯中</>
          ) : (
            <><Lock className="w-3.5 h-3.5" /> 僅檢視</>
          )}
        </button>
        
        <motion.button whileTap={buttonTap} onClick={() => ui.openNotificationCenter()} className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center border border-amber-100 text-amber-500 hover:bg-amber-100 transition-colors active:scale-95 relative">
          <BellRing className="w-5 h-5" />
          <AnimatePresence>
            {hasUnreadLogs && (
              <motion.span 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute top-1 right-1 flex h-2.5 w-2.5"
              >
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 border border-white"></span>
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
        <motion.button whileTap={buttonTap} onClick={() => ui.openSettings()} className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center border border-slate-100 text-morandi-pebble hover:text-slate-600 transition-colors active:scale-95">
          <Settings className="w-5 h-5" />
        </motion.button>
      </div>
    </header>
  );
}
