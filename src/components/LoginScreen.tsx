import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, X, Share } from 'lucide-react';
import { buttonTap } from './animations';

export const LoginScreen: React.FC<{ onLogin: (pwd: string) => Promise<boolean> }> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [showPwaBanner, setShowPwaBanner] = useState(false);

  useEffect(() => {
    // Only show banner if not already dismissed and not already standalone
    const isDismissed = localStorage.getItem('hide_pwa_banner');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    
    if (!isDismissed && !isStandalone) {
      setShowPwaBanner(true);
    }
  }, []);

  const dismissBanner = () => {
    setShowPwaBanner(false);
    localStorage.setItem('hide_pwa_banner', 'true');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError(false);
    const success = await onLogin(password);
    if (!success) {
      setError(true);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen relative bg-morandi-oatmeal flex flex-col items-center justify-center p-4">
      <AnimatePresence>
        {showPwaBanner && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-4 left-4 right-4 z-50 bg-white shadow-lg rounded-2xl p-4 border border-slate-100 flex items-start gap-3 max-w-sm mx-auto"
          >
            <div className="bg-blue-50 p-2 rounded-xl text-blue-500 shrink-0">
              <Share className="w-5 h-5" />
            </div>
            <div className="flex-1 text-sm font-medium text-slate-600 leading-relaxed pt-1">
              📱 想獲得更棒的全螢幕專屬體驗嗎？點擊瀏覽器底部的 <strong className="text-slate-800">[分享]</strong> ➔ <strong className="text-slate-800">[加入主畫面]</strong> 就能建立捷徑囉！
            </div>
            <button 
              onClick={dismissBanner}
              className="p-1.5 hover:bg-slate-50 text-slate-400 rounded-lg shrink-0 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-3xl shadow-lg w-full max-w-sm"
      >
        <div className="w-16 h-16 bg-morandi-blue/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Lock className="w-8 h-8 text-morandi-blue" />
        </div>
        <h1 className="text-2xl font-extrabold text-center text-morandi-charcoal mb-2">麵廠職人</h1>
        <p className="text-center text-morandi-pebble mb-8 text-sm font-medium tracking-widest">系統登入</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              placeholder="請輸入密碼"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              className={`w-full px-4 py-3 rounded-xl border ${error ? 'border-rose-300 bg-rose-50 placeholder-rose-300 text-rose-600' : 'border-slate-200 bg-gray-50 focus:bg-white'} outline-none focus:ring-2 focus:ring-morandi-blue/30 transition-all text-center tracking-[0.5em] text-lg font-bold`}
            />
            {error && <p className="text-rose-500 text-xs text-center mt-2 font-medium">密碼錯誤，請再試一次</p>}
          </div>
          
          <motion.button
            whileTap={buttonTap}
            type="submit"
            disabled={loading || !password}
            className="w-full bg-morandi-blue text-white font-bold py-3.5 rounded-xl shadow-md hover:bg-morandi-blue/90 disabled:opacity-50 transition-all tracking-wider"
          >
            {loading ? '驗證中...' : '登入系統'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
};
