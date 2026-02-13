
export const COLORS = {
  bg: '#F2F0E9',       // Oatmeal (bg-main)
  primary: '#5D7586',  // Smog Blue (Primary Action)
  secondary: '#C79F98', // Dusty Pink (Accent)
  accent: '#8C8984',    // Pebble Grey
  slate: '#3E3C3A',     // Charcoal (Text Main)
  cream: '#FFFFFF',      // Paper White
  
  // Status Helpers
  successBg: '#E3ECE6',
  successText: '#4A6356',
  warningBg: '#F9F1E6',
  warningText: '#9C7C58'
};

export const WEEKDAYS = [
  { label: '日', value: 0 },
  { label: '一', value: 1 },
  { label: '二', value: 2 },
  { label: '三', value: 3 },
  { label: '四', value: 4 },
  { label: '五', value: 5 },
  { label: '六', value: 6 },
];

export const DELIVERY_WINDOWS = [
  '06:00 - 08:00',
  '08:00 - 10:00',
  '10:00 - 12:00',
  '14:00 - 16:00',
  '16:00 - 18:00',
];

// 常用單位列表
export const UNITS = [
  '斤',
  '元',
  '公斤',
  '包'
];

// 新增：配送方式選項
export const DELIVERY_METHODS = [
  '上車',
  '機車配送',
  '家裡自取',
  '市場自取'
];

// 新增：預定習慣 (取代原本單純的付款週期意義)
// 這些值將儲存在 paymentTerm 欄位中以保持後端兼容
export const ORDERING_HABITS = [
  { value: 'regular', label: '預訂店家 (固定)', color: '#10B981', bgColor: '#D1FAE5' }, // Emerald
  { value: 'occasional', label: '非每日預訂', color: '#F59E0B', bgColor: '#FEF3C7' }, // Amber
  { value: 'adhoc', label: '非預訂 (散客)', color: '#6B7280', bgColor: '#F3F4F6' }, // Gray
];

// 保留此常數以供舊資料參考，但在UI中主要使用 ORDERING_HABITS
export const PAYMENT_TERMS = [
  { value: 'daily', label: '現金/日結' },
  { value: 'weekly', label: '週結' },
  { value: 'monthly', label: '月結' },
];

// 新增：產品分類定義 (用於 ProductPicker)
export const PRODUCT_CATEGORIES = [
  { id: 'yellow', label: '油麵/黃麵類', color: '#FCD34D' }, // Amber-300
  { id: 'white', label: '陽春/白麵類', color: '#F3F4F6' }, // Gray-100 (Whiteish)
  { id: 'skin', label: '水餃/餛飩皮', color: '#FECDD3' }, // Rose-200
  { id: 'rice', label: '米粉/冬粉', color: '#BFDBFE' }, // Blue-200
  { id: 'other', label: '其他/醬料', color: '#E5E7EB' }  // Gray-200
];

// --- 配置：GAS 部署網址 ---
// 讀取環境變數
// 注意：如果是使用 Vite，是用 import.meta.env
// 如果是 Create React App (Webpack)，則是用 process.env.REACT_APP_API_URL

const ENV_URL = (import.meta as any).env?.VITE_API_URL;

// 增加一層防呆機制 (UX/DX 優化)
// 如果開發者忘記設定 .env，在 console 跳出警告，避免程式直接掛掉不知原因
if (!ENV_URL) {
  console.error("警告: 未設定 VITE_API_URL 環境變數，API 連線將會失敗。");
}

export const GAS_URL = ENV_URL || '';
