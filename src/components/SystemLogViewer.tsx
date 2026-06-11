import React, { useEffect, useState, useMemo } from 'react';
import { Search, RefreshCw, Activity, PlusCircle, Edit2, Trash2, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { SystemLog } from '../types';
import { container } from '../core/di/AppContainer';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  apiEndpoint: string;
}

export function SystemLogViewer({ apiEndpoint }: Props) {
  const [logs, setLogs] = useState<SystemLog[]>([]);
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
            {filteredLogs.map(log => {
              const styles = getActionStyles(log.actionType);
              const isExpanded = expandedLogId === log.id;
              const parsedJson = parseDetails(log.details);
              
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

                <div className="flex-1 ml-4 bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:border-indigo-100 transition-all text-left w-full">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest ${styles.bg} ${styles.text}`}>
                        {log.actionType}
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
                            <pre className="bg-slate-800 text-emerald-400 p-3 rounded-xl font-mono text-[10px] sm:text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-inner">
                              {JSON.stringify(parsedJson, null, 2)}
                            </pre>
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
            <div className="pb-8">{/* spacer */}</div>
          </div>
        )}
      </div>
    </div>
  );
}
