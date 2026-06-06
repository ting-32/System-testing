import React, { useEffect, useState, useMemo } from 'react';
import { Search, RefreshCw, Activity, PlusCircle, Edit2, Trash2, Settings, ExternalLink, ArrowRight, AlertCircle } from 'lucide-react';
import { SystemLog } from '../types';
import { container } from '../core/di/AppContainer';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  apiEndpoint: string;
}

// 欄位名稱對照表
const fieldNameDictionary: Record<string, string> = {
  id: "系統編號",
  customerName: "客戶名稱",
  items: "訂購品項",
  status: "訂單狀態",
  deliveryMethod: "配送方式",
  date: "指定日期",
  trip: "車趟",
  quantity: "數量",
  price: "單價",
  name: "品名",
  note: "備註",
  version: "版本號",
  syncStatus: "同步狀態",
  originalVersion: "原始版本號",
  // 針對狀態值的對照
  PENDING: "待處理",
  PROCESSING: "處理中",
  COMPLETED: "已完成",
  DELETED: "已刪除",
  CANCELLED: "已取消",
  // 針對交貨方式的對照
  DELIVERY: "送貨",
  PICKUP: "自取"
};

const actionDictionary: Record<string, string> = {
  'CREATE_ORDER': '建立訂單',
  'CREATE_PRODUCT': '建立產品',
  'CREATE_CUSTOMER': '建立客戶',
  'UPDATE_ORDER': '更新訂單',
  'UPDATE_PRODUCT': '更新產品',
  'UPDATE_CUSTOMER': '更新客戶',
  'BATCH_UPDATE_ORDERS': '批次更新',
  'DELETE_ORDER': '刪除訂單',
  'DELETE_PRODUCT': '刪除產品',
  'DELETE_CUSTOMER': '刪除客戶',
  'SYSTEM_SYNC': '系統同步',
  'FORCE_OVERRIDE': '強制覆蓋',
  'LOGIN': '系統登入',
  'SYSTEM_ERROR': '系統異常',
  'SYSTEM_WARNING': '系統警告',
  'NETWORK_ERROR': '網路異常',
  'CONSOLE_ERROR': '控制台異常'
};

const getRelativeTimeText = (timestamp: number) => {
  const diffInMinutes = Math.floor((Date.now() - timestamp) / (1000 * 60));
  if (diffInMinutes < 1) return '剛剛';
  if (diffInMinutes < 60) return `${diffInMinutes} 分鐘前`;
  if (diffInMinutes < 24 * 60) return `${Math.floor(diffInMinutes / 60)} 小時前`;
  return null; // 超過 24 小時就不顯示相對時間
};

const translateKey = (key: string) => fieldNameDictionary[key] || key;
const translateAction = (action: string) => actionDictionary[action] || action;
const translateValue = (value: any): string => {
  if (value === null || value === undefined || value === '') return "無";
  if (typeof value === 'boolean') return value ? "是" : "否";
  if (typeof value === 'string' && fieldNameDictionary[value]) return fieldNameDictionary[value];
  if (Array.isArray(value)) {
    return value.map(item => {
      if (typeof item === 'object' && item !== null) {
         if (item.name && item.quantity) return `${item.name} x${item.quantity}`;
         if (item.name && item.qty) return `${item.name} x${item.qty}`;
         if (item.name) return item.name;
         return '1 項資料';
      }
      return item;
    }).join(', ');
  }
  if (typeof value === 'object' && value !== null) {
      if (value.name) return value.name;
      return '[複雜資料]';
  }
  return String(value);
};

