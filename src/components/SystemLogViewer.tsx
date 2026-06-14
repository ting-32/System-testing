import React, { useEffect, useState, useMemo } from 'react';
import { Search, RefreshCw, Activity, PlusCircle, Edit2, Trash2, Settings, ChevronDown, ChevronUp, ArrowRight, AlertCircle } from 'lucide-react';
import { SystemLog } from '../types';
import { container } from '../core/di/AppContainer';
import { motion, AnimatePresence } from 'framer-motion';
import { useLogStore } from '../store/useLogStore';
import { useAppStore } from '../store/useAppStore';

interface Props {
  apiEndpoint: string;
}

export function SystemLogViewer({ apiEndpoint }: Props) {
  const { systemLogs: logs, setSystemLogs } = useLogStore();
  const { products } = useAppStore();
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [filterTime, setFilterTime] = useState<number>(0);
  const [searchWord, setSearchWord] = useState<string>('');
  
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      container.updateApiEndpoint(apiEndpoint);
      const fetchedLogs = await container.logRepo.getSystemLogs(200);
      setSystemLogs(fetchedLogs, Date.now());
    } catch (e) {
      console.error("Failed to fetch logs", e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (apiEndpoint && logs.length === 0) {
      fetchLogs();
    }
  }, [apiEndpoint, logs.length]);

  const _uniqueActions = useMemo(() => {
    const actions = new Set<string>();
    logs.forEach(log => {
      if (log.actionType) actions.add(log.actionType.split('_')[0]); // GROUP BY CREATE/UPDATE/DELETE
    });
    return Array.from(actions);
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const now = Date.now();
    return logs.filter(log => {
      if (filterAction !== 'ALL' && !log.actionType.startsWith(filterAction)) return false;
      if (filterTime > 0 && (now - log.timestamp) > filterTime * 60 * 60 * 1000) return false;
      if (searchWord && !log.target.toLowerCase().includes(searchWord.toLowerCase()) && !log.details.toLowerCase().includes(searchWord.toLowerCase())) return false;
      return true;
    });
  }, [logs, filterAction, filterTime, searchWord]);
  
  const getActionStyles = (actionType: string) => {
    if (actionType === 'UPDATE_ORDER_BATCH') {
      return {
        icon: <Edit2 className="w-5 h-5 text-indigo-500" />,
        bg: 'bg-indigo-50',
        text: 'text-indigo-700',
        border: 'border-indigo-200',
        ring: 'ring-indigo-100',
        label: '批次修改'
      };
    }
    if (actionType.startsWith('CREATE')) {
      return {
        icon: <PlusCircle className="w-5 h-5 text-emerald-500" />,
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        ring: 'ring-emerald-100',
        label: '新增'
      };
    }
    if (actionType.startsWith('UPDATE')) {
      return {
        icon: <Edit2 className="w-5 h-5 text-amber-500" />,
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
        ring: 'ring-amber-100',
        label: '修改'
      };
    }
    if (actionType.startsWith('DELETE')) {
      return {
        icon: <Trash2 className="w-5 h-5 text-rose-500" />,
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        border: 'border-rose-200',
        ring: 'ring-rose-100',
        label: '刪除'
      };
    }
    return {
      icon: <Settings className="w-5 h-5 text-indigo-500" />,
      bg: 'bg-indigo-50',
      text: 'text-indigo-700',
      border: 'border-indigo-200',
      ring: 'ring-indigo-100',
      label: '系統'
    };
  };

  const parseDetails = (details: string) => {
    try {
      return JSON.parse(details);
    } catch {
      return null;
    }
  };

  const renderHumanReadableDetails = (actionType: string, parsedJson: any) => {
    const renderStatusBadge = (status: string) => {
      const statusMap: Record<string, { label: string, classes: string }> = {
        'PAID': { label: '已結帳', classes: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
        'PENDING': { label: '待處理', classes: 'bg-rose-100 text-rose-700 border border-rose-200' }, 
        'SHIPPED': { label: '已配送', classes: 'bg-blue-100 text-blue-700 border border-blue-200' },
      };
      const config = statusMap[status] || { label: status, classes: 'bg-slate-100 text-slate-600 border border-slate-200' };
      
      return (
        <span className={`px-3 py-1 rounded-md text-sm font-bold ${config.classes}`}>
          {config.label}
        </span>
      );
    };

    // === 1. 新增訂單 ===
    if (actionType === 'CREATE_ORDER') {
      const payload = parsedJson.payload || {};
      const customerName = payload.customerName || '未知店家';
      // 日誌中存的 payload.deliveryDate 可能為 yyyy-MM-dd
      const deliveryDate = payload.deliveryDate || '未指定日期';
      const items = parsedJson.items || payload.items || [];
      
      return (
        <div className="space-y-3 mt-2 bg-emerald-50/80 p-3.5 rounded-xl border border-emerald-100">
          <p className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-1.5">
            ✅ <span>向【<span className="text-emerald-700 text-lg">{customerName}</span>】建立了一筆 <span className="text-indigo-600 underline decoration-indigo-200 underline-offset-4">{deliveryDate}</span> 的訂單</span>
          </p>
          <div className="bg-white p-3 rounded-lg border border-emerald-100 shadow-sm">
            <p className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1">
              📦 訂單內容：
            </p>
            <ul className="space-y-1.5 pl-1">
              {items.map((item: any, idx: number) => {
                // 如果存下來的 productName 剛好就是 ID（代表建立時沒抓到名字），就當作無效
                const validSavedName = item.productName && item.productName !== item.productId ? item.productName : null;
                // 嘗試即時從現有商品清單找
                const pNameFromStore = products.find(p => p.id === item.productId)?.name;
                
                const pName = pNameFromStore || validSavedName || item.productId || '未知商品';

                return (
                  <li key={idx} className="text-sm font-bold text-slate-700">
                    • {pName} <span className="text-indigo-600 ml-1.5">{item.quantity} {item.unit || '斤'}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      );
    }

    // === 2. 訂單修改/狀態變更 (拔除 UUID、字體放大、導入狀態字典) ===
    if (actionType === 'UPDATE_ORDER_BATCH' || actionType === 'UPDATE_ORDER' || actionType === 'UPDATE_ORDER_STATUS') {
      // 嘗試從不同結構中抽出資料 (相容新舊日誌結構)
      const isLegacyArray = Array.isArray(parsedJson.updates);
      const updatesData = isLegacyArray ? parsedJson.updates : (parsedJson?.updates?.updates || parsedJson?.diff?.updates || []);
      const customerName = isLegacyArray ? '多筆訂單 (批次)' : (parsedJson?.updates?.customerName || parsedJson?.diff?.customerName || '未知店家');
      const deliveryDate = isLegacyArray ? '' : (parsedJson?.updates?.deliveryDate || '');

      return (
        <div className="space-y-3 mt-2 bg-amber-50/50 p-4 rounded-xl border border-amber-100">
          <p className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-1.5">
            🔄 <span>修改了【<span className="text-amber-700 text-lg">{customerName}</span>】{deliveryDate && `在 ${deliveryDate} `}的狀態</span>
          </p>
          
          {updatesData.length > 0 && (
            <div className="space-y-2 mt-2">
              {updatesData.map((update: any, idx: number) => (
                 <div key={idx} className="bg-white px-4 py-3 rounded-lg border border-amber-100 shadow-sm flex items-center gap-3">
                   {/* 原本的狀態 (帶有刪除線與透明度) */}
                   {update.originalStatus && (
                     <div className="opacity-60 relative group">
                       {renderStatusBadge(update.originalStatus)}
                       {/* 掛上一條刪除線 */}
                       <div className="absolute inset-0 top-1/2 h-[2px] bg-slate-400 -translate-y-1/2 w-full"></div>
                     </div>
                   )}
                   
                   {/* 轉換箭頭 */}
                   {update.originalStatus && (
                     <ArrowRight className="w-5 h-5 text-amber-300" />
                   )}
                   
                   {/* 變更後的狀態 (清晰搶眼) */}
                   <div className="scale-105 origin-left">
                     {renderStatusBadge(update.status || update.originalStatus)}
                   </div>
                 </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // === 3. 刪除類日誌 (涵蓋 Order, Customer, Product) ===
    if (actionType.startsWith('DELETE_')) {
      const targetType = actionType.replace('DELETE_', '');
      
      // 將艱澀的模組對應成白話文來源
      const sourceName = targetType === 'ORDER' ? '每日訂單' : targetType === 'CUSTOMER' ? '店家名單' : targetType === 'PRODUCT' ? '商品庫存' : '系統資料';
      
      // 優先取用後端傳來的新版明確名稱，若無則降級顯示 ID
      const deletedName = parsedJson.deletedName || parsedJson.deletedId || '未知資料';
      // 如果是訂單，嘗試把日期也串上去
      const deleteDate = parsedJson.deletedDate ? ` (日期: ${parsedJson.deletedDate})` : '';

      return (
        <div className="mt-2 bg-rose-50/80 p-4 rounded-xl border border-rose-200 flex items-start gap-3 shadow-sm">
          {/* 左側放大的警示圖示 */}
          <div className="bg-white p-2 rounded-lg shadow-sm border border-rose-100 flex-shrink-0">
            <span className="text-xl sm:text-2xl">🗑️</span>
          </div>
          
          <div className="flex-1 pt-0.5">
            <p className="text-sm sm:text-base font-bold text-rose-900 leading-relaxed">
              您從【{sourceName}】中<span className="text-rose-600 underline underline-offset-4 decoration-rose-300 mx-1">永久移除</span>了以下資料：
            </p>
            {/* 巨大化的刪除目標，視覺焦點在此 */}
            <p className="text-base sm:text-lg font-bold text-rose-700 mt-1.5 bg-rose-100/50 inline-block px-3 py-1 rounded-lg border border-rose-100">
              「{deletedName}{deleteDate}」
            </p>
            {/* 工程師或查修專用的幽靈 ID */}
            <p className="text-[11px] sm:text-xs text-rose-400 mt-2 font-mono">
              系統代碼：{parsedJson.deletedId || '無'}
            </p>
          </div>
        </div>
      );
    }

    // === 4. 系統設定 ===
    if (actionType === 'UPDATE_SETTINGS' || actionType.startsWith('SYSTEM_')) {
      const data = parsedJson.data || parsedJson || {};
      const fieldDictionary: Record<string, string> = {
        autoOrderEnabled: '自動建單開關',
        defaultHoliday: '預設公休日',
        rules: '提醒與通知規則',
        lineChannelToken: 'LINE 機器人 Token',
        lineUserId: 'LINE 管理員 ID',
        action: '系統操作'
      };

      const changedKeys = Object.keys(data).filter(k => k !== 'ruleId' && k !== 'actionType');
      
      return (
        <div className="mt-2 bg-slate-100/80 p-4 rounded-xl border border-slate-200 flex items-start gap-3 shadow-sm">
          <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-200 flex-shrink-0">
            <span className="text-xl sm:text-2xl">⚙️</span>
          </div>
          <div className="flex-1 pt-0.5">
            <p className="text-sm sm:text-base font-bold text-slate-800">系統設定變更</p>
            {changedKeys.length > 0 ? (
              <div className="mt-2 space-y-1.5 bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                {changedKeys.map(key => {
                  const val = data[key];
                  let displayVal = String(val);
                  if (typeof val === 'boolean') displayVal = val ? '開啟' : '關閉';
                  else if (Array.isArray(val)) displayVal = `共 ${val.length} 筆設定`;
                  else if (typeof val === 'object') displayVal = '內部資料結構';
                  
                  return (
                    <p key={key} className="text-sm text-slate-700 font-medium">
                      ➤ 【<span className="font-bold">{fieldDictionary[key] || key}</span>】被修改為：<span className="text-indigo-600">{displayVal}</span>
                    </p>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-slate-500 mt-1">此操作通常為管理員調整底層配置。若不確定細節請聯絡技術人員。</p>
            )}
          </div>
        </div>
      );
    }

    // === 6. 安全性警告 (核心密碼修改) ===
    if (actionType === 'UPDATE_SECURITY_PASSWORD') {
      const dId = parsedJson.deviceId || '未知設備';
      const uAgent = parsedJson.userAgent || '缺少瀏覽器特徵碼';

      return (
        <div className="mt-2 bg-rose-50/90 p-4 rounded-xl border-2 border-rose-200 shadow-sm relative overflow-hidden">
          {/* 讓背景帶有一點斜線圖騰可以增加警示感，不過單純純色也很有效 */}
          <p className="text-sm sm:text-base font-bold text-rose-800 flex items-center gap-1.5 border-b border-rose-200/60 pb-2">
            <AlertCircle className="w-5 h-5 text-rose-600" />
            <span>系統登入密碼已被重設！</span>
          </p>
          
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-[11px] font-bold text-rose-600/70 mb-0.5">操作裝置永久識別碼 (Device ID)</p>
              <p className="text-xs sm:text-sm font-mono text-rose-900 bg-white px-2 py-1 rounded inline-block border border-rose-100 font-bold select-all">
                {dId}
              </p>
            </div>
            
            <div>
              <p className="text-[11px] font-bold text-rose-600/70 mb-0.5">用戶端環境特徵 (User Agent)</p>
              <p className="text-[10px] text-slate-500 font-mono break-words leading-relaxed bg-white/60 p-2 rounded border border-rose-50">
                {uAgent}
              </p>
            </div>
          </div>

          <p className="text-xs font-bold text-rose-600 mt-3 pt-2 border-t border-rose-200/60">
            ⚠️ 若非授權操作，請立刻通報開發人員並盡速重新更改密碼。
          </p>
        </div>
      );
    }

    // -- [登入異常] 視覺強烈，具有防弊功能 --
    if (actionType === 'SYSTEM_LOGIN_FAILED') {
      return (
        <div className="mt-2 bg-orange-50 p-3 rounded-lg border border-orange-200">
          <p className="text-sm font-bold text-orange-800">⚠️ 發生錯誤的登入嘗試</p>
          <p className="text-xs font-mono text-orange-600 mt-1">裝置 ID: {parsedJson.deviceId}</p>
          <p className="text-xs text-slate-500 mt-1">此設備嘗試使用錯誤的密碼 ({parsedJson.attemptPwd}) 登入系統。</p>
        </div>
      );
    }

    // -- [登入成功] 正常通知 --
    if (actionType === 'SYSTEM_LOGIN_SUCCESS') {
      return (
        <div className="mt-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex items-center gap-2 text-slate-600">
          <span>🔓</span> 
          <div className="text-xs">
            <p><span className="font-bold text-slate-700">新裝置已登入系統</span></p>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{parsedJson.deviceId}</p>
          </div>
        </div>
      );
    }

    // -- [調閱與重整] 視覺弱化，不干擾主線業務日誌 --
    if (actionType === 'SYSTEM_DATA_ACCESS') {
      return (
        <div className="mt-1 opacity-60 hover:opacity-100 transition-opacity">
          <p className="text-[11px] text-slate-400 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />
            <span>裝置 {parsedJson.deviceId?.substring(0, 6)}... 進行了 {parsedJson.method}</span>
          </p>
        </div>
      );
    }

    // -- [未授權存取] 視覺強烈，具有防弊功能 --
    if (actionType === 'SYSTEM_UNAUTHORIZED_ACCESS') {
      return (
        <div className="mt-2 bg-red-50 p-3 rounded-lg border border-red-200">
          <p className="text-sm font-bold text-red-800">🚨 偵測到未授權的 API 調用</p>
          <p className="text-xs text-slate-500 mt-1">某設備未攜帶合法憑證，試圖呼叫：<span className="font-mono text-red-600">{parsedJson.action}</span></p>
          <p className="text-[10px] text-slate-400 mt-1">Token Presence: {String(parsedJson.tokenProvided)}</p>
        </div>
      );
    }

    // === 7. 沒被捕捉到的日誌 (Fallback，留給工程師看) ===
    return (
      <div className="mt-2">
        <p className="text-xs text-slate-400 font-bold mb-1 ml-1 cursor-help" title="長輩不會看這塊，這是發生未定義操作時的工程師除錯區">🕵️ 未知操作原始碼：</p>
        <pre className="bg-slate-800 text-emerald-400 p-3 rounded-xl font-mono text-[10px] sm:text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-inner">
          {JSON.stringify(parsedJson, null, 2)}
        </pre>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4 pb-24">
        {/* Header & Refresh */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-500" />
            操作軌跡
          </h3>
          <button 
            onClick={fetchLogs} 
            disabled={isLoadingLogs}
            className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? 'animate-spin' : ''}`} />
            {isLoadingLogs ? '更新中' : '最新'}
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-[20px] border border-slate-100 shadow-sm flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 ml-1">快速尋找</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  value={searchWord}
                  onChange={e => setSearchWord(e.target.value)}
                  placeholder="搜尋對象、內容..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                />
              </div>
            </div>
            
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 ml-1">時間範圍</label>
              <div className="flex bg-slate-50 p-1 rounded-xl gap-1 border border-slate-200">
                {[{label: '今天', val: 24}, {label: '近 3 天', val: 72}, {label: '近 7 天', val: 168}, {label: '全部', val: 0}].map(time => (
                   <button 
                     key={time.val}
                     onClick={() => setFilterTime(time.val)}
                     className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all ${filterTime === time.val ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                   >
                     {time.label}
                   </button>
                ))}
              </div>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 ml-1">動作分類</label>
              <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                <button 
                  onClick={() => setFilterAction('ALL')}
                  className={`py-1.5 px-3 whitespace-nowrap rounded-lg text-[11px] font-bold transition-all border ${filterAction === 'ALL' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                >
                  全部
                </button>
                <button
                  onClick={() => setFilterAction('CREATE')}
                  className={`py-1.5 px-3 whitespace-nowrap rounded-lg text-[11px] font-bold transition-all border ${filterAction === 'CREATE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-200'}`}
                >
                   新增
                </button>
                <button
                  onClick={() => setFilterAction('UPDATE')}
                  className={`py-1.5 px-3 whitespace-nowrap rounded-lg text-[11px] font-bold transition-all border ${filterAction === 'UPDATE' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-white text-slate-500 border-slate-200 hover:border-amber-200'}`}
                >
                   修改
                </button>
                <button
                  onClick={() => setFilterAction('DELETE')}
                  className={`py-1.5 px-3 whitespace-nowrap rounded-lg text-[11px] font-bold transition-all border ${filterAction === 'DELETE' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-white text-slate-500 border-slate-200 hover:border-rose-200'}`}
                >
                   刪除
                </button>
                <button
                  onClick={() => setFilterAction('SYSTEM')}
                  className={`py-1.5 px-3 whitespace-nowrap rounded-lg text-[11px] font-bold transition-all border ${filterAction === 'SYSTEM' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-200'}`}
                >
                   系統
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Timeline Log Area */}
        {isLoadingLogs && logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-indigo-300 animate-spin mb-3" />
            <p className="text-sm font-semibold text-slate-500">正在讀取操作日誌...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 opacity-60">
            <Activity className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-500">沒有符合條件的操作紀錄</p>
          </div>
        ) : (
          <div className="relative pl-6 space-y-6 before:absolute before:inset-0 before:ml-[1.4rem] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent mt-8">
            <AnimatePresence>
            {filteredLogs.map(log => {
              const styles = getActionStyles(log.actionType);
              const isExpanded = expandedLogId === log.id;
              const parsedJson = parseDetails(log.details);
              
              return (
              <motion.div 
                layout
                key={log.id} 
                initial={{ opacity: 0, scale: 0.95, y: -20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className={`relative flex items-start group`}
              >
                {/* Timeline dot */}
                <div className={`absolute -left-6 bg-white p-1 rounded-full ring-4 ${styles.ring} z-10 shadow-sm border ${styles.border}`}>
                  {styles.icon}
                </div>

                <div className="flex-1 ml-4 bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:border-indigo-100 transition-all text-left w-full">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest ${styles.bg} ${styles.text}`}>
                        {styles.label || log.actionType}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                       <span className="text-slate-400 text-xs font-bold leading-none">
                         {log.timestampStr.split(' ')[1]}
                       </span>
                       <span className="text-slate-300 text-[9px] font-bold tracking-widest uppercase">
                         {log.timestampStr.split(' ')[0]}
                       </span>
                    </div>
                  </div>
                  
                  <h4 className="text-[13px] font-black text-slate-800 mb-1 leading-snug">{log.target}</h4>
                  
                  {/* Content / Details */}
                  {parsedJson ? (
                    <div className="mt-2 text-xs">
                      <button 
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className="flex items-center gap-1 text-indigo-500 font-bold hover:text-indigo-600 transition-colors bg-indigo-50/50 hover:bg-indigo-50 px-2 py-1 rounded-md"
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5"/> : <ChevronDown className="w-3.5 h-3.5"/>}
                        {isExpanded ? '收合詳細資料' : '檢視詳細資料'}
                      </button>
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden mt-2"
                          >
                            {renderHumanReadableDetails(log.actionType, parsedJson)}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 leading-relaxed font-medium bg-slate-50 p-2 rounded-lg mt-2">
                      {log.details.length > 150 ? log.details.substring(0, 150) + '...' : log.details}
                    </div>
                  )}
                </div>
              </motion.div>
            )})}
            </AnimatePresence>
            <div className="pb-8">{/* spacer */}</div>
          </div>
        )}
      </div>
    </div>
  );
}
