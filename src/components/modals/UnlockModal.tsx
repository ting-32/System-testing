import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock } from 'lucide-react';

interface UnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  unlockError: boolean;
  unlockPassword: string;
  setUnlockPassword: (val: string) => void;
  setUnlockError: (val: boolean) => void;
  isUnlocking: boolean;
  handleAppUnlock: (e: React.FormEvent) => void;
}

export function UnlockModal({
  isOpen,
  onClose,
  unlockError,
  unlockPassword,
  setUnlockPassword,
  setUnlockError,
  isUnlocking,
  handleAppUnlock
}: UnlockModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative bg-white rounded-[32px] shadow-2xl p-6 w-full max-w-sm border border-slate-100">
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-slate-500">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-extrabold text-slate-800 tracking-tight">系統安全鎖</h3>
              <p className="text-xs text-slate-400 mt-1 font-medium">請輸入系統密碼以啟用編輯模式</p>
            </div>
            <form onSubmit={handleAppUnlock} className="space-y-4">
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="password" 
                  placeholder="請輸入密碼" 
                  autoFocus
                  className={`w-full pl-12 pr-4 py-3 bg-slate-50 border rounded-xl text-sm font-bold tracking-wide outline-none transition-all ${unlockError ? 'border-rose-300 focus:border-rose-400 focus:ring-4 focus:ring-rose-100' : 'border-slate-200 focus:border-morandi-blue focus:ring-4 focus:ring-morandi-blue/20'}`}
                  value={unlockPassword}
                  onChange={(e) => { setUnlockPassword(e.target.value); setUnlockError(false); }}
                />
              </div>
              <AnimatePresence>
                {unlockError && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-rose-500 text-xs font-bold text-center">
                    密碼錯誤
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="flex gap-2 mt-6">
                <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-500 font-bold text-sm tracking-wide hover:bg-slate-200 transition-colors">取消</button>
                <button type="submit" disabled={isUnlocking} className={`flex-1 py-3 rounded-xl text-white font-bold text-sm tracking-wide transition-colors shadow-md ${isUnlocking ? 'bg-slate-400 cursor-not-allowed' : 'bg-morandi-blue hover:bg-slate-600'}`}>
                  {isUnlocking ? '處理中...' : '解鎖'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
