import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, Bot, FileText, Mic, Filter, Layers, ClipboardList, Plus } from 'lucide-react';
import { DebouncedSearchInput } from '../components/DebouncedSearchInput';
import { Virtuoso } from 'react-virtuoso';
import { DELIVERY_METHODS, COLORS } from '../constants';

const buttonTap = { scale: 0.95 };
const buttonHover = { scale: 1.05 };

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

interface OrdersViewProps {
  isScrollingDown: boolean;
  layoutMode: string;
  selectedDate: string;
  setIsDatePickerOpen: (open: boolean) => void;
  triggerHaptic: () => void;
  setIsAutoOrderDashboardOpen: (open: boolean) => void;
  prediction: any;
  setActiveTab: (tab: string) => void;
  orderSearch: string;
  setOrderSearch: (val: string) => void;
  setIsVoiceModalOpen: (open: boolean) => void;
  isProcessingVoice: boolean;
  showOrderDeliveryFilters: boolean;
  setShowOrderDeliveryFilters: (open: boolean) => void;
  orderDeliveryFilter: string[];
  setOrderDeliveryFilter: (filter: string[]) => void;
  virtuosoOrderData: any[];
  virtuosoContext: any;
  renderVirtuosoItem: (index: number, data: any, context: any) => React.ReactNode;
  scrollElement: HTMLElement | null;
  requireAuth: (fn: any) => void;
  setEditingOrderId: (id: string | null) => void;
  setOrderForm: (form: any) => void;
  setIsAddingOrder: (isAdding: boolean) => void;
}

