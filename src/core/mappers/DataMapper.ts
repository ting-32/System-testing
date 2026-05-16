import { Customer, Order, Product, OrderStatus } from '../../types';
import { safeJsonArray, normalizeDate } from '../../utils';

export class DataMapper {
  static mapCustomers(rawCustomers: any[]): Customer[] {
    return rawCustomers.map((c: any) => {
      const priceListKey = Object.keys(c).find(k => k.includes('價目表') || k.includes('Price') || k.includes('priceList')) || '價目表JSON'; 
      return { 
        id: String(c.ID || c.id || ''), 
        name: c.客戶名稱 || c.name || '', 
        phone: c.電話 || c.phone || '', 
        address: c.地址 || c.address || '',
        coordinates: c.座標位置 || c.coordinates || c.GoogleMap網址 || c.googleMapUrl || '',
        deliveryTime: c.配送時間 || c.deliveryTime || '', 
        deliveryMethod: c.配送方式 || c.deliveryMethod || '', 
        defaultTrip: c.預設趟數 || c.defaultTrip || '',
        paymentTerm: c.付款週期 || c.paymentTerm || 'daily', 
        defaultItems: safeJsonArray(c.預設品項JSON || c.預設品項 || c.defaultItems), 
        priceList: safeJsonArray(c[priceListKey] || c.priceList).map((pl: any) => ({ productId: pl.productId, price: Number(pl.price) || 0, unit: pl.unit || '斤' })), 
        offDays: safeJsonArray(c.公休日週期JSON || c.公休日週期 || c.offDays), 
        holidayDates: safeJsonArray(c.特定公休日JSON || c.特定公休日 || c.holidayDates).map((d: any) => normalizeDate(d)),
        autoOrderEnabled: c.autoOrderEnabled === true || String(c.autoOrderEnabled).trim().toLowerCase() === 'true' || String(c.自動建單開關).trim().toLowerCase() === 'true' || c.自動建單開關 === true,
        lastUpdated: Number(c.lastUpdated) || 0
      };
    });
  }

  static mapProducts(rawProducts: any[]): Product[] {
    return rawProducts.map((p: any) => ({ 
      id: String(p.ID || p.id), 
      name: p.品項 || p.name, 
      unit: p.單位 || p.unit, 
      price: Number(p.單價 || p.price) || 0, 
      category: p.分類 || p.category || 'other',
      lastUpdated: Number(p.lastUpdated) || 0
    }));
  }

  static mapOrders(rawOrders: any[]): Order[] {
    const orderMap: { [key: string]: Order } = {}; 
    rawOrders.forEach((o: any) => { 
      const oid = String(o.訂單ID || o.id); 
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
          lastUpdated: Number(o.lastUpdated) || 0,
          syncStatus: 'synced' 
        }; 
      } 
      
      if (o.品項名 || o.productName || o.productId) { 
        orderMap[oid].items.push({ 
          productId: o.產品ID || o.productId || o.品項名 || o.productName, 
          productName: o.品項名 || o.productName, 
          quantity: Number(o.數量 || o.quantity) || 0, 
          unit: o.單位 || o.unit || '斤' 
        }); 
      } 
    }); 
    return Object.values(orderMap);
  }
}
