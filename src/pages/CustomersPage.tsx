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

      {/* Customer Form Modal logic has been moved to GlobalModals */}

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
