import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Box, CheckCircle2, Package } from 'lucide-react';
import { Product, CustomerPrice } from '../types';
import { PRODUCT_CATEGORIES } from '../constants';

export const ProductPicker: React.FC<{ isOpen: boolean; onClose: () => void; onSelect: (productId: string) => void; products: Product[]; currentSelectedId?: string; customPrices?: CustomerPrice[]; }> = ({ isOpen, onClose, onSelect, products, currentSelectedId, customPrices }) => {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchCategory = activeCategory === 'all' || (p.category || 'other') === activeCategory;
      return matchSearch && matchCategory;
    });
  }, [products, search, activeCategory]);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setActiveCategory('all');
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-morandi-charcoal/40 z-[120] flex flex-col justify-end sm:justify-center backdrop-blur-sm">
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="bg-white w-full sm:max-w-md sm:mx-auto h-[85vh] sm:h-[80vh] rounded-t-[32px] sm:rounded-[32px] shadow-2xl flex flex-col overflow-hidden">
            <div className="p-5 bg-white border-b border-gray-100 shrink-0 sticky top-0 z-20">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-extrabold text-morandi-charcoal text-lg tracking-tight">選擇品項</h3>
                <button onClick={onClose} className="p-2 rounded-2xl bg-gray-50 text-morandi-pebble"><X className="w-5 h-5" /></button>
              </div>
              <div className="relative mb-4">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input autoFocus type="text" placeholder="搜尋品項名稱..." className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-[16px] text-sm font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue/50 transition-all placeholder:text-gray-300" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar -mx-2 px-2">
                <button onClick={() => setActiveCategory('all')} className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all border ${activeCategory === 'all' ? 'bg-morandi-charcoal text-white border-transparent' : 'bg-white text-gray-400 border-gray-200'}`}>全部</button>
                {PRODUCT_CATEGORIES.map(cat => (
                  <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5 ${activeCategory === cat.id ? 'border-transparent shadow-sm' : 'bg-white text-gray-400 border-gray-200'}`} style={{ backgroundColor: activeCategory === cat.id ? cat.color : '', color: activeCategory === cat.id ? '#3E3C3A' : '' }}>
                    <span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: cat.color, border: '1px solid rgba(0,0,0,0.1)' }}></span>
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-morandi-oatmeal/20">
              <div className="grid grid-cols-1 gap-3">
                {filteredProducts.map(p => {
                  const categoryConfig = PRODUCT_CATEGORIES.find(c => c.id === (p.category || 'other'));
                  const isSelected = p.id === currentSelectedId;
                  const customPriceItem = customPrices?.find(cp => cp.productId === p.id);
                  const hasCustomPrice = !!customPriceItem;
                  const displayPrice = hasCustomPrice ? customPriceItem.price : p.price;
                  return (
                    <motion.button key={p.id} whileTap={{ scale: 0.98 }} onClick={() => { onSelect(p.id); onClose(); }} className={`p-4 rounded-[20px] bg-white border flex items-center gap-4 transition-all shadow-sm ${isSelected ? 'ring-2 ring-morandi-blue border-morandi-blue' : 'border-transparent hover:border-slate-200'}`}>
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-slate-600 shrink-0 border border-black/5" style={{ backgroundColor: categoryConfig?.color || '#eee' }}>
                        <Box className="w-6 h-6" />
                      </div>
                      <div className="text-left flex-1">
                        <h4 className="font-bold text-slate-800 text-sm tracking-wide">{p.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{p.unit}</span>
                          {(displayPrice !== undefined && displayPrice >= 0) && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${hasCustomPrice ? 'text-emerald-600 bg-emerald-50 border border-emerald-100' : 'text-amber-600 bg-amber-50'}`}>
                              {hasCustomPrice && "專屬"} ${displayPrice}
                            </span>
                          )}
                          <span className="text-[9px] text-gray-400 ml-auto">{categoryConfig?.label}</span>
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 className="w-5 h-5 text-morandi-blue" />}
                    </motion.button>
                  );
                })}
              </div>
              {filteredProducts.length === 0 && (
                <div className="py-20 text-center">
                  <Package className="w-12 h-12 text-gray-200 mx-auto mb-2" />
                  <p className="text-gray-400 font-bold text-sm">找不到相關品項</p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
