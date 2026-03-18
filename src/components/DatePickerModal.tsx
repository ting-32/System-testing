import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { modalVariants } from './animations';
import { WEEKDAYS } from '../constants';
import { formatDateStr } from '../utils';

export const DatePickerModal: React.FC<{ 
  selectedDate: string; 
  onSelect: (date: string) => void; 
  onClose: () => void;
  offDays?: number[];
  holidayDates?: string[];
}> = ({ selectedDate, onSelect, onClose, offDays = [], holidayDates = [] }) => {
  const parseLocalDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const [viewDate, setViewDate] = useState(parseLocalDate(selectedDate));
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
    <div className="fixed inset-0 bg-morandi-charcoal/40 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-sm">
      <motion.div variants={modalVariants} initial="hidden" animate="visible" exit="exit" className="bg-white w-full max-w-sm rounded-t-[32px] sm:rounded-[32px] overflow-hidden shadow-xl">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-morandi-oatmeal/30">
          <h3 className="font-extrabold text-morandi-charcoal text-lg tracking-tight">選擇配送日期</h3>
          <button onClick={onClose} className="p-2 bg-white rounded-2xl shadow-sm border border-slate-100">
            <X className="w-5 h-5 text-morandi-pebble" />
          </button>
        </div>
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} className="p-2 bg-morandi-oatmeal rounded-xl">
              <ChevronLeft className="w-6 h-6 text-morandi-pebble" />
            </button>
            <h4 className="font-bold text-morandi-charcoal">{viewDate.getFullYear()}年 {viewDate.getMonth() + 1}月</h4>
            <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} className="p-2 bg-morandi-oatmeal rounded-xl">
              <ChevronRight className="w-6 h-6 text-morandi-pebble" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-2 text-center">
            {WEEKDAYS.map(d => (
              <div key={d.value} className="text-[10px] font-bold text-morandi-pebble uppercase py-2">{d.label}</div>
            ))}
            {calendarDays.map((item, idx) => {
              const isSelected = item.dateStr === selectedDate;
              let isHoliday = false;
              if (item.dateStr) {
                const dateObj = new Date(item.dateStr);
                const dayOfWeek = dateObj.getDay();
                isHoliday = offDays.includes(dayOfWeek) || holidayDates.includes(item.dateStr);
              }
              return (
                <motion.div 
                  key={idx} 
                  whileTap={{ scale: 0.8 }} 
                  onClick={() => item.dateStr && (onSelect(item.dateStr), onClose())} 
                  className={`aspect-square flex flex-col items-center justify-center text-sm font-medium rounded-xl cursor-pointer transition-all border ${!item.day ? 'opacity-0 pointer-events-none' : 'hover:bg-morandi-oatmeal'} ${isSelected ? 'bg-morandi-blue text-white font-bold shadow-md' : isHoliday ? 'bg-rose-50 text-rose-400 border-rose-100' : 'bg-white border-transparent text-morandi-charcoal'}`}
                >
                  <span>{item.day}</span>
                  {isHoliday && <span className="text-[8px] font-bold mt-0.5">公休</span>}
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
