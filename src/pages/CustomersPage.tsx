import React, { useState, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Customer, Product, Order, ToastType } from '../types';
import { Users, Plus, Search, MapPin, History, Edit2, Trash2, X, ChevronDown, Info } from 'lucide-react';
import { COLORS, WEEKDAYS, UNITS, DELIVERY_METHODS, ORDERING_HABITS } from '../constants';
import { CustomerProfileDrawer } from '../components/CustomerProfileDrawer';
import { CustomerReportModal } from '../components/CustomerReportModal';
import { HolidayCalendar } from '../components/HolidayCalendar';
import { ProductPicker } from '../components/ProductPicker';
import { fetchWithRetry } from '../utils/fetchUtils';
import { formatTimeDisplay, formatTimeForInput, getUpcomingHolidays, isDateInOffDays } from '../utils';
import { buttonTap, buttonHover, containerVariants, itemVariants } from '../components/animations';

export interface CustomersPageProps {
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  products: Product[];
  orders: Order[];
  apiEndpoint: string;
  isSaving: boolean;
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>;
  isWarmingUp: boolean;
  isRetrying: boolean;
  addToast: (msg: string, type: ToastType) => void;
  setConflictData: React.Dispatch<React.SetStateAction<any>>;
  setConfirmConfig: React.Dispatch<React.SetStateAction<any>>;
  requireAuth: (action: () => void) => void;
  onCreateOrder?: (customer: Customer) => void;
  isEditingCustomer: string | null;
  setIsEditingCustomer: React.Dispatch<React.SetStateAction<string | null>>;

  customerForm: Partial<Customer>;
  setCustomerForm: React.Dispatch<React.SetStateAction<Partial<Customer>>>;
  editCustomerMode: 'full' | 'itemsOnly' | 'holidayOnly';
  setEditCustomerMode: React.Dispatch<React.SetStateAction<'full' | 'itemsOnly' | 'holidayOnly'>>;
  showAdvancedCustomerSettings: boolean;
  setShowAdvancedCustomerSettings: React.Dispatch<React.SetStateAction<boolean>>;
  onSaveCustomerCloud: (finalCustomer: Customer, isEditingCustomer: string | null, originalLastUpdated: string | undefined, previousCustomers: Customer[]) => Promise<boolean>;
  onDeleteCustomerCloud: (customerId: string, customerBackup: Customer) => Promise<void>;
  availableTrips: string[];
}

