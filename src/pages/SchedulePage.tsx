import React, { useState, useMemo, useEffect } from 'react';
import { motion, Reorder } from 'framer-motion';
import { 
  CalendarCheck, Banknote, X, CheckSquare, Filter, Clock, Settings, GripVertical, Navigation 
} from 'lucide-react';
import { WorkCalendar } from '../components/WorkCalendar';
import { ScheduleOrderCard } from '../components/ScheduleOrderCard';
import { Order, Customer, Product, OrderStatus } from '../types';
import { getTomorrowDate } from '../utils';
import { DELIVERY_METHODS, COLORS } from '../constants';

export interface SchedulePageProps {
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  customers: Customer[];
  products: Product[];
  productMap: Record<string, Product>;
  customerMap: Record<string, Customer>;
  isLoadingProducts: boolean;
  availableTrips: string[];
  setAvailableTrips: React.Dispatch<React.SetStateAction<string[]>>;
  saveOrderToCloud: (
    order: Order, 
    action: string, 
    expectedVersion: number, 
    onSuccess: () => void, 
    onError: (msg: string) => void
  ) => void;
  setIsTripManagerOpen: (isOpen: boolean) => void;
  handleSwipeStatusChange: (id: string, status: 'PAID' | 'UNPAID') => void;
  handleShareOrder: (order: Order) => void;
  openGoogleMaps: (customerName: string) => void;
  addToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  calculateOrderTotalAmount: (order: Order) => number;
}

