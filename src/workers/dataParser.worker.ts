import { Order, OrderStatus } from '../types';
import { normalizeDate } from '../utils';

// We implement safeNumber inline as we cannot easily import it if it relies on DOM (it just needs window vs self, usually safe, but let's be careful).
function safeNumber(val: any, fallback = 0, context = ''): number {
  if (val === null || val === undefined || val === '') return fallback;
  const num = Number(val);
  if (isNaN(num)) {
    console.warn(`[SafeNumber] Invalid number detected in ${context}. Original value:`, val, `Returning fallback: ${fallback}`);
    return fallback;
  }
  return num;
}

self.onmessage = (e: MessageEvent) => {
  const { type, oldOrders, rawOrders, mappedProducts, currentProducts, since, isSilent, isAtTop } = e.data;

  if (type === 'MERGE_AND_SORT') {
    const orderMap: { [key: string]: Order } = {}; 
    
    // 1. 解析
    rawOrders.forEach((o: any) => { 
      const fallbackId = `MIGRATED-${o.客戶名 || o.customerName}-${o.配送日期 || o.deliveryDate}-${o.配送時間 || o.deliveryTime || ''}`.trim();
      let rawId = o.訂單ID || o.id;
      if (rawId && typeof rawId === 'string' && rawId.trim() === '') rawId = null;
      const oid = String(rawId || fallbackId); 
      
      if (!orderMap[oid]) { 
        const rawDate = o.配送日期 || o.deliveryDate; 
        const normalizedDate = normalizeDate(rawDate); 
        orderMap[oid] = { 
          id: oid, 
          createdAt: o.建立時間 || o.createdAt, 
          customerName: o.客戶名 || o.customerName || '未知客戶', 
          deliveryDate: normalizedDate, 
          deliveryTime: o.配送時間 || o.deliveryTime, 
          items: [], 
          note: o.備註 || o.note || '', 
          status: (o.狀態 || o.status as OrderStatus) || OrderStatus.PENDING, 
          source: o.資料來源 || o.source || (String(oid).startsWith('AUTO-') ? '🤖 自動建單' : ''),
          deliveryMethod: o.配送方式 || o.deliveryMethod || '',
          trip: o.趟次 || o.trip || '',
          lastUpdated: safeNumber(o.lastUpdated, 0, `Order ${oid} lastUpdated`),
          syncStatus: 'synced' 
        }; 
      } 
      const prodName = o.品項 || o.productName; 
      
      let prod = mappedProducts.find((p: any) => p.name === prodName);
      if (!prod) {
         prod = currentProducts.find((p: any) => p.name === prodName);
      }
       
      orderMap[oid].items.push({ 
        productId: prod ? prod.id : prodName, 
        quantity: safeNumber(o.數量 || o.quantity, 0, `Order ${oid} item ${prodName} quantity`), 
        unit: o.unit || prod?.unit || '斤' 
      }); 
    }); 
    
    const newOrders = Object.values(orderMap);

    let finalOrders: Order[] = [];
    let pendingOrders: Order[] = [];

    // 2. 合併
    if (since > 0) {
      const mergedMap = new Map();
      oldOrders.forEach((o: Order) => mergedMap.set(o.id, o));
      
      newOrders.forEach(newOrder => {
         if (String(newOrder.status) === 'DELETED') {
             mergedMap.delete(newOrder.id);
             return;
         }

         const existOrder = mergedMap.get(newOrder.id);
         if (existOrder) {
             if (existOrder.syncStatus === 'pending' || existOrder.syncStatus === 'error') {
                 return; 
             }
             if ((existOrder.lastUpdated || 0) >= (newOrder.lastUpdated || 0)) {
                 return;
             }
             mergedMap.set(newOrder.id, newOrder);
         } else {
             if (!isAtTop && isSilent) {
                 pendingOrders.push(newOrder);
             } else {
                 mergedMap.set(newOrder.id, newOrder);
             }
         }
      });
      finalOrders = Array.from(mergedMap.values());
    } else {
      const activeNewOrders = newOrders.filter(o => String(o.status) !== 'DELETED');
      const mergedOrders = [...activeNewOrders];
      
      oldOrders.forEach((localOrder: Order) => {
          const index = mergedOrders.findIndex(o => o.id === localOrder.id);
          if (index !== -1) {
              const cloudOrder = mergedOrders[index];
              if (localOrder.syncStatus === 'pending' || localOrder.syncStatus === 'error') {
                  mergedOrders[index] = localOrder;
              } else if ((localOrder.lastUpdated || 0) >= (cloudOrder.lastUpdated || 0)) {
                  mergedOrders[index] = localOrder;
              }
          } else {
              if (localOrder.syncStatus === 'pending' || localOrder.syncStatus === 'error') {
                  mergedOrders.push(localOrder);
              }
          }
      });
      finalOrders = mergedOrders;
    }

    // 3. 重排序
    finalOrders.sort((a, b) => {
       const dateA = a.deliveryDate;
       const dateB = b.deliveryDate;
       if (dateA !== dateB) return dateA > dateB ? -1 : 1; // 預設日期由新到舊
       if (a.deliveryTime !== b.deliveryTime) return a.deliveryTime.localeCompare(b.deliveryTime);
       return (a.lastUpdated || 0) > (b.lastUpdated || 0) ? -1 : 1;
    });

    self.postMessage({
       resultOrders: finalOrders,
       pendingOrders: pendingOrders
    });
  }
};
