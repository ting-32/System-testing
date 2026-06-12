import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, X, Share, Settings, Save, Eye, EyeOff, Loader2 } from 'lucide-react';

import { buttonTap } from './animations';

interface LoginScreenProps {
  onLogin: (pwd: string) => Promise<boolean>;
  onSaveApiUrl?: (url: string) => void;
  apiEndpoint?: string;
  addToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onSaveApiUrl, apiEndpoint, addToast }) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [showPwaBanner, setShowPwaBanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [tempUrl, setTempUrl] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // Only show banner if not already dismissed and not already standalone
    const isDismissed = localStorage.getItem('hide_pwa_banner');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    
    if (!isDismissed && !isStandalone) {
      setShowPwaBanner(true);
    }
    
    if (apiEndpoint) {
      setTempUrl(apiEndpoint);
    }
  }, [apiEndpoint]);

  const dismissBanner = () => {
    setShowPwaBanner(false);
    localStorage.setItem('hide_pwa_banner', 'true');
  };

  const handleSaveSettings = () => {
    if (onSaveApiUrl) {
      onSaveApiUrl(tempUrl);
      if (addToast) addToast("系統連線端點已更新", 'success');
      setShowSettings(false);
    }
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
    <div className="min-h-screen relative bg-morandi-oatmeal flex flex-col items-center justify-center p-4 overflow-hidden">
      {/* 裝飾性背景文字 (放在 min-h-screen 那層裡面，表單卡片之前) */}
      <div className="absolute inset-0 flex items-center justify-start pointer-events-none select-none opacity-[0.03]">
        <span className="text-[12rem] font-black tracking-[0.2em] -rotate-90 text-slate-800 whitespace-nowrap transform -translate-x-[40%]">
          NOODLE FACTORY
        </span>
      </div>
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

      <button 
        onClick={() => setShowSettings(true)}
        className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-800 transition-colors z-50 cursor-pointer"
      >
        <Settings className="w-6 h-6 stroke-[1.5]" />
      </button>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: 0.3 } }}
        className="relative z-10 w-full max-w-sm bg-white/90 backdrop-blur border border-morandi-charcoal/20 rounded-sm p-10 shadow-none"
      >
        <div className="mb-8">
          <div className="w-16 h-16 border border-slate-200 rounded-sm flex items-center justify-center mx-auto mb-6 bg-slate-50">
            <Lock className="w-6 h-6 text-slate-600 stroke-[1.5]" />
          </div>
          <h1 className="text-xl font-bold text-center text-slate-800 tracking-widest mb-2">麵廠職人</h1>
          <p className="text-center text-slate-500 text-xs font-medium tracking-[0.3em]">系統登入</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="請輸入密碼"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(false); }}
                className={`w-full px-4 py-4 rounded-sm border bg-transparent font-mono tracking-[0.5em] text-center text-lg outline-none transition-all ${
                  error 
                    ? 'border-rose-400 focus:ring-4 focus:ring-rose-400/20 text-rose-600' 
                    : 'border-slate-300 focus:border-slate-600 focus:ring-4 focus:ring-blue-900/10 text-slate-800'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5 stroke-[1.5]" /> : <Eye className="w-5 h-5 stroke-[1.5]" />}
              </button>
            </div>
            {error && <p className="text-rose-500 text-xs text-center mt-2 font-medium">密碼錯誤，請檢查連線或密碼是否正確</p>}
          </div>
          
          <motion.button
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading || !password}
            className={`w-full py-4 mt-6 rounded-sm border transition-all duration-300 tracking-[0.2em] font-bold flex items-center justify-center ${
              loading || !password 
                ? 'border-slate-200 text-slate-300 cursor-not-allowed bg-transparent' 
                : 'border-slate-800 text-slate-800 hover:bg-slate-800 hover:text-white bg-transparent'
            }`}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : '登入系統'}
          </motion.button>
        </form>
      </motion.div>

      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="form-card max-w-sm w-full"
            >
              <div className="card-header border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-2 text-slate-800">
                  <Settings className="w-5 h-5 text-indigo-500" />
                  <h3 className="font-bold text-lg">系統初始設定</h3>
                </div>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="card-body p-6 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">系統連線端點 (API Endpoint)</label>
                  <p className="text-xs text-slate-500 mb-3 leading-relaxed">請輸入管理者提供的 Google Apps Script (GAS) 部署網址，以連接雲端資料庫。</p>
                  <input
                    type="text"
                    value={tempUrl}
                    onChange={(e) => setTempUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/..."
                    className="w-full form-input"
                  />
                </div>
                <button
                  onClick={handleSaveSettings}
                  className="btn btn-primary w-full flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  儲存設定
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

