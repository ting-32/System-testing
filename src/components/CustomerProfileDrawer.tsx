import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ClipboardList, FileText, Phone } from 'lucide-react';
import { Customer, Order, Product } from '../types';
import { formatTimeDisplay, getStatusStyles } from '../utils';
import { buttonTap } from './animations';

interface CustomerProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  customerName: string;
  customers: Customer[];
  orders: Order[];
  products: Product[];
  onCreateOrder: (customer: Customer) => void;
  onOpenReport: (customerName: string) => void;
}

export const CustomerProfileDrawer: React.FC<CustomerProfileDrawerProps> = ({
  isOpen, onClose, customerName, customers, orders, products, onCreateOrder, onOpenReport
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'history'>('history');

  const customer = customers.find(c => c.name === customerName);
  
  const customerOrders = useMemo(() => {
    return orders
      .filter(o => o.customerName === customerName)
      .sort((a, b) => new Date(b.deliveryDate).getTime() - new Date(a.deliveryDate).getTime())
      .slice(0, 10); // Show recent 10 orders
  }, [orders, customerName]);

  const handleCreateB2B = () => {
    onClose();
    onOpenReport(customerName);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex justify-center items-end sm:items-center"
        onClick={onClose}
      >
        <motion.div 
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="bg-white w-full max-w-md h-[85vh] sm:h-[80vh] sm:rounded-[32px] rounded-t-[32px] shadow-2xl flex flex-col overflow-hidden relative"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="pt-6 pb-4 px-6 border-b border-gray-100 flex items-start justify-between bg-morandi-oatmeal relative">
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1.5 rounded-full bg-gray-300 sm:hidden" />
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-[22px] bg-white flex items-center justify-center text-xl font-extrabold text-morandi-blue shadow-sm">
                {String(customerName || '').charAt(0)}
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 text-2xl tracking-tight leading-none mb-1">{customerName}</h3>
                {customer?.phone && (
                  <p className="text-sm text-slate-500 font-medium flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {customer.phone}
                  </p>
                )}
              </div>
            </div>
            <button onClick={onClose} className="p-2 bg-gray-200/50 hover:bg-gray-200 rounded-full text-gray-500 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex px-4 pt-2 border-b border-gray-100 bg-morandi-oatmeal/30">
             <button 
               onClick={() => setActiveTab('history')}
               className={`flex-1 py-3 text-sm font-bold text-center border-b-2 transition-colors ${activeTab === 'history' ? 'border-morandi-blue text-morandi-blue' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
             >
               歷史訂單
             </button>
             <button 
               onClick={() => setActiveTab('info')}
               className={`flex-1 py-3 text-sm font-bold text-center border-b-2 transition-colors ${activeTab === 'info' ? 'border-morandi-blue text-morandi-blue' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
             >
               基本資料
             </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50/50">
            {activeTab === 'history' && (
              <div className="space-y-4 pb-20">
                {customerOrders.length > 0 ? (
                  customerOrders.map(order => {
                    const statusConfig = getStatusStyles(order.status);
                    const totalAmount = order.items.reduce((sum, item) => {
                      const p = products.find(prod => prod.id === item.productId || prod.name === item.productId);
                      const priceItem = customer?.priceList?.find(pl => pl.productId === (p?.id || item.productId));
                      const unitPrice = priceItem ? priceItem.price : (p?.price || 0);
                      return sum + (item.unit === '元' ? item.quantity : Math.round(item.quantity * unitPrice));
                    }, 0);

                    return (
                      <div key={order.id} className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-extrabold text-slate-700 tracking-wide">{order.deliveryDate.replace(/-/g, '/')}</span>
                          <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ backgroundColor: statusConfig.tagBg, color: statusConfig.tagText }}>
                            {statusConfig.label}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                           {order.items.map((item, idx) => {
                             const p = products.find(prod => prod.id === item.productId || prod.name === item.productId);
                             return (
                               <div key={idx} className="flex justify-between items-center text-xs text-slate-600 font-bold">
                                 <span>{p?.name || item.productId}</span>
                                 <span className="text-morandi-blue">{item.quantity} {item.unit || p?.unit || '斤'}</span>
                               </div>
                             );
                           })}
                        </div>
                        <div className="pt-2 border-t border-gray-50 flex justify-between items-end">
                           <div className="text-[10px] text-gray-400 font-bold bg-gray-50 px-2 py-1 rounded-md">{formatTimeDisplay(order.deliveryTime)}</div>
                           <div className="text-slate-800 font-black tracking-tight">${totalAmount.toLocaleString()}</div>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="text-center py-10 text-gray-400 font-bold text-sm tracking-wide">
                    尚無歷史訂單紀錄
                  </div>
                )}
              </div>
            )}

            {activeTab === 'info' && (
              <div className="space-y-4">
                {customer ? (
                  <>
                    <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                       <div>
                         <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">主要地址</label>
                         <p className="text-sm font-bold text-slate-700">{customer.address || '未設定'}</p>
                       </div>
                       <div>
                         <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">送貨時間</label>
                         <p className="text-sm font-bold text-slate-700">{formatTimeDisplay(customer.deliveryTime)}</p>
                       </div>
                       {customer.defaultTrip && (
                         <div>
                           <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">所屬趟次</label>
                           <p className="text-sm font-bold text-emerald-600 inline-block bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">{customer.defaultTrip}</p>
                         </div>
                       )}
                       {customer.deliveryMethod && (
                         <div>
                           <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">配送方式</label>
                           <p className="text-sm font-bold text-slate-700">{customer.deliveryMethod}</p>
                         </div>
                       )}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-10 text-gray-400 font-bold text-sm tracking-wide">
                    非建立好的固定客戶
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer CTA */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white via-white to-transparent pt-10 flex gap-2">
            <motion.button 
              whileTap={buttonTap}
              onClick={() => {
                onClose();
                if (customer) {
                  onCreateOrder(customer);
                } else {
                  // Fallback if not an existing customer entity
                  onCreateOrder({ name: customerName, deliveryTime: '08:00', defaultItems: [] } as any);
                }
              }}
              className="flex-1 py-4 rounded-[20px] bg-slate-800 text-white font-bold text-sm shadow-xl shadow-slate-200 flex justify-center items-center gap-2 hover:bg-slate-700 transition-colors"
            >
              <ClipboardList className="w-5 h-5" /> 再建一單
            </motion.button>
            
            {activeTab === 'history' && (
              <motion.button 
                whileTap={buttonTap}
                onClick={handleCreateB2B}
                className="flex-1 py-4 rounded-[20px] bg-sky-500 text-white font-bold text-sm shadow-xl shadow-sky-200 flex justify-center items-center gap-2 hover:bg-sky-600 transition-colors"
              >
                <FileText className="w-5 h-5" /> 產生報表
              </motion.button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
