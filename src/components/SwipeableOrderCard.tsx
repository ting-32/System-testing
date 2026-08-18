import React, { useEffect, useMemo } from 'react';
import { motion, useMotionValue, useTransform, PanInfo, animate } from 'framer-motion';
import { CheckCircle2, Trash2, Clock, ChevronDown, Share2, MapPin, Edit2, AlertCircle, RefreshCw, RotateCcw, Truck, Banknote, Bot, MessageCircle, Sparkles, AlertTriangle } from 'lucide-react';
import { Order, OrderStatus, Product, Customer } from '../types';
import { ORDERING_HABITS, isWalkInCustomer } from '../constants';
import { getStatusStyles, formatTimeDisplay } from '../utils';
import { buttonTap, triggerHaptic } from './animations';
import { SyncableStatusWrapper } from './SyncableStatusWrapper';


interface SwipeableOrderCardProps {
  order: Order;
  productMap: Record<string, Product>;
  customerMap: Record<string, Customer>;
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelection: () => void;
  onStatusChange: (id: string, status: OrderStatus) => void;
  onDelete: (id: string) => void;
  onShare: (order: Order) => void;
  onMap: (name: string) => void;
  onEdit: (order: Order) => void;
  onRetry?: (id: string) => void;
  onDiscardLocal?: (id: string) => void;
  onViewCustomer?: (customerName: string) => void;
  isLoadingProducts?: boolean;
}

