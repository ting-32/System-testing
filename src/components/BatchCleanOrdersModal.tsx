import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Trash2, 
  AlertTriangle, 
  Calendar, 
  Filter, 
  CheckSquare, 
  Square, 
  X, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  ChevronRight,
  RotateCcw,
  Search,
  Tag
} from 'lucide-react';
import localforage from 'localforage';
import { useAuth } from '../context/AuthContext';
import { OrderDispatchItem } from '../pages/OrderDispatchPage';
import { Customer } from '../types';
import { buttonTap } from './animations';

interface BatchCleanOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: OrderDispatchItem[];
  customers?: Customer[];
  onSuccess: (deletedCount: number) => void;
  showToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

type DateQuickOption = '30_DAYS' | '60_DAYS' | 'CUSTOM';

// 莫蘭迪溫潤配色狀態定義
const STATUS_OPTIONS: { id: string; label: string; color: string; isHighRisk?: boolean }[] = [
  { id: 'CANCELLED', label: '已取消 (CANCELLED)', color: 'text-morandi-pebble bg-morandi-oatmeal/60 border-morandi-pebble/20' },
  { id: 'COMPLETED', label: '已送達/完成 (COMPLETED)', color: 'text-morandi-green-text bg-morandi-green-bg border-morandi-green-text/20' },
  { id: 'PAID', label: '已收款結清 (PAID)', color: 'text-morandi-blue bg-morandi-blue/10 border-morandi-blue/20' },
  { id: 'SHIPPED', label: '已出貨/配送中 (SHIPPED)', color: 'text-morandi-amber-text bg-morandi-amber-bg border-morandi-amber-text/20' },
  { id: 'IN_PRODUCTION', label: '製作中 (IN_PRODUCTION)', color: 'text-[#9A6B55] bg-[#F7EFE9] border-[#9A6B55]/20', isHighRisk: true },
  { id: 'PENDING', label: '待處理 (PENDING)', color: 'text-morandi-pink bg-morandi-pink/10 border-morandi-pink/30', isHighRisk: true }
];