const renderValue = (key: string, value: any, isOld: boolean = false) => {
  const translatedValue = translateValue(value);
  if (key === 'status') {
    if (value === 'PENDING') {
      return <span className={`px-2 py-1 rounded-md text-[12px] font-bold bg-amber-100 text-amber-700 ${isOld ? 'opacity-60 line-through' : 'shadow-sm'}`}>{translatedValue}</span>;
    }
    if (value === 'PROCESSING') {
      return <span className={`px-2 py-1 rounded-md text-[12px] font-bold bg-blue-100 text-blue-700 ${isOld ? 'opacity-60 line-through' : 'shadow-sm'}`}>{translatedValue}</span>;
    }
    if (value === 'COMPLETED') {
      return <span className={`px-2 py-1 rounded-md text-[12px] font-bold bg-emerald-100 text-emerald-700 ${isOld ? 'opacity-60 line-through' : 'shadow-sm'}`}>{translatedValue}</span>;
    }
    if (value === 'CANCELLED' || value === 'DELETED') {
       return <span className={`px-2 py-1 rounded-md text-[12px] font-bold bg-rose-100 text-rose-700 ${isOld ? 'opacity-60 line-through' : 'shadow-sm'}`}>{translatedValue}</span>;
    }
  }
  if (isOld) {
    return <span className="text-slate-400 line-through text-[13px]">{translatedValue}</span>;
  }
  return <span className="text-emerald-600 text-[13px] font-black">{translatedValue}</span>;
};

