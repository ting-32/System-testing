import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardList, Lock, AlertCircle, Loader2, ChevronRight } from 'lucide-react';

export const LoginScreen: React.FC<{ onLogin: (password: string) => Promise<boolean> }> = ({ onLogin }) => {
  const [inputVal, setInputVal] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal) return;
    setLoading(true);
    setError(false);
    try {
      const success = await onLogin(inputVal);
      if (!success) {
        setError(true);
        setInputVal('');
      }
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-morandi-oatmeal p-6 relative overflow-hidden font-sans">
      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: "easeOut" }} className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-morandi-blue rounded-full opacity-10 blur-3xl" />
      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }} className="absolute bottom-[-10%] left-[-10%] w-64 h-64 bg-morandi-pink rounded-full opacity-10 blur-3xl" />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="bg-white/80 backdrop-blur-md p-8 rounded-[32px] shadow-lg w-full max-w-sm border border-white/50">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-morandi-blue rounded-2xl flex items-center justify-center mx-auto mb-4 text-white shadow-lg rotate-3"><ClipboardList className="w-8 h-8" /></div>
          <h1 className="text-3xl font-extrabold text-morandi-charcoal tracking-tight">麵廠職人</h1>
          <p className="text-xs text-morandi-pebble font-bold uppercase tracking-[0.2em] mt-2">系統登入</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <div className="relative">
              <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-morandi-pebble" />
              <input type="password" placeholder="請輸入系統密碼" className={`w-full pl-14 pr-6 py-4 bg-morandi-oatmeal/50 rounded-[20px] border border-slate-200 text-morandi-charcoal font-bold tracking-wide focus:ring-4 focus:ring-morandi-blue/20 focus:border-morandi-blue transition-all outline-none ${error ? 'border-rose-200 focus:border-rose-400' : ''}`} value={inputVal} onChange={(e) => { setInputVal(e.target.value); setError(false); }} autoFocus disabled={loading} />
            </div>
            <AnimatePresence>
              {error && (<motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-1.5 px-2 text-rose-500 overflow-hidden"><AlertCircle className="w-3.5 h-3.5" /><span className="text-xs font-bold tracking-wide">密碼錯誤，請重新輸入</span></motion.div>)}
            </AnimatePresence>
          </div>
          <motion.button type="submit" disabled={loading} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }} className="w-full py-4 rounded-[20px] bg-morandi-blue text-white font-bold text-lg shadow-md hover:bg-slate-600 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:active:scale-100">{loading ? (<><Loader2 className="w-5 h-5 animate-spin" /> 驗證中...</>) : (<>進入系統 <ChevronRight className="w-5 h-5" /></>)}</motion.button>
        </form>
        <div className="mt-10 text-center"><p className="text-[10px] text-morandi-pebble tracking-wide">© 2025 Noodle Factory Manager</p></div>
      </motion.div>
    </div>
  );
};
