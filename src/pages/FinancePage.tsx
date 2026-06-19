import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wallet, DollarSign, CheckCircle2, ListChecks, 
  MoreVertical, X, Copy, MapPin, Search, SearchX, XCircle, ChevronDown,
  TrendingUp, BarChart3
} from 'lucide-react';
import { getLastMonthEndDate } from '../utils';

// 必要的型別定義
interface Order {
  id: string;
  deliveryDate: string;
  items: Array<{ productId: string; quantity: number; unit: string; }>;
}
interface Product { id: string; name: string; }
interface Customer { id: string; name: string; priceList?: Array<{ productId: string; price: number; }>; }

export interface FinancePageProps {
  financeData: {
    grandTotalDebt: number;
    thisMonthCollected: number;
    thisMonthPendingCollected: number;
    thisMonthRevenue: number;
    outstanding: Array<{
      name: string;
      agingDays: number;
      count: number;
      totalDebt: number;
      orders: Order[];
      orderIds: string[];
    }>;
  };
  calculateOrderTotalAmount: (order: any) => number;
  setSettlementDate: (date: string) => void;
  setSettlementTarget: (target: { name: string; allOrderIds: string[] } | null) => void;
  products: Product[];
  customers: Customer[];
  handleCopyStatement: (name: string, total: number, orders: any[]) => void;
  handleShareStatementToLine: (name: string, total: number, orders: any[]) => void;
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const FinancePage: React.FC<FinancePageProps> = ({
  financeData, calculateOrderTotalAmount, setSettlementDate,
  setSettlementTarget, products, customers, handleCopyStatement,
  handleShareStatementToLine, addToast
}) => {
  const [financeFilter, setFinanceFilter] = useState<'all' | 'thisMonth' | 'over30' | 'over60'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [partialSettlementTarget, setPartialSettlementTarget] = useState<{name: string, orders: Order[]} | null>(null);
  const [selectedPartialOrderIds, setSelectedPartialOrderIds] = useState<Set<string>>(new Set());
  const [actionMenuTarget, setActionMenuTarget] = useState<any | null>(null);
  const [isCopyMenuExpanded, setIsCopyMenuExpanded] = useState(false);
  const [activeSummaryTab, setActiveSummaryTab] = useState<'cashflow' | 'operation'>('cashflow');

  useEffect(() => {
    if (!actionMenuTarget) setIsCopyMenuExpanded(false);
  }, [actionMenuTarget]);

  const handleSmartCopy = (type: 'all' | 'lastMonthBefore' | 'thisMonth') => {
    if (!actionMenuTarget) return;
    
    // 取得本月第一天的字串，例如 "2026-06-01"
    const d = new Date();
    const thisMonthFirstDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    
    let targetOrders = actionMenuTarget.orders;
    
    if (type === 'lastMonthBefore') {
      targetOrders = actionMenuTarget.orders.filter((o: Order) => o.deliveryDate < thisMonthFirstDay);
    } else if (type === 'thisMonth') {
      targetOrders = actionMenuTarget.orders.filter((o: Order) => o.deliveryDate >= thisMonthFirstDay);
    }

    if (targetOrders.length === 0) {
      addToast("該區間沒有未結帳款可複製", 'error');
      return;
    }

    const targetTotal = targetOrders.reduce((sum: number, o: Order) => sum + calculateOrderTotalAmount(o), 0);
    
    handleCopyStatement(actionMenuTarget.name, targetTotal, targetOrders);
    setActionMenuTarget(null);
  };

  const filteredData = useMemo(() => {
    let data = financeData.outstanding.filter(item => {
      if (financeFilter === 'all') return true;
      if (financeFilter === 'thisMonth') return item.agingDays <= 30;
      if (financeFilter === 'over30') return item.agingDays > 30;
      if (financeFilter === 'over60') return item.agingDays > 60;
      return true;
    });
    
    if (!searchTerm.trim()) return data;
    const lowerKeyword = searchTerm.toLowerCase();
    
    return data.filter(item => 
      item.name.toLowerCase().includes(lowerKeyword)
    );
  }, [financeData.outstanding, financeFilter, searchTerm]);

  const containerVariants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
  const itemVariants = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

  return (
    <>
      <motion.div key="finance-page" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0, zIndex: 10 }} exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }} transition={{ duration: 0.2 }} className="space-y-6 relative">
             <div className="px-1">
               <div className="flex justify-between items-center mb-4">
                 <h2 className="text-xl font-extrabold text-morandi-charcoal flex items-center gap-2 tracking-tight"><Wallet className="w-5 h-5 text-morandi-blue" /> 帳務總覽</h2>
                 {/* 暫停使用帳務頁面的建立訂單按鈕 
                 <motion.button 
                   whileTap={{ scale: 0.95 }} 
                   whileHover={{ scale: 1.05 }} 
                   onClick={() => { 
                     // setEditingOrderId(null); 
                     // dummySetOrderForm();
                     // dummySetIsAddingOrder(true); 
                   }} 
                   className="p-2.5 rounded-2xl text-white shadow-lg bg-morandi-blue hover:bg-slate-600 transition-colors flex items-center gap-1.5"
                 >
                   <Plus className="w-5 h-5" />
                   <span className="text-xs font-bold">建立訂單</span>
                 </motion.button>
                 */}
               </div>
               
               {/* Revenue Overview Section */}
               <div className="mb-6">
                 {/* 👇 頁籤切換器 */}
                 <div className="flex items-center gap-2 mb-3 px-2">
                   <button 
                     onClick={() => setActiveSummaryTab('cashflow')}
                     className={`text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${activeSummaryTab === 'cashflow' ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                   >
                     現金流追蹤
                   </button>
                   <button 
                     onClick={() => setActiveSummaryTab('operation')}
                     className={`text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${activeSummaryTab === 'operation' ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                   >
                     本月營運概況
                   </button>
                 </div>

                 {/* 👇 視角內容渲染區 */}
                 <AnimatePresence mode="wait">
                   {activeSummaryTab === 'cashflow' ? (
                     <motion.div 
                       key="cashflow"
                       initial={{ opacity: 0, x: -10 }}
                       animate={{ opacity: 1, x: 0 }}
                       exit={{ opacity: 0, x: 10 }}
                       transition={{ duration: 0.2 }}
                       className="grid grid-cols-2 gap-3"
                     >
                       {/* 現金流卡片 1：未結總額 */}
                       <div className="bg-morandi-charcoal rounded-[24px] p-5 shadow-lg text-white relative overflow-hidden">
                         <div className="absolute right-[-10px] top-[-10px] opacity-10"><DollarSign className="w-24 h-24" /></div>
                         <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">未結總金額</p>
                         <h3 className="text-2xl font-black text-white tracking-tight">${financeData.grandTotalDebt.toLocaleString()}</h3>
                       </div>
                       
                       {/* 現金流卡片 2：本月已收帳款 */}
                       <div className="bg-emerald-500 rounded-[24px] p-5 shadow-lg text-white relative overflow-hidden">
                         <div className="absolute right-[-10px] top-[-10px] opacity-10"><CheckCircle2 className="w-24 h-24" /></div>
                         <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest mb-1">本月已收帳款</p>
                         <h3 className="text-2xl font-black text-white tracking-tight">${financeData.thisMonthCollected.toLocaleString()}</h3>
                         <div className="mt-1">
                           <p className="text-[9px] text-emerald-100 font-medium tracking-wide">佔本月營收 {financeData.thisMonthRevenue > 0 ? Math.round((financeData.thisMonthCollected / financeData.thisMonthRevenue) * 100) : 0}%</p>
                           {financeData.thisMonthPendingCollected > 0 && (
                             <p className="text-[10px] text-emerald-50/90 font-bold bg-emerald-600/50 inline-block px-1.5 py-0.5 rounded mt-1 opacity-90">
                               ...另有 ${financeData.thisMonthPendingCollected.toLocaleString()} 網路同步中
                             </p>
                           )}
                         </div>
                       </div>
                     </motion.div>
                   ) : (
                     <motion.div 
                       key="operation"
                       initial={{ opacity: 0, x: 10 }}
                       animate={{ opacity: 1, x: 0 }}
                       exit={{ opacity: 0, x: -10 }}
                       transition={{ duration: 0.2 }}
                       className="grid grid-cols-2 gap-3"
                     >
                       {/* 營運卡片 1：本月總營收 */}
                       <div className="bg-blue-500 rounded-[24px] p-5 shadow-lg text-white relative overflow-hidden">
                         <div className="absolute right-[-10px] top-[-10px] opacity-10"><TrendingUp className="w-24 h-24" /></div>
                         <p className="text-[10px] font-bold text-blue-100 uppercase tracking-widest mb-1">本月總營收</p>
                         <h3 className="text-2xl font-black text-white tracking-tight">${financeData.thisMonthRevenue.toLocaleString()}</h3>
                         <p className="text-[9px] text-blue-100 mt-1 font-medium tracking-wide">包含已收與未結</p>
                       </div>
                       
                       {/* 營運卡片 2：日後可擴充指標保留位 */}
                       <div className="bg-gray-100 rounded-[24px] p-5 shadow-inner text-gray-500 relative overflow-hidden flex flex-col justify-center items-center h-full min-h-[110px] border border-gray-200 border-dashed">
                           <BarChart3 className="w-6 h-6 text-gray-300 mb-1" />
                           <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">更多指標規劃中</p>
                       </div>
                     </motion.div>
                   )}
                 </AnimatePresence>
               </div>

               <div className="space-y-4">
                 {/* 👇 Sticky 搜尋框區塊 */}
                 <div className="sticky top-0 z-20 bg-gray-50/80 backdrop-blur-md pb-3 pt-1 -mx-4 px-4 mb-2">
                   <div className="relative">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400 pointer-events-none" />
                     <input 
                       type="text"
                       placeholder="搜尋客戶名稱..."
                       value={searchTerm}
                       onChange={(e) => setSearchTerm(e.target.value)}
                       className="w-full pl-10 pr-10 py-2.5 bg-gray-50/80 hover:bg-gray-100 transition-colors rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-morandi-blue/50 text-sm font-bold text-slate-700"
                     />
                     <AnimatePresence>
                       {searchTerm && (
                         <motion.button 
                           initial={{ opacity: 0, scale: 0.8 }}
                           animate={{ opacity: 1, scale: 1 }}
                           exit={{ opacity: 0, scale: 0.8 }}
                           onClick={() => setSearchTerm('')}
                           className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 active:scale-95"
                         >
                           <XCircle className="w-4.5 h-4.5" />
                         </motion.button>
                       )}
                     </AnimatePresence>
                   </div>
                 </div>

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
                   {filteredData.length > 0 ? (
                     filteredData.map((item, idx) => (
                       <motion.div variants={itemVariants} key={item.name} className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-200 mb-3 relative overflow-hidden">
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
                         <div className="relative z-10 pt-2 border-t border-gray-100">
                           <button onClick={() => {
                             setPartialSettlementTarget({ name: item.name, orders: item.orders });
                             setSelectedPartialOrderIds(new Set(item.orders.map(o => o.id)));
                           }} className="w-full py-3 rounded-xl bg-blue-50 text-blue-600 font-bold text-sm flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors"><ListChecks className="w-4 h-4" /> 查看明細 / 部分結帳</button>
                         </div>
                       </motion.div>
                     ))
                   ) : (
                     <div className="text-center py-10">
                       {searchTerm ? (
                         <>
                           <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4"><SearchX className="w-8 h-8 text-gray-400" /></div>
                           <h3 className="text-lg font-bold text-slate-700 mb-1">找不到相關客戶</h3>
                           <p className="text-sm text-gray-500">請嘗試使用其他關鍵字</p>
                         </>
                       ) : (
                         <>
                           <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle2 className="w-8 h-8 text-emerald-400" /></div>
                           <h3 className="text-xl font-bold text-slate-700 mb-1">目前沒有欠款</h3>
                           <p className="text-sm text-gray-500">所有的帳款都已結清！</p>
                         </>
                       )}
                     </div>
                   )}
                 </motion.div>
               </div>
             </div>
      </motion.div>

      {typeof document !== 'undefined' && createPortal(
        <>
          <AnimatePresence>
            {partialSettlementTarget && (
              <motion.div key="partial-settlement-modal" className="fixed inset-0 bg-black/60 z-[150] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setPartialSettlementTarget(null)}>
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white rounded-[24px] p-6 w-full max-w-sm shadow-2xl max-h-[80vh] flex flex-col"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-extrabold text-slate-800">部分結帳 - {partialSettlementTarget.name}</h3>
                    <button onClick={() => setPartialSettlementTarget(null)} className="p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"><X className="w-4 h-4" /></button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto mb-4 space-y-2 custom-scrollbar pr-2">
                    {partialSettlementTarget.orders.map(order => {
                      const isSelected = selectedPartialOrderIds.has(order.id);
                      const amount = calculateOrderTotalAmount(order);
                      return (
                        <div 
                          key={order.id} 
                          onClick={() => {
                            const newSet = new Set(selectedPartialOrderIds);
                            if (isSelected) newSet.delete(order.id);
                            else newSet.add(order.id);
                            setSelectedPartialOrderIds(newSet);
                          }}
                          className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                        >
                          <div className={`w-5 h-5 rounded flex items-center justify-center border ${isSelected ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300'}`}>
                            {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-slate-700">{order.deliveryDate}</p>
                            <div className="mt-1 space-y-1">
                              {order.items.map((item, idx) => {
                                // 找出商品名稱
                                const p = products.find(x => x.id === item.productId);
                                const productName = p?.name || '未知商品';
                                
                                // 計算單項金額
                                let itemTotal = 0;
                                if (item.unit === '元') {
                                  itemTotal = item.quantity;
                                } else {
                                  const cust = customers.find(c => c.name === partialSettlementTarget.name);
                                  const priceInfo = cust?.priceList?.find(pl => pl.productId === item.productId);
                                  const price = priceInfo ? priceInfo.price : 0;
                                  itemTotal = Math.round(item.quantity * price);
                                }

                                return (
                                  <div key={idx} className="text-xs text-gray-500 flex justify-between pr-4">
                                    <span>• {productName} {item.quantity}{item.unit}</span>
                                    <span>${itemTotal.toLocaleString()}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-slate-800">${amount.toLocaleString()}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  <div className="pt-4 border-t border-gray-100">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-sm font-bold text-slate-600">已選 {selectedPartialOrderIds.size} 筆</span>
                      <span className="text-xl font-black text-blue-600">
                        ${partialSettlementTarget.orders.filter(o => selectedPartialOrderIds.has(o.id)).reduce((sum, o) => sum + calculateOrderTotalAmount(o), 0).toLocaleString()}
                      </span>
                    </div>
                    <button 
                      disabled={selectedPartialOrderIds.size === 0}
                      onClick={() => {
                        setSettlementDate('9999-12-31'); // 改為未來日期，確保包含所有手動選取的訂單
                        setSettlementTarget({
                          name: partialSettlementTarget.name,
                          allOrderIds: Array.from(selectedPartialOrderIds)
                        });
                        setPartialSettlementTarget(null);
                      }}
                      className="w-full py-3 rounded-xl bg-blue-500 text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4" /> 確認結帳
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {actionMenuTarget && (
              <motion.div 
                key="action-menu-modal"
                className="fixed inset-0 bg-black/40 z-[160] flex items-end justify-center sm:items-center"
                onClick={() => setActionMenuTarget(null)}
              >
                <motion.div 
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="bg-white w-full max-w-md rounded-t-[32px] sm:rounded-[32px] overflow-hidden flex flex-col max-h-[85vh] shadow-2xl"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="px-6 pt-4 pb-2 flex justify-center">
                    <div className="w-12 h-1.5 bg-gray-200 rounded-full"></div>
                  </div>
                  
                  <div className="px-6 pb-4 border-b border-gray-100 flex justify-between items-center">
                    <div>
                      <h3 className="text-xl font-bold text-slate-800">{actionMenuTarget.name} 的對帳單</h3>
                      <p className="text-sm text-gray-500 mt-1">總欠款：<span className="font-bold text-rose-500">${actionMenuTarget.totalDebt.toLocaleString()}</span></p>
                    </div>
                    <button 
                      onClick={() => setActionMenuTarget(null)}
                      className="p-2 bg-gray-50 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="p-4 flex flex-col gap-2 overflow-y-auto">
                    <div className="bg-gray-50/50 rounded-2xl overflow-hidden border border-transparent transition-colors hover:border-gray-100">
                      <button 
                        onClick={() => setIsCopyMenuExpanded(!isCopyMenuExpanded)}
                        className="w-full min-h-[56px] px-4 bg-white text-slate-700 font-bold text-base flex items-center justify-between hover:bg-slate-50 active:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-500">
                            <Copy className="w-5 h-5" />
                          </div>
                          {isCopyMenuExpanded ? '選擇複製區間' : '複製對帳單'}
                        </div>
                        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${isCopyMenuExpanded ? 'rotate-180' : ''}`} />
                      </button>

                      <AnimatePresence>
                        {isCopyMenuExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="px-4 pb-3 flex flex-col gap-2"
                          >
                            <button 
                              onClick={() => handleSmartCopy('lastMonthBefore')} 
                              className="w-full py-2.5 px-3 bg-white border border-blue-100 rounded-xl text-sm font-bold text-blue-600 hover:bg-blue-50 text-left flex justify-between items-center transition-colors shadow-sm"
                            >
                              上個月及以前的帳款
                              <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">最常用</span>
                            </button>
                            <button 
                              onClick={() => handleSmartCopy('thisMonth')} 
                              className="w-full py-2.5 px-3 hover:bg-gray-100 rounded-xl text-sm font-bold text-slate-600 text-left transition-colors"
                            >
                              僅本月新增帳款
                            </button>
                            <button 
                              onClick={() => handleSmartCopy('all')} 
                              className="w-full py-2.5 px-3 hover:bg-gray-100 rounded-xl text-sm font-bold text-slate-600 text-left transition-colors"
                            >
                              全部未結帳款
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <button 
                      onClick={() => {
                        handleShareStatementToLine(actionMenuTarget.name, actionMenuTarget.totalDebt, actionMenuTarget.orders);
                        setActionMenuTarget(null);
                      }} 
                      className="w-full min-h-[56px] px-4 rounded-2xl bg-white text-slate-700 font-bold text-base flex items-center gap-3 hover:bg-slate-50 active:bg-slate-100 transition-colors border border-transparent hover:border-slate-100"
                    >
                      <div className="w-10 h-10 rounded-full bg-[#06C755]/10 flex items-center justify-center text-[#06C755]">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <span className="text-[#06C755]">Line 傳送對帳單</span>
                    </button>

                    <div className="h-px bg-gray-100 my-2 mx-4"></div>

                    <button 
                      onClick={() => {
                        setSettlementDate(getLastMonthEndDate());
                        setSettlementTarget({name: actionMenuTarget.name, allOrderIds: actionMenuTarget.orderIds});
                        setActionMenuTarget(null);
                      }} 
                      className="w-full min-h-[56px] px-4 rounded-2xl bg-white text-slate-700 font-bold text-base flex items-center gap-3 hover:bg-slate-50 active:bg-slate-100 transition-colors border border-transparent hover:border-slate-100"
                    >
                      <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <span className="text-emerald-600">全部結清</span>
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>, 
        document.body
      )}
    </>
  );
};
