import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Product } from '../types';
import { PRODUCT_CATEGORIES } from '../constants';

const buttonTap = { scale: 0.95 };

interface ProductEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  // null means create, existing object means update
  initialData: Product | null; 
  onSave: (data: Partial<Product>) => Promise<void>;
  isSaving: boolean;
  isWarmingUp: boolean;
  isRetrying: boolean;
}

export const ProductEditModal: React.FC<ProductEditModalProps> = ({ 
  isOpen, 
  onClose, 
  initialData, 
  onSave,
  isSaving,
  isWarmingUp,
  isRetrying
}) => {
  const [formData, setFormData] = useState<Partial<Product>>({});

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({ ...initialData });
      } else {
        setFormData({ name: '', price: 0, unit: '斤', category: 'other' });
      }
    }
  }, [isOpen, initialData]);

  const handleSubmit = async () => {
    await onSave(formData);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div key="product-modal" className="fixed inset-0 bg-morandi-oatmeal z-[60] flex flex-col">
          <motion.div initial={{ opacity: 0, y: "100%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="flex flex-col h-full">
            <div className="bg-white p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 z-10">
              <motion.button whileTap={buttonTap} onClick={onClose} className="p-2 rounded-2xl bg-gray-50">
                <X className="w-6 h-6 text-morandi-pebble" />
              </motion.button>
              <h2 className="text-lg font-extrabold text-morandi-charcoal tracking-tight">品項資料</h2>
              <motion.button 
                whileTap={buttonTap} 
                onClick={handleSubmit} 
                disabled={isSaving || isWarmingUp} 
                className="font-bold px-4 py-2 transition-colors text-morandi-blue disabled:text-gray-300"
              >
                {isWarmingUp ? '連線中...' : (isRetrying ? '↻ 正在重試...' : (isSaving ? '儲存中...' : '完成儲存'))}
              </motion.button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">品項名稱</label>
                <input 
                  type="text" 
                  className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" 
                  placeholder="例如：油麵 (小)" 
                  value={formData.name || ''} 
                  onChange={(e) => setFormData({...formData, name: e.target.value})} 
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">分類</label>
                <div className="flex flex-wrap gap-2 p-2 bg-white rounded-[24px] border border-slate-200">
                  {PRODUCT_CATEGORIES.map(cat => (
                    <button 
                      key={cat.id} 
                      onClick={() => setFormData({...formData, category: cat.id})} 
                      className={`px-4 py-2 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5 ${formData.category === cat.id ? 'border-transparent shadow-sm' : 'bg-white text-gray-400 border-gray-200'}`} 
                      style={{ backgroundColor: formData.category === cat.id ? cat.color : '', color: formData.category === cat.id ? '#3E3C3A' : '' }}
                    >
                      <span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: cat.color, border: '1px solid rgba(0,0,0,0.1)' }}></span>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">計算單位</label>
                <input 
                  type="text" 
                  className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" 
                  placeholder="例如：斤" 
                  value={formData.unit || ''} 
                  onChange={(e) => setFormData({...formData, unit: e.target.value})} 
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">預設單價</label>
                <input 
                  type="number" 
                  min="0" 
                  onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} 
                  className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" 
                  placeholder="例如：35" 
                  value={formData.price === 0 ? '' : formData.price} 
                  onChange={(e) => { 
                    const val = parseFloat(e.target.value); 
                    setFormData({...formData, price: isNaN(val) ? 0 : Math.max(0, val)}); 
                  }} 
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
