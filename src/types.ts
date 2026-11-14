
export enum OrderStatus {
  PENDING = 'PENDING',                 // 待出貨 (未出貨未收款)
  SHIPPED = 'SHIPPED',                 // 已出貨 (已送達未收款)
  PAID = 'PAID',                       // 已出貨收款 (已出貨且已收款)
  PAID_UNSHIPPED = 'PAID_UNSHIPPED',   // 已收款未出貨 (款項已結清，貨物待出)
  CANCELLED = 'CANCELLED'              // 取消 (保留)
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        HapticFeedback?: {
          notificationOccurred: (type: string) => void;
        };
      };
    };
  }
}

export interface Product {
  id: string;
  name: string;
  unit: string;
  price?: number; // 預設單價
  category?: string; // 新增：產品分類
  lastUpdated?: number; // 版本控制時間戳
  // --- 暫態屬性 (僅限前端使用) ---
  _syncStatus?: 'pending' | 'synced' | 'error';
  _localUpdatedTs?: number;
  pendingAction?: 'create' | 'update' | 'delete';
}

export interface DefaultItem {
  productId: string;
  quantity: number;
  unit?: string; // 支援自訂單位
  price?: number; // 支援自訂單價 (用於預設列表)
  deliveryTime?: string; // 新增：若有值，代表這項商品要獨立拆單配送
  trip?: string; // 新增：(選配) 如果連車趟都要跟著變，可加此欄位
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
  defaultTrip?: string; // 新增：預設趟數
  address?: string; // 新增：客戶地址
  coordinates?: string; // 新增：座標位置 (緯度, 經度)
  isPaused?: boolean; // 新增：暫停供貨 (無限期休假) 標記
  isArchived?: boolean; // 新增：封存 (永久停業) 標記，從列表隱藏
  // 注意：我們沿用 paymentTerm 欄位來儲存「預定習慣」，以保持後端兼容性
  // 值可能是: 'regular' (預訂), 'occasional' (非每日), 'adhoc' (非預訂), 或舊資料 'daily'/'weekly' 等
  paymentTerm?: string; 
  defaultItems: DefaultItem[]; // 儲存產品 ID 與 預設數量
  priceList?: CustomerPrice[]; // 新增：專屬價目表
  offDays: number[]; // 0-6 (Sun-Sat) - 週期性公休
  holidayDates: string[]; // ['2026-01-20', ...] - 特定日期公休
  autoOrderEnabled?: boolean; // 新增：自動建單開關
  isWatchlist?: boolean; // 新增：易漏盯哨重點店家開關
  lastUpdated?: number; // 版本控制時間戳
  // --- 暫態屬性 (僅限前端使用) ---
  _syncStatus?: 'pending' | 'synced' | 'error';
  _localUpdatedTs?: number;
  pendingAction?: 'create' | 'update' | 'delete';
}

export interface OrderItem {
  productId: string;
  productName?: string;
  quantity: number;
  unit?: string; // 支援自訂單位
  unitPrice?: number;
  subtotal?: number;
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
  source?: string; // 新增：資料來源 (例如："🤖 自動建單")
  unitPrice?: number; // 新增：下單當下的快照單價
  subtotal?: number;  // 新增：下單當下的小計 (單價 * 數量)
  deliveryMethod?: string; // 新增：訂單的配送方式
  trip?: string; // 新增：趟次標籤
  sortOrder?: number; // 排序順序
  lastUpdated?: number; // 版本控制時間戳
  version?: number; // 樂觀鎖版本號 (整數)
  syncStatus?: 'synced' | 'pending' | 'error'; // 同步狀態
  isTimeAutoFilled?: boolean; // 新增：標記是否為系統依據店家預設自動補齊
  isTripAutoFilled?: boolean; // 新增：標記是否為系統依據店家預設自動補齊趟數
  errorMessage?: string; // 錯誤訊息
  pendingAction?: 'create' | 'update' | 'delete' | 'statusUpdate'; // 待處理動作
  assignedTo?: string; // 指派人員 ID (user_id)
  assignedName?: string; // 指派人員姓名
  dispatchStatus?: string; // 指派狀態 (UNASSIGNED, ASSIGNED, ACCEPTED)
  // --- 暫態屬性 (僅限前端使用) ---
  _syncStatus?: 'pending' | 'synced' | 'error';
  _localUpdatedTs?: number;
}

export type UserRole = 'admin' | 'manager' | 'staff';

export interface UserPermissionMatrix {
  canViewAllOrders: boolean;
  canAssignOrders: boolean;
  canUpdateAnyOrderStatus: boolean;
  canDeleteOrders: boolean;
  canEditOrderContent: boolean;
}

