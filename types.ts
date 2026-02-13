
export enum OrderStatus {
  PENDING = 'PENDING', // 待出貨
  SHIPPED = 'SHIPPED', // 已出貨
  PAID = 'PAID',       // 已出貨收款
  CANCELLED = 'CANCELLED' // 取消 (保留)
}

export interface Product {
  id: string;
  name: string;
  unit: string;
  price?: number; // 預設單價
  category?: string; // 新增：產品分類
  lastUpdated?: number; // 版本控制時間戳
}

export interface DefaultItem {
  productId: string;
  quantity: number;
  unit?: string; // 支援自訂單位
  price?: number; // 支援自訂單價 (用於預設列表)
}

export interface CustomerPrice {
  productId: string;
  price: number;
  unit?: string; // 新增：單位
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  deliveryTime: string;
  deliveryMethod?: string; // 新增：配送方式
  // 注意：我們沿用 paymentTerm 欄位來儲存「預定習慣」，以保持後端兼容性
  // 值可能是: 'regular' (預訂), 'occasional' (非每日), 'adhoc' (非預訂), 或舊資料 'daily'/'weekly' 等
  paymentTerm?: string; 
  defaultItems: DefaultItem[]; // 儲存產品 ID 與 預設數量
  priceList?: CustomerPrice[]; // 新增：專屬價目表
  offDays: number[]; // 0-6 (Sun-Sat) - 週期性公休
  holidayDates: string[]; // ['2026-01-20', ...] - 特定日期公休
  lastUpdated?: number; // 版本控制時間戳
}

export interface OrderItem {
  productId: string;
  quantity: number;
  unit?: string; // 支援自訂單位
}

export interface Order {
  id: string;
  createdAt: string;
  customerName: string;
  deliveryDate: string;
  deliveryTime: string;
  items: OrderItem[];
  note: string;
  status: OrderStatus;
  deliveryMethod?: string; // 新增：訂單的配送方式
  lastUpdated?: number; // 版本控制時間戳
}

export interface GASResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string; // 新增錯誤代碼支援
}