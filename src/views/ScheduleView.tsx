import React from 'react';
import { motion } from 'framer-motion';
import { CalendarCheck, Banknote, X, CheckSquare, Filter, Clock, Settings, Plus } from 'lucide-react';
import { WorkCalendar } from '../components/WorkCalendar';
import { ScheduleOrderCard } from '../components/ScheduleOrderCard';
import { SwipeableOrderCard } from '../components/SwipeableOrderCard';
import { TripReorderGroup } from '../components/TripReorderGroup';
import { ArrowUpDown } from 'lucide-react';
import { DELIVERY_METHODS, COLORS } from '../constants';

interface ScheduleViewProps {
  scheduleDate: string;
  setScheduleDate: (date: string) => void;
  orders: any[];
  setOrders: (orders: any[]) => void;
  scheduleMoneySummary: any;
  isSelectionMode: boolean;
  setIsSelectionMode: (mode: boolean) => void;
  selectedOrderIds: Set<string>;
  availableTrips: string[];
  handleSetTrip: (trip: string) => void;
  showScheduleDeliveryFilters: boolean;
  setShowScheduleDeliveryFilters: (show: boolean) => void;
  scheduleDeliveryMethodFilter: string[];
  setScheduleDeliveryMethodFilter: (filter: string[]) => void;
  scheduleOrders: any[];
  setIsTripManagerOpen: (open: boolean) => void;
  setSelectedDate: (date: string) => void;
  setOrderForm: (form: any) => void;
  setEditingOrderId: (id: string | null) => void;
  setIsAddingOrder: (isAdding: boolean) => void;
  isOrderReorderMode: boolean;
  setIsOrderReorderMode: (mode: boolean) => void;
  requireAuth: (fn: any) => void;
  customers: any[];
  products: any[];
  handleToggleSelectionStable: (id: string) => void;
  handleDeleteOrderStable: (id: string) => void;
  handleSwipeStatusChangeStable: (id: string, status: string) => void;
  handleShareOrderStable: (order: any) => void;
  isLoadingProducts: boolean;
  openGoogleMaps: (name: string) => void;
  reorderedOrderIds: Set<string>;
  setReorderedOrderIds: (ids: Set<string>) => void;
}

