import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Link as LinkIcon, Lock, Key, CheckCircle2, Save, Loader2, X, Maximize, Activity, ChevronLeft, Trash2, ChevronRight, LogOut } from 'lucide-react';
import localforage from 'localforage';
import { modalVariants, buttonTap } from './animations';
import { SystemLogViewer } from './SystemLogViewer';
import { useUIStore } from '../store/useUIStore';

type SettingView = 'main' | 'layout' | 'connection' | 'security' | 'logs';

const SettingsRow: React.FC<{ icon: any, label: string, onClick: () => void }> = ({ icon: Icon, label, onClick }) => (
  <button onClick={onClick} className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm active:bg-slate-50 transition-colors mb-3">
    <div className="flex items-center gap-3 text-slate-700 font-bold">
      <div className="w-8 h-8 rounded-full bg-morandi-oatmeal/50 flex items-center justify-center text-morandi-pebble">
        <Icon className="w-4 h-4" />
      </div>
      {label}
    </div>
    <ChevronRight className="w-5 h-5 text-gray-400" />
  </button>
);

export const SettingsModal: React.FC<{ 
  onClose: () => void; 
  onSync: () => void; 
  onSavePassword: (oldPwd: string, newPwd: string) => Promise<boolean>; 
  currentUrl: string; 
  onSaveUrl: (newUrl: string) => void;
  layoutMode?: 'auto' | 'standard' | 'compact';
  onLayoutModeChange?: (mode: 'auto' | 'standard' | 'compact') => void;
}> = ({ onClose, onSync, onSavePassword, currentUrl, onSaveUrl, layoutMode = 'auto', onLayoutModeChange }) => {
  const ui = useUIStore();
  const [currentView, setCurrentView] = useState<SettingView>('main');
  
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [inputUrl, setInputUrl] = useState(currentUrl);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [urlSaveStatus, setUrlSaveStatus] = useState<'idle' | 'success'>('idle');

  const handleLogout = () => {
    ui.openConfirm({
      title: '登出系統',
      message: '確定要登出嗎？',
      onConfirm: () => {
        localStorage.removeItem('nm_auth_status');
        localStorage.removeItem('APP_SESSION_TOKEN');
        localStorage.removeItem('APP_USER_ROLE');
        localStorage.removeItem('APP_USER_NAME');
        window.location.reload();
      }
    });
  };

  const handlePasswordSubmit = async () => {
    if (!oldPassword) { alert('請輸入原密碼'); return; }
    if (newPassword.length < 4) { alert('新密碼長度請至少輸入 4 碼'); return; }
    setSaveStatus('loading');
    try {
      const success = await onSavePassword(oldPassword, newPassword);
      if (success) {
        setSaveStatus('success');
        setOldPassword('');
        setNewPassword('');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
        alert('原密碼錯誤，無法變更密碼');
      }
    } catch (e) {
      setSaveStatus('error');
      alert('變更密碼失敗，請檢查網路連線');
    }
  };

  const handleUrlSubmit = () => {
    if (!inputUrl.startsWith('http')) { alert('請輸入有效的網址 (http 開頭)'); return; }
    onSaveUrl(inputUrl);
    setUrlSaveStatus('success');
    setTimeout(() => setUrlSaveStatus('idle'), 2000);
  };

  if (currentView === 'logs') {
    return (
      <div className="fixed inset-0 bg-morandi-charcoal/40 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm">
        <motion.div variants={modalVariants} initial="hidden" animate="visible" exit="exit" className="bg-white w-full max-w-2xl h-[85vh] sm:h-[90vh] mt-auto sm:mt-0 flex flex-col rounded-t-[32px] sm:rounded-[32px] overflow-hidden shadow-xl">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-slate-50 relative z-10 shrink-0">
            <button onClick={() => setCurrentView('main')} className="flex items-center gap-1.5 p-2 bg-white rounded-xl shadow-sm text-slate-500 font-bold border border-slate-200">
              <ChevronLeft className="w-5 h-5" /> 返回設定
            </button>
            <button onClick={onClose} className="p-2 bg-white rounded-xl shadow-sm text-slate-500 font-bold border border-slate-200">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden relative min-h-0">
            <SystemLogViewer apiEndpoint={currentUrl} />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-morandi-charcoal/40 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm">
      <motion.div variants={modalVariants} initial="hidden" animate="visible" exit="exit" className="bg-white w-full max-w-sm rounded-t-[32px] sm:rounded-[32px] overflow-hidden shadow-xl flex flex-col h-[85vh] sm:h-auto sm:max-h-[90vh]">
        
        {/* Dynamic Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-morandi-oatmeal/30 shrink-0 z-10">
          {currentView === 'main' ? (
            <div>
              <h3 className="font-extrabold text-morandi-charcoal text-lg tracking-tight">系統設定</h3>
              <p className="text-[10px] text-morandi-pebble font-bold uppercase tracking-widest mt-0.5">Settings</p>
            </div>
          ) : (
            <button onClick={() => setCurrentView('main')} className="flex items-center gap-1.5 p-2 -ml-2 bg-transparent text-slate-500 hover:text-slate-700 font-bold">
              <ChevronLeft className="w-5 h-5" /> 
              {currentView === 'layout' && '畫面顯示模式'}
              {currentView === 'connection' && '伺服器連線'}
              {currentView === 'security' && '安全性設定'}
            </button>
          )}
          <button onClick={onClose} className="p-2 bg-white rounded-2xl shadow-sm text-morandi-pebble border border-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area with smooth transition */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 relative">
          <AnimatePresence mode="wait">
            
            {/* Main view */}
            {currentView === 'main' && (
              <motion.div 
                key="main"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div>
                  <SettingsRow icon={Maximize} label="畫面顯示模式" onClick={() => setCurrentView('layout')} />
                  <SettingsRow icon={Lock} label="安全性設定" onClick={() => setCurrentView('security')} />
                  <SettingsRow icon={LinkIcon} label="伺服器連線" onClick={() => setCurrentView('connection')} />
                  <SettingsRow icon={Activity} label="系統操作日誌" onClick={() => setCurrentView('logs')} />
                </div>

                {/* Single-action buttons */}
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <motion.button whileTap={buttonTap} onClick={() => { onSync(); onClose(); }} className="w-full py-4 rounded-[16px] bg-slate-600 text-white font-bold flex items-center justify-center gap-2 shadow-lg tracking-wide">
                    <RefreshCw className="w-5 h-5" /> 強制同步雲端資料
                  </motion.button>
                  
                  <button
                    onClick={() => {
                      ui.openConfirm({
                        title: '清除本地快取',
                        message: '確定要清除所有本地快取嗎？\n這會讓系統重新從雲端下載最新資料。',
                        onConfirm: async () => {
                          const gasUrl = localStorage.getItem('nm_gas_url');
                          await localforage.clear();
                          localStorage.clear();
                          if (gasUrl) localStorage.setItem('nm_gas_url', gasUrl);
                          window.location.reload();
                        }
                      });
                    }}
                    className="w-full py-3 mt-4 flex items-center justify-center gap-2 rounded-sm border border-rose-200 text-rose-500 hover:bg-rose-50 hover:border-rose-300 transition-colors text-sm font-medium tracking-wider"
                  >
                    <Trash2 className="w-4 h-4" />重置系統與清除快取
                  </button>
                  
                  <button
                    onClick={handleLogout}
                    className="w-full py-3 mt-4 flex items-center justify-center gap-2 rounded-[12px] bg-rose-50 border border-rose-100 text-rose-500 hover:bg-rose-100 transition-colors text-sm font-bold tracking-wider"
                  >
                    <LogOut className="w-4 h-4" />登出系統
                  </button>
                </div>
                
                <div className="text-center pt-2">
                  <p className="text-[10px] text-morandi-pebble font-bold tracking-wide">Noodle Factory Manager v1.7 (Secured)</p>
                </div>
              </motion.div>
            )}

            {/* Layout view */}
            {currentView === 'layout' && (
              <motion.div 
                key="layout"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="bg-morandi-oatmeal/50 p-5 rounded-[24px] border border-slate-100 space-y-3">
                  <p className="text-xs text-morandi-charcoal/80 mb-2 font-bold leading-relaxed tracking-wide">
                    若您因為放大系統字體導致畫面空間壓縮，可選擇「長輩舒適模式」來縮減元件間距，增加操作空間。
                  </p>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-morandi-blue transition-colors">
                      <input type="radio" name="layoutMode" value="auto" checked={layoutMode === 'auto'} onChange={() => onLayoutModeChange?.('auto')} className="w-4 h-4 text-morandi-blue" />
                      <span className="text-sm font-bold text-slate-700">自動偵測 (推薦)</span>
                    </label>
                    <label className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-morandi-blue transition-colors">
                      <input type="radio" name="layoutMode" value="standard" checked={layoutMode === 'standard'} onChange={() => onLayoutModeChange?.('standard')} className="w-4 h-4 text-morandi-blue" />
                      <span className="text-sm font-bold text-slate-700">標準模式</span>
                    </label>
                    <label className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-morandi-blue transition-colors">
                      <input type="radio" name="layoutMode" value="compact" checked={layoutMode === 'compact'} onChange={() => onLayoutModeChange?.('compact')} className="w-4 h-4 text-morandi-blue" />
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-700">長輩舒適模式</span>
                        <span className="text-[10px] text-gray-500 font-medium">縮減留白，保留大字體</span>
                      </div>
                    </label>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Connection view */}
            {currentView === 'connection' && (
              <motion.div 
                key="connection"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="bg-morandi-oatmeal/50 p-5 rounded-[24px] space-y-4 border border-slate-100">
                  <p className="text-[10px] text-morandi-charcoal/60 font-bold leading-relaxed tracking-wide">請將您 Google Apps Script 部署後的 Web App URL 貼於此處，以確保資料正確寫入您的試算表。</p>
                  <textarea className="w-full p-3 rounded-2xl border border-slate-200 text-[10px] text-slate-600 font-mono bg-white h-20 resize-none outline-none focus:ring-2 focus:ring-morandi-blue shadow-sm" placeholder="https://script.google.com/macros/s/..." value={inputUrl} onChange={(e) => setInputUrl(e.target.value)} />
                  <motion.button whileTap={buttonTap} onClick={handleUrlSubmit} className={`w-full py-3 rounded-[16px] font-bold flex items-center justify-center gap-2 transition-all tracking-wide ${urlSaveStatus === 'success' ? 'bg-morandi-green-text text-white' : 'bg-white text-slate-600 shadow-sm border border-slate-200'}`}>
                    {urlSaveStatus === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                    {urlSaveStatus === 'success' ? '網址已更新' : '儲存連線網址'}
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* Security view */}
            {currentView === 'security' && (
              <motion.div 
                key="security"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="bg-morandi-oatmeal/50 p-5 rounded-[24px] space-y-4 border border-slate-100">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-morandi-pebble pl-1">原密碼</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-morandi-pebble" />
                        <input type="password" placeholder="輸入目前密碼" className="w-full pl-10 pr-4 py-3 bg-white rounded-2xl text-morandi-charcoal font-bold text-sm border border-slate-200 outline-none focus:ring-2 focus:ring-morandi-blue transition-all tracking-wide" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} disabled={saveStatus === 'loading'} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-morandi-pebble pl-1">新密碼</label>
                      <div className="relative">
                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-morandi-pebble" />
                        <input type="text" placeholder="輸入新密碼" className="w-full pl-10 pr-4 py-3 bg-white rounded-2xl text-morandi-charcoal font-bold text-sm border border-slate-200 outline-none focus:ring-2 focus:ring-morandi-blue transition-all tracking-wide" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={saveStatus === 'loading'} />
                      </div>
                    </div>
                  </div>
                  <motion.button whileTap={buttonTap} onClick={handlePasswordSubmit} disabled={saveStatus === 'loading'} className={`w-full py-3 rounded-[16px] font-bold flex items-center justify-center gap-2 transition-all tracking-wide ${saveStatus === 'success' ? 'bg-morandi-green-text text-white' : 'bg-white text-slate-600 shadow-sm border border-slate-200'} ${saveStatus === 'loading' ? 'opacity-70' : ''}`}>
                    {saveStatus === 'success' ? <CheckCircle2 className="w-4 h-4" /> : saveStatus === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saveStatus === 'success' ? '密碼已更新' : saveStatus === 'loading' ? '更新中...' : '儲存新密碼'}
                  </motion.button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};
