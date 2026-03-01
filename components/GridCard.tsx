import React from 'react';
import { Order, Product, Customer } from '../types';

interface GridCardProps {
  orders: Order[];
  customerName: string;
  products: Product[];
  customers: Customer[];
  onClick: () => void;
}

export const GridCard: React.FC<GridCardProps> = ({ orders, customerName, products, customers, onClick }) => {
  let totalAmount = 0;
  const currentCustomer = customers.find(c => c.name === customerName);
  
  // Aggregate items
  const itemTotals: Record<string, { quantity: number, unit: string }> = {};
  let hasPending = false;
  let allDelivered = true;

  orders.forEach(order => {
    if (order.status === 'pending') hasPending = true;
    if (order.status !== 'delivered') allDelivered = false;

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

  return (
    <div 
      onClick={onClick}
      className={`
        relative flex flex-col p-1.5 rounded-md border text-xs cursor-pointer bg-white shadow-sm h-full
        ${allDelivered ? 'border-green-500 bg-green-50' : 'border-gray-200'}
      `}
    >
      {hasPending && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-amber-400 rounded-full animate-pulse shadow-sm"></span>}

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
      <div className="mt-auto pt-1 border-t border-dashed border-gray-200 text-right font-bold text-gray-900">
        ${totalAmount.toLocaleString()}
      </div>
    </div>
  );
};
