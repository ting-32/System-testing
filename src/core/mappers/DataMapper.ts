import { Customer, Order, Product, OrderStatus, NotificationLog, LogStatus, SystemLog } from '../../types';
import { safeJsonArray, normalizeDate, safeNumber } from '../../utils';

export class DataMapper {
  static mapSystemLogs(rawLogs: any[]): SystemLog[] {
    return rawLogs.map((log: any, idx: number) => {
      let ts = Date.now();
      if (log.timestampStr) {
        const d = new Date(log.timestampStr.replace(/-/g, '/'));
        if (!isNaN(d.getTime())) ts = d.getTime();
      }
      return {
        id: `${ts}_${idx}`,
        timestampStr: log.timestampStr || '',
        timestamp: ts,
        actionType: log.actionType || 'UNKNOWN',
        target: log.target || '',
        details: log.details || ''
      };
    });
  }

  static mapNotificationLogs(rawLogs: any[]): NotificationLog[] {
    return rawLogs.map((log: any, idx: number) => {
      let parsedDetails = {};
      try {
        parsedDetails = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
      } catch (e) {
        console.warn('Failed to parse log details:', log.details);
      }
      
      // Attempt to convert string timestamp to numeric epoch or keep it as-is if parsing fails
      // Assuming log.timestamp comes back as "YYYY-MM-DD HH:mm:ss"
      let ts = Date.now();
      if (log.timestamp) {
        const d = new Date(log.timestamp.replace(/-/g, '/')); // simple cross-browser compatible string date parsing
        if (!isNaN(d.getTime())) ts = d.getTime();
      }

      return {
        id: `${ts}_${log.ruleId || 'norule'}_${idx}`,
        timestamp: ts,
        triggerSource: log.source || 'UNKNOWN',
        ruleId: String(log.ruleId || ''),
        ruleName: String(log.ruleName || ''),
        status: (log.status as LogStatus) || 'ERROR',
        details: parsedDetails
      };
    });
  }

  static mapCustomers(rawCustomers: any[]): Customer[] {
    return rawCustomers.map((c: any) => {
      const priceListKey = Object.keys(c).find(k => k.includes('價目表') || k.includes('Price') || k.includes('priceList')) || '價目表JSON'; 
      return { 
        id: String(c.ID || c.id || ''), 
        name: String(c.客戶名稱 || c.name || '').trim().replace(/[\r\n]/g, ''), 
        phone: c.電話 || c.phone || '', 
        address: c.地址 || c.address || '',
        coordinates: c.座標位置 || c.coordinates || c.GoogleMap網址 || c.googleMapUrl || '',
        deliveryTime: c.配送時間 || c.deliveryTime || '', 
        deliveryMethod: c.配送方式 || c.deliveryMethod || '', 
        defaultTrip: c.預設趟數 || c.defaultTrip || '',
        paymentTerm: c.付款週期 || c.paymentTerm || 'daily', 
        defaultItems: safeJsonArray(c.預設品項JSON || c.預設品項 || c.defaultItems), 
        priceList: safeJsonArray(c[priceListKey] || c.priceList).map((pl: any) => ({ productId: pl.productId, price: safeNumber(pl.price, 0, `Customer ${c.name} priceList.price`), unit: pl.unit || '斤' })), 
        offDays: safeJsonArray(c.公休日週期JSON || c.公休日週期 || c.offDays), 
        holidayDates: safeJsonArray(c.特定公休日JSON || c.特定公休日 || c.holidayDates).map((d: any) => normalizeDate(d)),
        autoOrderEnabled: c.autoOrderEnabled === true || String(c.autoOrderEnabled).trim().toLowerCase() === 'true' || String(c.自動建單開關).trim().toLowerCase() === 'true' || c.自動建單開關 === true,
        lastUpdated: safeNumber(c.lastUpdated, 0, `Customer ${c.name} lastUpdated`)
      };
    });
  }

  static mapProducts(rawProducts: any[]): Product[] {
    return rawProducts.map((p: any) => ({ 
      id: String(p.ID || p.id), 
      name: String(p.品項 || p.name || '').trim().replace(/[\r\n]/g, ''), 
      unit: p.單位 || p.unit, 
      price: safeNumber(p.單價 || p.price, 0, `Product ${p.name} price`), 
      category: p.分類 || p.category || 'other',
      lastUpdated: safeNumber(p.lastUpdated, 0, `Product ${p.name} lastUpdated`)
    }));
  }

  static mapOrders(rawOrders: any[]): Order[] {
    const orderMap: { [key: string]: Order } = {}; 
    rawOrders.forEach((o: any, index: number) => { 
      let oid = o.訂單ID || o.id; 
      if (!oid || String(oid).trim() === '') {
        const custName = String(o.客戶名 || o.customerName || '未知客戶').trim().replace(/[\r\n]/g, '');
        const date = o.配送日期 || o.deliveryDate || 'nodate';
        const time = o.配送時間 || o.deliveryTime || 'notime';
        oid = `fallback_${custName}_${date}_${time}`;
      } else {
        oid = String(oid);
      }

      if (!orderMap[oid]) { 
        const rawDate = o.配送日期 || o.deliveryDate; 
        const normalizedDate = normalizeDate(rawDate); 
        const statusRaw = String(o.狀態 || o.status || '').trim().toUpperCase();
        let mappedStatus = OrderStatus.PENDING;
        if (['SHIPPED', '已出貨'].includes(statusRaw)) mappedStatus = OrderStatus.SHIPPED;
        else if (['PAID', '已收款'].includes(statusRaw)) mappedStatus = OrderStatus.PAID;
        else if (['CANCELLED', '已取消', '取消', 'DELETED'].includes(statusRaw)) mappedStatus = OrderStatus.CANCELLED;

        orderMap[oid] = { 
          id: oid, 
          createdAt: o.建立時間 || o.createdAt, 
          customerName: String(o.客戶名 || o.customerName || '未知客戶').trim().replace(/[\r\n]/g, ''), 
          deliveryDate: normalizedDate, 
          deliveryTime: o.配送時間 || o.deliveryTime, 
          items: [], 
          note: o.備註 || o.note || '', 
          status: mappedStatus,
          source: o.資料來源 || o.source || (String(oid).startsWith('AUTO-') ? '🤖 自動建單' : ''),
          deliveryMethod: o.配送方式 || o.deliveryMethod || '',
          trip: o.趟次 || o.trip || '',
          lastUpdated: safeNumber(o.lastUpdated, 0, `Order ${oid} lastUpdated`),
          version: safeNumber(o.version || o.Version, 1, `Order ${oid} version`),
          syncStatus: 'synced' 
        }; 
      } 
      
      if (o.品項名 || o.productName || o.productId) { 
        orderMap[oid].items.push({ 
          productId: String(o.產品ID || o.productId || o.品項名 || o.productName || '').trim().replace(/[\r\n]/g, ''), 
          productName: String(o.品項名 || o.productName || '').trim().replace(/[\r\n]/g, ''), 
          quantity: safeNumber(o.數量 || o.quantity, 0, `Order ${oid} item ${o.productName} quantity`), 
          unit: o.單位 || o.unit || '斤' 
        }); 
      } 
    }); 
    return Object.values(orderMap);
  }
}
