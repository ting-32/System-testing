import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, X, Share, Settings, Save } from 'lucide-react';
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

      <button 
        onClick={() => setShowSettings(true)}
        className="absolute top-4 right-4 p-3 bg-white/50 backdrop-blur rounded-full text-slate-500 shadow-sm hover:bg-white transition-colors"
      >
        <Settings className="w-5 h-5 drop-shadow-sm" />
      </button>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="form-card w-full max-w-sm"
      >
        <div className="card-header pt-8">
          <div className="w-16 h-16 bg-morandi-blue/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock className="w-8 h-8 text-morandi-blue" />
          </div>
          <h1 className="text-2xl font-extrabold text-center text-morandi-charcoal mb-2">麵廠職人</h1>
          <p className="text-center text-morandi-pebble mb-8 text-sm font-medium tracking-widest">系統登入</p>
        </div>
        
        <div className="card-body px-8 pb-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                placeholder="請輸入密碼"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(false); }}
                className={`w-full px-4 py-3 rounded-xl border ${error ? 'border-rose-300 bg-rose-50 placeholder-rose-300 text-rose-600' : 'border-slate-200 bg-gray-50 focus:bg-white'} outline-none focus:ring-2 focus:ring-morandi-blue/30 transition-all text-center tracking-[0.5em] text-lg font-bold`}
              />
              {error && <p className="text-rose-500 text-xs text-center mt-2 font-medium">密碼錯誤，請檢查系統連線端點或密碼是否正確</p>}
            </div>
            
            <motion.button
              whileTap={buttonTap}
              type="submit"
              disabled={loading || !password}
              className="btn btn-primary w-full py-3.5 tracking-wider"
            >
              {loading ? '驗證中...' : '登入系統'}
            </motion.button>
          </form>
        </div>
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

