import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { modalVariants, buttonTap } from './animations';

export const ConfirmModal: React.FC<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void; }> = ({ isOpen, title, message, onConfirm, onCancel }) => {
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsProcessing(false);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    if (isProcessing) return;
    setIsProcessing(true);
    onConfirm();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div key="confirm-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-morandi-charcoal/40 z-[110] flex items-center justify-center p-6 backdrop-blur-sm">
          <motion.div variants={modalVariants} initial="hidden" animate="visible" exit="exit" className="bg-morandi-paper w-full max-w-xs rounded-[24px] overflow-hidden shadow-xl border border-white/50">
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center mx-auto text-rose-400 mb-2"><AlertTriangle className="w-7 h-7" /></div>
              <h3 className="text-xl font-extrabold text-morandi-charcoal tracking-tight">{title}</h3>
              <p className="text-sm text-morandi-pebble font-medium leading-relaxed tracking-wide px-2 whitespace-pre-line">{message}</p>
            </div>
            <div className="p-4 flex gap-3 bg-morandi-oatmeal/30">
              <motion.button whileTap={buttonTap} onClick={onCancel} className="flex-1 py-3 rounded-[16px] font-bold text-morandi-pebble bg-white shadow-sm border border-slate-200 tracking-wide">取消</motion.button>
              <motion.button 
                whileTap={isProcessing ? {} : buttonTap} 
                onClick={handleConfirm} 
                disabled={isProcessing}
                className={`flex-1 py-3 rounded-[16px] font-bold text-white shadow-md tracking-wide transition-all duration-300 ${isProcessing ? 'bg-rose-300 cursor-not-allowed' : 'bg-rose-400'}`}
              >
                {isProcessing ? '處理中' : '確認'}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
