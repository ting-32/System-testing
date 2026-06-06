import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { History, Loader2, Server, User } from 'lucide-react';
import { modalVariants } from './animations';

export const ConflictModal: React.FC<{
  isOpen: boolean;
  onRefresh: () => void;
  onForceSave: () => void;
  isSaving: boolean;
  conflictData?: any;
  onClose?: () => void;
}> = ({ isOpen, onRefresh, onForceSave, isSaving, conflictData }) => {
  const { description, serverData, clientData } = conflictData || {};

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div key="conflict-modal" className="fixed inset-0 bg-morandi-charcoal/60 z-[160] flex items-center justify-center p-4 backdrop-blur-md">
          <motion.div variants={modalVariants} initial="hidden" animate="visible" exit="exit" className="bg-white w-full max-w-4xl rounded-[24px] overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
            <div className="p-6 text-center space-y-4 border-b border-slate-100 shrink-0">
              <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-amber-500 mb-2">
                <History className="w-8 h-8" /> 
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-slate-800">資料版本衝突</h3>
                {description && <p className="text-sm font-bold text-slate-500 mt-1">{description}</p>}
                <p className="text-sm text-amber-600 font-bold mt-2">這筆資料剛剛被其他人更新了！ 您要放棄目前的修改，還是直接覆蓋對方的紀錄？</p>
              </div>
            </div>

            {serverData && clientData && (
              <div className="flex flex-col md:flex-row gap-4 p-6 overflow-y-auto bg-slate-50 flex-1">
                {/* 伺服器最新資料 */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-blue-100 overflow-hidden flex flex-col">
                   <div className="bg-blue-50/50 p-3 border-b border-blue-100 shadow-sm flex items-center gap-2 shrink-0">
                      <Server className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-bold text-blue-800">伺服器最新資料 (他人的修改)</span>
                   </div>
                   <div className="p-4 text-sm font-mono text-slate-600 bg-white overflow-auto">
                      <pre className="whitespace-pre-wrap word-break-all">
                        {JSON.stringify(serverData, null, 2)}
                      </pre>
                   </div>
                </div>

                {/* 您的本機修改 */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-amber-200 overflow-hidden flex flex-col">
                   <div className="bg-amber-50/50 p-3 border-b border-amber-200 shadow-sm flex items-center gap-2 shrink-0">
                      <User className="w-4 h-4 text-amber-600" />
                      <span className="text-sm font-bold text-amber-800">您的修改 (嘗試儲存的變更)</span>
                   </div>
                   <div className="p-4 text-sm font-mono text-slate-600 bg-white overflow-auto relative">
                      <pre className="whitespace-pre-wrap word-break-all relative z-10">
                         {JSON.stringify(clientData, null, 2)}
                      </pre>
                      <div className="absolute inset-0 bg-amber-500/5 mix-blend-multiply pointer-events-none"></div>
                   </div>
                </div>
              </div>
            )}

            {!serverData && (
              <div className="p-6 text-sm text-slate-600 font-medium text-left bg-amber-50/50 rounded-xl m-6 border border-amber-100 shrink-0">
                <p className="mb-2 font-bold text-amber-800">雲端資料比您的版本更新。</p>
                <div className="text-xs text-slate-500 space-y-1">
                  <p>• 選擇 <b className="text-slate-700">放棄修改</b>：將載入雲端最新資料 (您的修改將消失)。</p>
                  <p>• 選擇 <b className="text-slate-700">強制覆蓋</b>：將以您的版本為主 (覆蓋他人的修改)。</p>
                </div>
              </div>
            )}

            <div className="p-6 flex flex-col sm:flex-row gap-3 bg-white border-t border-slate-100 shrink-0">
              <motion.button 
                whileTap={{ scale: 0.96 }} 
                onClick={onRefresh} 
                className="flex-1 py-4 px-6 rounded-2xl font-bold text-slate-600 bg-white border-2 border-slate-200 shadow-sm hover:bg-slate-50 transition-colors"
              >
                捨棄我的修改，載入最新版本
              </motion.button>
              
              <motion.button 
                whileTap={{ scale: 0.96 }} 
                onClick={onForceSave} 
                disabled={isSaving}
                className="flex-1 py-4 px-6 rounded-2xl font-bold text-white bg-rose-500 shadow-lg shadow-rose-200 flex items-center justify-center gap-2 hover:bg-rose-600 transition-colors"
              >
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin"/> : null}
                {isSaving ? '處理中' : '強制覆蓋，保留我的版本'}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
