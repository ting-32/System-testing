import React from 'react';
import { Order, Product, Customer } from '../types';

interface GridCardProps {
  orders: Order[];
  customerName: string;
  products: Product[];
  customers: Customer[];
  onClick: (customerName: string) => void;
}

export const GridCard: React.FC<GridCardProps> = React.memo(({ orders, customerName, products, customers, onClick }) => {
  let totalAmount = 0;
  const currentCustomer = customers.find(c => c.name === customerName);
  
  // Aggregate items
  const itemTotals: Record<string, { quantity: number, unit: string }> = {};
  let hasPending = false;
  let allDelivered = true;

  orders.forEach(order => {
    if (order.status === 'pending' || order.status === 'PENDING') hasPending = true;
    if (order.status !== 'delivered' && order.status !== 'SHIPPED' && order.status !== 'PAID') allDelivered = false;

    order.items.forEach(item => {
      const key = `${item.productId}-${item.unit}`;
      if (!itemTotals[key]) {
        itemTotals[key] = { quantity: 0, unit: item.unit };
      }
      itemTotals[key].quantity += item.quantity;

      if (item.unit === '元') {
        totalAmount += item.quantity;
      } else {
        const priceInfo = currentCustomer?.priceList?.find(pl => pl.productId === item.productId);
        const price = priceInfo ? priceInfo.price : 0;
        totalAmount += Math.round(item.quantity * price);
      }
    });
  });

  // --- 新增：計算進度條數據 ---
  const totalOrders = orders.length;
  // 只要不是 PENDING (待處理)，就視為已完成進度 (包含 SHIPPED 已配送、PAID 已收款)
  const completedOrders = orders.filter(o => o.status !== 'pending' && o.status !== 'PENDING').length;
  const progressPercent = totalOrders === 0 ? 0 : Math.round((completedOrders / totalOrders) * 100);
  // ---------------------------

  return (
    <div 
      onClick={() => onClick(customerName)}
      className={`
        relative flex flex-col p-1.5 rounded-md border text-xs cursor-pointer shadow-sm h-full overflow-hidden
        transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97]
        ${allDelivered 
          ? 'border-emerald-400 bg-gradient-to-br from-emerald-50 to-emerald-100/50' 
          : 'border-slate-200 bg-gradient-to-br from-white to-slate-50 hover:border-blue-300'
        }
      `}
    >
      {hasPending && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-amber-400 rounded-full animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.8)]"></span>}

      {/* 1. 店家名稱 (允許換行) */}
      <div className="font-bold leading-3 mb-1 break-words text-gray-800 pr-3">
        {customerName}
      </div>

      {/* 2. 品項列表 (極簡化) */}
      <div className="flex-1 space-y-0.5 mb-1">
        {Object.entries(itemTotals).map(([key, data]) => {
          const productId = key.split('-')[0];
          const product = products.find(p => p.id === productId);
          const productName = product?.name || productId;
          return (
            <div key={key} className="flex justify-between text-[10px] text-gray-500 leading-tight">
              <span className="truncate w-full">{productName}</span>
              <span className="font-mono ml-0.5">x{data.quantity}</span>
            </div>
          );
        })}
      </div>

      {/* 3. 金額 */}
      <div className="mt-auto pt-1 border-t border-dashed border-gray-200 text-right font-bold text-gray-900 z-10 relative">
        ${totalAmount.toLocaleString()}
      </div>

      {/* --- 新增：底部極簡進度條 --- */}
      <div className="absolute bottom-0 left-0 h-[3px] bg-slate-100 w-full">
        <div 
          className={`h-full transition-all duration-500 ease-out ${allDelivered ? 'bg-emerald-500' : 'bg-blue-500'}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      {/* --------------------------- */}
    </div>
  );
}, (prevProps, nextProps) => {
  if (prevProps.customerName !== nextProps.customerName) return false;
  if (prevProps.orders.length !== nextProps.orders.length) return false;
  
  // Check if any order's status or items changed
  for (let i = 0; i < prevProps.orders.length; i++) {
    const prevOrder = prevProps.orders[i];
    const nextOrder = nextProps.orders.find(o => o.id === prevOrder.id);
    if (!nextOrder) return false;
    if (prevOrder.status !== nextOrder.status) return false;
    if (prevOrder.lastUpdated !== nextOrder.lastUpdated) return false;
    // We assume if lastUpdated is same, items are same. 
    // Optimistic updates change status, which we check above.
  }
  return true;
});