export const BatchCleanOrdersModal: React.FC<BatchCleanOrdersModalProps> = ({
  isOpen,
  onClose,
  orders,
  customers = [],
  onSuccess,
  showToast
}) => {
  const { apiFetch, user } = useAuth();

  // 步驟控制：1 = 篩選設定, 2 = 統計與預覽, 3 = 安全解鎖確認
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // 篩選條件
  const [dateQuickOption, setDateQuickOption] = useState<DateQuickOption>('30_DAYS');
  const [beforeDate, setBeforeDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['CANCELLED']);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('ALL');
  const [customerSearchTerm, setCustomerSearchTerm] = useState<string>('');

  // 預覽與個別排除清單 (儲存使用者手動取消勾選不刪除的 ID)
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  // 安全字串輸入
  const [confirmInput, setConfirmInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // 本地快取客戶名單 (以防外部未傳入 customers)
  const [cachedCustomers, setCachedCustomers] = useState<Customer[]>([]);
  React.useEffect(() => {
    if (customers && customers.length > 0) {
      setCachedCustomers(customers);
    } else {
      localforage.getItem<Customer[]>('nm_cache_customers').then(c => {
        if (Array.isArray(c)) setCachedCustomers(c);
      });
    }
  }, [customers]);

  // 所有不重複的店家清單：優先使用系統註冊的「服務店家名單 (CUSTOMERS)」
  // 若包含測試單或歷史單名稱，僅保留有實際在客戶表中的有效店家，過濾掉誤植的純數字（如 35）或符號標記（如 8—）
  const customerOptions = useMemo(() => {
    const validCustomerNames = new Set(
      cachedCustomers
        .map(c => String(c.name || '').trim())
        .filter(n => n.length > 0)
    );

    let names: string[] = [];

    if (validCustomerNames.size > 0) {
      names = Array.from(validCustomerNames) as string[];
    } else if (Array.isArray(orders)) {
      names = Array.from(
        new Set(
          orders
            .map(o => (o && o.customerName != null ? String(o.customerName).trim() : ''))
            .filter(name => {
              if (!name) return false;
              const isPureNumberOrSymbol = /^[\d\s\-_—–.]+$/.test(name);
              return !isPureNumberOrSymbol;
            })
        )
      ) as string[];
    }

    return names.sort((a, b) => String(a).localeCompare(String(b), 'zh-Hant'));
  }, [cachedCustomers, orders]);

  // 根據使用者輸入關鍵字即時過濾店家選單
  const filteredCustomerOptions = useMemo(() => {
    const term = customerSearchTerm.trim().toLowerCase();
    if (!term) return customerOptions;
    return customerOptions.filter(name => name.toLowerCase().includes(term));
  }, [customerOptions, customerSearchTerm]);

  // 切換快捷日期
  const handleQuickDate = (option: DateQuickOption) => {
    setDateQuickOption(option);
    const d = new Date();
    if (option === '30_DAYS') {
      d.setDate(d.getDate() - 30);
      setBeforeDate(d.toISOString().split('T')[0]);
    } else if (option === '60_DAYS') {
      d.setDate(d.getDate() - 60);
      setBeforeDate(d.toISOString().split('T')[0]);
    }
  };

  // 切換狀態勾選
  const handleToggleStatus = (statusId: string) => {
    setSelectedStatuses(prev => {
      if (prev.includes(statusId)) {
        return prev.filter(s => s !== statusId);
      } else {
        return [...prev, statusId];
      }
    });
  };

  // 檢查是否選擇了高風險（未完成）狀態
  const hasHighRiskStatus = useMemo(() => {
    return selectedStatuses.some(s => s === 'PENDING' || s === 'IN_PRODUCTION');
  }, [selectedStatuses]);

  // 初步匹配符合篩選條件的所有訂單
  const matchedOrders = useMemo(() => {
    if (!beforeDate || selectedStatuses.length === 0) return [];

    return orders.filter(order => {
      const orderDate = order.deliveryDate || (order as any).date || '';
      if (orderDate && orderDate > beforeDate) {
        return false;
      }

      const orderStatus = (order.status || 'PENDING').toUpperCase();
      if (!selectedStatuses.includes(orderStatus)) {
        return false;
      }

      if (selectedCustomer !== 'ALL' && order.customerName !== selectedCustomer) {
        return false;
      }

      return true;
    });
  }, [orders, beforeDate, selectedStatuses, selectedCustomer]);

  // 最終欲刪除的訂單 (扣除使用者手動排除的)
  const targetOrders = useMemo(() => {
    return matchedOrders.filter(o => !excludedIds.has(o.order_id));
  }, [matchedOrders, excludedIds]);

  // 安全確認短語
  const requiredPhrase = `確認刪除 ${targetOrders.length} 筆訂單`;
  const isPhraseMatched = confirmInput.trim() === requiredPhrase;

  // 切換單筆排除
  const handleToggleExclude = (orderId: string) => {
    setExcludedIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  // 全選或全不選預覽
  const handleToggleSelectAllPreview = () => {
    if (excludedIds.size === 0) {
      setExcludedIds(new Set(matchedOrders.map(o => o.order_id)));
    } else {
      setExcludedIds(new Set());
    }
  };

  // 重置對話框狀態
  const handleClose = () => {
    if (isDeleting) return;
    setCurrentStep(1);
    setConfirmInput('');
    setExcludedIds(new Set());
    setCustomerSearchTerm('');
    onClose();
  };

  // 執行終極批次刪除
  const handleExecuteBatchDelete = async () => {
    if (!isPhraseMatched || targetOrders.length === 0 || isDeleting) return;

    setIsDeleting(true);
    const targetIds = targetOrders.map(o => o.order_id);

    try {
      const res = await apiFetch('batchDeleteOrders', {
        orderIds: targetIds
      });

      if (res.success) {
        const deletedCount = res.deletedCount !== undefined ? res.deletedCount : targetIds.length;

        try {
          const cachedOrders = await localforage.getItem<any[]>('nm_cache_orders');
          if (Array.isArray(cachedOrders)) {
            const targetSet = new Set(targetIds);
            const cleanedCache = cachedOrders.filter(o => !targetSet.has(String(o.id || o.order_id)));
            await localforage.setItem('nm_cache_orders', cleanedCache);
          }
        } catch (storageErr) {
          console.warn('Local cache cleaning error:', storageErr);
        }

        if (showToast) {
          showToast(`已成功批次清理 ${deletedCount} 筆訂單`, 'success');
        }
        onSuccess(deletedCount);
        handleClose();
      } else {
        if (showToast) {
          showToast(res.error || '批次清理失敗，請確認伺服器日誌', 'error');
        }
      }
    } catch (err: any) {
      if (showToast) {
        showToast('通訊異常或逾時，請檢查網路連線', 'error');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-morandi-charcoal/40 backdrop-blur-xs animate-in fade-in duration-200">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        className="bg-morandi-paper w-full max-w-2xl rounded-[28px] shadow-2xl border border-morandi-oatmeal overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* 標頭 (燕麥柔和底色 + 焦炭黑字) */}
        <div className="px-6 py-4.5 border-b border-morandi-oatmeal flex items-center justify-between bg-morandi-oatmeal/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-morandi-pink/15 text-morandi-pink flex items-center justify-center shadow-xs">
              <Trash2 className="w-5 h-5 stroke-[1.8]" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-morandi-charcoal flex items-center gap-2 tracking-tight">
                條件式快速批次清理訂單
                <span className="text-[10px] font-bold bg-morandi-blue/10 text-morandi-blue px-2.5 py-0.5 rounded-full border border-morandi-blue/20">
                  管理員專用
                </span>
              </h2>
              <p className="text-xs text-morandi-pebble font-medium mt-0.5">
                依日期、狀態或特定店家整批維護已完成或作廢訂單
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isDeleting}
            className="text-morandi-pebble hover:text-morandi-charcoal p-2 rounded-2xl hover:bg-white transition-all cursor-pointer border border-transparent hover:border-morandi-oatmeal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 步驟指示器 (霧霾藍柔和進度條) */}
        <div className="px-6 py-3.5 bg-morandi-paper border-b border-morandi-oatmeal flex items-center justify-between text-xs font-bold">
          <div className={`flex items-center gap-2 ${currentStep === 1 ? 'text-morandi-blue' : 'text-morandi-pebble'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-black transition-all ${
              currentStep === 1 ? 'bg-morandi-blue text-white shadow-xs' : 'bg-morandi-oatmeal text-morandi-pebble'
            }`}>1</span>
            <span>篩選條件</span>
          </div>
          <ChevronRight className="w-4 h-4 text-morandi-pebble/40" />
          <div className={`flex items-center gap-2 ${currentStep === 2 ? 'text-morandi-blue' : 'text-morandi-pebble'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-black transition-all ${
              currentStep === 2 ? 'bg-morandi-blue text-white shadow-xs' : 'bg-morandi-oatmeal text-morandi-pebble'
            }`}>2</span>
            <span>預覽審查 ({matchedOrders.length})</span>
          </div>
          <ChevronRight className="w-4 h-4 text-morandi-pebble/40" />
          <div className={`flex items-center gap-2 ${currentStep === 3 ? 'text-morandi-pink' : 'text-morandi-pebble'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-black transition-all ${
              currentStep === 3 ? 'bg-morandi-pink text-white shadow-xs' : 'bg-morandi-oatmeal text-morandi-pebble'
            }`}>3</span>
            <span>安全解鎖</span>
          </div>
        </div>

        {/* 內容區塊 */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-morandi-paper">
          {/* 步驟 1: 條件篩選 */}
          {currentStep === 1 && (
            <div className="space-y-5">
              {/* 日期區間篩選 */}
              <div className="bg-morandi-oatmeal/40 p-4 rounded-2xl border border-morandi-oatmeal space-y-2.5">
                <label className="text-xs font-bold text-morandi-charcoal flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-morandi-blue" />
                  配送日期早於（含）
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleQuickDate('30_DAYS')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      dateQuickOption === '30_DAYS'
                        ? 'bg-morandi-blue text-white border-morandi-blue shadow-xs'
                        : 'bg-white border-morandi-oatmeal text-morandi-charcoal hover:bg-morandi-oatmeal/50'
                    }`}
                  >
                    30 天以前
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDate('60_DAYS')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      dateQuickOption === '60_DAYS'
                        ? 'bg-morandi-blue text-white border-morandi-blue shadow-xs'
                        : 'bg-white border-morandi-oatmeal text-morandi-charcoal hover:bg-morandi-oatmeal/50'
                    }`}
                  >
                    60 天以前
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateQuickOption('CUSTOM')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      dateQuickOption === 'CUSTOM'
                        ? 'bg-morandi-blue text-white border-morandi-blue shadow-xs'
                        : 'bg-white border-morandi-oatmeal text-morandi-charcoal hover:bg-morandi-oatmeal/50'
                    }`}
                  >
                    自訂指定日期
                  </button>
                </div>
                <input
                  type="date"
                  value={beforeDate}
                  onChange={(e) => {
                    setBeforeDate(e.target.value);
                    setDateQuickOption('CUSTOM');
                  }}
                  className="w-full sm:w-64 px-3.5 py-2 text-xs bg-white border border-morandi-oatmeal rounded-xl focus:border-morandi-blue focus:ring-2 focus:ring-morandi-blue/20 outline-none text-morandi-charcoal font-bold"
                />
              </div>

              {/* 訂單狀態篩選 */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold text-morandi-charcoal flex items-center gap-2">
                  <Filter className="w-4 h-4 text-morandi-blue" />
                  欲清理之訂單狀態（可多選）
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {STATUS_OPTIONS.map(opt => {
                    const isChecked = selectedStatuses.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleToggleStatus(opt.id)}
                        className={`flex items-center justify-between p-3 rounded-2xl border text-xs font-bold transition-all text-left cursor-pointer ${
                          isChecked 
                            ? `${opt.color} ring-2 ring-morandi-blue/30 shadow-xs`
                            : 'bg-white border-morandi-oatmeal text-morandi-pebble hover:bg-morandi-oatmeal/30'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-morandi-blue shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-morandi-pebble/40 shrink-0" />
                          )}
                          <span>{opt.label}</span>
                        </div>
                        {opt.isHighRisk && isChecked && (
                          <span className="text-[10px] text-morandi-amber-text bg-morandi-amber-bg px-2 py-0.5 rounded-full border border-morandi-amber-text/20 font-bold">
                            未出貨單
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* 高風險狀態提示 (莫蘭迪米黃底色) */}
                {hasHighRiskStatus && (
                  <div className="p-3.5 rounded-2xl bg-morandi-amber-bg border border-morandi-amber-text/20 flex items-start gap-3 text-xs text-morandi-amber-text font-medium leading-relaxed">
                    <AlertTriangle className="w-4 h-4 text-morandi-amber-text shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-extrabold">注意：</strong>
                      您勾選了包含「待處理」或「製作中」等尚未出貨之訂單狀態，請確認是否為測試假單或已作廢訂單。
                    </div>
                  </div>
                )}
              </div>

              {/* 店家對象篩選（附帶即時搜尋框） */}
              <div className="bg-morandi-oatmeal/40 p-4 rounded-2xl border border-morandi-oatmeal space-y-2">
                <label className="text-xs font-bold text-morandi-charcoal flex items-center justify-between">
                  <span>特定客戶或測試店家（選填）</span>
                  {selectedCustomer !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCustomer('ALL');
                        setCustomerSearchTerm('');
                      }}
                      className="text-[11px] text-morandi-pink hover:text-morandi-charcoal font-bold cursor-pointer underline"
                    >
                      清除特定選擇 (選全部)
                    </button>
                  )}
                </label>

                {/* 客戶搜尋框 */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-morandi-pebble absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={customerSearchTerm}
                    onChange={(e) => setCustomerSearchTerm(e.target.value)}
                    placeholder="輸入關鍵字搜尋店家名稱（如：民雄、牛肉麵）..."
                    className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-morandi-oatmeal rounded-xl focus:border-morandi-blue focus:ring-2 focus:ring-morandi-blue/20 outline-none transition-all placeholder:text-morandi-pebble/50 text-morandi-charcoal font-bold"
                  />
                  {customerSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setCustomerSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-morandi-pebble hover:text-morandi-charcoal p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* 客戶下拉選單 */}
                <select
                  value={selectedCustomer}
                  onChange={(e) => setSelectedCustomer(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-morandi-oatmeal rounded-xl focus:border-morandi-blue focus:ring-2 focus:ring-morandi-blue/20 outline-none text-morandi-charcoal font-bold"
                >
                  <option value="ALL">全部客戶（不限特定對象）</option>
                  {filteredCustomerOptions.length === 0 ? (
                    <option disabled value="">查無符合「{customerSearchTerm}」的店家</option>
                  ) : (
                    filteredCustomerOptions.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))
                  )}
                </select>
                {customerSearchTerm && filteredCustomerOptions.length > 0 && (
                  <p className="text-[11px] text-morandi-pebble mt-1 font-medium">
                    搜尋符合：共 {filteredCustomerOptions.length} 間店家
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 步驟 2: 統計與清單預覽 */}
          {currentStep === 2 && (
            <div className="space-y-4">
              {/* 目前套用的篩選條件標籤摘要 (燕麥溫潤基底) */}
              <div className="p-4 bg-morandi-oatmeal/50 border border-morandi-oatmeal rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between text-xs font-extrabold text-morandi-charcoal">
                  <span className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-morandi-blue" />
                    套用之篩選條件標籤
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="text-[11px] text-morandi-blue hover:underline font-bold cursor-pointer"
                  >
                    修改條件
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {/* 日期標籤 */}
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-white border border-morandi-oatmeal text-morandi-charcoal shadow-2xs">
                    <Calendar className="w-3 h-3 text-morandi-pebble" />
                    <span>日期 ≤ {beforeDate}</span>
                  </span>

                  {/* 特定店家標籤 */}
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-white border border-morandi-oatmeal text-morandi-charcoal shadow-2xs">
                    <Filter className="w-3 h-3 text-morandi-pebble" />
                    <span>對象：{selectedCustomer === 'ALL' ? '全部客戶' : selectedCustomer}</span>
                  </span>

                  {/* 狀態標籤群 */}
                  {selectedStatuses.map(stId => {
                    const opt = STATUS_OPTIONS.find(s => s.id === stId);
                    return (
                      <span
                        key={stId}
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold border shadow-2xs ${
                          opt ? opt.color : 'bg-white text-morandi-pebble border-morandi-oatmeal'
                        }`}
                      >
                        <span>{opt?.label || stId}</span>
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* 統計指標卡片 (莫蘭迪霧霾藍與煙粉配色) */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-morandi-pink/10 border border-morandi-pink/25 rounded-2xl p-3.5 text-center">
                  <div className="text-[11px] text-morandi-pink font-bold">符合條件總筆數</div>
                  <div className="text-xl font-black text-morandi-charcoal mt-0.5 tracking-tight">
                    {matchedOrders.length} <span className="text-xs font-normal text-morandi-pebble">筆</span>
                  </div>
                </div>
                <div className="bg-morandi-blue/10 border border-morandi-blue/25 rounded-2xl p-3.5 text-center">
                  <div className="text-[11px] text-morandi-blue font-bold">預計清理筆數</div>
                  <div className="text-xl font-black text-morandi-charcoal mt-0.5 tracking-tight">
                    {targetOrders.length} <span className="text-xs font-normal text-morandi-pebble">筆</span>
                  </div>
                </div>
                <div className="bg-morandi-oatmeal/60 border border-morandi-oatmeal rounded-2xl p-3.5 text-center">
                  <div className="text-[11px] text-morandi-pebble font-bold">保留排除筆數</div>
                  <div className="text-xl font-black text-morandi-pebble mt-0.5 tracking-tight">
                    {excludedIds.size} <span className="text-xs font-normal">筆</span>
                  </div>
                </div>
              </div>

              {/* 預覽清單表頭操作 */}
              <div className="flex items-center justify-between text-xs text-morandi-pebble font-medium px-1">
                <span>可個別勾選「排除」不想刪除之特定訂單：</span>
                <button
                  type="button"
                  onClick={handleToggleSelectAllPreview}
                  className="text-morandi-blue hover:underline font-bold cursor-pointer"
                >
                  {excludedIds.size === 0 ? '全部排除' : '全部納入'}
                </button>
              </div>

              {/* 訂單預覽列表 */}
              <div className="border border-morandi-oatmeal rounded-2xl overflow-hidden max-h-60 overflow-y-auto divide-y divide-morandi-oatmeal bg-white shadow-2xs">
                {matchedOrders.length === 0 ? (
                  <div className="p-8 text-center text-xs text-morandi-pebble font-medium">
                    目前沒有符合指定條件之訂單，請回上一步調整篩選條件。
                  </div>
                ) : (
                  matchedOrders.map(order => {
                    const isExcluded = excludedIds.has(order.order_id);
                    return (
                      <div
                        key={order.order_id}
                        onClick={() => handleToggleExclude(order.order_id)}
                        className={`p-3 flex items-center justify-between text-xs transition-colors cursor-pointer ${
                          isExcluded ? 'bg-morandi-oatmeal/40 opacity-50' : 'hover:bg-morandi-oatmeal/30'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {isExcluded ? (
                            <Square className="w-4 h-4 text-morandi-pebble/40 shrink-0" />
                          ) : (
                            <CheckSquare className="w-4 h-4 text-morandi-blue shrink-0" />
                          )}
                          <div>
                            <div className="font-bold text-morandi-charcoal flex items-center gap-2">
                              <span>#{order.order_id}</span>
                              <span className="text-morandi-charcoal/90">{order.customerName}</span>
                            </div>
                            <div className="text-[11px] text-morandi-pebble mt-0.5">
                              配送日：{order.deliveryDate || '未註記'} | 狀態：{order.status}
                            </div>
                          </div>
                        </div>

                        <div>
                          {isExcluded ? (
                            <span className="text-[11px] font-bold text-morandi-pebble bg-morandi-oatmeal px-2.5 py-0.5 rounded-full">
                              已排除保留
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-morandi-pink bg-morandi-pink/15 px-2.5 py-0.5 rounded-full border border-morandi-pink/30">
                              即將清理
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* 步驟 3: 安全確認解鎖 */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-morandi-pink/10 border-2 border-morandi-pink/30 flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-morandi-pink shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-extrabold text-morandi-charcoal">
                    注意：此操作具破壞性且無法直接一鍵復原！
                  </h4>
                  <p className="text-xs text-morandi-charcoal/80 leading-relaxed font-medium">
                    您即將自 Google Sheet 與本系統中永久刪除 <strong>{targetOrders.length}</strong> 筆訂單。
                    系統已自動在 Google 試算表 <code>SystemLogs</code> 建立快照備份日誌。
                  </p>
                </div>
              </div>

              <div className="space-y-2 bg-morandi-oatmeal/40 p-4 rounded-2xl border border-morandi-oatmeal">
                <label className="text-xs font-extrabold text-morandi-charcoal block">
                  請於下方手動輸入安全解鎖字串：
                </label>
                <div className="p-3 bg-white rounded-xl text-xs font-mono font-black text-morandi-charcoal border border-morandi-oatmeal select-all shadow-2xs">
                  {requiredPhrase}
                </div>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder={`請精確輸入「${requiredPhrase}」`}
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-morandi-oatmeal rounded-xl focus:border-morandi-pink focus:ring-2 focus:ring-morandi-pink/20 outline-none transition-all text-morandi-charcoal font-bold"
                  autoFocus
                />
              </div>

              <div className="text-[11px] text-morandi-pebble px-1 font-medium">
                操作主管：<strong className="text-morandi-charcoal font-bold">{user?.name || user?.username || '管理員'}</strong>
              </div>
            </div>
          )}
        </div>

        {/* 底部動作列 (圓潤莫蘭迪按鈕) */}
        <div className="px-6 py-4 bg-morandi-oatmeal/50 border-t border-morandi-oatmeal flex items-center justify-between">
          <div>
            {currentStep > 1 && (
              <motion.button
                whileTap={buttonTap}
                type="button"
                onClick={() => setCurrentStep((prev) => (prev - 1) as any)}
                disabled={isDeleting}
                className="px-4 py-2.5 text-xs font-bold text-morandi-pebble hover:text-morandi-charcoal bg-white hover:bg-morandi-oatmeal border border-morandi-oatmeal rounded-2xl transition-all cursor-pointer shadow-2xs"
              >
                上一步
              </motion.button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <motion.button
              whileTap={buttonTap}
              type="button"
              onClick={handleClose}
              disabled={isDeleting}
              className="px-4 py-2.5 text-xs font-bold text-morandi-pebble hover:text-morandi-charcoal bg-white hover:bg-morandi-oatmeal border border-morandi-oatmeal rounded-2xl transition-all cursor-pointer shadow-2xs"
            >
              取消
            </motion.button>

            {currentStep === 1 && (
              <motion.button
                whileTap={buttonTap}
                type="button"
                onClick={() => setCurrentStep(2)}
                disabled={matchedOrders.length === 0}
                className="px-5 py-2.5 text-xs font-extrabold bg-morandi-blue hover:bg-slate-600 text-white rounded-2xl transition-all disabled:opacity-40 flex items-center gap-2 shadow-sm cursor-pointer"
              >
                <span>預覽符合訂單 ({matchedOrders.length})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </motion.button>
            )}

            {currentStep === 2 && (
              <motion.button
                whileTap={buttonTap}
                type="button"
                onClick={() => setCurrentStep(3)}
                disabled={targetOrders.length === 0}
                className="px-5 py-2.5 text-xs font-extrabold bg-morandi-pink hover:opacity-90 text-white rounded-2xl transition-all disabled:opacity-40 flex items-center gap-2 shadow-sm cursor-pointer"
              >
                <span>下一步：進入安全確認 ({targetOrders.length} 筆)</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </motion.button>
            )}

            {currentStep === 3 && (
              <motion.button
                whileTap={buttonTap}
                type="button"
                onClick={handleExecuteBatchDelete}
                disabled={!isPhraseMatched || isDeleting}
                className="px-6 py-2.5 text-xs font-extrabold bg-morandi-pink hover:opacity-90 text-white rounded-2xl shadow-md transition-all disabled:opacity-30 flex items-center gap-2 cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>伺服器批次清理中...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>確定永久清理</span>
                  </>
                )}
              </motion.button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