export const OrdersView: React.FC<OrdersViewProps> = (props) => {
  const {
    isScrollingDown,
    layoutMode,
    selectedDate,
    setIsDatePickerOpen,
    triggerHaptic,
    setIsAutoOrderDashboardOpen,
    prediction,
    setActiveTab,
    orderSearch,
    setOrderSearch,
    setIsVoiceModalOpen,
    isProcessingVoice,
    showOrderDeliveryFilters,
    setShowOrderDeliveryFilters,
    orderDeliveryFilter,
    setOrderDeliveryFilter,
    virtuosoOrderData,
    virtuosoContext,
    renderVirtuosoItem,
    scrollElement,
    requireAuth,
    setEditingOrderId,
    setOrderForm,
    setIsAddingOrder,
  } = props;

  return (
          <motion.div 
            key="orders"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0, zIndex: 10 }} // Step 3: Ensure Z-index high
            exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }} // Step 1: Pointer events none + Low Z-index
            transition={{ duration: 0.2 }}
            className="space-y-6 relative flex flex-col h-full"
          >
            {/* ... (Orders Tab Content) */}
            <div className="sticky top-0 z-30 bg-morandi-oatmeal py-2 space-y-2 px-1 mb-2 shadow-sm rounded-b-[20px] pb-4">
               {/* 建議1: 長輩舒適模式下，向下滑動隱藏頂部標題列 */}
               <motion.div 
                 initial={false}
                 animate={{
                   height: (isScrollingDown && layoutMode === 'compact') ? 0 : 'auto',
                   opacity: (isScrollingDown && layoutMode === 'compact') ? 0 : 1,
                   overflow: 'hidden'
                 }}
                 transition={{ duration: 0.3, ease: 'easeInOut' }}
                 className="flex items-center justify-between"
               >
                  <motion.button whileTap={buttonTap} onClick={() => setIsDatePickerOpen(true)} className="flex-1 mr-2 flex items-center gap-3 bg-white p-3 rounded-[20px] shadow-sm border border-slate-200 active:scale-95 transition-all">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-morandi-blue/10"><CalendarDays className="w-5 h-5 text-morandi-blue" /></div>
                    <div><p className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest">出貨日期</p><p className="font-bold text-morandi-charcoal text-lg tracking-tight">{selectedDate}</p></div>
                  </motion.button>
                  
                  <div className="flex gap-2 shrink-0">
                    <motion.button 
                      whileTap={buttonTap} 
                      onClick={() => {
                        triggerHaptic();
                        setIsAutoOrderDashboardOpen(true);
                      }} 
                      className="relative flex items-center justify-center gap-2 w-14 h-14 md:w-auto md:px-4 rounded-[20px] text-white font-bold shadow-md transition-all bg-gradient-to-br from-morandi-blue to-indigo-500 hover:shadow-lg"
                    >
                      <Bot className="w-6 h-6" />
                      <span className="hidden md:inline">自動建單預覽</span>
                      {prediction.greenZone.length > 0 && (
                        <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm border-2 border-white">
                          預計 {prediction.greenZone.length} 單
                        </span>
                      )}
                    </motion.button>
                    <motion.button whileTap={buttonTap} onClick={() => setActiveTab('work as any')} className="w-14 h-14 rounded-[20px] bg-white text-morandi-pebble border border-slate-200 shadow-sm flex items-center justify-center hover:bg-slate-50 transition-all">
                       <FileText className="w-6 h-6" />
                    </motion.button>
                  </div>
               </motion.div>

               {/* Sticky Search Bar & Filter Button */}
               <motion.div
                 initial={false}
                 animate={{ 
                   height: isScrollingDown ? 0 : 'auto', 
                   opacity: isScrollingDown ? 0 : 1,
                   overflow: 'hidden',
                   marginTop: (isScrollingDown && layoutMode === 'compact') ? 0 : undefined
                 }}
                 transition={{ duration: 0.3, ease: 'easeInOut' }}
                 className="space-y-2"
               >
                 <div className="flex gap-2 items-center">
                   <div className="relative flex-1 flex items-center">
                     <DebouncedSearchInput
                       value={orderSearch}
                       onSearch={(val) => setOrderSearch(val)}
                       placeholder="搜尋客戶名稱或電話..."
                       className="w-full flex-1"
                       inputClassName="w-full pl-10 pr-20 py-3 bg-white rounded-[20px] border border-slate-200 shadow-sm text-sm font-bold text-morandi-charcoal focus:ring-2 focus:ring-morandi-blue transition-all placeholder:text-gray-300"
                     />
                     <div className="absolute right-2 flex items-center gap-1 z-10">
                       <button 
                         onClick={() => setIsVoiceModalOpen(true)}
                         className={`p-1.5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-morandi-blue bg-transparent ${isProcessingVoice ? 'text-rose-500 animate-pulse' : 'text-gray-400 hover:text-blue-500 hover:bg-gray-100'}`}
                         aria-label="語音輸入"
                         title="語音輸入"
                       >
                         <Mic className="w-5 h-5" />
                       </button>
                     </div>
                   </div>
                   
                   {/* 新增的漏斗篩選按鈕 */}
                   <button 
                     onClick={() => setShowOrderDeliveryFilters(!showOrderDeliveryFilters)}
                     className={`relative flex-shrink-0 w-12 h-12 rounded-[20px] border flex items-center justify-center transition-all shadow-sm ${showOrderDeliveryFilters || orderDeliveryFilter.length > 0 ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-400 border-slate-200 hover:bg-slate-50'}`}
                   >
                     <Filter className="w-5 h-5" />
                     {/* 如果有選取條件，顯示一個小紅點提示 */}
                     {orderDeliveryFilter.length > 0 && (
                       <span className="absolute -top-1 -right-1 bg-rose-500 border-2 border-white text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                         {orderDeliveryFilter.length}
                       </span>
                     )}
                   </button>
                 </div>

                 {/* 展開的篩選選項區塊 */}
                 <AnimatePresence>
                   {showOrderDeliveryFilters && (
                     <motion.div 
                       key="order-delivery-filters"
                       initial={{ height: 0, opacity: 0, marginTop: 0 }} 
                       animate={{ height: 'auto', opacity: 1, marginTop: 8 }} 
                       exit={{ height: 0, opacity: 0, marginTop: 0 }} 
                       transition={{ duration: 0.2 }}
                       className="overflow-hidden"
                     >
                       <div className="flex gap-2 overflow-x-auto pb-2 pt-1 custom-scrollbar">
                         <button 
                           onClick={() => setOrderDeliveryFilter([])} 
                           className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${orderDeliveryFilter.length === 0 ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-400 border-gray-200'}`}
                         >
                           全部
                         </button>
                         {DELIVERY_METHODS.map(m => {
                           const isSelected = orderDeliveryFilter.includes(m);
                           return (
                             <button 
                               key={m} 
                               onClick={() => {
                                  if (isSelected) setOrderDeliveryFilter(orderDeliveryFilter.filter(x => x !== m));
                                  else setOrderDeliveryFilter([...orderDeliveryFilter, m]);
                               }} 
                               className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${isSelected ? 'text-white border-transparent' : 'bg-white text-gray-400 border-gray-200'}`}
                               style={{ backgroundColor: isSelected ? COLORS.primary : '' }}
                             >
                               {m}
                             </button>
                           );
                         })}
                       </div>
                     </motion.div>
                   )}
                 </AnimatePresence>
               </motion.div>
            </div>
            
             <div className="space-y-3 flex-1 flex flex-col h-full">
              <div className="flex items-center justify-between px-2 mb-2">
                <h2 className="text-sm font-bold text-morandi-pebble flex items-center gap-2 uppercase tracking-widest"><Layers className="w-4 h-4" /> 配送列表 [{selectedDate}] ({virtuosoOrderData.length} 家)</h2>
              </div>
              <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex-1 h-full">
              {scrollElement && virtuosoOrderData.length > 0 ? (
                <Virtuoso
                  customScrollParent={scrollElement}
                  className="custom-scrollbar"
                  data={virtuosoOrderData}
                  context={virtuosoContext}
                  itemContent={renderVirtuosoItem}
                />
              ) : virtuosoOrderData.length === 0 ? (
                <div className="py-20 flex flex-col items-center text-center gap-4">
                  <ClipboardList className="w-16 h-16 text-gray-200" />
                  {orderSearch || orderDeliveryFilter.length > 0 ? (
                     <>
                       <p className="text-gray-400 font-bold text-sm tracking-wide">找不到符合條件的訂單</p>
                       <button onClick={() => { setOrderSearch(''); setOrderDeliveryFilter([]); }} className="text-xs text-morandi-blue font-bold underline">清除篩選條件</button>
                     </>
                  ) : (
                     <p className="text-gray-300 italic text-sm tracking-wide">此日期尚無訂單</p>
                  )}
                </div>
              ) : (
                <div className="py-20 text-center text-gray-400">
                  載入清單中...
                </div>
              )}
              </motion.div>
            </div>
            {/* 👇 新增這層外掛容器來限制按鈕位置，使其與 App 寬度一致 */}
            <motion.div 
              initial={false}
              animate={{ 
                opacity: isScrollingDown ? 0 : 1,
                scale: isScrollingDown ? 0.8 : 1,
                x: isScrollingDown ? 60 : 0
              }}
              transition={{ duration: 0.3 }}
              className="fixed bottom-24 left-0 right-0 mx-auto w-full max-w-md pointer-events-none z-50 flex justify-end px-4 sm:px-6"
            >
              <motion.button 
                whileTap={buttonTap} 
                whileHover={buttonHover} 
                onClick={() => requireAuth(() => { 
                  setEditingOrderId(null); 
                  setOrderForm({
                    customerType: 'existing',
                    customerId: '',
                    customerName: '',
                    deliveryTime: '',
                    deliveryMethod: '',
                    trip: '',
                    items: [{ productId: '', quantity: 10, unit: '斤' }],
                    note: '',
                    date: selectedDate
                  });
                  setIsAddingOrder(true); 
                })} 
                className={`pointer-events-auto text-white shadow-2xl shadow-morandi-blue/40 hover:bg-slate-600 active:scale-95 transition-all flex items-center justify-center bg-morandi-blue ${
                  layoutMode === 'compact' 
                    ? 'h-14 px-6 rounded-full gap-2'
                    : 'w-14 h-14 rounded-full'
                }`}
              >
                <Plus className={layoutMode === 'compact' ? "w-6 h-6" : "w-8 h-8"} />
                {layoutMode === 'compact' && (
                  <span className="font-bold text-lg tracking-wide whitespace-nowrap">建立訂單</span>
                )}
              </motion.button>
            </motion.div>
          </motion.div>
  );
};
