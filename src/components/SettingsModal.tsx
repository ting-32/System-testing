import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Link as LinkIcon, Lock, Key, CheckCircle2, Save, Loader2, X } from 'lucide-react';
import { modalVariants, buttonTap } from './animations';

export const SettingsModal: React.FC<{ onClose: () => void; onSync: () => void; onSavePassword: (oldPwd: string, newPwd: string) => Promise<boolean>; currentUrl: string; onSaveUrl: (newUrl: string) => void; }> = ({ onClose, onSync, onSavePassword, currentUrl, onSaveUrl }) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [inputUrl, setInputUrl] = useState(currentUrl);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [urlSaveStatus, setUrlSaveStatus] = useState<'idle' | 'success'>('idle');

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

  return (
    <div className="fixed inset-0 bg-morandi-charcoal/40 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm">
      <motion.div variants={modalVariants} initial="hidden" animate="visible" exit="exit" className="bg-white w-full max-w-sm rounded-t-[32px] sm:rounded-[32px] overflow-hidden shadow-xl h-[85vh] sm:h-auto overflow-y-auto">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-morandi-oatmeal/30 sticky top-0 z-10">
          <div>
            <h3 className="font-extrabold text-morandi-charcoal text-lg tracking-tight">系統設定</h3>
            <p className="text-[10px] text-morandi-pebble font-bold uppercase tracking-widest mt-0.5">Settings</p>
          </div>
          <button onClick={onClose} className="p-2 bg-white rounded-2xl shadow-sm text-morandi-pebble border border-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-8">
          <section className="space-y-3">
            <h4 className="text-xs font-bold text-morandi-pebble uppercase tracking-widest flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> 資料同步
            </h4>
            <div className="bg-morandi-oatmeal/50 p-5 rounded-[24px] border border-slate-100">
              <p className="text-xs text-morandi-charcoal/80 mb-4 font-bold leading-relaxed tracking-wide">若發現資料與雲端不同步（例如其他裝置已更新），可點擊下方按鈕強制重新讀取。</p>
              <motion.button whileTap={buttonTap} onClick={() => { onSync(); onClose(); }} className="w-full py-4 rounded-[16px] bg-slate-600 text-white font-bold flex items-center justify-center gap-2 shadow-lg tracking-wide">
                <RefreshCw className="w-5 h-5" /> 強制同步雲端資料
              </motion.button>
            </div>
          </section>
          <section className="space-y-3">
            <h4 className="text-xs font-bold text-morandi-pebble uppercase tracking-widest flex items-center gap-2">
              <LinkIcon className="w-4 h-4" /> 伺服器連線 (GAS URL)
            </h4>
            <div className="bg-morandi-oatmeal/50 p-5 rounded-[24px] space-y-4 border border-slate-100">
              <p className="text-[10px] text-morandi-charcoal/60 font-bold leading-relaxed tracking-wide">請將您 Google Apps Script 部署後的 Web App URL 貼於此處，以確保資料正確寫入您的試算表。</p>
              <textarea className="w-full p-3 rounded-2xl border border-slate-200 text-[10px] text-slate-600 font-mono bg-white h-20 resize-none outline-none focus:ring-2 focus:ring-morandi-blue shadow-sm" placeholder="https://script.google.com/macros/s/..." value={inputUrl} onChange={(e) => setInputUrl(e.target.value)} />
              <motion.button whileTap={buttonTap} onClick={handleUrlSubmit} className={`w-full py-3 rounded-[16px] font-bold flex items-center justify-center gap-2 transition-all tracking-wide ${urlSaveStatus === 'success' ? 'bg-morandi-green-text text-white' : 'bg-white text-slate-600 shadow-sm border border-slate-200'}`}>
                {urlSaveStatus === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                {urlSaveStatus === 'success' ? '網址已更新' : '儲存連線網址'}
              </motion.button>
            </div>
          </section>
          <section className="space-y-3">
            <h4 className="text-xs font-bold text-morandi-pebble uppercase tracking-widest flex items-center gap-2">
              <Lock className="w-4 h-4" /> 安全性設定
            </h4>
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
          </section>
          <div className="text-center pt-4 border-t border-gray-100">
            <p className="text-[10px] text-morandi-pebble font-bold tracking-wide">Noodle Factory Manager v1.7 (Secured)</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
