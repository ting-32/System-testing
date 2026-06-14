import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  Plus, CalendarDays, Bot, FileText, Search, X, Mic, Filter, 
  Layers, ChevronDown, ChevronUp, Copy, MapPin, Calculator, Trash2, History
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { Order, Customer, Product, Toast, ToastType, OrderStatus, OrderItem, CustomerPrice } from '../types';
import { DELIVERY_METHODS, UNITS, COLORS } from '../constants';
import { containerVariants, itemVariants, buttonTap, buttonHover, triggerHaptic, modalVariants } from '../components/animations';
import { SwipeableOrderCard } from '../components/SwipeableOrderCard';
import { DatePickerModal } from '../components/DatePickerModal';
import { CustomerProfileDrawer } from '../components/CustomerProfileDrawer';
import { CustomerReportModal } from '../components/CustomerReportModal';
import { VoiceInputModal } from '../components/VoiceInputModal';
import { CustomerPicker } from '../components/CustomerPicker';
import { ProductPicker } from '../components/ProductPicker';
import { getSmartDefaultDate } from '../utils';

import { useOrderCalculations } from '../hooks/useOrderCalculations';
import { useVoiceAssistant } from '../hooks/useVoiceAssistant';

  export interface OrdersPageProps {
    orders: Order[];
    setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
    customers: Customer[];
    products: Product[];
    trips?: string[];
  
  setDrawerConfig: React.Dispatch<React.SetStateAction<{
    isOpen: boolean;
    type: string;
    target: 'order' | 'customer';
  }>>;

  apiEndpoint: string;
  isSaving: boolean;
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>;
  isWarmingUp: boolean;
  isRetrying: boolean;
  isBackgroundSyncing: boolean;
  layoutMode: 'compact' | 'standard';
  
  addToast: (msg: string, type?: ToastType) => void;
  setToasts: React.Dispatch<React.SetStateAction<Toast[]>>;
  saveOrderToCloud: any;
  setConflictData: any;
  handleForceRetry: any;
  requireAuth: (fn: () => void) => void;
  
  setActiveTab: (tab: any) => void;
  setIsAutoOrderDashboardOpen: (val: boolean) => void;
  prediction: { greenZone: any[] };
  
  isAddingOrder: boolean;
  setIsAddingOrder: (val: boolean) => void;
  editingOrderId: string | null;
  setEditingOrderId: (val: string | null) => void;
  quickAddData: any;
  setQuickAddData: (val: any) => void;
  lastOrderCandidate: any;
  setLastOrderCandidate: (val: any) => void;
  orderForm: any;
  setOrderForm: React.Dispatch<React.SetStateAction<any>>;
  
  handleQuickAddSubmit: () => void;
  handleSwipeStatusChange: (id: string, newStatus: OrderStatus) => void;
  handleCopyOrder: (customerName: string, items: any[]) => void;
  handleShareOrder: (order: Order) => void;
  handleEditOrder: (orderId: string) => void;
  handleSaveOrder: () => void;
  applyLastOrder: () => void;
  handleSelectExistingCustomer: (id: string) => void;
  openGoogleMaps: (name: string) => void;
  handleDeleteOrder: (id: string) => void;
  handleRetrySync: (id: string) => void;
  
  externalEditOrderId?: string | null;
  onClearExternalEdit?: () => void;
  externalAddOrderData?: any;
  clearExternalAddOrder?: () => void;
}

