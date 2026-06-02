import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, CheckCircle2, Clock, AlertTriangle, ArrowRight, Calendar } from 'lucide-react';
import { ReminderRule } from '../types';

function calculateNextRuns(schedule: string | string[], timeToNotify: string, count = 3): Date[] {
  const nextRuns: Date[] = [];
  const now = new Date();
  
  // 解析設定的時間 (例如 '19:00')
  const [targetHour, targetMinute] = (timeToNotify || '00:00').split(':').map(Number);

  // 往未來的 30 天內進行尋找，找到滿 3 個為止
  for (let i = 0; i < 30; i++) {
    if (nextRuns.length >= count) break;

    const checkDate = new Date();
    checkDate.setDate(now.getDate() + i);
    checkDate.setHours(targetHour, targetMinute, 0, 0);

    // 如果是今天，且約定時間已經過了，就跳過今天
    if (i === 0 && checkDate.getTime() <= now.getTime()) {
      continue;
    }

    const dayNumStr = String(checkDate.getDay());
    let isMatch = false;

    // 比對星期條件
    if (Array.isArray(schedule)) {
      isMatch = schedule.includes(dayNumStr);
    } else if (schedule === '每天') {
      isMatch = true;
    } else {
      isMatch = schedule === dayNumStr;
    }

    if (isMatch) {
      nextRuns.push(checkDate);
    }
  }

  return nextRuns;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  result: any;
  onRealSend: () => void;
  rule?: ReminderRule;
}

