
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Users, 
  Package, 
  ClipboardList, 
  History,
  Settings,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Search,
  Clock,
  X,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  Edit2, // Used for Edit Icon
  Layers,
  Box,
  UserPlus,
  UserCheck,
  CalendarDays,
  Loader2,
  WifiOff,
  AlertCircle,
  MessageSquare,
  CheckCircle2,
  Zap,
  FileText,
  Filter,
  ListChecks,
  Printer,
  Lock,
  LogOut,
  RefreshCw,
  Save,
  Key,
  Link as LinkIcon,
  AlertTriangle,
  DollarSign,
  Calculator,
  Truck,
  CalendarCheck,
  Copy,
  MapPin,
  Banknote,
  Share2,
  CheckSquare,
  Square,
  GripVertical,
  Wallet,
  CalendarRange,
  Bell,
  LayoutGrid,
  Store,
  RotateCcw, 
  ArrowRight,
  Mic, // New Import
  StopCircle // New Import
} from 'lucide-react';
import { motion, AnimatePresence, Variants, Reorder, useDragControls, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { GoogleGenAI, Type } from "@google/genai"; // New Import
import { Customer, Product, Order, OrderStatus, OrderItem, GASResponse, DefaultItem, CustomerPrice } from './types';
import { COLORS, WEEKDAYS, GAS_URL as DEFAULT_GAS_URL, UNITS, DELIVERY_METHODS, PAYMENT_TERMS, ORDERING_HABITS, PRODUCT_CATEGORIES } from './constants';

// ... (Toast Types, Variants, Haptic Helper, Helper Functions remain unchanged) ...
// --- Toast Types ---
type ToastType = 'success' | 'error' | 'info';
interface Toast {
  id: string;
  message: string;
  type: ToastType;
  action?: {
    label: string;
    onClick: () => void;
  };
}

// --- Animation Variants ---
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.05
    }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  show: { 
    opacity: 1, 
    y: 0,
    transition: { 
      type: "spring", 
      stiffness: 300, 
      damping: 24 
    } 
  }
};

const modalVariants: Variants = {
  hidden: { opacity: 0, y: "100%" },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: "spring", damping: 25, stiffness: 300 }
  },
  exit: { 
    opacity: 0, 
    y: "100%",
    transition: { duration: 0.2, ease: "easeIn" }
  }
};

// Haptic Feedback Helper
const triggerHaptic = (pattern: number | number[] = 10) => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(pattern); // Default light tap
  }
};

const buttonTap = { scale: 0.96, transition: { onTap: () => triggerHaptic(10) } };
const buttonHover = { scale: 1.02 };

// ... (getStatusStyles, normalizeDate, formatDateStr, getTomorrowDate, getLastMonthEndDate, safeJsonArray, formatTimeDisplay, formatTimeForInput remain unchanged)
const getStatusStyles = (status: OrderStatus) => {
  switch (status) {
    case OrderStatus.PAID:
      return {
        cardBg: '#E8F0EB', // 淺豆沙綠 (Light Sage)
        cardBorder: '#CZDCD4',
        tagBg: '#BCCFC6',
        tagText: '#4A6356',
        iconColor: '#4A6356',
        label: '已收款'
      };
    case OrderStatus.SHIPPED:
      return {
        cardBg: '#F7F3E8', // 淺米杏色 (Light Beige/Latte)
        cardBorder: '#EADBC8',
        tagBg: '#E0C9A6', 
        tagText: '#8D7B68',
        iconColor: '#8D7B68',
        label: '已出貨'
      };
    case OrderStatus.PENDING:
    default:
      return {
        cardBg: '#FFFFFF', // 純白 (White)
        cardBorder: '#F1F5F9', // Slate-100
        tagBg: '#F1F5F9', // Slate-100
        tagText: '#94A3B8', // Slate-400
        iconColor: '#CBD5E1',
        label: '待處理'
      };
  }
};

const normalizeDate = (dateStr: any) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch (e) {
    return String(dateStr);
  }
};

const formatDateStr = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getTomorrowDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return formatDateStr(d);
};

const getLastMonthEndDate = () => {
  const date = new Date();
  date.setDate(0); 
  return formatDateStr(date);
};

const safeJsonArray = (val: any) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '' || trimmed === '""') return [];
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn("JSON Parse error for value:", val);
      return [];
    }
  }
  return [];
};

