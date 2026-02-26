import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { History, Loader2 } from 'lucide-react';
import { modalVariants } from './animations';

export const ConflictModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onForceSave: () => void;
  isSaving: boolean;
  description?: string;
}> = ({ isOpen, onClose, onRefresh, onForceSave, isSaving, description }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-morandi-charcoal/40 z-[160] flex items-center justify-center p-6 backdrop-blur-sm">
          <motion.div variants={modalVariants} initial="hidden" animate="visible" exit="exit" className="bg-white w-full max-w-sm rounded-[24px] overflow-hidden shadow-xl border-2 border-amber-100">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-amber-500 mb-2">
                <History className="w-8 h-8" /> 
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-slate-800">資料版本衝突</h3>
                {description && <p className="text-xs font-bold text-amber-600 mt-1">{description}</p>}
              </div>
              <div className="text-sm text-slate-600 font-medium text-left bg-amber-50/50 p-4 rounded-xl border border-amber-100">
                <p className="mb-2 font-bold text-amber-800">雲端資料比您的版本更新。</p>
                <div className="text-xs text-slate-500 space-y-1">
                  <p>• 選擇 <b className="text-slate-700">放棄修改</b>：將載入雲端最新資料 (您的修改將消失)。</p>
                  <p>• 選擇 <b className="text-slate-700">強制覆蓋</b>：將以您的版本為主 (覆蓋他人的修改)。</p>
                </div>
              </div>
            </div>
            <div className="p-4 flex gap-3 bg-slate-50">
              <motion.button 
                whileTap={{ scale: 0.96 }} 
                onClick={onRefresh} 
                className="flex-1 py-3 rounded-xl font-bold text-slate-600 bg-white border border-slate-200 shadow-sm"
              >
                放棄修改
              </motion.button>
              
              <motion.button 
                whileTap={{ scale: 0.96 }} 
                onClick={onForceSave} 
                disabled={isSaving}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-amber-500 shadow-md shadow-amber-200 flex items-center justify-center gap-2"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : null}
                {isSaving ? '處理中' : '強制覆蓋'}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