export function DiagnosticFunnelModal({ isOpen, onClose, isLoading, result, onRealSend, rule }: Props) {
  if (!isOpen) return null;

  const renderStepIcon = (isActive: boolean, isError: boolean = false) => {
    if (isError) return <AlertTriangle className="w-5 h-5 text-rose-500" />;
    return isActive ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Clock className="w-5 h-5 text-slate-300" />;
  };

  const getStepStatus = (stepIndex: number) => {
    if (!result || !result.length) return 'pending';
    const trace = result[0]?.details || {};
    const status = result[0]?.status;

    if (stepIndex === 1) { // 排程與週期
      // if we failed here, it would be SKIPPED with reason related to time
      if (status === 'SKIPPED' && trace.reason?.includes('時間')) return 'error';
      return 'success';
    }
    
    if (stepIndex === 2) { // 活躍對象過濾
      if (status === 'SKIPPED' && trace.reason?.includes('休假')) return 'error';
      if (trace.customersEvaluated !== undefined) return 'success';
      return 'pending'; 
    }
    
    if (stepIndex === 3) { // 條件配對
      if (status === 'SKIPPED' && trace.reason?.includes('未達成')) return 'error';
      if (status === 'SUCCESS' || trace.customersMatched !== undefined) return 'success';
      return 'pending';
    }

    return 'pending';
  };

  const trace = result && result.length > 0 ? result[0].details : {};
  const status = result && result.length > 0 ? result[0].status : null;
  const skipReason = trace?.reason;

  const nextRuns = rule ? calculateNextRuns(rule.schedule, rule.timeToNotify) : [];
  const shortDays = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 flex flex-col"
        >
          {/* Header */}
          <div className="flex justify-between items-center p-5 border-b border-slate-100">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-indigo-500" />
              時空推演診斷
            </h2>
            <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6">
            {rule && (
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 mb-4">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                  <Calendar className="w-4 h-4 text-indigo-500" />
                  未來 3 次提醒排程預報
                </h4>
                <div className="space-y-1.5 pl-5">
                  {nextRuns.length > 0 ? nextRuns.map((d, idx) => (
                    <div key={idx} className="text-sm font-medium text-slate-700 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                      {`${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`}
                      <span className="text-slate-400 font-normal">({shortDays[d.getDay()]})</span>
                      <span className="text-indigo-600 font-bold ml-1">{rule.timeToNotify}</span>
                    </div>
                  )) : (
                    <div className="text-sm font-medium text-slate-500">無可預測的排程</div>
                  )}
                </div>
              </div>
            )}

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-4">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
                <p className="text-slate-600 font-medium">正在進行時空推演邏輯...</p>
              </div>
            ) : result ? (
              <div className="space-y-6">
                {/* Timeline */}
                <div className="relative border-l-2 border-slate-100 ml-4 pl-6 space-y-8">
                  {/* Step 1 */}
                  <div className="relative">
                    <div className="absolute -left-[35px] top-0 bg-white p-1">
                      {renderStepIcon(getStepStatus(1) === 'success', getStepStatus(1) === 'error')}
                    </div>
                    <h4 className="font-bold text-slate-800">Step 1: 排程與週期驗證</h4>
                    <p className={`text-sm mt-1 ${getStepStatus(1) === 'error' ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>
                      {getStepStatus(1) === 'error' ? skipReason : '✅ 通過排程檢查'}
                    </p>
                  </div>

                  {/* Step 2 */}
                  <div className="relative">
                    <div className="absolute -left-[35px] top-0 bg-white p-1">
                      {renderStepIcon(getStepStatus(2) === 'success', getStepStatus(2) === 'error')}
                    </div>
                    <h4 className={`font-bold ${getStepStatus(2) === 'pending' ? 'text-slate-400' : 'text-slate-800'}`}>Step 2: 活躍對象過濾</h4>
                    <p className={`text-sm mt-1 ${getStepStatus(2) === 'error' ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>
                      {getStepStatus(2) === 'pending' ? '尚未執行' :
                       getStepStatus(2) === 'error' ? skipReason :
                       `評估了 ${trace.customersEvaluated || 0} 位客戶`}
                    </p>
                  </div>

                  {/* Step 3 */}
                  <div className="relative">
                    <div className="absolute -left-[35px] top-0 bg-white p-1">
                      {renderStepIcon(getStepStatus(3) === 'success', getStepStatus(3) === 'error')}
                    </div>
                    <h4 className={`font-bold ${getStepStatus(3) === 'pending' ? 'text-slate-400' : 'text-slate-800'}`}>Step 3: 條件邏輯配對</h4>
                    <p className={`text-sm mt-1 ${getStepStatus(3) === 'error' ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>
                      {getStepStatus(3) === 'pending' ? '尚未執行' :
                       getStepStatus(3) === 'error' ? skipReason :
                       `找到符合條件名單共 ${trace.customersMatched || 0} 間店`}
                    </p>
                  </div>
                </div>

                {/* Result Box */}
                <div className={`mt-6 p-4 rounded-xl border-l-4 ${status === 'SUCCESS' ? 'bg-emerald-50 border-emerald-500' : 'bg-slate-50 border-slate-400'}`}>
                  <h4 className={`font-bold text-lg flex items-center gap-2 ${status === 'SUCCESS' ? 'text-emerald-700' : 'text-slate-700'}`}>
                    {status === 'SUCCESS' ? '診斷結果：可觸發發送' : '診斷結果：將安靜略過'}
                  </h4>
                  <p className="text-sm mt-2 text-slate-600">
                    {status === 'SUCCESS' 
                      ? '條件已完全符合！如果這是一次真實的排程檢查，系統將發送提醒給目標客戶。' 
                      : '根據目前的設定與環境變數，系統判斷此刻無需發送提醒。'}
                  </p>
                </div>
              </div>
            ) : (
               <div className="py-10 text-center text-slate-500">無結果</div>
            )}
          </div>
          
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-2">
             {status === 'SUCCESS' && (
                <button 
                  onClick={onRealSend}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm transition-colors"
                >
                  <ArrowRight className="w-5 h-5" />
                  確認：執行真實發送
                </button>
             )}
             <button 
               onClick={onClose}
               className="w-full py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl transition-colors"
             >
               關閉推演
             </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
