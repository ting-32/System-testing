import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown, Plus, Trash2, Calculator, History } from 'lucide-react';
import { Customer, Product, Order, OrderItem } from '../../types';
import { UNITS, DELIVERY_METHODS } from '../../constants';
import { formatTimeForInput } from '../../utils';
import { buttonTap } from '../animations';
import { CustomerPicker } from '../CustomerPicker';
import { ProductPicker } from '../ProductPicker';

interface OrderFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: any) => void;
  initialData?: any;
  customers: Customer[];
  products: Product[];
  orders: Order[];
  groupedOrders: { [key: string]: Order[] };
  selectedDate: string;
  isSaving: boolean;
  editingOrderId: string | null;
  addToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const OrderFormModal: React.FC<OrderFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  customers,
  products,
  orders,
  groupedOrders,
  selectedDate,
  isSaving,
  editingOrderId,
  addToast
}) => {
  const [orderForm, setOrderForm] = useState(initialData || {
    customerType: 'existing',
    customerId: '',
    customerName: '',
    deliveryTime: '08:00',
    deliveryMethod: '',
    items: [{ productId: '', quantity: 10, unit: '斤' }],
    note: ''
  });

  const [lastOrderCandidate, setLastOrderCandidate] = useState<{date: string, items: OrderItem[], sourceLabel?: string} | null>(null);
  const [customerPickerConfig, setCustomerPickerConfig] = useState<{isOpen: boolean, currentSelectedId?: string}>({ isOpen: false });
  const [pickerConfig, setPickerConfig] = useState<{isOpen: boolean, currentProductId?: string, customPrices?: any[], onSelect: (id: string) => void}>({ isOpen: false, onSelect: () => {} });

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setOrderForm(initialData);
      } else {
        const now = new Date();
        const deliveryTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setOrderForm({
          customerType: 'existing',
          customerId: '',
          customerName: '',
          deliveryTime: deliveryTime,
          deliveryMethod: '',
          items: [{ productId: '', quantity: 10, unit: '斤' }],
          note: ''
        });
      }
      setLastOrderCandidate(null);
    }
  }, [isOpen, initialData]);

  const handleOrderFormChange = (field: string, value: any) => {
    setOrderForm((prev: any) => ({ ...prev, [field]: value }));
  };

  const findLastOrder = (customerId: string, customerName: string) => {
    const customerOrders = orders.filter(o => o.customerName === customerName || customers.find(c => c.id === customerId)?.name === o.customerName);
    const currentDay = new Date(selectedDate);
    const lastWeekDate = new Date(currentDay);
    lastWeekDate.setDate(currentDay.getDate() - 7);
    const lastWeekDateStr = lastWeekDate.toISOString().split('T')[0]; 

    const sameDayLastWeekOrder = customerOrders.find(o => o.deliveryDate === lastWeekDateStr);

    if (sameDayLastWeekOrder && sameDayLastWeekOrder.items.length > 0) {
       setLastOrderCandidate({ 
         date: sameDayLastWeekOrder.deliveryDate, 
         items: sameDayLastWeekOrder.items.map(i => ({...i})),
         sourceLabel: '上週同日' 
       });
       return;
    }

    const sorted = customerOrders.sort((a, b) => new Date(b.deliveryDate).getTime() - new Date(a.deliveryDate).getTime());
    const last = sorted.find(o => o.deliveryDate !== selectedDate);
    
    if (last && last.items.length > 0) {
      setLastOrderCandidate({ 
        date: last.deliveryDate, 
        items: last.items.map(i => ({...i})),
        sourceLabel: '最近一次'
      });
    } else {
      setLastOrderCandidate(null);
    }
  };

  const applyLastOrder = () => {
    if (!lastOrderCandidate) return;
    setOrderForm((prev: any) => ({ ...prev, items: lastOrderCandidate.items.map((i: any) => ({...i})) }));
    setLastOrderCandidate(null);
    addToast(`已帶入${lastOrderCandidate.sourceLabel || '上次'}訂單內容`, 'success');
  };

  const handleSelectExistingCustomer = (id: string) => {
    const cust = customers.find(c => c.id === id);
    if (cust) {
      if (groupedOrders[cust.name] && groupedOrders[cust.name].length > 0) {
        addToast(`注意：${cust.name} 今日已建立過訂單`, 'info');
      }
      setOrderForm({
        ...orderForm,
        customerId: id,
        customerName: cust.name,
        deliveryTime: formatTimeForInput(cust.deliveryTime),
        deliveryMethod: cust.deliveryMethod || '',
        items: cust.defaultItems && cust.defaultItems.length > 0 ? cust.defaultItems.map(di => ({ ...di })) : [{ productId: '', quantity: 10, unit: '斤' }]
      });
      findLastOrder(id, cust.name);
    }
  };

  const orderSummary = useMemo(() => {
    const customer = customers.find(c => c.id === orderForm.customerId);
    let totalPrice = 0;
    const details = orderForm.items.map((item: any) => {
      const product = products.find(p => p.id === item.productId);
      const priceItem = customer?.priceList?.find(pl => pl.productId === item.productId);
      const unitPrice = priceItem ? priceItem.price : (product?.price || 0);

      let displayQty = item.quantity;
      let displayUnit = item.unit || '斤';
      let subtotal = 0;
      let isCalculated = false;

      if (item.unit === '元') {
        subtotal = item.quantity;
        if (unitPrice > 0) {
          displayQty = parseFloat((item.quantity / unitPrice).toFixed(1));
          displayUnit = product?.unit || '斤';
          isCalculated = true;
        } else {
          displayQty = 0;
        }
      } else {
        subtotal = Math.round(item.quantity * unitPrice);
        displayQty = item.quantity;
        displayUnit = item.unit || '斤';
      }

      totalPrice += subtotal;
      return {
        name: product?.name || '未選品項',
        rawQty: item.quantity,
        rawUnit: item.unit,
        displayQty,
        displayUnit,
        subtotal,
        unitPrice,
        isCalculated
      };
    });
    return { totalPrice, details };
  }, [orderForm.items, orderForm.customerId, customers, products]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-morandi-oatmeal z-[60] flex flex-col">
      <motion.div initial={{ opacity: 0, y: "100%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="flex flex-col h-full">
      <div className="bg-white p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 z-10">
        <motion.button whileTap={buttonTap} onClick={onClose} className="p-2 rounded-2xl bg-gray-50 text-morandi-pebble"><X className="w-6 h-6" /></motion.button>
        <h2 className="text-lg font-extrabold text-morandi-charcoal tracking-tight">{editingOrderId ? `編輯訂單 - ${orderForm.customerName}` : '建立配送訂單'}</h2>
        <motion.button whileTap={buttonTap} onClick={() => onSubmit(orderForm)} disabled={isSaving} className="font-bold px-4 py-2 transition-colors text-morandi-blue disabled:text-gray-300">{isSaving ? '儲存中...' : (editingOrderId ? '更新訂單' : '儲存')}</motion.button>
      </div>
      <div className="p-6 space-y-6 overflow-y-auto pb-10">
        <div className="flex bg-white p-1 rounded-[24px] shadow-sm border border-slate-100">
          <button onClick={() => handleOrderFormChange('customerType', 'existing')} className={`flex-1 py-4 rounded-[20px] text-xs font-bold transition-all tracking-wide ${orderForm.customerType === 'existing' ? 'bg-morandi-blue text-white shadow-md' : 'text-morandi-pebble'}`}>現有客戶</button>
          <button onClick={() => { handleOrderFormChange('customerType', 'retail'); handleOrderFormChange('customerId', ''); }} className={`flex-1 py-4 rounded-[20px] text-xs font-bold transition-all tracking-wide ${orderForm.customerType === 'retail' ? 'bg-morandi-blue text-white shadow-md' : 'text-morandi-pebble'}`}>零售客戶</button>
        </div>
        {orderForm.customerType === 'existing' ? (
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">配送店家</label>
            <div className="relative">
              <motion.button 
                whileTap={buttonTap} 
                onClick={() => setCustomerPickerConfig({ isOpen: true, currentSelectedId: orderForm.customerId })} 
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
        ) : (
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">客戶名稱</label>
            <input type="text" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 text-morandi-charcoal font-bold outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="輸入零售名稱..." value={orderForm.customerName} onChange={(e) => handleOrderFormChange('customerName', e.target.value)} />
          </div>
        )}
        
         <div className="space-y-2">
           <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">配送設定</label>
           <div className="flex gap-2">
             <div className="flex-1">
               <input type="time" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 text-morandi-charcoal font-bold outline-none focus:ring-2 focus:ring-morandi-blue transition-all" value={orderForm.deliveryTime} onChange={(e) => handleOrderFormChange('deliveryTime', e.target.value)} />
             </div>
             <div className="flex-1">
               <select value={orderForm.deliveryMethod} onChange={(e) => handleOrderFormChange('deliveryMethod', e.target.value)} className="w-full h-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 text-morandi-charcoal font-bold outline-none focus:ring-2 focus:ring-morandi-blue transition-all appearance-none">
                 <option value="">配送方式...</option>
                 {DELIVERY_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
               </select>
             </div>
           </div>
         </div>
         <div className="space-y-4">
           <div className="flex justify-between items-center">
             <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">品項明細</label>
             <div className="flex gap-2">
               {lastOrderCandidate && (
                 <motion.button whileTap={buttonTap} onClick={applyLastOrder} className="text-[10px] font-bold text-white bg-morandi-blue px-2 py-1 rounded-lg shadow-sm flex items-center gap-1">
                   <History className="w-3 h-3" /> 帶入{lastOrderCandidate.sourceLabel || '上次'} ({lastOrderCandidate.date})
                 </motion.button>
               )}
               <button onClick={() => handleOrderFormChange('items', [...orderForm.items, {productId: '', quantity: 10, unit: '斤'}])} className="text-[10px] font-bold text-morandi-blue tracking-wide">
                 <Plus className="w-3 h-3 inline mr-1" /> 增加品項
               </button>
             </div>
           </div>
           {orderForm.items.map((item: any, idx: number) => (
             <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} key={idx} className="bg-white p-5 rounded-[28px] shadow-sm border border-slate-200 flex items-center gap-2 flex-wrap">
               <div onClick={() => { 
                 const currentCustomer = customers.find(c => c.id === orderForm.customerId); 
                 setPickerConfig({ 
                   isOpen: true, 
                   currentProductId: item.productId, 
                   customPrices: currentCustomer?.priceList, 
                   onSelect: (pid) => { 
                     const n = [...orderForm.items]; 
                     const p = products.find(x => x.id === pid); 
                     n[idx] = { ...item, productId: pid, unit: p?.unit || '斤' }; 
                     handleOrderFormChange('items', n); 
                   } 
                 }); 
               }} className="w-full sm:flex-1 bg-morandi-oatmeal/50 p-4 rounded-xl text-sm font-bold border border-slate-100 flex items-center justify-between cursor-pointer hover:border-morandi-blue transition-all mb-2 sm:mb-0">
                 <span className={item.productId ? 'text-morandi-charcoal' : 'text-gray-400'}>{products.find(p => p.id === item.productId)?.name || '選擇品項...'}</span>
                 <ChevronDown className="w-4 h-4 text-gray-400" />
               </div>
               <div className="flex items-center gap-2 w-full sm:w-auto justify-between">
                 <input type="number" min="0" onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} className="w-20 bg-morandi-oatmeal/50 p-4 rounded-xl text-center font-bold border border-slate-100 text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" value={item.quantity === 0 ? '' : item.quantity} onChange={(e) => { const n = [...orderForm.items]; const val = parseFloat(e.target.value); n[idx].quantity = isNaN(val) ? 0 : Math.max(0, val); handleOrderFormChange('items', n); }} />
                 <select value={item.unit || '斤'} onChange={(e) => { const n = [...orderForm.items]; n[idx].unit = e.target.value; handleOrderFormChange('items', n); }} className="w-20 bg-morandi-oatmeal/50 p-4 rounded-xl font-bold text-morandi-charcoal border border-slate-100 outline-none focus:ring-2 focus:ring-morandi-blue transition-all">
                   {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                 </select>
                 <motion.button whileTap={buttonTap} onClick={() => { const n = orderForm.items.filter((_: any, i: number) => i !== idx); handleOrderFormChange('items', n.length ? n : [{productId:'', quantity:10, unit:'斤'}]); }} className="p-2 text-morandi-pink hover:text-rose-300 transition-colors">
                   <Trash2 className="w-4 h-4" />
                 </motion.button>
               </div>
             </motion.div>
           ))}
         </div>
         <div className="space-y-2">
           <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">訂單預覽</label>
           <div className="bg-morandi-amber-bg rounded-[24px] p-5 shadow-sm border border-amber-100/50">
             <div className="flex justify-between items-center mb-3 border-b border-amber-100 pb-2">
               <div className="flex items-center gap-2 text-morandi-amber-text"><Calculator className="w-4 h-4" /><span className="text-xs font-bold tracking-wide">預估清單</span></div>
               <div className="text-xs font-bold text-morandi-amber-text/60 tracking-wide">共 {orderSummary.details.filter(d => d.rawQty > 0).length} 項</div>
             </div>
             <div className="space-y-2 mb-4">
               {orderSummary.details.filter(d => d.rawQty > 0).map((detail, i) => (
                 <div key={i} className="flex justify-between items-center text-sm">
                   <div className="flex flex-col">
                     <span className="font-bold text-slate-700 tracking-wide">{detail.name}</span>
                     {detail.isCalculated && (<span className="text-[10px] text-gray-400">(以單價 ${detail.unitPrice} 換算: {detail.rawQty}元 &rarr; {detail.displayQty}{detail.displayUnit})</span>)}
                   </div>
                   <div className="flex items-center gap-3">
                     <span className="font-bold text-slate-600">{detail.displayQty} {detail.displayUnit}</span>
                     <span className="font-black text-amber-600 w-12 text-right tracking-tight">${detail.subtotal}</span>
                   </div>
                 </div>
               ))}
               {orderSummary.details.filter(d => d.rawQty > 0).length === 0 && (<div className="text-center text-xs text-amber-400 italic py-2 tracking-wide">尚未加入有效品項</div>)}
             </div>
             <div className="flex justify-between items-center pt-3 border-t border-amber-200">
               <span className="text-xs font-bold text-amber-700 tracking-wide">預估總金額</span>
               <span className="text-xl font-black text-amber-600 tracking-tight">${orderSummary.totalPrice}</span>
             </div>
           </div>
         </div>
         <div className="space-y-2">
           <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">訂單備註</label>
           <textarea className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 text-morandi-charcoal font-bold resize-none outline-none focus:ring-2 focus:ring-morandi-blue transition-all placeholder:text-gray-300" rows={3} placeholder="備註特殊需求..." value={orderForm.note} onChange={(e) => handleOrderFormChange('note', e.target.value)} />
         </div>
      </div>
      </motion.div>

      <CustomerPicker 
        isOpen={customerPickerConfig.isOpen} 
        onClose={() => setCustomerPickerConfig({ isOpen: false })} 
        onSelect={(id) => {
          handleSelectExistingCustomer(id);
          setCustomerPickerConfig({ isOpen: false });
        }} 
        customers={customers}
        orders={orders}
        selectedDate={selectedDate}
        currentSelectedId={customerPickerConfig.currentSelectedId}
      />

      <ProductPicker 
        isOpen={pickerConfig.isOpen} 
        onClose={() => setPickerConfig(prev => ({ ...prev, isOpen: false }))} 
        onSelect={(id) => {
          pickerConfig.onSelect(id);
          setPickerConfig(prev => ({ ...prev, isOpen: false }));
        }} 
        products={products}
        currentSelectedId={pickerConfig.currentProductId}
        customPrices={pickerConfig.customPrices}
      />
    </div>
  );
};
