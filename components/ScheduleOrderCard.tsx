import React, { useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform, PanInfo, AnimatePresence } from 'framer-motion';
import { CheckCircle2, RotateCcw, Clock, ChevronDown, ChevronUp, Share2, MapPin } from 'lucide-react';
import { Order, OrderStatus, Product, Customer } from '../types';
import { getStatusStyles, formatTimeDisplay } from '../utils';
import { buttonTap, triggerHaptic } from './animations';

interface ScheduleOrderCardProps {
  order: Order;
  products: Product[];
  customers: Customer[];
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelection: () => void;
  onStatusChange: (id: string, status: OrderStatus) => void;
  onShare: (order: Order) => void;
  onMap: (name: string) => void;
}

export const ScheduleOrderCard: React.FC<ScheduleOrderCardProps> = ({ 
  order, products, customers, isSelectionMode, isSelected, onToggleSelection, 
  onStatusChange, onShare, onMap 
}) => {
  const x = useMotionValue(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const DRAG_THRESHOLD = 80;
  
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
  const itemSummary = order.items.map(item => { 
    const p = products.find(prod => prod.id === item.productId || prod.name === item.productId); 
    return `${p?.name || item.productId} ${item.quantity}${item.unit || '斤'}`; 
  }).join('、');
  
  const handleDragEnd = (event: any, info: PanInfo) => { 
    setIsDragging(false); 
    const offset = info.offset.x; 
    if (offset > DRAG_THRESHOLD) { 
      if (order.status === OrderStatus.PENDING) { 
        triggerHaptic(20); 
        onStatusChange(order.id, OrderStatus.SHIPPED); 
      } else if (order.status === OrderStatus.SHIPPED) { 
        triggerHaptic(20); 
        onStatusChange(order.id, OrderStatus.PAID); 
      } 
    } else if (offset < -DRAG_THRESHOLD) { 
      if (order.status === OrderStatus.PAID) { 
        triggerHaptic(20); 
        onStatusChange(order.id, OrderStatus.SHIPPED); 
      } else if (order.status === OrderStatus.SHIPPED) { 
        triggerHaptic(20); 
        onStatusChange(order.id, OrderStatus.PENDING); 
      } 
    } 
  };
  
  const bgOpacityRight = useTransform(x, [0, DRAG_THRESHOLD], [0, 1]); 
  const bgScaleRight = useTransform(x, [0, DRAG_THRESHOLD], [0.8, 1.2]); 
  const bgOpacityLeft = useTransform(x, [0, -DRAG_THRESHOLD], [0, 1]); 
  const bgScaleLeft = useTransform(x, [0, -DRAG_THRESHOLD], [0.8, 1.2]);
  
  return ( 
    <div className="relative mb-3"> 
      <div className="absolute inset-0 rounded-[20px] flex items-center justify-between px-6 pointer-events-none overflow-hidden"> 
        <motion.div style={{ opacity: bgOpacityRight, scale: bgScaleRight }} className="flex items-center gap-2 text-emerald-500 font-bold"> 
          <CheckCircle2 className="w-6 h-6" /> 
          <span className="text-xs"> {order.status === OrderStatus.PENDING ? '轉已配送' : '轉已收款'} </span> 
        </motion.div> 
        <motion.div style={{ opacity: bgOpacityLeft, scale: bgScaleLeft }} className="flex items-center gap-2 text-amber-500 font-bold"> 
          <span className="text-xs"> {order.status === OrderStatus.PAID ? '返回已配送' : '返回待處理'} </span> 
          <RotateCcw className="w-6 h-6" /> 
        </motion.div> 
      </div> 
      <motion.div 
        drag={isSelectionMode ? false : "x"} 
        dragConstraints={isSelectionMode ? {left:0, right:0} : {left: 0, right: 0}} 
        dragElastic={{ left: order.status === OrderStatus.PENDING ? 0.1 : 0.7, right: order.status === OrderStatus.PAID ? 0.1 : 0.7 }} 
        dragDirectionLock={true} 
        onDragStart={() => setIsDragging(true)} 
        onDragEnd={handleDragEnd} 
        style={{ x }} 
        initial={false} 
        animate={{ backgroundColor: '#FFFFFF', borderColor: statusConfig.cardBorder, x: isSelectionMode ? 10 : 0 }} 
        className={`rounded-[20px] overflow-hidden shadow-sm border border-slate-200 relative z-10 touch-pan-y transition-shadow ${isSelectionMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`} 
        onClick={() => { if (isSelectionMode) onToggleSelection(); }} 
      > 
        {isSelectionMode && ( 
          <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20"> 
            {isSelected ? <div className="w-6 h-6 rounded-lg bg-morandi-blue flex items-center justify-center text-white shadow-md"><CheckCircle2 className="w-4 h-4" /></div> : <div className="w-6 h-6 rounded-lg border-2 border-slate-300 bg-white" />} 
          </div> 
        )} 
        <div className={`p-4 ${isSelectionMode ? 'pl-14' : ''}`}> 
          <div className="flex justify-between items-center" onClick={() => !isSelectionMode && !isDragging && setIsExpanded(!isExpanded)}> 
            <div className="flex flex-col gap-1 min-w-0 flex-1 pr-2"> 
              <div className="flex items-center gap-2"> 
                <div className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 transition-colors`} style={{ backgroundColor: statusConfig.tagBg, color: statusConfig.tagText }}> 
                  <Clock className="w-3 h-3" />{formatTimeDisplay(order.deliveryTime)} 
                </div> 
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${order.status === OrderStatus.PAID ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : order.status === OrderStatus.SHIPPED ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-gray-50 text-gray-500 border-gray-200'}`}> 
                  {statusConfig.label} 
                </span> 
              </div> 
              <div className="flex items-center gap-2"> 
                <h4 className="font-bold text-slate-800 text-base truncate">{order.customerName}</h4> 
                {!isExpanded && <span className="text-xs font-bold text-morandi-charcoal">${totalAmount.toLocaleString()}</span>} 
              </div> 
              {!isExpanded && ( 
                <p className="text-[10px] text-gray-400 truncate">{itemSummary}</p> 
              )} 
            </div> 
            {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />} 
          </div> 
          <AnimatePresence> 
            {isExpanded && ( 
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"> 
                <div className="pt-3 mt-3 border-t border-dashed border-gray-200"> 
                  <div className="space-y-1.5 mb-3"> 
                    {order.items.map((item, idx) => { 
                      const p = products.find(prod => prod.id === item.productId || prod.name === item.productId); 
                      return ( 
                        <div key={idx} className="flex justify-between items-center text-xs"> 
                          <span className="text-slate-600 font-medium">{p?.name || item.productId}</span> 
                          <span className="font-bold text-slate-800">{item.quantity} {item.unit || '斤'}</span> 
                        </div> 
                      ) 
                    })} 
                  </div> 
                  <div className="flex justify-between items-center pt-2 border-t border-gray-100 mb-3"> 
                    <span className="text-xs font-bold text-gray-400">總金額</span> 
                    <span className="text-lg font-black text-morandi-charcoal">${totalAmount.toLocaleString()}</span> 
                  </div> 
                  {order.note && ( 
                    <div className="text-[10px] font-bold text-gray-500 bg-gray-50 px-3 py-2 rounded-lg mb-3 break-words"> 
                      備註: {order.note} 
                    </div> 
                  )} 
                  <div className="flex gap-2"> 
                    <motion.button whileTap={buttonTap} onClick={(e) => { e.stopPropagation(); onShare(order); }} className="flex-1 py-2 rounded-xl bg-gray-50 text-slate-500 font-bold text-xs flex items-center justify-center gap-1 hover:bg-gray-100 transition-colors border border-gray-100"><Share2 className="w-3.5 h-3.5" /> 分享</motion.button> 
                    <motion.button whileTap={buttonTap} onClick={(e) => { e.stopPropagation(); onMap(order.customerName); }} className="flex-1 py-2 rounded-xl bg-morandi-blue/10 text-morandi-blue font-bold text-xs flex items-center justify-center gap-1 hover:bg-morandi-blue/20 transition-colors border border-transparent"><MapPin className="w-3.5 h-3.5" /> 地圖</motion.button> 
                  </div> 
                </div> 
              </motion.div> 
            )} 
          </AnimatePresence> 
        </div> 
      </motion.div> 
    </div> 
  ); 
};
