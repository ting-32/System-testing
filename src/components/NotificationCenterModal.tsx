import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, BellRing, Trash2, Save, MessageCircle, AlertCircle, Sparkles } from 'lucide-react';
import { Customer, Product, ReminderRule } from '../types';
import { NotificationLogViewer } from './NotificationLogViewer';
import { DiagnosticFunnelModal } from './DiagnosticFunnelModal';
import { container } from '../core/di/AppContainer';
import { fetchWithRetry } from '../utils/fetchUtils';

// 1. 取得該規則下次執行的具體 Date 物件
function getNextRunDate(schedule: string | string[], timeToNotify: string): Date | null {
  if (!timeToNotify) return null;
  
  const now = new Date();
  const [hourStr, minuteStr] = timeToNotify.split(':');
  const targetHour = parseInt(hourStr, 10);
  const targetMinute = parseInt(minuteStr || '0', 10);

  // 轉換排程為數字陣列 (0=星期日, 1=星期一...)
  const targetDays = schedule === '每天' 
    ? [0, 1, 2, 3, 4, 5, 6] 
    : (Array.isArray(schedule) ? schedule.map(Number) : [Number(schedule)]);

  if (targetDays.length === 0 || isNaN(targetDays[0])) return null;

  // 從今天開始往後推 7 天內，找出最近的一個觸發時間
  for (let i = 0; i <= 7; i++) {
    const checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const dayOfWeek = checkDate.getDay();

    if (targetDays.includes(dayOfWeek)) {
      checkDate.setHours(targetHour, targetMinute, 0, 0);
      // 如果時間是大於現在的 (也就是未來的時間)，這就是最接近的下一班車
      if (checkDate > now) {
         return checkDate;
      }
    }
  }
  return null;
}

// 2. 將 Date 物件轉為「今天 19:00 (約 2 小時 15 分後)」的格式
function formatNextRunText(nextRun: Date | null): string {
  if (!nextRun) return "無法計算預計時間";
  const now = new Date();
  const diffMs = nextRun.getTime() - now.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  
  const isToday = nextRun.getDate() === now.getDate();
  const isTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getDate() === nextRun.getDate();
  
  let dayStr = "";
  if (isToday) dayStr = "今天";
  else if (isTomorrow) dayStr = "明天";
  else {
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    dayStr = `星期${days[nextRun.getDay()]}`;
  }

  const timeStr = `${String(nextRun.getHours()).padStart(2, '0')}:${String(nextRun.getMinutes()).padStart(2, '0')}`;
  
  if (hours === 0 && mins === 0) return `預計下次執行：${dayStr} ${timeStr} (即將執行)`;
  if (hours === 0) return `預計下次執行：${dayStr} ${timeStr} (約 ${mins} 分後)`;
  return `預計下次執行：${dayStr} ${timeStr} (約 ${hours} 小時 ${mins} 分後)`;
}

// 實時更新的下一班車徽章元件
const NextRunIndicator = ({ rule }: { rule: ReminderRule }) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    // 設定每 60 秒喚醒一次，重新設定當下時間來重算倒數
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  if (!rule.isActive) {
    return (
      <div className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-400 font-medium">
         <span className="w-2 h-2 rounded-full bg-slate-300"></span>
         規則已停用，暫且停止排程
      </div>
    );
  }

  const nextRunDate = getNextRunDate(rule.schedule, rule.timeToNotify);
  const text = formatNextRunText(nextRunDate);

  return (
    <div className="mt-1 flex items-center gap-1.5 text-[12px] text-emerald-600 font-medium">
       <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
       {text}
    </div>
  );
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  customers: Customer[];
  products: Product[];
  lineChannelToken: string;
  setLineChannelToken: (token: string) => void;
  lineUserId: string;
  setLineUserId: (id: string) => void;
  apiEndpoint: string;
}

