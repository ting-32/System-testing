import React, { useState, useEffect } from 'react';
import { Reorder } from 'framer-motion';
import { GripVertical } from 'lucide-react';
import { ScheduleOrderCard } from './ScheduleOrderCard';
import { Order, Product, Customer } from '../types';

interface TripReorderGroupProps {
  tripOrders: Order[];
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  reorderedOrderIds: Set<string>;
  setReorderedOrderIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  productMap: Record<string, Product>;
  customerMap: Record<string, Customer>;
  isLoadingProducts: boolean;
  isSelectionMode: boolean;
  selectedOrderIds: Set<string>;
  handleToggleSelectionStable: (id: string) => void;
  handleSwipeStatusChange: (id: string, status: any) => void;
  handleShareOrder: (order: Order) => void;
  openGoogleMaps: (name: string) => void;
}

export const TripReorderGroup: React.FC<TripReorderGroupProps> = ({
  tripOrders, orders, setOrders, reorderedOrderIds, setReorderedOrderIds,
  productMap, customerMap, isLoadingProducts, isSelectionMode,
  selectedOrderIds, handleToggleSelectionStable, handleSwipeStatusChange,
  handleShareOrder, openGoogleMaps
}) => {
  const [localTripOrders, setLocalTripOrders] = useState(tripOrders);

  useEffect(() => {
    const isDifferent = localTripOrders.length !== tripOrders.length || 
                        tripOrders.some((o, idx) => o.id !== localTripOrders[idx]?.id);
    
    if (isDifferent) {
      setLocalTripOrders(tripOrders);
    }
  }, [tripOrders, localTripOrders]);

  if (localTripOrders.length > 50) {
    return (
      <div className="space-y-3">
        {localTripOrders.map((order) => (
          <div key={order.id} className="relative">
            <div className="flex items-center gap-2">
              <div className="p-2 opacity-30 cursor-not-allowed">
                <GripVertical className="w-5 h-5 text-gray-400" />
              </div>
              <div className="flex-1 pointer-events-none">
                <ScheduleOrderCard 
                  order={order}
                  productMap={productMap}
                  customerMap={customerMap}
                  isLoadingProducts={isLoadingProducts}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedOrderIds.has(order.id)}
                  onToggleSelection={handleToggleSelectionStable}
                  onStatusChange={handleSwipeStatusChange}
                  onShare={handleShareOrder}
                  onMap={openGoogleMaps}
                />
              </div>
            </div>
          </div>
        ))}
        <div className="text-center py-2 text-xs text-rose-500 font-bold bg-rose-50 rounded-xl my-2">
          該趟次單量超過 50 筆，為保護效能已停用拖曳排序
        </div>
      </div>
    );
  }

  return (
    <div onPointerUp={() => {
      if (localTripOrders !== tripOrders) {
        const newSet = new Set(reorderedOrderIds);
        const updatedOrders = orders.map(o => {
          const index = localTripOrders.findIndex(no => no.id === o.id);
          if (index !== -1) {
            const newSortOrder = index * 10;
            if (o.sortOrder !== newSortOrder) {
              newSet.add(o.id);
              return { ...o, sortOrder: newSortOrder, syncStatus: 'pending' as const, pendingAction: 'update' as const };
            }
          }
          return o;
        });
        setReorderedOrderIds(newSet);
        setOrders(updatedOrders);
      }
    }}>
      <Reorder.Group 
        axis="y" 
        values={localTripOrders} 
        onReorder={setLocalTripOrders}
        className="space-y-3"
      >
        {localTripOrders.map((order) => (
          <Reorder.Item key={order.id} value={order} className="relative">
            <div className="flex items-center gap-2">
              <div className="cursor-grab active:cursor-grabbing p-2">
                <GripVertical className="w-5 h-5 text-gray-400" />
              </div>
              <div className="flex-1 pointer-events-none">
                <ScheduleOrderCard 
                  order={order}
                  productMap={productMap}
                  customerMap={customerMap}
                  isLoadingProducts={isLoadingProducts}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedOrderIds.has(order.id)}
                  onToggleSelection={handleToggleSelectionStable}
                  onStatusChange={handleSwipeStatusChange}
                  onShare={handleShareOrder}
                  onMap={openGoogleMaps}
                />
              </div>
            </div>
          </Reorder.Item>
        ))}
      </Reorder.Group>
    </div>
  );
};
