import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Unlock, Lock, BellRing, Settings, Loader2 } from 'lucide-react';
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
          {syncQueue.length > 0 && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="flex items-center text-[10px] text-gray-400 font-medium"
            >
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
              <span>同步中 ({syncQueue.length})</span>
            </motion.div>
          )}
        </AnimatePresence>
        {/* 狀態指示燈 */}
        <AnimatePresence>
          {!isInitialLoading && (
            <motion.div 
              key="background-sync-indicator"
              initial={{ opacity: 0, scale: 0.5 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.5 }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-100 bg-slate-50 shadow-sm text-[10px] font-bold tracking-widest"
            >
              {!isOnline ? (
                <><span className="w-2 h-2 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.5)]"></span><span className="text-slate-500 hidden sm:inline">離線模式</span></>
              ) : isBackgroundSyncing ? (
                <><Loader2 className="w-3 h-3 text-blue-400 animate-spin" /><span className="text-slate-500 hidden sm:inline">同步中</span></>
              ) : (
                <><span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)] relative">
                  <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-50"></span>
                </span>
                <span className="text-slate-500 hidden sm:inline">已同步</span></>
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
        {localStorage.getItem('APP_USER_ROLE') === 'admin' && (
          <motion.button whileTap={buttonTap} onClick={() => ui.openSettings()} className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center border border-slate-100 text-morandi-pebble hover:text-slate-600 transition-colors active:scale-95">
            <Settings className="w-5 h-5" />
          </motion.button>
        )}
      </div>
    </header>
  );
}
