import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, DollarSign, CheckCircle2, ListChecks, Calendar, History, MoreVertical } from 'lucide-react';

interface FinanceViewProps {
  financeData: any;
  setSettlementTarget: (name: string) => void;
  setViewingCustomerReport: (name: string) => void;
  setActionMenuTarget: (target: any) => void;
  setPartialSettlementTarget: (target: any) => void;
  setSelectedPartialOrderIds: (ids: Set<string>) => void;
}

const containerVariants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const itemVariants = { hidden: { opacity: 0, scale: 0.98, y: 10 }, show: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } } };
const buttonTap = { scale: 0.95 };

export const FinanceView: React.FC<FinanceViewProps> = ({ 
  financeData, 
  setSettlementTarget, 
  setViewingCustomerReport,
  setActionMenuTarget,
  setPartialSettlementTarget,
  setSelectedPartialOrderIds
}) => {
  const [financeFilter, setFinanceFilter] = useState<'all' | 'thisMonth' | 'over30' | 'over60'>('all');

  return (
    <motion.div key="finance" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0, zIndex: 10 }} exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }} transition={{ duration: 0.2 }} className="space-y-6 relative">
      <div className="px-1">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-extrabold text-morandi-charcoal flex items-center gap-2 tracking-tight"><Wallet className="w-5 h-5 text-morandi-blue" /> 帳務總覽</h2>
        </div>
        
        {/* Revenue Overview Cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-morandi-charcoal rounded-[24px] p-5 shadow-lg text-white relative overflow-hidden">
            <div className="absolute right-[-10px] top-[-10px] opacity-10"><DollarSign className="w-24 h-24" /></div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">未結總金額</p>
            <h3 className="text-2xl font-black text-white tracking-tight">${financeData.grandTotalDebt.toLocaleString()}</h3>
          </div>
          <div className="bg-emerald-500 rounded-[24px] p-5 shadow-lg text-white relative overflow-hidden">
            <div className="absolute right-[-10px] top-[-10px] opacity-10"><CheckCircle2 className="w-24 h-24" /></div>
            <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest mb-1">本月已收帳款</p>
            <h3 className="text-2xl font-black text-white tracking-tight">${financeData.thisMonthCollected.toLocaleString()}</h3>
            <p className="text-[9px] text-emerald-100 mt-1 font-medium tracking-wide">佔本月營收 {financeData.thisMonthRevenue > 0 ? Math.round((financeData.thisMonthCollected / financeData.thisMonthRevenue) * 100) : 0}%</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center px-2">
            <h3 className="text-xs font-bold text-morandi-pebble uppercase tracking-widest flex items-center gap-2"><ListChecks className="w-4 h-4" /> 欠款客戶列表</h3>
          </div>
          
          {/* Aging Filters */}
          <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar px-2 -mx-2">
            <button onClick={() => setFinanceFilter('all')} className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all border ${financeFilter === 'all' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-400 border-gray-200'}`}>全部</button>
            <button onClick={() => setFinanceFilter('thisMonth')} className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all border ${financeFilter === 'thisMonth' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-400 border-gray-200'}`}>本月新增</button>
            <button onClick={() => setFinanceFilter('over30')} className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all border ${financeFilter === 'over30' ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-gray-400 border-gray-200'}`}>逾期 30 天</button>
            <button onClick={() => setFinanceFilter('over60')} className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all border ${financeFilter === 'over60' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-gray-400 border-gray-200'}`}>逾期 60 天</button>
          </div>

          <motion.div variants={containerVariants} initial="hidden" animate="show">
            {financeData.outstanding.length > 0 ? (
              financeData.outstanding
                .filter((item: any) => {
                  if (financeFilter === 'all') return true;
                  if (financeFilter === 'thisMonth') return item.agingDays <= 30;
                  if (financeFilter === 'over30') return item.agingDays > 30;
                  if (financeFilter === 'over60') return item.agingDays > 60;
                  return true;
                })
                .map((item: any, idx: number) => (
                <motion.div variants={itemVariants} key={idx} className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-200 mb-3 relative overflow-hidden">
                  <div className="flex justify-between items-start mb-4 relative z-10">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-[16px] bg-rose-50 flex items-center justify-center text-rose-400 font-extrabold text-xl">{String(item.name || '').charAt(0)}</div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                          {item.name}
                          {item.agingDays > 60 ? (
                            <span className="text-[9px] bg-rose-600 text-white px-1.5 py-0.5 rounded-md font-bold">⚠️ 逾期 60 天</span>
                          ) : item.agingDays > 30 ? (
                            <span className="text-[9px] bg-rose-500 text-white px-1.5 py-0.5 rounded-md font-bold">⚠️ 逾期 30 天</span>
                          ) : null}
                        </h4>
                        <p className="text-xs text-rose-400 font-bold bg-rose-50 inline-block px-1.5 rounded mt-0.5">{item.count} 筆未結</p>
                        <p className="text-xs text-slate-500 font-medium tracking-wide mt-0.5">最早欠款日: {item.earliestDebtDate} ({item.orderCount} 筆未結)</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="text-right">
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">應收金額</p>
                        <p className="text-2xl font-black text-morandi-charcoal tracking-tight">${item.totalDebt.toLocaleString()}</p>
                      </div>
                      <button
                        onClick={() => setActionMenuTarget(item)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors -mt-1 -mr-1"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="relative z-10 pt-2 border-t border-gray-100 mb-3">
                    <button onClick={() => {
                      setPartialSettlementTarget({ name: item.name, orders: item.orders });
                      setSelectedPartialOrderIds(new Set(item.orders.map((o: any) => o.id)));
                    }} className="w-full py-3 rounded-xl bg-blue-50 text-blue-600 font-bold text-sm flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors"><ListChecks className="w-4 h-4" /> 查看明細 / 部分結帳</button>
                  </div>

                  <div className="flex gap-2 relative z-10">
                     <motion.button whileTap={buttonTap} onClick={() => setSettlementTarget(item.name)} className="flex-1 py-3 bg-morandi-blue text-white rounded-2xl font-bold text-xs shadow-md shadow-blue-100 flex items-center justify-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> 本期結算全額</motion.button>
                     <motion.button whileTap={buttonTap} onClick={() => setViewingCustomerReport(item.name)} className="flex-1 py-3 bg-gray-50 text-slate-700 rounded-2xl font-bold text-xs border border-gray-100 flex items-center justify-center gap-1.5"><History className="w-3.5 h-3.5" /> 歷史報表</motion.button>
                  </div>
                </motion.div>
              ))
            ) : (
               <div className="text-center py-12 px-4 bg-white rounded-[32px] border border-slate-100 border-dashed">
                 <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
                   <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                 </div>
                 <p className="text-slate-700 font-bold tracking-tight mb-1">款項皆已結清</p>
                 <p className="text-xs text-slate-400 tracking-wide font-medium">目前沒有欠點或未收的款項</p>
               </div>
            )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};
