import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Search, X, ListChecks, Printer, WifiOff, ChevronDown, Check } from 'lucide-react';
import { WorkCalendar } from '../components/WorkCalendar';
import { WorkGroupItem } from '../components/WorkGroupItem';
import { DELIVERY_METHODS, COLORS, PRODUCT_CATEGORIES } from '../constants';

interface WorkViewProps {
  orders: any[];
  products: any[];
  workDates: string[];
  setWorkDates: (dates: string[]) => void;
  workCustomerFilter: string;
  setWorkCustomerFilter: (filter: string) => void;
  workDeliveryMethodFilter: string[];
  setWorkDeliveryMethodFilter: (filter: string[]) => void;
  workProductFilter: Set<string>;
  setWorkProductFilter: (filter: Set<string>) => void;
  workSheetData: any[];
  handlePrint: () => void;
  setActiveTab: (tab: string) => void;
  isProductFilterOpen: boolean;
  setIsProductFilterOpen: (isOpen: boolean) => void;
  expandedFilterCats: Set<string>;
  setExpandedFilterCats: (cats: Set<string>) => void;
  visibleWorkCount: number;
  setVisibleWorkCount: (count: number) => void;
}

const containerVariants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const buttonTap = { scale: 0.95 };

export const WorkView: React.FC<WorkViewProps> = ({
  orders,
  products,
  workDates,
  setWorkDates,
  workCustomerFilter,
  setWorkCustomerFilter,
  workDeliveryMethodFilter,
  setWorkDeliveryMethodFilter,
  workProductFilter,
  setWorkProductFilter,
  workSheetData,
  handlePrint,
  setActiveTab,
  isProductFilterOpen,
  setIsProductFilterOpen,
  expandedFilterCats,
  setExpandedFilterCats,
  visibleWorkCount,
  setVisibleWorkCount
}) => {
  return (
    <>
      <motion.div key="work" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0, zIndex: 10 }} exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }} transition={{ duration: 0.2 }} className="space-y-6 relative">
        <div className="px-1">
          <div className="flex items-center gap-2 mb-4">
            <button onClick={() => setActiveTab('orders')} className="p-2 bg-white rounded-xl shadow-sm border border-slate-200 text-morandi-pebble">
              <ChevronLeft className="w-5 h-5"/>
            </button>
            <h2 className="text-xl font-extrabold text-morandi-charcoal tracking-tight">工作小抄</h2>
          </div>
          <div className="space-y-3 mb-4">
            <div className="relative">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
              <input type="text" placeholder="篩選特定店家..." className="w-full pl-12 pr-6 py-4 bg-white rounded-[24px] border border-slate-100 shadow-sm text-slate-800 font-bold tracking-wide focus:ring-2 focus:ring-morandi-blue transition-all placeholder:text-gray-300 text-sm" value={workCustomerFilter} onChange={(e) => setWorkCustomerFilter(e.target.value)} />
              {workCustomerFilter && <button onClick={() => setWorkCustomerFilter('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X className="w-4 h-4" /></button>}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar mb-2">
              <button 
                onClick={() => setWorkDeliveryMethodFilter([])} 
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${workDeliveryMethodFilter.length === 0 ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-400 border-gray-200'}`}
              >
                全部方式
              </button>
              {DELIVERY_METHODS.map(m => { 
                const isSelected = workDeliveryMethodFilter.includes(m); 
                return (
                  <button 
                    key={m} 
                    onClick={() => { 
                      if (isSelected) { 
                        setWorkDeliveryMethodFilter(workDeliveryMethodFilter.filter(x => x !== m)); 
                      } else { 
                        setWorkDeliveryMethodFilter([...workDeliveryMethodFilter, m]); 
                      } 
                    }} 
                    className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${isSelected ? 'text-white border-transparent' : 'bg-white text-gray-400 border-gray-200'}`} 
                    style={{ backgroundColor: isSelected ? COLORS.primary : '' }}
                  >
                    {m}
                  </button>
                ); 
              })}
            </div>
            
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setIsProductFilterOpen(true)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-1 ${
                  workProductFilter.size > 0
                    ? 'bg-morandi-blue/10 text-morandi-blue border-morandi-blue/20'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {workProductFilter.size > 0 ? `🍜 已選 ${workProductFilter.size} 種麵 ▾` : '🍜 篩選麵種 ▾'}
              </button>
              {workProductFilter.size > 0 && (
                <button
                  onClick={() => setWorkProductFilter(new Set())}
                  className="text-xs text-morandi-pebble font-bold px-2 py-1 rounded-md transition-colors hover:text-slate-600 hover:bg-slate-100"
                >
                  清除全部
                </button>
              )}
            </div>
          </div>
          
          <div className="mb-6">
            <WorkCalendar selectedDate={workDates} onSelect={setWorkDates} orders={orders} />
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center px-2">
              <h3 className="text-xs font-bold text-morandi-pebble uppercase tracking-widest flex items-center gap-2">
                <ListChecks className="w-4 h-4" /> 生產總表 [{workDates.length}天]
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-300 tracking-wide">{workSheetData.reduce((sum, g) => sum + g.items.length, 0)} 種品項</span>
                <motion.button whileTap={buttonTap} onClick={handlePrint} className="bg-slate-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-slate-800 transition-colors shadow-sm active:scale-95"><Printer className="w-3.5 h-3.5" /> 列印 / 匯出 PDF</motion.button>
              </div>
            </div>
            
            <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
              {workSheetData.length > 0 ? (
                <>
                  {workSheetData.slice(0, visibleWorkCount).map((group: any) => {
                    return <WorkGroupItem key={group.date} group={group} />;
                  })}
                  
                  {workSheetData.length > visibleWorkCount && (
                    <div className="flex justify-center pt-2 pb-6 relative z-10 w-full mb-8">
                       <button
                         onClick={() => setVisibleWorkCount(prev => prev + 5)}
                         className="px-6 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-bold transition-all flex items-center gap-2"
                       >
                         向下展開更多組合 ({workSheetData.length - visibleWorkCount})
                         <ChevronDown className="w-3.5 h-3.5" />
                       </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-10">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <WifiOff className="w-8 h-8 text-gray-300" />
                  </div>
                  <p className="text-gray-300 font-bold text-sm tracking-wide">所選日期無生產需求</p>
                  <p className="text-xs text-gray-200 mt-1">請選擇其他日期或調整篩選條件</p>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {isProductFilterOpen && (
          <div className="fixed inset-0 z-[100] flex flex-col justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsProductFilterOpen(false)}
              className="absolute inset-0 bg-black/40"
            />
            
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full bg-white rounded-t-[32px] max-h-[85vh] flex flex-col shadow-2xl"
            >
              <div className="flex-shrink-0 pb-2">
                <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mt-3 mb-4" />
                <div className="flex items-center justify-between px-6">
                  <h3 className="text-lg font-extrabold text-slate-800">選擇麵種</h3>
                  <button 
                    onClick={() => setIsProductFilterOpen(false)}
                    className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto p-5 space-y-3 custom-scrollbar">
                {PRODUCT_CATEGORIES.map(cat => {
                  const catProducts = products.filter(p => (p.category || 'other') === cat.id);
                  if (catProducts.length === 0) return null;
                  
                  const isExpanded = expandedFilterCats.has(cat.id);
                  const selectedCount = catProducts.filter(p => workProductFilter.has(p.id)).length;
                  const isAllSelected = selectedCount === catProducts.length && catProducts.length > 0;
                  const hasSelection = selectedCount > 0;

                  return (
                    <div key={cat.id} className={`bg-white rounded-[20px] border transition-colors overflow-hidden ${hasSelection ? 'border-morandi-blue/30 bg-blue-50/10' : 'border-slate-200'}`}>
                      <div 
                        className="flex items-center justify-between p-4 min-h-[56px] cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => {
                          const newExpanded = new Set(expandedFilterCats);
                          if (isExpanded) newExpanded.delete(cat.id);
                          else newExpanded.add(cat.id);
                          setExpandedFilterCats(newExpanded);
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-4 h-4 rounded-full" style={{ backgroundColor: cat.color, border: '1px solid rgba(0,0,0,0.1)' }}></span>
                          <span className="font-bold text-base text-slate-700">{cat.label}</span>
                          {selectedCount > 0 && (
                            <span className="bg-morandi-blue text-white text-xs px-2.5 py-0.5 rounded-full font-bold">
                              已選 {selectedCount}
                            </span>
                          )}
                        </div>
                        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                      
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }} 
                            animate={{ height: 'auto', opacity: 1 }} 
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="p-4 pt-0 border-t border-slate-100 bg-slate-50/50 flex flex-wrap gap-2.5">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newFilter = new Set(workProductFilter);
                                  if (isAllSelected) {
                                    catProducts.forEach(p => newFilter.delete(p.id));
                                  } else {
                                    catProducts.forEach(p => newFilter.add(p.id));
                                  }
                                  setWorkProductFilter(newFilter);
                                }}
                                className={`px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-bold transition-all border ${isAllSelected ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                              >
                                {isAllSelected ? '取消全選' : '全選此類'}
                              </button>
                              
                              {catProducts.map(p => {
                                const isSelected = workProductFilter.has(p.id);
                                return (
                                  <button
                                    key={p.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const newFilter = new Set(workProductFilter);
                                      if (isSelected) newFilter.delete(p.id);
                                      else newFilter.add(p.id);
                                      setWorkProductFilter(newFilter);
                                    }}
                                    className={`px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-bold transition-all border flex items-center gap-1.5 ${isSelected ? 'bg-morandi-blue text-white border-morandi-blue shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-morandi-blue/50'}`}
                                  >
                                    {isSelected && <Check className="w-4 h-4" />}
                                    {p.name}
                                  </button>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

              <div className="flex-shrink-0 sticky bottom-0 bg-white p-5 border-t border-gray-100 rounded-b-[32px]">
                <button
                  onClick={() => setIsProductFilterOpen(false)}
                  className="w-full py-4 bg-morandi-blue text-white rounded-2xl font-bold text-lg shadow-lg shadow-morandi-blue/30 hover:bg-slate-600 active:scale-[0.98] transition-all"
                >
                  查看結果
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
