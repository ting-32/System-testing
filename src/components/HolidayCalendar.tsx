import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { WEEKDAYS } from '../constants';
import { formatDateStr } from '../utils';
import { buttonTap } from './animations';

export const HolidayCalendar: React.FC<{ holidays: string[]; onToggle: (dateStr: string) => void; onClose: () => void; storeName: string; }> = ({ holidays, onToggle, onClose, storeName }) => {
  const [viewDate, setViewDate] = useState(new Date());
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

  return (
    <div className="fixed inset-0 bg-morandi-charcoal/40 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: "spring", duration: 0.3 }} className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-xl border border-slate-200">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-morandi-oatmeal/30">
          <div>
            <h3 className="font-extrabold text-morandi-charcoal text-lg tracking-tight">{storeName}</h3>
            <p className="text-[10px] text-morandi-pebble font-bold uppercase tracking-widest mt-0.5">特定公休日編輯</p>
          </div>
          <button onClick={onClose} className="p-2 bg-white rounded-2xl shadow-sm border border-slate-100 text-morandi-pebble hover:text-morandi-charcoal"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} className="p-2 bg-morandi-oatmeal rounded-xl"><ChevronLeft className="w-6 h-6 text-morandi-pebble" /></button>
            <h4 className="font-bold text-morandi-charcoal">{viewDate.getFullYear()}年 {viewDate.getMonth() + 1}月</h4>
            <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} className="p-2 bg-morandi-oatmeal rounded-xl"><ChevronRight className="w-6 h-6 text-morandi-pebble" /></button>
          </div>
          <div className="grid grid-cols-7 gap-2 text-center">
            {WEEKDAYS.map(d => (<div key={d.value} className="text-[10px] font-bold text-morandi-pebble uppercase py-2">{d.label}</div>))}
            {calendarDays.map((item, idx) => {
              const isHoliday = item.dateStr && holidays.includes(item.dateStr);
              return (
                <motion.div key={idx} whileTap={{ scale: 0.8 }} onClick={() => item.dateStr && onToggle(item.dateStr)} className={`aspect-square flex items-center justify-center text-sm font-medium rounded-xl cursor-pointer transition-colors border ${!item.day ? 'opacity-0 pointer-events-none' : ''} ${isHoliday ? 'bg-rose-50 border-rose-200 text-rose-500 font-bold' : 'bg-white border-transparent text-morandi-charcoal hover:bg-morandi-oatmeal'}`}>
                  {item.day}
                </motion.div>
              );
            })}
          </div>
        </div>
        <div className="p-6 bg-morandi-oatmeal/30 flex justify-end">
          <motion.button whileTap={buttonTap} onClick={onClose} className="px-8 py-3 rounded-[16px] bg-morandi-blue text-white font-bold shadow-lg tracking-wide">完成設定</motion.button>
        </div>
      </motion.div>
    </div>
  );
};