export const CustomersPage: React.FC<CustomersPageProps> = ({
  customers,
  setCustomers,
  products,
  orders,
  apiEndpoint,
  isSaving,
  setIsSaving,
  isWarmingUp,
  isRetrying,
  addToast,
  setConflictData,
  setConfirmConfig,
  requireAuth,
  onCreateOrder,
  isEditingCustomer,
  setIsEditingCustomer,
  customerForm,
  setCustomerForm,
  editCustomerMode,
  setEditCustomerMode,
  showAdvancedCustomerSettings,
  setShowAdvancedCustomerSettings,
  onSaveCustomerCloud,
  onDeleteCustomerCloud,
  availableTrips
}) => {
  const [customerSearch, setCustomerSearch] = useState('');

  
  const [viewingCustomerProfile, setViewingCustomerProfile] = useState<string | null>(null);
  const [viewingCustomerReport, setViewingCustomerReport] = useState<string | null>(null);
  
  const [holidayEditorId, setHolidayEditorId] = useState<string | null>(null);
  const [directHolidayCustomer, setDirectHolidayCustomer] = useState<Customer | null>(null);
  
  const [tempPriceProdId, setTempPriceProdId] = useState('');
  const [tempPriceValue, setTempPriceValue] = useState('');
  const [tempPriceUnit, setTempPriceUnit] = useState('斤');
  const [pickerConfig, setPickerConfig] = useState<{ isOpen: boolean; onSelect: (productId: string) => void; currentProductId?: string; customPrices?: any[]; }>({ isOpen: false, onSelect: () => {} });
  const [drawerConfig, setDrawerConfig] = useState<{ isOpen: boolean; type: 'deliveryMethod' | 'trip' | null; target: 'order' | 'customer' }>({ isOpen: false, type: null, target: 'order' });

  const editingVersionRef = useRef<number | undefined>(undefined);

  // Group orders for "has order today" logic
  const groupedOrders = useMemo(() => {
    return orders.reduce((acc, order) => {
      if (!acc[order.customerName]) acc[order.customerName] = [];
      acc[order.customerName].push(order);
      return acc;
    }, {} as Record<string, Order[]>);
  }, [orders]);

  const filteredCustomers = useMemo(() => {
    let result = customers;
    if (customerSearch) {
      const q = customerSearch.toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)));
    }
    return result;
  }, [customers, customerSearch]);

  const handleSaveCustomer = async () => { 
    if (!customerForm.name || isSaving) return; 
    
    const isDuplicateName = customers.some(c => String(c.name || '').trim() === String(customerForm.name || '').trim() && c.id !== (isEditingCustomer === 'new' ? null : isEditingCustomer)); 
    if (isDuplicateName) { addToast('客戶名稱不可重複！', 'error'); return; } 
    
    // Validate coordinates
    if (customerForm.coordinates) {
      const coordPattern = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/;
      if (!coordPattern.test(customerForm.coordinates)) {
        addToast('請輸入正確的座標格式，例如：25.033964, 121.564468', 'error');
        return;
      }
    }

    const finalCustomer: Customer = { 
      id: isEditingCustomer === 'new' ? Date.now().toString() : (isEditingCustomer as string), 
      name: String(customerForm.name || '').trim(), 
      phone: String(customerForm.phone || '').trim(), 
      address: String(customerForm.address || '').trim(), 
      coordinates: String(customerForm.coordinates || '').trim(), 
      deliveryTime: customerForm.deliveryTime || '08:00', 
      deliveryMethod: customerForm.deliveryMethod || '', 
      paymentTerm: customerForm.paymentTerm || 'regular', 
      defaultItems: (customerForm.defaultItems || []).filter((i: any) => i.productId !== ''), 
      priceList: (customerForm.priceList || []), 
      offDays: customerForm.offDays || [], 
      holidayDates: customerForm.holidayDates || [], 
      defaultTrip: customerForm.defaultTrip || '', 
      autoOrderEnabled: customerForm.autoOrderEnabled || false, 
      lastUpdated: Date.now() 
    }; 
    
    // Backup old list for revert
    const previousCustomers = [...customers];

    // Optimistic Update
    if (isEditingCustomer === 'new') setCustomers([...customers, finalCustomer]); 
    else setCustomers(customers.map(c => c.id === isEditingCustomer ? finalCustomer : c)); 
    
    // Close modal UI immediately
    const tempIsEditingCustomer = isEditingCustomer;
    const tempOriginalLastUpdated = editingVersionRef.current;
    
    setIsEditingCustomer(null); 
    editingVersionRef.current = undefined;

    // Async sync to cloud
    await onSaveCustomerCloud(finalCustomer, tempIsEditingCustomer, tempOriginalLastUpdated, previousCustomers);
  };

  const executeDeleteCustomer = async (customerId: string) => { 
    setConfirmConfig((prev: any) => ({ ...prev, isOpen: false })); 
    const customerBackup = customers.find(c => c.id === customerId); 
    if (!customerBackup) return; 
    setCustomers((prev: Customer[]) => prev.filter(c => c.id !== customerId)); 
    await onDeleteCustomerCloud(customerId, customerBackup);
  };

  const handleDeleteCustomer = (customerId: string) => { 
    setConfirmConfig({ isOpen: true, title: '刪除店家', message: '確定要刪除此店家嗎？\n這將一併刪除相關的設定。', onConfirm: () => executeDeleteCustomer(customerId) }); 
  };

  return (
    <>
      <div className="relative pb-24">
        <div className="sticky top-0 z-20 bg-morandi-oatmeal pt-4 pb-4 -mx-4 px-4 shadow-sm border-b border-slate-100">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xl font-extrabold text-morandi-charcoal flex items-center gap-2 tracking-tight"><Users className="w-5 h-5 text-morandi-blue" /> 店家管理</h2>
            <motion.button whileTap={buttonTap} whileHover={buttonHover} onClick={() => requireAuth(() => { setCustomerForm({ name: '', phone: '', address: '', coordinates: '', deliveryTime: '08:00', defaultTrip: '', defaultItems: [], offDays: [], holidayDates: [], priceList: [], deliveryMethod: '', paymentTerm: 'regular' }); setIsEditingCustomer('new'); setEditCustomerMode('full'); setTempPriceProdId(''); setTempPriceValue(''); setTempPriceUnit('斤'); })} className="p-3 rounded-2xl text-white shadow-lg bg-morandi-blue hover:bg-slate-600 transition-colors"><Plus className="w-6 h-6" /></motion.button>
          </div>
          <div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input type="text" placeholder="搜尋店家名稱..." className="w-full pl-10 pr-4 py-2.5 bg-white rounded-xl border border-slate-200 shadow-sm text-sm text-morandi-charcoal font-bold tracking-wide focus:ring-2 focus:ring-morandi-blue transition-all placeholder:text-gray-400" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} /></div>
        </div>
        
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="pt-4">
        {filteredCustomers.map(c => {
           const hasOrderToday = groupedOrders[c.name] && groupedOrders[c.name].length > 0;
           return (
              <motion.div variants={itemVariants} key={c.id} className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-200 mb-4 hover:shadow-md transition-all relative overflow-hidden">
                {hasOrderToday && <div className="absolute top-0 right-0 bg-amber-100 text-amber-700 text-[9px] font-bold px-3 py-1 rounded-bl-xl z-10">今日已下單</div>}
                <div className="flex justify-between items-start mb-4"><div className="flex items-center gap-3"><div className="w-14 h-14 rounded-[22px] bg-morandi-oatmeal flex items-center justify-center text-xl font-extrabold text-morandi-blue">{String(c.name || '').charAt(0)}</div><div><h3 className="font-bold text-slate-800 text-lg tracking-tight">{c.name}</h3><p className="text-xs text-slate-500 font-medium tracking-wide">{c.phone || '無電話'}</p>{(c.address || c.coordinates) && (() => {
const targetUrl = c.coordinates ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.coordinates)}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address || '')}`;
const tooltipText = c.coordinates ? "開啟精準地圖連結" : "在 Google 地圖上搜尋此地址";

return (
<div className="mt-1.5">
  <a 
    href={targetUrl} 
    target="_blank" 
    rel="noopener noreferrer" 
    title={tooltipText}
    className="group inline-flex items-start gap-1.5 px-1.5 py-1 -ml-1.5 rounded-md transition-all hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-100"
  >
    <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:text-blue-500 transition-colors mt-0.5" />
    <span className="text-xs text-slate-500 group-hover:text-blue-600 transition-colors font-medium tracking-wide">
      {c.address || '查看 Google 地圖'}
    </span>
  </a>
</div>
);
})()}</div></div><div className="flex flex-col items-end gap-1 mt-2"><div className="flex gap-1">{WEEKDAYS.map(d => (<div key={d.value} className={`w-4 h-4 rounded-full text-[8px] flex items-center justify-center font-bold ${c.offDays?.includes(d.value) ? 'bg-rose-100 text-rose-400' : 'bg-gray-50 text-gray-300'}`}>{d.label}</div>))}</div>{c.holidayDates && c.holidayDates.length > 0 && <span className="text-[8px] font-bold text-rose-300">+{c.holidayDates.length} 特定休</span>}{c.priceList && c.priceList.length > 0 && <span className="text-[8px] font-bold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded mt-1">已設 {c.priceList.length} 種單價</span>}</div></div>
                <div className="space-y-3 mb-4 bg-gray-50/60 p-4 rounded-[24px] border border-gray-100"><div className="flex justify-between"><div className="text-[11px] font-bold text-slate-700 tracking-wide">配送時間:{formatTimeDisplay(c.deliveryTime)}</div><div className="flex gap-1">{c.defaultTrip && <div className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">{c.defaultTrip}</div>}{c.deliveryMethod && <div className="text-[11px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-lg border border-gray-100">{c.deliveryMethod}</div>}{c.paymentTerm && (<div className="text-[11px] font-bold text-morandi-blue bg-white px-2 py-0.5 rounded-lg border border-gray-100">{ORDERING_HABITS.find(t => t.value === c.paymentTerm)?.label}</div>)}</div></div>{c.defaultItems && c.defaultItems.length > 0 ? (<div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-200/50">{c.defaultItems.map((di, idx) => { const p = products.find(prod => prod.id === di.productId); return (<div key={idx} className="bg-white px-2 py-1 rounded-xl text-[10px] border border-gray-200 flex items-center gap-1 shadow-sm"><span className="font-bold text-slate-700">{p?.name || '未知品項'}</span><span className="font-extrabold text-morandi-blue">{di.quantity}{di.unit || p?.unit || '斤'}</span></div>); })}</div>) : (<div className="text-[10px] text-gray-400 font-medium italic pt-2 border-t border-gray-200/50 tracking-wide">尚未設定預設品項</div>)}</div>
                <div className="flex gap-2">
                   <motion.button whileTap={buttonTap} onClick={() => setViewingCustomerProfile(c.name)} className="flex-1 py-3 bg-slate-800 rounded-2xl text-white font-bold text-xs flex items-center justify-center gap-2 hover:bg-slate-700 transition-colors shadow-md shadow-slate-200"><History className="w-3.5 h-3.5" /> 歷史/報表</motion.button>
                   <motion.button whileTap={buttonTap} onClick={() => requireAuth(() => { setCustomerForm({ ...c, address: c.address || '', coordinates: c.coordinates || '', deliveryTime: formatTimeForInput(c.deliveryTime), paymentTerm: c.paymentTerm || 'regular', defaultTrip: c.defaultTrip || '' }); setIsEditingCustomer(c.id); setEditCustomerMode('full'); setTempPriceProdId(''); setTempPriceValue(''); setTempPriceUnit('斤'); editingVersionRef.current = c.lastUpdated; })} className="flex-1 py-3 bg-gray-50 rounded-2xl text-slate-700 font-bold text-xs flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors border border-gray-100"><Edit2 className="w-3.5 h-3.5" /></motion.button>
                   <motion.button whileTap={buttonTap} onClick={() => requireAuth(() => handleDeleteCustomer(c.id))} className="px-4 py-3 bg-gray-50 rounded-2xl text-morandi-pink hover:text-rose-500 transition-colors border border-gray-100"><Trash2 className="w-4 h-4" /></motion.button>
                </div>
              </motion.div>
           );
        })}
        </motion.div>
        {filteredCustomers.length === 0 && <div className="text-center py-10 text-gray-300 text-sm font-bold tracking-wide">查無店家</div>}
      </div>

      {/* Profile Drawer */}
      {typeof document !== 'undefined' && createPortal(
        <>
      {viewingCustomerProfile && (
        <CustomerProfileDrawer
          isOpen={true}
          onClose={() => setViewingCustomerProfile(null)}
          customerName={viewingCustomerProfile}
          customers={customers}
          orders={orders}
          products={products}
          onCreateOrder={onCreateOrder}
          onOpenReport={setViewingCustomerReport}
        />
      )}

      {/* Report Modal */}
      {viewingCustomerReport && (
        <CustomerReportModal
          isOpen={true}
          onClose={() => setViewingCustomerReport(null)}
          customerName={viewingCustomerReport}
          customers={customers}
          orders={orders}
          products={products}
        />
      )}

      {/* Customer Form Modal */}
      <AnimatePresence>
       {isEditingCustomer && (
        <motion.div key="customer-modal" className={`fixed inset-0 z-[110] flex ${editCustomerMode === 'itemsOnly' ? 'bg-morandi-charcoal/40 backdrop-blur-sm items-center justify-center p-4' : 'bg-morandi-oatmeal flex-col'}`}>
          <motion.div initial={{ opacity: 0, y: "100%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className={`flex flex-col ${editCustomerMode === 'itemsOnly' ? 'bg-white w-full max-w-2xl rounded-[32px] overflow-hidden shadow-xl max-h-[90vh]' : 'h-full'}`}>
          <div className="bg-white p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 z-10"><motion.button whileTap={buttonTap} onClick={() => { setIsEditingCustomer(null); setEditCustomerMode('full'); editingVersionRef.current = undefined; }} className="p-2 rounded-2xl bg-gray-50"><X className="w-6 h-6 text-morandi-pebble" /></motion.button><h2 className="text-lg font-extrabold text-morandi-charcoal tracking-tight">{editCustomerMode === 'itemsOnly' ? '修改預設品項' : editCustomerMode === 'holidayOnly' ? '設定公休' : '店家詳細資料'}</h2><motion.button whileTap={buttonTap} onClick={() => requireAuth(handleSaveCustomer)} disabled={isSaving || isWarmingUp} className="font-bold px-4 py-2 transition-colors text-morandi-blue disabled:text-gray-300">{isWarmingUp ? '連線中...' : (isRetrying ? '↻ 正在重試...' : (isSaving ? '儲存中...' : '儲存'))}</motion.button></div>
          <div className="p-6 overflow-y-auto pb-10">
            <div className={`grid grid-cols-1 ${editCustomerMode === 'full' ? 'lg:grid-cols-2' : 'max-w-2xl mx-auto'} gap-6`}>
              {/* 左欄：基本資訊與配送 */}
              {editCustomerMode === 'full' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">基本資訊</label>
                  <div className="space-y-4">
                    <input type="text" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="店名" value={customerForm.name || ''} onChange={(e) => setCustomerForm({...customerForm, name: e.target.value})} />
                    <input type="tel" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="電話" value={customerForm.phone || ''} onChange={(e) => setCustomerForm({...customerForm, phone: e.target.value})} />
                    <input type="text" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="請輸入完整地址" value={customerForm.address || ''} onChange={(e) => setCustomerForm({...customerForm, address: e.target.value})} />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">配送與習慣</label>
                  <div className="space-y-4">
                    <div className="space-y-1"><label className="text-[10px] font-bold text-gray-400 pl-1">配送方式</label><select value={customerForm.deliveryMethod || ''} onChange={(e) => setCustomerForm({...customerForm, deliveryMethod: e.target.value})} className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#8e9775] transition-all appearance-none"><option value="">選擇配送方式...</option>{DELIVERY_METHODS.map(method => (<option key={method} value={method}>{method}</option>))}</select></div>
                    <div className="space-y-1"><label className="text-[10px] font-bold text-gray-400 pl-1">預定習慣</label><select value={customerForm.paymentTerm || 'regular'} onChange={(e) => setCustomerForm({...customerForm, paymentTerm: e.target.value as any})} className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#8e9775] transition-all appearance-none">{ORDERING_HABITS.map(habit => (<option key={habit.value} value={habit.value}>{habit.label}</option>))}</select></div>
                    <div className="space-y-1"><label className="text-[10px] font-bold text-gray-400 pl-1">配送時間</label><input type="time" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#8e9775] transition-all" value={customerForm.deliveryTime || '08:00'} onChange={(e) => setCustomerForm({...customerForm, deliveryTime: e.target.value})} /></div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-gray-400 pl-1">預設趟數</label>
                      <div className="relative">
                        <select
                          value={customerForm.defaultTrip || ''}
                          onChange={(e) => setCustomerForm(prev => ({ ...prev, defaultTrip: e.target.value }))}
                          className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold outline-none focus:ring-2 focus:ring-morandi-blue transition-all appearance-none text-slate-800"
                        >
                          <option value="" disabled className="text-gray-400">選擇預設趟數...</option>
                          {availableTrips.filter(t => t !== '未分配').map(trip => (
                            <option key={trip} value={trip}>{trip}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              )}

              {/* 右欄：品項與價格 */}
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">預設品項</label>
                  <div className="space-y-3">
                     {(customerForm.defaultItems || []).map((item, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                           <div onClick={() => setPickerConfig({ isOpen: true, currentProductId: item.productId, customPrices: customerForm.priceList, onSelect: (pid) => { const newItems = [...(customerForm.defaultItems || [])]; const p = products.find(x => x.id === pid); newItems[idx] = { ...item, productId: pid, productName: p?.name, unit: p?.unit || '斤' }; setCustomerForm({...customerForm, defaultItems: newItems}); } })} className="flex-1 bg-morandi-oatmeal/50 p-3 rounded-xl font-bold text-sm text-morandi-charcoal border border-slate-200 flex items-center justify-between cursor-pointer hover:border-morandi-blue transition-all">
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
                     <div className="space-y-2">{(customerForm.priceList || []).map((pl, idx) => { const p = products.find(prod => prod.id === pl.productId); return (<div key={idx} className="flex justify-between items-center bg-white p-3 rounded-xl shadow-sm border border-slate-100"><span className="text-sm font-bold text-slate-700 tracking-wide">{p?.name || pl.productId}</span><div className="flex items-center gap-3"><div className="flex items-center gap-1"><span className="font-black text-amber-500">$</span><input type="number" min="0" className="w-16 bg-transparent font-black text-amber-500 tracking-tight outline-none border-b border-transparent hover:border-amber-200 focus:border-amber-500 text-right" value={pl.price} onChange={(e) => { const val = e.target.value; if (val === '' || (!isNaN(Number(val)) && Number(val) >= 0)) { const newPriceList = [...(customerForm.priceList || [])]; newPriceList[idx].price = Number(val); setCustomerForm({...customerForm, priceList: newPriceList}); } }} /><span className="text-xs text-gray-400 font-bold">/ {pl.unit || '斤'}</span></div><button onClick={() => setCustomerForm({...customerForm, priceList: customerForm.priceList?.filter((_, i) => i !== idx)})} className="text-gray-300 hover:text-rose-400"><X className="w-4 h-4" /></button></div></div>); })}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 進階設定區塊 */}
            {(editCustomerMode === 'full' || editCustomerMode === 'holidayOnly') && (
            <div className="mt-8 pt-6 border-t border-gray-100">
              {editCustomerMode === 'full' && (
              <button
                type="button"
                onClick={() => setShowAdvancedCustomerSettings(!showAdvancedCustomerSettings)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gray-50 hover:bg-gray-100 rounded-2xl transition-colors text-sm font-bold text-gray-500"
              >
                {showAdvancedCustomerSettings ? '收起進階設定' : '展開進階設定'}
                <ChevronDown className={`w-4 h-4 transition-transform ${showAdvancedCustomerSettings ? 'rotate-180' : ''}`} />
              </button>
              )}

              <AnimatePresence>
                {(showAdvancedCustomerSettings || editCustomerMode === 'holidayOnly') && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {editCustomerMode === 'full' && (
                      <div className="space-y-4">
                        <div className="p-4 bg-slate-50 rounded-[20px] border border-slate-100 space-y-3">
                          <label className="text-[10px] font-bold text-gray-400 pl-1">座標設定</label>
                          <div>
                            <input type="text" className="w-full p-4 bg-white rounded-[16px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="例如: 25.033964, 121.564468" value={customerForm.coordinates || ''} onChange={(e) => setCustomerForm({...customerForm, coordinates: e.target.value})} />
                            <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed flex items-start gap-1">
                              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              💡 提示：在 Google 地圖上對著地點按右鍵，即可點擊複製座標。
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                          <div>
                            <label className="font-bold text-slate-700 block text-sm">自動產生預設訂單</label>
                            <span className="text-xs text-gray-400">每日半夜自動依據預設品項建立當日訂單</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setCustomerForm({ ...customerForm, autoOrderEnabled: !customerForm.autoOrderEnabled })}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              customerForm.autoOrderEnabled ? 'bg-emerald-500' : 'bg-gray-200'
                            }`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              customerForm.autoOrderEnabled ? 'translate-x-6' : 'translate-x-1'
                            }`} />
                          </button>
                        </div>
                      </div>
                      )}

                      <div className="space-y-4">
                        <div className="space-y-1"><label className="text-[10px] font-bold text-gray-400 pl-1">每週公休</label><div className="flex gap-2">{WEEKDAYS.map(d => { const isOff = (customerForm.offDays || []).includes(d.value); return (<button key={d.value} onClick={() => { const current = customerForm.offDays || []; const newOff = isOff ? current.filter(x => x !== d.value) : [...current, d.value]; setCustomerForm({...customerForm, offDays: newOff}); }} className={`w-10 h-10 rounded-xl font-bold text-xs transition-all ${isOff ? 'bg-rose-500 text-white shadow-md' : 'bg-white text-gray-400 border border-slate-200'}`}>{d.label}</button>); })}</div></div>
                        <div className="space-y-1"><label className="text-[10px] font-bold text-gray-400 pl-1">特定公休</label><div className="flex flex-wrap gap-2">{getUpcomingHolidays(customerForm.offDays || [], customerForm.holidayDates || []).map(date => { const isWeeklyOff = isDateInOffDays(date, customerForm.offDays || []); return (<span key={date} className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border ${isWeeklyOff ? 'bg-gray-100 text-gray-500 border-gray-200' : 'bg-rose-50 text-rose-500 border-rose-100'}`}>{date}{isWeeklyOff ? <span className="text-[10px] ml-1">(每週公休)</span> : <button onClick={() => setCustomerForm({...customerForm, holidayDates: customerForm.holidayDates?.filter(d => d !== date)})}><X className="w-3 h-3" /></button>}</span>); })}<button onClick={() => setHolidayEditorId('new')} className="bg-gray-50 text-gray-400 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-gray-100 border border-slate-200"><Plus className="w-3 h-3" /> 新增日期</button></div></div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            )}
          </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {holidayEditorId && (<HolidayCalendar storeName={isEditingCustomer ? (customerForm.name || '') : ''} holidays={customerForm.holidayDates || []} offDays={customerForm.offDays || []} onToggle={(date) => { setCustomerForm(prev => { const current = prev.holidayDates || []; const newHolidays = current.includes(date) ? current.filter(d => d !== date) : [...current, date]; return {...prev, holidayDates: newHolidays}; }); }} onClose={() => setHolidayEditorId(null)} />)}

      <AnimatePresence>
        {directHolidayCustomer && (
          <HolidayCalendar
            storeName={directHolidayCustomer.name}
            holidays={directHolidayCustomer.holidayDates || []}
            offDays={directHolidayCustomer.offDays || []}
            onToggle={(date) => {
              setDirectHolidayCustomer(prev => {
                if (!prev) return prev;
                const current = prev.holidayDates || [];
                const newHolidays = current.includes(date) 
                  ? current.filter(d => d !== date) 
                  : [...current, date];
                return { ...prev, holidayDates: newHolidays };
              });
            }}
            onClose={async () => {
              // 記住原本的狀態，以備失敗時還原
              const originalCustomer = customers.find(c => c.id === directHolidayCustomer?.id);
              if (!directHolidayCustomer) return;
              const updatedCustomer = { ...directHolidayCustomer, lastUpdated: Date.now() };
              
              // 1. 樂觀更新畫面
              setCustomers(prev => prev.map(c => c.id === directHolidayCustomer.id ? updatedCustomer : c));
              setDirectHolidayCustomer(null);
              
              if (apiEndpoint && originalCustomer) {
                try {
                  // 2. 補上 originalLastUpdated 與強制覆蓋屬性
                  const payload = { 
                    ...updatedCustomer, 
                    originalLastUpdated: originalCustomer.lastUpdated, 
                    force: true
                  };
                  const res = await fetchWithRetry(apiEndpoint, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'updateCustomer', data: payload })
                  });
                  const json = await res.json();
                  
                  if (!json.success) {
                    console.error("公休儲存失敗:", json);
                    setCustomers(prev => prev.map(c => c.id === originalCustomer.id ? originalCustomer : c));
                    addToast("公休儲存失敗，請重新整理後再試", "error");
                  } else {
                    const newVersion = json.data?.lastUpdated || payload.lastUpdated;
                    setCustomers(prev => prev.map(c => c.id === originalCustomer.id ? { ...updatedCustomer, lastUpdated: newVersion } : c));
                  }
                } catch (e) {
                  console.error("公休儲存失敗", e);
                  setCustomers(prev => prev.map(c => c.id === originalCustomer.id ? originalCustomer : c));
                  addToast("網路連線異常，公休儲存失敗", "error");
                }
              }
            }}
          />
        )}
      </AnimatePresence>

      <ProductPicker isOpen={pickerConfig.isOpen} onClose={() => setPickerConfig({ ...pickerConfig, isOpen: false })} onSelect={(id) => { pickerConfig.onSelect(id); setPickerConfig({ ...pickerConfig, isOpen: false }); }} products={products} currentProductId={pickerConfig.currentProductId} customPrices={pickerConfig.customPrices || []} />
      </>, document.body)}
    </>
  );
};
