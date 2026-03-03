import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Product } from '../../types';
import { PRODUCT_CATEGORIES } from '../../constants';
import { buttonTap } from '../animations';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (formData: any) => void;
  initialData?: any;
  isSaving: boolean;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isSaving
}) => {
  const [productForm, setProductForm] = useState<Partial<Product>>(initialData || {});

  useEffect(() => {
    if (isOpen) {
      setProductForm(initialData || { name: '', unit: '斤', price: 0, category: 'other' });
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-morandi-oatmeal z-[60] flex flex-col">
      <motion.div initial={{ opacity: 0, y: "100%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="flex flex-col h-full">
      <div className="bg-white p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 z-10">
        <motion.button whileTap={buttonTap} onClick={onClose} className="p-2 rounded-2xl bg-gray-50"><X className="w-6 h-6 text-morandi-pebble" /></motion.button>
        <h2 className="text-lg font-extrabold text-morandi-charcoal tracking-tight">品項資料</h2>
        <motion.button whileTap={buttonTap} onClick={() => onSubmit(productForm)} disabled={isSaving} className="font-bold px-4 py-2 transition-colors text-morandi-blue disabled:text-gray-300">完成儲存</motion.button>
      </div>
      <div className="p-6 space-y-6">
         <div className="space-y-2">
           <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">品項名稱</label>
           <input type="text" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="例如：油麵 (小)" value={productForm.name || ''} onChange={(e) => setProductForm({...productForm, name: e.target.value})} />
         </div>
         <div className="space-y-2">
           <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">分類</label>
           <div className="flex flex-wrap gap-2 p-2 bg-white rounded-[24px] border border-slate-200">
             {PRODUCT_CATEGORIES.map(cat => (
               <button key={cat.id} onClick={() => setProductForm({...productForm, category: cat.id})} className={`px-4 py-2 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5 ${productForm.category === cat.id ? 'border-transparent shadow-sm' : 'bg-white text-gray-400 border-gray-200'}`} style={{ backgroundColor: productForm.category === cat.id ? cat.color : '', color: productForm.category === cat.id ? '#3E3C3A' : '' }}>
                 <span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: cat.color, border: '1px solid rgba(0,0,0,0.1)' }}></span>{cat.label}
               </button>
             ))}
           </div>
         </div>
         <div className="space-y-2">
           <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">計算單位</label>
           <input type="text" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="例如：斤" value={productForm.unit || ''} onChange={(e) => setProductForm({...productForm, unit: e.target.value})} />
         </div>
         <div className="space-y-2">
           <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">預設單價</label>
           <input type="number" min="0" onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="例如：35" value={productForm.price === 0 ? '' : productForm.price} onChange={(e) => { const val = parseFloat(e.target.value); setProductForm({...productForm, price: isNaN(val) ? 0 : Math.max(0, val)}); }} />
         </div>
      </div>
      </motion.div>
    </div>
  );
};
