import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { Customer, Product } from '../../types';
import { UNITS } from '../../constants';
import { buttonTap, modalVariants } from '../animations';
import { ProductPicker } from '../ProductPicker';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: any) => void;
  initialData?: any;
  customers: Customer[];
  products: Product[];
}

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  customers,
  products
}) => {
  const [quickAddData, setQuickAddData] = useState<{customerName: string, items: {productId: string, quantity: number, unit: string}[]} | null>(initialData || null);
  const [pickerConfig, setPickerConfig] = useState<{isOpen: boolean, currentProductId?: string, customPrices?: any[], onSelect: (id: string) => void}>({ isOpen: false, onSelect: () => {} });

  useEffect(() => {
    if (isOpen) {
      setQuickAddData(initialData);
    }
  }, [isOpen, initialData]);

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

  if (!isOpen || !quickAddData) return null;

  return (
    <div className="fixed inset-0 bg-morandi-charcoal/40 z-[70] flex flex-col items-center justify-center p-4 backdrop-blur-sm">
      <motion.div variants={modalVariants} initial="hidden" animate="visible" exit="exit" className="bg-white w-full max-w-sm max-h-[85vh] flex flex-col rounded-[32px] overflow-hidden shadow-xl border border-slate-200">
        <div className="p-5 bg-morandi-oatmeal/30 border-b border-gray-100 flex-shrink-0">
          <h3 className="text-center font-extrabold text-morandi-charcoal text-lg">追加訂單</h3>
          <p className="text-center text-xs text-morandi-pebble font-bold tracking-wide mt-1">{quickAddData.customerName}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          <AnimatePresence initial={false}>
            {quickAddData.items.map((item, index) => (
              <motion.div key={index} initial={{ opacity: 0, height: 0, scale: 0.95 }} animate={{ opacity: 1, height: 'auto', scale: 1 }} exit={{ opacity: 0, height: 0, scale: 0.9 }} className="bg-white rounded-[20px] p-3 shadow-sm border border-slate-100 flex flex-wrap gap-2 items-center">
                <div className="flex-1 min-w-[120px]">
                  <div onClick={() => { 
                    const currentCustomer = customers.find(c => c.name === quickAddData.customerName); 
                    setPickerConfig({ 
                      isOpen: true, 
                      currentProductId: item.productId, 
                      customPrices: currentCustomer?.priceList, 
                      onSelect: (pid) => { 
                        const newItems = [...quickAddData.items]; 
                        const p = products.find(x => x.id === pid); 
                        newItems[index] = { ...item, productId: pid, unit: p?.unit || '斤' }; 
                        setQuickAddData({...quickAddData, items: newItems}); 
                      } 
                    }); 
                  }} className="w-full bg-morandi-oatmeal/50 p-3 rounded-xl font-bold text-sm text-morandi-charcoal border border-slate-200 flex items-center justify-between cursor-pointer hover:border-morandi-blue transition-all">
                    <span className={item.productId ? 'text-slate-800' : 'text-gray-400'}>{products.find(p => p.id === item.productId)?.name || '選擇品項...'}</span>
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  </div>
                </div>
                <div className="w-20">
                  <input type="number" min="0" onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} placeholder="數量" className="w-full bg-morandi-oatmeal/50 p-3 rounded-xl text-center font-black text-lg text-morandi-charcoal border border-slate-200 outline-none focus:ring-2 focus:ring-morandi-blue transition-all" value={item.quantity === 0 ? '' : item.quantity} onChange={(e) => { const newItems = [...quickAddData.items]; const val = parseFloat(e.target.value); newItems[index].quantity = isNaN(val) ? 0 : Math.max(0, val); setQuickAddData({...quickAddData, items: newItems}); }} />
                </div>
                <div className="w-20">
                  <select value={item.unit || '斤'} onChange={(e) => { const newItems = [...quickAddData.items]; newItems[index].unit = e.target.value; setQuickAddData({...quickAddData, items: newItems}); }} className="w-full bg-morandi-oatmeal/50 p-3 rounded-xl font-bold text-morandi-charcoal border border-slate-100 outline-none focus:ring-2 focus:ring-morandi-blue transition-all">
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <button onClick={() => { const newItems = quickAddData.items.filter((_, i) => i !== index); setQuickAddData({...quickAddData, items: newItems}); }} className="p-3 bg-rose-50 text-rose-400 hover:text-rose-600 rounded-xl transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
          <motion.button whileTap={buttonTap} onClick={() => setQuickAddData({...quickAddData, items: [...quickAddData.items, {productId: '', quantity: 10, unit: '斤'}]})} className="w-full py-3 rounded-[16px] border-2 border-dashed border-morandi-blue/30 text-morandi-blue font-bold text-sm flex items-center justify-center gap-2 hover:bg-morandi-blue/5 transition-colors tracking-wide mt-2">
            <Plus className="w-4 h-4" /> 增加品項
          </motion.button>
        </div>
        <div className="p-5 bg-white border-t border-gray-100 flex-shrink-0 space-y-4">
          <AnimatePresence>
            {(() => { 
              const preview = getQuickAddPricePreview(); 
              if (preview && preview.total > 0) { 
                return (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-morandi-amber-bg p-4 rounded-xl border border-amber-100 flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-morandi-amber-text/70 uppercase tracking-widest">預估總金額</span>
                      <span className="text-xs font-medium text-morandi-amber-text/60 mt-0.5 tracking-wide">共 {preview.itemCount} 個品項</span>
                    </div>
                    <span className="text-2xl font-black text-morandi-amber-text tracking-tight">${preview.total.toLocaleString()}</span>
                  </motion.div>
                ); 
              } 
              return null; 
            })()}
          </AnimatePresence>
          <div className="flex gap-2">
            <motion.button whileTap={buttonTap} onClick={onClose} className="flex-1 py-3 rounded-[16px] font-bold text-morandi-pebble hover:bg-gray-50 transition-colors border border-slate-200">取消</motion.button>
            <motion.button whileTap={buttonTap} onClick={() => onSubmit(quickAddData)} className="flex-1 py-3 rounded-[16px] font-bold text-white shadow-md bg-morandi-blue hover:bg-slate-600">確認追加</motion.button>
          </div>
        </div>
      </motion.div>

      <ProductPicker 
        isOpen={pickerConfig.isOpen} 
        onClose={() => setPickerConfig(prev => ({ ...prev, isOpen: false }))} 
        onSelect={(id) => {
          pickerConfig.onSelect(id);
          setPickerConfig(prev => ({ ...prev, isOpen: false }));
        }} 
        products={products}
        currentSelectedId={pickerConfig.currentProductId}
        customPrices={pickerConfig.customPrices}
      />
    </div>
  );
};
