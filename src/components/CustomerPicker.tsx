import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, CheckCircle2, Store } from 'lucide-react';
import { Customer, Order } from '../types';
import { ORDERING_HABITS } from '../constants';
import { formatTimeDisplay } from '../utils';

export const CustomerPicker: React.FC<{ isOpen: boolean; onClose: () => void; onSelect: (customerId: string) => void; customers: Customer[]; selectedDate: string; currentSelectedId?: string; orders: Order[]; }> = ({ isOpen, onClose, onSelect, customers, selectedDate, currentSelectedId, orders }) => {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'regular' | 'occasional' | 'adhoc'>('regular');

  const orderedCustomerNames = useMemo(() => {
    return new Set(
      orders
        .filter(o => o.deliveryDate === selectedDate)
        .map(o => o.customerName)
    );
  }, [orders, selectedDate]);

  const filteredList = useMemo(() => {
    return customers.filter(c => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      const habit = c.paymentTerm || 'daily';
      let isRegular = habit === 'regular' || habit === 'daily';
      let isOccasional = habit === 'occasional' || habit === 'weekly';
      let isAdhoc = habit === 'adhoc' || habit === 'monthly';
      if (activeTab === 'regular') {
        if (!isRegular) return false;
        const dateObj = new Date(selectedDate);
        const dayOfWeek = dateObj.getDay();
        const isWeeklyOff = (c.offDays || []).includes(dayOfWeek);
        const isHoliday = (c.holidayDates || []).includes(selectedDate);
        return !isWeeklyOff && !isHoliday;
      } else if (activeTab === 'occasional') {
        return isOccasional;
      } else {
        return isAdhoc;
      }
    });
  }, [customers, search, activeTab, selectedDate]);

  useEffect(() => {
    if (isOpen) setSearch('');
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-morandi-charcoal/40 z-[130] flex flex-col justify-end sm:justify-center backdrop-blur-sm">
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="bg-white w-full sm:max-w-md sm:mx-auto h-[85vh] sm:h-[80vh] rounded-t-[32px] sm:rounded-[32px] shadow-2xl flex flex-col overflow-hidden">
            <div className="p-5 bg-white border-b border-gray-100 shrink-0 sticky top-0 z-20">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-extrabold text-morandi-charcoal text-lg tracking-tight">選擇配送店家</h3>
                <button onClick={onClose} className="p-2 rounded-2xl bg-gray-50 text-morandi-pebble"><X className="w-5 h-5" /></button>
              </div>
              <div className="relative mb-4">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input autoFocus type="text" placeholder="搜尋店家..." className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-[16px] text-sm font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue/50 transition-all placeholder:text-gray-300" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar -mx-2 px-2">
                {ORDERING_HABITS.map(habit => {
                  const isActive = (habit.value === 'regular' && activeTab === 'regular') || (habit.value === 'occasional' && activeTab === 'occasional') || (habit.value === 'adhoc' && activeTab === 'adhoc');
                  return (
                    <button key={habit.value} onClick={() => setActiveTab(habit.value as any)} className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5 ${isActive ? 'border-transparent shadow-sm' : 'bg-white text-gray-400 border-gray-200'}`} style={{ backgroundColor: isActive ? habit.bgColor : '', color: isActive ? '#3E3C3A' : '' }}>
                      <span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: habit.color }}></span>
                      {habit.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-morandi-oatmeal/20">
              <div className="grid grid-cols-1 gap-3">
                {filteredList.map(c => {
                  const isSelected = c.id === currentSelectedId;
                  const hasOrder = orderedCustomerNames.has(c.name);
                  return (
                    <motion.button key={c.id} whileTap={{ scale: 0.98 }} onClick={() => { onSelect(c.id); onClose(); }} className={`p-4 rounded-[20px] border flex items-center justify-between gap-4 transition-all shadow-sm ${isSelected ? 'bg-white ring-2 ring-morandi-blue border-morandi-blue' : hasOrder ? 'bg-gray-50/80 border-amber-200/50 hover:bg-white' : 'bg-white border-transparent hover:border-slate-200'}`}>
                      <div className="text-left flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className={`font-bold text-sm tracking-wide ${hasOrder ? 'text-slate-600' : 'text-slate-800'}`}>{c.name}</h4>
                          {hasOrder && <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-bold border border-amber-200">已建立</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{formatTimeDisplay(c.deliveryTime)}</span>
                          {c.deliveryMethod && <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{c.deliveryMethod}</span>}
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 className="w-5 h-5 text-morandi-blue" />}
                    </motion.button>
                  );
                })}
              </div>
              {filteredList.length === 0 && (
                <div className="py-20 text-center">
                  <Store className="w-12 h-12 text-gray-200 mx-auto mb-2" />
                  <p className="text-gray-400 font-bold text-sm">此分類無符合店家</p>
                  {activeTab === 'regular' && <p className="text-[10px] text-gray-300 mt-1">預訂店家僅顯示今日營業中</p>}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
