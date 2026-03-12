import React, { useState } from 'react';
import { motion, Reorder } from 'framer-motion';
import { X, Plus, Edit2, Trash2, Check, GripVertical } from 'lucide-react';
import { Order } from '../types';

interface TripManagerModalProps {
  availableTrips: string[];
  setAvailableTrips: React.Dispatch<React.SetStateAction<string[]>>;
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  onClose: () => void;
  saveOrderToCloud: (order: Order, action: string, lastUpdated: number, onSuccess: (updatedOrder: Order) => void, onError: (msg: string) => void) => void;
  saveTripsToCloud: (trips: string[]) => void;
}

export const TripManagerModal: React.FC<TripManagerModalProps> = ({
  availableTrips,
  setAvailableTrips,
  orders,
  setOrders,
  onClose,
  saveOrderToCloud,
  saveTripsToCloud,
}) => {
  const [newTripName, setNewTripName] = useState('');
  const [editingTrip, setEditingTrip] = useState<string | null>(null);
  const [editTripName, setEditTripName] = useState('');
  const [tripToDelete, setTripToDelete] = useState<string | null>(null);

  // 加上 React.useMemo 確保陣列參考穩定，防止 Reorder.Group 誤判資料變更
  const trips = React.useMemo(() => availableTrips.filter(t => t !== '未分配'), [availableTrips]);

  const handleReorder = (newOrder: string[]) => {
    const newTrips = [...newOrder, '未分配'];
    setAvailableTrips(newTrips);
    saveTripsToCloud(newTrips);
  };

  const handleAddTrip = () => {
    const trimmedName = newTripName.trim();
    if (!trimmedName || trimmedName === '未分配' || availableTrips.includes(trimmedName)) {
      return;
    }
    // 👇 改成這樣：先計算好新的陣列，再分別呼叫
    const newTrips = [...availableTrips.filter(t => t !== '未分配'), trimmedName, '未分配'];
    setAvailableTrips(newTrips);
    saveTripsToCloud(newTrips);
    
    setNewTripName('');
  };

  const handleEditTrip = (oldName: string) => {
    const trimmedName = editTripName.trim();
    if (!trimmedName || trimmedName === '未分配' || (trimmedName !== oldName && availableTrips.includes(trimmedName))) {
      setEditingTrip(null);
      return;
    }

    if (trimmedName !== oldName) {
      // 1. 修正 Trips 的更新 (移出 Updater)
      const newTrips = availableTrips.map(t => t === oldName ? trimmedName : t);
      setAvailableTrips(newTrips);
      saveTripsToCloud(newTrips);
      
      const idsToUpdate = orders.filter(o => o.trip === oldName).map(o => o.id);
      
      if (idsToUpdate.length > 0) {
        // 先樂觀更新 UI 為 pending
        setOrders(prevOrders => prevOrders.map(order => 
          order.trip === oldName ? { ...order, trip: trimmedName, syncStatus: 'pending', pendingAction: 'update' } : order
        ));
        
        // 2. 解決渲染風暴：用 Promise.all 等待所有 API 完成後，再一次性更新 setOrders
        Promise.all(idsToUpdate.map(id => {
          return new Promise(resolve => {
            const order = orders.find(o => o.id === id);
            if (order) {
              saveOrderToCloud(
                { ...order, trip: trimmedName }, 
                'updateOrderContent', 
                order.lastUpdated, 
                (updatedOrder) => resolve({ id, success: true, updatedOrder }), 
                (errMsg) => resolve({ id, success: false, errMsg })
              );
            } else {
              resolve({ id, success: false });
            }
          });
        })).then((results: any[]) => {
          // 所有 API 都回應後，只觸發「一次」 setOrders
          setOrders(prev => prev.map(o => {
            const res = results.find(r => r.id === o.id);
            if (res) {
              if (res.success) return { ...o, syncStatus: 'synced', pendingAction: undefined, lastUpdated: res.updatedOrder.lastUpdated };
              else return { ...o, syncStatus: 'error', errorMessage: res.errMsg };
            }
            return o;
          }));
        });
      }
    }
    setEditingTrip(null);
  };

  const handleDeleteTrip = () => {
    if (tripToDelete) {
      // 1. 修正 Trips 的更新 (移出 Updater)
      const newTrips = availableTrips.filter(t => t !== tripToDelete);
      setAvailableTrips(newTrips);
      saveTripsToCloud(newTrips);
      
      const idsToUpdate = orders.filter(o => o.trip === tripToDelete).map(o => o.id);
      
      if (idsToUpdate.length > 0) {
        setOrders(prevOrders => prevOrders.map(order => 
          order.trip === tripToDelete ? { ...order, trip: '未分配', syncStatus: 'pending', pendingAction: 'update' } : order
        ));
        
        // 2. 解決渲染風暴
        Promise.all(idsToUpdate.map(id => {
          return new Promise(resolve => {
            const order = orders.find(o => o.id === id);
            if (order) {
              saveOrderToCloud(
                { ...order, trip: '未分配' }, 
                'updateOrderContent', 
                order.lastUpdated, 
                (updatedOrder) => resolve({ id, success: true, updatedOrder }), 
                (errMsg) => resolve({ id, success: false, errMsg })
              );
            } else {
              resolve({ id, success: false });
            }
          });
        })).then((results: any[]) => {
          setOrders(prev => prev.map(o => {
            const res = results.find(r => r.id === o.id);
            if (res) {
              if (res.success) return { ...o, syncStatus: 'synced', pendingAction: undefined, lastUpdated: res.updatedOrder.lastUpdated };
              else return { ...o, syncStatus: 'error', errorMessage: res.errMsg };
            }
            return o;
          }));
        });
      }
      
      setTripToDelete(null);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ scale: 0.95 }} 
        animate={{ scale: 1 }} 
        exit={{ scale: 0.95 }} 
        className="bg-white rounded-[24px] p-6 w-full max-w-sm shadow-xl flex flex-col max-h-[80vh]"
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-extrabold text-morandi-charcoal tracking-tight">編輯趟數</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar mb-6">
          {trips.length === 0 ? (
            <div className="text-center text-gray-400 py-4 text-sm font-bold">目前沒有自訂趟數</div>
          ) : (
            <Reorder.Group axis="y" values={trips} onReorder={handleReorder} className="space-y-3">
              {trips.map(trip => (
                <Reorder.Item 
                  key={trip} 
                  value={trip} 
                  className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-100 shadow-sm"
                >
                  {editingTrip === trip ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={editTripName}
                        onChange={(e) => setEditTripName(e.target.value)}
                        className="flex-1 bg-white border border-gray-300 rounded-lg px-2 py-1 text-sm font-bold text-morandi-charcoal outline-none focus:border-morandi-blue"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEditTrip(trip);
                          if (e.key === 'Escape') setEditingTrip(null);
                        }}
                      />
                      <button onClick={() => handleEditTrip(trip)} className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingTrip(null)} className="p-1.5 text-gray-400 hover:bg-gray-200 rounded-lg transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <div className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600">
                          <GripVertical className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-morandi-charcoal text-sm">{trip}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => {
                            setEditingTrip(trip);
                            setEditTripName(trip);
                          }} 
                          className="p-1.5 text-gray-400 hover:text-morandi-blue hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setTripToDelete(trip)} 
                          className="p-1.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </Reorder.Item>
              ))}
            </Reorder.Group>
          )}
        </div>

        <div className="pt-4 border-t border-gray-100">
          <div className="flex gap-2">
            <input 
              type="text" 
              value={newTripName} 
              onChange={e => setNewTripName(e.target.value)} 
              placeholder="新增趟數名稱..." 
              className="flex-1 p-3 bg-gray-50 rounded-xl border border-gray-200 text-sm font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" 
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddTrip();
              }}
            />
            <button 
              onClick={handleAddTrip}
              disabled={!newTripName.trim()}
              className="px-4 py-3 bg-morandi-blue text-white rounded-xl font-bold text-sm hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> 新增
            </button>
          </div>
        </div>
      </motion.div>

      {/* Custom Confirmation Dialog */}
      {tripToDelete && (
        <div className="fixed inset-0 bg-black/40 z-[80] flex items-center justify-center p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }} 
            className="bg-white rounded-[24px] p-6 w-full max-w-xs shadow-2xl flex flex-col items-center text-center"
          >
            <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6 text-rose-500" />
            </div>
            <h3 className="text-lg font-extrabold text-morandi-charcoal mb-2">確定要刪除趟數？</h3>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              您即將刪除「<span className="font-bold text-morandi-charcoal">{tripToDelete}</span>」。<br/>
              該趟數底下的訂單將會被歸類為「未分配」。
            </p>
            <div className="flex gap-3 w-full">
              <button 
                onClick={() => setTripToDelete(null)}
                className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-sm hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleDeleteTrip}
                className="flex-1 py-3 bg-rose-500 text-white rounded-xl font-bold text-sm hover:bg-rose-600 transition-colors shadow-sm shadow-rose-200"
              >
                確定刪除
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
};
