import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { Product, ToastType } from '../types';
import { Package, Plus, Save, Loader2, X } from 'lucide-react';
import { PRODUCT_CATEGORIES } from '../constants';
import { SortableProductItem } from '../components/SortableProductItem';
import { buttonTap, buttonHover } from '../components/animations';

export interface ProductsPageProps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  apiEndpoint: string;
  isSaving: boolean;
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>;
  isWarmingUp: boolean;
  isRetrying: boolean;
  addToast: (msg: string, type: ToastType) => void;
  setConfirmConfig: React.Dispatch<React.SetStateAction<any>>;
  requireAuth: (action: () => void) => void;
  isEditingProduct: string | null;
  setIsEditingProduct: React.Dispatch<React.SetStateAction<string | null>>;
  onSaveProductCloud: (finalProduct: Product, isEditingProduct: string | null, originalLastUpdated: number | undefined, previousProducts: Product[]) => Promise<boolean>;
  onDeleteProductCloud: (productId: string, productBackup: Product) => Promise<void>;
  onSaveProductOrderCloud: (orderedIds: string[]) => Promise<boolean>;
}

export const ProductsPage: React.FC<ProductsPageProps> = ({
  products,
  setProducts,
  apiEndpoint,
  isSaving,
  setIsSaving,
  isWarmingUp,
  isRetrying,
  addToast,
  setConfirmConfig,
  requireAuth,
  isEditingProduct,
  setIsEditingProduct,
  onSaveProductCloud,
  onDeleteProductCloud,
  onSaveProductOrderCloud
}) => {
  const [productForm, setProductForm] = useState<Partial<Product>>({});
  const [hasReorderedProducts, setHasReorderedProducts] = useState(false);
  const editingVersionRef = useRef<number | undefined>(undefined);

  const handleRetry = async (p: Product) => {
    if ((p as any).pendingAction === 'delete') {
      executeDeleteProduct(p.id);
      return;
    }
    
    setProducts((prev: Product[]) => prev.map(prod => prod.id === p.id ? { ...prod, _syncStatus: 'pending', lastUpdated: Date.now() } : prod));
    try {
      await onSaveProductCloud({ ...p, _syncStatus: undefined, _localUpdatedTs: Date.now(), lastUpdated: Date.now() }, p.id, String(p.lastUpdated), products);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveProduct = async () => { 
    if (!productForm.name || isSaving) return; 
    
    // Validate uniqueness, but wait, usually uniqueness is good to have, though old logic didn't explicitly block it.
    
    const now = Date.now();
    const finalProduct: Product = { 
        id: isEditingProduct === 'new' ? 'p' + now + Math.random().toString(36).substring(2, 7) : (isEditingProduct as string), 
        name: productForm.name || '', 
        unit: productForm.unit || '斤', 
        price: Number(productForm.price) || 0, 
        category: productForm.category || 'other', 
        lastUpdated: now,
        _syncStatus: 'pending',
        _localUpdatedTs: now
    }; 
    
    const previousProducts = [...products];
    if (isEditingProduct === 'new') setProducts([...products, finalProduct]); 
    else setProducts(products.map(p => p.id === isEditingProduct ? finalProduct : p)); 
    
    const tempIsEditingProduct = isEditingProduct;
    const tempOriginalLastUpdated = editingVersionRef.current;
    
    setIsEditingProduct(null); 
    editingVersionRef.current = undefined;

    await onSaveProductCloud(finalProduct, tempIsEditingProduct, tempOriginalLastUpdated, previousProducts);
  };

  const executeDeleteProduct = async (productId: string) => { 
    setConfirmConfig((prev: any) => ({ ...prev, isOpen: false })); 
    const productBackup = products.find(p => p.id === productId); 
    if (!productBackup) return; 

    // Marking as pending deletion to avoid cache revert resurrection
    setProducts((prev: Product[]) => prev.map(p => p.id === productId ? { ...p, _syncStatus: 'pending', pendingAction: 'delete', _localUpdatedTs: Date.now() } : p)); 
    try {
        await onDeleteProductCloud(productId, productBackup);
        // After successful deletion loop, remove it locally.
        setProducts((prev: Product[]) => prev.filter(p => p.id !== productId));
    } catch (e) {
        // If error, mark error and keep
        console.error("刪除失敗:", e);
        setProducts((prev: Product[]) => prev.map(p => p.id === productId ? { ...p, _syncStatus: 'error', pendingAction: 'delete' } : p));
        addToast("刪除失敗，已標記為錯誤", 'error');
    }
  };

  const handleDeleteProduct = (productId: string) => { 
    setConfirmConfig({ 
        isOpen: true, 
        title: '刪除品項', 
        message: '確定要刪除此品項嗎？\\n請確認該品項已無生產需求。', 
        onConfirm: () => executeDeleteProduct(productId) 
    }); 
  };

  const handleSaveProductOrder = async () => {
      const orderedIds = products.map(p => p.id);
      const success = await onSaveProductOrderCloud(orderedIds);
      if (success) {
          setHasReorderedProducts(false);
          addToast("排序已更新！", 'success');
      }
  };

  return (
    <div className="space-y-6 relative pb-24">
         <div className="flex justify-between items-center px-1">
             <h2 className="text-xl font-extrabold text-morandi-charcoal flex items-center gap-2 tracking-tight">
                 <Package className="w-5 h-5 text-morandi-blue" /> 品項清單
             </h2>
             <div className="flex gap-2">
                 {hasReorderedProducts && (
                     <motion.button initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} whileTap={buttonTap} onClick={() => requireAuth(handleSaveProductOrder)} disabled={isSaving || isWarmingUp} className="p-3 rounded-2xl text-white shadow-lg bg-emerald-500 hover:bg-emerald-600 transition-colors flex items-center gap-2">
                         {isSaving || isWarmingUp || isRetrying ? <Loader2 className="w-6 h-6 animate-spin"/> : <Save className="w-6 h-6" />}
                         <span className="text-xs font-bold hidden sm:inline">{isRetrying ? '重試中...' : '儲存排序'}</span>
                     </motion.button>
                 )}
                 <motion.button whileTap={buttonTap} whileHover={buttonHover} onClick={() => requireAuth(() => { setProductForm({ name: '', unit: '斤', price: 0, category: 'other' }); setIsEditingProduct('new'); editingVersionRef.current = undefined; })} className="p-3 rounded-2xl text-white shadow-lg bg-morandi-blue hover:bg-slate-600 transition-colors">
                     <Plus className="w-6 h-6" />
                 </motion.button>
             </div>
         </div>
         <Reorder.Group axis="y" values={products} onReorder={(newOrder) => { setProducts(newOrder); setHasReorderedProducts(true); }} className="space-y-0">
           {products.map(p => (
               <SortableProductItem 
                   key={p.id} 
                   product={p} 
                   onEdit={(p) => requireAuth(() => { setProductForm(p); setIsEditingProduct(p.id); editingVersionRef.current = p.lastUpdated; })} 
                   onDelete={(id) => requireAuth(() => handleDeleteProduct(id))} 
                   onRetry={handleRetry}
               />
           ))}
         </Reorder.Group>

      {/* Product Form Modal */}
      {typeof document !== 'undefined' && createPortal(
        <>
      <AnimatePresence>
      {isEditingProduct && (
         <motion.div key="product-modal" className="fixed inset-0 bg-morandi-oatmeal z-[60] flex flex-col">
           <motion.div initial={{ opacity: 0, y: "100%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="flex flex-col h-full">
           <div className="bg-white p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 z-10">
               <motion.button whileTap={buttonTap} onClick={() => setIsEditingProduct(null)} className="p-2 rounded-2xl bg-gray-50">
                   <X className="w-6 h-6 text-morandi-pebble" />
               </motion.button>
               <h2 className="text-lg font-extrabold text-morandi-charcoal tracking-tight">品項資料</h2>
               <motion.button whileTap={buttonTap} onClick={() => requireAuth(handleSaveProduct)} disabled={isSaving || isWarmingUp} className="font-bold px-4 py-2 transition-colors text-morandi-blue disabled:text-gray-300">
                   {isWarmingUp ? '連線中...' : (isRetrying ? '↻ 正在重試...' : (isSaving ? '儲存中...' : '完成儲存'))}
               </motion.button>
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
                              <span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: cat.color, border: '1px solid rgba(0,0,0,0.1)' }}></span>
                              {cat.label}
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
         </motion.div>
      )}
      </AnimatePresence>
      </>, document.body)}
    </div>
  );
};
