import React, { useState, useEffect } from 'react';
import { motion, Reorder } from 'framer-motion';
import { Package, Plus, Save, Loader2 } from 'lucide-react';
import { Product } from '../types';
import { SortableProductItem } from '../components/SortableProductItem';

interface ProductsViewProps {
  products: Product[];
  setProducts: (products: Product[]) => void;
  hasReorderedProducts: boolean;
  setHasReorderedProducts: (hasReordered: boolean) => void;
  isSaving: boolean;
  isWarmingUp: boolean;
  isRetrying: boolean;
  requireAuth: (callback: () => void) => void;
  handleSaveProductOrder: () => void;
  setIsEditingProduct: (id: string | 'new') => void;
  handleDeleteProduct: (id: string) => void;
}

const buttonTap = { scale: 0.95 };
const buttonHover = { scale: 1.05 };

export const ProductsView: React.FC<ProductsViewProps> = ({
  products,
  setProducts,
  hasReorderedProducts,
  setHasReorderedProducts,
  isSaving,
  isWarmingUp,
  isRetrying,
  requireAuth,
  handleSaveProductOrder,
  setIsEditingProduct,
  handleDeleteProduct
}) => {
  const [localProducts, setLocalProducts] = useState(products);

  useEffect(() => {
    setLocalProducts(products);
  }, [products]);

  return (
    <motion.div key="products" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0, zIndex: 10 }} exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }} transition={{ duration: 0.2 }} className="space-y-6 relative">
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
          <motion.button whileTap={buttonTap} whileHover={buttonHover} onClick={() => requireAuth(() => { setIsEditingProduct('new'); })} className="p-3 rounded-2xl text-white shadow-lg bg-morandi-blue hover:bg-slate-600 transition-colors">
            <Plus className="w-6 h-6" />
          </motion.button>
        </div>
      </div>
      <div onPointerUp={() => {
          if (localProducts !== products) {
            setProducts(localProducts);
            setHasReorderedProducts(true);
          }
        }}>
        <Reorder.Group axis="y" values={localProducts} onReorder={setLocalProducts} className="space-y-0">
          {localProducts.map(p => (
            <SortableProductItem 
              key={p.id} 
              product={p} 
              onEdit={(p) => requireAuth(() => { setIsEditingProduct(p.id); })} 
              onDelete={(id) => requireAuth(() => handleDeleteProduct(id))} 
            />
          ))}
        </Reorder.Group>
      </div>
    </motion.div>
  );
};
