import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Lock, 
  X, 
  Share, 
  Settings, 
  Save, 
  Eye, 
  EyeOff, 
  Loader2, 
  User, 
  Truck, 
  KeyRound, 
  AlertCircle, 
  Delete,
  CheckCircle2
} from 'lucide-react';

interface LoginScreenProps {
  onLogin: (usernameOrPwd: string, maybePassword?: string) => Promise<{ success: boolean; error?: string } | boolean>;
  onSaveApiUrl?: (url: string) => void;
  apiEndpoint?: string;
  addToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  sessionExpiredMessage?: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ 
  onLogin, 
  onSaveApiUrl, 
  apiEndpoint, 
  addToast,
  sessionExpiredMessage 
}) => {
  // 模式切換：'account' (帳號密碼登入，預設與主要) vs 'pin' (司機快速 PIN 碼)
  const [loginMode, setLoginMode] = useState<'account' | 'pin'>('account');

  // 帳號密碼欄位
  const [username, setUsername] = useState(() => localStorage.getItem('nm_remembered_username') || '');
  const [password, setPassword] = useState('');
  const [rememberUsername, setRememberUsername] = useState(() => !!localStorage.getItem('nm_remembered_username'));

  // 司機 PIN 碼欄位
  const [pin, setPin] = useState('');

  // 狀態管理
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);

  // PWA 與連線設定 Modal
  const [showPwaBanner, setShowPwaBanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [tempUrl, setTempUrl] = useState('');

  // Ref 控制鍵盤焦點流暢切換
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const isDismissed = localStorage.getItem('hide_pwa_banner');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    
    if (!isDismissed && !isStandalone) {
      setShowPwaBanner(true);
    }
    
    if (apiEndpoint) {
      setTempUrl(apiEndpoint);
    }
  }, [apiEndpoint]);

  // 切換分頁時自動對焦
  useEffect(() => {
    setError(false);
    setErrorMessage(null);
    if (loginMode === 'account') {
      if (!username) {
        usernameInputRef.current?.focus();
      } else {
        passwordInputRef.current?.focus();
      }
    } else {
      pinInputRef.current?.focus();
    }
  }, [loginMode]);

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

  // 提交登入
  const handleAccountSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanUser = username.trim();
    if (!cleanUser || !password || loading) return;

    setLoading(true);
    setError(false);
    setErrorMessage(null);

    // 處理記住帳號
    if (rememberUsername) {
      localStorage.setItem('nm_remembered_username', cleanUser);
    } else {
      localStorage.removeItem('nm_remembered_username');
    }

    try {
      const res = await onLogin(cleanUser, password);
      const success = typeof res === 'boolean' ? res : (res && res.success);
      if (!success) {
        setError(true);
        const msg = (typeof res === 'object' && res?.error) 
          ? res.error 
          : '帳號或密碼錯誤，請確認後重試';
        setErrorMessage(msg);
      }
    } catch (err: any) {
      setError(true);
      setErrorMessage(err?.message || '登入連線失敗，請檢查網路');
    } finally {
      setLoading(false);
    }
  };

  const handlePinSubmit = async (e?: React.FormEvent, customPin?: string) => {
    if (e) e.preventDefault();
    const targetPin = customPin !== undefined ? customPin : pin;
    if (!targetPin || loading) return;

    setLoading(true);
    setError(false);
    setErrorMessage(null);

    try {
      // 司機快速 PIN 碼：傳入空的 username 與 pin 作為密碼驗證
      const res = await onLogin('', targetPin);
      const success = typeof res === 'boolean' ? res : (res && res.success);
      if (!success) {
        setError(true);
        const msg = (typeof res === 'object' && res?.error) 
          ? res.error 
          : 'PIN 碼無效或此司機帳號未啟用';
        setErrorMessage(msg);
      }
    } catch (err: any) {
      setError(true);
      setErrorMessage(err?.message || '連線失敗，請檢查網路');
    } finally {
      setLoading(false);
    }
  };

  // 虛擬數字鍵盤按鍵處理 (提供車載/現場單手觸控)
  const handleKeypadPress = (val: string) => {
    if (loading) return;
    setError(false);
    setErrorMessage(null);

    if (val === 'backspace') {
      setPin(prev => prev.slice(0, -1));
    } else if (val === 'clear') {
      setPin('');
    } else {
      if (pin.length < 8) {
        const next = pin + val;
        setPin(next);
        // 如果長度達到 6 碼可自動或手動點登入
      }
    }
  };

  return (
    <div className="min-h-screen relative bg-morandi-oatmeal flex flex-col items-center justify-center p-4 overflow-hidden">
      {/* 裝飾性背景浮水印 */}
      <div className="absolute inset-0 flex items-center justify-start pointer-events-none select-none opacity-[0.03]">
        <span className="text-[12rem] font-black tracking-[0.2em] -rotate-90 text-slate-800 whitespace-nowrap transform -translate-x-[40%]">
          NOODLE FACTORY
        </span>
      </div>

      {/* PWA 加入主畫面提示 */}
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
              📱 點擊瀏覽器底部的 <strong className="text-slate-800">[分享]</strong> ➔ <strong className="text-slate-800">[加入主畫面]</strong> 即可獲得全螢幕專屬 App 體驗！
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

      {/* 右上角伺服器連線設定按鈕 */}
      <button 
        onClick={() => setShowSettings(true)}
        title="系統連線端點設定"
        className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-800 transition-colors z-50 cursor-pointer rounded-xl hover:bg-white/50"
      >
        <Settings className="w-6 h-6 stroke-[1.5]" />
      </button>

      {/* 登入主要卡片容器 */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: 0.3 } }}
        className="relative z-10 w-full max-w-sm bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-xl shadow-slate-200/40"
      >
        {/* 系統標誌與標題 */}
        <div className="mb-6 text-center">
          <div className="w-14 h-14 border border-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-3 bg-gradient-to-br from-slate-50 to-slate-100 shadow-inner">
            <Lock className="w-6 h-6 text-slate-700 stroke-[1.75]" />
          </div>
          <h1 className="text-xl font-black text-slate-800 tracking-wider">麵廠職人</h1>
          <p className="text-slate-400 text-[11px] font-bold tracking-[0.25em] mt-0.5 uppercase">
            Order & Production System
          </p>
        </div>

        {/* 登入模式切換頁籤 (Tab Switcher) */}
        <div className="grid grid-cols-2 p-1 bg-slate-100/90 rounded-xl mb-6 text-xs font-bold">
          <button
            type="button"
            onClick={() => setLoginMode('account')}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg transition-all duration-200 ${
              loginMode === 'account'
                ? 'bg-white text-slate-800 shadow-sm font-black'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            帳號密碼登入
          </button>
          <button
            type="button"
            onClick={() => setLoginMode('pin')}
            className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg transition-all duration-200 ${
              loginMode === 'pin'
                ? 'bg-white text-slate-800 shadow-sm font-black'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            司機快速 PIN
          </button>
        </div>

        {/* 連線逾期 / 登出提示 */}
        {sessionExpiredMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 p-3 bg-amber-50/90 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-start gap-2 leading-relaxed"
          >
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span>{sessionExpiredMessage}</span>
          </motion.div>
        )}

        {/* 錯誤警示條 */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-5 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-xs flex items-start gap-2 leading-relaxed"
            >
              <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">
                {errorMessage || "登入失敗，請確認資料是否正確"}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 分頁 1：帳號密碼登入（主要模式，支援主管、管理員、所有職務） */}
        {loginMode === 'account' && (
          <form onSubmit={handleAccountSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 ml-1">
                使用者帳號 / 工號
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  ref={usernameInputRef}
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  placeholder="請輸入帳號 (例如: admin)"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError(false); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      passwordInputRef.current?.focus();
                    }
                  }}
                  className={`w-full pl-10 pr-4 py-3 rounded-xl border bg-slate-50/50 text-sm font-medium outline-none transition-all ${
                    error && !username 
                      ? 'border-rose-300 ring-2 ring-rose-200/50 text-rose-700' 
                      : 'border-slate-200 focus:border-slate-800 focus:ring-2 focus:ring-slate-800/10 text-slate-800 bg-white'
                  }`}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 ml-1">
                登入密碼
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  ref={passwordInputRef}
                  type={showPassword ? "text" : "password"}
                  placeholder="請輸入登入密碼"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(false); }}
                  className={`w-full pl-10 pr-10 py-3 rounded-xl border bg-slate-50/50 text-sm font-medium outline-none transition-all ${
                    error 
                      ? 'border-rose-300 ring-2 ring-rose-200/50 text-rose-700' 
                      : 'border-slate-200 focus:border-slate-800 focus:ring-2 focus:ring-slate-800/10 text-slate-800 bg-white'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4 stroke-[1.5]" /> : <Eye className="w-4 h-4 stroke-[1.5]" />}
                </button>
              </div>
            </div>

            {/* 記住帳號選項 */}
            <div className="flex items-center justify-between pt-1 pb-1 px-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberUsername}
                  onChange={(e) => setRememberUsername(e.target.checked)}
                  className="w-4 h-4 rounded text-slate-800 border-slate-300 focus:ring-slate-800 accent-slate-800"
                />
                <span className="text-xs font-bold text-slate-500 hover:text-slate-700">記住此帳號</span>
              </label>
              <span className="text-[11px] text-slate-400">職位自動識別授權</span>
            </div>

            <motion.button
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading || !username || !password}
              className={`w-full py-3.5 rounded-xl font-bold text-sm tracking-widest flex items-center justify-center gap-2 transition-all duration-200 shadow-md ${
                loading || !username || !password
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                  : 'bg-slate-800 text-white hover:bg-slate-900 active:bg-black shadow-slate-800/20'
              }`}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '登入系統'}
            </motion.button>
          </form>
        )}

        {/* 分頁 2：司機快速 PIN 碼（專供物流與產線現場快速單手操作） */}
        {loginMode === 'pin' && (
          <div className="space-y-4">
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60 text-center">
              <p className="text-[11px] text-slate-500 font-bold leading-relaxed">
                🚚 司機與現場同仁專用通道，輸入專屬 4~6 碼 PIN 快速上線
              </p>
            </div>

            <form onSubmit={handlePinSubmit}>
              <div className="relative">
                <input
                  ref={pinInputRef}
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => { 
                    const v = e.target.value.replace(/[^0-9]/g, '');
                    setPin(v); 
                    setError(false); 
                  }}
                  className={`w-full px-4 py-3.5 rounded-xl border bg-white font-mono tracking-[0.5em] text-center text-xl outline-none transition-all ${
                    error 
                      ? 'border-rose-400 ring-2 ring-rose-200 text-rose-600' 
                      : 'border-slate-300 focus:border-slate-800 focus:ring-2 focus:ring-slate-800/10 text-slate-800'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                >
                  {showPin ? <EyeOff className="w-4 h-4 stroke-[1.5]" /> : <Eye className="w-4 h-4 stroke-[1.5]" />}
                </button>
              </div>

              {/* 實用觸控數字鍵盤 (適合車載手機或產線大螢幕單手操作) */}
              <div className="grid grid-cols-3 gap-2 mt-4 select-none">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleKeypadPress(num)}
                    className="py-3 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200 rounded-xl font-mono text-base font-bold text-slate-700 transition-colors shadow-sm"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleKeypadPress('clear')}
                  className="py-3 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-500 rounded-xl text-xs font-bold transition-colors"
                >
                  清空
                </button>
                <button
                  type="button"
                  onClick={() => handleKeypadPress('0')}
                  className="py-3 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200 rounded-xl font-mono text-base font-bold text-slate-700 transition-colors shadow-sm"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => handleKeypadPress('backspace')}
                  className="py-3 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-600 rounded-xl flex items-center justify-center transition-colors"
                >
                  <Delete className="w-4 h-4" />
                </button>
              </div>

              <motion.button
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading || !pin}
                className={`w-full py-3.5 mt-4 rounded-xl font-bold text-sm tracking-widest flex items-center justify-center gap-2 transition-all duration-200 shadow-md ${
                  loading || !pin 
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none' 
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 shadow-emerald-600/20'
                }`}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '快速登入'}
              </motion.button>
            </form>
          </div>
        )}
      </motion.div>

      {/* 系統連線設定彈窗 */}
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
              className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-100 overflow-hidden"
            >
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div className="flex items-center gap-2 text-slate-800">
                  <Settings className="w-5 h-5 text-slate-700" />
                  <h3 className="font-bold text-base">系統連線設定</h3>
                </div>
                <button 
                  onClick={() => setShowSettings(false)} 
                  className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Google Apps Script (GAS) 部署網址
                  </label>
                  <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
                    請輸入系統管理員提供的 Google Apps Script 網路應用程式 URL。
                  </p>
                  <input
                    type="text"
                    value={tempUrl}
                    onChange={(e) => setTempUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="w-full px-3 py-2.5 text-xs font-mono border border-slate-200 rounded-xl focus:border-slate-800 focus:ring-1 focus:ring-slate-800 outline-none"
                  />
                </div>
                <button
                  onClick={handleSaveSettings}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold tracking-wider flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  <Save className="w-4 h-4" />
                  儲存並套用連線
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
