import { OrderStatus } from './types';

export const getStatusStyles = (status: OrderStatus) => {
  switch (status) {
    case OrderStatus.PAID:
      return {
        cardBg: '#E8F0EB', // 淺豆沙綠 (Light Sage)
        cardBorder: '#C2DCD4',
        tagBg: '#BCCFC6',
        tagText: '#4A6356',
        iconColor: '#4A6356',
        label: '已收款'
      };
    case OrderStatus.PAID_UNSHIPPED:
      return {
        cardBg: '#F0FDFA', // 淺青色底 (Teal/Cyan Tint)
        cardBorder: '#99F6E4', // Teal-200
        tagBg: '#CCFBF1', // Teal-100
        tagText: '#0F766E', // Teal-700
        iconColor: '#0D9488', // Teal-600
        label: '已收未配'
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

export const normalizeDate = (dateStr: any, fallbackToToday = true) => {
  if (!dateStr && !fallbackToToday) return '';
  if (!dateStr) return getSmartDefaultDate();
  
  if (typeof dateStr === 'string') {
    let str = dateStr.trim().split(' ')[0].replace(/\./g, '-'); // remove time or (三)
    // Extract padded Y-M-D
    let match = str.match(/(?:(\d{2,4})[\/\-])?(\d{1,2})[\/\-日](\d{1,2})/);
    if (match) {
      let y = match[1] ? match[1] : new Date().getFullYear().toString();
      if (y.length === 2) y = "20" + y; // 26 -> 2026
      if (y.length === 3 && parseInt(y) < 1900) y = String(parseInt(y) + 1911); // 115 -> 2026
      // specifically handle stupid JS 2001 default for short dates
      if (parseInt(y) < 2010 && parseInt(y) > 1920) y = new Date().getFullYear().toString(); 
      let m = match[2].padStart(2, '0');
      let day = match[3].padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }

  try {
    let d = new Date(dateStr);
    
    if (isNaN(d.getTime()) && typeof dateStr === 'string') {
       const cleaned = dateStr.replace(/\//g, '-').split(' ')[0];
       d = new Date(cleaned);
    }
    
    if (isNaN(d.getTime())) {
      if (process.env.NODE_ENV === 'development') {
          console.warn(`[Data Sanitization] Invalid date encountered: "${dateStr}".`);
      }
      return fallbackToToday ? getSmartDefaultDate() : '';
    }
    
    let y = d.getFullYear();
    if (y < 2010 && typeof dateStr === 'string' && /^\d{1,2}[\/\-]\d{1,2}$/.test(dateStr.trim())) {
        y = new Date().getFullYear();
    }
    
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
         console.warn(`[Data Sanitization] Invalid date encountered: "${dateStr}".`);
    }
    return fallbackToToday ? getSmartDefaultDate() : '';
  }
};

export const safeNumber = (val: any, fallback = 0, contextInfo = ''): number => {
  if (val === null || val === undefined || val === '') return fallback;
  const num = Number(val);
  if (isNaN(num)) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[Data Sanitization] Invalid number in ${contextInfo}: "${val}". Falling back to ${fallback}.`);
    }
    return fallback;
  }
  return num;
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

export const getUpcomingHolidays = (offDays: number[], specificHolidays: string[]) => {
  const upcoming = new Set([...specificHolidays]);
  const today = new Date();
  
  for (let i = 0; i < 30; i++) {
    const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
    if (offDays.includes(d.getDay())) {
      const dateStr = formatDateStr(d);
      upcoming.add(dateStr);
    }
  }
  
  return Array.from(upcoming).sort();
};

export const isDateInOffDays = (dateStr: string, offDays: number[]) => {
  const d = new Date(dateStr);
  return offDays.includes(d.getDay());
};

export const getSmartDefaultDate = (): string => {
  const now = new Date();
  const taipeiTimeStr = now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' });
  const taipeiDate = new Date(taipeiTimeStr);

  if (taipeiDate.getHours() >= 12) {
    taipeiDate.setDate(taipeiDate.getDate() + 1);
  }

  const yyyy = taipeiDate.getFullYear();
  const mm = String(taipeiDate.getMonth() + 1).padStart(2, '0');
  const dd = String(taipeiDate.getDate()).padStart(2, '0');
  
  return `${yyyy}-${mm}-${dd}`;
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
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      // Fallback: if not valid JSON, try to split by comma
      if (trimmed.includes(',')) {
        return trimmed.split(',').map(s => s.trim()).filter(Boolean);
      }
      return [trimmed];
    }
  }
  return [];
};

export const formatTimeDisplay = (time: any) => {
  if (!time) return '未設定';
  const str = String(time).trim();
  if (str.includes('T') || (str.includes('-') && str.includes(':'))) {
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      const h = date.getHours();
      const m = String(date.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    }
  }
  const cleanStr = str.replace(/：/g, ':');
  const parts = cleanStr.split(':');
  if (parts.length >= 2) {
    const h = parseInt(parts[0].replace(/[^\d]/g, ''), 10);
    const mStr = parts[1].replace(/[^\d]/g, '').substring(0, 2);
    const m = parseInt(mStr, 10);
    if (!isNaN(h) && h >= 0 && h < 24 && !isNaN(m) && m >= 0 && m < 60) {
       return `${h}:${String(m).padStart(2, '0')}`;
    }
  }
  return str;
};

export const formatTimeForInput = (time: any) => {
  if (!time) return '08:00';
  const str = String(time).trim();
  if (str.includes('T') || (str.includes('-') && str.includes(':'))) {
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      const h = String(date.getHours()).padStart(2, '0');
      const m = String(date.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    }
  }
  const cleanStr = str.replace(/：/g, ':');
  const parts = cleanStr.split(':');
  if (parts.length >= 2) {
    let h = parseInt(parts[0].replace(/[^\d]/g, ''), 10);
    const mStr = parts[1].replace(/[^\d]/g, '').substring(0, 2);
    let m = parseInt(mStr, 10);
    if (!isNaN(h) && h >= 0 && h < 24 && !isNaN(m) && m >= 0 && m < 60) {
       return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }
  return '08:00';
};

/**
 * 處理 LINE 傳入或外部來源訂單時的自動趟數與時間增強邏輯 (Fallback Auto-fill)
 */
export const enhanceOrderWithCustomerDefaults = <T extends Partial<import('./types').Order>>(
  rawOrder: T, 
  customerMap: Record<string, import('./types').Customer> | Map<string, import('./types').Customer>
): T => {
  const customerName = rawOrder.customerName || '';
  const customer = customerMap instanceof Map ? customerMap.get(customerName) : customerMap[customerName];
  
  // 趟數自動填補：若訂單本身沒帶 trip 或為空白，自動取店家預設 defaultTrip
  const hasExplicitTrip = rawOrder.trip && String(rawOrder.trip).trim() !== '';
  const effectiveTrip = hasExplicitTrip 
    ? String(rawOrder.trip).trim() 
    : (customer?.defaultTrip && customer.defaultTrip.trim() !== '' ? customer.defaultTrip.trim() : (rawOrder.trip || ''));

  const isTripAutoFilled = !hasExplicitTrip && !!customer?.defaultTrip && customer.defaultTrip.trim() !== '';

  // 配送時間自動填補
  const hasExplicitTime = rawOrder.deliveryTime && String(rawOrder.deliveryTime).trim() !== '';
  const effectiveTime = hasExplicitTime
    ? String(rawOrder.deliveryTime).trim()
    : (customer?.deliveryTime && customer.deliveryTime.trim() !== '' ? customer.deliveryTime.trim() : (rawOrder.deliveryTime || ''));

  const isTimeAutoFilled = !hasExplicitTime && !!customer?.deliveryTime && customer.deliveryTime.trim() !== '';

  // 配送方式自動填補
  const effectiveMethod = (rawOrder.deliveryMethod && String(rawOrder.deliveryMethod).trim() !== '')
    ? rawOrder.deliveryMethod
    : (customer?.deliveryMethod || rawOrder.deliveryMethod || '');

  return {
    ...rawOrder,
    trip: effectiveTrip,
    deliveryTime: effectiveTime,
    deliveryMethod: effectiveMethod,
    isTripAutoFilled: rawOrder.isTripAutoFilled ?? isTripAutoFilled,
    isTimeAutoFilled: rawOrder.isTimeAutoFilled ?? isTimeAutoFilled
  };
};

/**
 * 計算訂單的有效配送分鐘數（用於精確排序：例如 9:05 -> 545, 09:15 -> 555）
 * 優先取用訂單本身時間，若無則取用店家預設時間；未設定時間者回傳 9999 排至最末端
 */
export const getOrderDeliveryMinutes = (
  order: Partial<import('./types').Order>, 
  customerMap?: Map<string, import('./types').Customer> | Record<string, import('./types').Customer>
): number => {
  let cust: import('./types').Customer | undefined;
  if (customerMap && order.customerName) {
    cust = customerMap instanceof Map ? customerMap.get(order.customerName) : customerMap[order.customerName];
  }

  let rawTime = (order.deliveryTime && String(order.deliveryTime).trim() !== '') 
    ? String(order.deliveryTime).trim() 
    : (cust?.deliveryTime ? String(cust.deliveryTime).trim() : '');

  if (!rawTime) return 9999; // 未設時間排在最後

  // 1. 若為 ISO 日期時間字串 (包含 T 或 - 且有 :)
  if (rawTime.includes('T') || (rawTime.includes('-') && rawTime.includes(':'))) {
    const d = new Date(rawTime);
    if (!isNaN(d.getTime())) {
      return d.getHours() * 60 + d.getMinutes();
    }
  }

  // 2. 統一將全形冒號取代為半形，並清理中文與多餘非數字冒號字元
  rawTime = rawTime.replace(/：/g, ':').replace(/[^\d:]/g, '');

  const parts = rawTime.split(':');
  if (parts.length >= 2) {
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (!isNaN(hours) && !isNaN(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return hours * 60 + minutes;
    }
  }
  return 9999;
};


