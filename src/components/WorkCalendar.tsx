import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Order } from '../types';
import { WEEKDAYS } from '../constants';
import { formatDateStr, getTomorrowDate } from '../utils';

export const WorkCalendar: React.FC<{ selectedDate: string | string[]; onSelect: (date: any) => void; orders: Order[]; }> = ({ selectedDate, onSelect, orders }) => {
  const isMulti = Array.isArray(selectedDate);
  const baseDateStr = isMulti ? (selectedDate[0] || getTomorrowDate()) : (selectedDate as string);
  const parseLocalDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const [viewDate, setViewDate] = useState(parseLocalDate(baseDateStr));
  const datesWithOrders = useMemo(() => {
    const set = new Set(orders.map(o => o.deliveryDate));
    return set;
  }, [orders]);
  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const days = [];
    const totalDays = daysInMonth(year, month);
    const startOffset = firstDayOfMonth(year, month);
    for (let i = 0; i < startOffset; i++) days.push({ day: null });
    for (let i = 1; i <= totalDays; i++) {
      const date = new Date(year, month, i);
      days.push({ day: i, dateStr: formatDateStr(date) });
    }
    return days;
  }, [viewDate]);

  const handleDateClick = (dateStr: string) => {
    if (isMulti) {
      const current = selectedDate as string[];
      if (current.includes(dateStr)) {
        onSelect(current.filter(d => d !== dateStr));
      } else {
        onSelect([...current, dateStr].sort());
      }
    } else {
      onSelect(dateStr);
    }
  };

  return (
    <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-200">
      <div className="flex justify-between items-center mb-4">
        <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} className="p-2 bg-morandi-oatmeal rounded-xl"><ChevronLeft className="w-5 h-5 text-morandi-pebble" /></button>
        <h4 className="font-bold text-morandi-charcoal text-sm tracking-wide">{viewDate.getFullYear()}年 {viewDate.getMonth() + 1}月</h4>
        <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} className="p-2 bg-morandi-oatmeal rounded-xl"><ChevronRight className="w-5 h-5 text-morandi-pebble" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map(d => (<div key={d.value} className="text-[10px] font-bold text-morandi-pebble uppercase py-2">{d.label}</div>))}
        {calendarDays.map((item, idx) => {
          const isSelected = isMulti ? (selectedDate as string[]).includes(item.dateStr || '') : item.dateStr === selectedDate;
          const hasOrder = item.dateStr && datesWithOrders.has(item.dateStr);
          return (
            <motion.div key={idx} whileTap={{ scale: 0.9 }} onClick={() => item.dateStr && handleDateClick(item.dateStr)} className={`aspect-square flex flex-col items-center justify-center text-sm font-medium rounded-xl cursor-pointer transition-colors border relative ${!item.day ? 'opacity-0 pointer-events-none' : 'hover:bg-morandi-oatmeal'} ${isSelected ? 'bg-morandi-blue text-white font-bold shadow-md' : 'bg-white border-transparent text-morandi-charcoal'}`}>
              <span className="z-10">{item.day}</span>
              {hasOrder && !isSelected && (<span className="w-1 h-1 rounded-full bg-amber-400 absolute bottom-2"></span>)}
              {hasOrder && isSelected && (<span className="w-1 h-1 rounded-full bg-white/60 absolute bottom-2"></span>)}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