const formatTimeDisplay = (time: any) => {
  if (!time) return '未設定';
  const date = new Date(time);
  if (!isNaN(date.getTime()) && String(time).includes('-')) {
    const h = date.getHours();
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  const str = String(time).trim();
  const parts = str.split(':');
  if (parts.length >= 2) {
    const h = parseInt(parts[0], 10);
    if (!isNaN(h) && h >= 0 && h < 24) {
       const m = parts[1].substring(0, 2);
       return `${h}:${m}`;
    }
  }
  return str;
};

const formatTimeForInput = (time: any) => {
  if (!time) return '08:00';
  const date = new Date(time);
  if (!isNaN(date.getTime()) && String(time).includes('-')) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  const str = String(time).trim();
  const parts = str.split(':');
  if (parts.length >= 2) {
    let h = parseInt(parts[0], 10);
    if (!isNaN(h) && h >= 0 && h < 24) {
       const m = parts[1].substring(0, 2);
       return `${String(h).padStart(2, '0')}:${m}`;
    }
  }
  return '08:00';
};

// ... (SortableProductItem, SwipeableOrderCard, ScheduleOrderCard... remain unchanged) ...
const SortableProductItem: React.FC<{
  product: Product;
  onEdit: (p: Product) => void;
  onDelete: (id: string) => void;
}> = ({ product, onEdit, onDelete }) => {
  const controls = useDragControls();
  const categoryColor = PRODUCT_CATEGORIES.find(c => c.id === product.category)?.color || '#E5E7EB';

  return (
    <Reorder.Item 
      value={product} 
      id={product.id}
      dragListener={false} 
      dragControls={controls}
      className="relative"
    >
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileDrag={{ scale: 1.05, boxShadow: "0px 10px 20px rgba(0,0,0,0.1)", zIndex: 10 }}
        className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-200 flex justify-between items-center mb-4 active:cursor-grabbing"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 shadow-sm border border-white/50" style={{ backgroundColor: categoryColor }}>
            <Box className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-slate-800 tracking-wide block">{product.name}</span>
            <div className="flex items-center gap-2 mt-0.5">
               <span className="text-[10px] text-gray-400 font-bold bg-gray-50 px-1.5 py-0.5 rounded">
                 單位: {product.unit}
               </span>
               {product.price && product.price > 0 && (
                 <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full tracking-wide">
                   ${product.price}
                 </span>
               )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <motion.button whileTap={buttonTap} onClick={() => onEdit(product)} className="p-2 text-gray-300 hover:text-slate-600 transition-colors">
            <Edit2 className="w-4 h-4" />
          </motion.button>
          <motion.button whileTap={buttonTap} onClick={() => onDelete(product.id)} className="p-2 text-rose-100 hover:text-rose-400 transition-colors">
            <Trash2 className="w-4 h-4" />
          </motion.button>
          <div 
            onPointerDown={(e) => controls.start(e)}
            className="p-2 text-morandi-pebble/50 cursor-grab active:cursor-grabbing touch-none hover:text-morandi-blue transition-colors"
          >
            <GripVertical className="w-5 h-5" />
          </div>
        </div>
      </motion.div>
    </Reorder.Item>
  );
};

// ... (SwipeableOrderCard, ScheduleOrderCard, LoginScreen, ConfirmModal, ProductPicker, CustomerPicker, HolidayCalendar, WorkCalendar, DatePickerModal, SettingsModal, NavItem, ToastNotification remain unchanged)
const SwipeableOrderCard: React.FC<{
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
  onEdit: (order: Order) => void; // Added onEdit prop
}> = ({ order, products, customers, isSelectionMode, isSelected, onToggleSelection, onStatusChange, onDelete, onShare, onMap, onEdit }) => {
  const x = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);
  useEffect(() => { x.set(0); }, [order.status, x]);
  const statusConfig = getStatusStyles(order.status || OrderStatus.PENDING);
  const totalAmount = (() => { const customer = customers.find(c => c.name === order.customerName); let total = 0; order.items.forEach(item => { const product = products.find(p => p.id === item.productId || p.name === item.productId); const priceItem = customer?.priceList?.find(pl => pl.productId === (product?.id || item.productId)); const unitPrice = priceItem ? priceItem.price : (product?.price || 0); if (item.unit === '元') { total += item.quantity; } else { total += Math.round(item.quantity * unitPrice); } }); return total; })();
  const customer = customers.find(c => c.name === order.customerName);
  const habitLabel = ORDERING_HABITS.find(h => h.value === customer?.paymentTerm)?.label;
  const DRAG_THRESHOLD = 80;
  const handleDragEnd = (event: any, info: PanInfo) => { setIsDragging(false); const offset = info.offset.x; if (offset > DRAG_THRESHOLD) { triggerHaptic(20); let nextStatus = OrderStatus.PENDING; if (order.status === OrderStatus.PENDING) nextStatus = OrderStatus.SHIPPED; else if (order.status === OrderStatus.SHIPPED) nextStatus = OrderStatus.PAID; if (order.status !== OrderStatus.PAID) { onStatusChange(order.id, nextStatus); } } else if (offset < -DRAG_THRESHOLD) { triggerHaptic([20, 50, 20]); onDelete(order.id); } };
  const bgOpacityRight = useTransform(x, [0, DRAG_THRESHOLD], [0, 1]); const bgScaleRight = useTransform(x, [0, DRAG_THRESHOLD], [0.8, 1.2]); const bgOpacityLeft = useTransform(x, [0, -DRAG_THRESHOLD], [0, 1]); const bgScaleLeft = useTransform(x, [0, -DRAG_THRESHOLD], [0.8, 1.2]);
  return ( <div className="relative mb-4"> <div className="absolute inset-0 rounded-[32px] flex items-center justify-between px-6 pointer-events-none overflow-hidden"> <motion.div style={{ opacity: bgOpacityRight, scale: bgScaleRight }} className="flex items-center gap-2 text-emerald-500 font-bold"> <CheckCircle2 className="w-8 h-8" /> <span className="text-sm">{order.status === OrderStatus.PENDING ? '標記出貨' : '標記收款'}</span> </motion.div> <motion.div style={{ opacity: bgOpacityLeft, scale: bgScaleLeft }} className="flex items-center gap-2 text-rose-500 font-bold"> <span className="text-sm">刪除訂單</span> <Trash2 className="w-8 h-8" /> </motion.div> </div> <motion.div drag={isSelectionMode ? false : "x"} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.7} dragDirectionLock={true} onDragStart={() => setIsDragging(true)} onDragEnd={handleDragEnd} style={{ x }} initial={false} animate={{ backgroundColor: statusConfig.cardBg, borderColor: statusConfig.cardBorder, x: isSelectionMode ? 10 : 0 }} className={`rounded-[32px] overflow-hidden shadow-sm border-2 relative z-10 touch-pan-y ${isSelectionMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`} onClick={() => { if (isSelectionMode) onToggleSelection(); }} > {isSelectionMode && ( <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20"> {isSelected ? <div className="w-6 h-6 rounded-lg bg-morandi-blue flex items-center justify-center text-white shadow-md"><CheckCircle2 className="w-4 h-4" /></div> : <div className="w-6 h-6 rounded-lg border-2 border-slate-300 bg-white" />} </div> )} <div className={`p-5 transition-all ${isSelectionMode ? 'pl-14' : ''}`}> <div className="flex justify-between items-center mb-4"> <div className="flex items-center gap-3"> <div className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors duration-300`} style={{ backgroundColor: statusConfig.tagBg, color: statusConfig.tagText }}> <Clock className="w-3.5 h-3.5" />{formatTimeDisplay(order.deliveryTime)} </div> {order.deliveryMethod && (<span className="text-[10px] font-bold text-gray-400 bg-white/60 px-2 py-1 rounded-lg border border-black/5">{order.deliveryMethod}</span>)} {habitLabel && (<span className="text-[10px] font-bold text-morandi-blue bg-blue-50 px-2 py-1 rounded-lg border border-blue-100">{habitLabel}</span>)} </div> <div className="relative group" onClick={(e) => isSelectionMode && e.stopPropagation()}> <select disabled={isSelectionMode} value={order.status || OrderStatus.PENDING} onChange={(e) => onStatusChange(order.id, e.target.value as OrderStatus)} className={`appearance-none pl-4 pr-9 py-2 rounded-xl text-xs font-extrabold cursor-pointer outline-none transition-all duration-300 border border-transparent hover:brightness-95 ${isSelectionMode ? 'opacity-50 pointer-events-none' : ''}`} style={{ backgroundColor: statusConfig.tagBg, color: statusConfig.tagText }}> <option value={OrderStatus.PENDING}>待處理</option><option value={OrderStatus.SHIPPED}>已配送</option><option value={OrderStatus.PAID}>已收款</option> </select> <ChevronDown className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-300 group-hover:rotate-180" style={{ color: statusConfig.iconColor }} /> </div> </div> <div className="flex justify-between items-end mb-5"> <h4 className="font-extrabold text-slate-800 text-xl tracking-tight leading-none">{order.customerName}</h4> <div className="flex flex-col items-end"><span className="font-mono font-black text-xl text-morandi-charcoal tracking-tight"><span className="text-sm text-gray-400 mr-1">$</span>{totalAmount.toLocaleString()}</span></div> </div> <div className="space-y-2"> {order.items.map((item, idx) => { const p = products.find(prod => prod.id === item.productId || prod.name === item.productId); return ( <div key={idx} className="flex justify-between items-center py-2 px-3 bg-white/60 rounded-[16px] border border-black/5"> <span className="text-sm font-bold text-slate-600 tracking-wide">{p?.name || item.productId}</span> <div className="flex items-baseline gap-1"><span className="font-black text-lg text-slate-800">{item.quantity}</span><span className="text-[10px] font-bold text-gray-400">{item.unit || p?.unit || '斤'}</span></div> </div> ); })} </div> <div className="mt-4 pt-3 border-t border-black/5 flex justify-between items-center"> <div className="flex gap-2"> <motion.button disabled={isSelectionMode} whileTap={buttonTap} onClick={(e) => { e.stopPropagation(); onShare(order); }} className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-slate-400 hover:text-slate-600 hover:shadow-sm transition-all border border-black/5 disabled:opacity-50"><Share2 className="w-4 h-4" /></motion.button> <motion.button disabled={isSelectionMode} whileTap={buttonTap} onClick={(e) => { e.stopPropagation(); onMap(order.customerName); }} className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-blue-400 hover:text-blue-600 hover:shadow-sm transition-all border border-black/5 disabled:opacity-50"><MapPin className="w-4 h-4" /></motion.button> <motion.button disabled={isSelectionMode} whileTap={buttonTap} onClick={(e) => { e.stopPropagation(); onEdit(order); }} className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-slate-400 hover:text-morandi-blue hover:shadow-sm transition-all border border-black/5 disabled:opacity-50"><Edit2 className="w-4 h-4" /></motion.button> </div> {order.note && (<div className="text-[10px] font-bold text-gray-400 bg-white/40 px-3 py-1.5 rounded-lg max-w-[60%] truncate">備註: {order.note}</div>)} </div> </div> </motion.div> </div> ); };
// ... (ScheduleOrderCard, LoginScreen, ConfirmModal, etc. remain unchanged) ...
const ScheduleOrderCard: React.FC<{ order: Order; products: Product[]; customers: Customer[]; isSelectionMode: boolean; isSelected: boolean; onToggleSelection: () => void; onStatusChange: (id: string, status: OrderStatus) => void; onShare: (order: Order) => void; onMap: (name: string) => void; }> = ({ order, products, customers, isSelectionMode, isSelected, onToggleSelection, onStatusChange, onShare, onMap }) => { const x = useMotionValue(0); const [isExpanded, setIsExpanded] = useState(false); const [isDragging, setIsDragging] = useState(false); const DRAG_THRESHOLD = 80; useEffect(() => { x.set(0); }, [order.status, x]); const statusConfig = getStatusStyles(order.status || OrderStatus.PENDING); const totalAmount = (() => { const customer = customers.find(c => c.name === order.customerName); let total = 0; order.items.forEach(item => { const product = products.find(p => p.id === item.productId || p.name === item.productId); const priceItem = customer?.priceList?.find(pl => pl.productId === (product?.id || item.productId)); const unitPrice = priceItem ? priceItem.price : (product?.price || 0); if (item.unit === '元') { total += item.quantity; } else { total += Math.round(item.quantity * unitPrice); } }); return total; })(); const customer = customers.find(c => c.name === order.customerName); const itemSummary = order.items.map(item => { const p = products.find(prod => prod.id === item.productId || prod.name === item.productId); return `${p?.name || item.productId} ${item.quantity}${item.unit || '斤'}`; }).join('、'); const handleDragEnd = (event: any, info: PanInfo) => { setIsDragging(false); const offset = info.offset.x; if (offset > DRAG_THRESHOLD) { if (order.status === OrderStatus.PENDING) { triggerHaptic(20); onStatusChange(order.id, OrderStatus.SHIPPED); } else if (order.status === OrderStatus.SHIPPED) { triggerHaptic(20); onStatusChange(order.id, OrderStatus.PAID); } } else if (offset < -DRAG_THRESHOLD) { if (order.status === OrderStatus.PAID) { triggerHaptic(20); onStatusChange(order.id, OrderStatus.SHIPPED); } else if (order.status === OrderStatus.SHIPPED) { triggerHaptic(20); onStatusChange(order.id, OrderStatus.PENDING); } } }; const bgOpacityRight = useTransform(x, [0, DRAG_THRESHOLD], [0, 1]); const bgScaleRight = useTransform(x, [0, DRAG_THRESHOLD], [0.8, 1.2]); const bgOpacityLeft = useTransform(x, [0, -DRAG_THRESHOLD], [0, 1]); const bgScaleLeft = useTransform(x, [0, -DRAG_THRESHOLD], [0.8, 1.2]); return ( <div className="relative mb-3"> <div className="absolute inset-0 rounded-[20px] flex items-center justify-between px-6 pointer-events-none overflow-hidden"> <motion.div style={{ opacity: bgOpacityRight, scale: bgScaleRight }} className="flex items-center gap-2 text-emerald-500 font-bold"> <CheckCircle2 className="w-6 h-6" /> <span className="text-xs"> {order.status === OrderStatus.PENDING ? '轉已配送' : '轉已收款'} </span> </motion.div> <motion.div style={{ opacity: bgOpacityLeft, scale: bgScaleLeft }} className="flex items-center gap-2 text-amber-500 font-bold"> <span className="text-xs"> {order.status === OrderStatus.PAID ? '返回已配送' : '返回待處理'} </span> <RotateCcw className="w-6 h-6" /> </motion.div> </div> <motion.div drag={isSelectionMode ? false : "x"} dragConstraints={isSelectionMode ? {left:0, right:0} : {left: 0, right: 0}} dragElastic={{ left: order.status === OrderStatus.PENDING ? 0.1 : 0.7, right: order.status === OrderStatus.PAID ? 0.1 : 0.7 }} dragDirectionLock={true} onDragStart={() => setIsDragging(true)} onDragEnd={handleDragEnd} style={{ x }} initial={false} animate={{ backgroundColor: '#FFFFFF', borderColor: statusConfig.cardBorder, x: isSelectionMode ? 10 : 0 }} className={`rounded-[20px] overflow-hidden shadow-sm border border-slate-200 relative z-10 touch-pan-y transition-shadow ${isSelectionMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`} onClick={() => { if (isSelectionMode) onToggleSelection(); }} > {isSelectionMode && ( <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20"> {isSelected ? <div className="w-6 h-6 rounded-lg bg-morandi-blue flex items-center justify-center text-white shadow-md"><CheckCircle2 className="w-4 h-4" /></div> : <div className="w-6 h-6 rounded-lg border-2 border-slate-300 bg-white" />} </div> )} <div className={`p-4 ${isSelectionMode ? 'pl-14' : ''}`}> <div className="flex justify-between items-center" onClick={() => !isSelectionMode && !isDragging && setIsExpanded(!isExpanded)}> <div className="flex flex-col gap-1 min-w-0 flex-1 pr-2"> <div className="flex items-center gap-2"> <div className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 transition-colors`} style={{ backgroundColor: statusConfig.tagBg, color: statusConfig.tagText }}> <Clock className="w-3 h-3" />{formatTimeDisplay(order.deliveryTime)} </div> <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${order.status === OrderStatus.PAID ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : order.status === OrderStatus.SHIPPED ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-gray-50 text-gray-500 border-gray-200'}`}> {statusConfig.label} </span> </div> <div className="flex items-center gap-2"> <h4 className="font-bold text-slate-800 text-base truncate">{order.customerName}</h4> {!isExpanded && <span className="text-xs font-bold text-morandi-charcoal">${totalAmount.toLocaleString()}</span>} </div> {!isExpanded && ( <p className="text-[10px] text-gray-400 truncate">{itemSummary}</p> )} </div> {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />} </div> <AnimatePresence> {isExpanded && ( <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"> <div className="pt-3 mt-3 border-t border-dashed border-gray-200"> <div className="space-y-1.5 mb-3"> {order.items.map((item, idx) => { const p = products.find(prod => prod.id === item.productId || prod.name === item.productId); return ( <div key={idx} className="flex justify-between items-center text-xs"> <span className="text-slate-600 font-medium">{p?.name || item.productId}</span> <span className="font-bold text-slate-800">{item.quantity} {item.unit || '斤'}</span> </div> ) })} </div> <div className="flex justify-between items-center pt-2 border-t border-gray-100 mb-3"> <span className="text-xs font-bold text-gray-400">總金額</span> <span className="text-lg font-black text-morandi-charcoal">${totalAmount.toLocaleString()}</span> </div> {order.note && ( <div className="text-[10px] font-bold text-gray-500 bg-gray-50 px-3 py-2 rounded-lg mb-3 break-words"> 備註: {order.note} </div> )} <div className="flex gap-2"> <motion.button whileTap={buttonTap} onClick={(e) => { e.stopPropagation(); onShare(order); }} className="flex-1 py-2 rounded-xl bg-gray-50 text-slate-500 font-bold text-xs flex items-center justify-center gap-1 hover:bg-gray-100 transition-colors border border-gray-100"><Share2 className="w-3.5 h-3.5" /> 分享</motion.button> <motion.button whileTap={buttonTap} onClick={(e) => { e.stopPropagation(); onMap(order.customerName); }} className="flex-1 py-2 rounded-xl bg-morandi-blue/10 text-morandi-blue font-bold text-xs flex items-center justify-center gap-1 hover:bg-morandi-blue/20 transition-colors border border-transparent"><MapPin className="w-3.5 h-3.5" /> 地圖</motion.button> </div> </div> </motion.div> )} </AnimatePresence> </div> </motion.div> </div> ); };
// ... (LoginScreen, etc. remain unchanged)
const LoginScreen: React.FC<{ onLogin: (password: string) => Promise<boolean> }> = ({ onLogin }) => { const [inputVal, setInputVal] = useState(''); const [error, setError] = useState(false); const [loading, setLoading] = useState(false); const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); if (!inputVal) return; setLoading(true); setError(false); try { const success = await onLogin(inputVal); if (!success) { setError(true); setInputVal(''); } } catch (e) { setError(true); } finally { setLoading(false); } }; return ( <div className="min-h-screen flex flex-col items-center justify-center bg-morandi-oatmeal p-6 relative overflow-hidden font-sans"> <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: "easeOut" }} className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-morandi-blue rounded-full opacity-10 blur-3xl" /> <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }} className="absolute bottom-[-10%] left-[-10%] w-64 h-64 bg-morandi-pink rounded-full opacity-10 blur-3xl" /> <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="bg-white/80 backdrop-blur-md p-8 rounded-[32px] shadow-lg w-full max-w-sm border border-white/50"> <div className="text-center mb-8"> <div className="w-16 h-16 bg-morandi-blue rounded-2xl flex items-center justify-center mx-auto mb-4 text-white shadow-lg rotate-3"><ClipboardList className="w-8 h-8" /></div> <h1 className="text-3xl font-extrabold text-morandi-charcoal tracking-tight">麵廠職人</h1> <p className="text-xs text-morandi-pebble font-bold uppercase tracking-[0.2em] mt-2">系統登入</p> </div> <form onSubmit={handleSubmit} className="space-y-5"> <div className="space-y-2"> <div className="relative"> <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-morandi-pebble" /> <input type="password" placeholder="請輸入系統密碼" className={`w-full pl-14 pr-6 py-4 bg-morandi-oatmeal/50 rounded-[20px] border border-slate-200 text-morandi-charcoal font-bold tracking-wide focus:ring-4 focus:ring-morandi-blue/20 focus:border-morandi-blue transition-all outline-none ${error ? 'border-rose-200 focus:border-rose-400' : ''}`} value={inputVal} onChange={(e) => { setInputVal(e.target.value); setError(false); }} autoFocus disabled={loading} /> </div> <AnimatePresence> {error && (<motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-1.5 px-2 text-rose-500 overflow-hidden"><AlertCircle className="w-3.5 h-3.5" /><span className="text-xs font-bold tracking-wide">密碼錯誤，請重新輸入</span></motion.div>)} </AnimatePresence> </div> <motion.button type="submit" disabled={loading} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }} className="w-full py-4 rounded-[20px] bg-morandi-blue text-white font-bold text-lg shadow-md hover:bg-slate-600 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:active:scale-100">{loading ? (<><Loader2 className="w-5 h-5 animate-spin" /> 驗證中...</>) : (<>進入系統 <ChevronRight className="w-5 h-5" /></>)}</motion.button> </form> <div className="mt-10 text-center"><p className="text-[10px] text-morandi-pebble tracking-wide">© 2025 Noodle Factory Manager</p></div> </motion.div> </div> ); };
// ... (ConfirmModal)
const ConfirmModal: React.FC<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void; }> = ({ isOpen, title, message, onConfirm, onCancel }) => { return ( <AnimatePresence> {isOpen && ( <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-morandi-charcoal/40 z-[110] flex items-center justify-center p-6 backdrop-blur-sm"> <motion.div variants={modalVariants} initial="hidden" animate="visible" exit="exit" className="bg-morandi-paper w-full max-w-xs rounded-[24px] overflow-hidden shadow-xl border border-white/50"> <div className="p-6 text-center space-y-4"> <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center mx-auto text-rose-400 mb-2"><AlertTriangle className="w-7 h-7" /></div> <h3 className="text-xl font-extrabold text-morandi-charcoal tracking-tight">{title}</h3> <p className="text-sm text-morandi-pebble font-medium leading-relaxed tracking-wide px-2 whitespace-pre-line">{message}</p> </div> <div className="p-4 flex gap-3 bg-morandi-oatmeal/30"> <motion.button whileTap={buttonTap} onClick={onCancel} className="flex-1 py-3 rounded-[16px] font-bold text-morandi-pebble bg-white shadow-sm border border-slate-200 tracking-wide">取消</motion.button> <motion.button whileTap={buttonTap} onClick={onConfirm} className="flex-1 py-3 rounded-[16px] font-bold text-white shadow-md bg-rose-400 tracking-wide">確認</motion.button> </div> </motion.div> </motion.div> )} </AnimatePresence> ); };

// --- NEW: VoiceInputModal Component ---
const VoiceInputModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onTranscriptComplete: (transcript: string) => void;
}> = ({ isOpen, onClose, onTranscriptComplete }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      setTranscript('');
      startListening();
    } else {
      stopListening();
    }
    return () => stopListening();
  }, [isOpen]);

  const startListening = () => {
    if (typeof window === 'undefined') return;
    
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('您的瀏覽器不支援語音輸入功能。');
      onClose();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'cmn-Hant-TW'; // Taiwan Traditional Chinese
    recognition.continuous = false; // Auto-stop after one sentence
    recognition.interimResults = true; // Show real-time results

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    
    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      setTranscript(finalTranscript || interimTranscript);
      
      if (finalTranscript) {
        onTranscriptComplete(finalTranscript);
        onClose();
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-[200] flex flex-col justify-end backdrop-blur-sm">
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="bg-white rounded-t-[32px] p-8 pb-12 shadow-2xl flex flex-col items-center"
          >
            <div className="w-full flex justify-between items-center mb-8">
               <h3 className="font-extrabold text-slate-800 text-lg">語音輸入</h3>
               <button onClick={onClose} className="p-2 rounded-full bg-slate-100 text-slate-500"><X className="w-5 h-5"/></button>
            </div>

            <div className="relative mb-8 flex items-center justify-center">
               {/* Breathing Animation Circles */}
               {isListening && (
                 <>
                   <motion.div 
                     animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                     transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                     className="absolute w-24 h-24 rounded-full bg-blue-100"
                   />
                   <motion.div 
                     animate={{ scale: [1, 1.2, 1], opacity: [0.8, 0.2, 0.8] }}
                     transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                     className="absolute w-20 h-20 rounded-full bg-blue-200"
                   />
                 </>
               )}
               
               <div className={`w-16 h-16 rounded-full flex items-center justify-center relative z-10 shadow-lg transition-colors ${isListening ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                 <Mic className="w-8 h-8" />
               </div>
            </div>

            <p className="text-xl font-bold text-slate-700 text-center min-h-[3rem] px-4 break-words w-full">
              {transcript || (isListening ? "請說話..." : "準備中...")}
            </p>
            
            <p className="text-xs text-slate-400 mt-4 font-medium">
              例如：「明天幫阿明麵攤送 20 斤油麵」
            </p>
            
            {isListening && (
                <button onClick={stopListening} className="mt-6 flex items-center gap-2 px-6 py-3 bg-rose-50 text-rose-500 rounded-full font-bold text-sm hover:bg-rose-100 transition-colors">
                    <StopCircle className="w-4 h-4" /> 停止錄音
                </button>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

// ... (ConflictModal, ProductPicker, CustomerPicker, HolidayCalendar, WorkCalendar, DatePickerModal, SettingsModal, NavItem, ToastNotification remain unchanged)
const ConflictModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onForceSave: () => void;
  isSaving: boolean;
  description?: string;
}> = ({ isOpen, onClose, onRefresh, onForceSave, isSaving, description }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-morandi-charcoal/40 z-[160] flex items-center justify-center p-6 backdrop-blur-sm">
          <motion.div variants={modalVariants} initial="hidden" animate="visible" exit="exit" className="bg-white w-full max-w-sm rounded-[24px] overflow-hidden shadow-xl border-2 border-amber-100">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-amber-500 mb-2">
                <History className="w-8 h-8" /> 
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-slate-800">資料版本衝突</h3>
                {description && <p className="text-xs font-bold text-amber-600 mt-1">{description}</p>}
              </div>
              <div className="text-sm text-slate-600 font-medium text-left bg-amber-50/50 p-4 rounded-xl border border-amber-100">
                <p className="mb-2 font-bold text-amber-800">雲端資料比您的版本更新。</p>
                <div className="text-xs text-slate-500 space-y-1">
                  <p>• 選擇 <b className="text-slate-700">放棄修改</b>：將載入雲端最新資料 (您的修改將消失)。</p>
                  <p>• 選擇 <b className="text-slate-700">強制覆蓋</b>：將以您的版本為主 (覆蓋他人的修改)。</p>
                </div>
              </div>
            </div>
            <div className="p-4 flex gap-3 bg-slate-50">
              <motion.button 
                whileTap={{ scale: 0.96 }} 
                onClick={onRefresh} 
                className="flex-1 py-3 rounded-xl font-bold text-slate-600 bg-white border border-slate-200 shadow-sm"
              >
                放棄修改
              </motion.button>
              
              <motion.button 
                whileTap={{ scale: 0.96 }} 
                onClick={onForceSave} 
                disabled={isSaving}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-amber-500 shadow-md shadow-amber-200 flex items-center justify-center gap-2"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : null}
                {isSaving ? '處理中' : '強制覆蓋'}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

// ... (ProductPicker, CustomerPicker, HolidayCalendar, WorkCalendar, DatePickerModal, SettingsModal, NavItem, ToastNotification remain unchanged)
const ProductPicker: React.FC<{ isOpen: boolean; onClose: () => void; onSelect: (productId: string) => void; products: Product[]; currentSelectedId?: string; customPrices?: CustomerPrice[]; }> = ({ isOpen, onClose, onSelect, products, currentSelectedId, customPrices }) => { const [search, setSearch] = useState(''); const [activeCategory, setActiveCategory] = useState<string>('all'); const filteredProducts = useMemo(() => { return products.filter(p => { const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()); const matchCategory = activeCategory === 'all' || (p.category || 'other') === activeCategory; return matchSearch && matchCategory; }); }, [products, search, activeCategory]); useEffect(() => { if(isOpen) { setSearch(''); setActiveCategory('all'); } }, [isOpen]); return ( <AnimatePresence> {isOpen && ( <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-morandi-charcoal/40 z-[120] flex flex-col justify-end sm:justify-center backdrop-blur-sm"> <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="bg-white w-full sm:max-w-md sm:mx-auto h-[85vh] sm:h-[80vh] rounded-t-[32px] sm:rounded-[32px] shadow-2xl flex flex-col overflow-hidden" > <div className="p-5 bg-white border-b border-gray-100 shrink-0 sticky top-0 z-20"> <div className="flex justify-between items-center mb-4"> <h3 className="font-extrabold text-morandi-charcoal text-lg tracking-tight">選擇品項</h3> <button onClick={onClose} className="p-2 rounded-2xl bg-gray-50 text-morandi-pebble"><X className="w-5 h-5" /></button> </div> <div className="relative mb-4"> <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /> <input autoFocus type="text" placeholder="搜尋品項名稱..." className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-[16px] text-sm font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue/50 transition-all placeholder:text-gray-300" value={search} onChange={e => setSearch(e.target.value)} /> </div> <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar -mx-2 px-2"> <button onClick={() => setActiveCategory('all')} className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all border ${activeCategory === 'all' ? 'bg-morandi-charcoal text-white border-transparent' : 'bg-white text-gray-400 border-gray-200'}`}>全部</button> {PRODUCT_CATEGORIES.map(cat => ( <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5 ${activeCategory === cat.id ? 'border-transparent shadow-sm' : 'bg-white text-gray-400 border-gray-200'}`} style={{ backgroundColor: activeCategory === cat.id ? cat.color : '', color: activeCategory === cat.id ? '#3E3C3A' : '' }}> <span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: cat.color, border: '1px solid rgba(0,0,0,0.1)' }}></span> {cat.label} </button> ))} </div> </div> <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-morandi-oatmeal/20"> <div className="grid grid-cols-1 gap-3"> {filteredProducts.map(p => { const categoryConfig = PRODUCT_CATEGORIES.find(c => c.id === (p.category || 'other')); const isSelected = p.id === currentSelectedId; const customPriceItem = customPrices?.find(cp => cp.productId === p.id); const hasCustomPrice = !!customPriceItem; const displayPrice = hasCustomPrice ? customPriceItem.price : p.price; return ( <motion.button key={p.id} whileTap={{ scale: 0.98 }} onClick={() => { onSelect(p.id); onClose(); }} className={`p-4 rounded-[20px] bg-white border flex items-center gap-4 transition-all shadow-sm ${isSelected ? 'ring-2 ring-morandi-blue border-morandi-blue' : 'border-transparent hover:border-slate-200'}`}> <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-slate-600 shrink-0 border border-black/5" style={{ backgroundColor: categoryConfig?.color || '#eee' }}> <Box className="w-6 h-6" /> </div> <div className="text-left flex-1"> <h4 className="font-bold text-slate-800 text-sm tracking-wide">{p.name}</h4> <div className="flex items-center gap-2 mt-1"> <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{p.unit}</span> {(displayPrice !== undefined && displayPrice >= 0) && ( <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${ hasCustomPrice ? 'text-emerald-600 bg-emerald-50 border border-emerald-100' : 'text-amber-600 bg-amber-50' }`}> {hasCustomPrice && "專屬"} ${displayPrice} </span> )} <span className="text-[9px] text-gray-400 ml-auto">{categoryConfig?.label}</span> </div> </div> {isSelected && <CheckCircle2 className="w-5 h-5 text-morandi-blue" />} </motion.button> ); })} </div> {filteredProducts.length === 0 && ( <div className="py-20 text-center"> <Package className="w-12 h-12 text-gray-200 mx-auto mb-2" /> <p className="text-gray-400 font-bold text-sm">找不到相關品項</p> </div> )} </div> </motion.div> </motion.div> )} </AnimatePresence> ); };
const CustomerPicker: React.FC<{ isOpen: boolean; onClose: () => void; onSelect: (customerId: string) => void; customers: Customer[]; selectedDate: string; currentSelectedId?: string; orders: Order[]; }> = ({ isOpen, onClose, onSelect, customers, selectedDate, currentSelectedId, orders }) => { const [search, setSearch] = useState(''); const [activeTab, setActiveTab] = useState<'regular' | 'occasional' | 'adhoc'>('regular'); 
  const orderedCustomerNames = useMemo(() => {
    return new Set(
      orders
        .filter(o => o.deliveryDate === selectedDate)
        .map(o => o.customerName)
    );
  }, [orders, selectedDate]);
  
  const filteredList = useMemo(() => { return customers.filter(c => { if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false; const habit = c.paymentTerm || 'daily'; let isRegular = habit === 'regular' || habit === 'daily'; let isOccasional = habit === 'occasional' || habit === 'weekly'; let isAdhoc = habit === 'adhoc' || habit === 'monthly'; if (activeTab === 'regular') { if (!isRegular) return false; const dateObj = new Date(selectedDate); const dayOfWeek = dateObj.getDay(); const isWeeklyOff = (c.offDays || []).includes(dayOfWeek); const isHoliday = (c.holidayDates || []).includes(selectedDate); return !isWeeklyOff && !isHoliday; } else if (activeTab === 'occasional') { return isOccasional; } else { return isAdhoc; } }); }, [customers, search, activeTab, selectedDate]); useEffect(() => { if(isOpen) setSearch(''); }, [isOpen]); return ( <AnimatePresence> {isOpen && ( <div className="fixed inset-0 bg-morandi-charcoal/40 z-[130] flex flex-col justify-end sm:justify-center backdrop-blur-sm"> <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="bg-white w-full sm:max-w-md sm:mx-auto h-[85vh] sm:h-[80vh] rounded-t-[32px] sm:rounded-[32px] shadow-2xl flex flex-col overflow-hidden" > <div className="p-5 bg-white border-b border-gray-100 shrink-0 sticky top-0 z-20"> <div className="flex justify-between items-center mb-4"> <h3 className="font-extrabold text-morandi-charcoal text-lg tracking-tight">選擇配送店家</h3> <button onClick={onClose} className="p-2 rounded-2xl bg-gray-50 text-morandi-pebble"><X className="w-5 h-5" /></button> </div> <div className="relative mb-4"> <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /> <input autoFocus type="text" placeholder="搜尋店家..." className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-[16px] text-sm font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue/50 transition-all placeholder:text-gray-300" value={search} onChange={e => setSearch(e.target.value)} /> </div> <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar -mx-2 px-2"> {ORDERING_HABITS.map(habit => { const isActive = (habit.value === 'regular' && activeTab === 'regular') || (habit.value === 'occasional' && activeTab === 'occasional') || (habit.value === 'adhoc' && activeTab === 'adhoc'); return ( <button key={habit.value} onClick={() => setActiveTab(habit.value as any)} className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5 ${isActive ? 'border-transparent shadow-sm' : 'bg-white text-gray-400 border-gray-200'}`} style={{ backgroundColor: isActive ? habit.bgColor : '', color: isActive ? '#3E3C3A' : '' }} > <span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: habit.color }}></span> {habit.label} </button> ) })} </div> </div> <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-morandi-oatmeal/20"> <div className="grid grid-cols-1 gap-3"> {filteredList.map(c => { const isSelected = c.id === currentSelectedId; const hasOrder = orderedCustomerNames.has(c.name); return ( <motion.button key={c.id} whileTap={{ scale: 0.98 }} onClick={() => { onSelect(c.id); onClose(); }} className={`p-4 rounded-[20px] border flex items-center justify-between gap-4 transition-all shadow-sm ${isSelected ? 'bg-white ring-2 ring-morandi-blue border-morandi-blue' : hasOrder ? 'bg-gray-50/80 border-amber-200/50 hover:bg-white' : 'bg-white border-transparent hover:border-slate-200'}`}> <div className="text-left flex-1"> <div className="flex items-center gap-2"> <h4 className={`font-bold text-sm tracking-wide ${hasOrder ? 'text-slate-600' : 'text-slate-800'}`}>{c.name}</h4> {hasOrder && <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-bold border border-amber-200">已建立</span>} </div> <div className="flex items-center gap-2 mt-1"> <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{formatTimeDisplay(c.deliveryTime)}</span> {c.deliveryMethod && <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{c.deliveryMethod}</span>} </div> </div> {isSelected && <CheckCircle2 className="w-5 h-5 text-morandi-blue" />} </motion.button> ); })} </div> {filteredList.length === 0 && ( <div className="py-20 text-center"> <Store className="w-12 h-12 text-gray-200 mx-auto mb-2" /> <p className="text-gray-400 font-bold text-sm">此分類無符合店家</p> {activeTab === 'regular' && <p className="text-[10px] text-gray-300 mt-1">預訂店家僅顯示今日營業中</p>} </div> )} </div> </motion.div> </div> )} </AnimatePresence> ); };
const HolidayCalendar: React.FC<{ holidays: string[]; onToggle: (dateStr: string) => void; onClose: () => void; storeName: string; }> = ({ holidays, onToggle, onClose, storeName }) => { const [viewDate, setViewDate] = useState(new Date()); const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate(); const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay(); const calendarDays = useMemo(() => { const year = viewDate.getFullYear(); const month = viewDate.getMonth(); const days = []; const totalDays = daysInMonth(year, month); const startOffset = firstDayOfMonth(year, month); for (let i = 0; i < startOffset; i++) days.push({ day: null }); for (let i = 1; i <= totalDays; i++) { const date = new Date(year, month, i); days.push({ day: i, dateStr: formatDateStr(date) }); } return days; }, [viewDate]); return (<div className="fixed inset-0 bg-morandi-charcoal/40 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"><motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: "spring", duration: 0.3 }} className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-xl border border-slate-200"><div className="p-6 border-b border-gray-100 flex justify-between items-center bg-morandi-oatmeal/30"><div><h3 className="font-extrabold text-morandi-charcoal text-lg tracking-tight">{storeName}</h3><p className="text-[10px] text-morandi-pebble font-bold uppercase tracking-widest mt-0.5">特定公休日編輯</p></div><button onClick={onClose} className="p-2 bg-white rounded-2xl shadow-sm border border-slate-100 text-morandi-pebble hover:text-morandi-charcoal"><X className="w-5 h-5" /></button></div><div className="p-6"><div className="flex justify-between items-center mb-6"><button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} className="p-2 bg-morandi-oatmeal rounded-xl"><ChevronLeft className="w-6 h-6 text-morandi-pebble" /></button><h4 className="font-bold text-morandi-charcoal">{viewDate.getFullYear()}年 {viewDate.getMonth() + 1}月</h4><button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} className="p-2 bg-morandi-oatmeal rounded-xl"><ChevronRight className="w-6 h-6 text-morandi-pebble" /></button></div><div className="grid grid-cols-7 gap-2 text-center">{WEEKDAYS.map(d => (<div key={d.value} className="text-[10px] font-bold text-morandi-pebble uppercase py-2">{d.label}</div>))}{calendarDays.map((item, idx) => { const isHoliday = item.dateStr && holidays.includes(item.dateStr); return (<motion.div key={idx} whileTap={{ scale: 0.8 }} onClick={() => item.dateStr && onToggle(item.dateStr)} className={`aspect-square flex items-center justify-center text-sm font-medium rounded-xl cursor-pointer transition-colors border ${!item.day ? 'opacity-0 pointer-events-none' : ''} ${isHoliday ? 'bg-rose-50 border-rose-200 text-rose-500 font-bold' : 'bg-white border-transparent text-morandi-charcoal hover:bg-morandi-oatmeal'}`}>{item.day}</motion.div>); })}</div></div><div className="p-6 bg-morandi-oatmeal/30 flex justify-end"><motion.button whileTap={buttonTap} onClick={onClose} className="px-8 py-3 rounded-[16px] bg-morandi-blue text-white font-bold shadow-lg tracking-wide">完成設定</motion.button></div></motion.div></div>); };
const WorkCalendar: React.FC<{ selectedDate: string | string[]; onSelect: (date: any) => void; orders: Order[]; }> = ({ selectedDate, onSelect, orders }) => { const isMulti = Array.isArray(selectedDate); const baseDateStr = isMulti ? (selectedDate[0] || getTomorrowDate()) : (selectedDate as string); const parseLocalDate = (dateStr: string) => { const [y, m, d] = dateStr.split('-').map(Number); return new Date(y, m - 1, d); }; const [viewDate, setViewDate] = useState(parseLocalDate(baseDateStr)); const datesWithOrders = useMemo(() => { const set = new Set(orders.map(o => o.deliveryDate)); return set; }, [orders]); const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate(); const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay(); const calendarDays = useMemo(() => { const year = viewDate.getFullYear(); const month = viewDate.getMonth(); const days = []; const totalDays = daysInMonth(year, month); const startOffset = firstDayOfMonth(year, month); for (let i = 0; i < startOffset; i++) days.push({ day: null }); for (let i = 1; i <= totalDays; i++) { const date = new Date(year, month, i); days.push({ day: i, dateStr: formatDateStr(date) }); } return days; }, [viewDate]); const handleDateClick = (dateStr: string) => { if (isMulti) { const current = selectedDate as string[]; if (current.includes(dateStr)) { onSelect(current.filter(d => d !== dateStr)); } else { onSelect([...current, dateStr].sort()); } } else { onSelect(dateStr); } }; return (<div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-200"><div className="flex justify-between items-center mb-4"><button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} className="p-2 bg-morandi-oatmeal rounded-xl"><ChevronLeft className="w-5 h-5 text-morandi-pebble" /></button><h4 className="font-bold text-morandi-charcoal text-sm tracking-wide">{viewDate.getFullYear()}年 {viewDate.getMonth() + 1}月</h4><button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} className="p-2 bg-morandi-oatmeal rounded-xl"><ChevronRight className="w-5 h-5 text-morandi-pebble" /></button></div><div className="grid grid-cols-7 gap-1 text-center">{WEEKDAYS.map(d => (<div key={d.value} className="text-[10px] font-bold text-morandi-pebble uppercase py-2">{d.label}</div>))}{calendarDays.map((item, idx) => { const isSelected = isMulti ? (selectedDate as string[]).includes(item.dateStr || '') : item.dateStr === selectedDate; const hasOrder = item.dateStr && datesWithOrders.has(item.dateStr); return (<motion.div key={idx} whileTap={{ scale: 0.9 }} onClick={() => item.dateStr && handleDateClick(item.dateStr)} className={`aspect-square flex flex-col items-center justify-center text-sm font-medium rounded-xl cursor-pointer transition-colors border relative ${!item.day ? 'opacity-0 pointer-events-none' : 'hover:bg-morandi-oatmeal'} ${isSelected ? 'bg-morandi-blue text-white font-bold shadow-md' : 'bg-white border-transparent text-morandi-charcoal'}`}><span className="z-10">{item.day}</span>{hasOrder && !isSelected && (<span className="w-1 h-1 rounded-full bg-amber-400 absolute bottom-2"></span>)}{hasOrder && isSelected && (<span className="w-1 h-1 rounded-full bg-white/60 absolute bottom-2"></span>)}</motion.div>); })}</div></div>); };
const DatePickerModal: React.FC<{ selectedDate: string; onSelect: (date: string) => void; onClose: () => void; }> = ({ selectedDate, onSelect, onClose }) => { const parseLocalDate = (dateStr: string) => { const [y, m, d] = dateStr.split('-').map(Number); return new Date(y, m - 1, d); }; const [viewDate, setViewDate] = useState(parseLocalDate(selectedDate)); const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate(); const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay(); const calendarDays = useMemo(() => { const year = viewDate.getFullYear(); const month = viewDate.getMonth(); const days = []; const totalDays = daysInMonth(year, month); const startOffset = firstDayOfMonth(year, month); for (let i = 0; i < startOffset; i++) days.push({ day: null }); for (let i = 1; i <= totalDays; i++) { const date = new Date(year, month, i); days.push({ day: i, dateStr: formatDateStr(date) }); } return days; }, [viewDate]); return (<div className="fixed inset-0 bg-morandi-charcoal/40 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm"><motion.div variants={modalVariants} initial="hidden" animate="visible" exit="exit" className="bg-white w-full max-w-sm rounded-t-[32px] sm:rounded-[32px] overflow-hidden shadow-xl"><div className="p-6 border-b border-gray-100 flex justify-between items-center bg-morandi-oatmeal/30"><h3 className="font-extrabold text-morandi-charcoal text-lg tracking-tight">選擇配送日期</h3><button onClick={onClose} className="p-2 bg-white rounded-2xl shadow-sm border border-slate-100"><X className="w-5 h-5 text-morandi-pebble" /></button></div><div className="p-6"><div className="flex justify-between items-center mb-6"><button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} className="p-2 bg-morandi-oatmeal rounded-xl"><ChevronLeft className="w-6 h-6 text-morandi-pebble" /></button><h4 className="font-bold text-morandi-charcoal">{viewDate.getFullYear()}年 {viewDate.getMonth() + 1}月</h4><button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} className="p-2 bg-morandi-oatmeal rounded-xl"><ChevronRight className="w-6 h-6 text-morandi-pebble" /></button></div><div className="grid grid-cols-7 gap-2 text-center">{WEEKDAYS.map(d => (<div key={d.value} className="text-[10px] font-bold text-morandi-pebble uppercase py-2">{d.label}</div>))}{calendarDays.map((item, idx) => { const isSelected = item.dateStr === selectedDate; return (<motion.div key={idx} whileTap={{ scale: 0.8 }} onClick={() => item.dateStr && (onSelect(item.dateStr), onClose())} className={`aspect-square flex items-center justify-center text-sm font-medium rounded-xl cursor-pointer transition-all border ${!item.day ? 'opacity-0 pointer-events-none' : 'hover:bg-morandi-oatmeal'} ${isSelected ? 'bg-morandi-blue text-white font-bold' : 'bg-white border-transparent text-morandi-charcoal'}`}>{item.day}</motion.div>); })}</div></div></motion.div></div>); };
const SettingsModal: React.FC<{ onClose: () => void; onSync: () => void; onSavePassword: (oldPwd: string, newPwd: string) => Promise<boolean>; currentUrl: string; onSaveUrl: (newUrl: string) => void; }> = ({ onClose, onSync, onSavePassword, currentUrl, onSaveUrl }) => { const [oldPassword, setOldPassword] = useState(''); const [newPassword, setNewPassword] = useState(''); const [inputUrl, setInputUrl] = useState(currentUrl); const [saveStatus, setSaveStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle'); const [urlSaveStatus, setUrlSaveStatus] = useState<'idle' | 'success'>('idle'); const handlePasswordSubmit = async () => { if (!oldPassword) { alert('請輸入原密碼'); return; } if (newPassword.length < 4) { alert('新密碼長度請至少輸入 4 碼'); return; } setSaveStatus('loading'); try { const success = await onSavePassword(oldPassword, newPassword); if (success) { setSaveStatus('success'); setOldPassword(''); setNewPassword(''); setTimeout(() => setSaveStatus('idle'), 2000); } else { setSaveStatus('error'); alert('原密碼錯誤，無法變更密碼'); } } catch (e) { setSaveStatus('error'); alert('變更密碼失敗，請檢查網路連線'); } }; const handleUrlSubmit = () => { if (!inputUrl.startsWith('http')) { alert('請輸入有效的網址 (http 開頭)'); return; } onSaveUrl(inputUrl); setUrlSaveStatus('success'); setTimeout(() => setUrlSaveStatus('idle'), 2000); }; return (<div className="fixed inset-0 bg-morandi-charcoal/40 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm"><motion.div variants={modalVariants} initial="hidden" animate="visible" exit="exit" className="bg-white w-full max-w-sm rounded-t-[32px] sm:rounded-[32px] overflow-hidden shadow-xl h-[85vh] sm:h-auto overflow-y-auto"><div className="p-6 border-b border-gray-100 flex justify-between items-center bg-morandi-oatmeal/30 sticky top-0 z-10"><div><h3 className="font-extrabold text-morandi-charcoal text-lg tracking-tight">系統設定</h3><p className="text-[10px] text-morandi-pebble font-bold uppercase tracking-widest mt-0.5">Settings</p></div><button onClick={onClose} className="p-2 bg-white rounded-2xl shadow-sm text-morandi-pebble border border-slate-100"><X className="w-5 h-5" /></button></div><div className="p-6 space-y-8"><section className="space-y-3"><h4 className="text-xs font-bold text-morandi-pebble uppercase tracking-widest flex items-center gap-2"><RefreshCw className="w-4 h-4" /> 資料同步</h4><div className="bg-morandi-oatmeal/50 p-5 rounded-[24px] border border-slate-100"><p className="text-xs text-morandi-charcoal/80 mb-4 font-bold leading-relaxed tracking-wide">若發現資料與雲端不同步（例如其他裝置已更新），可點擊下方按鈕強制重新讀取。</p><motion.button whileTap={buttonTap} onClick={() => { onSync(); onClose(); }} className="w-full py-4 rounded-[16px] bg-slate-600 text-white font-bold flex items-center justify-center gap-2 shadow-lg tracking-wide"><RefreshCw className="w-5 h-5" /> 強制同步雲端資料</motion.button></div></section><section className="space-y-3"><h4 className="text-xs font-bold text-morandi-pebble uppercase tracking-widest flex items-center gap-2"><LinkIcon className="w-4 h-4" /> 伺服器連線 (GAS URL)</h4><div className="bg-morandi-oatmeal/50 p-5 rounded-[24px] space-y-4 border border-slate-100"><p className="text-[10px] text-morandi-charcoal/60 font-bold leading-relaxed tracking-wide">請將您 Google Apps Script 部署後的 Web App URL 貼於此處，以確保資料正確寫入您的試算表。</p><textarea className="w-full p-3 rounded-2xl border border-slate-200 text-[10px] text-slate-600 font-mono bg-white h-20 resize-none outline-none focus:ring-2 focus:ring-morandi-blue shadow-sm" placeholder="https://script.google.com/macros/s/..." value={inputUrl} onChange={(e) => setInputUrl(e.target.value)} /><motion.button whileTap={buttonTap} onClick={handleUrlSubmit} className={`w-full py-3 rounded-[16px] font-bold flex items-center justify-center gap-2 transition-all tracking-wide ${urlSaveStatus === 'success' ? 'bg-morandi-green-text text-white' : 'bg-white text-slate-600 shadow-sm border border-slate-200'}`}>{urlSaveStatus === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}{urlSaveStatus === 'success' ? '網址已更新' : '儲存連線網址'}</motion.button></div></section><section className="space-y-3"><h4 className="text-xs font-bold text-morandi-pebble uppercase tracking-widest flex items-center gap-2"><Lock className="w-4 h-4" /> 安全性設定</h4><div className="bg-morandi-oatmeal/50 p-5 rounded-[24px] space-y-4 border border-slate-100"><div className="space-y-3"><div className="space-y-1"><label className="text-[10px] font-bold text-morandi-pebble pl-1">原密碼</label><div className="relative"><Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-morandi-pebble" /><input type="password" placeholder="輸入目前密碼" className="w-full pl-10 pr-4 py-3 bg-white rounded-2xl text-morandi-charcoal font-bold text-sm border border-slate-200 outline-none focus:ring-2 focus:ring-morandi-blue transition-all tracking-wide" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} disabled={saveStatus === 'loading'} /></div></div><div className="space-y-1"><label className="text-[10px] font-bold text-morandi-pebble pl-1">新密碼</label><div className="relative"><Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-morandi-pebble" /><input type="text" placeholder="輸入新密碼" className="w-full pl-10 pr-4 py-3 bg-white rounded-2xl text-morandi-charcoal font-bold text-sm border border-slate-200 outline-none focus:ring-2 focus:ring-morandi-blue transition-all tracking-wide" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={saveStatus === 'loading'} /></div></div></div><motion.button whileTap={buttonTap} onClick={handlePasswordSubmit} disabled={saveStatus === 'loading'} className={`w-full py-3 rounded-[16px] font-bold flex items-center justify-center gap-2 transition-all tracking-wide ${saveStatus === 'success' ? 'bg-morandi-green-text text-white' : 'bg-white text-slate-600 shadow-sm border border-slate-200'} ${saveStatus === 'loading' ? 'opacity-70' : ''}`}>{saveStatus === 'success' ? <CheckCircle2 className="w-4 h-4" /> : saveStatus === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{saveStatus === 'success' ? '密碼已更新' : saveStatus === 'loading' ? '更新中...' : '儲存新密碼'}</motion.button></div></section><div className="text-center pt-4 border-t border-gray-100"><p className="text-[10px] text-morandi-pebble font-bold tracking-wide">Noodle Factory Manager v1.7 (Secured)</p></div></div></motion.div></div>); };
const NavItem: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string; }> = ({ active, onClick, icon, label }) => ( <motion.button onClick={onClick} whileTap={{ scale: 0.9 }} className={`group flex flex-col items-center justify-center w-full transition-all duration-300 ${active ? '-translate-y-1' : 'opacity-40 hover:opacity-70'}`}> <motion.div className={`w-12 h-12 rounded-[20px] flex items-center justify-center mb-1 transition-all duration-300 ${active ? 'text-white shadow-lg' : 'text-morandi-pebble group-hover:bg-morandi-oatmeal/50'}`} style={{ backgroundColor: active ? COLORS.primary : 'transparent', }} animate={{ scale: active ? 1.1 : 1, backgroundColor: active ? COLORS.primary : 'rgba(0,0,0,0)' }}> {icon} </motion.div> <span className={`text-[10px] font-bold tracking-widest transition-colors ${active ? 'text-morandi-charcoal' : 'text-morandi-pebble'}`}> {label} </span> </motion.button> );

// ... (ToastNotification remains unchanged) ...
const ToastNotification: React.FC<{
  toasts: Toast[];
  removeToast: (id: string) => void;
}> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed bottom-[90px] left-0 right-0 z-[150] flex flex-col items-center gap-2 pointer-events-none px-4">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.7}
            onDragEnd={(event, info) => {
              if (Math.abs(info.offset.x) > 100) {
                removeToast(toast.id);
              }
            }}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            onClick={() => { if(!toast.action) removeToast(toast.id); }}
            className={`
              pointer-events-auto cursor-pointer shadow-lg shadow-black/5 rounded-full px-5 py-3 flex items-center gap-3 min-w-[200px] max-w-sm backdrop-blur-md border border-white/20
              ${toast.type === 'success' ? 'bg-[#E3ECE6]/95 text-[#4A6356]' : ''}
              ${toast.type === 'error' ? 'bg-rose-50/95 text-rose-500' : ''}
              ${toast.type === 'info' ? 'bg-slate-700/90 text-white' : ''}
            `}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-5 h-5 shrink-0" />}
            {toast.type === 'info' && <Bell className="w-5 h-5 shrink-0" />}
            <span className="text-xs font-bold tracking-wide leading-tight flex-1">{toast.message}</span>
            {toast.action && (
              <button
                onClick={(e) => { e.stopPropagation(); toast.action!.onClick(); removeToast(toast.id); }}
                className="ml-2 text-[10px] bg-white/20 px-3 py-1.5 rounded-lg font-black hover:bg-white/30 transition-colors tracking-wide border border-white/10"
              >
                {toast.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

// --- 主要 App 組件 ---
const App: React.FC = () => {
  // ... (State declarations remain unchanged) ...
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [apiEndpoint, setApiEndpoint] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('nm_gas_url') || DEFAULT_GAS_URL;
    return DEFAULT_GAS_URL;
  });

  const [activeTab, setActiveTab] = useState<'orders' | 'customers' | 'products' | 'work' | 'schedule' | 'finance'>('orders');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false); // New state for background sync indicator
  const [isSaving, setIsSaving] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const mainRef = useRef<HTMLDivElement>(null);
  
  // NEW: Ref to store the version (lastUpdated timestamp) of the item currently being edited
  const editingVersionRef = useRef<number | undefined>(undefined);

  // NEW: State for Conflict Management
  const [conflictData, setConflictData] = useState<{
    action: string;
    data: any;
    description: string;
  } | null>(null);

  // NEW: State for Voice Input
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [voiceLoadingText, setVoiceLoadingText] = useState('AI 正在解析您的訂單...'); // NEW State

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('nm_selected_date');
      if (saved) return saved;
    }
    return getTomorrowDate();
  });

  const [workDates, setWorkDates] = useState<string[]>([getTomorrowDate()]);
  const [workCustomerFilter, setWorkCustomerFilter] = useState('');
  const [workCategoryFilter, setWorkCategoryFilter] = useState<string>('all');
  const [workDeliveryMethodFilter, setWorkDeliveryMethodFilter] = useState<string[]>([]);
  
  const [scheduleDate, setScheduleDate] = useState<string>(getTomorrowDate());
  const [scheduleDeliveryMethodFilter, setScheduleDeliveryMethodFilter] = useState<string[]>([]);
  
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isAddingOrder, setIsAddingOrder] = useState(false);
  // NEW: State for editing order
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  const [holidayEditorId, setHolidayEditorId] = useState<string | null>(null);

  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [quickAddData, setQuickAddData] = useState<{customerName: string, items: {productId: string, quantity: number, unit: string}[]} | null>(null);

  const [tempPriceProdId, setTempPriceProdId] = useState('');
  const [tempPriceValue, setTempPriceValue] = useState('');
  const [tempPriceUnit, setTempPriceUnit] = useState('斤');

  const [collapsedWorkGroups, setCollapsedWorkGroups] = useState<Set<string>>(new Set());
  const [completedWorkItems, setCompletedWorkItems] = useState<Set<string>>(new Set());

  const [pickerConfig, setPickerConfig] = useState<{
    isOpen: boolean;
    onSelect: (productId: string) => void;
    currentProductId?: string;
    customPrices?: CustomerPrice[];
  }>({ isOpen: false, onSelect: () => {} });

  const [customerPickerConfig, setCustomerPickerConfig] = useState<{
    isOpen: boolean;
    onSelect: (customerId: string) => void;
    currentSelectedId?: string;
  }>({ isOpen: false, onSelect: () => {} });

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const [settlementTarget, setSettlementTarget] = useState<{name: string, allOrderIds: string[]} | null>(null);
  const [settlementDate, setSettlementDate] = useState<string>(getLastMonthEndDate());

  const [orderForm, setOrderForm] = useState<{
    customerType: 'existing' | 'retail';
    customerId: string;
    customerName: string;
    deliveryTime: string;
    deliveryMethod: string;
    items: OrderItem[];
    note: string;
  }>({
    customerType: 'existing',
    customerId: '',
    customerName: '',
    deliveryTime: '08:00',
    deliveryMethod: '',
    items: [{ productId: '', quantity: 10, unit: '斤' }],
    note: ''
  });

  // ... (Rest of states remain unchanged) ...
  const [customerForm, setCustomerForm] = useState<Partial<Customer>>({});
  const [isEditingCustomer, setIsEditingCustomer] = useState<string | null>(null);
  const [isEditingProduct, setIsEditingProduct] = useState<string | null>(null);
  const [productForm, setProductForm] = useState<Partial<Product>>({});
  const [customerSearch, setCustomerSearch] = useState('');
  
  const [initialProductOrder, setInitialProductOrder] = useState<string[]>([]);
  const [hasReorderedProducts, setHasReorderedProducts] = useState(false);

  const [lastOrderCandidate, setLastOrderCandidate] = useState<{date: string, items: OrderItem[]} | null>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);

  // ... (Callbacks and Effects remain unchanged until handleSaveOrder) ...
  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000); 
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  useEffect(() => {
    setIsSelectionMode(false);
    setSelectedOrderIds(new Set());
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  useEffect(() => {
    if (selectedOrderIds.size > 0) {
      setSelectedOrderIds(new Set());
    }
  }, [selectedDate, scheduleDate, scheduleDeliveryMethodFilter]);

  useEffect(() => {
    if (products.length > 0 && initialProductOrder.length === 0) {
      setInitialProductOrder(products.map(p => p.id));
    }
  }, [products]);

  // NEW: Effect for dynamic loading text
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isProcessingVoice) {
      setVoiceLoadingText('AI 正在解析您的訂單...');
      timer = setTimeout(() => {
        setVoiceLoadingText('正在思考中，請稍候...');
      }, 3000);
    }
    return () => clearTimeout(timer);
  }, [isProcessingVoice]);

  // ... (Computed values remain unchanged) ...
  const orderSummary = useMemo(() => { const customer = customers.find(c => c.id === orderForm.customerId); let totalPrice = 0; const details = orderForm.items.map(item => { const product = products.find(p => p.id === item.productId); const priceItem = customer?.priceList?.find(pl => pl.productId === item.productId); const unitPrice = priceItem ? priceItem.price : (product?.price || 0); let displayQty = item.quantity; let displayUnit = item.unit || '斤'; let subtotal = 0; let isCalculated = false; if (item.unit === '元') { subtotal = item.quantity; if (unitPrice > 0) { displayQty = parseFloat((item.quantity / unitPrice).toFixed(1)); displayUnit = product?.unit || '斤'; isCalculated = true; } else { displayQty = 0; } } else { subtotal = Math.round(item.quantity * unitPrice); displayQty = item.quantity; displayUnit = item.unit || '斤'; } totalPrice += subtotal; return { name: product?.name || '未選品項', rawQty: item.quantity, rawUnit: item.unit, displayQty, displayUnit, subtotal, unitPrice, isCalculated }; }); return { totalPrice, details }; }, [orderForm.items, orderForm.customerId, customers, products]);
  const calculateOrderTotalAmount = (order: Order) => { const customer = customers.find(c => c.name === order.customerName); let total = 0; (Array.isArray(order.items) ? order.items : []).forEach(item => { const product = products.find(p => p.id === item.productId || p.name === item.productId); const priceItem = customer?.priceList?.find(pl => pl.productId === (product?.id || item.productId)); const unitPrice = priceItem ? priceItem.price : (product?.price || 0); if (item.unit === '元') { total += item.quantity; } else { total += Math.round(item.quantity * unitPrice); } }); return total; };
  const getQuickAddPricePreview = () => { if (!quickAddData || quickAddData.items.length === 0) return null; const customer = customers.find(c => c.name === quickAddData.customerName); if (!customer) return null; let totalOrderPrice = 0; quickAddData.items.forEach(item => { if (!item.productId) return; const product = products.find(p => p.id === item.productId); if (!product) return; const priceItem = customer.priceList?.find(pl => pl.productId === product.id); const unitPrice = priceItem ? priceItem.price : (product.price || 0); let itemTotal = 0; if (item.unit === '元') { itemTotal = item.quantity; } else { itemTotal = Math.round(item.quantity * unitPrice); } totalOrderPrice += itemTotal; }); return { total: totalOrderPrice, itemCount: quickAddData.items.length }; };
  const scheduleOrders = useMemo(() => { return orders.filter(o => { if (o.deliveryDate !== scheduleDate) return false; if (scheduleDeliveryMethodFilter.length > 0) { const customer = customers.find(c => c.name === o.customerName); const method = o.deliveryMethod || customer?.deliveryMethod || ''; if (!scheduleDeliveryMethodFilter.includes(method)) return false; } return true; }).sort((a, b) => { return a.deliveryTime.localeCompare(b.deliveryTime); }); }, [orders, scheduleDate, scheduleDeliveryMethodFilter, customers]);
  const scheduleMoneySummary = useMemo(() => { let totalReceivable = 0; let totalCollected = 0; scheduleOrders.forEach(order => { const amount = calculateOrderTotalAmount(order); totalReceivable += amount; if (order.status === OrderStatus.PAID) { totalCollected += amount; } }); return { totalReceivable, totalCollected }; }, [scheduleOrders, customers, products]);
  const financeData = useMemo(() => { const outstandingMap = new Map<string, { totalDebt: number, count: number, orderIds: string[] }>(); let grandTotalDebt = 0; orders.forEach(order => { if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.CANCELLED) { const amount = calculateOrderTotalAmount(order); grandTotalDebt += amount; if (!outstandingMap.has(order.customerName)) { outstandingMap.set(order.customerName, { totalDebt: 0, count: 0, orderIds: [] }); } const entry = outstandingMap.get(order.customerName)!; entry.totalDebt += amount; entry.count += 1; entry.orderIds.push(order.id); } }); const sortedOutstanding = Array.from(outstandingMap.entries()).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.totalDebt - a.totalDebt); return { grandTotalDebt, outstanding: sortedOutstanding }; }, [orders, customers, products]);
  const settlementPreview = useMemo(() => { if (!settlementTarget) return null; const filteredOrders = orders.filter(o => { if (!settlementTarget.allOrderIds.includes(o.id)) return false; return o.deliveryDate <= settlementDate; }); let totalAmount = 0; filteredOrders.forEach(o => { totalAmount += calculateOrderTotalAmount(o); }); return { orders: filteredOrders, totalAmount, count: filteredOrders.length }; }, [settlementTarget, settlementDate, orders, customers, products]);
  
  const groupedOrders = useMemo(() => {
    const groups: { [key: string]: Order[] } = {};
    const dayOrders = orders.filter(o => o.deliveryDate === selectedDate);
    dayOrders.forEach(o => {
      if (!groups[o.customerName]) {
        groups[o.customerName] = [];
      }
      groups[o.customerName].push(o);
    });
    return groups;
  }, [orders, selectedDate]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    const term = customerSearch.toLowerCase();
    return customers.filter(c => c.name.toLowerCase().includes(term) || (c.phone && c.phone.includes(term)));
  }, [customers, customerSearch]);

  const workSheetData = useMemo(() => {
    let filtered = orders.filter(o => workDates.includes(o.deliveryDate));
    if (workCustomerFilter) filtered = filtered.filter(o => o.customerName.includes(workCustomerFilter));
    if (workDeliveryMethodFilter.length > 0) {
      filtered = filtered.filter(o => {
        const c = customers.find(cust => cust.name === o.customerName);
        const m = o.deliveryMethod || c?.deliveryMethod || '';
        return workDeliveryMethodFilter.includes(m);
      });
    }
    const map = new Map<string, {name: string, unit: string, totalQty: number, details: {customerName: string, qty: number}[]}>();
    filtered.forEach(o => {
      o.items.forEach(item => {
        const p = products.find(prod => prod.id === item.productId || prod.name === item.productId);
        const pName = p?.name || item.productId;
        const unit = item.unit || p?.unit || '斤';
        const key = `${pName}::${unit}`; 
        if (!map.has(key)) map.set(key, { name: pName, unit, totalQty: 0, details: [] });
        const entry = map.get(key)!;
        entry.totalQty += item.quantity;
        const detail = entry.details.find(d => d.customerName === o.customerName);
        if (detail) detail.qty += item.quantity;
        else entry.details.push({ customerName: o.customerName, qty: item.quantity });
      });
    });
    const flatList = Array.from(map.values());
    flatList.forEach(val => { val.totalQty = Math.round(val.totalQty * 100) / 100; val.details.forEach(d => d.qty = Math.round(d.qty * 100) / 100); });
    const groups: Record<string, typeof flatList> = {};
    PRODUCT_CATEGORIES.forEach(c => groups[c.id] = []);
    groups['other'] = [];
    flatList.forEach(item => { const product = products.find(p => p.name === item.name); const catId = product?.category || 'other'; if (groups[catId]) groups[catId].push(item); else groups['other'].push(item); });
    const result = PRODUCT_CATEGORIES.map(cat => ({ ...cat, items: groups[cat.id], totalWeight: groups[cat.id].reduce((sum, i) => sum + i.totalQty, 0) })).filter(g => g.items.length > 0);
    if (workCategoryFilter !== 'all') return result.filter(group => group.id === workCategoryFilter);
    return result;
  }, [orders, workDates, workCustomerFilter, workCategoryFilter, workDeliveryMethodFilter, products, customers]);

  // ... (Other handlers remain unchanged until handleCreateOrderFromCustomer) ...
  const handleCopyOrder = (custName: string, orders: Order[]) => { const customer = customers.find(c => c.name === custName); let totalAmount = 0; const lines = [`📅 訂單日期: ${selectedDate}`, `👤 客戶: ${custName}`]; lines.push('----------------'); orders.forEach(o => { o.items.forEach(item => { const p = products.find(prod => prod.id === item.productId); const pName = p?.name || item.productId; const unit = item.unit || p?.unit || '斤'; let itemPrice = 0; if (unit === '元') { itemPrice = item.quantity; } else { const priceInfo = customer?.priceList?.find(pl => pl.productId === item.productId); const uPrice = priceInfo ? priceInfo.price : 0; itemPrice = Math.round(item.quantity * uPrice); } totalAmount += itemPrice; lines.push(`- ${pName}: ${item.quantity}${unit}`); }); }); lines.push('----------------'); lines.push(`💰 總金額: $${totalAmount.toLocaleString()}`); if (orders[0]?.note) lines.push(`📝 備註: ${orders[0].note}`); navigator.clipboard.writeText(lines.join('\n')).then(() => { addToast('訂單內容已複製！', 'success'); }); };
  const handleShareOrder = async (order: Order) => { const customer = customers.find(c => c.name === order.customerName); const totalAmount = calculateOrderTotalAmount(order); let text = `🚚 配送單 [${order.deliveryDate}]\n`; text += `----------------\n`; text += `👤 客戶: ${order.customerName}\n`; if (customer?.phone) text += `📞 電話: ${customer.phone}\n`; text += `⏰ 時間: ${formatTimeDisplay(order.deliveryTime)}\n`; if (order.deliveryMethod) text += `🛵 方式: ${order.deliveryMethod}\n`; text += `\n📦 品項:\n`; order.items.forEach(item => { const p = products.find(prod => prod.id === item.productId || prod.name === item.productId); text += `- ${p?.name || item.productId}: ${item.quantity} ${item.unit}\n`; }); if (order.note) text += `\n📝 備註: ${order.note}\n`; text += `----------------\n`; text += `💰 總金額: $${totalAmount.toLocaleString()}`; if (navigator.share) { try { await navigator.share({ title: `配送單 - ${order.customerName}`, text: text }); } catch (err) { console.log('Share canceled'); } } else { navigator.clipboard.writeText(text); addToast('配送資訊已複製！', 'success'); } };
  const handleCopyStatement = (customerName: string, totalDebt: number) => { const text = `【${customerName} 對帳單】\n截至目前未結款項: $${totalDebt.toLocaleString()}\n請核對，謝謝！`; navigator.clipboard.writeText(text).then(() => addToast('對帳單文字已複製', 'success')); };
  const openGoogleMaps = (name: string) => { const query = encodeURIComponent(name); window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank'); };
  const handleLogin = async (pwd: string) => { if (!apiEndpoint) { if (pwd === '8888') { setIsAuthenticated(true); localStorage.setItem('nm_auth_status', 'true'); return true; } return false; } try { const res = await fetch(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'login', data: { password: pwd } }) }); const json = await res.json(); if (json.success && json.data === true) { setIsAuthenticated(true); localStorage.setItem('nm_auth_status', 'true'); return true; } return false; } catch (e) { console.error("Login Error:", e); return false; } };
  const handleLogout = () => { setIsAuthenticated(false); localStorage.removeItem('nm_auth_status'); setCustomers([]); setOrders([]); setProducts([]); addToast("已安全登出", 'info'); };
  const handleChangePassword = async (oldPwd: string, newPwd: string) => { if (!apiEndpoint) return false; try { const res = await fetch(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'changePassword', data: { oldPassword: oldPwd, newPassword: newPwd } }) }); const json = await res.json(); if (json.success && json.data === true) { return true; } return false; } catch (e) { console.error("Change Password Error:", e); return false; } };
  const handleSaveApiUrl = (newUrl: string) => { localStorage.setItem('nm_gas_url', newUrl); setApiEndpoint(newUrl); };
  
  // REFACTORED: syncData logic to support silent mode
  const syncData = useCallback(async (isSilent = false) => { 
    if (!apiEndpoint) { 
      setIsInitialLoading(false); 
      return; 
    } 
    
    // Choose loading indicator based on mode
    if (!isSilent) setIsInitialLoading(true);
    else setIsBackgroundSyncing(true);

    try { 
      const startDate = new Date(); 
      startDate.setDate(startDate.getDate() - 60); 
      const startDateStr = formatDateStr(startDate); 
      const res = await fetch(`${apiEndpoint}?type=init&startDate=${startDateStr}`); 
      const result: GASResponse<any> = await res.json(); 
      if (result.success && result.data) { 
        const mappedCustomers: Customer[] = (result.data.customers || []).map((c: any) => { 
          const priceListKey = Object.keys(c).find(k => k.includes('價目表') || k.includes('Price') || k.includes('priceList')) || '價目表JSON'; 
          return { 
            id: String(c.ID || c.id || ''), 
            name: c.客戶名稱 || c.name || '', 
            phone: c.電話 || c.phone || '', 
            deliveryTime: c.配送時間 || c.deliveryTime || '', 
            deliveryMethod: c.配送方式 || c.deliveryMethod || '', 
            paymentTerm: c.付款週期 || c.paymentTerm || 'daily', 
            defaultItems: safeJsonArray(c.預設品項JSON || c.預設品項 || c.defaultItems), 
            priceList: safeJsonArray(c[priceListKey] || c.priceList).map((pl: any) => ({ productId: pl.productId, price: Number(pl.price) || 0, unit: pl.unit || '斤' })), 
            offDays: safeJsonArray(c.公休日週期JSON || c.公休日週期 || c.offDays), 
            holidayDates: safeJsonArray(c.特定公休日JSON || c.特定公休日 || c.holidayDates),
            lastUpdated: Number(c.lastUpdated) || 0
          }; 
        }); 
        const mappedProducts: Product[] = (result.data.products || []).map((p: any) => ({ 
          id: String(p.ID || p.id), 
          name: p.品項 || p.name, 
          unit: p.單位 || p.unit, 
          price: Number(p.單價 || p.price) || 0, 
          category: p.分類 || p.category || 'other',
          lastUpdated: Number(p.lastUpdated) || 0
        })); 
        const rawOrders = result.data.orders || []; 
        const orderMap: { [key: string]: Order } = {}; 
        rawOrders.forEach((o: any) => { 
          const oid = String(o.訂單ID || o.id); 
          if (!orderMap[oid]) { 
            const rawDate = o.配送日期 || o.deliveryDate; 
            const normalizedDate = normalizeDate(rawDate); 
            orderMap[oid] = { 
              id: oid, 
              createdAt: o.建立時間 || o.createdAt, 
              customerName: o.客戶名 || o.customerName || '未知客戶', 
              deliveryDate: normalizedDate, 
              deliveryTime: o.配送時間 || o.deliveryTime, 
              items: [], 
              note: o.備註 || o.note || '', 
              status: (o.狀態 || o.status as OrderStatus) || OrderStatus.PENDING, 
              deliveryMethod: o.配送方式 || o.deliveryMethod || '',
              lastUpdated: Number(o.lastUpdated) || 0
            }; 
          } 
          const prodName = o.品項 || o.productName; 
          const prod = mappedProducts.find(p => p.name === prodName); 
          orderMap[oid].items.push({ productId: prod ? prod.id : prodName, quantity: Number(o.數量 || o.quantity) || 0, unit: o.unit || prod?.unit || '斤' }); 
        }); 
        setCustomers(mappedCustomers); 
        setProducts(mappedProducts); 
        setOrders(Object.values(orderMap)); 
        setInitialProductOrder(mappedProducts.map(p => p.id)); 
        setHasReorderedProducts(false); 
        
        // Only show success toast for explicit user actions, not background sync
        if (!isSilent) addToast('雲端資料已同步完成 (近60天)', 'success'); 
      } 
    } catch (e) { 
      console.error("無法連線至雲端:", e); 
      // Keep error toast even in silent mode? Optional, but safer to know if network fails consistently
      addToast("同步失敗，請檢查網路連線", 'error'); 
    } finally { 
      setIsInitialLoading(false); 
      setIsBackgroundSyncing(false);
    } 
  }, [apiEndpoint, addToast]); // Depend on API endpoint and toaster

  // NEW: Automator Effect for Polling and Focus Refetch
  useEffect(() => {
    if (!isAuthenticated) return;

    // 1. Define the silent sync executor with safety locks
    const performSilentSync = () => {
      // Safety Lock: Don't sync if user is editing
      if (isAddingOrder || isEditingCustomer || isEditingProduct || quickAddData || editingOrderId) {
        console.log("使用者忙碌中，略過背景同步");
        return;
      }
      
      // Execute sync in silent mode
      syncData(true);
    };

    // 2. Initial Sync on mount (explicitly non-silent if needed, but handled by the original effect below if kept separate.
    // However, to consolidate, we can rely on the original effect for initial load and this one for updates)
    
    // 3. Polling Logic (Every 60 seconds)
    const intervalId = setInterval(performSilentSync, 60000);

    // 4. Focus Logic (Revalidate on Focus)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        performSilentSync();
      }
    };
    
    const onWindowFocus = () => {
        performSilentSync();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onWindowFocus);

    // Cleanup
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onWindowFocus);
    };
  }, [isAuthenticated, syncData, isAddingOrder, isEditingCustomer, isEditingProduct, quickAddData, editingOrderId]);

  // Keep original initial load effect for first render
  useEffect(() => { if (isAuthenticated) { syncData(false); } }, [isAuthenticated, syncData]);

  const findLastOrder = (customerId: string, customerName: string) => { const customerOrders = orders.filter(o => o.customerName === customerName || customers.find(c => c.id === customerId)?.name === o.customerName); const sorted = customerOrders.sort((a, b) => new Date(b.deliveryDate).getTime() - new Date(a.deliveryDate).getTime()); const last = sorted.find(o => o.deliveryDate !== selectedDate); if (last && last.items.length > 0) { setLastOrderCandidate({ date: last.deliveryDate, items: last.items.map(i => ({...i})) }); } else { setLastOrderCandidate(null); } };
  const applyLastOrder = () => { if (!lastOrderCandidate) return; setOrderForm(prev => ({ ...prev, items: lastOrderCandidate.items.map(i => ({...i})) })); setLastOrderCandidate(null); addToast('已帶入上次訂單內容', 'success'); };
  const handleSelectExistingCustomer = (id: string) => { const cust = customers.find(c => c.id === id); if (cust) { if (groupedOrders[cust.name] && groupedOrders[cust.name].length > 0) { addToast(`注意：${cust.name} 今日已建立過訂單`, 'info'); } setOrderForm({ ...orderForm, customerId: id, customerName: cust.name, deliveryTime: formatTimeForInput(cust.deliveryTime), deliveryMethod: cust.deliveryMethod || '', items: cust.defaultItems && cust.defaultItems.length > 0 ? cust.defaultItems.map(di => ({ ...di })) : [{ productId: '', quantity: 10, unit: '斤' }] }); findLastOrder(id, cust.name); } };
  
  // NEW: Handle Edit Order
  const handleEditOrder = (order: Order) => {
    setEditingOrderId(order.id);
    // 鎖定當下版本
    editingVersionRef.current = order.lastUpdated;
    
    const cust = customers.find(c => c.name === order.customerName);
    setOrderForm({
      customerType: 'existing', // Assume existing for simplicity, or check ID logic
      customerId: cust ? cust.id : '',
      customerName: order.customerName,
      deliveryTime: formatTimeForInput(order.deliveryTime),
      deliveryMethod: order.deliveryMethod || cust?.deliveryMethod || '',
      items: order.items.map(i => ({ ...i })),
      note: order.note
    });
    setIsAddingOrder(true);
  };

  const handleCreateOrderFromCustomer = (c: Customer) => { const proceedWithCreation = () => { setEditingOrderId(null); editingVersionRef.current = undefined; setOrderForm({ customerType: 'existing', customerId: c.id, customerName: c.name, deliveryTime: formatTimeForInput(c.deliveryTime), deliveryMethod: c.deliveryMethod || '', items: c.defaultItems && c.defaultItems.length > 0 ? c.defaultItems.map(di => ({ ...di })) : [{ productId: '', quantity: 10, unit: '斤' }], note: '' }); findLastOrder(c.id, c.name); setIsAddingOrder(true); }; if (groupedOrders[c.name] && groupedOrders[c.name].length > 0) { setConfirmConfig({ isOpen: true, title: '重複訂單提醒', message: `「${c.name}」在今日 (${selectedDate}) 已經有訂單了！\n\n確定要「追加」一筆新訂單嗎？`, onConfirm: () => { setConfirmConfig(prev => ({...prev, isOpen: false})); proceedWithCreation(); } }); } else { proceedWithCreation(); } };
  
  // NEW: Handle Force Retry
  const handleForceRetry = async () => {
    if (!conflictData || !apiEndpoint) return;
    setIsSaving(true);
    
    // Construct new payload with force: true
    const newPayload = { ...conflictData.data, force: true };
    
    try {
      const res = await fetch(apiEndpoint, { 
        method: 'POST', 
        body: JSON.stringify({ action: conflictData.action, data: newPayload }) 
      });
      const json = await res.json();
      
      if (json.success) {
        addToast('強制覆蓋成功', 'success');
        setConflictData(null);
        // Force a re-sync to get the latest correct state from backend (including updated timestamps)
        syncData(true);
        
        // Close editors if open
        setIsAddingOrder(false);
        setEditingOrderId(null);
        setIsEditingCustomer(null);
        setIsEditingProduct(null);
      } else {
        addToast('強制覆蓋失敗，請檢查網路', 'error');
      }
    } catch (e) {
      console.error(e);
      addToast('強制覆蓋發生錯誤', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // UPDATED: handleSaveOrder to support Edit & Conflict Handling
  const handleSaveOrder = async () => { 
    // 防止連點
    if (isSaving) return; 
    
    const finalName = orderForm.customerType === 'existing' ? orderForm.customerName : orderForm.customerName; 
    if (!finalName) return; 
    
    const validItems = orderForm.items.filter(i => i.productId !== '' && i.quantity > 0); 
    if (validItems.length === 0) return; 
    
    // 1. 準備資料
    const processedItems = orderSummary.details.filter(d => d.rawQty > 0).map(detail => { 
      const originalItem = orderForm.items.find(i => { 
        const p = products.find(prod => prod.id === i.productId); 
        return (p?.name || '') === detail.name || i.productId === detail.name; 
      }) || orderForm.items[0]; 
      return { productId: originalItem.productId, quantity: Math.max(0, detail.displayQty), unit: detail.displayUnit }; 
    }); 

    let newOrder: Order;
    let actionName = 'createOrder';

    if (editingOrderId) {
      const existingOrder = orders.find(o => o.id === editingOrderId);
      newOrder = {
        id: editingOrderId,
        createdAt: existingOrder?.createdAt || new Date().toISOString(),
        customerName: finalName,
        deliveryDate: existingOrder?.deliveryDate || selectedDate,
        deliveryTime: orderForm.deliveryTime,
        deliveryMethod: orderForm.deliveryMethod,
        items: processedItems,
        note: orderForm.note,
        status: existingOrder?.status || OrderStatus.PENDING,
        lastUpdated: editingVersionRef.current // 傳送舊版本給後端比對 (雖然通常是在 payload 外層傳)
      };
      actionName = 'updateOrderContent';
    } else {
      newOrder = { 
        id: 'ORD-' + Date.now(), 
        createdAt: new Date().toISOString(), 
        customerName: finalName, 
        deliveryDate: selectedDate, 
        deliveryTime: orderForm.deliveryTime, 
        deliveryMethod: orderForm.deliveryMethod, 
        items: processedItems, 
        note: orderForm.note, 
        status: OrderStatus.PENDING 
      };
    }

    // 2. 快照備份 (Snapshot)
    const previousOrders = [...orders];

    // 3. 樂觀更新 (Optimistic Update)
    if (editingOrderId) {
        setOrders(prev => prev.map(o => o.id === editingOrderId ? newOrder : o));
        addToast('訂單已更新', 'success');
    } else {
        setOrders(prev => [newOrder, ...prev]);
        addToast('訂單建立成功', 'success');
    }
    
    // 4. 立即關閉 UI
    setIsAddingOrder(false); 
    setEditingOrderId(null);
    setOrderForm({ customerType: 'existing', customerId: '', customerName: '', deliveryTime: '08:00', deliveryMethod: '', items: [{ productId: '', quantity: 10, unit: '斤' }], note: '' }); 

    // 5. 背景 API 同步
    try { 
      if (apiEndpoint) { 
        const uploadItems = processedItems.map(item => { 
          const p = products.find(prod => prod.id === item.productId); 
          return { productName: p?.name || item.productId, quantity: item.quantity, unit: item.unit }; 
        }); 
        
        const payload = { ...newOrder, items: uploadItems };
        // 關鍵：將原始版本打包送出
        if (editingOrderId) {
           (payload as any).originalLastUpdated = editingVersionRef.current;
        }

        const res = await fetch(apiEndpoint, { 
          method: 'POST', 
          body: JSON.stringify({ action: actionName, data: payload }) 
        }); 
        const json = await res.json();
        
        // 6. 錯誤回滾與衝突處理
        if (!json.success) {
           setOrders(previousOrders); // 如果失敗，先還原列表
           if (json.errorCode === 'ERR_VERSION_CONFLICT') {
              // 觸發衝突 Modal
              setConflictData({
                action: actionName,
                data: payload,
                description: `訂單客戶：${finalName}`
              });
           } else {
              addToast(editingOrderId ? "更新失敗，已還原資料" : "建立失敗，已還原資料", 'error'); 
           }
        } else {
           // 成功後清除 ref
           editingVersionRef.current = undefined;
        }
      } 
    } catch (e) { 
      console.error("Sync Failed:", e); 
      setOrders(previousOrders); 
      addToast(editingOrderId ? "更新失敗，已還原資料" : "建立失敗，已還原資料", 'error'); 
    } 
  };

  // NEW: Process Voice Order using Gemini
  const handleProcessVoiceOrder = async (transcript: string) => {
    setIsProcessingVoice(true);
    // addToast('AI 正在解析您的訂單...', 'info'); // UI overlay is enough

    try {
      const realTodayDate = formatDateStr(new Date());
      const currentViewDate = selectedDate || realTodayDate;
      const simpleCustomers = customers.map(c => ({ id: c.id, name: c.name }));
      const simpleProducts = products.map(p => ({ id: p.id, name: p.name, category: p.category }));

      // Prompt Engineering
      const prompt = `
        你是一個專業的訂單管理 AI 助手。

        系統基準資訊：
        1. 真實今天 (Real Today): ${realTodayDate} (以此日期計算「明天」、「後天」、「下週一」等相對日期)。
        2. 使用者當前畫面 (Current View): ${currentViewDate} (如果使用者完全沒有提到日期，請將訂單歸類到此日期)。

        任務：將使用者的語音文字轉換為 JSON 格式。

        已知客戶列表：
        ${JSON.stringify(simpleCustomers)}

        已知產品列表：
        ${JSON.stringify(simpleProducts)}

        使用者說：
        "${transcript}"

        規則：
        1. 日期計算邏輯 (重要)：
           - 如果使用者說了相對時間（如「明天」、「下週一」），請務必以 [真實今天 ${realTodayDate}] 為基準進行計算。
           - 如果使用者完全沒有提到時間，請將訂單歸類到 [使用者當前畫面 ${currentViewDate}] 的日期。
        2. 客戶名稱與產品名稱請進行模糊比對，回傳對應的 ID。
        3. 如果找不到對應客戶或產品，ID 留空，將文字放入 Note。
        4. 數量請統一轉換為數字。
        
        Config: Use schema for output.
      `;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              customerName: { type: Type.STRING },
              customerId: { type: Type.STRING },
              deliveryDate: { type: Type.STRING },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    productId: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    unit: { type: Type.STRING }
                  }
                }
              },
              note: { type: Type.STRING }
            }
          }
        }
      });

      const jsonText = response.text;
      if (!jsonText) throw new Error("Empty response from AI");
      const result = JSON.parse(jsonText);

      // Populate Form
      const newItems: OrderItem[] = (result.items || []).map((i: any) => ({
        productId: i.productId || '',
        quantity: i.quantity || 0,
        unit: i.unit || '斤'
      }));

      // Find Customer Delivery Method if ID matched
      let deliveryMethod = '';
      let deliveryTime = '08:00';
      
      if (result.customerId) {
        const c = customers.find(x => x.id === result.customerId);
        if (c) {
          deliveryMethod = c.deliveryMethod || '';
          deliveryTime = formatTimeForInput(c.deliveryTime);
        }
      }

      setOrderForm(prev => ({
        ...prev,
        customerType: 'existing', // Default to existing
        customerName: result.customerName || transcript.substring(0, 10), // Fallback name
        customerId: result.customerId || '',
        deliveryTime: deliveryTime,
        deliveryMethod: deliveryMethod,
        items: newItems.length > 0 ? newItems : [{ productId: '', quantity: 10, unit: '斤' }],
        note: result.note || ''
      }));

      // Update Date if AI parsed a different date
      if (result.deliveryDate && result.deliveryDate !== selectedDate) {
        setSelectedDate(result.deliveryDate);
        addToast(`已切換至 ${result.deliveryDate}`, 'info');
      }

      // Open Editor
      setEditingOrderId(null);
      setIsAddingOrder(true);
      
      // UX: If customer not found, open picker automatically after a short delay
      if (!result.customerId) {
         setTimeout(() => {
            setCustomerPickerConfig({
               isOpen: true,
               onSelect: (id) => handleSelectExistingCustomer(id)
            });
            addToast('AI 未能確定店家，請手動選擇', 'info');
         }, 500);
      } else {
         addToast('AI 解析成功！請確認內容', 'success');
      }

    } catch (e: any) {
      console.error("AI Error:", e);
      let errorMessage = 'AI 解析失敗，請手動輸入';
      
      const errorStr = e.toString().toLowerCase();

      // 詳細錯誤分類 logic
      if (errorStr.includes('401') || errorStr.includes('403') || errorStr.includes('key')) {
         errorMessage = '系統設定異常 (API Key)';
      } else if (errorStr.includes('empty response')) {
         errorMessage = '抱歉，沒聽清楚，請再試一次';
      } else if (errorStr.includes('fetch') || errorStr.includes('network') || errorStr.includes('offline')) {
         errorMessage = '網路連線不穩';
      }

      addToast(errorMessage, 'error');
      
      // Still open the form but empty
      setEditingOrderId(null);
      setIsAddingOrder(true);
      setOrderForm(prev => ({ ...prev, note: `語音轉錄: ${transcript}` }));
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const handleQuickAddSubmit = async () => { if (!quickAddData || isSaving) return; const validItems = quickAddData.items.filter(i => i.productId && i.quantity > 0); if (validItems.length === 0) return; setIsSaving(true); const existingOrders = groupedOrders[quickAddData.customerName] || []; const baseOrder = existingOrders[0]; const now = new Date(); const deliveryTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`; const customer = customers.find(c => c.name === quickAddData.customerName); const deliveryMethod = baseOrder?.deliveryMethod || customer?.deliveryMethod || ''; const processedItems = validItems.map(item => { let finalQuantity = Math.max(0, item.quantity); let finalUnit = item.unit; const product = products.find(p => p.id === item.productId); const targetUnit = product?.unit || '斤'; if (item.unit === '元') { const priceItem = customer?.priceList?.find(pl => pl.productId === item.productId); const unitPrice = priceItem ? priceItem.price : (product?.price || 0); if (unitPrice > 0) { finalQuantity = parseFloat((finalQuantity / unitPrice).toFixed(2)); finalUnit = targetUnit; } } else if (item.unit === '公斤' && targetUnit === '斤') { finalQuantity = parseFloat((finalQuantity * (1000 / 600)).toFixed(2)); finalUnit = '斤'; } return { productId: item.productId, quantity: Math.max(0, finalQuantity), unit: finalUnit }; }); const newOrder: Order = { id: 'Q-ORD-' + Date.now(), createdAt: new Date().toISOString(), customerName: quickAddData.customerName, deliveryDate: selectedDate, deliveryTime: deliveryTime, deliveryMethod: deliveryMethod, items: processedItems, note: '追加單', status: OrderStatus.PENDING }; try { if (apiEndpoint) { const uploadItems = processedItems.map(item => { const p = products.find(prod => prod.id === item.productId); return { productName: p?.name || item.productId, quantity: item.quantity, unit: item.unit }; }); await fetch(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'createOrder', data: { ...newOrder, items: uploadItems } }) }); } } catch (e) { console.error(e); addToast("追加失敗，請檢查網路", 'error'); } setOrders([newOrder, ...orders]); setIsSaving(false); setQuickAddData(null); addToast('追加訂單成功！', 'success'); };
  
  // FIX: Step 2 - Wrap updateOrderStatus in useCallback
  const updateOrderStatus = useCallback(async (orderId: string, newStatus: OrderStatus, showDefaultToast: boolean = true) => { 
    const previousOrders = [...orders]; 
    const orderToUpdate = orders.find(o => o.id === orderId);
    
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o)); 
    try { 
      if (apiEndpoint) { 
        const payload = { 
           id: orderId, 
           status: newStatus,
           originalLastUpdated: orderToUpdate?.lastUpdated 
        };
        const res = await fetch(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'updateOrderStatus', data: payload }) }); 
        const json = await res.json();
        if (!json.success && json.errorCode === 'ERR_VERSION_CONFLICT') {
           setOrders(previousOrders); // Revert
           setConflictData({
              action: 'updateOrderStatus',
              data: payload,
              description: `更新狀態: ${orderToUpdate?.customerName}`
           });
        }
      } 
    } catch (e) { 
      console.error("狀態更新失敗", e); 
      if (showDefaultToast) addToast("狀態更新失敗，請檢查網路", 'error'); 
      setOrders(previousOrders); 
    } 
  }, [orders, apiEndpoint, addToast]); 
  
  // FIX: Step 2 - Wrap handleSwipeStatusChange in useCallback
  const handleSwipeStatusChange = useCallback((orderId: string, newStatus: OrderStatus) => {
    const order = orders.find(o => o.id === orderId);
    if (!order || order.status === newStatus) return;
    const oldStatus = order.status;
    updateOrderStatus(orderId, newStatus, false);
    const getLabel = (s: OrderStatus) => {
       if (s === OrderStatus.PENDING) return '待處理';
       if (s === OrderStatus.SHIPPED) return '已配送';
       if (s === OrderStatus.PAID) return '已收款';
       return s;
    };
    const toastId = Date.now().toString();
    setToasts(prev => [...prev, {
       id: toastId,
       message: `已標記為 ${getLabel(newStatus)}`,
       type: 'success',
       action: {
          label: '復原',
          onClick: () => {
             updateOrderStatus(orderId, oldStatus, false);
             addToast('已復原訂單狀態', 'info');
          }
       }
    }]);
    setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toastId));
    }, 5000);
  }, [orders, updateOrderStatus, addToast]);

  const handleBatchUpdateStatus = async (newStatus: OrderStatus) => { if (selectedOrderIds.size === 0) return; const previousOrders = [...orders]; const idsToUpdate = Array.from(selectedOrderIds); setOrders(prev => prev.map(o => idsToUpdate.includes(o.id) ? { ...o, status: newStatus } : o)); setIsSelectionMode(false); setSelectedOrderIds(new Set()); addToast(`已批量更新 ${idsToUpdate.length} 筆訂單狀態`, 'success'); try { if (apiEndpoint) { await Promise.all(idsToUpdate.map(id => fetch(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'updateOrderStatus', data: { id: id, status: newStatus } }) }))); } } catch (e) { console.error("Batch update failed", e); addToast("批量更新部分失敗，請檢查網路", 'error'); setOrders(previousOrders); } };
  const executeSettlement = async () => { if (!settlementTarget || !settlementPreview) return; const { orders: targetOrders, totalAmount } = settlementPreview; if (targetOrders.length === 0) return; setConfirmConfig({ isOpen: true, title: '確認收款結帳', message: `確定要結算「${settlementTarget.name}」截至 ${settlementDate} 的所有帳款嗎？\n\n共 ${targetOrders.length} 筆訂單，總金額 $${totalAmount.toLocaleString()}`, onConfirm: async () => { setConfirmConfig(prev => ({...prev, isOpen: false})); setSettlementTarget(null); const orderIds = targetOrders.map(o => o.id); const previousOrders = [...orders]; setOrders(prev => prev.map(o => orderIds.includes(o.id) ? { ...o, status: OrderStatus.PAID } : o)); addToast(`已完成 ${settlementTarget.name} 的收款結帳`, 'success'); try { if (apiEndpoint) { await fetch(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'batchUpdatePaymentStatus', data: { customerName: settlementTarget.name, orderIds, newStatus: OrderStatus.PAID } }) }); } } catch(e) { console.error(e); addToast('結帳同步失敗，請檢查網路', 'error'); setOrders(previousOrders); } } }); };
  const handleSaveProductOrder = async () => { if (!apiEndpoint || isSaving) return; setIsSaving(true); const orderedIds = products.map(p => p.id); try { await fetch(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'reorderProducts', data: orderedIds }) }); setInitialProductOrder(orderedIds); setHasReorderedProducts(false); addToast("排序已更新！", 'success'); } catch (e) { console.error(e); addToast("排序儲存失敗，請檢查網路", 'error'); } finally { setIsSaving(false); } };
  const executeDeleteOrder = async (orderId: string) => { 
    setConfirmConfig(prev => ({ ...prev, isOpen: false })); 
    const orderBackup = orders.find(o => o.id === orderId); 
    if (!orderBackup) return; 
    setOrders(prev => prev.filter(o => o.id !== orderId)); 
    try { 
      if (apiEndpoint) { 
        const payload = { id: orderId, originalLastUpdated: orderBackup.lastUpdated };
        const res = await fetch(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'deleteOrder', data: payload }) }); 
        const json = await res.json();
        if (!json.success && json.errorCode === 'ERR_VERSION_CONFLICT') {
           setOrders(prev => [...prev, orderBackup]); // Revert
           setConflictData({
              action: 'deleteOrder',
              data: payload,
              description: `刪除訂單: ${orderBackup.customerName}`
           });
        }
      } 
    } catch (e) { 
      console.error("刪除失敗:", e); 
      addToast("雲端同步刪除失敗，請檢查網路", 'error'); 
      setOrders(prev => [...prev, orderBackup]); 
    } 
  };
  const executeDeleteCustomer = async (customerId: string) => { setConfirmConfig(prev => ({ ...prev, isOpen: false })); const customerBackup = customers.find(c => c.id === customerId); if (!customerBackup) return; setCustomers(prev => prev.filter(c => c.id !== customerId)); try { if (apiEndpoint) { await fetch(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'deleteCustomer', data: { id: customerId, originalLastUpdated: customerBackup.lastUpdated } }) }); } } catch (e) { console.error("刪除失敗:", e); addToast("雲端同步刪除失敗，請檢查網路", 'error'); setCustomers(prev => [...prev, customerBackup]); } };
  const executeDeleteProduct = async (productId: string) => { setConfirmConfig(prev => ({ ...prev, isOpen: false })); const productBackup = products.find(p => p.id === productId); if (!productBackup) return; setProducts(prev => prev.filter(p => p.id !== productId)); try { if (apiEndpoint) { await fetch(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'deleteProduct', data: { id: productId, originalLastUpdated: productBackup.lastUpdated } }) }); } } catch (e) { console.error("刪除失敗:", e); addToast("雲端同步刪除失敗，請檢查網路", 'error'); setProducts(prev => [...prev, productBackup]); } };
  const handleDeleteOrder = (orderId: string) => { setConfirmConfig({ isOpen: true, title: '刪除訂單', message: '確定要刪除此訂單嗎？\n此動作將會同步刪除雲端資料。', onConfirm: () => executeDeleteOrder(orderId) }); };
  const handleDeleteCustomer = (customerId: string) => { setConfirmConfig({ isOpen: true, title: '刪除店家', message: '確定要刪除此店家嗎？\n這將一併刪除相關的設定。', onConfirm: () => executeDeleteCustomer(customerId) }); };
  const handleDeleteProduct = (productId: string) => { setConfirmConfig({ isOpen: true, title: '刪除品項', message: '確定要刪除此品項嗎？\n請確認該品項已無生產需求。', onConfirm: () => executeDeleteProduct(productId) }); };
  
  const handleSaveCustomer = async () => { 
    if (!customerForm.name || isSaving) return; 
    setIsSaving(true); 
    
    const isDuplicateName = customers.some(c => c.name.trim() === (customerForm.name || '').trim() && c.id !== (isEditingCustomer === 'new' ? null : isEditingCustomer)); 
    if (isDuplicateName) { addToast('客戶名稱不可重複！', 'error'); setIsSaving(false); return; } 
    
    const finalCustomer: Customer = { id: isEditingCustomer === 'new' ? Date.now().toString() : (isEditingCustomer as string), name: (customerForm.name || '').trim(), phone: (customerForm.phone || '').trim(), deliveryTime: customerForm.deliveryTime || '08:00', deliveryMethod: customerForm.deliveryMethod || '', paymentTerm: customerForm.paymentTerm || 'regular', defaultItems: (customerForm.defaultItems || []).filter(i => i.productId !== ''), priceList: (customerForm.priceList || []), offDays: customerForm.offDays || [], holidayDates: customerForm.holidayDates || [] }; 
    
    // Backup old list for revert
    const previousCustomers = [...customers];

    // Optimistic Update
    if (isEditingCustomer === 'new') setCustomers([...customers, finalCustomer]); 
    else setCustomers(customers.map(c => c.id === isEditingCustomer ? finalCustomer : c)); 
    
    // Close modal UI immediately
    setIsEditingCustomer(null); 

    try { 
      if (apiEndpoint) { 
        const payload = finalCustomer;
        // 如果是編輯，加上原始版本號
        if (isEditingCustomer !== 'new') {
           (payload as any).originalLastUpdated = editingVersionRef.current;
        }

        const res = await fetch(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'updateCustomer', data: payload }) }); 
        const json = await res.json();
        
        if (!json.success) {
           setCustomers(previousCustomers); // Revert
           if (json.errorCode === 'ERR_VERSION_CONFLICT') {
              setConflictData({
                 action: 'updateCustomer',
                 data: payload,
                 description: `更新店家: ${finalCustomer.name}`
              });
           } else {
              addToast('店家資料儲存失敗', 'error');
           }
           setIsSaving(false);
           return;
        }
      } 
    } catch (e) { 
      console.error(e); 
      setCustomers(previousCustomers); // Revert
      addToast('店家資料儲存失敗，請檢查網路', 'error');
    } 
    
    setIsSaving(false); 
    editingVersionRef.current = undefined;
    addToast('店家資料已儲存', 'success'); 
  };

  const handleSaveProduct = async () => { 
    if (!productForm.name || isSaving) return; 
    setIsSaving(true); 
    const finalProduct = { id: isEditingProduct === 'new' ? 'p' + Date.now() : (isEditingProduct as string), name: productForm.name || '', unit: productForm.unit || '斤', price: Number(productForm.price) || 0, category: productForm.category || 'other' }; 
    
    const previousProducts = [...products];
    if (isEditingProduct === 'new') setProducts([...products, finalProduct]); 
    else setProducts(products.map(p => p.id === isEditingProduct ? finalProduct : p)); 
    
    setIsEditingProduct(null); 

    try { 
      if (apiEndpoint) { 
        const payload = finalProduct;
        if (isEditingProduct !== 'new') {
           (payload as any).originalLastUpdated = editingVersionRef.current;
        }
        const res = await fetch(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'updateProduct', data: payload }) }); 
        const json = await res.json();
        if (!json.success) {
           setProducts(previousProducts);
           if (json.errorCode === 'ERR_VERSION_CONFLICT') {
              setConflictData({
                 action: 'updateProduct',
                 data: payload,
                 description: `更新品項: ${finalProduct.name}`
              });
           } else {
              addToast('品項資料儲存失敗', 'error');
           }
           setIsSaving(false);
           return;
        }
      } 
    } catch (e) { 
      console.error(e); 
      setProducts(previousProducts);
      addToast('品項資料儲存失敗', 'error');
    } 
    
    setIsSaving(false); 
    editingVersionRef.current = undefined;
    addToast('品項資料已儲存', 'success'); 
  };
  
  const handlePrint = () => { if (workSheetData.length === 0) { addToast('目前沒有資料可供匯出', 'info'); return; } const printWindow = window.open('', '_blank'); if (!printWindow) { addToast('彈跳視窗被封鎖，無法開啟列印頁面', 'error'); window.print(); return; } const sortedDates = [...workDates].sort(); const dateRangeDisplay = sortedDates.length > 1 ? `${sortedDates[0]} ~ ${sortedDates[sortedDates.length - 1]} (${sortedDates.length}天)` : sortedDates[0]; let htmlContent = `<!DOCTYPE html><html><head><title>麵廠職人 - 生產總表</title><style>body { font-family: sans-serif; padding: 20px; color: #333; } h1 { text-align: center; margin-bottom: 10px; font-size: 32px; } p.date { text-align: center; color: #666; margin-bottom: 30px; font-size: 20px; font-weight: bold; } table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 18px; } th, td { border: 1px solid #ddd; padding: 12px; text-align: left; vertical-align: top; } th { background-color: #f5f5f5; font-weight: bold; text-align: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 20px; } tr:nth-child(even) { background-color: #fafafa; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .text-right { text-align: right; } .text-center { text-align: center; } .badge { display: inline-block; background: #fff; padding: 4px 8px; border-radius: 4px; font-size: 16px; margin: 4px; border: 1px solid #ddd; color: #555; } .total-cell { font-size: 24px; font-weight: bold; } .footer { margin-top: 40px; text-align: right; font-size: 14px; color: #999; border-top: 1px solid #eee; padding-top: 10px; } </style></head><body><h1>生產總表</h1><p class="date">出貨日期: ${dateRangeDisplay}</p>`; workSheetData.forEach(group => { htmlContent += `<div style="page-break-inside: avoid;"><div class="group-header" style="background-color: ${group.color}40; border-left: 8px solid ${group.color};"> ${group.label} (共 ${group.totalWeight} 單位)</div><table><thead><tr><th width="20%">品項</th><th width="15%">總量</th><th width="10%">單位</th><th>分配明細</th></tr></thead><tbody>${group.items.map(item => `<tr><td style="font-weight: bold; font-size: 22px;">${item.name}</td><td class="text-right total-cell">${item.totalQty}</td><td class="text-center" style="font-size: 18px;">${item.unit}</td><td>${item.details.map(d => `<span class="badge">${d.customerName} <b>${d.qty}</b></span>`).join('')}</td></tr>`).join('')}</tbody></table></div>`; }); htmlContent += `<div class="footer">列印時間: ${new Date().toLocaleString()}</div><script>window.onload = function() { setTimeout(function() { window.print(); }, 500); };</script></body></html>`; printWindow.document.write(htmlContent); printWindow.document.close(); };

  if (!isAuthenticated) return <LoginScreen onLogin={handleLogin} />;
  if (isInitialLoading) return <div className="min-h-screen flex flex-col items-center justify-center bg-morandi-oatmeal p-10 text-center"><Loader2 className="w-12 h-12 text-morandi-blue animate-spin mb-6" /><h2 className="text-xl font-bold text-morandi-charcoal tracking-wide">正在同步雲端資料...</h2></div>;

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto bg-morandi-oatmeal relative shadow-2xl overflow-hidden text-morandi-charcoal font-sans">
      <header className="px-4 py-3 bg-white border-b border-gray-100 flex justify-between items-center sticky top-0 z-40">
        <div><h1 className="text-xl font-extrabold text-morandi-charcoal tracking-tight">麵廠職人</h1><p className="text-[10px] text-morandi-pebble font-bold uppercase tracking-widest mt-0.5">專業訂單管理系統</p></div>
        <div className="flex gap-2 items-center">
           {/* Step 6: Visual Indicator for Background Sync */}
           <AnimatePresence>
             {isBackgroundSyncing && !isInitialLoading && (
               <motion.div 
                 initial={{ opacity: 0, scale: 0.5 }} 
                 animate={{ opacity: 1, scale: 1 }} 
                 exit={{ opacity: 0, scale: 0.5 }}
                 className="w-10 h-10 flex items-center justify-center"
               >
                 <RefreshCw className="w-4 h-4 text-morandi-blue animate-spin" />
               </motion.div>
             )}
           </AnimatePresence>
           
           <motion.button whileTap={buttonTap} onClick={handleLogout} className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center border border-slate-100 text-morandi-pebble hover:text-rose-400 hover:bg-rose-50 transition-colors"><LogOut className="w-5 h-5" /></motion.button>
          <motion.button whileTap={buttonTap} onClick={() => setIsSettingsOpen(true)} className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center border border-slate-100 text-morandi-pebble hover:text-slate-600 transition-colors active:scale-95"><Settings className="w-5 h-5" /></motion.button>
        </div>
      </header>

      {/* --- Toast Container --- */}
      <ToastNotification toasts={toasts} removeToast={removeToast} />

      {/* --- Product Picker Modal --- */}
      <ProductPicker 
        isOpen={pickerConfig.isOpen} 
        onClose={() => setPickerConfig(prev => ({ ...prev, isOpen: false }))} 
        onSelect={pickerConfig.onSelect} 
        products={products}
        currentSelectedId={pickerConfig.currentProductId}
        customPrices={pickerConfig.customPrices} // Added support for custom price list injection
      />

      {/* --- NEW: Customer Picker Modal --- */}
      <CustomerPicker 
        isOpen={customerPickerConfig.isOpen} 
        onClose={() => setCustomerPickerConfig(prev => ({ ...prev, isOpen: false }))} 
        onSelect={customerPickerConfig.onSelect} 
        customers={customers}
        orders={orders} // Pass orders here
        selectedDate={selectedDate} // Pass selected date for filtering open stores
        currentSelectedId={customerPickerConfig.currentSelectedId}
      />

      {/* --- NEW: Conflict Resolution Modal --- */}
      <ConflictModal 
        isOpen={!!conflictData}
        description={conflictData?.description}
        onClose={() => setConflictData(null)} 
        onRefresh={() => {
          setConflictData(null);
          syncData(true); // Re-fetch latest data
          setIsAddingOrder(false); // Force close any open editors to prevent stale data usage
          setIsEditingCustomer(null);
          setIsEditingProduct(null);
          setEditingOrderId(null);
        }}
        onForceSave={handleForceRetry}
        isSaving={isSaving}
      />

      {/* --- NEW: Voice Input Modal --- */}
      <VoiceInputModal 
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onTranscriptComplete={handleProcessVoiceOrder}
      />

      {/* --- Global Loading Overlay for Voice Processing --- */}
      <AnimatePresence>
        {isProcessingVoice && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/60 z-[210] flex flex-col items-center justify-center backdrop-blur-sm">
             <motion.div 
               animate={{ rotate: 360 }}
               transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
               className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full mb-4"
             />
             <p className="text-white font-bold text-lg tracking-widest animate-pulse">{voiceLoadingText}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 overflow-y-auto pb-24 px-4" ref={mainRef}>
        {/* ... (Orders Tab - same as before) ... */}
        <AnimatePresence mode="popLayout">
        {activeTab === 'orders' && (
          <motion.div 
            key="orders"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0, zIndex: 10 }} // Step 3: Ensure Z-index high
            exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }} // Step 1: Pointer events none + Low Z-index
            transition={{ duration: 0.2 }}
            className="space-y-6 relative"
          >
            {/* ... (Orders Tab Content) */}
            <div className="sticky top-0 z-30 bg-morandi-oatmeal py-2 flex items-center justify-between px-1 mb-2">
              <motion.button whileTap={buttonTap} onClick={() => setIsDatePickerOpen(true)} className="flex-1 mr-2 flex items-center gap-3 bg-white p-3 rounded-[20px] shadow-sm border border-slate-200 active:scale-95 transition-all">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-morandi-blue/10"><CalendarDays className="w-5 h-5 text-morandi-blue" /></div>
                <div><p className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest">出貨日期</p><p className="font-bold text-morandi-charcoal text-lg tracking-tight">{selectedDate}</p></div>
              </motion.button>
              
              <div className="flex gap-2 shrink-0">
                <motion.button whileTap={buttonTap} onClick={() => setActiveTab('work')} className="w-14 h-14 rounded-[20px] bg-white text-morandi-pebble border border-slate-200 shadow-sm flex items-center justify-center hover:bg-slate-50 transition-all">
                   <FileText className="w-6 h-6" />
                </motion.button>
                <motion.button whileTap={buttonTap} whileHover={buttonHover} onClick={() => { setEditingOrderId(null); setIsAddingOrder(true); }} className="w-14 h-14 rounded-[20px] text-white shadow-lg shadow-morandi-blue/20 hover:bg-slate-600 active:scale-95 transition-all flex items-center justify-center bg-morandi-blue"><Plus className="w-8 h-8" /></motion.button>
              </div>
            </div>
            {/* ... (Orders List - same logic as before but using toast handlers) */}
             <div className="space-y-3">
              <h2 className="text-sm font-bold text-morandi-pebble px-2 flex items-center gap-2 uppercase tracking-widest mb-2"><Layers className="w-4 h-4" /> 配送列表 [{selectedDate}] ({Object.keys(groupedOrders).length} 家)</h2>
              <motion.div variants={containerVariants} initial="hidden" animate="show">
              {Object.keys(groupedOrders).length > 0 ? (
                Object.entries(groupedOrders).map(([custName, custOrders]) => {
                  const isExpanded = expandedCustomer === custName;
                  const currentCustomer = customers.find(c => c.name === custName);
                  let totalAmount = 0;
                  const itemSummaries: string[] = [];
                  custOrders.forEach(o => { o.items.forEach(item => { const p = products.find(prod => prod.id === item.productId); const pName = p?.name || item.productId; const unit = item.unit || p?.unit || '斤'; itemSummaries.push(`${pName} ${item.quantity}${unit}`); if (unit === '元') { totalAmount += item.quantity; } else { const priceInfo = currentCustomer?.priceList?.find(pl => pl.productId === item.productId); const price = priceInfo ? priceInfo.price : 0; totalAmount += Math.round(item.quantity * price); } }); });
                  const summaryText = itemSummaries.join('、');

                  return (
                    <motion.div variants={itemVariants} key={custName} className="bg-white rounded-[24px] shadow-sm border border-slate-200 overflow-hidden mb-3 hover:shadow-md transition-shadow duration-300">
                      <button onClick={() => setExpandedCustomer(isExpanded ? null : custName)} className="w-full flex items-center justify-between p-5 text-left active:bg-morandi-oatmeal/30 transition-colors">
                        <div className="flex items-center gap-4 overflow-hidden">
                          <div className={`w-12 h-12 rounded-[16px] flex-shrink-0 flex items-center justify-center text-xl font-extrabold transition-colors ${isExpanded ? 'bg-morandi-blue text-white' : 'bg-morandi-oatmeal text-morandi-pebble'}`}>{custName.charAt(0)}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1"><h3 className={`font-bold text-lg truncate tracking-tight ${isExpanded ? 'text-morandi-charcoal' : 'text-slate-700'}`}>{custName}</h3>{totalAmount > 0 && (<span className="bg-morandi-amber-bg text-morandi-amber-text text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 tracking-wide">${totalAmount.toLocaleString()}</span>)}</div>
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
                                key={order.id} 
                                order={order} 
                                products={products} 
                                customers={customers}
                                isSelectionMode={isSelectionMode}
                                isSelected={selectedOrderIds.has(order.id)}
                                onToggleSelection={() => { const newSet = new Set(selectedOrderIds); if (newSet.has(order.id)) newSet.delete(order.id); else newSet.add(order.id); setSelectedOrderIds(newSet); }}
                                onStatusChange={handleSwipeStatusChange} // Use Undo handler
                                onDelete={() => handleDeleteOrder(order.id)}
                                onShare={handleShareOrder}
                                onMap={openGoogleMaps}
                                onEdit={handleEditOrder}
                             />
                          ))}
                          <motion.button whileTap={buttonTap} onClick={() => setQuickAddData({ customerName: custName, items: [{productId: '', quantity: 10, unit: '斤'}] })} className="w-full mt-2 py-3 rounded-[16px] border-2 border-dashed border-morandi-blue/30 text-morandi-blue font-bold text-sm flex items-center justify-center gap-2 hover:bg-morandi-blue/5 transition-colors tracking-wide"><Plus className="w-4 h-4" /> 追加訂單</motion.button>
                          <div className="flex gap-2 pt-2">
                             <motion.button whileTap={buttonTap} onClick={() => handleCopyOrder(custName, custOrders)} className="flex-1 py-3 px-4 rounded-[16px] bg-white text-morandi-pebble border border-slate-200 font-bold text-sm flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors shadow-sm tracking-wide"><Copy className="w-4 h-4" /> 複製</motion.button>
                             <motion.button whileTap={buttonTap} onClick={() => openGoogleMaps(custName)} className="flex-1 py-3 px-4 rounded-[16px] bg-morandi-blue text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-600 transition-colors shadow-lg shadow-morandi-blue/20 tracking-wide"><MapPin className="w-4 h-4" /> 導航</motion.button>
                          </div>
                          </div>
                        </motion.div>
                      )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })
              ) : (
                <div className="py-20 flex flex-col items-center text-center gap-4"><ClipboardList className="w-16 h-16 text-gray-200" /><p className="text-gray-300 italic text-sm tracking-wide">此日期尚無訂單</p></div>
              )}
              </motion.div>
            </div>
          </motion.div>
        )}
        
        {/* ... (Other Tabs remain unchanged) ... */}
        {activeTab === 'customers' && (
           <motion.div key="customers" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0, zIndex: 10 }} exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }} transition={{ duration: 0.2 }} className="space-y-6 relative">
            <div className="flex justify-between items-center px-1"><h2 className="text-xl font-extrabold text-morandi-charcoal flex items-center gap-2 tracking-tight"><Users className="w-5 h-5 text-morandi-blue" /> 店家管理</h2><motion.button whileTap={buttonTap} whileHover={buttonHover} onClick={() => { setCustomerForm({ name: '', phone: '', deliveryTime: '08:00', defaultItems: [], offDays: [], holidayDates: [], priceList: [], deliveryMethod: '', paymentTerm: 'regular' }); setIsEditingCustomer('new'); setTempPriceProdId(''); setTempPriceValue(''); setTempPriceUnit('斤'); }} className="p-3 rounded-2xl text-white shadow-lg bg-morandi-blue hover:bg-slate-600 transition-colors"><Plus className="w-6 h-6" /></motion.button></div>
            <div className="relative mb-2"><Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" /><input type="text" placeholder="搜尋店家名稱..." className="w-full pl-14 pr-6 py-4 bg-white rounded-[24px] border border-slate-100 shadow-sm text-morandi-charcoal font-bold tracking-wide focus:ring-2 focus:ring-morandi-blue transition-all placeholder:text-gray-300" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} /></div>
            <motion.div variants={containerVariants} initial="hidden" animate="show">
            {filteredCustomers.map(c => {
               const hasOrderToday = groupedOrders[c.name] && groupedOrders[c.name].length > 0;
               return (
                  <motion.div variants={itemVariants} key={c.id} className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-200 mb-4 hover:shadow-md transition-all relative overflow-hidden">
                    {hasOrderToday && <div className="absolute top-0 right-0 bg-amber-100 text-amber-700 text-[9px] font-bold px-3 py-1 rounded-bl-xl z-10">今日已下單</div>}
                    <div className="flex justify-between items-start mb-4"><div className="flex items-center gap-3"><div className="w-14 h-14 rounded-[22px] bg-morandi-oatmeal flex items-center justify-center text-xl font-extrabold text-morandi-blue">{c.name.charAt(0)}</div><div><h3 className="font-bold text-slate-800 text-lg tracking-tight">{c.name}</h3><p className="text-xs text-slate-500 font-medium tracking-wide">{c.phone || '無電話'}</p></div></div><div className="flex flex-col items-end gap-1 mt-2"><div className="flex gap-1">{WEEKDAYS.map(d => (<div key={d.value} className={`w-4 h-4 rounded-full text-[8px] flex items-center justify-center font-bold ${c.offDays?.includes(d.value) ? 'bg-rose-100 text-rose-400' : 'bg-gray-50 text-gray-300'}`}>{d.label}</div>))}</div>{c.holidayDates && c.holidayDates.length > 0 && <span className="text-[8px] font-bold text-rose-300">+{c.holidayDates.length} 特定休</span>}{c.priceList && c.priceList.length > 0 && <span className="text-[8px] font-bold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded mt-1">已設 {c.priceList.length} 種單價</span>}</div></div>
                    <div className="space-y-3 mb-4 bg-gray-50/60 p-4 rounded-[24px] border border-gray-100"><div className="flex justify-between"><div className="text-[11px] font-bold text-slate-700 tracking-wide">配送時間:{formatTimeDisplay(c.deliveryTime)}</div><div className="flex gap-1">{c.deliveryMethod && <div className="text-[11px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-lg border border-gray-100">{c.deliveryMethod}</div>}{c.paymentTerm && (<div className="text-[11px] font-bold text-morandi-blue bg-white px-2 py-0.5 rounded-lg border border-gray-100">{ORDERING_HABITS.find(t => t.value === c.paymentTerm)?.label}</div>)}</div></div>{c.defaultItems && c.defaultItems.length > 0 ? (<div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-200/50">{c.defaultItems.map((di, idx) => { const p = products.find(prod => prod.id === di.productId); return (<div key={idx} className="bg-white px-2 py-1 rounded-xl text-[10px] border border-gray-200 flex items-center gap-1 shadow-sm"><span className="font-bold text-slate-700">{p?.name || '未知品項'}</span><span className="font-extrabold text-morandi-blue">{di.quantity}{di.unit || p?.unit || '斤'}</span></div>); })}</div>) : (<div className="text-[10px] text-gray-400 font-medium italic pt-2 border-t border-gray-200/50 tracking-wide">尚未設定預設品項</div>)}</div>
                    <div className="flex gap-2">
                       <motion.button whileTap={buttonTap} onClick={() => handleCreateOrderFromCustomer(c)} className="flex-[2] py-3 bg-morandi-blue rounded-2xl text-white font-bold text-xs flex items-center justify-center gap-2 hover:bg-slate-600 transition-colors shadow-md shadow-morandi-blue/20"><ClipboardList className="w-3.5 h-3.5" /> 建立訂單</motion.button>
                       <motion.button whileTap={buttonTap} onClick={() => { setCustomerForm({ ...c, deliveryTime: formatTimeForInput(c.deliveryTime), paymentTerm: c.paymentTerm || 'regular' }); setIsEditingCustomer(c.id); setTempPriceProdId(''); setTempPriceValue(''); setTempPriceUnit('斤'); }} className="flex-1 py-3 bg-gray-50 rounded-2xl text-slate-700 font-bold text-xs flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors border border-gray-100"><Edit2 className="w-3.5 h-3.5" /> 編輯</motion.button>
                       <motion.button whileTap={buttonTap} onClick={() => handleDeleteCustomer(c.id)} className="px-4 py-3 bg-gray-50 rounded-2xl text-morandi-pink hover:text-rose-500 transition-colors border border-gray-100"><Trash2 className="w-4 h-4" /></motion.button>
                    </div>
                  </motion.div>
               );
            })}
            </motion.div>
            {filteredCustomers.length === 0 && <div className="text-center py-10 text-gray-300 text-sm font-bold tracking-wide">查無店家</div>}
           </motion.div>
        )}
        {activeTab === 'products' && (
          <motion.div key="products" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0, zIndex: 10 }} exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }} transition={{ duration: 0.2 }} className="space-y-6 relative">
             <div className="flex justify-between items-center px-1"><h2 className="text-xl font-extrabold text-morandi-charcoal flex items-center gap-2 tracking-tight"><Package className="w-5 h-5 text-morandi-blue" /> 品項清單</h2><div className="flex gap-2">{hasReorderedProducts && (<motion.button initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} whileTap={buttonTap} onClick={handleSaveProductOrder} disabled={isSaving} className="p-3 rounded-2xl text-white shadow-lg bg-emerald-500 hover:bg-emerald-600 transition-colors flex items-center gap-2">{isSaving ? <Loader2 className="w-6 h-6 animate-spin"/> : <Save className="w-6 h-6" />}<span className="text-xs font-bold hidden sm:inline">儲存排序</span></motion.button>)}<motion.button whileTap={buttonTap} whileHover={buttonHover} onClick={() => { setProductForm({ name: '', unit: '斤', price: 0, category: 'other' }); setIsEditingProduct('new'); }} className="p-3 rounded-2xl text-white shadow-lg bg-morandi-blue hover:bg-slate-600 transition-colors"><Plus className="w-6 h-6" /></motion.button></div></div>
             <Reorder.Group axis="y" values={products} onReorder={(newOrder) => { setProducts(newOrder); setHasReorderedProducts(true); }} className="space-y-0">
               {products.map(p => (<SortableProductItem key={p.id} product={p} onEdit={(p) => { setProductForm(p); setIsEditingProduct(p.id); }} onDelete={(id) => handleDeleteProduct(id)} />))}
             </Reorder.Group>
          </motion.div>
        )}
        {/* ... (Other Tabs code remains same) ... */}
        {activeTab === 'schedule' && (
           <motion.div key="schedule" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0, zIndex: 10 }} exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }} transition={{ duration: 0.2 }} className="space-y-6 relative">
              <div className="px-1"><h2 className="text-xl font-extrabold text-morandi-charcoal flex items-center gap-2 mb-4 tracking-tight"><CalendarCheck className="w-5 h-5 text-morandi-blue" /> 配送行程</h2><div className="mb-6"><WorkCalendar selectedDate={scheduleDate} onSelect={setScheduleDate} orders={orders} /></div>
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay: 0.2 }} className="bg-slate-700 rounded-[28px] p-5 shadow-lg text-white mb-6 relative overflow-hidden"><div className="absolute right-[-10px] bottom-[-20px] text-slate-600 opacity-20 rotate-12"><Banknote className="w-32 h-32" /></div><div className="flex justify-between items-start mb-2 relative z-10"><div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">本日應收總額</p><h3 className="text-3xl font-black mt-1 text-white tracking-tight">${scheduleMoneySummary.totalReceivable.toLocaleString()}</h3></div><div className="text-right"><p className="text-[10px] font-bold text-morandi-green-text uppercase tracking-widest">已收款</p><h3 className="text-xl font-bold text-emerald-300 mt-1 tracking-tight">${scheduleMoneySummary.totalCollected.toLocaleString()}</h3></div></div><div className="w-full bg-slate-600 rounded-full h-1.5 mt-2 relative z-10"><motion.div className="bg-emerald-400 h-1.5 rounded-full" initial={{ width: 0 }} animate={{ width: `${scheduleMoneySummary.totalReceivable > 0 ? (scheduleMoneySummary.totalCollected / scheduleMoneySummary.totalReceivable) * 100 : 0}%` }} transition={{ duration: 1, ease: "easeOut" }} /></div><p className="text-[9px] text-slate-400 mt-2 text-right relative z-10 tracking-wide">尚有 ${(scheduleMoneySummary.totalReceivable - scheduleMoneySummary.totalCollected).toLocaleString()} 未收</p></motion.div>
              <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar mb-4 items-center"><button onClick={() => setIsSelectionMode(!isSelectionMode)} className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-1 ${isSelectionMode ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-morandi-blue border-morandi-blue'}`}>{isSelectionMode ? <X className="w-3.5 h-3.5" /> : <CheckSquare className="w-3.5 h-3.5" />}{isSelectionMode ? '取消選取' : '批量操作'}</button><div className="w-[1px] h-6 bg-gray-300 mx-1"></div><button onClick={() => setScheduleDeliveryMethodFilter([])} className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${scheduleDeliveryMethodFilter.length === 0 ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-400 border-gray-200'}`}>全部方式</button>{DELIVERY_METHODS.map(m => { const isSelected = scheduleDeliveryMethodFilter.includes(m); return (<button key={m} onClick={() => { if (isSelected) { setScheduleDeliveryMethodFilter(scheduleDeliveryMethodFilter.filter(x => x !== m)); } else { setScheduleDeliveryMethodFilter([...scheduleDeliveryMethodFilter, m]); } }} className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${isSelected ? 'text-white border-transparent' : 'bg-white text-gray-400 border-gray-200'}`} style={{ backgroundColor: isSelected ? COLORS.primary : '' }}>{m}</button>); })}</div>
              <div className="space-y-4 pb-20"><div className="flex justify-between items-center px-2"><h3 className="text-xs font-bold text-morandi-pebble uppercase tracking-widest flex items-center gap-2"><Clock className="w-4 h-4" /> 配送明細 [{scheduleDate}]</h3><div className="text-xs font-bold text-gray-300 tracking-wide">共 {scheduleOrders.length} 筆訂單</div></div>
              <motion.div variants={containerVariants} initial="hidden" animate="show">{scheduleOrders.length > 0 ? (scheduleOrders.map((order) => { 
                 return (
                    <motion.div variants={itemVariants} key={order.id}>
                       <ScheduleOrderCard 
                          order={order}
                          products={products}
                          customers={customers}
                          isSelectionMode={isSelectionMode}
                          isSelected={selectedOrderIds.has(order.id)}
                          onToggleSelection={() => { const newSet = new Set(selectedOrderIds); if (newSet.has(order.id)) newSet.delete(order.id); else newSet.add(order.id); setSelectedOrderIds(newSet); }}
                          onStatusChange={handleSwipeStatusChange}
                          onShare={handleShareOrder}
                          onMap={openGoogleMaps}
                       />
                    </motion.div>
                 ); 
              })) : (<div className="text-center py-10"><p className="text-gray-300 font-bold text-sm tracking-wide">本日無配送行程</p></div>)}</motion.div></div></div>
           </motion.div>
        )}
        {/* ... (Finance and Work Tabs remain unchanged - they are inside ActiveTab blocks already provided in context, just ensuring closing structure) ... */}
        {activeTab === 'finance' && (
           <motion.div key="finance" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0, zIndex: 10 }} exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }} transition={{ duration: 0.2 }} className="space-y-6 relative">
             <div className="px-1"><h2 className="text-xl font-extrabold text-morandi-charcoal flex items-center gap-2 mb-4 tracking-tight"><Wallet className="w-5 h-5 text-morandi-blue" /> 帳務總覽</h2><div className="bg-morandi-charcoal rounded-[28px] p-6 shadow-lg text-white mb-6 relative overflow-hidden"><div className="absolute right-[-20px] top-[-20px] opacity-10"><DollarSign className="w-40 h-40" /></div><p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">未結總金額</p><h3 className="text-4xl font-black text-white tracking-tight">${financeData.grandTotalDebt.toLocaleString()}</h3><p className="text-[10px] text-gray-500 mt-2 font-medium tracking-wide">包含所有已出貨但未收款的訂單</p></div><div className="space-y-4"><h3 className="text-xs font-bold text-morandi-pebble uppercase tracking-widest px-2 flex items-center gap-2"><ListChecks className="w-4 h-4" /> 欠款客戶列表 ({financeData.outstanding.length})</h3><motion.div variants={containerVariants} initial="hidden" animate="show">{financeData.outstanding.length > 0 ? (financeData.outstanding.map((item, idx) => (<motion.div variants={itemVariants} key={idx} className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-200 mb-3 relative overflow-hidden"><div className="flex justify-between items-start mb-4 relative z-10"><div className="flex items-center gap-3"><div className="w-12 h-12 rounded-[16px] bg-rose-50 flex items-center justify-center text-rose-400 font-extrabold text-xl">{item.name.charAt(0)}</div><div><h4 className="font-bold text-slate-800 text-lg">{item.name}</h4><p className="text-xs text-rose-400 font-bold bg-rose-50 inline-block px-1.5 rounded mt-0.5">{item.count} 筆未結</p></div></div><div className="text-right"><p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">應收金額</p><p className="text-2xl font-black text-morandi-charcoal tracking-tight">${item.totalDebt.toLocaleString()}</p></div></div><div className="flex gap-2 relative z-10 pt-2 border-t border-gray-100"><button onClick={() => handleCopyStatement(item.name, item.totalDebt)} className="flex-1 py-3 rounded-xl bg-gray-50 text-slate-500 font-bold text-xs flex items-center justify-center gap-1 hover:bg-gray-100 transition-colors"><Copy className="w-3.5 h-3.5" /> 複製對帳單</button><button onClick={() => { setSettlementDate(getLastMonthEndDate()); setSettlementTarget({name: item.name, allOrderIds: item.orderIds}); }} className="flex-1 py-3 rounded-xl bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1 hover:bg-emerald-600 shadow-md shadow-emerald-200 transition-all active:scale-95"><CheckCircle2 className="w-3.5 h-3.5" /> 結帳</button></div></motion.div>))) : (<div className="text-center py-10"><div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle2 className="w-8 h-8 text-emerald-400" /></div><p className="text-gray-400 font-bold text-sm">目前沒有未結款項</p><p className="text-xs text-gray-300 mt-1">所有配送單皆已完成收款</p></div>)}</motion.div></div></div>
           </motion.div>
        )}
        
        {activeTab === 'work' && (
           <motion.div key="work" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0, zIndex: 10 }} exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }} transition={{ duration: 0.2 }} className="space-y-6 relative">
             <div className="px-1"><div className="flex items-center gap-2 mb-4"><button onClick={() => setActiveTab('orders')} className="p-2 bg-white rounded-xl shadow-sm border border-slate-200 text-morandi-pebble"><ChevronLeft className="w-5 h-5"/></button><h2 className="text-xl font-extrabold text-morandi-charcoal tracking-tight">工作小抄</h2></div>
              <div className="space-y-3 mb-4"><div className="relative"><Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" /><input type="text" placeholder="篩選特定店家..." className="w-full pl-12 pr-6 py-4 bg-white rounded-[24px] border border-slate-100 shadow-sm text-slate-800 font-bold tracking-wide focus:ring-2 focus:ring-morandi-blue transition-all placeholder:text-gray-300 text-sm" value={workCustomerFilter} onChange={(e) => setWorkCustomerFilter(e.target.value)} />{workCustomerFilter && <button onClick={() => setWorkCustomerFilter('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X className="w-4 h-4" /></button>}</div>
              <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar mb-2"><button onClick={() => setWorkDeliveryMethodFilter([])} className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${workDeliveryMethodFilter.length === 0 ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-400 border-gray-200'}`}>全部方式</button>{DELIVERY_METHODS.map(m => { const isSelected = workDeliveryMethodFilter.includes(m); return (<button key={m} onClick={() => { if (isSelected) { setWorkDeliveryMethodFilter(workDeliveryMethodFilter.filter(x => x !== m)); } else { setWorkDeliveryMethodFilter([...workDeliveryMethodFilter, m]); } }} className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${isSelected ? 'text-white border-transparent' : 'bg-white text-gray-400 border-gray-200'}`} style={{ backgroundColor: isSelected ? COLORS.primary : '' }}>{m}</button>); })}</div>
              <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                <button onClick={() => setWorkCategoryFilter('all')} className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${workCategoryFilter === 'all' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-400 border-gray-200'}`}>全部種類</button>
                {PRODUCT_CATEGORIES.map(cat => {
                    const isSelected = workCategoryFilter === cat.id;
                    return (
                        <button
                            key={cat.id}
                            onClick={() => setWorkCategoryFilter(isSelected ? 'all' : cat.id)}
                            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-1.5 ${isSelected ? 'border-transparent shadow-sm' : 'bg-white text-gray-400 border-gray-200'}`}
                            style={{ backgroundColor: isSelected ? cat.color : '', color: isSelected ? '#3E3C3A' : '' }}
                        >
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color, border: '1px solid rgba(0,0,0,0.1)' }}></span>
                            {cat.label}
                        </button>
                    );
                })}
              </div>
              </div>
              <div className="mb-6"><WorkCalendar selectedDate={workDates} onSelect={setWorkDates} orders={orders} /></div>
              
              <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                      <h3 className="text-xs font-bold text-morandi-pebble uppercase tracking-widest flex items-center gap-2"><ListChecks className="w-4 h-4" /> 生產總表 [{workDates.length}天]</h3>
                      <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-gray-300 tracking-wide">{workSheetData.reduce((sum, g) => sum + g.items.length, 0)} 種品項</span>
                          <motion.button whileTap={buttonTap} onClick={handlePrint} className="bg-slate-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-slate-800 transition-colors shadow-sm active:scale-95"><Printer className="w-3.5 h-3.5" /> 列印 / 匯出 PDF</motion.button>
                      </div>
                  </div>
                  
                  <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
                      {workSheetData.length > 0 ? (
                          workSheetData.map((group) => {
                              const isCollapsed = collapsedWorkGroups.has(group.id);
                              
                              return (
                                  <motion.section variants={itemVariants} key={group.id} className="bg-white rounded-[24px] overflow-hidden border border-slate-200 shadow-sm">
                                      {/* Group Header */}
                                      <div 
                                          onClick={() => {
                                              const newSet = new Set(collapsedWorkGroups);
                                              if (newSet.has(group.id)) newSet.delete(group.id);
                                              else newSet.add(group.id);
                                              setCollapsedWorkGroups(newSet);
                                          }}
                                          className="px-5 py-4 flex justify-between items-center cursor-pointer transition-colors hover:bg-opacity-80 active:scale-[0.99]"
                                          style={{ backgroundColor: group.color + '40' }} // 25% opacity using hex code
                                      >
                                          <h3 className="font-extrabold text-slate-800 flex items-center gap-3 text-lg">
                                              <span className="w-3 h-3 rounded-full shadow-sm" style={{ background: group.color, border: '1px solid rgba(0,0,0,0.1)' }}></span>
                                              {group.label}
                                          </h3>
                                          <div className="flex items-center gap-3">
                                              <span className="text-xs font-black text-slate-600 bg-white/60 px-2 py-1 rounded-lg">共 {Math.round(group.totalWeight * 10) / 10} 單位</span>
                                              {isCollapsed ? <ChevronDown className="w-5 h-5 text-slate-500" /> : <ChevronUp className="w-5 h-5 text-slate-500" />}
                                          </div>
                                      </div>

                                      {/* Items List */}
                                      <AnimatePresence>
                                          {!isCollapsed && (
                                              <motion.div 
                                                  initial={{ height: 0, opacity: 0 }} 
                                                  animate={{ height: 'auto', opacity: 1 }} 
                                                  exit={{ height: 0, opacity: 0 }} 
                                                  className="divide-y divide-gray-100"
                                              >
                                                  {group.items.map((item, idx) => {
                                                      const itemKey = `${group.id}-${item.name}-${item.unit}`;
                                                      const isCompleted = completedWorkItems.has(itemKey);

                                                      return (
                                                          <div 
                                                              key={idx} 
                                                              onClick={() => {
                                                                  const newSet = new Set(completedWorkItems);
                                                                  if (newSet.has(itemKey)) newSet.delete(itemKey);
                                                                  else newSet.add(itemKey);
                                                                  setCompletedWorkItems(newSet);
                                                                  triggerHaptic(5);
                                                              }}
                                                              className={`p-5 transition-all cursor-pointer select-none ${isCompleted ? 'bg-gray-50' : 'hover:bg-gray-50/50'}`}
                                                          >
                                                              <div className="flex justify-between items-center mb-2">
                                                                  <div className="flex items-center gap-3">
                                                                      <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isCompleted ? 'bg-slate-400 border-slate-400' : 'bg-white border-slate-300'}`}>
                                                                          {isCompleted && <CheckSquare className="w-3.5 h-3.5 text-white" />}
                                                                      </div>
                                                                      <span className={`font-bold text-lg transition-all ${isCompleted ? 'text-gray-400 line-through decoration-2 decoration-gray-300' : 'text-slate-800'}`}>{item.name}</span>
                                                                  </div>
                                                                  <div className={`text-right transition-all ${isCompleted ? 'opacity-40' : 'opacity-100'}`}>
                                                                      <span className="font-black text-3xl text-slate-800 tracking-tight">{item.totalQty}</span>
                                                                      <span className="text-xs text-gray-400 font-bold ml-1">{item.unit}</span>
                                                                  </div>
                                                              </div>
                                                              
                                                              {/* Details */}
                                                              {!isCompleted && (
                                                                  <div className="pl-8 flex flex-wrap gap-2 mt-3">
                                                                      {item.details.map((detail, dIdx) => (
                                                                          <span key={dIdx} className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600 shadow-sm flex items-center gap-1">
                                                                              <span className="font-bold">{detail.customerName}</span>
                                                                              <span className="bg-slate-100 px-1.5 rounded text-[10px] font-black text-slate-500">{detail.qty}</span>
                                                                          </span>
                                                                      ))}
                                                                  </div>
                                                              )}
                                                          </div>
                                                      );
                                                  })}
                                              </motion.div>
                                          )}
                                      </AnimatePresence>
                                  </motion.section>
                              );
                          })
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
        )}
        </AnimatePresence>

      </main>
      
      {/* ... (Modals code remains same - ConfirmModal, HolidayCalendar, DatePickerModal, SettingsModal, QuickAdd, etc.) ... */}
      
      {/* (Modal closing tags are here in original code) */}
      <ConfirmModal isOpen={confirmConfig.isOpen} title={confirmConfig.title} message={confirmConfig.message} onConfirm={confirmConfig.onConfirm} onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))} />
      {holidayEditorId && (<HolidayCalendar storeName={isEditingCustomer ? (customerForm.name || '') : ''} holidays={customerForm.holidayDates || []} onToggle={(date) => { const current = customerForm.holidayDates || []; const newHolidays = current.includes(date) ? current.filter(d => d !== date) : [...current, date]; setCustomerForm({...customerForm, holidayDates: newHolidays}); }} onClose={() => setHolidayEditorId(null)} />)}
      <AnimatePresence>{isDatePickerOpen && <DatePickerModal selectedDate={selectedDate} onSelect={setSelectedDate} onClose={() => setIsDatePickerOpen(false)} />}</AnimatePresence>
      <AnimatePresence>{isSettingsOpen && (<SettingsModal onClose={() => setIsSettingsOpen(false)} onSync={syncData} onSavePassword={handleChangePassword} currentUrl={apiEndpoint} onSaveUrl={handleSaveApiUrl} />)}</AnimatePresence>
      <AnimatePresence>{quickAddData && (<div className="fixed inset-0 bg-morandi-charcoal/40 z-[70] flex flex-col items-center justify-center p-4 backdrop-blur-sm"><motion.div variants={modalVariants} initial="hidden" animate="visible" exit="exit" className="bg-white w-full max-w-sm max-h-[85vh] flex flex-col rounded-[32px] overflow-hidden shadow-xl border border-slate-200"><div className="p-5 bg-morandi-oatmeal/30 border-b border-gray-100 flex-shrink-0"><h3 className="text-center font-extrabold text-morandi-charcoal text-lg">追加訂單</h3><p className="text-center text-xs text-morandi-pebble font-bold tracking-wide mt-1">{quickAddData.customerName}</p></div><div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar"><AnimatePresence initial={false}>{quickAddData.items.map((item, index) => (<motion.div key={index} initial={{ opacity: 0, height: 0, scale: 0.95 }} animate={{ opacity: 1, height: 'auto', scale: 1 }} exit={{ opacity: 0, height: 0, scale: 0.9 }} className="bg-white rounded-[20px] p-3 shadow-sm border border-slate-100 flex flex-wrap gap-2 items-center"><div className="flex-1 min-w-[120px]"><div onClick={() => { const currentCustomer = customers.find(c => c.name === quickAddData.customerName); setPickerConfig({ isOpen: true, currentProductId: item.productId, customPrices: currentCustomer?.priceList, onSelect: (pid) => { const newItems = [...quickAddData.items]; const p = products.find(x => x.id === pid); newItems[index] = { ...item, productId: pid, unit: p?.unit || '斤' }; setQuickAddData({...quickAddData, items: newItems}); } }); }} className="w-full bg-morandi-oatmeal/50 p-3 rounded-xl font-bold text-sm text-morandi-charcoal border border-slate-200 flex items-center justify-between cursor-pointer hover:border-morandi-blue transition-all"><span className={item.productId ? 'text-slate-800' : 'text-gray-400'}>{products.find(p => p.id === item.productId)?.name || '選擇品項...'}</span><ChevronDown className="w-4 h-4 text-gray-400" /></div></div><div className="w-20"><input type="number" min="0" onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} placeholder="數量" className="w-full bg-morandi-oatmeal/50 p-3 rounded-xl text-center font-black text-lg text-morandi-charcoal border border-slate-200 outline-none focus:ring-2 focus:ring-morandi-blue transition-all" value={item.quantity === 0 ? '' : item.quantity} onChange={(e) => { const newItems = [...quickAddData.items]; const val = parseFloat(e.target.value); newItems[index].quantity = isNaN(val) ? 0 : Math.max(0, val); setQuickAddData({...quickAddData, items: newItems}); }} /></div><div className="w-20"><select value={item.unit || '斤'} onChange={(e) => { const newItems = [...quickAddData.items]; newItems[index].unit = e.target.value; setQuickAddData({...quickAddData, items: newItems}); }} className="w-full bg-morandi-oatmeal/50 p-3 rounded-xl font-bold text-morandi-charcoal border border-slate-100 outline-none focus:ring-2 focus:ring-morandi-blue transition-all">{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></div><button onClick={() => { const newItems = quickAddData.items.filter((_, i) => i !== index); setQuickAddData({...quickAddData, items: newItems}); }} className="p-3 bg-rose-50 text-rose-400 hover:text-rose-600 rounded-xl transition-colors"><Trash2 className="w-4 h-4" /></button></motion.div>))}</AnimatePresence><motion.button whileTap={buttonTap} onClick={() => setQuickAddData({...quickAddData, items: [...quickAddData.items, {productId: '', quantity: 10, unit: '斤'}]})} className="w-full py-3 rounded-[16px] border-2 border-dashed border-morandi-blue/30 text-morandi-blue font-bold text-sm flex items-center justify-center gap-2 hover:bg-morandi-blue/5 transition-colors tracking-wide mt-2"><Plus className="w-4 h-4" /> 增加品項</motion.button></div><div className="p-5 bg-white border-t border-gray-100 flex-shrink-0 space-y-4"><AnimatePresence>{(() => { const preview = getQuickAddPricePreview(); if (preview && preview.total > 0) { return (<motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-morandi-amber-bg p-4 rounded-xl border border-amber-100 flex justify-between items-center"><div className="flex flex-col"><span className="text-[10px] font-bold text-morandi-amber-text/70 uppercase tracking-widest">預估總金額</span><span className="text-xs font-medium text-morandi-amber-text/60 mt-0.5 tracking-wide">共 {preview.itemCount} 個品項</span></div><span className="text-2xl font-black text-morandi-amber-text tracking-tight">${preview.total.toLocaleString()}</span></motion.div>); } return null; })()}</AnimatePresence><div className="flex gap-2"><motion.button whileTap={buttonTap} onClick={() => setQuickAddData(null)} className="flex-1 py-3 rounded-[16px] font-bold text-morandi-pebble hover:bg-gray-50 transition-colors border border-slate-200">取消</motion.button><motion.button whileTap={buttonTap} onClick={handleQuickAddSubmit} className="flex-1 py-3 rounded-[16px] font-bold text-white shadow-md bg-morandi-blue hover:bg-slate-600">確認追加</motion.button></div></div></motion.div></div>)}</AnimatePresence>
      <AnimatePresence>
      {isAddingOrder && (
        <div className="fixed inset-0 bg-morandi-oatmeal z-[60] flex flex-col">
          <motion.div initial={{ opacity: 0, y: "100%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="flex flex-col h-full">
          <div className="bg-white p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 z-10"><motion.button whileTap={buttonTap} onClick={() => { setIsAddingOrder(false); setEditingOrderId(null); }} className="p-2 rounded-2xl bg-gray-50 text-morandi-pebble"><X className="w-6 h-6" /></motion.button><h2 className="text-lg font-extrabold text-morandi-charcoal tracking-tight">{editingOrderId ? `編輯訂單 - ${orderForm.customerName}` : '建立配送訂單'}</h2><motion.button whileTap={buttonTap} onClick={handleSaveOrder} disabled={isSaving} className="font-bold px-4 py-2 transition-colors text-morandi-blue disabled:text-gray-300">{isSaving ? '儲存中...' : (editingOrderId ? '更新訂單' : '儲存')}</motion.button></div>
          <div className="p-6 space-y-6 overflow-y-auto pb-10">
            <div className="flex bg-white p-1 rounded-[24px] shadow-sm border border-slate-100"><button onClick={() => setOrderForm({...orderForm, customerType: 'existing'})} className={`flex-1 py-4 rounded-[20px] text-xs font-bold transition-all tracking-wide ${orderForm.customerType === 'existing' ? 'bg-morandi-blue text-white shadow-md' : 'text-morandi-pebble'}`}>現有客戶</button><button onClick={() => setOrderForm({...orderForm, customerType: 'retail', customerId: ''})} className={`flex-1 py-4 rounded-[20px] text-xs font-bold transition-all tracking-wide ${orderForm.customerType === 'retail' ? 'bg-morandi-blue text-white shadow-md' : 'text-morandi-pebble'}`}>零售客戶</button></div>
            {orderForm.customerType === 'existing' ? (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">配送店家</label>
                <div className="relative">
                  {/* 使用 CustomerPicker 取代原本的下拉選單 */}
                  <motion.button 
                    whileTap={buttonTap} 
                    onClick={() => setCustomerPickerConfig({
                       isOpen: true,
                       currentSelectedId: orderForm.customerId,
                       onSelect: (id) => handleSelectExistingCustomer(id)
                    })} 
                    className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 flex justify-between items-center font-bold text-morandi-charcoal focus:ring-2 focus:ring-morandi-blue transition-all"
                  >
                    <span className="flex items-center gap-2">
                       {orderForm.customerName || "選擇店家..."}
                       {orderForm.customerName && groupedOrders[orderForm.customerName] && (<span className="bg-amber-400 text-white text-[9px] px-2 py-0.5 rounded-full tracking-wide">已建立</span>)}
                    </span>
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  </motion.button>
                </div>
              </div>
            ) : (<div className="space-y-2"><label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">客戶名稱</label><input type="text" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 text-morandi-charcoal font-bold outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="輸入零售名稱..." value={orderForm.customerName} onChange={(e) => setOrderForm({...orderForm, customerName: e.target.value})} /></div>)}
            
            {/* ... Order Form Fields (Time, Items, Note etc.) ... */}
             <div className="space-y-2"><label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">配送設定</label><div className="flex gap-2"><div className="flex-1"><input type="time" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 text-morandi-charcoal font-bold outline-none focus:ring-2 focus:ring-morandi-blue transition-all" value={orderForm.deliveryTime} onChange={(e) => setOrderForm({...orderForm, deliveryTime: e.target.value})} /></div><div className="flex-1"><select value={orderForm.deliveryMethod} onChange={(e) => setOrderForm({...orderForm, deliveryMethod: e.target.value})} className="w-full h-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 text-morandi-charcoal font-bold outline-none focus:ring-2 focus:ring-morandi-blue transition-all appearance-none"><option value="">配送方式...</option>{DELIVERY_METHODS.map(m => <option key={m} value={m}>{m}</option>)}</select></div></div></div>
             <div className="space-y-4"><div className="flex justify-between items-center"><label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">品項明細</label><button onClick={() => setOrderForm({...orderForm, items: [...orderForm.items, {productId: '', quantity: 10, unit: '斤'}]})} className="text-[10px] font-bold text-morandi-blue tracking-wide"><Plus className="w-3 h-3 inline mr-1" /> 增加品項</button></div>{orderForm.items.map((item, idx) => (<motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} key={idx} className="bg-white p-5 rounded-[28px] shadow-sm border border-slate-200 flex items-center gap-2 flex-wrap"><div onClick={() => { const currentCustomer = customers.find(c => c.id === orderForm.customerId); setPickerConfig({ isOpen: true, currentProductId: item.productId, customPrices: currentCustomer?.priceList, onSelect: (pid) => { const n = [...orderForm.items]; const p = products.find(x => x.id === pid); n[idx] = { ...item, productId: pid, unit: p?.unit || '斤' }; setOrderForm({...orderForm, items: n}); } }); }} className="w-full sm:flex-1 bg-morandi-oatmeal/50 p-4 rounded-xl text-sm font-bold border border-slate-100 flex items-center justify-between cursor-pointer hover:border-morandi-blue transition-all mb-2 sm:mb-0"><span className={item.productId ? 'text-morandi-charcoal' : 'text-gray-400'}>{products.find(p => p.id === item.productId)?.name || '選擇品項...'}</span><ChevronDown className="w-4 h-4 text-gray-400" /></div><div className="flex items-center gap-2 w-full sm:w-auto justify-between"><input type="number" min="0" onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} className="w-20 bg-morandi-oatmeal/50 p-4 rounded-xl text-center font-bold border border-slate-100 text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" value={item.quantity === 0 ? '' : item.quantity} onChange={(e) => { const n = [...orderForm.items]; const val = parseFloat(e.target.value); n[idx].quantity = isNaN(val) ? 0 : Math.max(0, val); setOrderForm({...orderForm, items: n}); }} /><select value={item.unit || '斤'} onChange={(e) => { const n = [...orderForm.items]; n[idx].unit = e.target.value; setOrderForm({...orderForm, items: n}); }} className="w-20 bg-morandi-oatmeal/50 p-4 rounded-xl font-bold text-morandi-charcoal border border-slate-100 outline-none focus:ring-2 focus:ring-morandi-blue transition-all">{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select><motion.button whileTap={buttonTap} onClick={() => { const n = orderForm.items.filter((_, i) => i !== idx); setOrderForm({...orderForm, items: n.length ? n : [{productId:'', quantity:10, unit:'斤'}]}); }} className="p-2 text-morandi-pink hover:text-rose-300 transition-colors"><Trash2 className="w-4 h-4" /></motion.button></div></motion.div>))}</div>
             <div className="space-y-2"><label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">訂單預覽</label><div className="bg-morandi-amber-bg rounded-[24px] p-5 shadow-sm border border-amber-100/50"><div className="flex justify-between items-center mb-3 border-b border-amber-100 pb-2"><div className="flex items-center gap-2 text-morandi-amber-text"><Calculator className="w-4 h-4" /><span className="text-xs font-bold tracking-wide">預估清單</span></div><div className="text-xs font-bold text-morandi-amber-text/60 tracking-wide">共 {orderSummary.details.filter(d => d.rawQty > 0).length} 項</div></div><div className="space-y-2 mb-4">{orderSummary.details.filter(d => d.rawQty > 0).map((detail, i) => (<div key={i} className="flex justify-between items-center text-sm"><div className="flex flex-col"><span className="font-bold text-slate-700 tracking-wide">{detail.name}</span>{detail.isCalculated && (<span className="text-[10px] text-gray-400">(以單價 ${detail.unitPrice} 換算: {detail.rawQty}元 &rarr; {detail.displayQty}{detail.displayUnit})</span>)}</div><div className="flex items-center gap-3"><span className="font-bold text-slate-600">{detail.displayQty} {detail.displayUnit}</span><span className="font-black text-amber-600 w-12 text-right tracking-tight">${detail.subtotal}</span></div></div>))}{orderSummary.details.filter(d => d.rawQty > 0).length === 0 && (<div className="text-center text-xs text-amber-400 italic py-2 tracking-wide">尚未加入有效品項</div>)}</div><div className="flex justify-between items-center pt-3 border-t border-amber-200"><span className="text-xs font-bold text-amber-700 tracking-wide">預估總金額</span><span className="text-xl font-black text-amber-600 tracking-tight">${orderSummary.totalPrice}</span></div></div></div>
             <div className="space-y-2"><label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">訂單備註</label><textarea className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 text-morandi-charcoal font-bold resize-none outline-none focus:ring-2 focus:ring-morandi-blue transition-all placeholder:text-gray-300" rows={3} placeholder="備註特殊需求..." value={orderForm.note} onChange={(e) => setOrderForm({...orderForm, note: e.target.value})} /></div>
          </div>
          </motion.div>
        </div>
      )}
      </AnimatePresence>

      <AnimatePresence>
       {isEditingCustomer && (
        <div className="fixed inset-0 bg-morandi-oatmeal z-[60] flex flex-col">
          <motion.div initial={{ opacity: 0, y: "100%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="flex flex-col h-full">
          <div className="bg-white p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 z-10"><motion.button whileTap={buttonTap} onClick={() => setIsEditingCustomer(null)} className="p-2 rounded-2xl bg-gray-50"><X className="w-6 h-6 text-morandi-pebble" /></motion.button><h2 className="text-lg font-extrabold text-morandi-charcoal tracking-tight">店家詳細資料</h2><motion.button whileTap={buttonTap} onClick={handleSaveCustomer} disabled={isSaving} className="font-bold px-4 py-2 transition-colors text-morandi-blue disabled:text-gray-300">{isSaving ? '儲存中...' : '儲存'}</motion.button></div>
          <div className="p-6 space-y-6 overflow-y-auto pb-10">
            {/* ... Customer Form Fields ... */}
             <div className="space-y-2"><label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">基本資訊</label><div className="space-y-4"><input type="text" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="店名" value={customerForm.name || ''} onChange={(e) => setCustomerForm({...customerForm, name: e.target.value})} /><input type="tel" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="電話" value={customerForm.phone || ''} onChange={(e) => setCustomerForm({...customerForm, phone: e.target.value})} /></div></div>
             <div className="space-y-2"><label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">配送與習慣</label><div className="space-y-4">
                  <div className="space-y-1"><label className="text-[10px] font-bold text-gray-400 pl-1">配送方式</label><select value={customerForm.deliveryMethod || ''} onChange={(e) => setCustomerForm({...customerForm, deliveryMethod: e.target.value})} className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#8e9775] transition-all appearance-none"><option value="">選擇配送方式...</option>{DELIVERY_METHODS.map(method => (<option key={method} value={method}>{method}</option>))}</select></div>
                  
                  {/* Updated: Payment Method -> Ordering Habit */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 pl-1">預定習慣</label>
                    <select 
                      value={customerForm.paymentTerm || 'regular'} 
                      onChange={(e) => setCustomerForm({...customerForm, paymentTerm: e.target.value as any})} 
                      className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#8e9775] transition-all appearance-none"
                    >
                      {ORDERING_HABITS.map(habit => (<option key={habit.value} value={habit.value}>{habit.label}</option>))}
                    </select>
                  </div>

                  <div className="space-y-1"><label className="text-[10px] font-bold text-gray-400 pl-1">配送時間</label><input type="time" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#8e9775] transition-all" value={customerForm.deliveryTime || '08:00'} onChange={(e) => setCustomerForm({...customerForm, deliveryTime: e.target.value})} /></div><div className="space-y-1"><label className="text-[10px] font-bold text-gray-400 pl-1">每週公休</label><div className="flex gap-2">{WEEKDAYS.map(d => { const isOff = (customerForm.offDays || []).includes(d.value); return (<button key={d.value} onClick={() => { const current = customerForm.offDays || []; const newOff = isOff ? current.filter(x => x !== d.value) : [...current, d.value]; setCustomerForm({...customerForm, offDays: newOff}); }} className={`w-10 h-10 rounded-xl font-bold text-xs transition-all ${isOff ? 'bg-rose-500 text-white shadow-md' : 'bg-white text-gray-400 border border-slate-200'}`}>{d.label}</button>); })}</div></div><div className="space-y-1"><label className="text-[10px] font-bold text-gray-400 pl-1">特定公休</label><div className="flex flex-wrap gap-2">{(customerForm.holidayDates || []).map(date => (<span key={date} className="bg-rose-50 text-rose-500 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border border-rose-100">{date} <button onClick={() => setCustomerForm({...customerForm, holidayDates: customerForm.holidayDates?.filter(d => d !== date)})}><X className="w-3 h-3" /></button></span>))}<button onClick={() => setHolidayEditorId('new')} className="bg-gray-50 text-gray-400 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-gray-100 border border-slate-200"><Plus className="w-3 h-3" /> 新增日期</button></div></div>
              </div></div>
             <div className="space-y-2">
                <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">預設品項</label>
                <div className="space-y-3">
                   {(customerForm.defaultItems || []).map((item, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                         {/* Default Items: Product Picker Button - Also injected with prices */}
                         <div 
                            onClick={() => setPickerConfig({ 
                               isOpen: true, 
                               currentProductId: item.productId, 
                               customPrices: customerForm.priceList, // Inject prices from form context
                               onSelect: (pid) => { 
                                  const newItems = [...(customerForm.defaultItems || [])]; 
                                  const p = products.find(x => x.id === pid);
                                  // Update ID and sync unit automatically
                                  newItems[idx] = { ...item, productId: pid, unit: p?.unit || '斤' }; 
                                  setCustomerForm({...customerForm, defaultItems: newItems}); 
                               } 
                            })} 
                            className="flex-1 bg-morandi-oatmeal/50 p-3 rounded-xl font-bold text-sm text-morandi-charcoal border border-slate-200 flex items-center justify-between cursor-pointer hover:border-morandi-blue transition-all"
                         >
                            <span className={item.productId ? 'text-morandi-charcoal' : 'text-gray-400'}>
                               {products.find(p => p.id === item.productId)?.name || '選擇品項...'}
                            </span>
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                         </div>
                         <input type="number" min="0" onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} className="w-16 p-3 bg-white rounded-xl text-center font-bold text-slate-700 outline-none border border-slate-200" value={item.quantity === 0 ? '' : item.quantity} onChange={(e) => { const newItems = [...(customerForm.defaultItems || [])]; const val = parseFloat(e.target.value); newItems[idx].quantity = isNaN(val) ? 0 : Math.max(0, val); setCustomerForm({...customerForm, defaultItems: newItems}); }} />
                         <select value={item.unit || '斤'} onChange={(e) => { const newItems = [...(customerForm.defaultItems || [])]; newItems[idx].unit = e.target.value; setCustomerForm({...customerForm, defaultItems: newItems}); }} className="w-20 p-3 bg-white rounded-xl font-bold text-slate-700 outline-none border border-slate-200">{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select>
                         <button onClick={() => setCustomerForm({...customerForm, defaultItems: customerForm.defaultItems?.filter((_, i) => i !== idx)})} className="p-3 bg-rose-50 text-rose-400 rounded-xl"><Trash2 className="w-4 h-4" /></button>
                      </div>
                   ))}
                   <button onClick={() => setCustomerForm({...customerForm, defaultItems: [...(customerForm.defaultItems || []), {productId: '', quantity: 10, unit: '斤'}]})} className="w-full py-3 rounded-xl border border-dashed border-gray-300 text-gray-400 font-bold text-xs flex items-center justify-center gap-1 hover:bg-gray-50 tracking-wide"><Plus className="w-4 h-4" /> 新增預設品項</button>
                </div>
             </div>
             <div className="space-y-2">
                <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">專屬價目表</label>
                <div className="bg-amber-50 p-4 rounded-[24px] space-y-3 border border-amber-100">
                   <div className="flex gap-2">
                      {/* Price List: Product Picker Button */}
                      <div 
                         onClick={() => setPickerConfig({ 
                            isOpen: true, 
                            currentProductId: tempPriceProdId, 
                            onSelect: (pid) => { 
                               setTempPriceProdId(pid); 
                               // Auto-set unit when picking product for price list
                               const p = products.find(x => x.id === pid);
                               if (p?.unit) setTempPriceUnit(p.unit);
                            } 
                         })} 
                         className="flex-1 bg-white p-3 rounded-xl font-bold text-sm text-slate-700 border border-slate-100 flex items-center justify-between cursor-pointer hover:border-amber-400 transition-all"
                      >
                         <span className={tempPriceProdId ? 'text-slate-700' : 'text-gray-400'}>
                            {products.find(p => p.id === tempPriceProdId)?.name || '選擇品項...'}
                         </span>
                         <ChevronDown className="w-4 h-4 text-gray-400" />
                      </div>
                      <input type="number" min="0" onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} placeholder="單價" className="w-20 p-3 bg-white rounded-xl text-center font-bold text-slate-700 outline-none border border-slate-100" value={tempPriceValue} onChange={(e) => { const val = e.target.value; if (val === '' || (!isNaN(Number(val)) && Number(val) >= 0)) { setTempPriceValue(val); } }} />
                      <select value={tempPriceUnit} onChange={(e) => setTempPriceUnit(e.target.value)} className="w-20 p-3 bg-white rounded-xl font-bold text-slate-700 outline-none border border-slate-100">{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select>
                      <button onClick={() => { if(tempPriceProdId && tempPriceValue) { const newPriceList = [...(customerForm.priceList || [])]; const existingIdx = newPriceList.findIndex(x => x.productId === tempPriceProdId); if(existingIdx >= 0) { newPriceList[existingIdx].price = Number(tempPriceValue); newPriceList[existingIdx].unit = tempPriceUnit; } else { newPriceList.push({productId: tempPriceProdId, price: Number(tempPriceValue), unit: tempPriceUnit}); } setCustomerForm({...customerForm, priceList: newPriceList}); setTempPriceProdId(''); setTempPriceValue(''); setTempPriceUnit('斤'); } }} className="p-3 bg-amber-400 text-white rounded-xl shadow-sm"><Plus className="w-4 h-4" /></button>
                   </div>
                   <div className="space-y-2">{(customerForm.priceList || []).map((pl, idx) => { const p = products.find(prod => prod.id === pl.productId); return (<div key={idx} className="flex justify-between items-center bg-white p-3 rounded-xl shadow-sm border border-slate-100"><span className="text-sm font-bold text-slate-700 tracking-wide">{p?.name || pl.productId}</span><div className="flex items-center gap-3"><span className="font-black text-amber-500 tracking-tight">${pl.price} <span className="text-xs text-gray-400 font-bold">/ {pl.unit || '斤'}</span></span><button onClick={() => setCustomerForm({...customerForm, priceList: customerForm.priceList?.filter((_, i) => i !== idx)})} className="text-gray-300 hover:text-rose-400"><X className="w-4 h-4" /></button></div></div>); })}</div>
                </div>
             </div>
          </div>
          </motion.div>
        </div>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {isEditingProduct && (
         <div className="fixed inset-0 bg-morandi-oatmeal z-[60] flex flex-col">
           <motion.div initial={{ opacity: 0, y: "100%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="flex flex-col h-full">
           <div className="bg-white p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 z-10"><motion.button whileTap={buttonTap} onClick={() => setIsEditingProduct(null)} className="p-2 rounded-2xl bg-gray-50"><X className="w-6 h-6 text-morandi-pebble" /></motion.button><h2 className="text-lg font-extrabold text-morandi-charcoal tracking-tight">品項資料</h2><motion.button whileTap={buttonTap} onClick={handleSaveProduct} disabled={isSaving} className="font-bold px-4 py-2 transition-colors text-morandi-blue disabled:text-gray-300">完成儲存</motion.button></div>
           <div className="p-6 space-y-6">
              <div className="space-y-2"><label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">品項名稱</label><input type="text" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="例如：油麵 (小)" value={productForm.name || ''} onChange={(e) => setProductForm({...productForm, name: e.target.value})} /></div>
              <div className="space-y-2"><label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">分類</label><div className="flex flex-wrap gap-2 p-2 bg-white rounded-[24px] border border-slate-200">{PRODUCT_CATEGORIES.map(cat => (<button key={cat.id} onClick={() => setProductForm({...productForm, category: cat.id})} className={`px-4 py-2 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5 ${productForm.category === cat.id ? 'border-transparent shadow-sm' : 'bg-white text-gray-400 border-gray-200'}`} style={{ backgroundColor: productForm.category === cat.id ? cat.color : '', color: productForm.category === cat.id ? '#3E3C3A' : '' }}><span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: cat.color, border: '1px solid rgba(0,0,0,0.1)' }}></span>{cat.label}</button>))}</div></div>
              <div className="space-y-2"><label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">計算單位</label><input type="text" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="例如：斤" value={productForm.unit || ''} onChange={(e) => setProductForm({...productForm, unit: e.target.value})} /></div>
              <div className="space-y-2"><label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">預設單價</label><input type="number" min="0" onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="例如：35" value={productForm.price === 0 ? '' : productForm.price} onChange={(e) => { const val = parseFloat(e.target.value); setProductForm({...productForm, price: isNaN(val) ? 0 : Math.max(0, val)}); }} /></div>
           </div>
           </motion.div>
         </div>
      )}
      </AnimatePresence>

      {/* Voice Input FAB - Global */}
      <motion.button 
        whileTap={buttonTap} 
        whileHover={buttonHover} 
        onClick={() => setIsVoiceModalOpen(true)} 
        className="absolute bottom-[90px] right-4 z-50 w-14 h-14 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 flex items-center justify-center"
      >
        <Mic className="w-6 h-6" />
      </motion.button>

      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-100 flex justify-around py-3 z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        <NavItem active={activeTab === 'orders'} onClick={() => setActiveTab('orders')} icon={<ClipboardList className="w-6 h-6" />} label="訂單" />
        <NavItem active={activeTab === 'customers'} onClick={() => setActiveTab('customers')} icon={<Users className="w-6 h-6" />} label="客戶" />
        <NavItem active={activeTab === 'products'} onClick={() => setActiveTab('products')} icon={<Package className="w-6 h-6" />} label="品項" />
        <NavItem active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} icon={<CalendarCheck className="w-6 h-6" />} label="行程" />
        <NavItem active={activeTab === 'finance'} onClick={() => setActiveTab('finance')} icon={<Wallet className="w-6 h-6" />} label="帳務" />
      </nav>
    </div>
  );
};

export default App;
