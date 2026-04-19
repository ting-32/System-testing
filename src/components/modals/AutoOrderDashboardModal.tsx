import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Edit2, CalendarDays, Bot, Search } from 'lucide-react';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [direction, setDirection] = useState(0);

  const getProductName = (id: string) => {
    return products.find(p => p.id === id)?.name || '未知商品';
  };

  const handlePrevDay = () => {
    setDirection(-1);
    setPreviewDate(new Date(previewDate.getTime() - 24 * 60 * 60 * 1000));
  };

  const handleNextDay = () => {
    setDirection(1);
    setPreviewDate(new Date(previewDate.getTime() + 24 * 60 * 60 * 1000));
  };

  const filteredGreenZone = greenZone.filter(c => String(c.name || '').toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredGrayZone = grayZone.filter(c => String(c.name || '').toLowerCase().includes(searchQuery.toLowerCase()));

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 300 : -300,
      opacity: 0
    })
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

          <div className="hidden sm:flex flex-wrap gap-1.5">
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

          <div className="sm:hidden text-[13px] font-medium text-slate-600 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 truncate">
            {!skipReason && defaultItems.length === 0 ? (
              <span className="text-slate-400">目前沒有預設品項</span>
            ) : defaultItems.length > 0 ? (
              <span>{getProductName(defaultItems[0]?.productId)}等共 <span className="font-bold text-slate-800">{defaultItems.length}</span> 項商品</span>
            ) : (
              <span>沒有品項</span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100">
          <button 
            onClick={() => onEditItems(customer)}
            className="flex items-center justify-center gap-1.5 py-2.5 sm:py-2 bg-transparent hover:bg-slate-50 sm:bg-blue-50 text-blue-600 rounded-xl text-sm sm:text-xs font-bold sm:hover:bg-blue-100 transition-colors"
          >
            <Edit2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" /> 修改品項
          </button>
          <button 
            onClick={() => onSetHoliday(customer.id)}
            className="flex items-center justify-center gap-1.5 py-2.5 sm:py-2 bg-transparent hover:bg-slate-50 sm:bg-orange-50 text-orange-600 rounded-xl text-sm sm:text-xs font-bold sm:hover:bg-orange-100 transition-colors"
          >
            <CalendarDays className="w-4 h-4 sm:w-3.5 sm:h-3.5" /> 設定公休
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
      className="fixed inset-0 bg-black/50 flex justify-center items-end sm:items-center p-0 sm:p-4 z-[100]"
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white w-full h-[100dvh] sm:h-[85vh] sm:max-w-5xl rounded-none sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Sticky Header */}
        <div className="p-4 sm:p-6 border-b flex flex-col sticky top-0 bg-white z-10 gap-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex w-10 h-10 rounded-xl bg-gradient-to-br from-morandi-blue to-indigo-500 items-center justify-center text-white shadow-sm">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800">自動建單預覽</h2>
                <p className="hidden sm:block text-xs text-slate-500 font-medium mt-0.5">預測系統執行結果</p>
              </div>
            </div>
            
            {/* Close Button on Mobile */}
            <button onClick={onClose} className="sm:hidden p-2 bg-slate-50 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="搜尋客戶名稱..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-100 border-transparent rounded-xl text-sm focus:bg-white focus:border-morandi-blue focus:ring-2 focus:ring-morandi-blue/20 transition-all outline-none"
              />
            </div>
            {/* Date Controls across full width on mobile */}
            <div className="flex-1 sm:flex-none flex items-center justify-between bg-slate-50 rounded-xl p-1 border border-slate-100">
              <button onClick={handlePrevDay} className="p-2 hover:bg-white rounded-lg transition-colors text-slate-600"><ChevronLeft className="w-5 h-5" /></button>
              <div className="px-2 sm:px-4 font-bold text-sm text-slate-700 sm:min-w-[120px] text-center">
                {formatDateStr(previewDate)}
              </div>
              <button onClick={handleNextDay} className="p-2 hover:bg-white rounded-lg transition-colors text-slate-600"><ChevronRight className="w-5 h-5" /></button>
            </div>
            {/* Close Button on Desktop */}
            <button onClick={onClose} className="hidden sm:block p-2.5 bg-slate-50 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body with Gesture wrapper */}
        <div className="relative overflow-hidden flex-1 bg-white sm:bg-slate-50/50">
          <AnimatePresence initial={false} custom={direction} mode="wait">
            <motion.div
              key={previewDate.toISOString()}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, { offset }) => {
                const swipeThreshold = 50;
                if (offset.x < -swipeThreshold) {
                  handleNextDay();
                } else if (offset.x > swipeThreshold) {
                  handlePrevDay();
                }
              }}
              className="absolute w-full h-full overflow-y-auto p-0 sm:p-6 pb-20 sm:pb-6 space-y-2 sm:space-y-8"
            >
              
              {/* Green Zone */}
              <div className="bg-white sm:bg-emerald-50/50 p-4 sm:p-6 rounded-none sm:rounded-2xl border-b sm:border sm:border-emerald-100">
                <h3 className="text-emerald-700 font-bold mb-4 flex items-center gap-2">
                  <span className="text-xl">✅</span> 預計將自動建單 ({filteredGreenZone.length})
                </h3>
                {filteredGreenZone.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredGreenZone.map(customer => renderCard(customer))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-emerald-600/70 font-medium border border-dashed border-emerald-200 sm:border-none rounded-xl">
                    {searchQuery ? `找不到包含 "${searchQuery}" 的目標` : '🎉 目標日沒有預設訂單需要產生'}
                  </div>
                )}
              </div>

              {/* Gray Zone */}
              <div className="bg-white sm:bg-slate-50 p-4 sm:p-6 rounded-none sm:rounded-2xl border-b-0 sm:border sm:border-slate-200">
                <h3 className="text-slate-500 font-bold mb-4 flex items-center gap-2">
                  <span className="text-xl">⏸️</span> 已暫停或目標日公休 ({filteredGrayZone.length})
                </h3>
                {filteredGrayZone.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-70 grayscale-[20%]">
                    {filteredGrayZone.map(customer => renderCard(customer, customer.skipReason))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400 font-medium">
                    {searchQuery ? `找不到包含 "${searchQuery}" 的目標` : '🚀 所有開啟自動建單的客戶皆正常出貨'}
                  </div>
                )}
              </div>

            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};
