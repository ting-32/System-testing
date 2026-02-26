import React from 'react';
import { motion, Reorder, useDragControls } from 'framer-motion';
import { Box, Edit2, Trash2, GripVertical } from 'lucide-react';
import { Product } from '../types';
import { PRODUCT_CATEGORIES } from '../constants';
import { buttonTap } from './animations';

interface SortableProductItemProps {
  product: Product;
  onEdit: (p: Product) => void;
  onDelete: (id: string) => void;
}

export const SortableProductItem: React.FC<SortableProductItemProps> = ({ product, onEdit, onDelete }) => {
  const controls = useDragControls();
  const categoryColor = PRODUCT_CATEGORIES.find(c => c.id === product.category)?.color || '#E5E7EB';

  return (
    <Reorder.Item 
      value={product} 
      id={product.id}
      dragListener={false} 
      dragControls={controls}
      className="relative"
    >
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileDrag={{ scale: 1.05, boxShadow: "0px 10px 20px rgba(0,0,0,0.1)", zIndex: 10 }}
        className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-200 flex justify-between items-center mb-4 active:cursor-grabbing"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 shadow-sm border border-white/50" style={{ backgroundColor: categoryColor }}>
            <Box className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-slate-800 tracking-wide block">{product.name}</span>
            <div className="flex items-center gap-2 mt-0.5">
               <span className="text-[10px] text-gray-400 font-bold bg-gray-50 px-1.5 py-0.5 rounded">
                 單位: {product.unit}
               </span>
               {product.price && product.price > 0 && (
                 <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full tracking-wide">
                   ${product.price}
                 </span>
               )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <motion.button whileTap={buttonTap} onClick={() => onEdit(product)} className="p-2 text-gray-300 hover:text-slate-600 transition-colors">
            <Edit2 className="w-4 h-4" />
          </motion.button>
          <motion.button whileTap={buttonTap} onClick={() => onDelete(product.id)} className="p-2 text-rose-100 hover:text-rose-400 transition-colors">
            <Trash2 className="w-4 h-4" />
          </motion.button>
          <div 
            onPointerDown={(e) => controls.start(e)}
            className="p-2 text-morandi-pebble/50 cursor-grab active:cursor-grabbing touch-none hover:text-morandi-blue transition-colors"
          >
            <GripVertical className="w-5 h-5" />
          </div>
        </div>
      </motion.div>
    </Reorder.Item>
  );
};