export const ScheduleView: React.FC<ScheduleViewProps> = (props) => {
  const {
    scheduleDate, setScheduleDate, orders, setOrders, scheduleMoneySummary,
    isSelectionMode, setIsSelectionMode, selectedOrderIds,
    availableTrips, handleSetTrip, showScheduleDeliveryFilters,
    setShowScheduleDeliveryFilters, scheduleDeliveryMethodFilter,
    setScheduleDeliveryMethodFilter, scheduleOrders,
    setIsTripManagerOpen, setSelectedDate, setOrderForm,
    setEditingOrderId, setIsAddingOrder, isOrderReorderMode,
    setIsOrderReorderMode, requireAuth, customers, handleToggleSelectionStable, handleSwipeStatusChangeStable,
    handleDeleteOrderStable, handleShareOrderStable, products,
    isLoadingProducts, openGoogleMaps, reorderedOrderIds, setReorderedOrderIds,
    } = props;

  const productMap = React.useMemo(() => {
    return products.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});
  }, [products]);

  const customerMap = React.useMemo(() => {
    return customers.reduce((acc, c) => ({ ...acc, [c.id]: c }), {});
  }, [customers]);

  return (
    <motion.div key="schedule" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0, zIndex: 10 }} exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }} transition={{ duration: 0.2 }} className="space-y-6 relative">
      <div className="px-1"><h2 className="text-xl font-extrabold text-morandi-charcoal flex items-center gap-2 mb-4 tracking-tight"><CalendarCheck className="w-5 h-5 text-morandi-blue" /> 配送行程</h2><div className="mb-6"><WorkCalendar selectedDate={scheduleDate} onSelect={setScheduleDate} orders={orders} /></div>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay: 0.2 }} className="bg-slate-700 rounded-[28px] p-5 shadow-lg text-white mb-6 relative overflow-hidden">
        <div className="absolute right-[-10px] bottom-[-20px] text-slate-600 opacity-20 rotate-12"><Banknote className="w-32 h-32" /></div>
        <div className="flex justify-between items-start mb-2 relative z-10"><div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">本日應收總額</p><h3 className="text-3xl font-black mt-1 text-white tracking-tight">${scheduleMoneySummary.totalReceivable.toLocaleString()}</h3></div><div className="text-right"><p className="text-[10px] font-bold text-morandi-green-text uppercase tracking-widest">已收款</p><h3 className="text-xl font-bold text-emerald-300 mt-1 tracking-tight">${scheduleMoneySummary.totalCollected.toLocaleString()}</h3></div></div><div className="w-full bg-slate-600 rounded-full h-1.5 mt-2 relative z-10"><motion.div className="bg-emerald-400 h-1.5 rounded-full" initial={{ width: 0 }} animate={{ width: `${scheduleMoneySummary.totalReceivable > 0 ? (scheduleMoneySummary.totalCollected / scheduleMoneySummary.totalReceivable) * 100 : 0}%` }} transition={{ duration: 1, ease: "easeOut" }} /></div><p className="text-[9px] text-slate-400 mt-2 text-right relative z-10 tracking-wide">尚有 ${(scheduleMoneySummary.totalReceivable - scheduleMoneySummary.totalCollected).toLocaleString()} 未收</p>
      </motion.div>
      
      <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar mb-4 items-center">
        <button onClick={() => setIsSelectionMode(!isSelectionMode)} className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-1 ${isSelectionMode ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-morandi-blue border-morandi-blue'}`}>{isSelectionMode ? <X className="w-3.5 h-3.5" /> : <CheckSquare className="w-3.5 h-3.5" />}{isSelectionMode ? '取消選取' : '批量操作'}</button>
        
        {isSelectionMode && selectedOrderIds.size > 0 && (
          <>
            <div className="w-[1px] h-6 bg-gray-300 mx-1"></div>
            {availableTrips.map((trip, idx) => {
              const colorClasses = [
                'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100',
                'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100',
                'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100',
                'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100',
                'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100',
                'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100',
              ];
              const colorClass = trip === '未分配' ? 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100' : colorClasses[idx % colorClasses.length];
              
              return (
                <button key={trip} onClick={() => handleSetTrip(trip)} className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${colorClass}`}>
                  設為{trip}
                </button>
              );
            })}
          </>
        )}
        
        <div className="w-[1px] h-6 bg-gray-300 mx-1"></div>
        <button 
          onClick={() => setShowScheduleDeliveryFilters(!showScheduleDeliveryFilters)} 
          className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-1 ${showScheduleDeliveryFilters || scheduleDeliveryMethodFilter.length > 0 ? 'bg-slate-100 text-slate-700 border-slate-300' : 'bg-white text-gray-400 border-gray-200'}`}
        >
          <Filter className="w-3.5 h-3.5" />
          篩選配送方式
          {scheduleDeliveryMethodFilter.length > 0 && (
            <span className="ml-1 bg-slate-700 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">
              {scheduleDeliveryMethodFilter.length}
            </span>
          )}
        </button>

        {showScheduleDeliveryFilters && (
          <>
            <button onClick={() => setScheduleDeliveryMethodFilter([])} className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${scheduleDeliveryMethodFilter.length === 0 ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-400 border-gray-200'}`}>全部方式</button>
            {DELIVERY_METHODS.map(m => { 
              const isSelected = scheduleDeliveryMethodFilter.includes(m); 
              return (
                <button 
                  key={m} 
                  onClick={() => { 
                    if (isSelected) { 
                      setScheduleDeliveryMethodFilter(scheduleDeliveryMethodFilter.filter(x => x !== m)); 
                    } else { 
                      setScheduleDeliveryMethodFilter([...scheduleDeliveryMethodFilter, m]); 
                    } 
                  }} 
                  className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${isSelected ? 'text-white border-transparent' : 'bg-white text-gray-400 border-gray-200'}`} 
                  style={{ backgroundColor: isSelected ? COLORS.primary : '' }}
                >
                  {m}
                </button>
              ); 
            })}
          </>
        )}
      </div>

      <div className="space-y-6 pb-20">
        <div className="flex justify-between items-center px-2">
          <h3 className="text-xs font-bold text-morandi-pebble uppercase tracking-widest flex items-center gap-2"><Clock className="w-4 h-4" /> 配送明細 [{scheduleDate}]</h3>
          <div className="flex items-center gap-2">
            <div className="text-xs font-bold text-gray-300 tracking-wide">共 {scheduleOrders.length} 筆</div>
            <button 
              onClick={() => setIsTripManagerOpen(true)}
              className="px-3 py-1 bg-white text-slate-600 border border-slate-200 text-xs font-bold rounded-full shadow-sm flex items-center gap-1 hover:bg-slate-50 transition-colors"
            >
              <Settings className="w-3 h-3" /> 編輯趟數
            </button>
            <button 
              onClick={() => {
                setSelectedDate(scheduleDate);
                setOrderForm({
                  customerType: 'existing',
                  customerId: '',
                  customerName: '',
                  deliveryTime: '',
                  deliveryMethod: '',
                  trip: '',
                  items: [{ productId: '', quantity: 10, unit: '斤' }],
                  note: '',
                  date: scheduleDate
                });
                setEditingOrderId(null);
                setIsAddingOrder(true);
              }}
              className="px-3 py-1 bg-morandi-blue text-white text-xs font-bold rounded-full shadow-sm flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> 臨時加單
            </button>
            
            <button 
              onClick={async () => {
                if (isOrderReorderMode) {
                  setIsOrderReorderMode(false);
                  setReorderedOrderIds(new Set());
                } else {
                  setIsOrderReorderMode(true);
                }
              }}
              className={`px-3 py-1 ${isOrderReorderMode ? 'bg-emerald-500 text-white outline outline-2 outline-emerald-200' : 'bg-white text-slate-600 border border-slate-200'} text-xs font-bold rounded-full shadow-sm flex items-center gap-1 transition-all`}
            >
              {isOrderReorderMode ? (
                <CheckSquare className="w-3 h-3" />
              ) : (
                <ArrowUpDown className="w-3 h-3" />
              )}
              <span>
                {isOrderReorderMode ? '完成排序' : '自訂順序'}
              </span>
            </button>
          </div>
        </div>
        
        <div className="space-y-4 relative min-h-[200px]">
          {scheduleOrders.length > 0 ? (
            isOrderReorderMode ? (
              <div className="space-y-6">
                {availableTrips.map(trip => {
                  const tripOrders = scheduleOrders.filter((o: any) => (o.trip || '未分配') === trip);
                  if (tripOrders.length === 0) return null;
                  return (
                    <div key={trip}>
                      <h4 className="font-bold text-sm text-slate-500 mb-2 px-1">{trip} ({tripOrders.length})</h4>
                      <TripReorderGroup 
                        tripOrders={tripOrders}
                        orders={orders}
                        setOrders={setOrders}
                        reorderedOrderIds={reorderedOrderIds}
                        setReorderedOrderIds={setReorderedOrderIds}
                        productMap={productMap}
                        customerMap={customerMap}
                        isLoadingProducts={isLoadingProducts}
                        isSelectionMode={isSelectionMode}
                        selectedOrderIds={selectedOrderIds}
                        handleToggleSelectionStable={handleToggleSelectionStable}
                        handleSwipeStatusChange={handleSwipeStatusChangeStable}
                        handleShareOrder={handleShareOrderStable}
                        openGoogleMaps={openGoogleMaps}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3 relative z-10">
                {scheduleOrders.map((order: any, i: number) => {
                  if (isSelectionMode) {
                    return (
                      <ScheduleOrderCard
                        key={order.id}
                        order={order}
                        productMap={productMap}
                        customerMap={customerMap}
                        isLoadingProducts={isLoadingProducts}
                        isSelected={selectedOrderIds.has(order.id)}
                        onToggleSelection={handleToggleSelectionStable}
                        onStatusChange={handleSwipeStatusChangeStable}
                        onShare={handleShareOrderStable}
                        onMap={openGoogleMaps}
                        isSelectionMode={isSelectionMode}
                      />
                    );
                  }
                  return (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <SwipeableOrderCard
                        order={order}
                        productMap={productMap}
                        customerMap={customerMap}
                        isLoadingProducts={isLoadingProducts}
                        onEdit={() => {
                          setEditingOrderId(order.id);
                          setOrderForm(order);
                          setIsAddingOrder(true);
                        }}
                        onDelete={() => requireAuth(() => handleDeleteOrderStable(order.id))}
                        onStatusChange={handleSwipeStatusChangeStable}
                        onShare={handleShareOrderStable}
                        onMap={openGoogleMaps}
                      />
                    </motion.div>
                  );
                })}
              </div>
            )
          ) : (
             <div className="text-center py-12 px-4 bg-white rounded-[32px] border border-slate-100 border-dashed">
               <div className="w-16 h-16 bg-morandi-bg rounded-full flex items-center justify-center mx-auto mb-3">
                 <CalendarCheck className="w-8 h-8 text-morandi-pebble" />
               </div>
               <p className="text-slate-700 font-bold tracking-tight mb-1">本日無配送行程</p>
               <p className="text-xs text-slate-400 tracking-wide font-medium">請選擇其他日期或新增配送單</p>
             </div>
          )}
        </div>
      </div>
      </div>
    </motion.div>
  );
};
