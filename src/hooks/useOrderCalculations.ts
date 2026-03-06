import { useMemo } from 'react';
import { Customer, Product, Order, OrderStatus } from '../types';
import { PRODUCT_CATEGORIES } from '../constants';

interface UseOrderCalculationsProps {
  orders: Order[];
  customers: Customer[];
  products: Product[];
  selectedDate: string;
  orderSearch: string;
  orderDeliveryFilter: string[];
  scheduleDate: string;
  scheduleDeliveryMethodFilter: string[];
  workDates: string[];
  workCustomerFilter: string;
  workCategoryFilter: string;
  workDeliveryMethodFilter: string[];
  customerSearch: string;
  settlementTarget: { name: string; allOrderIds: string[] } | null;
  settlementDate: string;
  orderForm?: { items: { productId: string; quantity: number; unit: string }[] };
  quickAddData?: { customerName: string; items: { productId: string; quantity: number; unit: string }[] } | null;
}

export const useOrderCalculations = ({
  orders,
  customers,
  products,
  selectedDate,
  orderSearch,
  orderDeliveryFilter,
  scheduleDate,
  scheduleDeliveryMethodFilter,
  workDates,
  workCustomerFilter,
  workCategoryFilter,
  workDeliveryMethodFilter,
  customerSearch,
  settlementTarget,
  settlementDate,
  orderForm,
  quickAddData
}: UseOrderCalculationsProps) => {

  // 0. Order Summary (for Order Form)
  const orderSummary = useMemo(() => {
    if (!orderForm) return { totalPrice: 0, details: [] };
    
    // 1. 取得目前選擇的客戶
    const customer = customers.find(c => c.id === orderForm.customerId);
    
    let total = 0;
    const details = orderForm.items.map(item => {
      const p = products.find(prod => prod.id === item.productId);
      if (!p) return { name: '未知', rawQty: 0, displayQty: 0, displayUnit: item.unit, subtotal: 0, isCalculated: false, unitPrice: 0 };
      
      // 2. 判斷是否有專屬價格
      const priceItem = customer?.priceList?.find(pl => pl.productId === item.productId);
      const unitPrice = priceItem ? priceItem.price : p.price;
      
      let subtotal = 0;
      let displayQty = item.quantity;
      let isCalculated = false;
      
      if (item.unit === '元') {
         subtotal = item.quantity;
         // 3. 使用正確的 unitPrice 換算數量
         displayQty = parseFloat((item.quantity / unitPrice).toFixed(2));
         isCalculated = true;
      } else {
         // 4. 使用正確的 unitPrice 計算小計
         subtotal = item.quantity * unitPrice;
      }
      
      total += subtotal;
      return {
         name: p.name,
         rawQty: item.quantity,
         displayQty,
         displayUnit: item.unit === '元' ? '斤' : item.unit,
         subtotal,
         isCalculated,
         unitPrice: unitPrice // 回傳實際使用的單價
      };
    });
    return { totalPrice: total, details };
  // ⚠️ 重要：依賴陣列必須加入 customers，這樣專屬價格變動時才會重新計算
  }, [orderForm?.items, products, customers, orderForm?.customerId]);

  // 1. Helper: Calculate Total Amount for a single Order
  const calculateOrderTotalAmount = (order: Order) => {
    const customer = customers.find(c => c.name === order.customerName);
    let total = 0;
    (Array.isArray(order.items) ? order.items : []).forEach(item => {
      const product = products.find(p => p.id === item.productId || p.name === item.productId);
      const priceItem = customer?.priceList?.find(pl => pl.productId === (product?.id || item.productId));
      const unitPrice = priceItem ? priceItem.price : (product?.price || 0);

      if (item.unit === '元') {
        total += item.quantity;
      } else {
        total += Math.round(item.quantity * unitPrice);
      }
    });
    return total;
  };

  // 3. Quick Add Preview
  const getQuickAddPricePreview = () => {
    if (!quickAddData || quickAddData.items.length === 0) return null;
    const customer = customers.find(c => c.name === quickAddData.customerName);
    if (!customer) return null;

    let totalOrderPrice = 0;
    quickAddData.items.forEach(item => {
      if (!item.productId) return;
      const product = products.find(p => p.id === item.productId);
      if (!product) return;

      const priceItem = customer.priceList?.find(pl => pl.productId === product.id);
      const unitPrice = priceItem ? priceItem.price : (product.price || 0);

      let itemTotal = 0;
      if (item.unit === '元') {
        itemTotal = item.quantity;
      } else {
        itemTotal = Math.round(item.quantity * unitPrice);
      }
      totalOrderPrice += itemTotal;
    });

    return { total: totalOrderPrice, itemCount: quickAddData.items.length };
  };

  // 4. Schedule Tab Orders
  const scheduleOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.deliveryDate !== scheduleDate) return false;
      if (scheduleDeliveryMethodFilter.length > 0) {
        const customer = customers.find(c => c.name === o.customerName);
        const method = o.deliveryMethod || customer?.deliveryMethod || '';
        if (!scheduleDeliveryMethodFilter.includes(method)) return false;
      }
      return true;
    }).sort((a, b) => {
      return a.deliveryTime.localeCompare(b.deliveryTime);
    });
  }, [orders, scheduleDate, scheduleDeliveryMethodFilter, customers]);

  // 5. Schedule Money Summary
  const scheduleMoneySummary = useMemo(() => {
    let totalReceivable = 0;
    let totalCollected = 0;
    scheduleOrders.forEach(order => {
      const amount = calculateOrderTotalAmount(order);
      totalReceivable += amount;
      if (order.status === OrderStatus.PAID) {
        totalCollected += amount;
      }
    });
    return { totalReceivable, totalCollected };
  }, [scheduleOrders, customers, products]);

  // 6. Finance Data (Outstanding Debts & Revenue)
  const financeData = useMemo(() => {
    const outstandingMap = new Map<string, { totalDebt: number, count: number, orderIds: string[], orders: Order[], oldestDate: string }>();
    let grandTotalDebt = 0;
    
    let thisMonthRevenue = 0;
    let thisMonthCollected = 0;
    
    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    orders.forEach(order => {
      const amount = calculateOrderTotalAmount(order);
      
      // Calculate this month's revenue
      if (order.deliveryDate.startsWith(currentMonthPrefix) && order.status !== OrderStatus.CANCELLED) {
        thisMonthRevenue += amount;
        if (order.status === OrderStatus.PAID) {
          thisMonthCollected += amount;
        }
      }

      if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.CANCELLED) {
        grandTotalDebt += amount;

        if (!outstandingMap.has(order.customerName)) {
          outstandingMap.set(order.customerName, { totalDebt: 0, count: 0, orderIds: [], orders: [], oldestDate: order.deliveryDate });
        }
        const entry = outstandingMap.get(order.customerName)!;
        entry.totalDebt += amount;
        entry.count += 1;
        entry.orderIds.push(order.id);
        entry.orders.push(order);
        if (order.deliveryDate < entry.oldestDate) {
          entry.oldestDate = order.deliveryDate;
        }
      }
    });

    const sortedOutstanding = Array.from(outstandingMap.entries())
      .map(([name, data]) => {
        // Sort orders by date ascending
        data.orders.sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
        
        // Calculate aging
        const oldestDateObj = new Date(data.oldestDate);
        const diffTime = Math.abs(now.getTime() - oldestDateObj.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        return { name, ...data, agingDays: diffDays };
      })
      .sort((a, b) => b.totalDebt - a.totalDebt);

    return { grandTotalDebt, outstanding: sortedOutstanding, thisMonthRevenue, thisMonthCollected };
  }, [orders, customers, products]);

  // 7. Settlement Preview
  const settlementPreview = useMemo(() => {
    if (!settlementTarget) return null;
    const filteredOrders = orders.filter(o => {
      if (!settlementTarget.allOrderIds.includes(o.id)) return false;
      return o.deliveryDate <= settlementDate;
    });

    let totalAmount = 0;
    filteredOrders.forEach(o => {
      totalAmount += calculateOrderTotalAmount(o);
    });

    return { orders: filteredOrders, totalAmount, count: filteredOrders.length };
  }, [settlementTarget, settlementDate, orders, customers, products]);

  // 8. Grouped Orders (Main Order List)
  const { groups: groupedOrders, dayOrders } = useMemo(() => {
    const groups: { [key: string]: Order[] } = {};
    let dayOrders = orders.filter(o => o.deliveryDate === selectedDate);

    // Filter by Search Term
    if (orderSearch) {
      const term = orderSearch.toLowerCase();
      dayOrders = dayOrders.filter(o => {
        const matchName = o.customerName.toLowerCase().includes(term);
        const customer = customers.find(c => c.name === o.customerName);
        const matchPhone = customer?.phone?.includes(term);
        return matchName || matchPhone;
      });
    }

    // Filter by Delivery Method
    if (orderDeliveryFilter.length > 0) {
      dayOrders = dayOrders.filter(o => {
        const customer = customers.find(c => c.name === o.customerName);
        const method = o.deliveryMethod || customer?.deliveryMethod || '';
        return orderDeliveryFilter.includes(method);
      });
    }

    dayOrders.forEach(o => {
      if (!groups[o.customerName]) {
        groups[o.customerName] = [];
      }
      groups[o.customerName].push(o);
    });
    return { groups, dayOrders };
  }, [orders, selectedDate, orderSearch, orderDeliveryFilter, customers]);

  // 9. Filtered Customers (Customer List)
  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    const term = customerSearch.toLowerCase();
    return customers.filter(c => c.name.toLowerCase().includes(term) || (c.phone && c.phone.includes(term)));
  }, [customers, customerSearch]);

  // 10. Work Sheet Data (Production List)
  const workSheetData = useMemo(() => {
    let filtered = orders.filter(o => workDates.includes(o.deliveryDate));
    
    if (workCustomerFilter) filtered = filtered.filter(o => o.customerName.includes(workCustomerFilter));
    
    if (workDeliveryMethodFilter.length > 0) {
      filtered = filtered.filter(o => {
        const c = customers.find(cust => cust.name === o.customerName);
        const m = o.deliveryMethod || c?.deliveryMethod || '';
        return workDeliveryMethodFilter.includes(m);
      });
    }

    const map = new Map<string, {name: string, unit: string, totalQty: number, details: {customerName: string, qty: number}[]}>();

    filtered.forEach(o => {
      o.items.forEach(item => {
        const p = products.find(prod => prod.id === item.productId || prod.name === item.productId);
        const pName = p?.name || item.productId;
        const unit = item.unit || p?.unit || '斤';
        const key = `${pName}::${unit}`; 

        if (!map.has(key)) map.set(key, { name: pName, unit, totalQty: 0, details: [] });
        const entry = map.get(key)!;
        entry.totalQty += item.quantity;
        
        const detail = entry.details.find(d => d.customerName === o.customerName);
        if (detail) detail.qty += item.quantity;
        else entry.details.push({ customerName: o.customerName, qty: item.quantity });
      });
    });

    const flatList = Array.from(map.values());
    
    // Rounding
    flatList.forEach(val => { 
      val.totalQty = Math.round(val.totalQty * 100) / 100; 
      val.details.forEach(d => d.qty = Math.round(d.qty * 100) / 100); 
    });

    // Group by Category
    const groups: Record<string, typeof flatList> = {};
    PRODUCT_CATEGORIES.forEach(c => groups[c.id] = []);
    groups['other'] = [];

    flatList.forEach(item => { 
      const product = products.find(p => p.name === item.name); 
      const catId = product?.category || 'other'; 
      if (groups[catId]) groups[catId].push(item); 
      else groups['other'].push(item); 
    });

    const result = PRODUCT_CATEGORIES.map(cat => ({ 
      ...cat, 
      items: groups[cat.id], 
      totalWeight: groups[cat.id].reduce((sum, i) => sum + i.totalQty, 0) 
    })).filter(g => g.items.length > 0);

    if (workCategoryFilter !== 'all') return result.filter(group => group.id === workCategoryFilter);
    
    return result;
  }, [orders, workDates, workCustomerFilter, workCategoryFilter, workDeliveryMethodFilter, products, customers]);

  return {
    orderSummary,
    calculateOrderTotalAmount,
    getQuickAddPricePreview,
    scheduleOrders,
    scheduleMoneySummary,
    financeData,
    settlementPreview,
    groupedOrders,
    dayOrders,
    filteredCustomers,
    workSheetData
  };
};