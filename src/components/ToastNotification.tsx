import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Bell } from 'lucide-react';
import { Toast } from '../types';

export const ToastNotification: React.FC<{ toast: Toast | null }> = ({ toast }) => {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div initial={{ opacity: 0, y: -20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.9 }} className="fixed top-6 inset-x-0 flex justify-center z-[200] pointer-events-none px-4">
          <div className={`bg-white/90 backdrop-blur-md px-6 py-4 rounded-[24px] shadow-2xl flex items-center gap-4 border ${toast.type === 'success' ? 'border-emerald-100' : toast.type === 'error' ? 'border-rose-100' : 'border-slate-100'}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm ${toast.type === 'success' ? 'bg-emerald-100 text-emerald-600' : toast.type === 'error' ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>
              {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : toast.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
            </div>
            <div>
              <p className={`font-extrabold text-sm tracking-wide ${toast.type === 'success' ? 'text-emerald-800' : toast.type === 'error' ? 'text-rose-800' : 'text-slate-800'}`}>{toast.message}</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
