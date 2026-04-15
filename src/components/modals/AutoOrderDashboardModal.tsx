import React from 'react';
import { motion } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Edit2, CalendarDays, Bot } from 'lucide-react';
import { Customer, Product } from '../../types';
import { formatDateStr } from '../../utils';

interface AutoOrderDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  previewDate: Date;
  setPreviewDate: (date: Date) => void;
  greenZone: Customer[];
  grayZone: (Customer & { skipReason: string })[];
  products: Product[];
  onToggleAutoOrder: (customerId: string) => void;
  onEditItems: (customer: Customer) => void;
  onSetHoliday: (customerId: string) => void;
}

export const AutoOrderDashboardModal: React.FC<AutoOrderDashboardModalProps> = ({
  isOpen,
  onClose,
  previewDate,
  setPreviewDate,
  greenZone,
  grayZone,
  products,
  onToggleAutoOrder,
  onEditItems,
  onSetHoliday
}) => {
  const getProductName = (id: string) => {
    return products.find(p => p.id === id)?.name || '未知商品';
  };

  const handlePrevDay = () => {
    setPreviewDate(new Date(previewDate.getTime() - 24 * 60 * 60 * 1000));
  };

  const handleNextDay = () => {
    setPreviewDate(new Date(previewDate.getTime() + 24 * 60 * 60 * 1000));
  };

  const renderCard = (customer: Customer, skipReason?: string) => {
    const defaultItems = customer.defaultItems || [];
    const hasWarning = !skipReason && defaultItems.length === 0;

    return (
      <motion.div 
        key={customer.id}
        className={`bg-white p-5 rounded-2xl shadow-sm border flex flex-col ${hasWarning ? 'border-amber-400 ring-1 ring-amber-400' : 'border-slate-100'}`}
      >
        {/* Header */}
        <div className="flex justify-between items-center">
          <h4 className="font-bold text-slate-800 text-lg">{customer.name}</h4>
          <button
            type="button"
            onClick={() => onToggleAutoOrder(customer.id)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              customer.autoOrderEnabled ? 'bg-emerald-500' : 'bg-gray-200'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              customer.autoOrderEnabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>

        {/* Body */}
        <div className="mt-3 flex-1">
          {skipReason && (
            <span className={`inline-block text-xs font-bold px-2 py-1 rounded-md mb-2 ${skipReason.includes('公休') ? 'bg-rose-100 text-rose-600' : 'bg-slate-200 text-slate-600'}`}>
              {skipReason.includes('公休') ? '🛑 目標日公休' : '⏸️ 手動暫停'}
            </span>
          )}
          
          {hasWarning && (
            <span className="inline-block text-xs font-bold px-2 py-1 rounded-md bg-amber-100 text-amber-700 mb-2">
              ⚠️ 尚未設定品項
            </span>
          )}

          <div className="flex flex-wrap gap-1.5">
            {defaultItems.slice(0, 3).map((item, idx) => (
              <span key={idx} className="text-[11px] bg-slate-100 text-slate-600 px-2 py-1 rounded-lg font-medium">
                {getProductName(item.productId)} x {item.quantity}{item.unit || '斤'}
              </span>
            ))}
            {defaultItems.length > 3 && (
              <span className="text-[11px] text-morandi-blue font-bold px-1 py-1">
                ...等 {defaultItems.length} 項
              </span>
            )}
            {!skipReason && defaultItems.length === 0 && (
              <span className="text-[11px] text-slate-400">目前沒有預設品項</span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100">
          <button 
            onClick={() => onEditItems(customer)}
            className="flex items-center justify-center gap-1.5 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" /> 修改品項
          </button>
          <button 
            onClick={() => onSetHoliday(customer.id)}
            className="flex items-center justify-center gap-1.5 py-2 bg-orange-50 text-orange-600 rounded-xl text-xs font-bold hover:bg-orange-100 transition-colors"
          >
            <CalendarDays className="w-3.5 h-3.5" /> 設定公休
          </button>
        </div>
      </motion.div>
    );
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex justify-center items-center p-4 z-[100]"
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white w-full max-w-5xl max-h-[90vh] rounded-3xl flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Sticky Header */}
        <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-morandi-blue to-indigo-500 flex items-center justify-center text-white shadow-sm">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">自動建單預覽</h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">預測系統執行結果</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-slate-50 rounded-xl p-1 border border-slate-100">
              <button onClick={handlePrevDay} className="p-2 hover:bg-white rounded-lg transition-colors text-slate-600"><ChevronLeft className="w-5 h-5" /></button>
              <div className="px-4 font-bold text-sm text-slate-700 min-w-[120px] text-center">
                {formatDateStr(previewDate)}
              </div>
              <button onClick={handleNextDay} className="p-2 hover:bg-white rounded-lg transition-colors text-slate-600"><ChevronRight className="w-5 h-5" /></button>
            </div>
            <button onClick={onClose} className="p-2.5 bg-slate-50 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto p-6 space-y-8 bg-slate-50/50">
          
          {/* Green Zone */}
          <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100">
            <h3 className="text-emerald-700 font-bold mb-4 flex items-center gap-2">
              <span className="text-xl">✅</span> 預計將自動建單 ({greenZone.length})
            </h3>
            {greenZone.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {greenZone.map(customer => renderCard(customer))}
              </div>
            ) : (
              <div className="text-center py-8 text-emerald-600/70 font-medium">
                🎉 目標日沒有預設訂單需要產生
              </div>
            )}
          </div>

          {/* Gray Zone */}
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
            <h3 className="text-slate-500 font-bold mb-4 flex items-center gap-2">
              <span className="text-xl">⏸️</span> 已暫停或目標日公休 ({grayZone.length})
            </h3>
            {grayZone.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-70 grayscale-[20%]">
                {grayZone.map(customer => renderCard(customer, customer.skipReason))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 font-medium">
                🚀 所有開啟自動建單的客戶皆正常出貨
              </div>
            )}
          </div>

        </div>
      </motion.div>
    </motion.div>
  );
};
