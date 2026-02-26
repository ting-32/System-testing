import React, { useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform, PanInfo, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Trash2, Clock, ChevronDown, Share2, MapPin, Edit2, AlertCircle, RefreshCw } from 'lucide-react';
import { Order, OrderStatus, Product, Customer } from '../types';
import { ORDERING_HABITS } from '../constants';
import { getStatusStyles, formatTimeDisplay } from '../utils';
import { buttonTap, triggerHaptic } from './animations';

interface SwipeableOrderCardProps {
  order: Order;
  products: Product[];
  customers: Customer[];
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelection: () => void;
  onStatusChange: (id: string, status: OrderStatus) => void;
  onDelete: (id: string) => void;
  onShare: (order: Order) => void;
  onMap: (name: string) => void;
  onEdit: (order: Order) => void;
  onRetry?: (id: string) => void;
}

export const SwipeableOrderCard: React.FC<SwipeableOrderCardProps> = ({ 
  order, products, customers, isSelectionMode, isSelected, onToggleSelection, 
  onStatusChange, onDelete, onShare, onMap, onEdit, onRetry
}) => {
  const x = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);
  
  useEffect(() => { x.set(0); }, [order.status, x]);
  
  const statusConfig = getStatusStyles(order.status || OrderStatus.PENDING);
  
  const totalAmount = (() => { 
    const customer = customers.find(c => c.name === order.customerName); 
    let total = 0; 
    order.items.forEach(item => { 
      const product = products.find(p => p.id === item.productId || p.name === item.productId); 
      const priceItem = customer?.priceList?.find(pl => pl.productId === (product?.id || item.productId)); 
      const unitPrice = priceItem ? priceItem.price : (product?.price || 0); 
      if (item.unit === '元') { 
        total += item.quantity; 
      } else { 
        total += Math.round(item.quantity * unitPrice); 
      } 
    }); 
    return total; 
  })();
  
  const customer = customers.find(c => c.name === order.customerName);
  const habitLabel = ORDERING_HABITS.find(h => h.value === customer?.paymentTerm)?.label;
  const DRAG_THRESHOLD = 80;
  
  const handleDragEnd = (event: any, info: PanInfo) => { 
    setIsDragging(false); 
    const offset = info.offset.x; 
    if (offset > DRAG_THRESHOLD) { 
      triggerHaptic(20); 
      let nextStatus = OrderStatus.PENDING; 
      if (order.status === OrderStatus.PENDING) nextStatus = OrderStatus.SHIPPED; 
      else if (order.status === OrderStatus.SHIPPED) nextStatus = OrderStatus.PAID; 
      if (order.status !== OrderStatus.PAID) { 
        onStatusChange(order.id, nextStatus); 
      } 
    } else if (offset < -DRAG_THRESHOLD) { 
      triggerHaptic([20, 50, 20]); 
      onDelete(order.id); 
    } 
  };
  
  const bgOpacityRight = useTransform(x, [0, DRAG_THRESHOLD], [0, 1]); 
  const bgScaleRight = useTransform(x, [0, DRAG_THRESHOLD], [0.8, 1.2]); 
  const bgOpacityLeft = useTransform(x, [0, -DRAG_THRESHOLD], [0, 1]); 
  const bgScaleLeft = useTransform(x, [0, -DRAG_THRESHOLD], [0.8, 1.2]);

  const isSyncError = order.syncStatus === 'error';
  const isSyncPending = order.syncStatus === 'pending';
  
  return ( 
    <div className="relative mb-4"> 
      <div className="absolute inset-0 rounded-[32px] flex items-center justify-between px-6 pointer-events-none overflow-hidden"> 
        <motion.div style={{ opacity: bgOpacityRight, scale: bgScaleRight }} className="flex items-center gap-2 text-emerald-500 font-bold"> 
          <CheckCircle2 className="w-8 h-8" /> 
          <span className="text-sm">{order.status === OrderStatus.PENDING ? '標記出貨' : '標記收款'}</span> 
        </motion.div> 
        <motion.div style={{ opacity: bgOpacityLeft, scale: bgScaleLeft }} className="flex items-center gap-2 text-rose-500 font-bold"> 
          <span className="text-sm">刪除訂單</span> 
          <Trash2 className="w-8 h-8" /> 
        </motion.div> 
      </div> 
      <motion.div 
        drag={isSelectionMode ? false : "x"} 
        dragConstraints={{ left: 0, right: 0 }} 
        dragElastic={0.7} 
        dragDirectionLock={true} 
        onDragStart={() => setIsDragging(true)} 
        onDragEnd={handleDragEnd} 
        style={{ x }} 
        initial={false} 
        animate={{ 
            backgroundColor: statusConfig.cardBg, 
            borderColor: isSyncError ? '#ef4444' : statusConfig.cardBorder, 
            x: isSelectionMode ? 10 : 0,
            opacity: isSyncPending ? 0.7 : 1
        }} 
        className={`rounded-[32px] overflow-hidden shadow-sm border-2 relative z-10 touch-pan-y ${isSelectionMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`} 
        onClick={() => { if (isSelectionMode) onToggleSelection(); }} 
      > 
        {isSelectionMode && ( 
          <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20"> 
            {isSelected ? <div className="w-6 h-6 rounded-lg bg-morandi-blue flex items-center justify-center text-white shadow-md"><CheckCircle2 className="w-4 h-4" /></div> : <div className="w-6 h-6 rounded-lg border-2 border-slate-300 bg-white" />} 
          </div> 
        )} 
        
        {/* Sync Status Overlay/Badge */}
        {isSyncError && (
            <div className="absolute top-0 right-0 bg-rose-500 text-white text-[10px] px-3 py-1 rounded-bl-xl font-bold flex items-center gap-1 z-20">
                <AlertCircle className="w-3 h-3" />
                同步失敗
            </div>
        )}
        {isSyncPending && (
            <div className="absolute top-0 right-0 bg-slate-500/50 text-white text-[10px] px-3 py-1 rounded-bl-xl font-bold flex items-center gap-1 z-20">
                <RefreshCw className="w-3 h-3 animate-spin" />
                同步中...
            </div>
        )}

        <div className={`p-5 transition-all ${isSelectionMode ? 'pl-14' : ''}`}> 
          <div className="flex justify-between items-center mb-4"> 
            <div className="flex items-center gap-3"> 
              <div className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors duration-300`} style={{ backgroundColor: statusConfig.tagBg, color: statusConfig.tagText }}> 
                <Clock className="w-3.5 h-3.5" />{formatTimeDisplay(order.deliveryTime)} 
              </div> 
              {order.deliveryMethod && (<span className="text-[10px] font-bold text-gray-400 bg-white/60 px-2 py-1 rounded-lg border border-black/5">{order.deliveryMethod}</span>)} 
              {habitLabel && (<span className="text-[10px] font-bold text-morandi-blue bg-blue-50 px-2 py-1 rounded-lg border border-blue-100">{habitLabel}</span>)} 
            </div> 
            <div className="relative group" onClick={(e) => isSelectionMode && e.stopPropagation()}> 
              <select disabled={isSelectionMode} value={order.status || OrderStatus.PENDING} onChange={(e) => onStatusChange(order.id, e.target.value as OrderStatus)} className={`appearance-none pl-4 pr-9 py-2 rounded-xl text-xs font-extrabold cursor-pointer outline-none transition-all duration-300 border border-transparent hover:brightness-95 ${isSelectionMode ? 'opacity-50 pointer-events-none' : ''}`} style={{ backgroundColor: statusConfig.tagBg, color: statusConfig.tagText }}> 
                <option value={OrderStatus.PENDING}>待處理</option><option value={OrderStatus.SHIPPED}>已配送</option><option value={OrderStatus.PAID}>已收款</option> 
              </select> 
              <ChevronDown className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-300 group-hover:rotate-180" style={{ color: statusConfig.iconColor }} /> 
            </div> 
          </div> 
          <div className="flex justify-between items-end mb-5"> 
            <h4 className="font-extrabold text-slate-800 text-xl tracking-tight leading-none">{order.customerName}</h4> 
            <div className="flex flex-col items-end"><span className="font-mono font-black text-xl text-morandi-charcoal tracking-tight"><span className="text-sm text-gray-400 mr-1">$</span>{totalAmount.toLocaleString()}</span></div> 
          </div> 
          <div className="space-y-2"> 
            {order.items.map((item, idx) => { 
              const p = products.find(prod => prod.id === item.productId || prod.name === item.productId); 
              return ( 
                <div key={idx} className="flex justify-between items-center py-2 px-3 bg-white/60 rounded-[16px] border border-black/5"> 
                  <span className="text-sm font-bold text-slate-600 tracking-wide">{p?.name || item.productId}</span> 
                  <div className="flex items-baseline gap-1"><span className="font-black text-lg text-slate-800">{item.quantity}</span><span className="text-[10px] font-bold text-gray-400">{item.unit || p?.unit || '斤'}</span></div> 
                </div> 
              ); 
            })} 
          </div> 
          
          {/* Error Message & Retry Button */}
          {isSyncError && (
            <div className="mt-3 bg-rose-50 border border-rose-100 rounded-xl p-3 flex items-center justify-between">
                <div className="text-xs text-rose-600 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {order.errorMessage || '同步失敗'}
                </div>
                {onRetry && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onRetry(order.id); }}
                        className="text-xs bg-rose-500 text-white px-3 py-1.5 rounded-lg font-bold shadow-sm active:scale-95 transition-transform flex items-center gap-1"
                    >
                        <RefreshCw className="w-3 h-3" /> 重試
                    </button>
                )}
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
      </motion.div> 
    </div> 
  ); 
};