export const OrdersPage: React.FC<OrdersPageProps> = ({
  orders, setOrders, customers, products, trips = [],
  setDrawerConfig,
  apiEndpoint, isSaving, setIsSaving, isWarmingUp, isRetrying, isBackgroundSyncing, layoutMode,
  addToast, setToasts, saveOrderToCloud, setConflictData, handleForceRetry, requireAuth,
  setActiveTab, setIsAutoOrderDashboardOpen, prediction,
  isAddingOrder, setIsAddingOrder, editingOrderId, setEditingOrderId,
  quickAddData, setQuickAddData, lastOrderCandidate, setLastOrderCandidate,
  orderForm, setOrderForm,
  handleQuickAddSubmit, handleSwipeStatusChange, handleCopyOrder, handleShareOrder,
  handleEditOrder, handleSaveOrder, applyLastOrder, handleSelectExistingCustomer,
  openGoogleMaps, handleDeleteOrder, handleRetrySync,
  externalEditOrderId, onClearExternalEdit,
  externalAddOrderData, clearExternalAddOrder
}) => {

  const customerMap = useMemo(() => {
    const map: Record<string, Customer> = {};
    customers.forEach(c => { map[c.name] = c; if (c.id) map[c.id] = c; });
    return map;
  }, [customers]);

  const productMap = useMemo(() => {
    const map: Record<string, Product> = {};
    products.forEach(p => { if (p.id) map[p.id] = p; if (p.name) map[p.name] = p; });
    return map;
  }, [products]);

  const isLoadingProducts = isBackgroundSyncing && products.length === 0;

  // ==== Local States for Orders Page ====
  const [selectedDate, setSelectedDate] = useState<string>(getSmartDefaultDate());
  const [orderSearch, setOrderSearch] = useState('');
  const [orderDeliveryFilter, setOrderDeliveryFilter] = useState<string[]>([]);
  const [showOrderDeliveryFilters, setShowOrderDeliveryFilters] = useState(false);
  const [isSelectionMode, _setIsSelectionMode] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [isScrollingDown, setIsScrollingDown] = useState(false);
  const [lastScrollY, setLastScrollY] = useState(0);

  // ==== Modals/Forms States ====
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isOrderDatePickerOpen, setIsOrderDatePickerOpen] = useState(false);
  const [viewingCustomerProfile, setViewingCustomerProfile] = useState<string | null>(null);
  const [viewingCustomerReport, setViewingCustomerReport] = useState<string | null>(null);
  
  // ======== State moved to App.tsx & passed down via props ========
  // isAddingOrder, editingOrderId, quickAddData, lastOrderCandidate, orderForm
  
  const [customerPickerConfig, setCustomerPickerConfig] = useState<{isOpen: boolean; onSelect: (customerId: string) => void; currentSelectedId?: string;}>({ isOpen: false, onSelect: () => {} });
  const [pickerConfig, setPickerConfig] = useState<{isOpen: boolean; onSelect: (productId: string) => void; currentProductId?: string; customPrices?: CustomerPrice[];}>({ isOpen: false, onSelect: () => {} });


  // Sync external edit
  useEffect(() => {
    if (externalEditOrderId) {
      setEditingOrderId(externalEditOrderId);
      if (onClearExternalEdit) onClearExternalEdit();
    }
  }, [externalEditOrderId, onClearExternalEdit]);

  // Scroll listener for sticky header hiding
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY; 
      if (currentScrollY > lastScrollY && currentScrollY > 50) {
        setIsScrollingDown(true);
      } else if (currentScrollY < lastScrollY) {
        setIsScrollingDown(false);
      }
      setLastScrollY(currentScrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  const handleOrderFormChange = useCallback((field: string, value: any) => {
    setOrderForm((prev: any) => ({ ...prev, [field]: value }));
  }, [setOrderForm]);

  const handleCreateOrderFromCustomer = useCallback((c: Customer) => {
    setEditingOrderId(null);
    setOrderForm({
      customerType: 'existing',
      customerId: c.id!,
      customerName: c.name,
      deliveryTime: c.deliveryTime || '08:00',
      deliveryMethod: c.deliveryMethod || '',
      trip: c.defaultTrip || '',
      items: c.defaultItems && c.defaultItems.length > 0 ? c.defaultItems.map(di => ({ productId: di.productId, quantity: di.quantity, unit: di.unit })) : [{ productId: '', quantity: 10, unit: '斤' }],
      note: '',
      date: selectedDate
    });
    setIsAddingOrder(true);
  }, [selectedDate, setEditingOrderId, setOrderForm, setIsAddingOrder]);

  useEffect(() => {
    if (externalAddOrderData) {
      handleCreateOrderFromCustomer(externalAddOrderData);
      if (clearExternalAddOrder) {
        clearExternalAddOrder();
      }
    }
  }, [externalAddOrderData, handleCreateOrderFromCustomer, clearExternalAddOrder]);

  // Use calculations
  const { groupedOrders, orderSummary, getQuickAddPricePreview } = useOrderCalculations({
    orders, customers, products,
    selectedDate, orderSearch, orderDeliveryFilter,
    scheduleDate: '', scheduleDeliveryMethodFilter: [],
    workDates: [], workCustomerFilter: '', workProductFilter: new Set(), workDeliveryMethodFilter: [],
    customerSearch: '', settlementTarget: null, settlementDate: '', orderForm, quickAddData
  });

  const {
    isVoiceModalOpen, setIsVoiceModalOpen, isProcessingVoice, voiceLoadingText,
    handleProcessVoiceOrder, isAiMode, setIsAiMode
  } = useVoiceAssistant({
    customers, products, selectedDate, setSelectedDate,
    setOrderForm, setEditingOrderId, setIsAddingOrder,
    setCustomerPickerConfig, handleSelectExistingCustomer, addToast
  });

  return (
    <>
      <div className="space-y-6 relative pb-24">
        <div className="sticky top-0 z-30 bg-morandi-oatmeal py-2 space-y-2 px-1 mb-2 shadow-sm rounded-b-[20px] pb-4">
           {/* Top UI */}
           <motion.div 
             initial={false}
             animate={{ height: (isScrollingDown && layoutMode === 'compact') ? 0 : 'auto', opacity: (isScrollingDown && layoutMode === 'compact') ? 0 : 1, overflow: 'hidden' }}
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
                  onClick={() => { triggerHaptic(); setIsAutoOrderDashboardOpen(true); }} 
                  className="relative flex items-center justify-center gap-2 w-14 h-14 md:w-auto md:px-4 rounded-[20px] text-white font-bold shadow-md transition-all bg-gradient-to-br from-morandi-blue to-indigo-500 hover:shadow-lg"
                >
                  <Bot className="w-6 h-6" />
                  <span className="hidden md:inline">自動建單預覽</span>
                  {prediction?.greenZone?.length > 0 && (
                    <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm border-2 border-white">預計 {prediction.greenZone.length} 單</span>
                  )}
                </motion.button>
                <motion.button whileTap={buttonTap} onClick={() => setActiveTab('work')} className="w-14 h-14 rounded-[20px] bg-white text-morandi-pebble border border-slate-200 shadow-sm flex items-center justify-center hover:bg-slate-50 transition-all">
                   <FileText className="w-6 h-6" />
                </motion.button>
              </div>
           </motion.div>

           {/* Search & Filter */}
           <motion.div
             initial={false}
             animate={{ height: isScrollingDown ? 0 : 'auto', opacity: isScrollingDown ? 0 : 1, overflow: 'hidden', marginTop: (isScrollingDown && layoutMode === 'compact') ? 0 : undefined }}
             transition={{ duration: 0.3, ease: 'easeInOut' }}
             className="space-y-2"
           >
             <div className="flex gap-2 items-center">
               <div className="relative flex-1 flex items-center">
                 <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                 <input type="text" placeholder="搜尋客戶名稱或電話..." className="w-full pl-10 pr-20 py-3 bg-white rounded-[20px] border border-slate-200 shadow-sm text-sm font-bold text-morandi-charcoal focus:ring-2 focus:ring-morandi-blue transition-all placeholder:text-gray-300" value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} />
                 <div className="absolute right-2 flex items-center gap-1">
                   {orderSearch && <button onClick={() => setOrderSearch('')} className="p-1 rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200"><X className="w-3 h-3" /></button>}
                   <button onClick={() => setIsVoiceModalOpen(true)} className={`p-1.5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-morandi-blue bg-transparent ${isProcessingVoice ? 'text-rose-500 animate-pulse' : 'text-gray-400 hover:text-blue-500 hover:bg-gray-100'}`}><Mic className="w-5 h-5" /></button>
                 </div>
               </div>
               
               <button onClick={() => setShowOrderDeliveryFilters(!showOrderDeliveryFilters)} className={`relative flex-shrink-0 w-12 h-12 rounded-[20px] border flex items-center justify-center transition-all shadow-sm ${showOrderDeliveryFilters || orderDeliveryFilter.length > 0 ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-400 border-slate-200 hover:bg-slate-50'}`}>
                 <Filter className="w-5 h-5" />
                 {orderDeliveryFilter.length > 0 && <span className="absolute -top-1 -right-1 bg-rose-500 border-2 border-white text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">{orderDeliveryFilter.length}</span>}
               </button>
             </div>

             <AnimatePresence>
               {showOrderDeliveryFilters && (
                 <motion.div initial={{ height: 0, opacity: 0, marginTop: 0 }} animate={{ height: 'auto', opacity: 1, marginTop: 8 }} exit={{ height: 0, opacity: 0, marginTop: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                   <div className="flex gap-2 overflow-x-auto pb-2 pt-1 custom-scrollbar">
                     <button onClick={() => setOrderDeliveryFilter([])} className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${orderDeliveryFilter.length === 0 ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-400 border-gray-200'}`}>全部</button>
                     {DELIVERY_METHODS.map(m => {
                       const isSelected = orderDeliveryFilter.includes(m);
                       return (
                         <button key={m} onClick={() => { if (isSelected) setOrderDeliveryFilter(orderDeliveryFilter.filter(x => x !== m)); else setOrderDeliveryFilter([...orderDeliveryFilter, m]); }} className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${isSelected ? 'text-white border-transparent' : 'bg-white text-gray-400 border-gray-200'}`} style={{ backgroundColor: isSelected ? COLORS.primary : '' }}>{m}</button>
                       );
                     })}
                   </div>
                 </motion.div>
               )}
             </AnimatePresence>
           </motion.div>
        </div>

         {/* Orders List */}
         <div className="space-y-3">
          <div className="flex items-center justify-between px-2 mb-2">
            <h2 className="text-sm font-bold text-morandi-pebble flex items-center gap-2 uppercase tracking-widest"><Layers className="w-4 h-4" /> 配送列表 [{selectedDate}] ({Object.keys(groupedOrders).length} 家)</h2>
          </div>
          <motion.div variants={containerVariants} initial="hidden" animate="show">
          {Object.keys(groupedOrders).length > 0 ? (
            Object.entries(groupedOrders as Record<string, Order[]>).map(([custName, custOrders]) => {
                const isExpanded = expandedCustomer === custName;
                const currentCustomer = customerMap[custName];
                
                let totalAmount = 0;
                const itemTotals = new Map<string, number>();

                custOrders.forEach((o: Order) => { 
                  o.items.forEach((item: OrderItem) => { 
                    const p = productMap[item.productId]; 
                    const pName = item.productName || p?.name || (isBackgroundSyncing && products.length === 0 ? '載入中...' : '未知品項');
                    const unit = item.unit || p?.unit || '斤'; 
                    
                    const key = `${pName}::${unit}`;
                    itemTotals.set(key, (itemTotals.get(key) || 0) + item.quantity);

                    if (unit === '元') { 
                      totalAmount += item.quantity; 
                    } else { 
                      const priceInfo = currentCustomer?.priceList?.find(pl => pl.productId === item.productId); 
                      const price = priceInfo ? priceInfo.price : (p?.price || 0); 
                      totalAmount += Math.round(item.quantity * price); 
                    } 
                  }); 
                });

                const itemSummaries = Array.from(itemTotals.entries()).map(([key, qty]) => {
                  const [name, unit] = key.split('::');
                  return `${name} ${qty}${unit}`;
                });
                const summaryText = itemSummaries.join('、');

                const allPaid = custOrders.every(o => o.status === OrderStatus.PAID);
                const allShipped = custOrders.every(o => o.status === OrderStatus.SHIPPED || o.status === OrderStatus.PAID);
                let statusTag = { label: '待處理', color: 'bg-blue-50 text-blue-600 border-blue-100' };
                if (allPaid) statusTag = { label: '已收款', color: 'bg-emerald-50 text-emerald-600 border-emerald-100' };
                else if (allShipped) statusTag = { label: '已配送', color: 'bg-amber-50 text-amber-600 border-amber-100' };

                return (
                  <div key={custName} className="pb-3 px-1">
                    <motion.div variants={itemVariants} className="bg-white rounded-[24px] shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow duration-300">
                      <button onClick={() => setExpandedCustomer(isExpanded ? null : custName)} className="w-full flex items-center justify-between p-5 text-left active:bg-morandi-oatmeal/30 transition-colors">
                        <div className="flex items-center gap-4 overflow-hidden">
                          <div className={`w-12 h-12 rounded-[16px] flex-shrink-0 flex items-center justify-center text-xl font-extrabold transition-colors ${isExpanded ? 'bg-morandi-blue text-white' : 'bg-morandi-oatmeal text-morandi-pebble'}`}>{String(custName || '').charAt(0)}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className={`font-bold text-lg truncate tracking-tight ${isExpanded ? 'text-morandi-charcoal' : 'text-slate-700'}`}>{custName}</h3>
                              <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold flex-shrink-0 border ${statusTag.color}`}>{statusTag.label}</span>
                              {totalAmount > 0 && (<span className="bg-morandi-amber-bg text-morandi-amber-text text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 tracking-wide">${totalAmount.toLocaleString()}</span>)}
                            </div>
                            {!isExpanded && (<p className="text-xs text-morandi-pebble font-medium truncate leading-relaxed tracking-wide">{summaryText || `${custOrders.reduce((sum, o) => sum + o.items.length, 0)} 個品項`}</p>)}
                          </div>
                        </div>
                        {isExpanded ? <ChevronUp className="w-5 h-5 text-morandi-pebble flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-morandi-pebble flex-shrink-0" />}
                      </button>
                      
                      <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="bg-morandi-oatmeal/20 border-t border-slate-100 overflow-hidden">
                          <div className="p-5">
                          {custOrders.map((order) => (
                             <SwipeableOrderCard 
                                key={order.id} order={order} productMap={productMap} customerMap={customerMap}
                                isLoadingProducts={isLoadingProducts} isSelectionMode={isSelectionMode} isSelected={selectedOrderIds.has(order.id)}
                                onToggleSelection={() => { const newSet = new Set(selectedOrderIds); if (newSet.has(order.id)) newSet.delete(order.id); else newSet.add(order.id); setSelectedOrderIds(newSet); }}
                                onStatusChange={handleSwipeStatusChange} onDelete={() => requireAuth(() => handleDeleteOrder(order.id))}
                                onShare={handleShareOrder} onMap={openGoogleMaps} onEdit={(orderId) => requireAuth(() => handleEditOrder(orderId))}
                                onRetry={handleRetrySync} onViewCustomer={setViewingCustomerProfile}
                             />
                          ))}
                          <motion.button whileTap={buttonTap} onClick={() => requireAuth(() => setQuickAddData({ customerName: custName, items: [{productId: '', quantity: 10, unit: '斤'}] }))} className="w-full mt-2 py-3 rounded-[16px] border-2 border-dashed border-morandi-blue/30 text-morandi-blue font-bold text-sm flex items-center justify-center gap-2 hover:bg-morandi-blue/5 transition-colors tracking-wide"><Plus className="w-4 h-4" /> 追加訂單</motion.button>
                          <div className="flex gap-2 pt-2">
                             <motion.button whileTap={buttonTap} onClick={() => requireAuth(() => handleCopyOrder(custName, custOrders))} className="flex-1 py-3 px-4 rounded-[16px] bg-white text-morandi-pebble border border-slate-200 font-bold text-sm flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors shadow-sm tracking-wide"><Copy className="w-4 h-4" /> 複製</motion.button>
                             <motion.button whileTap={buttonTap} onClick={() => openGoogleMaps(custName)} className="flex-1 py-3 px-4 rounded-[16px] bg-morandi-blue text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-600 transition-colors shadow-lg shadow-morandi-blue/20 tracking-wide"><MapPin className="w-4 h-4" /> 導航</motion.button>
                          </div>
                          </div>
                        </motion.div>
                      )}
                      </AnimatePresence>
                    </motion.div>
                  </div>
                );
              })
          ) : (
            <div className="py-20 flex flex-col items-center text-center gap-4">
              {orderSearch || orderDeliveryFilter.length > 0 ? (
                 <>
                   <p className="text-gray-400 font-bold text-sm tracking-wide">找不到符合條件的訂單</p>
                   <button onClick={() => { setOrderSearch(''); setOrderDeliveryFilter([]); }} className="text-xs text-morandi-blue font-bold underline">清除篩選條件</button>
                 </>
              ) : (
                 <p className="text-gray-300 italic text-sm tracking-wide">此日期尚無訂單</p>
              )}
            </div>
          )}
          </motion.div>
        </div>

        {/* Floating Action Button */}
        <motion.div 
          initial={false}
          animate={{ opacity: isScrollingDown ? 0 : 1, scale: isScrollingDown ? 0.8 : 1, x: isScrollingDown ? 60 : 0 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-24 left-0 right-0 mx-auto w-full max-w-md pointer-events-none z-50 flex justify-end px-4 sm:px-6"
        >
          <motion.button 
            whileTap={buttonTap} whileHover={buttonHover} 
            onClick={() => requireAuth(() => { 
              setEditingOrderId(null); 
              setOrderForm({ customerType: 'existing', customerId: '', customerName: '', deliveryTime: '', deliveryMethod: '', trip: '', items: [{ productId: '', quantity: 10, unit: '斤' }], note: '', date: selectedDate });
              setIsAddingOrder(true); 
            })} 
            className={`pointer-events-auto text-white shadow-2xl shadow-morandi-blue/40 hover:bg-slate-600 active:scale-95 transition-all flex items-center justify-center bg-morandi-blue ${layoutMode === 'compact' ? 'h-14 px-6 rounded-full gap-2' : 'w-14 h-14 rounded-full'}`}
          >
            <Plus className={layoutMode === 'compact' ? "w-6 h-6" : "w-8 h-8"} />
            {layoutMode === 'compact' && <span className="font-bold text-lg tracking-wide whitespace-nowrap">建立訂單</span>}
          </motion.button>
        </motion.div>
      </div>

      {/* --- Modals --- */}
      {typeof document !== 'undefined' && createPortal(
        <>
          <AnimatePresence>{isDatePickerOpen && <DatePickerModal selectedDate={selectedDate} onSelect={setSelectedDate} onClose={() => setIsDatePickerOpen(false)} />}</AnimatePresence>
          <AnimatePresence>
            {isOrderDatePickerOpen && (
          <DatePickerModal 
            selectedDate={orderForm.date || selectedDate} 
            onSelect={(date) => { handleOrderFormChange('date', date); setIsOrderDatePickerOpen(false); }} 
            onClose={() => setIsOrderDatePickerOpen(false)} 
            offDays={customers.find(c => c.name === orderForm.customerName)?.offDays || []}
            holidayDates={customers.find(c => c.name === orderForm.customerName)?.holidayDates || []}
          />
        )}
      </AnimatePresence>

      <ProductPicker isOpen={pickerConfig.isOpen} onClose={() => setPickerConfig(prev => ({ ...prev, isOpen: false }))} onSelect={pickerConfig.onSelect} products={products} currentSelectedId={pickerConfig.currentProductId} customPrices={pickerConfig.customPrices} />
      <CustomerPicker isOpen={customerPickerConfig.isOpen} onClose={() => setCustomerPickerConfig(prev => ({ ...prev, isOpen: false }))} onSelect={customerPickerConfig.onSelect} customers={customers} orders={orders} selectedDate={orderForm.date || selectedDate} currentSelectedId={customerPickerConfig.currentSelectedId} />

      <VoiceInputModal isOpen={isVoiceModalOpen} onClose={() => setIsVoiceModalOpen(false)} onTranscriptComplete={handleProcessVoiceOrder} isAiMode={isAiMode} onToggleAiMode={setIsAiMode} />
      
      {viewingCustomerProfile && (
        <CustomerProfileDrawer isOpen={true} onClose={() => setViewingCustomerProfile(null)} customerName={viewingCustomerProfile} customers={customers} orders={orders} products={products} onCreateOrder={(c) => { handleCreateOrderFromCustomer(c); setActiveTab('orders'); }} onOpenReport={setViewingCustomerReport} />
      )}
      {viewingCustomerReport && (
        <CustomerReportModal isOpen={true} onClose={() => setViewingCustomerReport(null)} customerName={viewingCustomerReport} customers={customers} orders={orders} products={products} />
      )}

      {/* --- Global Loading Overlay for Voice Processing --- */}
      <AnimatePresence>
        {isProcessingVoice && (
          <motion.div key="voice-processing-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/60 z-[210] flex flex-col items-center justify-center backdrop-blur-sm">
             <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full mb-4" />
             <p className="text-white font-bold text-lg tracking-widest animate-pulse">{voiceLoadingText}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Order Form Modal --- */}
      <AnimatePresence>
      {isAddingOrder && (
        <motion.div key="order-modal" className="fixed inset-0 bg-morandi-oatmeal z-[60] flex flex-col">
          <motion.div initial={{ opacity: 0, y: "100%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="flex flex-col h-full">
          <div className="bg-white p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 z-10">
            <motion.button whileTap={buttonTap} onClick={() => { setIsAddingOrder(false); setEditingOrderId(null); if (onClearExternalEdit) onClearExternalEdit(); }} className="p-2 rounded-2xl bg-gray-50 text-morandi-pebble"><X className="w-6 h-6" /></motion.button>
            <h2 className="text-lg font-extrabold text-morandi-charcoal tracking-tight">{editingOrderId ? `編輯訂單 - ${orderForm.customerName}` : '建立配送訂單'}</h2>
            <motion.button whileTap={buttonTap} onClick={() => requireAuth(handleSaveOrder)} disabled={isSaving || isWarmingUp} className="font-bold px-4 py-2 transition-colors text-morandi-blue disabled:text-gray-300">{isWarmingUp ? '連線中...' : (isRetrying ? '↻ 正在重試...' : (isSaving ? '儲存中...' : (editingOrderId ? '更新訂單' : '儲存')))}</motion.button>
          </div>
          <div className="p-6 space-y-6 overflow-y-auto pb-10">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">配送日期</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none"><CalendarDays className="w-5 h-5 text-gray-400" /></div>
                <button type="button" onClick={() => setIsOrderDatePickerOpen(true)} className="w-full pl-12 pr-5 py-5 bg-white rounded-[24px] shadow-sm border border-slate-200 text-morandi-charcoal font-bold outline-none focus:ring-2 focus:ring-morandi-blue transition-all text-left flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>{orderForm.date || selectedDate}</span>
                    {(() => { const c = customers.find(x => x.name === orderForm.customerName); if (!c) return null; const dateObj = new Date(orderForm.date || selectedDate); const isHoliday = (c.offDays || []).includes(dateObj.getDay()) || (c.holidayDates || []).includes(orderForm.date || selectedDate); if (isHoliday) return <span className="bg-rose-100 text-rose-500 text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap">此日公休</span>; return null; })()}
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>

            <div className="flex bg-white p-1 rounded-[24px] shadow-sm border border-slate-100">
              <button onClick={() => handleOrderFormChange('customerType', 'existing')} className={`flex-1 py-4 rounded-[20px] text-xs font-bold transition-all tracking-wide ${orderForm.customerType === 'existing' ? 'bg-morandi-blue text-white shadow-md' : 'text-morandi-pebble'}`}>現有客戶</button>
              <button onClick={() => { handleOrderFormChange('customerType', 'retail'); handleOrderFormChange('customerId', ''); }} className={`flex-1 py-4 rounded-[20px] text-xs font-bold transition-all tracking-wide ${orderForm.customerType === 'retail' ? 'bg-morandi-blue text-white shadow-md' : 'text-morandi-pebble'}`}>零售客戶</button>
            </div>
            
            {orderForm.customerType === 'existing' ? (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">配送店家</label>
                <div className="relative">
                  <motion.button whileTap={buttonTap} onClick={() => setCustomerPickerConfig({ isOpen: true, currentSelectedId: orderForm.customerId, onSelect: (id) => handleSelectExistingCustomer(id) })} className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 flex justify-between items-center font-bold text-morandi-charcoal focus:ring-2 focus:ring-morandi-blue transition-all">
                    <span className="flex items-center gap-2">{orderForm.customerName || "選擇店家..."}{orderForm.customerName && groupedOrders[orderForm.customerName] && (<span className="bg-amber-400 text-white text-[9px] px-2 py-0.5 rounded-full tracking-wide">已建立</span>)}</span><ChevronDown className="w-5 h-5 text-gray-400" />
                  </motion.button>
                </div>
              </div>
            ) : (<div className="space-y-2"><label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">客戶名稱</label><input type="text" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 text-morandi-charcoal font-bold outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="輸入零售名稱..." value={orderForm.customerName} onChange={(e) => handleOrderFormChange('customerName', e.target.value)} /></div>)}
            
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">配送設定</label>
              <div className="flex gap-2">
                <div className="flex-1"><input type="time" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 text-morandi-charcoal font-bold outline-none focus:ring-2 focus:ring-morandi-blue transition-all" value={orderForm.deliveryTime} onChange={(e) => handleOrderFormChange('deliveryTime', e.target.value)} /></div>
                <div className="flex-1"><button type="button" onClick={() => setDrawerConfig({ isOpen: true, type: 'deliveryMethod', target: 'order', currentValue: orderForm.deliveryMethod, options: DELIVERY_METHODS, onSelect: (val: string) => handleOrderFormChange('deliveryMethod', val) })} className="w-full h-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 text-morandi-charcoal font-bold outline-none focus:ring-2 focus:ring-morandi-blue transition-all flex justify-between items-center"><span className={orderForm.deliveryMethod ? 'text-morandi-charcoal' : 'text-gray-400'}>{orderForm.deliveryMethod || '配送方式...'}</span><ChevronDown className="w-4 h-4 text-gray-400" /></button></div>
                <div className="flex-1"><button type="button" onClick={() => setDrawerConfig({ isOpen: true, type: 'trip', target: 'order', currentValue: orderForm.trip, options: trips, onSelect: (val: string) => handleOrderFormChange('trip', val) })} className="w-full h-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 text-morandi-charcoal font-bold outline-none focus:ring-2 focus:ring-morandi-blue transition-all flex justify-between items-center"><span className={orderForm.trip ? 'text-morandi-charcoal' : 'text-gray-400'}>{orderForm.trip || '選擇趟數...'}</span><ChevronDown className="w-4 h-4 text-gray-400" /></button></div>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">品項明細</label>
                <div className="flex gap-2">
                  {lastOrderCandidate && (<motion.button whileTap={buttonTap} onClick={applyLastOrder} className="text-[10px] font-bold text-white bg-morandi-blue px-2 py-1 rounded-lg shadow-sm flex items-center gap-1"><History className="w-3 h-3" /> 帶入{lastOrderCandidate.sourceLabel || '上次'} ({lastOrderCandidate.date})</motion.button>)}
                  <button onClick={() => handleOrderFormChange('items', [...orderForm.items, {productId: '', quantity: 10, unit: '斤'}])} className="text-[10px] font-bold text-morandi-blue tracking-wide"><Plus className="w-3 h-3 inline mr-1" /> 增加品項</button>
                </div>
              </div>
              {orderForm.items.map((item, idx) => (
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} key={idx} className="bg-white p-5 rounded-[28px] shadow-sm border border-slate-200 flex items-center gap-2 flex-wrap">
                  <div onClick={() => { const currentCustomer = customers.find(c => c.id === orderForm.customerId); setPickerConfig({ isOpen: true, currentProductId: item.productId, customPrices: currentCustomer?.priceList, onSelect: (pid) => { const n = [...orderForm.items]; const p = products.find(x => x.id === pid); n[idx] = { ...item, productId: pid, productName: p?.name, unit: p?.unit || '斤' }; handleOrderFormChange('items', n); } }); }} className="w-full sm:flex-1 bg-morandi-oatmeal/50 p-4 rounded-xl text-sm font-bold border border-slate-100 flex items-center justify-between cursor-pointer hover:border-morandi-blue transition-all mb-2 sm:mb-0"><span className={item.productId ? 'text-morandi-charcoal' : 'text-gray-400'}>{products.find(p => p.id === item.productId)?.name || '選擇品項...'}</span><ChevronDown className="w-4 h-4 text-gray-400" /></div>
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-between">
                    <input type="number" min="0" onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} className="w-20 bg-morandi-oatmeal/50 p-4 rounded-xl text-center font-bold border border-slate-100 text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" value={item.quantity === 0 ? '' : item.quantity} onChange={(e) => { const n = [...orderForm.items]; const val = parseFloat(e.target.value); n[idx].quantity = isNaN(val) ? 0 : Math.max(0, val); handleOrderFormChange('items', n); }} />
                    <select value={item.unit || '斤'} onChange={(e) => { const n = [...orderForm.items]; n[idx].unit = e.target.value; handleOrderFormChange('items', n); }} className="w-20 bg-morandi-oatmeal/50 p-4 rounded-xl font-bold text-morandi-charcoal border border-slate-100 outline-none focus:ring-2 focus:ring-morandi-blue transition-all">{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select>
                    <motion.button whileTap={buttonTap} onClick={() => { const n = orderForm.items.filter((_, i) => i !== idx); handleOrderFormChange('items', n.length ? n : [{productId:'', quantity:10, unit:'斤'}]); }} className="p-2 text-morandi-pink hover:text-rose-300 transition-colors"><Trash2 className="w-4 h-4" /></motion.button>
                  </div>
                </motion.div>
              ))}
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">訂單預覽</label>
              <div className="bg-morandi-amber-bg rounded-[24px] p-5 shadow-sm border border-amber-100/50">
                <div className="flex justify-between items-center mb-3 border-b border-amber-100 pb-2">
                  <div className="flex items-center gap-2 text-morandi-amber-text"><Calculator className="w-4 h-4" /><span className="text-xs font-bold tracking-wide">預估清單</span></div><div className="text-xs font-bold text-morandi-amber-text/60 tracking-wide">共 {orderSummary.details.filter(d => d.rawQty > 0).length} 項</div>
                </div>
                <div className="space-y-2 mb-4">
                  {orderSummary.details.filter(d => d.rawQty > 0).map((detail, i) => (<div key={i} className="flex justify-between items-center text-sm"><div className="flex flex-col"><span className="font-bold text-slate-700 tracking-wide">{detail.name}</span>{detail.isCalculated && (<span className="text-[10px] text-gray-400">(以單價 ${detail.unitPrice} 換算: {detail.rawQty}元 &rarr; {detail.displayQty}{detail.displayUnit})</span>)}</div><div className="flex items-center gap-3"><span className="font-bold text-slate-600">{detail.displayQty} {detail.displayUnit}</span><span className="font-black text-amber-600 w-12 text-right tracking-tight">${detail.subtotal}</span></div></div>))}
                  {orderSummary.details.filter(d => d.rawQty > 0).length === 0 && (<div className="text-center text-xs text-amber-400 italic py-2 tracking-wide">尚未加入有效品項</div>)}
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-amber-200"><span className="text-xs font-bold text-amber-700 tracking-wide">預估總金額</span><span className="text-xl font-black text-amber-600 tracking-tight">${orderSummary.totalPrice}</span></div>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">訂單備註</label>
              <textarea className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 text-morandi-charcoal font-bold resize-none outline-none focus:ring-2 focus:ring-morandi-blue transition-all placeholder:text-gray-300" rows={3} placeholder="備註特殊需求..." value={orderForm.note} onChange={(e) => handleOrderFormChange('note', e.target.value)} />
            </div>
          </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence>
        {quickAddData && (
          <div key="quick-add-modal" className="fixed inset-0 bg-morandi-charcoal/40 z-[70] flex flex-col items-center justify-center p-4 backdrop-blur-sm">
            <motion.div variants={modalVariants} initial="hidden" animate="visible" exit="exit" className="bg-white w-full max-w-sm max-h-[85vh] flex flex-col rounded-[32px] overflow-hidden shadow-xl border border-slate-200">
              <div className="p-5 bg-morandi-oatmeal/30 border-b border-gray-100 flex-shrink-0"><h3 className="text-center font-extrabold text-morandi-charcoal text-lg">追加訂單</h3><p className="text-center text-xs text-morandi-pebble font-bold tracking-wide mt-1">{quickAddData.customerName}</p></div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                <AnimatePresence initial={false}>
                  {quickAddData.items.map((item, index) => (
                    <motion.div key={index} initial={{ opacity: 0, height: 0, scale: 0.95 }} animate={{ opacity: 1, height: 'auto', scale: 1 }} exit={{ opacity: 0, height: 0, scale: 0.9 }} className="bg-white rounded-[20px] p-3 shadow-sm border border-slate-100 flex flex-wrap gap-2 items-center">
                      <div className="flex-1 min-w-[120px]">
                        <div onClick={() => { const currentCustomer = customers.find(c => c.name === quickAddData.customerName); setPickerConfig({ isOpen: true, currentProductId: item.productId, customPrices: currentCustomer?.priceList, onSelect: (pid) => { const newItems = [...quickAddData.items]; const p = products.find(x => x.id === pid); newItems[index] = { ...item, productId: pid, productName: p?.name, unit: p?.unit || '斤' }; setQuickAddData({...quickAddData, items: newItems}); } }); }} className="w-full bg-morandi-oatmeal/50 p-3 rounded-xl font-bold text-sm text-morandi-charcoal border border-slate-200 flex items-center justify-between cursor-pointer hover:border-morandi-blue transition-all">
                          <span className={item.productId ? 'text-slate-800' : 'text-gray-400'}>{products.find(p => p.id === item.productId)?.name || '選擇品項...'}</span><ChevronDown className="w-4 h-4 text-gray-400" />
                        </div>
                      </div>
                      <div className="w-20"><input type="number" min="0" className="w-full bg-morandi-oatmeal/50 p-3 rounded-xl text-center font-black text-lg text-morandi-charcoal border border-slate-200 outline-none focus:ring-2 focus:ring-morandi-blue transition-all" value={item.quantity === 0 ? '' : item.quantity} onChange={(e) => { const newItems = [...quickAddData.items]; const val = parseFloat(e.target.value); newItems[index].quantity = isNaN(val) ? 0 : Math.max(0, val); setQuickAddData({...quickAddData, items: newItems}); }} /></div>
                      <div className="w-20"><select value={item.unit || '斤'} onChange={(e) => { const newItems = [...quickAddData.items]; newItems[index].unit = e.target.value; setQuickAddData({...quickAddData, items: newItems}); }} className="w-full bg-morandi-oatmeal/50 p-3 rounded-xl font-bold text-morandi-charcoal border border-slate-100 outline-none focus:ring-2 focus:ring-morandi-blue transition-all">{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
                      <button onClick={() => { const newItems = quickAddData.items.filter((_, i) => i !== index); setQuickAddData({...quickAddData, items: newItems}); }} className="p-3 bg-rose-50 text-rose-400 hover:text-rose-600 rounded-xl transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <motion.button whileTap={buttonTap} onClick={() => setQuickAddData({...quickAddData, items: [...quickAddData.items, {productId: '', quantity: 10, unit: '斤'}]})} className="w-full py-3 rounded-[16px] border-2 border-dashed border-morandi-blue/30 text-morandi-blue font-bold text-sm flex items-center justify-center gap-2 hover:bg-morandi-blue/5 transition-colors tracking-wide mt-2"><Plus className="w-4 h-4" /> 增加品項</motion.button>
              </div>
              <div className="p-5 bg-white border-t border-gray-100 flex-shrink-0 space-y-4">
                <AnimatePresence>
                  {(() => { const preview = getQuickAddPricePreview(); if (preview && preview.total > 0) { return (<motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-morandi-amber-bg p-4 rounded-xl border border-amber-100 flex justify-between items-center"><div className="flex flex-col"><span className="text-[10px] font-bold text-morandi-amber-text/70 uppercase tracking-widest">預估總金額</span><span className="text-xs font-medium text-morandi-amber-text/60 mt-0.5 tracking-wide">共 {preview.itemCount} 個品項</span></div><span className="text-2xl font-black text-morandi-amber-text tracking-tight">${preview.total.toLocaleString()}</span></motion.div>); } return null; })()}
                </AnimatePresence>
                <div className="flex gap-2">
                  <motion.button whileTap={buttonTap} onClick={() => setQuickAddData(null)} className="flex-1 py-3 rounded-[16px] font-bold text-morandi-pebble hover:bg-gray-50 transition-colors border border-slate-200">取消</motion.button>
                  <motion.button whileTap={buttonTap} onClick={handleQuickAddSubmit} className="flex-1 py-3 rounded-[16px] font-bold text-white shadow-md bg-morandi-blue hover:bg-slate-600">確認追加</motion.button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </>, document.body)}
    </>
  );
};
