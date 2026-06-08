import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Users, Plus, MapPin, History, Edit2, Trash2 } from 'lucide-react';
import { Customer, Product, Order } from '../types';
import { WEEKDAYS, ORDERING_HABITS } from '../constants';
import { formatTimeDisplay, formatTimeForInput } from '../utils';
import { DebouncedSearchInput } from '../components/DebouncedSearchInput';

interface CustomersViewProps {
  customers: Customer[];
  products: Product[];
  groupedOrders: { [key: string]: Order[] };
  requireAuth: (callback: () => void) => void;
  setCustomerForm: (form: any) => void;
  setIsEditingCustomer: (id: string | 'new') => void;
  setEditCustomerMode: (mode: 'full' | 'itemsOnly' | 'holidayOnly') => void;
  setTempPriceProdId: (id: string) => void;
  setTempPriceValue: (val: string) => void;
  setTempPriceUnit: (unit: string) => void;
  setViewingCustomerProfile: (name: string) => void;
  handleDeleteCustomer: (id: string) => void;
}

const buttonTap = { scale: 0.95 };
const buttonHover = { scale: 1.05 };

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } }
};
const itemVariants = {
  hidden: { opacity: 0, scale: 0.98, y: 10 },
  show: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

export const CustomersView: React.FC<CustomersViewProps> = ({
  customers,
  products,
  groupedOrders,
  requireAuth,
  setCustomerForm,
  setIsEditingCustomer,
  setEditCustomerMode,
  setTempPriceProdId,
  setTempPriceValue,
  setTempPriceUnit,
  setViewingCustomerProfile,
  handleDeleteCustomer
}) => {
  const [customerSearch, setCustomerSearch] = useState('');
  const [visibleCustomerCount, setVisibleCustomerCount] = useState(50);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    const term = customerSearch.toLowerCase();
    return customers.filter(c => String(c.name || '').toLowerCase().includes(term) || String(c.phone || '').includes(term));
  }, [customers, customerSearch]);

  return (
    <motion.div key="customers" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0, zIndex: 10 }} exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }} transition={{ duration: 0.2 }} className="relative">
      <div className="sticky top-0 z-20 bg-morandi-oatmeal pt-4 pb-4 -mx-4 px-4 shadow-sm border-b border-slate-100">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-xl font-extrabold text-morandi-charcoal flex items-center gap-2 tracking-tight">
            <Users className="w-5 h-5 text-morandi-blue" /> 店家管理
          </h2>
          <motion.button 
            whileTap={buttonTap} 
            whileHover={buttonHover} 
            onClick={() => requireAuth(() => { 
              setCustomerForm({ name: '', phone: '', address: '', coordinates: '', deliveryTime: '08:00', defaultTrip: '', defaultItems: [], offDays: [], holidayDates: [], priceList: [], deliveryMethod: '', paymentTerm: 'regular' }); 
              setIsEditingCustomer('new'); 
              setEditCustomerMode('full'); 
              setTempPriceProdId(''); 
              setTempPriceValue(''); 
              setTempPriceUnit('斤'); 
            })} 
            className="p-3 rounded-2xl text-white shadow-lg bg-morandi-blue hover:bg-slate-600 transition-colors"
          >
            <Plus className="w-6 h-6" />
          </motion.button>
        </div>
        <DebouncedSearchInput
          value={customerSearch}
          onSearch={(val) => {
            setCustomerSearch(val);
            setVisibleCustomerCount(50);
          }}
          placeholder="搜尋店家名稱..."
          className="w-full"
          inputClassName="w-full pl-10 pr-10 py-2.5 bg-white rounded-xl border border-slate-200 shadow-sm text-sm text-morandi-charcoal font-bold tracking-wide focus:ring-2 focus:ring-morandi-blue transition-all placeholder:text-gray-400"
        />
      </div>
      <motion.div variants={containerVariants} initial="hidden" animate="show" className="pt-4">
      {filteredCustomers.slice(0, visibleCustomerCount).map(c => {
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
                 <motion.button whileTap={buttonTap} onClick={() => requireAuth(() => { setCustomerForm({ ...c, address: c.address || '', coordinates: c.coordinates || '', deliveryTime: formatTimeForInput(c.deliveryTime), paymentTerm: c.paymentTerm || 'regular', defaultTrip: c.defaultTrip || '' }); setIsEditingCustomer(c.id); setEditCustomerMode('full'); setTempPriceProdId(''); setTempPriceValue(''); setTempPriceUnit('斤'); })} className="flex-1 py-3 bg-gray-50 rounded-2xl text-slate-700 font-bold text-xs flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors border border-gray-100"><Edit2 className="w-3.5 h-3.5" /></motion.button>
                 <motion.button whileTap={buttonTap} onClick={() => requireAuth(() => handleDeleteCustomer(c.id))} className="px-4 py-3 bg-gray-50 rounded-2xl text-morandi-pink hover:text-rose-500 transition-colors border border-gray-100"><Trash2 className="w-4 h-4" /></motion.button>
              </div>
            </motion.div>
         );
      })}
      </motion.div>
      {filteredCustomers.length > visibleCustomerCount && (
        <div className="flex justify-center mt-4 mb-8">
          <button 
            onClick={() => setVisibleCustomerCount(prev => prev + 50)} 
            className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-full text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors"
          >
            載入更多 ({filteredCustomers.length - visibleCustomerCount})
          </button>
        </div>
      )}
      {filteredCustomers.length === 0 && <div className="text-center py-10 text-gray-300 text-sm font-bold tracking-wide">查無店家</div>}
     </motion.div>
  );
};
