import React, { useState, useMemo } from 'react';
import { X, Check, Trash2, Plus, Minus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Customer, Product, OrderItem, Order, OrderStatus } from '../../types';
import { PRODUCT_CATEGORIES } from '../../constants';

interface MatrixGridProps {
  orders: Order[];
  customers: Customer[];
  products: Product[];
  onUpdateOrder: (customerId: string, productId: string, quantity: number, unit: string, note: string) => void;
  selectedDate: string;
}

interface CellData {
  quantity: number;
  unit: string;
  note: string;
  orderId?: string;
}

export const MatrixGrid: React.FC<MatrixGridProps> = ({ 
  orders, 
  customers, 
  products, 
  onUpdateOrder,
  selectedDate
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [showOnlyOrdered, setShowOnlyOrdered] = useState(false);
  
  // Popover State
  const [editingCell, setEditingCell] = useState<{
    customerId: string;
    productId: string;
    customerName: string;
    productName: string;
    currentData: CellData | null;
  } | null>(null);

  // 1. Transform Data: Map<CustomerId, Map<ProductId, CellData>>
  const matrix = useMemo(() => {
    const map = new Map<string, Map<string, CellData>>();
    
    orders.forEach(order => {
      if (!map.has(order.customerId)) {
        map.set(order.customerId, new Map());
      }
      const customerMap = map.get(order.customerId)!;
      
      order.items.forEach(item => {
        // If multiple orders for same customer/product (rare), sum them up
        const existing = customerMap.get(item.productId);
        if (existing) {
          existing.quantity += item.quantity;
          // Merge notes if any
          if (item.note) existing.note = existing.note ? `${existing.note}, ${item.note}` : item.note;
        } else {
          customerMap.set(item.productId, {
            quantity: item.quantity,
            unit: item.unit,
            note: item.note || '',
            orderId: order.id
          });
        }
      });
    });
    return map;
  }, [orders]);

  // 2. Filter Products
  const visibleProducts = useMemo(() => {
    let filtered = products;
    if (activeCategory !== 'all') {
      filtered = products.filter(p => p.category === activeCategory);
    }
    // Sort by sequence or name
    return filtered.sort((a, b) => (a.sequence || 999) - (b.sequence || 999));
  }, [products, activeCategory]);

  // 3. Filter Customers
  const visibleCustomers = useMemo(() => {
    let filtered = customers;
    
    if (showOnlyOrdered) {
      filtered = filtered.filter(c => matrix.has(c.id));
    }
    
    // Sort: Route -> Sequence -> Name
    return filtered.sort((a, b) => {
       // 1. Route
       if ((a.route || '') < (b.route || '')) return -1;
       if ((a.route || '') > (b.route || '')) return 1;
       // 2. Sequence
       if ((a.sequence || 999) < (b.sequence || 999)) return -1;
       if ((a.sequence || 999) > (b.sequence || 999)) return 1;
       return 0;
    });
  }, [customers, matrix, showOnlyOrdered]);

  // Calculate Totals for visible products
  const productTotals = useMemo(() => {
    const totals = new Map<string, number>();
    visibleProducts.forEach(p => {
      let sum = 0;
      matrix.forEach(customerMap => {
        const item = customerMap.get(p.id);
        if (item) sum += item.quantity;
      });
      totals.set(p.id, sum);
    });
    return totals;
  }, [matrix, visibleProducts]);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b border-slate-200 overflow-x-auto whitespace-nowrap bg-slate-50 sticky top-0 z-30">
        <button 
          onClick={() => setActiveCategory('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${activeCategory === 'all' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
        >
          全部
        </button>
        {Object.keys(PRODUCT_CATEGORIES).map(cat => (
          <button 
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${activeCategory === cat ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
          >
            {cat}
          </button>
        ))}
        <div className="w-px h-6 bg-slate-300 mx-2" />
        <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
          <input 
            type="checkbox" 
            checked={showOnlyOrdered} 
            onChange={e => setShowOnlyOrdered(e.target.checked)}
            className="rounded text-blue-600 focus:ring-blue-500"
          />
          只顯示有單
        </label>
      </div>

      {/* The Grid Container */}
      <div className="flex-1 overflow-auto relative custom-scrollbar">
        <table className="border-collapse w-full text-sm">
          <thead className="bg-slate-50 text-slate-700 sticky top-0 z-20 shadow-sm">
            <tr>
              <th className="sticky left-0 top-0 z-30 bg-slate-100 border-b border-r border-slate-200 p-2 min-w-[100px] text-left font-bold text-xs uppercase tracking-wider">
                客戶 \ 產品
              </th>
              {visibleProducts.map(p => (
                <th key={p.id} className="border-b border-r border-slate-200 p-2 min-w-[60px] font-bold text-center bg-slate-50">
                  <div className="flex flex-col items-center">
                    <span className="text-xs">{p.name}</span>
                    <span className="text-[10px] text-slate-400 font-normal">{p.unit}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleCustomers.map(c => (
              <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                <td className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 p-2 font-bold text-slate-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                  <div className="flex items-center gap-1">
                    {/* Status Dot */}
                    <div className={`w-2 h-2 rounded-full ${matrix.has(c.id) ? 'bg-green-500' : 'bg-slate-200'}`} />
                    <span className="truncate max-w-[100px]">{c.name}</span>
                  </div>
                </td>
                {visibleProducts.map(p => {
                  const item = matrix.get(c.id)?.get(p.id);
                  const hasOrder = !!item;
                  const hasNote = item && item.note;
                  
                  return (
                    <td 
                      key={`${c.id}-${p.id}`}
                      className={`border-b border-r border-slate-100 p-0 text-center cursor-pointer relative ${hasOrder ? 'bg-blue-50/50' : ''}`}
                      onClick={() => setEditingCell({
                        customerId: c.id,
                        productId: p.id,
                        customerName: c.name,
                        productName: p.name,
                        currentData: item || null
                      })}
                    >
                      <div className="w-full h-full p-3 flex items-center justify-center">
                         {hasOrder ? (
                           <span className="font-bold text-blue-700 text-base">{item.quantity}</span>
                         ) : (
                           <span className="text-slate-200 text-xs">-</span>
                         )}
                      </div>
                      {hasNote && (
                        <div className="absolute top-0.5 right-0.5 w-0 h-0 border-l-[6px] border-l-transparent border-t-[6px] border-t-rose-400" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            
            {/* Total Row */}
            <tr className="bg-slate-100 font-bold sticky bottom-0 z-20 shadow-[0_-2px_5px_rgba(0,0,0,0.05)]">
               <td className="sticky left-0 z-30 bg-slate-100 border-t border-r border-slate-300 p-2 text-right">總計</td>
               {visibleProducts.map(p => (
                 <td key={`total-${p.id}`} className="border-t border-r border-slate-300 p-2 text-center text-slate-800">
                    {productTotals.get(p.id) || 0}
                 </td>
               ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Quick Edit Popover (Modal for simplicity on mobile) */}
      <AnimatePresence>
        {editingCell && (
          <QuickEditModal 
            isOpen={!!editingCell}
            onClose={() => setEditingCell(null)}
            data={editingCell}
            onSave={(qty, unit, note) => {
              onUpdateOrder(editingCell.customerId, editingCell.productId, qty, unit, note);
              setEditingCell(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Quick Edit Modal Component ---
const QuickEditModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  data: { customerName: string; productName: string; currentData: CellData | null };
  onSave: (qty: number, unit: string, note: string) => void;
}> = ({ isOpen, onClose, data, onSave }) => {
  const [quantity, setQuantity] = useState<string>(data.currentData?.quantity.toString() || '');
  const [unit, setUnit] = useState(data.currentData?.unit || '斤');
  const [note, setNote] = useState(data.currentData?.note || '');

  const handleSave = () => {
    const qty = parseFloat(quantity);
    if (isNaN(qty)) {
        onSave(0, unit, note); // Treat empty/invalid as 0 (delete)
    } else {
        onSave(qty, unit, note);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4 pointer-events-none">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm pointer-events-auto" onClick={onClose} />
      <motion.div 
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        className="bg-white w-full max-w-sm rounded-2xl shadow-2xl pointer-events-auto overflow-hidden mb-4 sm:mb-0"
      >
        <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-800">{data.customerName}</h3>
            <p className="text-xs text-slate-500">{data.productName}</p>
          </div>
          <button onClick={onClose} className="p-2 bg-white rounded-full text-slate-400 hover:text-slate-600 shadow-sm"><X className="w-4 h-4"/></button>
        </div>

        <div className="p-6 space-y-6">
           {/* Quantity Input */}
           <div className="flex items-center gap-4 justify-center">
              <button onClick={() => setQuantity(prev => Math.max(0, (parseFloat(prev)||0) - 1).toString())} className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 active:scale-95"><Minus className="w-6 h-6"/></button>
              <div className="flex-1 max-w-[120px]">
                <input 
                  type="number" 
                  inputMode="decimal"
                  autoFocus
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  className="w-full text-center text-4xl font-bold text-slate-800 bg-transparent border-b-2 border-slate-200 focus:border-blue-500 focus:outline-none py-2"
                  placeholder="0"
                />
              </div>
              <button onClick={() => setQuantity(prev => ((parseFloat(prev)||0) + 1).toString())} className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 active:scale-95"><Plus className="w-6 h-6"/></button>
           </div>

           {/* Unit & Note */}
           <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                 <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">單位</label>
                 <select value={unit} onChange={e => setUnit(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm font-bold text-slate-700">
                    <option value="斤">斤</option>
                    <option value="包">包</option>
                    <option value="袋">袋</option>
                    <option value="個">個</option>
                 </select>
              </div>
              <div className="col-span-2">
                 <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">備註</label>
                 <input type="text" value={note} onChange={e => setNote(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm" placeholder="例如：切、分裝..." />
              </div>
           </div>

           {/* Actions */}
           <div className="flex gap-3 pt-2">
              <button 
                onClick={() => { setQuantity('0'); handleSave(); }}
                className="flex-1 py-3 rounded-xl bg-rose-50 text-rose-500 font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <Trash2 className="w-4 h-4" /> 清除
              </button>
              <button 
                onClick={handleSave}
                className="flex-[2] py-3 rounded-xl bg-slate-800 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-slate-200 active:scale-95 transition-transform"
              >
                <Check className="w-4 h-4" /> 儲存
              </button>
           </div>
        </div>
      </motion.div>
    </div>
  );
};
