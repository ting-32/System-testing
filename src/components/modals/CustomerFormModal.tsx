import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { Customer, Product } from '../../types';
import { WEEKDAYS, DELIVERY_METHODS, ORDERING_HABITS, UNITS } from '../../constants';
import { buttonTap } from '../animations';
import { ProductPicker } from '../ProductPicker';
import { HolidayCalendar } from '../HolidayCalendar';

interface CustomerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: any) => void;
  initialData?: any;
  isEditingCustomer: string | null;
  products: Product[];
  isSaving: boolean;
}

export const CustomerFormModal: React.FC<CustomerFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isEditingCustomer,
  products,
  isSaving
}) => {
  const [customerForm, setCustomerForm] = useState<Partial<Customer>>(initialData || {});
  const [holidayEditorId, setHolidayEditorId] = useState<string | null>(null);
  const [tempPriceProdId, setTempPriceProdId] = useState('');
  const [tempPriceValue, setTempPriceValue] = useState('');
  const [tempPriceUnit, setTempPriceUnit] = useState('斤');
  const [pickerConfig, setPickerConfig] = useState<{isOpen: boolean, currentProductId?: string, onSelect: (id: string) => void}>({ isOpen: false, onSelect: () => {} });

  useEffect(() => {
    if (isOpen) {
      setCustomerForm(initialData || {
        name: '', phone: '', deliveryTime: '08:00', defaultItems: [], offDays: [], holidayDates: [], priceList: [], deliveryMethod: '', paymentTerm: 'regular'
      });
      setTempPriceProdId('');
      setTempPriceValue('');
      setTempPriceUnit('斤');
      setHolidayEditorId(null);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-morandi-oatmeal z-[60] flex flex-col">
      <motion.div initial={{ opacity: 0, y: "100%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="flex flex-col h-full">
      <div className="bg-white p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 z-10">
        <motion.button whileTap={buttonTap} onClick={onClose} className="p-2 rounded-2xl bg-gray-50"><X className="w-6 h-6 text-morandi-pebble" /></motion.button>
        <h2 className="text-lg font-extrabold text-morandi-charcoal tracking-tight">店家詳細資料</h2>
        <motion.button whileTap={buttonTap} onClick={() => onSubmit(customerForm)} disabled={isSaving} className="font-bold px-4 py-2 transition-colors text-morandi-blue disabled:text-gray-300">{isSaving ? '儲存中...' : '儲存'}</motion.button>
      </div>
      <div className="p-6 space-y-6 overflow-y-auto pb-10">
         <div className="space-y-2">
           <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">基本資訊</label>
           <div className="space-y-4">
             <input type="text" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="店名" value={customerForm.name || ''} onChange={(e) => setCustomerForm({...customerForm, name: e.target.value})} />
             <input type="tel" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="電話" value={customerForm.phone || ''} onChange={(e) => setCustomerForm({...customerForm, phone: e.target.value})} />
           </div>
         </div>
         <div className="space-y-2">
           <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">配送與習慣</label>
           <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 pl-1">配送方式</label>
                <select value={customerForm.deliveryMethod || ''} onChange={(e) => setCustomerForm({...customerForm, deliveryMethod: e.target.value})} className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#8e9775] transition-all appearance-none">
                  <option value="">選擇配送方式...</option>
                  {DELIVERY_METHODS.map(method => (<option key={method} value={method}>{method}</option>))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 pl-1">預定習慣</label>
                <select value={customerForm.paymentTerm || 'regular'} onChange={(e) => setCustomerForm({...customerForm, paymentTerm: e.target.value as any})} className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#8e9775] transition-all appearance-none">
                  {ORDERING_HABITS.map(habit => (<option key={habit.value} value={habit.value}>{habit.label}</option>))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 pl-1">配送時間</label>
                <input type="time" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#8e9775] transition-all" value={customerForm.deliveryTime || '08:00'} onChange={(e) => setCustomerForm({...customerForm, deliveryTime: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 pl-1">每週公休</label>
                <div className="flex gap-2">
                  {WEEKDAYS.map(d => { 
                    const isOff = (customerForm.offDays || []).includes(d.value); 
                    return (
                      <button key={d.value} onClick={() => { const current = customerForm.offDays || []; const newOff = isOff ? current.filter(x => x !== d.value) : [...current, d.value]; setCustomerForm({...customerForm, offDays: newOff}); }} className={`w-10 h-10 rounded-xl font-bold text-xs transition-all ${isOff ? 'bg-rose-500 text-white shadow-md' : 'bg-white text-gray-400 border border-slate-200'}`}>{d.label}</button>
                    ); 
                  })}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 pl-1">特定公休</label>
                <div className="flex flex-wrap gap-2">
                  {(customerForm.holidayDates || []).map(date => (
                    <span key={date} className="bg-rose-50 text-rose-500 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border border-rose-100">{date} <button onClick={() => setCustomerForm({...customerForm, holidayDates: customerForm.holidayDates?.filter(d => d !== date)})}><X className="w-3 h-3" /></button></span>
                  ))}
                  <button onClick={() => setHolidayEditorId('new')} className="bg-gray-50 text-gray-400 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-gray-100 border border-slate-200"><Plus className="w-3 h-3" /> 新增日期</button>
                </div>
              </div>
           </div>
         </div>
         <div className="space-y-2">
            <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">預設品項</label>
            <div className="space-y-3">
               {(customerForm.defaultItems || []).map((item: any, idx: number) => (
                  <div key={idx} className="flex gap-2 items-center">
                     <div onClick={() => setPickerConfig({ isOpen: true, currentProductId: item.productId, onSelect: (pid) => { const newItems = [...(customerForm.defaultItems || [])]; const p = products.find(x => x.id === pid); newItems[idx] = { ...item, productId: pid, unit: p?.unit || '斤' }; setCustomerForm({...customerForm, defaultItems: newItems}); } })} className="flex-1 bg-morandi-oatmeal/50 p-3 rounded-xl font-bold text-sm text-morandi-charcoal border border-slate-200 flex items-center justify-between cursor-pointer hover:border-morandi-blue transition-all">
                        <span className={item.productId ? 'text-morandi-charcoal' : 'text-gray-400'}>{products.find(p => p.id === item.productId)?.name || '選擇品項...'}</span>
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
                  <div onClick={() => setPickerConfig({ isOpen: true, currentProductId: tempPriceProdId, onSelect: (pid) => { setTempPriceProdId(pid); const p = products.find(x => x.id === pid); if (p?.unit) setTempPriceUnit(p.unit); } })} className="flex-1 bg-white p-3 rounded-xl font-bold text-sm text-slate-700 border border-slate-100 flex items-center justify-between cursor-pointer hover:border-amber-400 transition-all">
                     <span className={tempPriceProdId ? 'text-slate-700' : 'text-gray-400'}>{products.find(p => p.id === tempPriceProdId)?.name || '選擇品項...'}</span>
                     <ChevronDown className="w-4 h-4 text-gray-400" />
                  </div>
                  <input type="number" min="0" onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} placeholder="單價" className="w-20 p-3 bg-white rounded-xl text-center font-bold text-slate-700 outline-none border border-slate-100" value={tempPriceValue} onChange={(e) => { const val = e.target.value; if (val === '' || (!isNaN(Number(val)) && Number(val) >= 0)) { setTempPriceValue(val); } }} />
                  <select value={tempPriceUnit} onChange={(e) => setTempPriceUnit(e.target.value)} className="w-20 p-3 bg-white rounded-xl font-bold text-slate-700 outline-none border border-slate-100">{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select>
                  <button onClick={() => { if(tempPriceProdId && tempPriceValue) { const newPriceList = [...(customerForm.priceList || [])]; const existingIdx = newPriceList.findIndex(x => x.productId === tempPriceProdId); if(existingIdx >= 0) { newPriceList[existingIdx].price = Number(tempPriceValue); newPriceList[existingIdx].unit = tempPriceUnit; } else { newPriceList.push({productId: tempPriceProdId, price: Number(tempPriceValue), unit: tempPriceUnit}); } setCustomerForm({...customerForm, priceList: newPriceList}); setTempPriceProdId(''); setTempPriceValue(''); setTempPriceUnit('斤'); } }} className="p-3 bg-amber-400 text-white rounded-xl shadow-sm"><Plus className="w-4 h-4" /></button>
               </div>
               <div className="space-y-2">
                 {(customerForm.priceList || []).map((pl, idx) => { 
                   const p = products.find(prod => prod.id === pl.productId); 
                   return (
                     <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-xl shadow-sm border border-slate-100">
                       <span className="text-sm font-bold text-slate-700 tracking-wide">{p?.name || pl.productId}</span>
                       <div className="flex items-center gap-3">
                         <div className="flex items-center gap-1">
                           <span className="font-black text-amber-500">$</span>
                           <input 
                             type="number" 
                             min="0"
                             className="w-16 bg-transparent font-black text-amber-500 tracking-tight outline-none border-b border-transparent hover:border-amber-200 focus:border-amber-500 text-right"
                             value={pl.price}
                             onChange={(e) => {
                               const val = e.target.value;
                               if (val === '' || (!isNaN(Number(val)) && Number(val) >= 0)) {
                                 const newPriceList = [...(customerForm.priceList || [])];
                                 newPriceList[idx].price = Number(val);
                                 setCustomerForm({...customerForm, priceList: newPriceList});
                               }
                             }}
                           />
                           <span className="text-xs text-gray-400 font-bold">/ {pl.unit || '斤'}</span>
                         </div>
                         <button onClick={() => setCustomerForm({...customerForm, priceList: customerForm.priceList?.filter((_, i) => i !== idx)})} className="text-gray-300 hover:text-rose-400"><X className="w-4 h-4" /></button>
                       </div>
                     </div>
                   ); 
                 })}
               </div>
            </div>
         </div>
      </div>
      </motion.div>

      <ProductPicker 
        isOpen={pickerConfig.isOpen} 
        onClose={() => setPickerConfig(prev => ({ ...prev, isOpen: false }))} 
        onSelect={(id) => {
          pickerConfig.onSelect(id);
          setPickerConfig(prev => ({ ...prev, isOpen: false }));
        }} 
        products={products}
        currentSelectedId={pickerConfig.currentProductId}
      />

      {holidayEditorId && (
        <HolidayCalendar 
          storeName={customerForm.name || ''} 
          holidays={customerForm.holidayDates || []} 
          onToggle={(date) => { 
            const current = customerForm.holidayDates || []; 
            const newHolidays = current.includes(date) ? current.filter(d => d !== date) : [...current, date]; 
            setCustomerForm({...customerForm, holidayDates: newHolidays}); 
          }} 
          onClose={() => setHolidayEditorId(null)} 
        />
      )}
    </div>
  );
};
