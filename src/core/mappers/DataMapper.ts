import { Customer, Order, Product, OrderStatus, NotificationLog, LogStatus, SystemLog } from '../../types';
import { safeJsonArray, normalizeDate, safeNumber } from '../../utils';

export class DataMapper {
  private static extractArray(input: any): any[] {
    if (Array.isArray(input)) return input;
    if (input && typeof input === 'object') {
      if (Array.isArray(input.logs)) return input.logs;
      if (Array.isArray(input.data)) return input.data;
      if (Array.isArray(input.items)) return input.items;
      if (Array.isArray(input.result)) return input.result;
    }
    return [];
  }

  private static parseTaipeiTimestamp(rawTimestamp: any, rawTimestampStr: any): { ts: number; normalizedStr: string } {
    const formatTaipei = (ms: number): string => {
      try {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Taipei',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
        }).formatToParts(new Date(ms));
        const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
        return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
      } catch {
        return '';
      }
    };

    if (typeof rawTimestamp === 'number' && Number.isFinite(rawTimestamp) && rawTimestamp > 0) {
      return {
        ts: rawTimestamp,
        normalizedStr: formatTaipei(rawTimestamp) || String(rawTimestampStr || ''),
      };
    }

    const str = String(rawTimestampStr || '').trim();
    if (!str) {
      return { ts: 0, normalizedStr: '' };
    }

    // Bare "YYYY-MM-DD HH:mm:ss" or "YYYY/MM/DD HH:mm:ss" without timezone -> interpret as Asia/Taipei (+08:00)
    const bareMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
    if (bareMatch) {
      const pad = (v?: string) => String(v || '0').padStart(2, '0');
      const iso = `${bareMatch[1]}-${pad(bareMatch[2])}-${pad(bareMatch[3])}T${pad(bareMatch[4])}:${pad(bareMatch[5])}:${pad(bareMatch[6])}+08:00`;
      const d = new Date(iso);
      if (!isNaN(d.getTime())) {
        const ms = d.getTime();
        return { ts: ms, normalizedStr: formatTaipei(ms) || str };
      }
    }

    // Standard JS Date string (e.g. Google Sheets Date.toString() "Mon Nov 16 2026 14:23:05 GMT+0800 (...)") or ISO string
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      const ms = parsed.getTime();
      return { ts: ms, normalizedStr: formatTaipei(ms) || str };
    }

    return { ts: 0, normalizedStr: str };
  }

  private static hashString(input: string): string {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  static mapSystemLogs(rawLogs: any): SystemLog[] {
    const list = this.extractArray(rawLogs);
    const seenCounts = new Map<string, number>();

    return list.map((log: any, idx: number) => {
      if (!log || typeof log !== 'object') {
        return {
          id: `invalid_${idx}`,
          timestampStr: '',
          timestamp: 0,
          actionType: 'UNKNOWN',
          target: '',
          details: String(log || '')
        };
      }
      const { ts, normalizedStr } = this.parseTaipeiTimestamp(log.timestamp, log.timestampStr);
      const actionType = String(log.actionType || 'UNKNOWN');
      const target = String(log.target || '');
      const details = typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details || '');

      const sigBase = `${ts || normalizedStr || 'na'}_${actionType}_${this.hashString(`${target}|${details}`)}`;
      const count = (seenCounts.get(sigBase) || 0) + 1;
      seenCounts.set(sigBase, count);

      return {
        id: count === 1 ? sigBase : `${sigBase}_${count}`,
        timestampStr: normalizedStr,
        timestamp: ts,
        actionType,
        target,
        details
      };
    });
  }

  static mapNotificationLogs(rawLogs: any): NotificationLog[] {
    const list = this.extractArray(rawLogs);
    return list.map((log: any, idx: number) => {
      if (!log || typeof log !== 'object') {
        return {
          id: `invalid_${idx}`,
          timestamp: Date.now(),
          triggerSource: 'UNKNOWN',
          ruleId: '',
          ruleName: '',
          status: 'ERROR' as LogStatus,
          details: {}
        };
      }
      let parsedDetails = {};
      try {
        parsedDetails = typeof log.details === 'string' ? JSON.parse(log.details) : (log.details || {});
      } catch (e) {
        console.warn('Failed to parse log details:', log.details);
      }
      
      let ts = Date.now();
      if (log.timestamp) {
        const d = new Date(String(log.timestamp).replace(/-/g, '/'));
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

  private static isValidRawCustomer(raw: any): boolean {
    if (!raw) return false;
    
    const id = String(raw.ID || raw.id || '').trim();
    const name = String(raw.客戶名稱 || raw.name || '').trim();
    
    // 必須同時具有 ID 與 名稱，才是有意義的店家資料
    if (id === '' || name === '') {
      // 技巧：在開發環境印出被過濾掉的幽靈資料，日後 Debug 找雲端傳了什麼垃圾過來時極度好用
      if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
        console.warn('⚠️ 發現並攔截 Google Sheets 的幽靈空列:', raw);
      }
      return false;
    }
    
    return true;
  }

  static mapCustomers(rawCustomers: any): Customer[] {
    const list = this.extractArray(rawCustomers);
    return list
      .filter(this.isValidRawCustomer)
      .map((c: any) => {
        const priceListKey = Object.keys(c || {}).find(k => k.includes('價目表') || k.includes('Price') || k.includes('priceList')) || '價目表JSON'; 
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
        isWatchlist: c.isWatchlist === true || String(c.isWatchlist).trim().toLowerCase() === 'true' || String(c.易漏盯哨).trim().toLowerCase() === 'true' || c.易漏盯哨 === true,
        isPaused: c.isPaused === true || String(c.isPaused).trim().toLowerCase() === 'true' || String(c.暫停供貨).trim().toLowerCase() === 'true' || c.暫停供貨 === true,
        isArchived: c.isArchived === true || String(c.isArchived).trim().toLowerCase() === 'true' || String(c.封存).trim().toLowerCase() === 'true' || c.封存 === true,
        lastUpdated: safeNumber(c.lastUpdated, 0, `Customer ${c.name} lastUpdated`)
      };
    });
  }

  static mapProducts(rawProducts: any): Product[] {
    const list = this.extractArray(rawProducts);
    return list.map((p: any) => ({ 
      id: String(p.ID || p.id), 
      name: String(p.品項 || p.name || '').trim().replace(/[\r\n]/g, ''), 
      unit: p.單位 || p.unit, 
      price: safeNumber(p.單價 || p.price, 0, `Product ${p.name} price`), 
      category: p.分類 || p.category || 'other',
      lastUpdated: safeNumber(p.lastUpdated, 0, `Product ${p.name} lastUpdated`)
    }));
  }

  static mapOrders(rawOrders: any, customers?: Customer[]): Order[] {
    const list = this.extractArray(rawOrders);
    const orderMap: { [key: string]: Order } = {}; 
    list.forEach((o: any, index: number) => { 
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

        const customerName = String(o.客戶名 || o.customerName || '未知客戶').trim().replace(/[\r\n]/g, '');
        let deliveryTime = String(o.配送時間 || o.deliveryTime || '').trim();
        let isTimeAutoFilled = o.isTimeAutoFilled === true || o.自動補齊時間 === true || String(o.isTimeAutoFilled).toLowerCase() === 'true';

        // 雙重防護：如果歷史資料或外部來源 (如 LINE) 無配送時間，且存在店家預設時間，則自動補齊並標記
        if (!deliveryTime && customers && customers.length > 0) {
          const matchedCust = customers.find(c => c.name === customerName);
          if (matchedCust && matchedCust.deliveryTime && matchedCust.deliveryTime.trim() !== '') {
            deliveryTime = matchedCust.deliveryTime.trim();
            isTimeAutoFilled = true;
          }
        }

        orderMap[oid] = { 
          id: oid, 
          createdAt: o.建立時間 || o.createdAt, 
          customerName, 
          deliveryDate: normalizedDate, 
          deliveryTime, 
          items: [], 
          note: o.備註 || o.note || '', 
          status: mappedStatus,
          source: o.資料來源 || o.source || (String(oid).startsWith('AUTO-') ? '🤖 自動建單' : ''),
          deliveryMethod: o.配送方式 || o.deliveryMethod || '',
          trip: o.趟次 || o.trip || '',
          isTimeAutoFilled,
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
