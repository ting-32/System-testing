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
  orderForm: {
    customerId: string;
    items: { productId: string; quantity: number; unit: string }[];
  };
  quickAddData: {
    customerName: string;
    items: { productId: string; quantity: number; unit: string }[];
  } | null;
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

  // 1. Order Summary (for Add/Edit Order Modal)
  const orderSummary = useMemo(() => {
    const customer = customers.find(c => c.id === orderForm.customerId);
    let totalPrice = 0;
    const details = orderForm.items.map(item => {
      const product = products.find(p => p.id === item.productId);
      const priceItem = customer?.priceList?.find(pl => pl.productId === item.productId);
      const unitPrice = priceItem ? priceItem.price : (product?.price || 0);

      let displayQty = item.quantity;
      let displayUnit = item.unit || '斤';
      let subtotal = 0;
      let isCalculated = false;

      if (item.unit === '元') {
        subtotal = item.quantity;
        if (unitPrice > 0) {
          displayQty = parseFloat((item.quantity / unitPrice).toFixed(1));
          displayUnit = product?.unit || '斤';
          isCalculated = true;
        } else {
          displayQty = 0;
        }
      } else {
        subtotal = Math.round(item.quantity * unitPrice);
        displayQty = item.quantity;
        displayUnit = item.unit || '斤';
      }

      totalPrice += subtotal;
      return {
        name: product?.name || '未選品項',
        rawQty: item.quantity,
        rawUnit: item.unit,
        displayQty,
        displayUnit,
        subtotal,
        unitPrice,
        isCalculated
      };
    });
    return { totalPrice, details };
  }, [orderForm.items, orderForm.customerId, customers, products]);

  // 2. Helper: Calculate Total Amount for a single Order
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

  // 6. Finance Data (Outstanding Debts)
  const financeData = useMemo(() => {
    const outstandingMap = new Map<string, { totalDebt: number, count: number, orderIds: string[] }>();
    let grandTotalDebt = 0;

    orders.forEach(order => {
      if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.CANCELLED) {
        const amount = calculateOrderTotalAmount(order);
        grandTotalDebt += amount;

        if (!outstandingMap.has(order.customerName)) {
          outstandingMap.set(order.customerName, { totalDebt: 0, count: 0, orderIds: [] });
        }
        const entry = outstandingMap.get(order.customerName)!;
        entry.totalDebt += amount;
        entry.count += 1;
        entry.orderIds.push(order.id);
      }
    });

    const sortedOutstanding = Array.from(outstandingMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.totalDebt - a.totalDebt);

    return { grandTotalDebt, outstanding: sortedOutstanding };
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