export function SystemLogViewer({ apiEndpoint }: Props) {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [filterTime, setFilterTime] = useState<number>(0);
  const [searchWord, setSearchWord] = useState<string>('');
  const [showErrorsOnly, setShowErrorsOnly] = useState<boolean>(false);
  
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      container.updateApiEndpoint(apiEndpoint);
      const fetchedLogs = await container.logRepo.getSystemLogs(200);
      setLogs(fetchedLogs);
    } catch (e) {
      console.error("Failed to fetch logs", e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (apiEndpoint) {
      fetchLogs();
    }
  }, [apiEndpoint]);

  const filteredLogs = useMemo(() => {
    const now = Date.now();
    return logs.filter(log => {
      if (showErrorsOnly && !log.actionType.includes('ERROR') && !log.actionType.includes('WARNING')) return false;
      if (filterAction !== 'ALL' && !log.actionType.startsWith(filterAction)) return false;
      if (filterTime > 0 && (now - log.timestamp) > filterTime * 60 * 60 * 1000) return false;
      if (searchWord && !log.target.toLowerCase().includes(searchWord.toLowerCase()) && !log.details.toLowerCase().includes(searchWord.toLowerCase())) return false;
      return true;
    });
  }, [logs, filterAction, filterTime, searchWord]);

  const getDateGroupKey = (timestampStr: string) => {
    const dateObj = new Date(timestampStr.replace(/-/g, '/'));
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
  
    const dateString = timestampStr.split(' ')[0];
    const isToday = dateObj.toDateString() === today.toDateString();
    const isYesterday = dateObj.toDateString() === yesterday.toDateString();
  
    if (isToday) return `🌞 今天 (${dateObj.getMonth() + 1}/${dateObj.getDate()})`;
    if (isYesterday) return `📅 昨天 (${dateObj.getMonth() + 1}/${dateObj.getDate()})`;
    return `🗓️ ${dateString}`;
  };

  const groupedLogs = useMemo(() => {
    return filteredLogs.reduce((groups, log) => {
      const groupKey = getDateGroupKey(log.timestampStr);
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(log);
      return groups;
    }, {} as Record<string, SystemLog[]>);
  }, [filteredLogs]);
  
  const getActionStyles = (actionType: string) => {
    if (actionType.startsWith('CREATE')) {
      return {
        icon: <PlusCircle className="w-5 h-5 text-emerald-500" />,
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        ring: 'ring-emerald-100',
      };
    }
    if (actionType.startsWith('UPDATE')) {
      return {
        icon: <Edit2 className="w-5 h-5 text-amber-500" />,
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
        ring: 'ring-amber-100',
      };
    }
    if (actionType.startsWith('DELETE')) {
      return {
        icon: <Trash2 className="w-5 h-5 text-rose-500" />,
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        border: 'border-rose-200',
        ring: 'ring-rose-100',
      };
    }
    if (actionType.includes('ERROR') || actionType.includes('WARNING')) {
       return {
        icon: <AlertCircle className="w-5 h-5 text-white" />,
        bg: 'bg-rose-600',
        text: 'text-white',
        border: 'border-rose-800',
        ring: 'ring-rose-200',
      };
    }
    return {
      icon: <Settings className="w-5 h-5 text-indigo-500" />,
      bg: 'bg-indigo-50',
      text: 'text-indigo-700',
      border: 'border-indigo-200',
      ring: 'ring-indigo-100',
    };
  };

  const parseDetails = (details: string) => {
    try {
      return JSON.parse(details);
    } catch {
      return null;
    }
  };

  const getSmartSummary = (data: any, actionType: string) => {
    if (actionType === 'FORCE_OVERRIDE') return '⚠️ 警告：系統進行了強制資料覆蓋';
    if (actionType.includes('ERROR')) return `系統崩潰：${data?.errorMessage || '未知錯誤'}`;
    if (actionType.includes('WARNING')) return `系統警告：${data?.errorMessage || '未知警告'}`;

    if (!data || typeof data !== 'object') {
       if (actionType.startsWith('UPDATE')) return '摘要：變更了訂單細節';
       if (actionType.startsWith('DELETE')) return '⚠️ 警告：此筆資料已被徹底刪除';
       return null;
    }
    if (actionType === 'BATCH_UPDATE_ORDERS') return `摘要：同時更新 ${data.updates?.length || 0} 筆紀錄`;
    
    const summaries: string[] = [];
    if (data.status) {
      if (data.status.new) {
        summaries.push(`狀態變更為 ${translateValue(data.status.new)}`);
      } else {
        summaries.push(`狀態：${translateValue(data.status)}`);
      }
    } else if (data.quantity) {
      if (data.quantity.new) {
        summaries.push(`數量變更為 ${data.quantity.new}`);
      } else {
        summaries.push(`數量：${data.quantity}`);
      }
    } else if (data.price) {
       if (data.price.new) {
          summaries.push(`單價變更為 ${data.price.new}`);
       } else {
          summaries.push(`單價：${data.price}`);
       }
    } else if (data.customerName) {
       summaries.push(`客戶：${translateValue(data.customerName)}`);
    } else if (data.name) {
      summaries.push(`品名：${translateValue(data.name)}`);
    }
    
    if (summaries.length > 0) return `摘要：${summaries.join('、')}`;
    
    // Default fallbacks if data exists but didn't match specific keys
    if (actionType.startsWith('UPDATE')) return '摘要：變更了訂單細節';
    if (actionType.startsWith('DELETE')) return '⚠️ 警告：此筆資料已被徹底刪除';
    
    return null;
  };

  const renderLogDetails = (logContextData: any, actionType: string) => {
    if (!logContextData || typeof logContextData !== 'object') return null;

    if (actionType.includes('ERROR') || actionType.includes('WARNING')) {
      return (
        <div className="mt-2 bg-slate-900 rounded-xl overflow-hidden border border-slate-800 shadow-sm text-slate-300 relative group">
           <div className="flex justify-between items-center bg-slate-800 px-3 py-1.5 border-b border-slate-700">
             <span className="text-[10px] font-mono text-slate-400">Error Payload</span>
             <button 
               onClick={() => {
                 navigator.clipboard.writeText(JSON.stringify(logContextData, null, 2));
                 alert('已複製報錯詳細內容');
               }}
               className="text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-0.5 rounded transition-colors"
             >
               複製內容
             </button>
           </div>
           <div className="p-3 overflow-x-auto custom-scrollbar">
              <pre className="text-[11px] font-mono leading-relaxed max-w-full">
                {JSON.stringify(logContextData, null, 2)}
              </pre>
           </div>
        </div>
      );
    }
  
    if (actionType === 'BATCH_UPDATE_ORDERS' && logContextData.updates) {
       return (
         <div className="mt-2 bg-slate-50 rounded-xl border border-slate-200 flex flex-col p-4 gap-2">
            <div className="text-sm font-medium text-slate-700">
              已批次更新 <strong className="text-indigo-600">{logContextData.updates.length || 0}</strong> 筆訂單：
            </div>
            <div className="max-h-40 overflow-y-auto custom-scrollbar flex flex-col gap-1.5 mt-2">
              {logContextData.updates.map((upd: any, idx: number) => (
                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between text-xs bg-white border border-slate-100 p-2 rounded-lg shadow-sm">
                  <span className="font-mono text-slate-500">{upd.id?.substring(0,8) || upd.id}</span>
                  <span className="font-semibold text-slate-700">{translateValue(upd.status)}</span>
                </div>
              ))}
            </div>
         </div>
       );
    }
  
    const ignoreKeys = ['version', 'originalVersion', 'syncStatus', 'timestamp', 'id', 'source', 'type'];
    
    const formattedItems = Object.entries(logContextData)
      .filter(([key]) => !ignoreKeys.includes(key))
      .map(([key, value]) => {
        const zhKey = translateKey(key);
        const isNullOrEmpty = value === null || value === undefined || value === '';
        
        if (typeof value === 'object' && value !== null && 'old' in value && 'new' in value) {
           return (
             <div key={key} className="flex flex-col p-2 bg-white rounded-lg border border-slate-100 shadow-sm">
               <span className="text-[11px] text-slate-400 font-bold mb-1">{zhKey}</span>
               <div className="flex items-center gap-2 font-medium">
                 {renderValue(key, value.old, true)}
                 <ArrowRight className="w-4 h-4 text-slate-300" />
                 {renderValue(key, value.new, false)}
               </div>
             </div>
           );
        }
  
        return (
          <div key={key} className="flex flex-col p-2 bg-white rounded-lg border border-slate-100 shadow-sm">
            <span className="text-[11px] text-slate-400 font-bold mb-1">{zhKey}</span>
            <span className={`break-all font-medium text-[13px] ${isNullOrEmpty ? 'text-slate-400' : 'text-slate-800'}`}>
               {key === 'status' ? renderValue(key, value, false) : translateValue(value)}
            </span>
          </div>
        );
      });
  
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 text-slate-700 p-3 rounded-xl mt-2">
         {formattedItems.length > 0 ? formattedItems : <span className="text-slate-400 text-xs py-2 col-span-full">無詳細內容或僅變更系統欄位</span>}
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

          <div className="flex border-t border-slate-100 pt-3 mt-1">
             <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={showErrorsOnly} 
                  onChange={(e) => setShowErrorsOnly(e.target.checked)} 
                  className="w-4 h-4 rounded text-rose-500 border-slate-300 focus:ring-rose-500"
                />
                <span className="text-xs font-bold text-slate-700">🚨 僅顯示異常與系統錯誤</span>
             </label>
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
          <div className="mt-8">
            {(Object.entries(groupedLogs) as [string, SystemLog[]][]).map(([dateLabel, logsInDate]) => (
              <div key={dateLabel} className="mb-10 relative">
                
                {/* --- 第一層：日期標籤 (錨點) --- */}
                <div className="sticky top-0 z-10 flex items-center gap-3 bg-slate-50/90 backdrop-blur-sm py-3 mb-4 -mx-4 px-4">
                  <span className="bg-white text-slate-600 shadow-sm text-[13px] font-extrabold px-3.5 py-1.5 rounded-full border border-slate-200">
                    {dateLabel}
                  </span>
                  <div className="h-px bg-slate-200/60 flex-1"></div>
                </div>
          
                {/* --- 第二層：該日期內的代辦事項 --- */}
                <div className="relative pl-6 space-y-6 before:absolute before:inset-y-0 before:-translate-x-px before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                  {logsInDate.map(log => {
                    const styles = getActionStyles(log.actionType);
                    const isExpanded = expandedLogId === log.id;
                    const parsedJson = parseDetails(log.details);
                    const summary = getSmartSummary(parsedJson, log.actionType);
                    const hasDataId = parsedJson && parsedJson.id;
                    const relativeTime = getRelativeTimeText(log.timestamp);
                    const isDestructive = log.actionType.startsWith('DELETE') || log.actionType.includes('FORCE_OVERRIDE') || log.actionType.includes('ERROR') || log.actionType.includes('WARNING');
                    
                    return (
                      <motion.div 
                        key={log.id} 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`relative flex items-start group`}
                      >
                        {/* Timeline dot */}
                        <div className={`absolute -left-6 bg-white p-1 rounded-full ring-4 ${styles.ring} z-10 shadow-sm border ${styles.border}`}>
                          {styles.icon}
                        </div>
          
                        <div className={`flex-1 ml-4 rounded-2xl p-4 shadow-sm transition-all text-left w-full border ${isDestructive ? 'bg-rose-50 border-rose-200 hover:border-rose-300' : 'bg-white border-slate-100 hover:border-indigo-100'}`}>
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              {/* Left Badge */}
                              <div className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-black tracking-widest ${styles.bg} ${styles.text}`}>
                                {translateAction(log.actionType)}
                              </div>
                            </div>
                            
                            {/* Right Time Area */}
                            <div 
                              className="flex flex-col items-end gap-0.5 cursor-default" 
                              title={`精確時間：${log.timestampStr}`}
                            >
                              <span className="text-slate-600 text-[13px] font-black tracking-wider leading-none">
                                 {log.timestampStr.split(' ')[1]} 
                              </span>
                              {relativeTime && (
                                 <span className="text-indigo-500 text-[10px] bg-indigo-50 px-1.5 py-0.5 rounded pl-1.5 pr-1.5 font-bold tracking-widest mt-1">
                                   {relativeTime}
                                 </span>
                              )}
                            </div>
                          </div>
                          
                          <h4 className="text-[13px] font-black text-slate-800 mb-1 leading-snug">{log.target}</h4>
                          
                          {/* Content / Details */}
                          {parsedJson ? (
                            <div className="mt-2 text-xs">
                              {!isExpanded && summary && (
                                <div className="flex items-center mt-1 space-x-2 mb-2">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                                    isDestructive 
                                      ? 'bg-rose-100 text-rose-700 border-rose-200' 
                                      : 'bg-slate-100 text-slate-600 border-slate-200'
                                  }`}>
                                     {isDestructive ? '' : '📝'} {summary}
                                  </span>
                                </div>
                              )}
                              
                              <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                                <div className="flex items-center gap-3">
                                  <button 
                                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                                    className={`text-[11px] underline underline-offset-2 font-bold transition-colors ${
                                      isDestructive 
                                        ? 'text-rose-600 hover:text-rose-800' 
                                        : 'text-indigo-500 hover:text-indigo-700'
                                    }`}
                                  >
                                    {isExpanded ? '收合完整資料' : '檢視完整資料'}
                                  </button>
                                  
                                  {/* Quick Jump Button */}
                                  {hasDataId && !log.actionType.startsWith('DELETE') && (
                                    <button 
                                      onClick={() => {
                                        alert(`即將跳轉並尋找該單據: ${hasDataId}\n(實際整合時可控制最外層的 ActiveTab)`);
                                      }}
                                      className="flex items-center gap-1 text-slate-500 font-bold hover:text-indigo-600 transition-colors bg-white hover:bg-slate-50 px-2 py-1 rounded shadow-sm border border-slate-200"
                                      title="在列表中尋找此項目"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      追蹤單據
                                    </button>
                                  )}
                                </div>
                              </div>
        
                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden mt-1"
                                  >
                                    {isDestructive && (!log.actionType.includes('ERROR') && !log.actionType.includes('WARNING')) && (
                                      <div className="mb-3 mt-2 p-2 bg-rose-100 text-rose-800 text-xs font-bold rounded flex items-center gap-1">
                                        <AlertCircle className="w-4 h-4"/> 警告：此操作已拋棄或永久移除部分業務資料
                                      </div>
                                    )}
                                    {renderLogDetails(parsedJson, log.actionType)}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          ) : (
                            <div className="text-sm text-slate-500 mt-2">
                               {summary ? (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                                    isDestructive 
                                      ? 'bg-rose-100 text-rose-700 border-rose-200' 
                                      : 'bg-slate-100 text-slate-600 border-slate-200'
                                  }`}>
                                    {isDestructive ? '' : '📝'} {summary}
                                  </span>
                               ) : (
                                  <span className="text-xs bg-slate-50 p-2 rounded-lg block">
                                    {log.details.length > 150 ? log.details.substring(0, 150) + '...' : log.details}
                                  </span>
                               )}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            ))}
            <div className="pb-8">{/* spacer */}</div>
          </div>
        )}
      </div>
    </div>
  );
}

