import { OrderStatus } from './types';

export const getStatusStyles = (status: OrderStatus) => {
  switch (status) {
    case OrderStatus.PAID:
      return {
        cardBg: '#E8F0EB', // 淺豆沙綠 (Light Sage)
        cardBorder: '#CZDCD4',
        tagBg: '#BCCFC6',
        tagText: '#4A6356',
        iconColor: '#4A6356',
        label: '已收款'
      };
    case OrderStatus.SHIPPED:
      return {
        cardBg: '#F7F3E8', // 淺米杏色 (Light Beige/Latte)
        cardBorder: '#EADBC8',
        tagBg: '#E0C9A6', 
        tagText: '#8D7B68',
        iconColor: '#8D7B68',
        label: '已出貨'
      };
    case OrderStatus.PENDING:
    default:
      return {
        cardBg: '#FFFFFF', // 純白 (White)
        cardBorder: '#F1F5F9', // Slate-100
        tagBg: '#F1F5F9', // Slate-100
        tagText: '#94A3B8', // Slate-400
        iconColor: '#CBD5E1',
        label: '待處理'
      };
  }
};

export const normalizeDate = (dateStr: any) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch (e) {
    return String(dateStr);
  }
};

export const formatDateStr = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const getTomorrowDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return formatDateStr(d);
};

export const getLastMonthEndDate = () => {
  const date = new Date();
  date.setDate(0); 
  return formatDateStr(date);
};

export const safeJsonArray = (val: any) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '' || trimmed === '""') return [];
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn("JSON Parse error for value:", val);
      return [];
    }
  }
  return [];
};

export const formatTimeDisplay = (time: any) => {
  if (!time) return '未設定';
  const date = new Date(time);
  if (!isNaN(date.getTime()) && String(time).includes('-')) {
    const h = date.getHours();
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  const str = String(time).trim();
  const parts = str.split(':');
  if (parts.length >= 2) {
    const h = parseInt(parts[0], 10);
    if (!isNaN(h) && h >= 0 && h < 24) {
       const m = parts[1].substring(0, 2);
       return `${h}:${m}`;
    }
  }
  return str;
};

export const formatTimeForInput = (time: any) => {
  if (!time) return '08:00';
  const date = new Date(time);
  if (!isNaN(date.getTime()) && String(time).includes('-')) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  const str = String(time).trim();
  const parts = str.split(':');
  if (parts.length >= 2) {
    let h = parseInt(parts[0], 10);
    if (!isNaN(h) && h >= 0 && h < 24) {
       const m = parts[1].substring(0, 2);
       return `${String(h).padStart(2, '0')}:${m}`;
    }
  }
  return '08:00';
};