export const SwipeableOrderCard: React.FC<SwipeableOrderCardProps> = ({ 
  order, productMap, customerMap, isSelectionMode, isSelected, onToggleSelection, 
  onStatusChange, onDelete, onShare, onMap, onEdit, onRetry, onDiscardLocal, onViewCustomer, isLoadingProducts
}) => {
  const x = useMotionValue(0);
  
  useEffect(() => { x.set(0); }, [order.status, x]);
  
  // 確保元件被卸載時，強制清除 body 上的 pointer-events 鎖定
  useEffect(() => {
    return () => {
      document.body.style.pointerEvents = '';
    };
  }, []);
  
  const statusConfig = getStatusStyles(order.status || OrderStatus.PENDING);
  
  const customer = customerMap[order.customerName];
  const isWalkIn = isWalkInCustomer(order.paymentTerm || customer?.paymentTerm);
  const effectiveDeliveryTime = (order.deliveryTime && order.deliveryTime.trim() !== '') 
    ? order.deliveryTime.trim() 
    : (customer?.deliveryTime && customer.deliveryTime.trim() !== '' ? customer.deliveryTime.trim() : '');
  const isTimeAuto = order.isTimeAutoFilled || (!order.deliveryTime && !!customer?.deliveryTime);

  const effectiveTrip = (order.trip && order.trip.trim() !== '')
    ? order.trip.trim()
    : (customer?.defaultTrip && customer.defaultTrip.trim() !== '' ? customer.defaultTrip.trim() : '');
  const isTripAuto = order.isTripAutoFilled || (!order.trip && !!customer?.defaultTrip);

  const totalAmount = useMemo(() => { 
    let total = 0; 
    order.items.forEach(item => { 
      const product = productMap[item.productId]; 
      const priceItem = customer?.priceList?.find(pl => pl.productId === (product?.id || item.productId)); 
      const unitPrice = priceItem ? priceItem.price : (product?.price || 0); 
      if (item.unit === '元') { 
        total += item.quantity; 
      } else { 
        total += Math.round(item.quantity * unitPrice); 
      } 
    }); 
    return total; 
  }, [order.items, customer, productMap]);
  
  const habitLabel = ORDERING_HABITS.find(h => h.value === customer?.paymentTerm)?.label;
  const DRAG_THRESHOLD = 80;
  const isSyncError = order.syncStatus === 'error' || order._syncStatus === 'error';
  const isSyncPending = order.syncStatus === 'pending' || order._syncStatus === 'pending';
  
  const handleDragEnd = (_event: any, info: PanInfo) => { 
    if (isSelectionMode) return;
    const offset = info.offset.x; 
    if (offset > DRAG_THRESHOLD) { 
      triggerHaptic(50); 
      animate(x, 0, { type: 'spring', stiffness: 300, damping: 20 });
      if (order.status === OrderStatus.PENDING) {
        onStatusChange(order.id, OrderStatus.SHIPPED);
      } else if (order.status === OrderStatus.SHIPPED || order.status === OrderStatus.PAID_UNSHIPPED) {
        // 若訂單處於已收款未配送 (PAID_UNSHIPPED)，往右滑動送達現場後直接切換為 PAID 完成
        onStatusChange(order.id, OrderStatus.PAID);
      }
    } else if (offset < -DRAG_THRESHOLD) { 
      triggerHaptic([50, 50, 50]); 
      animate(x, 0, { type: 'spring', stiffness: 300, damping: 20 });
      if (order.status === OrderStatus.PAID) {
        onStatusChange(order.id, OrderStatus.SHIPPED);
      } else if (order.status === OrderStatus.SHIPPED) {
        onStatusChange(order.id, OrderStatus.PENDING);
      } else if (order.status === OrderStatus.PAID_UNSHIPPED) {
        onStatusChange(order.id, OrderStatus.PENDING);
      } else {
        onDelete(order.id); 
      }
    } 
  };
  
  const bgOpacityRight = useTransform(x, [0, DRAG_THRESHOLD], [0, 1]); 
  const bgScaleRight = useTransform(x, [0, DRAG_THRESHOLD], [0.8, 1.2]); 
  const bgOpacityLeft = useTransform(x, [0, -DRAG_THRESHOLD], [0, 1]); 
  const bgScaleLeft = useTransform(x, [0, -DRAG_THRESHOLD], [0.8, 1.2]);

  const handleStatusSelectChange = (status: OrderStatus) => {
    triggerHaptic(50);
    onStatusChange(order.id, status);
  };
  
  return ( 
    <div className={`relative mb-4`}> 
      <div className="absolute inset-0 rounded-[32px] flex items-center justify-between px-6 pointer-events-none overflow-hidden"> 
        <motion.div style={{ opacity: bgOpacityRight, scale: bgScaleRight }} className={`flex items-center gap-2 font-bold ${order.status === OrderStatus.PENDING ? 'text-blue-500' : order.status === OrderStatus.SHIPPED ? 'text-emerald-500' : 'text-transparent'}`}> 
          {order.status === OrderStatus.PENDING && (
            <>
              <Truck className="w-8 h-8" /> 
              <span className="text-sm">標記出貨</span> 
            </>
          )}
          {order.status === OrderStatus.SHIPPED && (
            <>
              <Banknote className="w-8 h-8" /> 
              <span className="text-sm">標記收款</span> 
            </>
          )}
        </motion.div> 
        <motion.div style={{ opacity: bgOpacityLeft, scale: bgScaleLeft }} className={`flex items-center gap-2 font-bold ${order.status === OrderStatus.PENDING ? 'text-rose-500' : 'text-amber-500'}`}> 
          {order.status === OrderStatus.PENDING ? (
            <>
              <span className="text-sm">刪除訂單</span> 
              <Trash2 className="w-8 h-8" /> 
            </>
          ) : order.status === OrderStatus.SHIPPED ? (
            <>
              <span className="text-sm">退回待處理</span> 
              <RotateCcw className="w-8 h-8" /> 
            </>
          ) : (
            <>
              <span className="text-sm">退回出貨</span> 
              <RotateCcw className="w-8 h-8" /> 
            </>
          )}
        </motion.div> 
      </div> 
      <motion.div 
        drag={isSelectionMode ? false : "x"} 
        dragConstraints={{ left: 0, right: 0 }} 
        dragElastic={0.7} 
        dragDirectionLock={true} 
        onDragEnd={handleDragEnd} 
        style={{ x }} 
        initial={false} 
        animate={{ 
            backgroundColor: statusConfig.cardBg, 
            x: isSelectionMode ? 10 : 0,
            opacity: 1
        }} 
        className={`rounded-[32px] overflow-hidden shadow-sm relative z-10 touch-pan-y ${isSelectionMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`} 
        onClick={() => { if (isSelectionMode) onToggleSelection(); }} 
      > 
        <SyncableStatusWrapper syncStatus={order.syncStatus || order._syncStatus} onRetry={() => onRetry?.(order.id)} roundedClass="rounded-[32px]">
        {isSelectionMode && ( 
          <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20"> 
            {isSelected ? <div className="w-6 h-6 rounded-lg bg-morandi-blue flex items-center justify-center text-white shadow-md"><CheckCircle2 className="w-4 h-4" /></div> : <div className="w-6 h-6 rounded-lg border-2 border-slate-300 bg-white" />} 
          </div> 
        )} 

        <div className={`p-5 transition-all ${isSelectionMode ? 'pl-14' : ''}`}> 
          {/* 【頂層：核心出車節點】只放 時間、趟次 與 狀態切換選單 */}
          <div className="flex justify-between items-center mb-3 gap-2"> 
            <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1"> 
              {/* 1. 配送時間 (含 ✨ 預設指示) */}
              {isWalkIn ? (
                <div className="px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                  <span className="text-xs">📦</span>
                  <span>散客</span>
                  {effectiveDeliveryTime && (
                    <span className="text-[11px] text-slate-500 font-mono">({formatTimeDisplay(effectiveDeliveryTime)})</span>
                  )}
                </div>
              ) : (
                <div 
                  title={isTimeAuto ? "此時間為系統依【店家預設】自動填入" : undefined}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors duration-300 shrink-0 ${
                    !effectiveDeliveryTime 
                      ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                      : (isTimeAuto ? 'ring-1 ring-morandi-blue/20' : '')
                  }`} 
                  style={effectiveDeliveryTime ? { backgroundColor: statusConfig.tagBg, color: statusConfig.tagText } : {}}
                > 
                  <Clock className="w-3.5 h-3.5" /> 
                  {effectiveDeliveryTime ? (
                    <span className="flex items-center gap-1">
                      {formatTimeDisplay(effectiveDeliveryTime)}
                      {isTimeAuto && <Sparkles className="w-2.5 h-2.5 text-morandi-blue opacity-80" />}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-800">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      未設時間
                    </span>
                  )}
                </div>
              )}

              {/* 2. 趟次 (含 ✨ 自動指示) */}
              {effectiveTrip && (
                <div 
                  title={isTripAuto ? "此趟數為系統依【店家預設】自動填入" : undefined}
                  className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 shrink-0"
                >
                  <span>{effectiveTrip}</span>
                  {isTripAuto && <Sparkles className="w-2.5 h-2.5 text-emerald-600 opacity-80" />}
                </div>
              )}
            </div> 

            {/* 3. 狀態選單 (確保不被壓縮) */}
            <div className="relative group shrink-0" onClick={(e) => isSelectionMode && e.stopPropagation()}> 
              <select disabled={isSelectionMode} value={order.status || OrderStatus.PENDING} onChange={(e) => handleStatusSelectChange(e.target.value as OrderStatus)} className={`appearance-none pl-3 pr-8 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer outline-none transition-all duration-300 border border-transparent hover:brightness-95 ${isSelectionMode ? 'opacity-50 pointer-events-none' : ''}`} style={{ backgroundColor: statusConfig.tagBg, color: statusConfig.tagText }}> 
                <option value={OrderStatus.PENDING}>待處理</option>
                <option value={OrderStatus.SHIPPED}>已配送</option>
                <option value={OrderStatus.PAID_UNSHIPPED}>已收未配</option>
                <option value={OrderStatus.PAID}>已收款</option> 
              </select> 
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-300 group-hover:rotate-180" style={{ color: statusConfig.iconColor }} /> 
            </div> 
          </div> 

          {/* 【主標行：店名與金額】 */}
          <div className="flex justify-between items-baseline mb-2"> 
            <h4 
              className={`font-extrabold text-slate-800 text-xl tracking-tight leading-snug ${onViewCustomer ? 'cursor-pointer hover:text-morandi-blue underline decoration-slate-300 hover:decoration-morandi-blue decoration-2 underline-offset-4 transition-colors' : ''}`}
              onClick={(e) => {
                if (onViewCustomer) {
                  e.stopPropagation();
                  onViewCustomer(order.customerName);
                }
              }}
            >
              {order.customerName}
            </h4> 
            <div className="flex flex-col items-end shrink-0 pl-2">
              {isLoadingProducts ? (
                <div className="h-6 w-16 bg-slate-200/70 animate-pulse rounded-md"></div>
              ) : (
                <span className="font-mono font-black text-xl text-morandi-charcoal tracking-tight"><span className="text-sm text-gray-400 mr-1">$</span>{totalAmount.toLocaleString()}</span>
              )}
            </div> 
          </div>

          {/* 【次層：屬性徽章區塊】放置 來源、配送方式、預訂習慣 */}
          {(order.source || order.deliveryMethod || habitLabel) && (
            <div className="flex items-center gap-1.5 flex-wrap mb-4">
              {/* 建單來源標籤 */}
              {order.source && (
                <span 
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border tracking-wide
                    ${order.source.includes('LINE') 
                      ? 'bg-[#06C755]/10 text-[#06C755] border-[#06C755]/20'
                      : (order.source.includes('系統') || order.source.includes('自動建單'))
                        ? 'bg-purple-50 text-purple-600 border-purple-100'
                        : 'bg-gray-50 text-gray-500 border-gray-200'
                    }
                  `}
                >
                  {order.source.includes('LINE') ? (
                    <MessageCircle className="w-3 h-3" /> 
                  ) : (
                    <Bot className="w-3 h-3" />
                  )}
                  {order.source}
                </span>
              )}

              {/* 配送方式標籤 */}
              {order.deliveryMethod && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/80 shrink-0">
                  {order.deliveryMethod.includes('機車') ? '🛵' : order.deliveryMethod.includes('自取') ? '🏪' : '🚚'}
                  <span>{order.deliveryMethod}</span>
                </span>
              )}

              {/* 預訂習慣標籤 */}
              {habitLabel && (
                <span className="text-[10px] font-bold text-slate-500 bg-blue-50/70 px-2 py-0.5 rounded-md border border-blue-100/80">
                  {habitLabel}
                </span>
              )}
            </div>
          )} 
          <div className="space-y-2"> 
            {order.items.map((item, idx) => { 
              const p = productMap[item.productId]; 
              return ( 
                <div key={idx} className="flex justify-between items-center py-2 px-3 bg-white/60 rounded-[16px] border border-black/5"> 
                  {isLoadingProducts ? (
                    <div className="h-[18px] w-20 bg-slate-200/70 animate-pulse rounded"></div>
                  ) : (
                    <span className="text-sm font-bold text-slate-600 tracking-wide">{item.productName || p?.name || (isLoadingProducts ? '載入中...' : '未知品項')}</span> 
                  )}
                  <div className="flex items-baseline gap-1">
                    <span className="font-black text-lg text-slate-800">{item.quantity}</span>
                    {isLoadingProducts ? (
                      <div className="h-3 w-4 bg-slate-200/70 animate-pulse rounded ml-1"></div>
                    ) : (
                      <span className="text-[10px] font-bold text-gray-400">{item.unit || p?.unit || '斤'}</span>
                    )}
                  </div> 
                </div> 
              ); 
            })} 
          </div> 
          
          {/* Error Message & Retry Button */}
          {isSyncError && (
            <div className="mt-3 bg-rose-50 border border-rose-100 rounded-xl p-3 flex flex-col gap-2">
                <div className="text-xs text-rose-600 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    <span>{order.errorMessage || '同步失敗'}</span>
                </div>
                <div className="flex justify-end gap-2 mt-1">
                    {onDiscardLocal && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); onDiscardLocal(order.id); }}
                            className="text-xs bg-white text-rose-600 border border-rose-200 px-3 py-1.5 rounded-lg font-bold shadow-sm active:scale-95 transition-transform flex items-center gap-1"
                        >
                            <Trash2 className="w-3 h-3" /> 捨棄
                        </button>
                    )}
                    {onRetry && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); onRetry(order.id); }}
                            className="text-xs bg-rose-500 text-white px-3 py-1.5 rounded-lg font-bold shadow-sm active:scale-95 transition-transform flex items-center gap-1"
                        >
                            <RefreshCw className="w-3 h-3" /> 重試
                        </button>
                    )}
                </div>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-black/5 flex justify-between items-center"> 
            <div className="flex gap-2"> 
              <motion.button disabled={isSelectionMode} whileTap={buttonTap} onClick={(e) => { e.stopPropagation(); onShare(order); }} className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-slate-400 hover:text-slate-600 hover:shadow-sm transition-all border border-black/5 disabled:opacity-50"><Share2 className="w-4 h-4" /></motion.button> 
              <motion.button disabled={isSelectionMode} whileTap={buttonTap} onClick={(e) => { e.stopPropagation(); onMap(order.customerName); }} className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-blue-400 hover:text-blue-600 hover:shadow-sm transition-all border border-black/5 disabled:opacity-50"><MapPin className="w-4 h-4" /></motion.button> 
              <motion.button disabled={isSelectionMode} whileTap={buttonTap} onClick={(e) => { e.stopPropagation(); onEdit(order); }} className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-slate-400 hover:text-morandi-blue hover:shadow-sm transition-all border border-black/5 disabled:opacity-50"><Edit2 className="w-4 h-4" /></motion.button> 
            </div> 
            {order.note && (<div className="text-[10px] font-bold text-gray-400 bg-white/40 px-3 py-1.5 rounded-lg max-w-[60%] truncate">備註: {order.note}</div>)} 
          </div> 
        </div> 
        </SyncableStatusWrapper>
      </motion.div> 
    </div> 
  ); 
};