export const NotificationCenterModal: React.FC<Props> = ({
  isOpen,
  onClose,
  customers,
  products,
  lineChannelToken,
  setLineChannelToken,
  lineUserId,
  setLineUserId,
  apiEndpoint
}) => {
  const [activeTab, setActiveTab] = useState<'rules' | 'settings' | 'logs'>('rules');
  const [rules, setRules] = useState<ReminderRule[]>([]);
  const [editingRule, setEditingRule] = useState<ReminderRule | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const [isFunnelOpen, setIsFunnelOpen] = useState(false);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [currentDryRunRuleId, setCurrentDryRunRuleId] = useState<string | null>(null);

  const loadRulesFromStorage = () => {
    // 💡 【新增】冷卻護盾檢查：如果距離上次編輯不到 15 秒 (15000 毫秒)，就忽略來自雲端的覆蓋
    const lastEditTime = localStorage.getItem('rules_last_edit_time');
    if (lastEditTime && Date.now() - parseInt(lastEditTime) < 15000) {
      console.log('處於編輯安全冷卻期，略過外部背景覆寫');
      return;
    }

    const saved = localStorage.getItem('nm_reminder_rules');
    if (saved) {
      try {
        const parsedRules = JSON.parse(saved).map((r: any) => {
          if (typeof r.schedule === 'string') {
            return {
              ...r,
              schedule: r.schedule === '每天' ? ['0', '1', '2', '3', '4', '5', '6'] : [r.schedule]
            };
          }
          return r;
        });
        setRules(parsedRules);
      } catch (e) {}
    }
  };

  useEffect(() => {
    loadRulesFromStorage();

    // 監聽來自背景同步的更新事件
    const handleCloudUpdate = () => {
      loadRulesFromStorage();
    };
    
    window.addEventListener('rules_updated_from_cloud', handleCloudUpdate);
    return () => window.removeEventListener('rules_updated_from_cloud', handleCloudUpdate);
  }, []);

  const saveToGas = async (currentRules: ReminderRule[], channelToken: string, userId: string) => {
    if (!apiEndpoint) return;
    setIsSaving(true);
    try {
      await fetchWithRetry(apiEndpoint, {
        method: "POST",
        body: JSON.stringify({
          action: "saveSettings",
          data: {
            rules: currentRules,
            lineChannelToken: channelToken,
            lineUserId: userId
          }
        })
      });
    } catch(e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const saveRules = (newRules: ReminderRule[]) => {
    setRules(newRules);
    localStorage.setItem('nm_reminder_rules', JSON.stringify(newRules));
    // 💡 【新增】：打上冷卻護盾，寫入現在的絕對時間
    localStorage.setItem('rules_last_edit_time', Date.now().toString());
    saveToGas(newRules, lineChannelToken, lineUserId);
  };
  
  const handleDryRunRule = async (ruleId: string) => {
    if (!apiEndpoint || !lineChannelToken || !lineUserId) {
      alert('請填寫完整 Token 與 User ID');
      return;
    }
    
    setIsFunnelOpen(true);
    setIsDryRunning(true);
    setDryRunResult(null);
    setCurrentDryRunRuleId(ruleId);
    
    try {
      container.updateApiEndpoint(apiEndpoint);
      await saveToGas(rules, lineChannelToken, lineUserId);
      const res = await container.logRepo.runDryRun(ruleId);
      if (res?.data) {
        setDryRunResult(res.data);
      } else {
        // Fallback for API structure changes
        setDryRunResult(res);
      }
    } catch(err: any) {
      console.error(err);
      alert('推演時發生錯誤: ' + err.message);
      setIsFunnelOpen(false);
    } finally {
      setIsDryRunning(false);
    }
  };

  const executeRealSend = async () => {
    if (!currentDryRunRuleId) return;
    setIsSaving(true);
    try {
      const res = await fetchWithRetry(apiEndpoint, {
        method: "POST",
        body: JSON.stringify({
          action: "testRule",
          data: { ruleId: currentDryRunRuleId }
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('測試觸發指令已送出！應會立即發送 LINE 訊息。');
        setIsFunnelOpen(false);
      } else {
        alert('測試失敗: ' + (data.message || '未知錯誤'));
      }
    } catch(err: any) {
      alert('測試時發生錯誤: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndTestToken = async () => {
    if (!apiEndpoint || !lineChannelToken || !lineUserId) {
      alert('請填寫完整 Token 與 User ID');
      return;
    }
    setIsSaving(true);
    try {
      // First save
      await saveToGas(rules, lineChannelToken, lineUserId);
      
      // Then trigger test message
      const res = await fetchWithRetry(apiEndpoint, {
        method: "POST",
        body: JSON.stringify({
          action: "testLineMessage",
          data: {
            lineChannelToken,
            lineUserId
          }
        })
      });
      const resObj = await res.json();
      if (!resObj.success) {
        throw new Error(resObj.error || "測試發送失敗");
      }
      alert('已成功儲存並發送測試訊息，請確認您的 LINE！');
    } catch(e: any) {
      alert('執行失敗：' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateRule = () => {
    setEditingRule({
      id: Date.now().toString(),
      name: '未命名提醒',
      schedule: ['1', '2', '3', '4', '5'],
      conditions: [{
        customers: [],
        status: 'UNORDERED',
        products: []
      }],
      timeToNotify: '20:00',
      isActive: true,
      customMessage: '',
    });
  };

  const calculatePreview = (rule: ReminderRule) => {
    if (!rule) return "";

    // 預先產生一個預覽用的假時間
    const fakeTime = `2026-05-17(日)晚上7:00`;
    
    let targetDayStr = '';
    if (rule.targetOrderDays && rule.targetOrderDays.length > 0) {
      // 組合出類似 5-19(日)、5-20(一) 的格式做為預覽
      targetDayStr = rule.targetOrderDays.map(d => {
         const dayWord = ['日', '一', '二', '三', '四', '五', '六'][parseInt(d)];
         return `5-19(${dayWord})`; 
      }).join('、');
    } else {
      targetDayStr = '5-19(一)'; // 預設帶入一個假預覽時間
    }

    // 只有【規則名稱】 和 當下時間作為開頭
    let desc = `【${rule.name || '未命名規則'}】:\n`;
    desc += `${fakeTime}\n`; // 顯示當下時間
    
    rule.conditions.forEach((cond, idx) => {
      const custNames = cond.customers && cond.customers.length > 0 ? cond.customers.map(cId => customers.find(c => c.id === cId)?.name || cId).join('、') : '所有客戶';
      const prodNames = cond.products && cond.products.length > 0 ? cond.products.join('、') : '任何品項';
      const statusStr = cond.status === 'UNORDERED' ? '沒有訂購' : '狀態為待處理';
      
      const opStr = idx > 0 ? (cond.operator === 'AND' ? '【且】' : '【或】') : '';
      
      // 更新組合為： 對象 + 發生 + 時間點 + 品項
      desc += `${opStr}${custNames} ${statusStr} ${targetDayStr} ${prodNames}\n`;
    });

    if (rule.customMessage) {
      desc += `\n${rule.customMessage}`;
    }
    
    return desc;
  };

  if (!isOpen) return null;

  const activeDryRunRule = rules.find(r => r.id === currentDryRunRuleId);

  return (
    <>
      <AnimatePresence>
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/40 backdrop-blur-sm">
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-white w-full max-w-md h-[95dvh] sm:h-[85dvh] sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl relative rounded-t-3xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-white/80 backdrop-blur z-10 sticky top-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500">
                <BellRing className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-slate-800">通知中心</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 bg-slate-50 text-slate-400 rounded-full hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-100 p-2 gap-2 bg-slate-50/50">
            <button
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab === 'rules' ? 'bg-white text-amber-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:bg-slate-100'}`}
              onClick={() => setActiveTab('rules')}
            >
              提醒規則
            </button>
            <button
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab === 'logs' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:bg-slate-100'}`}
              onClick={() => setActiveTab('logs')}
            >
              執行日誌
            </button>
            <button
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab === 'settings' ? 'bg-white text-emerald-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:bg-slate-100'}`}
              onClick={() => setActiveTab('settings')}
            >
              LINE 串接設定
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-50/30 p-4">
            {activeTab === 'rules' && (
              <div className="space-y-4 pb-20">
                {editingRule ? (
                  <RuleBuilder 
                    rule={editingRule} 
                    setRule={setEditingRule} 
                    customers={customers} 
                    products={products} 
                    onSave={() => {
                      const updated = rules.filter(r => r.id !== editingRule.id);
                      saveRules([...updated, editingRule]);
                      setEditingRule(null);
                    }}
                    onCancel={() => setEditingRule(null)}
                    previewText={calculatePreview(editingRule)}
                  />
                ) : (
                  <>
                    {rules.map(rule => (
                      <div key={rule.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm relative overflow-hidden">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                              {rule.name}
                              {!rule.isActive && <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">已停用</span>}
                            </h3>
                            <NextRunIndicator rule={rule} />
                          </div>
                          <div className="flex gap-2 items-center">
                            <button onClick={() => handleDryRunRule(rule.id)} className="text-indigo-600 text-[11px] px-2 py-1 flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 rounded-md font-semibold transition-colors">
                              <Sparkles className="w-3 h-3" />
                              邏輯診斷
                            </button>
                            <button onClick={() => setEditingRule(rule)} className="text-amber-600 text-sm font-semibold hover:underline border-l border-slate-200 pl-2">編輯</button>
                            <button onClick={() => saveRules(rules.filter(r => r.id !== rule.id))} className="text-rose-500 text-sm pl-1"><Trash2 className="w-4 h-4"/></button>
                          </div>
                        </div>
                        <p className="text-sm text-slate-600 mt-2 bg-slate-50 p-2 rounded-xl whitespace-pre-line leading-relaxed">
                          {calculatePreview(rule)}
                        </p>
                      </div>
                    ))}
                    
                    <button
                      onClick={handleCreateRule}
                      className="w-full py-4 border-2 border-dashed border-slate-300 rounded-2xl text-slate-500 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-600 transition-all flex items-center justify-center gap-2 font-semibold"
                    >
                      <Plus className="w-5 h-5" />
                      新增提醒規則
                    </button>
                  </>
                )}
              </div>
            )}

            {activeTab === 'logs' && (
              <NotificationLogViewer apiEndpoint={apiEndpoint} />
            )}

            {activeTab === 'settings' && (
              <div className="space-y-6">
                 <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                      <MessageCircle className="w-24 h-24 text-emerald-600" />
                    </div>
                    <h3 className="font-bold text-slate-800 text-lg mb-2 relative z-10">LINE Messaging API 串接</h3>
                    <p className="text-sm text-slate-500 mb-4 relative z-10 leading-relaxed">
                      請前往 LINE Developers 建立官方帳號 (Messaging API)，並貼上對應的憑證與您想接收對象的 User ID。<br/>
                      這會讓系統在背景自動發送提醒到您的手機。
                    </p>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Channel Access Token</label>
                        <input 
                          type="text" 
                          value={lineChannelToken}
                          onChange={(e) => setLineChannelToken(e.target.value)}
                          placeholder="請輸入長期有效的 Channel Access Token..."
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-shadow font-mono text-sm relative z-10"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Your User ID (可填寫多個)</label>
                        <input 
                          type="text" 
                          value={lineUserId}
                          onChange={(e) => setLineUserId(e.target.value)}
                          placeholder="請輸入 User ID，多個人請用半形逗號 (,) 分隔"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-shadow font-mono text-sm relative z-10"
                        />
                        <p className="text-[11px] text-slate-400 mt-1">
                          範例: U123..., U456... (最多支援 500 人)。
                          <br/>
                          💡 <b>獲取提示：</b>請到 LINE 將該機器人加為好友，並傳送「<b>查ID</b>」，機器人就會自動回覆您的 User ID。
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex justify-end relative z-10 gap-2">
                      <button onClick={handleSaveAndTestToken} disabled={isSaving} className="bg-emerald-600 text-white px-6 py-2 rounded-xl font-semibold shadow-sm hover:bg-emerald-700 transition-colors disabled:opacity-50">
                        {isSaving ? '儲存中...' : '儲存與測試'}
                      </button>
                    </div>
                 </div>

                 <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 text-amber-800 text-sm flex gap-3">
                   <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                   <p className="leading-relaxed">
                     提醒功能依賴背景排程 (Google Apps Script 時間觸發器)。當您儲存規則後，雲端每天會自動執行檢查腳本。如果客戶的「公休日」設定包含當天，則會自動跳過不提醒。
                   </p>
                 </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
    <DiagnosticFunnelModal 
      isOpen={isFunnelOpen} 
      onClose={() => setIsFunnelOpen(false)} 
      isLoading={isDryRunning} 
      result={dryRunResult} 
      onRealSend={executeRealSend} 
      rule={activeDryRunRule}
    />
  </>
  );
};

// Sub-component for editing a rule
const RuleBuilder = ({ rule, setRule, customers, products, onSave, onCancel, previewText }: any) => {
  const [activePicker, setActivePicker] = useState<{index: number, type: 'customers' | 'products'} | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const addConditionGroup = (operator: 'AND' | 'OR') => {
    setRule({
      ...rule,
      conditions: [...rule.conditions, { operator, customers: [], status: 'UNORDERED', products: [] }]
    });
  };

  const toggleDay = (dayStr: string) => {
    let curr = [...(rule.schedule || [])];
    if (curr.includes(dayStr)) {
      curr = curr.filter(d => d !== dayStr);
    } else {
      curr.push(dayStr);
    }
    setRule({...rule, schedule: curr});
  };

  const toggleTargetDay = (dayStr: string) => {
    let curr = [...(rule.targetOrderDays || [])];
    if (curr.includes(dayStr)) {
      curr = curr.filter(d => d !== dayStr);
    } else {
      curr.push(dayStr);
    }
    setRule({...rule, targetOrderDays: curr});
  };

  const toggleItem = (cIdx: number, type: 'customers' | 'products', val: string) => {
    const newConds = [...rule.conditions];
    let arr = [...(newConds[cIdx][type] || [])];
    if (arr.includes(val)) {
      arr = arr.filter(item => item !== val);
    } else {
      arr.push(val);
    }
    newConds[cIdx][type] = arr;
    setRule({...rule, conditions: newConds});
  };

  const daysList = [
    { label: '日', val: '0' },
    { label: '一', val: '1' },
    { label: '二', val: '2' },
    { label: '三', val: '3' },
    { label: '四', val: '4' },
    { label: '五', val: '5' },
    { label: '六', val: '6' }
  ];

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">規則名稱</label>
          <input 
            type="text" 
            value={rule.name || ''} 
            onChange={e => setRule({...rule, name: e.target.value})} 
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
          />
        </div>
        
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">檢查週期 (多選)</label>
            <div className="flex flex-wrap gap-2">
              {daysList.map(d => {
                const isActive = rule.schedule?.includes(d.val);
                return (
                  <button
                    key={d.val}
                    onClick={() => toggleDay(d.val)}
                    className={`w-10 h-10 rounded-full font-bold text-sm transition-colors ${isActive ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 flex items-center gap-1">檢查訂單日期 (多選)</label>
            <div className="text-[10px] text-slate-400 mb-2 leading-snug">
              選擇要檢查哪幾天的訂單(尋找條件內接下來的第一個符合日期)。若不選，預設為「隔天」。
            </div>
            <div className="flex flex-wrap gap-2">
              {daysList.map(d => {
                const isActive = rule.targetOrderDays?.includes(d.val);
                return (
                  <button
                    key={'target_'+d.val}
                    onClick={() => toggleTargetDay(d.val)}
                    className={`w-10 h-10 rounded-full font-bold text-sm transition-colors ${isActive ? 'bg-indigo-500 text-white shadow-sm' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">提醒時間</label>
            <input 
              type="time" 
              value={rule.timeToNotify || ''} 
              onChange={e => {
                let val = e.target.value;
                if (val && val.includes(':')) {
                   const [h, m] = val.split(':');
                   val = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
                }
                setRule({ ...rule, timeToNotify: val });
              }} 
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" 
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-bold text-slate-800 pl-1">邏輯條件 (條件組件)</label>
        {rule.conditions.map((cond: any, cIdx: number) => (
          <div key={cIdx} className="bg-slate-100 rounded-2xl p-4 border border-slate-200 relative flex flex-col gap-4">
            {cIdx > 0 && (
              <div className={`absolute -top-3 left-1/2 -translate-x-1/2 text-white text-[10px] font-bold px-3 py-0.5 rounded-full z-10 shadow-sm ${cond.operator === 'AND' ? 'bg-indigo-600' : 'bg-slate-800'}`}>
                {cond.operator === 'AND' ? 'AND (且)' : 'OR (或)'}
              </div>
            )}
            
            <div className="space-y-4 mt-2">
              {/* WHO */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">對象</span>
                <div className="flex flex-wrap gap-2 items-center">
                  {(cond.customers || []).map((cId: string) => {
                    const cName = customers.find((c:any) => c.id === cId)?.name || cId;
                    return (
                      <span key={cId} className="bg-white border border-slate-200 text-slate-700 text-sm px-3 py-1 rounded-full flex items-center gap-1 shadow-sm font-medium">
                        {cName}
                        <button onClick={() => toggleItem(cIdx, 'customers', cId)} className="text-slate-400 hover:text-rose-500 rounded-full ml-1"><X className="w-3 h-3" /></button>
                      </span>
                    )
                  })}
                  <button onClick={() => {
                    setActivePicker(activePicker?.index === cIdx && activePicker.type === 'customers' ? null : {index: cIdx, type: 'customers'})
                    setSearchTerm('');
                  }} className="text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1 rounded-full text-sm font-bold flex items-center shadow-sm transition-colors border border-emerald-200/50">
                    ＋ 新增店家
                  </button>
                </div>
                {activePicker?.index === cIdx && activePicker.type === 'customers' && (
                  <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm mt-1 flex flex-col gap-3">
                    <input 
                      type="text" 
                      placeholder="🔍 搜尋店家..." 
                      value={searchTerm} 
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-shadow"
                    />
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                      {customers.filter((c: any) => c.name.includes(searchTerm)).map((c: any) => {
                        const selected = (cond.customers || []).includes(c.id);
                        return (
                          <button key={c.id} onClick={() => toggleItem(cIdx, 'customers', c.id)} className={`text-left px-3 py-2 rounded-lg text-sm font-medium transition-all border ${selected ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-300'}`}>
                            {c.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ACTION / ITEM */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">發生</span>
                <select 
                  className="bg-white border border-slate-200 rounded-xl text-sm p-2 font-medium shadow-sm w-full outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  value={cond.status}
                  onChange={(e) => {
                    const newConds = [...rule.conditions];
                    newConds[cIdx].status = e.target.value;
                    setRule({...rule, conditions: newConds});
                  }}
                >
                  <option value="UNORDERED">未訂購 (完全沒有建立訂單)</option>
                  <option value="PENDING">狀態為待處理 (有訂單但不完整)</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">品項</span>
                <div className="flex flex-wrap gap-2 items-center">
                  {(cond.products || []).map((pId: string) => {
                    return (
                      <span key={pId} className="bg-white border border-slate-200 text-slate-700 text-sm px-3 py-1 rounded-full flex items-center gap-1 shadow-sm font-medium">
                        {pId}
                        <button onClick={() => toggleItem(cIdx, 'products', pId)} className="text-slate-400 hover:text-rose-500 rounded-full ml-1"><X className="w-3 h-3" /></button>
                      </span>
                    )
                  })}
                  <button onClick={() => {
                    setActivePicker(activePicker?.index === cIdx && activePicker.type === 'products' ? null : {index: cIdx, type: 'products'});
                    setSearchTerm('');
                  }} className="text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-full text-sm font-bold flex items-center shadow-sm transition-colors border border-blue-200/50">
                    ＋ 新增品項
                  </button>
                </div>
                {activePicker?.index === cIdx && activePicker.type === 'products' && (
                  <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm mt-1 flex flex-col gap-3">
                    <input 
                      type="text" 
                      placeholder="🔍 搜尋品項..." 
                      value={searchTerm} 
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                    />
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                      {products.filter((p: any) => p.name.includes(searchTerm)).map((p: any) => {
                        const selected = (cond.products || []).includes(p.name);
                        return (
                          <button key={p.name} onClick={() => toggleItem(cIdx, 'products', p.name)} className={`text-left px-3 py-2 rounded-lg text-sm font-medium transition-all border ${selected ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-300'}`}>
                            {p.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {rule.conditions.length > 1 && (
              <button 
                onClick={() => {
                  const newConds = rule.conditions.filter((_: any, i: number) => i !== cIdx);
                  setRule({...rule, conditions: newConds});
                  setActivePicker(null);
                }}
                className="absolute top-2 right-2 p-1.5 text-rose-400 hover:bg-rose-50 rounded-lg transition-colors"
               >
                <Trash2 className="w-4 h-4"/>
              </button>
            )}
          </div>
        ))}

        <div className="flex gap-2">
          <button 
            onClick={() => addConditionGroup('OR')}
            className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-bold flex justify-center items-center gap-2 transition-colors border border-dashed border-slate-300"
          >
            <Plus className="w-4 h-4" />
            新增條件 (OR / 或)
          </button>
          <button 
            onClick={() => addConditionGroup('AND')}
            className="flex-1 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-sm font-bold flex justify-center items-center gap-2 transition-colors border border-dashed border-indigo-200"
          >
            <Plus className="w-4 h-4" />
            新增條件 (AND / 且)
          </button>
        </div>
      </div>

      <div className="space-y-3 mt-4">
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
          自訂提醒內容 (選填)
        </label>
        <textarea
          value={rule.customMessage || ''}
          onChange={e => setRule({...rule, customMessage: e.target.value})}
          placeholder="例如：請記得打電話跟客戶確認是否漏訂單..."
          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-1 focus:ring-emerald-500"
          rows={3}
        />
      </div>

      <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100/50 mt-4">
        <h4 className="text-xs font-bold text-blue-800 flex items-center gap-2 mb-2">
          <MessageCircle className="w-4 h-4" />
          自動翻譯預覽 (預計發送邏輯)
        </h4>
        <p className="text-sm text-blue-900/80 leading-relaxed whitespace-pre-line font-medium">
          {previewText}
        </p>
      </div>

      <div className="flex gap-3 pt-4 border-t border-slate-100 mt-6 pb-6">
        <button onClick={onCancel} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors">
          取消
        </button>
        <button onClick={onSave} className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-bold shadow-md shadow-amber-500/20 hover:bg-amber-600 transition-colors flex justify-center items-center gap-2">
          <Save className="w-4 h-4" />
          儲存規則
        </button>
      </div>
    </div>
  );
};
