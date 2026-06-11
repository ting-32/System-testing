import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Unlock, Lock, BellRing, Settings } from 'lucide-react';
import { buttonTap } from '../animations';
import { useUIStore } from '../../store/useUIStore';

interface HeaderProps {
  isBackgroundSyncing: boolean;
  isInitialLoading: boolean;
  isUnlocked: boolean;
  setIsUnlocked: (val: boolean) => void;
}

export function Header({
  isBackgroundSyncing,
  isInitialLoading,
  isUnlocked,
  setIsUnlocked
}: HeaderProps) {
  const ui = useUIStore();

  return (
    <header className="px-4 py-3 bg-white border-b border-gray-100 flex justify-between items-center sticky top-0 z-40">
      <div>
        <h1 className="text-xl font-extrabold text-morandi-charcoal tracking-tight">麵廠職人</h1>
        <p className="text-[10px] text-morandi-pebble font-bold uppercase tracking-widest mt-0.5">專業訂單管理系統</p>
      </div>
      <div className="flex gap-2 items-center">
        {/* Step 6: Visual Indicator for Background Sync */}
        <AnimatePresence>
          {isBackgroundSyncing && !isInitialLoading && (
            <motion.div 
              key="background-sync-indicator"
              initial={{ opacity: 0, scale: 0.5 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.5 }}
              className="w-10 h-10 flex items-center justify-center"
            >
              <RefreshCw className="w-4 h-4 text-morandi-blue animate-spin" />
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
        
        <motion.button whileTap={buttonTap} onClick={() => ui.openNotificationCenter()} className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center border border-amber-100 text-amber-500 hover:bg-amber-100 transition-colors active:scale-95">
          <BellRing className="w-5 h-5" />
        </motion.button>
        <motion.button whileTap={buttonTap} onClick={() => ui.openSettings()} className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center border border-slate-100 text-morandi-pebble hover:text-slate-600 transition-colors active:scale-95">
          <Settings className="w-5 h-5" />
        </motion.button>
      </div>
    </header>
  );
}