export const PERMISSIONS: Record<UserRole, UserPermissionMatrix> = {
  admin: {
    canViewAllOrders: true,
    canAssignOrders: true,
    canUpdateAnyOrderStatus: true,
    canDeleteOrders: true,
    canEditOrderContent: true
  },
  manager: {
    canViewAllOrders: true,
    canAssignOrders: true,
    canUpdateAnyOrderStatus: true,
    canDeleteOrders: false,
    canEditOrderContent: true
  },
  staff: {
    canViewAllOrders: false,        // 嚴格限制：只能讀取 assigned_to === 自己的單
    canAssignOrders: false,         // 無權指派
    canUpdateAnyOrderStatus: false, // 只能更新 assigned_to === 自己的單
    canDeleteOrders: false,
    canEditOrderContent: false
  }
};

export type ReminderDateMode = 'TODAY' | 'TOMORROW' | 'WEEKDAYS';
export type ReminderOutputFormat = 'SUMMARY_NAMES' | 'DELIVERY_MANIFEST';
export type ReminderRecipientMode = 'DEFAULT_ADMIN' | 'ASSIGNED_DRIVER' | 'SPECIFIC_STAFF';
export type ReminderConditionStatus =
  | OrderStatus
  | 'UNORDERED'
  | 'PENDING'
  | 'ACTIVE_ORDERS'
  | 'READY_OR_PENDING'
  | 'UNASSIGNED'
  | 'HAS_PRODUCT';

export interface ReminderCondition {
  id?: string;
  operator?: 'AND' | 'OR';
  customers: string[]; // Customer IDs, empty means all
  status: ReminderConditionStatus;
  products: string[]; // Product names or IDs, empty means all
}

export interface ReminderRule {
  id: string;
  name: string;
  schedule: string[]; // e.g. ["0", "1", "2"]
  targetDateMode?: ReminderDateMode;
  targetOrderDays?: string[]; // e.g. ["0", "1", "2"] checking orders for next matching day
  conditions: ReminderCondition[];
  timeToNotify: string; 
  isActive: boolean;
  customMessage?: string;
  outputFormat?: ReminderOutputFormat;
  includeItemTotals?: boolean;
  recipientMode?: ReminderRecipientMode;
  targetStaffIds?: string[];
  fallbackToAdminIfUnassigned?: boolean;
  priorityCustomerIds?: string[];
}

export interface DailyBriefingConfig {
  id?: string;
  name?: string;
  enabled: boolean;
  schedule: string[]; // ['1','2','3','4','5','6']
  timeToNotify: string; // e.g. '06:00'
  groupBy: 'BY_DRIVER' | 'BY_TRIP' | 'SPECIFIC_STAFF';
  targetStaffIds?: string[]; // 指定系統用戶 userId 列表
  targetStaffNames?: Record<string, string>; // 紀錄指派用戶名稱快取（卡片標籤顯示用）
  includeItemTotals: boolean;
  includeWatchlistMissingCheck: boolean;
  watchlistMissingOnlyRegular: boolean;
  fallbackToAdminIfUnassigned: boolean;
  // --- 方案 B：白名單標籤池 ＋ 拖拉標籤客製化模板 ---
  briefingMode?: 'STANDARD_ALL' | 'CUSTOM_TEMPLATE';
  includedCustomerIds?: string[]; // 僅通知這些已添加為標籤的店家
  customTemplate?: string; // e.g. "早安！\n{{店家:誠石|cust_1}}\n{{總備貨小計}}"
  emptyStoreBehavior?: 'HIDE_LINE' | 'SHOW_NO_ORDER';
  customIncludeItemTotals?: boolean; // 選配：是否自動於訊息最底部附上白名單店家的總備貨小計（預設 false，非必選）
  includeTripInfo?: boolean; // 選配：是否在出車簡報顯示趟數資訊（預設 false，非必選）
  includeDeliveryTime?: boolean; // 選配：是否在出車簡報顯示配送時間（預設 false，非必選）
}

export type LogStatus = 'SUCCESS' | 'SKIPPED' | 'ERROR';

export interface NotificationLog {
  id: string; // 可以用 timestamp + ruleId 組合
  timestamp: number; // 將 GAS 的日期字串轉為 Epoch time 以利排序
  triggerSource: 'SYSTEM_CRON' | 'MANUAL_TEST' | 'WEBHOOK' | string;
  ruleId: string;
  ruleName: string;
  status: LogStatus;
  details: Record<string, any>; // 從 JSON.parse(字串) 轉換過來的物件
}

export interface GASResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string; // 新增錯誤代碼支援
}

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface SystemLog {
  id: string; // fallback using timestamp
  timestampStr: string;
  timestamp: number;
  actionType: string;
  target: string;
  details: string;
}

export interface SyncTask {
  taskId: string;      
  type: 'UPDATE_STATUS' | 'BATCH_UPDATE' | 'UPDATE_CONTENT' | 'delete_order';
  payload: any;        // 給 GAS 的參數
  retryCount: number;  // 重試次數計算
  timestamp: number;
}
