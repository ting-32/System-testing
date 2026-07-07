import { Order, Customer, Product } from '../types';

// 檢查單筆訂單是否合法
export const isValidOrder = (order: any): order is Order => {
  if (!order || typeof order !== 'object') return false;
  // 核心欄位絕對不能是 undefined 或 null
  if (!order.id || typeof order.id !== 'string') return false;
  if (!order.customerName || typeof order.customerName !== 'string') return false;
  // 檢查日期格式 (簡單用正則確認 YYYY-MM-DD)
  if (!order.deliveryDate || !/^\d{4}-\d{2}-\d{2}$/.test(order.deliveryDate)) return false;
  // 檢查 items 是否為陣列
  if (!Array.isArray(order.items)) return false;
  
  return true;
};

// 檢查客戶是否合法
export const isValidCustomer = (customer: any): customer is Customer => {
  if (!customer || typeof customer !== 'object') return false;
  if (!customer.id || typeof customer.id !== 'string') return false;
  if (!customer.name || typeof customer.name !== 'string') return false;
  return true;
};

// 檢查產品是否合法
export const isValidProduct = (product: any): product is Product => {
  if (!product || typeof product !== 'object') return false;
  if (!product.id || typeof product.id !== 'string') return false;
  if (!product.name || typeof product.name !== 'string') return false;
  return true;
};

// 批次驗證並過濾 (若壞損率過高，直接宣告整包資料作廢)
export const validateCache = <T>(
  data: any, 
  validator: (item: any) => item is T, 
  threshold = 0.9 // 容錯率：若超過 10% 的資料壞掉，就認為整包快取已污染
): T[] | null => {
  if (!Array.isArray(data)) return null;
  if (data.length === 0) return [];

  const validItems = data.filter(validator);
  
  // 如果合法的資料比例低於閾值，判定整包快取失效，回傳 null
  if (validItems.length / data.length < threshold) {
    return null;
  }
  
  return validItems; // 剔除掉零星壞掉的資料，保留健康的
};
