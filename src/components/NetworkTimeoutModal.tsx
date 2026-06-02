import React from 'react';
import { RefreshCcw, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function NetworkTimeoutModal({ isOpen }: { isOpen: boolean }) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center"
        >
          <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-rose-600" />
          </div>
          
          <h3 className="text-xl font-bold text-slate-800 mb-2">連線已逾時</h3>
          
          <p className="text-slate-600 mb-8 leading-relaxed text-sm">
            系統可能閒置了一段時間，伺服器停止回應。為確保您的資料一致與安全，請重新整理頁面來刷新連線狀態。
          </p>
          
          {/* 強制刷新按鈕 */}
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <RefreshCcw className="w-5 h-5" />
            立即重新整理
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
