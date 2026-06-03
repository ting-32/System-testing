import React, { useEffect, useState, useMemo } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { NotificationLog } from '../types';
import { container } from '../core/di/AppContainer';

const statusTextMap: Record<string, string> = {
  'SUCCESS': '成功',
  'SKIPPED': '已略過',
  'ERROR': '發生錯誤'
};

const sourceTextMap: Record<string, string> = {
  'SYSTEM_CRON': '系統排程',
  'System_Cron': '系統排程',
  'MANUAL_TEST': '手動測試',
  'Manual_Test': '手動測試',
  'UNKNOWN': '未知來源'
};

interface Props {
  apiEndpoint: string;
}

export function NotificationLogViewer({ apiEndpoint }: Props) {
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterRule, setFilterRule] = useState<string>('ALL');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const [filterSource, setFilterSource] = useState<string>('ALL');
  const [filterTime, setFilterTime] = useState<number>(0);

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      container.updateApiEndpoint(apiEndpoint);
      // You can add pagination/limit logic here if LogRepository supports it
      const fetchedLogs = await container.logRepo.getNotificationLogs(100);
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

  const uniqueRules = useMemo(() => {
    const rules = new Set<string>();
    logs.forEach(log => {
      if (log.ruleName) rules.add(log.ruleName);
    });
    return Array.from(rules);
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const now = Date.now();
    return logs.filter(log => {
      if (filterStatus !== 'ALL' && log.status !== filterStatus) return false;
      if (filterRule !== 'ALL' && log.ruleName !== filterRule) return false;
      if (filterSource !== 'ALL' && log.triggerSource !== filterSource && log.triggerSource !== filterSource.toUpperCase()) return false;
      if (filterTime > 0 && (now - log.timestamp) > filterTime * 60 * 60 * 1000) return false;
      return true;
    });
  }, [logs, filterStatus, filterRule, filterSource, filterTime]);

  const toggleExpand = (id: string) => {
    setExpandedLogId(prev => (prev === id ? null : id));
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return { color: 'bg-emerald-100 text-emerald-600', border: 'border-emerald-200', icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" /> };
      case 'SKIPPED':
        return { color: 'bg-slate-100 text-slate-500', border: 'border-slate-200', icon: <Clock className="w-5 h-5 text-slate-400" /> };
      case 'ERROR':
        return { color: 'bg-rose-100 text-rose-600', border: 'border-rose-200', icon: <XCircle className="w-5 h-5 text-rose-500" /> };
      default:
        return { color: 'bg-gray-100 text-gray-600', border: 'border-gray-200', icon: <AlertCircle className="w-5 h-5 text-gray-500" /> };
    }
  };

  const formatTimestamp = (ts: number) => {
    return new Intl.DateTimeFormat('zh-TW', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(new Date(ts));
  };

  const renderDetails = (log: NotificationLog) => {
    const details = log.details || {};
    
    // Human readable presentation logic based on details keys (e.g., customersMatched, customersEvaluated, reason, recipients, etc.)
    return (
      <div className="text-sm text-slate-700 bg-white p-3 rounded-xl border border-slate-100 shadow-sm mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
        <h4 className="font-semibold mb-2 text-slate-800">執行詳情</h4>
        {log.status === 'SKIPPED' && (
          <p className="mb-2"><span className="font-semibold text-amber-600">略過原因：</span> {details.reason || '無詳細原因'}</p>
        )}
        {log.status === 'SUCCESS' && (
          <p className="mb-2"><span className="font-semibold text-emerald-600">成功發送：</span> 傳送給 {details.recipients || '不明'}</p>
        )}
        {log.status === 'ERROR' && (
          <p className="mb-2"><span className="font-semibold text-rose-600">發生錯誤：</span> {details.Error || '不明原因'}</p>
        )}
        {details.customersEvaluated !== undefined && (
          <p className="mb-1 text-slate-600">名單篩選：共 <span className="font-medium">{details.customersEvaluated}</span> 間店營業中。</p>
        )}
        {details.customersMatched !== undefined && (
          <p className="mb-1 text-slate-600">條件判定：共 <span className="font-medium">{details.customersMatched}</span> 家符合條件。</p>
        )}
        {(details.targetDatesText || details.currentHour !== undefined) && (
           <p className="mb-1 text-[13px] text-slate-500 mt-2 p-2 bg-slate-50 rounded-lg">
             系統診斷變數：
             {details.targetDatesText && <span className="block mt-1">目標配送日 - {details.targetDatesText}</span>}
             {details.currentHour !== undefined && <span className="block">當前時段 - {details.currentHour} 點</span>}
           </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 rounded-2xl border border-slate-100 shadow-sm gap-4 sm:gap-0">
        <div>
          <h3 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
            <AlertCircle className="w-5 h-5 text-indigo-500" />
            執行日誌 (Activity Logs)
          </h3>
          <p className="text-sm text-slate-500 mt-1">追蹤提醒機制的執行軌跡與過濾原因</p>
        </div>
        <button 
          onClick={fetchLogs}
          disabled={isLoadingLogs}
          className="shrink-0 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-semibold hover:bg-indigo-100 transition-colors disabled:opacity-50"
        >
          {isLoadingLogs ? '更新中...' : '重新整理'}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 ml-1">狀態篩選</label>
            <div className="flex bg-slate-50 p-1 rounded-xl gap-1">
              {['ALL', 'SUCCESS', 'SKIPPED', 'ERROR'].map(status => (
                 <button 
                   key={status}
                   onClick={() => setFilterStatus(status)}
                   className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${filterStatus === status ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                 >
                   {status === 'ALL' ? '全部' : status === 'SUCCESS' ? '✅ 成功' : status === 'SKIPPED' ? '⏳ 略過' : '❌ 失敗'}
                 </button>
              ))}
            </div>
          </div>
          
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 ml-1">時間篩選</label>
            <div className="flex bg-slate-50 p-1 rounded-xl gap-1">
              {[{label: '全部時間', val: 0}, {label: '近12小時', val: 12}, {label: '近1天', val: 24}, {label: '近7天', val: 168}].map(time => (
                 <button 
                   key={time.val}
                   onClick={() => setFilterTime(time.val)}
                   className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${filterTime === time.val ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                 >
                   {time.label}
                 </button>
              ))}
            </div>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 ml-1">來源篩選</label>
            <div className="flex bg-slate-50 p-1 rounded-xl gap-1">
              {[{label: '全部來源', val: 'ALL'}, {label: '系統排程', val: 'SYSTEM_CRON'}, {label: '手動測試', val: 'MANUAL_TEST'}].map(src => (
                 <button 
                   key={src.val}
                   onClick={() => setFilterSource(src.val)}
                   className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${filterSource === src.val ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                 >
                   {src.label}
                 </button>
              ))}
            </div>
          </div>

          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 ml-1">規則篩選</label>
            <select 
              value={filterRule}
              onChange={(e) => setFilterRule(e.target.value)}
              className="w-full bg-slate-50 border-0 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-100 appearance-none outline-none"
            >
              <option value="ALL">所有規則</option>
              {uniqueRules.map(rule => (
                <option key={rule} value={rule}>{rule}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      
      {/* Log List (Timeline / Cards) */}
      <div className="space-y-3">
        {isLoadingLogs && logs.length === 0 ? (
          // Skeleton Loader
          Array.from({ length: 3 }).map((_, i) => (
             <div key={i} className="animate-pulse bg-white p-4 rounded-2xl border border-slate-100 flex items-start gap-4 h-24">
               <div className="w-10 h-10 bg-slate-100 rounded-full shrink-0"></div>
               <div className="space-y-2 w-full pt-1">
                 <div className="h-4 bg-slate-100 rounded w-1/3"></div>
                 <div className="h-3 bg-slate-50 rounded w-1/2"></div>
               </div>
             </div>
          ))
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-100 border-dashed text-slate-400">
             <Clock className="w-10 h-10 mx-auto text-slate-300 mb-2" />
             <p className="font-semibold">尚無符合條件的日誌</p>
             <p className="text-sm mt-1 text-slate-400">點擊「馬上測試」即可產生測試軌跡。</p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isExpanded = expandedLogId === log.id;
            const config = getStatusConfig(log.status);
            
            return (
              <div 
                key={log.id} 
                className={`flex flex-col bg-white rounded-2xl border ${config.border} hover:shadow-md transition-all pt-1 pl-1`}
              >
                 <div 
                   className="flex items-start gap-3 p-3 cursor-pointer group"
                   onClick={() => toggleExpand(log.id)}
                 >
                    <div className="mt-0.5 shrink-0">
                      {config.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                       <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-800 truncate">{log.ruleName || log.ruleId}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${config.color} shrink-0`}>
                              {statusTextMap[log.status] || log.status}
                            </span>
                            <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full text-slate-500 flex items-center font-mono">
                               {sourceTextMap[log.triggerSource] || log.triggerSource}
                            </span>
                          </div>
                          
                          <div className="text-xs font-mono text-slate-400 font-semibold shrink-0 flex items-center gap-1.5">
                             <Clock className="w-3.5 h-3.5" />
                             {formatTimestamp(log.timestamp)}
                          </div>
                       </div>
                       
                       <p className="text-sm text-slate-500 mt-1 line-clamp-1 group-hover:text-slate-700 transition-colors">
                         {log.status === 'SKIPPED' ? log.details?.reason || '因條件未達成略過' : log.status === 'SUCCESS' ? `成功發送至 ${log.details?.recipients || '不明'}` : '執行失敗'}
                       </p>
                    </div>
                    
                    <div className="shrink-0 pt-2 text-slate-300 group-hover:text-slate-500 transition-colors">
                      {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                    </div>
                 </div>
                 
                 {isExpanded && (
                   <div className="px-4 pb-4 pl-11">
                     {renderDetails(log)}
                   </div>
                 )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
