import { useState, useMemo } from 'react';
import { Customer } from '../types';
import { formatDateStr, isDateInOffDays } from '../utils';

export interface PredictionResult {
  greenZone: Customer[];
  grayZone: (Customer & { skipReason: string })[];
}

export const useAutoOrderPrediction = (customers: Customer[]) => {
  const [previewDate, setPreviewDate] = useState<Date>(() => {
    const now = new Date();
    if (now.getHours() >= 12) {
      // After 12 PM, default to tomorrow
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }
    // Before 12 PM, default to today
    return now;
  });

  const prediction = useMemo<PredictionResult>(() => {
    const targetDateStr = formatDateStr(previewDate);

    const greenZone: Customer[] = [];
    const grayZone: (Customer & { skipReason: string })[] = [];

    customers.forEach(customer => {
      const isAutoDisabled = !customer.autoOrderEnabled;
      const isWeeklyOff = isDateInOffDays(targetDateStr, customer.offDays || []);
      const isSpecificHoliday = (customer.holidayDates || []).includes(targetDateStr);

      if (isAutoDisabled || isWeeklyOff || isSpecificHoliday) {
        let reason = '';
        if (isSpecificHoliday) reason = '特定公休';
        else if (isWeeklyOff) reason = '每週公休';
        else if (isAutoDisabled) reason = '手動暫停';

        grayZone.push({ ...customer, skipReason: reason });
      } else {
        greenZone.push(customer);
      }
    });

    return { greenZone, grayZone };
  }, [customers, previewDate]);

  return { previewDate, setPreviewDate, prediction };
};