export const SchedulePage: React.FC<SchedulePageProps> = ({
  orders,
  setOrders,
  customers,
  products,
  productMap,
  customerMap,
  isLoadingProducts,
  availableTrips,
  setAvailableTrips,
  saveOrderToCloud,
  setIsTripManagerOpen,
  handleSwipeStatusChange,
  handleShareOrder,
  openGoogleMaps,
  addToast,
  calculateOrderTotalAmount
}) => {
  const [scheduleDate, setScheduleDate] = useState<string>(getTomorrowDate());
  const [scheduleDeliveryMethodFilter, setScheduleDeliveryMethodFilter] = useState<string[]>([]);
  const [showScheduleDeliveryFilters, setShowScheduleDeliveryFilters] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [isOrderReorderMode, setIsOrderReorderMode] = useState(false);
  const [reorderedOrderIds, setReorderedOrderIds] = useState<Set<string>>(new Set());

  // 清除選取狀態
  useEffect(() => {
    if (selectedOrderIds.size > 0) {
      setSelectedOrderIds(new Set());
      setIsSelectionMode(false);
    }
  }, [scheduleDate, scheduleDeliveryMethodFilter]);

  // 行程明細計算
  const scheduleOrders = useMemo(() => {
    const rawOrders = orders.filter(o => {
      if (o.pendingAction === 'delete') return false;
      if (o.deliveryDate !== scheduleDate) return false;
      if (scheduleDeliveryMethodFilter.length > 0) {
        const customer = customers.find(c => c.name === o.customerName);
        const method = o.deliveryMethod || customer?.deliveryMethod || '';
        if (!scheduleDeliveryMethodFilter.includes(method)) return false;
      }
      return true;
    }).sort((a, b) => {
      return a.deliveryTime.localeCompare(b.deliveryTime);
    });

    const seen = new Set();
    return rawOrders.filter(o => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });
  }, [orders, scheduleDate, scheduleDeliveryMethodFilter, customers]);

  // 金額摘要計算
  const scheduleMoneySummary = useMemo(() => {
    let totalReceivable = 0;
    let totalCollected = 0;
    scheduleOrders.forEach(order => {
      const amount = calculateOrderTotalAmount(order);
      totalReceivable += amount;
      if (order.status === OrderStatus.PAID) {
        totalCollected += amount;
      }
    });
    return { totalReceivable, totalCollected };
  }, [scheduleOrders, calculateOrderTotalAmount]);

  const handleSetTrip = async (tripName: string) => {
    if (selectedOrderIds.size === 0) return;

    const ids = Array.from(selectedOrderIds);
    
    // Optimistic update
    setOrders((prev: Order[]) => prev.map(o => {
      if (ids.includes(o.id)) {
        return { ...o, trip: tripName, syncStatus: 'pending', pendingAction: 'update' };
      }
      return o;
    }));

    // Sync each order
    for (const id of ids) {
      const order = orders.find(o => o.id === id);
      if (order) {
        const updatedOrder = { ...order, trip: tripName };
        saveOrderToCloud(
          updatedOrder,
          'updateOrderContent',
          order.version,
          () => {
            setOrders((prev: Order[]) => prev.map(o => o.id === id ? { ...o, syncStatus: 'synced', pendingAction: undefined } : o));
          },
          (errMsg: string) => {
            setOrders((prev: Order[]) => prev.map(o => o.id === id ? { ...o, syncStatus: 'error', errorMessage: errMsg } : o));
          }
        );
      }
    }

    setSelectedOrderIds(new Set());
    setIsSelectionMode(false);
  };

  const handleNavigateTrip = (tripOrders: Order[]) => {
    // 1. 取得該趟數所有不重複的店家名稱 (依照原本的訂單排序)
    const customerNames = Array.from(new Set(tripOrders.map(o => o.customerName)));
    
    if (customerNames.length === 0) return;

    // 取得對應的客戶資料，優先使用座標，其次使用地址，最後使用客戶名稱
    const getCustomerLocation = (name: string) => {
      const customer = customers.find(c => c.name === name);
      
      if (customer?.coordinates) {
        return customer.coordinates;
      }

      if (customer?.address) {
        return customer.address;
      }
      return name;
    };

    const locations = customerNames.map(getCustomerLocation);

    // 2. 終點是最後一個地點 (需進行 URL 編碼)
    const destination = encodeURIComponent(locations[locations.length - 1]);
    
    // 3. 中間的地點是停靠站 (waypoints)
    const waypoints = locations.slice(0, -1).map(loc => encodeURIComponent(loc)).join('|');
    
    // 4. 組合 Google Maps 導航網址 (未指定 origin 預設為使用者當前位置)
    let url = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
    
    if (waypoints) {
      url += `&waypoints=${waypoints}`;
    }
    
    // 5. 開啟新分頁導航 (在手機上會自動喚醒 Google Maps App)
    window.open(url, '_blank');
  };

  const getTripSummary = (tripOrders: Order[]) => {
    let totalWeight = 0;
    let totalAmount = 0;
    let totalQuantity = 0;
    
    tripOrders.forEach(order => {
      const customer = customers.find(c => c.name === order.customerName);
      
      order.items.forEach(item => {
        const product = products.find(p => p.id === item.productId || p.name === item.productId);
        const priceItem = customer?.priceList?.find(pl => pl.productId === (product?.id || item.productId));
        const unitPrice = priceItem ? priceItem.price : (product?.price || 0);
        
        if (item.unit === '元') {
          totalAmount += item.quantity;
        } else {
          totalAmount += Math.round(item.quantity * unitPrice);
          if (item.unit === '斤' || item.unit === '公斤') {
            totalWeight += item.quantity;
          } else {
            totalQuantity += item.quantity;
          }
        }
      });
    });
    
    return { totalWeight, totalQuantity, totalAmount };
  };

  return (
    <div className="space-y-6 relative">
      <div className="px-1"><h2 className="text-xl font-extrabold text-morandi-charcoal flex items-center gap-2 mb-4 tracking-tight"><CalendarCheck className="w-5 h-5 text-morandi-blue" /> 配送行程</h2><div className="mb-6"><WorkCalendar selectedDate={scheduleDate} onSelect={setScheduleDate} orders={orders} /></div>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay: 0.2 }} className="bg-slate-700 rounded-[28px] p-5 shadow-lg text-white mb-6 relative overflow-hidden"><div className="absolute right-[-10px] bottom-[-20px] text-slate-600 opacity-20 rotate-12"><Banknote className="w-32 h-32" /></div><div className="flex justify-between items-start mb-2 relative z-10"><div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">本日應收總額</p><h3 className="text-3xl font-black mt-1 text-white tracking-tight">${scheduleMoneySummary.totalReceivable.toLocaleString()}</h3></div><div className="text-right"><p className="text-[10px] font-bold text-morandi-green-text uppercase tracking-widest">已收款</p><h3 className="text-xl font-bold text-emerald-300 mt-1 tracking-tight">${scheduleMoneySummary.totalCollected.toLocaleString()}</h3></div></div><div className="w-full bg-slate-600 rounded-full h-1.5 mt-2 relative z-10"><motion.div className="bg-emerald-400 h-1.5 rounded-full" initial={{ width: 0 }} animate={{ width: `${scheduleMoneySummary.totalReceivable > 0 ? (scheduleMoneySummary.totalCollected / scheduleMoneySummary.totalReceivable) * 100 : 0}%` }} transition={{ duration: 1, ease: "easeOut" }} /></div><p className="text-[9px] text-slate-400 mt-2 text-right relative z-10 tracking-wide">尚有 ${(scheduleMoneySummary.totalReceivable - scheduleMoneySummary.totalCollected).toLocaleString()} 未收</p></motion.div>
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
              onClick={async () => {
                if (isOrderReorderMode) {
                  // Save reordered orders to cloud
                  if (reorderedOrderIds.size > 0) {
                    const ordersToSync = orders.filter(o => reorderedOrderIds.has(o.id));
                    ordersToSync.forEach(order => {
                      saveOrderToCloud(order, 'updateOrderContent', order.version, () => {
                        setOrders((prev: Order[]) => prev.map(o => o.id === order.id ? { ...o, syncStatus: 'synced', pendingAction: undefined } : o));
                      }, (errMsg: string) => {
                        setOrders((prev: Order[]) => prev.map(o => o.id === order.id ? { ...o, syncStatus: 'error', errorMessage: errMsg } : o));
                      });
                    });
                    setReorderedOrderIds(new Set());
                    addToast('排序已儲存', 'success');
                  }
                }
                setIsOrderReorderMode(!isOrderReorderMode);
              }}
              className={`px-3 py-1 text-xs font-bold rounded-full shadow-sm flex items-center gap-1 transition-colors ${isOrderReorderMode ? 'bg-rose-500 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
            >
              {isOrderReorderMode ? <CheckSquare className="w-3 h-3" /> : <GripVertical className="w-3 h-3" />}
              {isOrderReorderMode ? '完成排序' : '調整排序'}
            </button>
          </div>
        </div>
        
        {(() => {
          const groupedByTrip = availableTrips.reduce((acc, trip) => {
            acc[trip] = [];
            return acc;
          }, {} as Record<string, Order[]>);

          scheduleOrders.forEach(order => {
            const trip = order.trip || '未分配';
            if (!groupedByTrip[trip]) groupedByTrip[trip] = [];
            groupedByTrip[trip].push(order);
          });

          const sortedTrips = Object.keys(groupedByTrip).sort((a, b) => {
            const indexA = availableTrips.indexOf(a);
            const indexB = availableTrips.indexOf(b);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.localeCompare(b);
          });

          return sortedTrips.map(trip => {
            const tripOrders = groupedByTrip[trip].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            const summary = getTripSummary(tripOrders);
            
            const colorClasses = [
              'bg-blue-50 text-blue-600 border-blue-100',
              'bg-indigo-50 text-indigo-600 border-indigo-100',
              'bg-emerald-50 text-emerald-600 border-emerald-100',
              'bg-amber-50 text-amber-600 border-amber-100',
              'bg-rose-50 text-rose-600 border-rose-100',
              'bg-purple-50 text-purple-600 border-purple-100',
            ];
            
            let headerColor = trip === '未分配' ? 'bg-gray-100 text-gray-600 border-gray-200' : colorClasses[availableTrips.indexOf(trip) % colorClasses.length];

            return (
              <div key={trip} className="bg-gray-50 rounded-2xl p-3 border border-gray-100">
                <div className={`flex justify-between items-center mb-3 px-3 py-2 rounded-xl border ${headerColor}`}>
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    {trip}
                    <span className="text-xs font-normal bg-white/50 px-2 py-0.5 rounded-full">{tripOrders.length}</span>
                    
                    {/* 新增：Google 導航按鈕 */}
                    {tripOrders.length > 0 && (
                      <button 
                        onClick={() => handleNavigateTrip(tripOrders)} 
                        className="ml-2 p-1.5 bg-blue-500 text-white hover:bg-blue-600 rounded-full shadow-sm transition-all flex items-center gap-1"
                        title="Google 路線導航"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold pr-1">導航</span>
                      </button>
                    )}
                  </h4>
                  {trip !== '未分配' && (
                    <div className="text-right">
                      <div className="text-[10px] font-bold opacity-70">總重: {summary.totalWeight}斤 / 數量: {summary.totalQuantity}</div>
                      <div className="text-xs font-bold">金額: ${summary.totalAmount.toLocaleString()}</div>
                    </div>
                  )}
                </div>
                
                {isOrderReorderMode ? (
                  <Reorder.Group 
                    axis="y" 
                    values={tripOrders} 
                    onReorder={(newOrderList) => {
                      const newSet = new Set(reorderedOrderIds);
                      const updatedOrders = orders.map(o => {
                        const index = newOrderList.findIndex(no => no.id === o.id);
                        if (index !== -1) {
                          const newSortOrder = index * 10;
                          if (o.sortOrder !== newSortOrder) {
                            newSet.add(o.id);
                            return { ...o, sortOrder: newSortOrder, syncStatus: 'pending' as const, pendingAction: 'update' as const };
                          }
                        }
                        return o;
                      });
                      setReorderedOrderIds(newSet);
                      setOrders(updatedOrders);
                    }}
                    className="space-y-3"
                  >
                    {tripOrders.map((order) => (
                      <Reorder.Item key={order.id} value={order} className="relative">
                        <div className="flex items-center gap-2">
                          <div className="cursor-grab active:cursor-grabbing p-2">
                            <GripVertical className="w-5 h-5 text-gray-400" />
                          </div>
                          <div className="flex-1 pointer-events-none">
                            <ScheduleOrderCard 
                              order={order}
                              productMap={productMap}
                              customerMap={customerMap}
                              isLoadingProducts={isLoadingProducts}
                              isSelectionMode={isSelectionMode}
                              isSelected={selectedOrderIds.has(order.id)}
                              onToggleSelection={() => { const newSet = new Set(selectedOrderIds); if (newSet.has(order.id)) newSet.delete(order.id); else newSet.add(order.id); setSelectedOrderIds(newSet); }}
                              onStatusChange={handleSwipeStatusChange}
                              onShare={handleShareOrder}
                              onMap={openGoogleMaps}
                            />
                          </div>
                        </div>
                      </Reorder.Item>
                    ))}
                  </Reorder.Group>
                ) : (
                  <div className="space-y-3">
                    {tripOrders.map((order) => (
                      <div key={order.id} className="relative">
                        <ScheduleOrderCard 
                          order={order}
                          productMap={productMap}
                          customerMap={customerMap}
                          isLoadingProducts={isLoadingProducts}
                          isSelectionMode={isSelectionMode}
                          isSelected={selectedOrderIds.has(order.id)}
                          onToggleSelection={() => { const newSet = new Set(selectedOrderIds); if (newSet.has(order.id)) newSet.delete(order.id); else newSet.add(order.id); setSelectedOrderIds(newSet); }}
                          onStatusChange={handleSwipeStatusChange}
                          onShare={handleShareOrder}
                          onMap={openGoogleMaps}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          });
        })()}
        
        {scheduleOrders.length === 0 && (
          <div className="text-center py-10"><p className="text-gray-300 font-bold text-sm tracking-wide">本日無配送行程</p></div>
        )}
      </div>
      </div>
    </div>
  );
};
