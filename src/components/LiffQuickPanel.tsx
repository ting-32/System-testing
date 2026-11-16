import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  RefreshCw,
  X,
  Check,
  Minus,
  Plus,
  Calendar,
  Trash2,
  Edit3,
  Clock,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  AlertTriangle,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { Customer, Order, OrderItem, OrderStatus, Product, ToastType } from '../types';
import { DELIVERY_METHODS, UNITS, WEEKDAYS } from '../constants';
import { formatDateStr, formatTimeForInput, getTomorrowDate } from '../utils';
import { triggerHaptic } from './animations';
import { HolidayCalendar } from './HolidayCalendar';
import { usePermission } from '../hooks/usePermission';
import { QuickModeAction } from '../utils/quickMode';

interface LiffQuickPanelProps {
  initialAction: QuickModeAction;
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  customers: Customer[];
  products: Product[];
  trips: string[];
  apiEndpoint: string;
  isBackgroundSyncing: boolean;
  isSaving: boolean;
  pendingSyncCount: number;
  isInLiffClient: boolean;
  onRefreshSync: () => void;
  onCloseLiff: () => boolean;
  onSwitchToFullApp: () => void;
  onSwipeStatusChange: (orderId: string, newStatus: OrderStatus) => void;
  saveOrderToCloud: (
    order: Order,
    actionName: string,
    originalVersion: number | undefined,
    onSuccess: (updatedOrder?: Order) => void,
    onError: (msg: string) => void
  ) => Promise<void>;
  onDeleteOrder: (orderId: string, skipConfirm?: boolean) => void;
  onSaveCustomerCloud: (
    finalCustomer: Customer,
    isEditingCustomer: string | null,
    originalLastUpdated: string | undefined,
    previousCustomers: Customer[]
  ) => Promise<boolean>;
  addToast: (msg: string, type: ToastType) => void;
}

const TAB_ITEMS: Array<{ key: QuickModeAction; label: string }> = [
  { key: 'create', label: '新增' },
  { key: 'status', label: '狀態' },
  { key: 'edit', label: '改單' },
  { key: 'holiday', label: '公休' },
  { key: 'delete', label: '刪除' },
];

const STATUS_BUTTONS: Array<{ value: OrderStatus; label: string; activeCls: string }> = [
  {
    value: OrderStatus.PENDING,
    label: '待出貨',
    activeCls: 'bg-[#9C7C58] text-white border-[#9C7C58]',
  },
  {
    value: OrderStatus.SHIPPED,
    label: '已配送',
    activeCls: 'bg-[#5D7586] text-white border-[#5D7586]',
  },
  {
    value: OrderStatus.PAID,
    label: '已收款',
    activeCls: 'bg-[#4A6356] text-white border-[#4A6356]',
  },
];

function formatRoleLabel(role: string): string {
  if (role === 'admin') return '管理員';
  if (role === 'manager') return '領班';
  return '現場同仁';
}

export const LiffQuickPanel: React.FC<LiffQuickPanelProps> = ({
  initialAction,
  orders,
  setOrders,
  customers,
  products,
  trips,
  apiEndpoint,
  isBackgroundSyncing,
  isSaving,
  pendingSyncCount,
  isInLiffClient,
  onRefreshSync,
  onCloseLiff,
  onSwitchToFullApp,
  onSwipeStatusChange,
  saveOrderToCloud,
  onDeleteOrder,
  onSaveCustomerCloud,
  addToast,
}) => {
  const { can, role, userId, userName } = usePermission();

  const [activeTab, setActiveTab] = useState<QuickModeAction>(initialAction || 'status');
  useEffect(() => {
    if (initialAction) setActiveTab(initialAction);
  }, [initialAction]);

  const todayStr = useMemo(() => formatDateStr(new Date()), []);
  const tomorrowStr = useMemo(() => getTomorrowDate(), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return formatDateStr(d);
  }, []);

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNFINISHED' | 'DONE'>('ALL');

  // 改單展開狀態與暫存編輯表單
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    items: OrderItem[];
    deliveryTime: string;
    trip: string;
    note: string;
  } | null>(null);

  // 公休編輯暫存狀態
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [holidayDraft, setHolidayDraft] = useState<{
    offDays: number[];
    holidayDates: string[];
    isPaused: boolean;
  } | null>(null);
  const [showCalendarModal, setShowCalendarModal] = useState(false);

  // 刪除底部確認抽屜
  const [deleteTargetOrder, setDeleteTargetOrder] = useState<Order | null>(null);

  // 新增訂單暫存表單
  const [createCustomerSearch, setCreateCustomerSearch] = useState<string>('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState<boolean>(false);
  const [createDraft, setCreateDraft] = useState<{
    customerId: string;
    customerName: string;
    date: string;
    deliveryTime: string;
    deliveryMethod: string;
    trip: string;
    items: OrderItem[];
    note: string;
  }>(() => ({
    customerId: '',
    customerName: '',
    date: todayStr,
    deliveryTime: '08:00',
    deliveryMethod: '',
    trip: trips[0] || '未分配',
    items: [],
    note: '',
  }));

  const isMockEndpoint = !apiEndpoint || apiEndpoint === 'https://mock-api.local';
  const canEditOrder = can('edit_order');
  const canDeleteOrder = can('delete_order');
  const canUpdateAnyStatus = can('update_any_status');
  const canUpdateOwnStatus = can('update_own_status');

  const productNameMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => {
      if (p.id) map.set(p.id, p);
      if (p.name) map.set(p.name, p);
    });
    return map;
  }, [products]);

  // 過濾當前選定日期的有效訂單
  const dateOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders
      .filter((o) => {
        if (String(o.status) === 'DELETED' || o.pendingAction === 'delete') return false;
        if (o.deliveryDate !== selectedDate) return false;
        if (activeTab === 'status') {
          if (statusFilter === 'UNFINISHED' && (o.status === OrderStatus.SHIPPED || o.status === OrderStatus.PAID)) {
            return false;
          }
          if (statusFilter === 'DONE' && o.status !== OrderStatus.SHIPPED && o.status !== OrderStatus.PAID) {
            return false;
          }
        }
        if (q) {
          const customerHit = (o.customerName || '').toLowerCase().includes(q);
          const itemHit = (o.items || []).some((it) => {
            const pName = it.productName || productNameMap.get(it.productId)?.name || it.productId || '';
            return pName.toLowerCase().includes(q);
          });
          if (!customerHit && !itemHit) return false;
        }
        return true;
      })
      .sort((a, b) => (a.deliveryTime || '99:99').localeCompare(b.deliveryTime || '99:99'));
  }, [orders, selectedDate, activeTab, statusFilter, searchQuery, productNameMap]);

  // 篩選未封存店家（供設定公休分頁使用）
  const activeCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return customers
      .filter((c) => !c.isArchived && (!q || (c.name || '').toLowerCase().includes(q)))
      .sort((a, b) => {
        if (Boolean(b.isWatchlist) !== Boolean(a.isWatchlist)) {
          return b.isWatchlist ? 1 : -1;
        }
        return (a.name || '').localeCompare(b.name || '', 'zh-Hant');
      });
  }, [customers, searchQuery]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );

  // 供「新增訂單」分頁搜尋的未封存店家清單
  const createFilteredCustomers = useMemo(() => {
    const q = createCustomerSearch.trim().toLowerCase();
    return customers
      .filter((c) => !c.isArchived && (!q || (c.name || '').toLowerCase().includes(q)))
      .sort((a, b) => {
        if (Boolean(b.isWatchlist) !== Boolean(a.isWatchlist)) {
          return b.isWatchlist ? 1 : -1;
        }
        return (a.name || '').localeCompare(b.name || '', 'zh-Hant');
      });
  }, [customers, createCustomerSearch]);

  const createMatchedCustomer = useMemo(
    () =>
      customers.find(
        (c) =>
          (createDraft.customerId && c.id === createDraft.customerId) ||
          (createDraft.customerName && c.name === createDraft.customerName)
      ) || null,
    [customers, createDraft.customerId, createDraft.customerName]
  );

  const latestCustomerOrder = useMemo(() => {
    if (!createDraft.customerName) return null;
    return (
      orders.find(
        (o) =>
          o.customerName === createDraft.customerName &&
          String(o.status) !== 'DELETED' &&
          o.pendingAction !== 'delete' &&
          Array.isArray(o.items) &&
          o.items.length > 0
      ) || null
    );
  }, [orders, createDraft.customerName]);

  const createDateExistingCount = useMemo(() => {
    if (!createDraft.customerName || !createDraft.date) return 0;
    return orders.filter(
      (o) =>
        o.customerName === createDraft.customerName &&
        o.deliveryDate === createDraft.date &&
        String(o.status) !== 'DELETED' &&
        o.pendingAction !== 'delete'
    ).length;
  }, [orders, createDraft.customerName, createDraft.date]);

  const isCreateDateCustomerResting = useMemo(() => {
    if (!createMatchedCustomer || !createDraft.date) return false;
    if (createMatchedCustomer.isPaused) return true;
    const d = new Date(createDraft.date + 'T00:00:00');
    const dayOfWeek = isNaN(d.getTime()) ? -1 : d.getDay();
    const offDays = Array.isArray(createMatchedCustomer.offDays) ? createMatchedCustomer.offDays : [];
    const holidayDates = Array.isArray(createMatchedCustomer.holidayDates) ? createMatchedCustomer.holidayDates : [];
    return offDays.includes(dayOfWeek) || holidayDates.includes(createDraft.date);
  }, [createMatchedCustomer, createDraft.date]);

  const buildDefaultRowItem = (): OrderItem => {
    const firstProd = products[0];
    return {
      productId: firstProd?.id || '',
      productName: firstProd?.name || '',
      quantity: 5,
      unit: firstProd?.unit || '斤',
    };
  };

  const mapCustomerDefaultItems = (cust: Customer): OrderItem[] => {
    if (!Array.isArray(cust.defaultItems) || cust.defaultItems.length === 0) return [];
    return cust.defaultItems
      .map((di) => {
        const prod = productNameMap.get(di.productId);
        return {
          productId: prod?.id || di.productId,
          productName: prod?.name || di.productId,
          quantity: Number(di.quantity) > 0 ? Number(di.quantity) : 1,
          unit: di.unit || prod?.unit || '斤',
        };
      })
      .filter((it) => it.productId);
  };

  const selectCustomerForCreate = (cust: Customer) => {
    triggerHaptic();
    const defaultItems = mapCustomerDefaultItems(cust);
    const histOrder =
      orders.find(
        (o) =>
          o.customerName === cust.name &&
          String(o.status) !== 'DELETED' &&
          o.pendingAction !== 'delete' &&
          Array.isArray(o.items) &&
          o.items.length > 0
      ) || null;
    const histItems: OrderItem[] = histOrder
      ? histOrder.items.map((it) => {
          const prod = productNameMap.get(it.productId) || productNameMap.get(it.productName || '');
          return {
            productId: prod?.id || it.productId,
            productName: it.productName || prod?.name || it.productId,
            quantity: Number(it.quantity) > 0 ? Number(it.quantity) : 1,
            unit: it.unit || prod?.unit || '斤',
          };
        })
      : [];

    const initialItems =
      defaultItems.length > 0
        ? defaultItems
        : histItems.length > 0
          ? histItems
          : [buildDefaultRowItem()];

    setCreateDraft((prev) => ({
      ...prev,
      customerId: cust.id,
      customerName: cust.name,
      date: prev.date || selectedDate || todayStr,
      deliveryTime: cust.deliveryTime ? formatTimeForInput(cust.deliveryTime) : prev.deliveryTime || '08:00',
      deliveryMethod: cust.deliveryMethod || '',
      trip: cust.defaultTrip || trips[0] || '未分配',
      items: initialItems,
      note: '',
    }));
    setCreateCustomerSearch('');
  };

  const selectAdhocCustomerForCreate = (rawName: string) => {
    const trimmed = rawName.trim();
    if (!trimmed) return;
    triggerHaptic();
    setCreateDraft((prev) => ({
      ...prev,
      customerId: '',
      customerName: trimmed,
      date: prev.date || selectedDate || todayStr,
      deliveryTime: prev.deliveryTime || '08:00',
      deliveryMethod: prev.deliveryMethod || '',
      trip: prev.trip || trips[0] || '未分配',
      items: prev.items.length > 0 ? prev.items : [buildDefaultRowItem()],
      note: '',
    }));
    setCreateCustomerSearch('');
  };

  const createDraftEstimatedTotal = useMemo(() => {
    return createDraft.items.reduce((sum, it) => {
      const qty = Math.max(0, Number(it.quantity) || 0);
      if (it.unit === '元') return sum + qty;
      const prod = productNameMap.get(it.productId);
      const priceEntry = createMatchedCustomer?.priceList?.find((pl) => pl.productId === it.productId);
      const unitPrice = priceEntry ? priceEntry.price : prod?.price || 0;
      const targetUnit = prod?.unit || '斤';
      const normalizedQty = it.unit === '公斤' && targetUnit === '斤' ? qty * (1000 / 600) : qty;
      return sum + Math.round(normalizedQty * unitPrice);
    }, 0);
  }, [createDraft.items, createMatchedCustomer, productNameMap]);

  const handleCreateOrder = async () => {
    if (isSubmittingCreate) return;
    const customerName = createDraft.customerName.trim();
    if (!customerName) {
      addToast('請先選擇或輸入店家名稱', 'error');
      return;
    }
    const validItems = createDraft.items.filter((it) => it.productId && Number(it.quantity) > 0);
    if (validItems.length === 0) {
      addToast('請至少加入一項數量大於 0 的品項', 'error');
      return;
    }

    setIsSubmittingCreate(true);
    triggerHaptic();

    const now = new Date();
    const deliveryTime =
      createDraft.deliveryTime ||
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const processedItems: OrderItem[] = validItems.map((it) => {
      const prod = productNameMap.get(it.productId);
      const targetUnit = prod?.unit || '斤';
      const priceEntry = createMatchedCustomer?.priceList?.find((pl) => pl.productId === it.productId);
      const unitPrice = priceEntry ? priceEntry.price : prod?.price || 0;

      let finalQuantity = Math.max(0, Number(it.quantity) || 0);
      let finalUnit = it.unit || targetUnit;

      if (finalUnit === '元' && unitPrice > 0) {
        finalQuantity = parseFloat((finalQuantity / unitPrice).toFixed(2));
        finalUnit = targetUnit;
      } else if (finalUnit === '公斤' && targetUnit === '斤') {
        finalQuantity = parseFloat((finalQuantity * (1000 / 600)).toFixed(2));
        finalUnit = '斤';
      }

      return {
        productId: it.productId,
        productName: it.productName || prod?.name || it.productId,
        quantity: Math.max(0, finalQuantity),
        unit: finalUnit,
        unitPrice,
        subtotal: Math.round(unitPrice * Math.max(0, finalQuantity)),
      };
    });

    const timestamp = Date.now();
    const targetDate = createDraft.date || todayStr;
    const newOrder: Order = {
      id: 'ORD-' + timestamp + Math.random().toString(36).substring(2, 6),
      createdAt: new Date().toISOString(),
      customerName,
      deliveryDate: targetDate,
      deliveryTime,
      deliveryMethod: createDraft.deliveryMethod || '',
      trip: createDraft.trip || '未分配',
      source: 'LIFF',
      items: processedItems,
      note: createDraft.note.trim(),
      status: OrderStatus.PENDING,
      syncStatus: 'pending',
      pendingAction: 'create',
      _syncStatus: 'pending',
      _localUpdatedTs: timestamp,
      lastUpdated: timestamp,
      unitPrice: processedItems[0]?.unitPrice,
      subtotal: processedItems.reduce((acc, cur) => acc + (cur.subtotal || 0), 0),
    };

    setOrders((prev) => [newOrder, ...prev]);
    setSelectedDate(targetDate);
    setCreateDraft({
      customerId: '',
      customerName: '',
      date: targetDate,
      deliveryTime: '08:00',
      deliveryMethod: '',
      trip: trips[0] || '未分配',
      items: [],
      note: '',
    });
    setIsSubmittingCreate(false);
    addToast(`已建立「${customerName}」訂單 (${targetDate})`, 'success');

    await saveOrderToCloud(
      newOrder,
      'createOrder',
      undefined,
      () => {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === newOrder.id
              ? { ...o, syncStatus: 'synced', pendingAction: undefined, _syncStatus: 'synced' }
              : o
          )
        );
      },
      (errMsg) => {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === newOrder.id
              ? { ...o, syncStatus: 'error', errorMessage: errMsg, _syncStatus: 'error' }
              : o
          )
        );
        addToast('訂單建立同步失敗，請點擊重新整理', 'error');
      }
    );
  };

  const canModifyThisOrderStatus = (order: Order): boolean => {
    if (canUpdateAnyStatus) return true;
    if (!canUpdateOwnStatus) return false;
    const assignedTo = String(order.assignedTo || '').trim();
    const assignedName = String(order.assignedName || '').trim();
    if (!assignedTo && !assignedName) return false;
    return assignedTo === userId || assignedName === userName;
  };

  const openOrderEditor = (order: Order) => {
    if (expandedOrderId === order.id) {
      setExpandedOrderId(null);
      setEditDraft(null);
      return;
    }
    triggerHaptic();
    setExpandedOrderId(order.id);
    setEditDraft({
      items: (order.items || []).map((it) => ({
        ...it,
        productName: it.productName || productNameMap.get(it.productId)?.name || it.productId,
        unit: it.unit || productNameMap.get(it.productId)?.unit || '斤',
      })),
      deliveryTime: order.deliveryTime || '',
      trip: order.trip || '未分配',
      note: order.note || '',
    });
  };

  const handleSaveOrderEdit = async (order: Order) => {
    if (!editDraft) return;
    const validItems = editDraft.items.filter((it) => it.productId && Number(it.quantity) > 0);
    if (validItems.length === 0) {
      addToast('至少保留一項有效數量品項', 'error');
      return;
    }

    triggerHaptic();
    const cust = customers.find((c) => c.name === order.customerName);
    const processedItems: OrderItem[] = validItems.map((it) => {
      const prod = productNameMap.get(it.productId);
      const priceEntry = cust?.priceList?.find((pl) => pl.productId === it.productId);
      const unitPrice = priceEntry ? priceEntry.price : prod?.price || it.unitPrice || 0;
      const qty = Math.max(0, Number(it.quantity) || 0);
      return {
        ...it,
        productName: it.productName || prod?.name || it.productId,
        quantity: qty,
        unit: it.unit || prod?.unit || '斤',
        unitPrice,
        subtotal: it.unit === '元' ? qty : Math.round(qty * unitPrice),
      };
    });

    const now = Date.now();
    const updatedOrder: Order = {
      ...order,
      items: processedItems,
      deliveryTime: editDraft.deliveryTime,
      trip: editDraft.trip || '未分配',
      note: editDraft.note,
      syncStatus: 'pending',
      pendingAction: 'update',
      _syncStatus: 'pending',
      _localUpdatedTs: now,
      lastUpdated: now,
      subtotal: processedItems.reduce((sum, cur) => sum + (cur.subtotal || 0), 0),
    };

    setOrders((prev) => prev.map((o) => (o.id === order.id ? updatedOrder : o)));
    setExpandedOrderId(null);
    setEditDraft(null);
    addToast(`已更新 ${order.customerName} 訂單內容`, 'success');

    await saveOrderToCloud(
      updatedOrder,
      'updateOrderContent',
      order.version,
      () => {},
      (errMsg) => {
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? { ...o, syncStatus: 'error', errorMessage: errMsg, _syncStatus: 'error' } : o))
        );
        addToast('訂單同步失敗，請點擊重新整理', 'error');
      }
    );
  };

  const openHolidayEditor = (cust: Customer) => {
    triggerHaptic();
    setSelectedCustomerId(cust.id);
    setHolidayDraft({
      offDays: Array.isArray(cust.offDays) ? [...cust.offDays] : [],
      holidayDates: Array.isArray(cust.holidayDates) ? [...cust.holidayDates] : [],
      isPaused: Boolean(cust.isPaused),
    });
  };

  const handleSaveHoliday = async () => {
    if (!selectedCustomer || !holidayDraft || isSaving) return;
    triggerHaptic();
    const updatedCustomer: Customer = {
      ...selectedCustomer,
      offDays: [...holidayDraft.offDays].sort((a, b) => a - b),
      holidayDates: Array.from(new Set(holidayDraft.holidayDates)).sort(),
      isPaused: holidayDraft.isPaused,
    };

    const ok = await onSaveCustomerCloud(
      updatedCustomer,
      selectedCustomer.id,
      selectedCustomer.lastUpdated ? String(selectedCustomer.lastUpdated) : undefined,
      customers
    );
    if (ok) {
      setSelectedCustomerId(null);
      setHolidayDraft(null);
    }
  };

  const handleCloseAction = () => {
    const closedInLiff = onCloseLiff();
    if (!closedInLiff) {
      onSwitchToFullApp();
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#F2F0E9] text-[#3E3C3A] max-w-lg mx-auto">
      {/* 精簡單列頂部列 (高度控制在 52px，符合行動裝置置頂不佔空間規範) */}
      <header className="sticky top-0 z-30 h-[52px] px-4 bg-[#FFFFFF]/95 backdrop-blur-md border-b border-black/[0.06] flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-baseline gap-2">
          <h1 className="text-base font-bold tracking-tight text-[#3E3C3A] whitespace-nowrap truncate">
            快速操作面板
          </h1>
          <span className="text-xs text-[#8C8984] whitespace-nowrap truncate">
            {userName || '同仁'} · {formatRoleLabel(role)}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic();
              onRefreshSync();
            }}
            aria-label="重新同步雲端資料"
            className="min-h-[44px] min-w-[44px] px-2 flex items-center justify-center gap-1.5 text-xs font-medium text-[#5D7586] rounded-lg active:bg-[#F2F0E9] transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${isBackgroundSyncing ? 'animate-spin' : ''}`} />
            {pendingSyncCount > 0 && (
              <span className="tabular-nums font-semibold text-[#9C7C58]">待傳 {pendingSyncCount}</span>
            )}
          </button>

          <button
            type="button"
            onClick={handleCloseAction}
            className="min-h-[44px] px-3 flex items-center justify-center gap-1 text-xs font-semibold text-[#3E3C3A] bg-[#F2F0E9] hover:bg-[#E7E4DC] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {isInLiffClient ? (
              <>
                <X className="w-4 h-4" />
                <span>回 LINE</span>
              </>
            ) : (
              <>
                <ExternalLink className="w-3.5 h-3.5" />
                <span>完整版</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* 警告：若新 WebView 尚未設定 GAS 端點 */}
      {isMockEndpoint && (
        <div className="mx-4 mt-3 p-3.5 bg-[#F9F1E6] border border-[#9C7C58]/30 rounded-xl flex items-start gap-2.5 text-xs text-[#9C7C58]">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            目前為離線模擬端點，異動不會寫入正式 Google 試算表。請在部署環境設定 <span className="font-mono font-semibold">VITE_API_URL</span> 或先進入完整版設定 GAS 網址。
          </div>
        </div>
      )}

      {/* 5 大操作分段控制器（支援 0ms 互切，不須關掉 LINE WebView 重開） */}
      <div className="px-4 pt-3 pb-2">
        <div className="grid grid-cols-5 gap-1 p-1 bg-[#E7E4DC]/80 rounded-xl">
          {TAB_ITEMS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  triggerHaptic();
                  setActiveTab(tab.key);
                  setExpandedOrderId(null);
                }}
                className={`min-h-[44px] px-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-[#FFFFFF] text-[#3E3C3A] shadow-sm'
                    : 'text-[#8C8984] hover:text-[#3E3C3A]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 搜尋列 + 訂單日期快切（新增訂單與公休分頁各有專屬操作列） */}
      {activeTab !== 'create' && (
        <div className="px-4 pb-3 space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-[#8C8984] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === 'holiday' ? '搜尋店家名稱…' : '搜尋店家名稱或麵類品項…'}
            className="w-full min-h-[44px] pl-10 pr-9 bg-[#FFFFFF] border border-black/[0.08] rounded-xl text-sm text-[#3E3C3A] placeholder:text-[#8C8984] outline-none focus:border-[#5D7586]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="清除搜尋"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-[#8C8984]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {activeTab !== 'holiday' && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-[#FFFFFF] p-1 rounded-xl border border-black/[0.06]">
              {[
                { label: '昨天', val: yesterdayStr },
                { label: '今天', val: todayStr },
                { label: '明天', val: tomorrowStr },
              ].map((d) => (
                <button
                  key={d.val}
                  type="button"
                  onClick={() => setSelectedDate(d.val)}
                  className={`min-h-[36px] px-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    selectedDate === d.val ? 'bg-[#5D7586] text-white' : 'text-[#8C8984] hover:text-[#3E3C3A]'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="min-h-[44px] px-2.5 bg-[#FFFFFF] border border-black/[0.08] rounded-xl text-xs font-semibold text-[#3E3C3A] tabular-nums outline-none focus:border-[#5D7586]"
            />
          </div>
        )}

        {activeTab === 'status' && (
          <div className="flex items-center justify-between text-xs text-[#8C8984] pt-0.5">
            <div className="flex items-center gap-1">
              {[
                { key: 'ALL', label: '全部' },
                { key: 'UNFINISHED', label: '未送達' },
                { key: 'DONE', label: '已完成' },
              ].map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setStatusFilter(f.key as any)}
                  className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap shrink-0 ${
                    statusFilter === f.key
                      ? 'bg-[#3E3C3A] text-white'
                      : 'text-[#8C8984] hover:text-[#3E3C3A]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <span className="tabular-nums">共 {dateOrders.length} 筆</span>
          </div>
        )}
        </div>
      )}

      {/* 主操作清單區域 */}
      <main className="flex-1 px-4 space-y-3 pb-[max(24px,env(safe-area-inset-bottom))]">
        {/* === 分頁 0：➕ 新增訂單 === */}
        {activeTab === 'create' && (
          <div className="space-y-3 pt-1">
            {!createDraft.customerName ? (
              <div className="bg-[#FFFFFF] rounded-2xl border border-black/[0.06] p-4 shadow-[0_2px_10px_rgba(62,60,58,0.03)] space-y-3">
                <div>
                  <h2 className="text-base font-bold text-[#3E3C3A]">選擇要建單的店家</h2>
                  <p className="text-xs text-[#8C8984] mt-0.5">
                    點選店家會自動帶入常規品項／上次訂單、時間與車趟
                  </p>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-[#8C8984] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={createCustomerSearch}
                    onChange={(e) => setCreateCustomerSearch(e.target.value)}
                    placeholder="搜尋店家名稱或輸入散客店名…"
                    className="w-full min-h-[44px] pl-10 pr-9 bg-[#F2F0E9]/60 border border-black/[0.08] rounded-xl text-sm text-[#3E3C3A] placeholder:text-[#8C8984] outline-none focus:border-[#5D7586]"
                  />
                  {createCustomerSearch && (
                    <button
                      type="button"
                      onClick={() => setCreateCustomerSearch('')}
                      aria-label="清除店家搜尋"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-[#8C8984]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {createCustomerSearch.trim() &&
                  !customers.some(
                    (c) => !c.isArchived && c.name.trim() === createCustomerSearch.trim()
                  ) && (
                    <button
                      type="button"
                      onClick={() => selectAdhocCustomerForCreate(createCustomerSearch)}
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#F2F0E9] hover:bg-[#E7E4DC] text-left text-xs font-bold text-[#5D7586] flex items-center justify-between transition-colors"
                    >
                      <span>＋ 直接以「{createCustomerSearch.trim()}」新增散客訂單</span>
                      <Plus className="w-4 h-4 shrink-0" />
                    </button>
                  )}

                <div className="divide-y divide-slate-100 max-h-[58dvh] overflow-y-auto">
                  {createFilteredCustomers.length === 0 ? (
                    <p className="py-8 text-center text-xs text-[#8C8984]">
                      查無符合的店家，可直接點上方按鈕建立散客訂單
                    </p>
                  ) : (
                    createFilteredCustomers.map((cust) => {
                      const d = new Date((createDraft.date || todayStr) + 'T00:00:00');
                      const dow = isNaN(d.getTime()) ? -1 : d.getDay();
                      const isResting =
                        Boolean(cust.isPaused) ||
                        (cust.offDays || []).includes(dow) ||
                        (cust.holidayDates || []).includes(createDraft.date || todayStr);
                      const hasDefault = Array.isArray(cust.defaultItems) && cust.defaultItems.length > 0;

                      return (
                        <button
                          key={cust.id}
                          type="button"
                          onClick={() => selectCustomerForCreate(cust)}
                          className="w-full py-3 px-1 text-left flex items-center justify-between gap-2 min-h-[48px] active:bg-[#F2F0E9]/60 rounded-lg transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-[#3E3C3A] truncate">
                              {cust.isWatchlist ? '★ ' : ''}
                              {cust.name}
                            </div>
                            <div className="text-xs text-[#8C8984] mt-0.5 tabular-nums truncate">
                              {cust.deliveryTime || '未設時間'}
                              <span aria-hidden="true"> · </span>
                              {cust.defaultTrip || '未設車趟'}
                              {hasDefault && ` · 常規 ${cust.defaultItems.length} 項`}
                              {isResting && ' · 公休／暫停'}
                            </div>
                          </div>
                          <span className="text-xs font-semibold text-[#5D7586] shrink-0 whitespace-nowrap">
                            選擇 →
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-[#FFFFFF] rounded-2xl border border-black/[0.06] p-4 shadow-[0_2px_10px_rgba(62,60,58,0.03)] space-y-4">
                {/* 已選店家標頭 + 更換 + 一鍵帶入 */}
                <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#8C8984]">新增訂單店家</div>
                    <h2 className="text-lg font-bold text-[#3E3C3A] truncate">
                      {createDraft.customerName}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setCreateDraft((prev) => ({
                        ...prev,
                        customerId: '',
                        customerName: '',
                      }))
                    }
                    className="min-h-[36px] px-3 rounded-lg bg-[#F2F0E9] hover:bg-[#E7E4DC] text-xs font-bold text-[#3E3C3A] shrink-0 whitespace-nowrap"
                  >
                    更換店家
                  </button>
                </div>

                {/* 一鍵快速帶入常規品項／上次訂單 */}
                {(createMatchedCustomer?.defaultItems?.length || latestCustomerOrder) && (
                  <div className="flex flex-wrap gap-2">
                    {createMatchedCustomer && createMatchedCustomer.defaultItems?.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic();
                          const mapped = mapCustomerDefaultItems(createMatchedCustomer);
                          if (mapped.length > 0) {
                            setCreateDraft((prev) => ({ ...prev, items: mapped }));
                            addToast('已帶入店家常規品項', 'info');
                          }
                        }}
                        className="min-h-[38px] px-3 rounded-lg bg-[#F2F0E9] hover:bg-[#E7E4DC] text-xs font-bold text-[#4A6356] whitespace-nowrap"
                      >
                        帶入常規品項（{createMatchedCustomer.defaultItems.length}）
                      </button>
                    )}
                    {latestCustomerOrder && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic();
                          const mapped = latestCustomerOrder.items.map((it) => {
                            const prod =
                              productNameMap.get(it.productId) ||
                              productNameMap.get(it.productName || '');
                            return {
                              productId: prod?.id || it.productId,
                              productName: it.productName || prod?.name || it.productId,
                              quantity: Number(it.quantity) > 0 ? Number(it.quantity) : 1,
                              unit: it.unit || prod?.unit || '斤',
                            };
                          });
                          if (mapped.length > 0) {
                            setCreateDraft((prev) => ({ ...prev, items: mapped }));
                            addToast(`已帶入最近一次（${latestCustomerOrder.deliveryDate}）品項`, 'info');
                          }
                        }}
                        className="min-h-[38px] px-3 rounded-lg bg-[#F2F0E9] hover:bg-[#E7E4DC] text-xs font-bold text-[#5D7586] whitespace-nowrap"
                      >
                        帶入上次訂單
                      </button>
                    )}
                  </div>
                )}

                {/* 公休與重複訂單行內提醒 */}
                {isCreateDateCustomerResting && (
                  <div className="p-3 bg-[#F9F1E6] border border-[#9C7C58]/30 rounded-xl flex items-start gap-2 text-xs text-[#9C7C58]">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      注意：此店家在 {createDraft.date} 設定為公休／暫停供貨，若仍需配送可直接建立訂單。
                    </span>
                  </div>
                )}

                {createDateExistingCount > 0 && (
                  <div className="p-3 bg-[#F2F0E9] border border-[#5D7586]/25 rounded-xl flex items-start gap-2 text-xs text-[#5D7586]">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      此店家在 {createDraft.date} 已有 {createDateExistingCount} 筆訂單，本次送出將「追加」一筆新訂單。
                    </span>
                  </div>
                )}

                {/* 配送日期快選 + 日期欄位 */}
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-[#8C8984]">配送日期</div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 bg-[#F2F0E9]/80 p-1 rounded-xl">
                      {[
                        { label: '昨天', val: yesterdayStr },
                        { label: '今天', val: todayStr },
                        { label: '明天', val: tomorrowStr },
                      ].map((d) => (
                        <button
                          key={d.val}
                          type="button"
                          onClick={() => setCreateDraft((prev) => ({ ...prev, date: d.val }))}
                          className={`min-h-[36px] px-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                            createDraft.date === d.val
                              ? 'bg-[#5D7586] text-white'
                              : 'text-[#8C8984] hover:text-[#3E3C3A]'
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>

                    <input
                      type="date"
                      value={createDraft.date}
                      onChange={(e) =>
                        e.target.value && setCreateDraft((prev) => ({ ...prev, date: e.target.value }))
                      }
                      className="min-h-[44px] px-2.5 bg-[#F2F0E9]/60 border border-black/[0.08] rounded-xl text-xs font-semibold text-[#3E3C3A] tabular-nums outline-none focus:border-[#5D7586]"
                    />
                  </div>
                </div>

                {/* 品項步進器清單 */}
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#8C8984]">訂購品項明細</span>
                    {createDraftEstimatedTotal > 0 && (
                      <span className="text-xs font-bold text-[#4A6356] tabular-nums">
                        預計金額：${createDraftEstimatedTotal.toLocaleString()}
                      </span>
                    )}
                  </div>

                  {createDraft.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="space-y-2 pb-2.5 border-b border-slate-100 last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <select
                          value={item.productId}
                          onChange={(e) => {
                            const pid = e.target.value;
                            const prod = productNameMap.get(pid);
                            setCreateDraft((prev) => {
                              const nextItems = [...prev.items];
                              nextItems[idx] = {
                                ...nextItems[idx],
                                productId: pid,
                                productName: prod?.name || pid,
                                unit: prod?.unit || nextItems[idx].unit || '斤',
                              };
                              return { ...prev, items: nextItems };
                            });
                          }}
                          className="flex-1 min-h-[44px] px-2.5 bg-[#F2F0E9]/70 rounded-xl text-sm font-semibold text-[#3E3C3A] border border-black/[0.08] outline-none"
                        >
                          {!productNameMap.has(item.productId) && (
                            <option value={item.productId}>{item.productName || item.productId}</option>
                          )}
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>

                        {createDraft.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setCreateDraft((prev) => ({
                                ...prev,
                                items: prev.items.filter((_, i) => i !== idx),
                              }))
                            }
                            aria-label="移除品項"
                            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setCreateDraft((prev) => {
                              const nextItems = [...prev.items];
                              const curr = Number(nextItems[idx].quantity) || 0;
                              nextItems[idx] = { ...nextItems[idx], quantity: Math.max(0, curr - 1) };
                              return { ...prev, items: nextItems };
                            })
                          }
                          aria-label="減少數量"
                          className="min-h-[44px] min-w-[48px] flex items-center justify-center rounded-xl bg-[#F2F0E9] text-[#3E3C3A] font-bold active:scale-95"
                        >
                          <Minus className="w-4 h-4" />
                        </button>

                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.5"
                          min="0"
                          value={item.quantity === 0 ? '' : item.quantity}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setCreateDraft((prev) => {
                              const nextItems = [...prev.items];
                              nextItems[idx] = {
                                ...nextItems[idx],
                                quantity: isNaN(val) ? 0 : Math.max(0, val),
                              };
                              return { ...prev, items: nextItems };
                            });
                          }}
                          className="flex-1 min-h-[44px] text-center text-base font-bold tabular-nums bg-[#FFFFFF] border border-black/[0.12] rounded-xl outline-none focus:border-[#5D7586]"
                        />

                        <button
                          type="button"
                          onClick={() =>
                            setCreateDraft((prev) => {
                              const nextItems = [...prev.items];
                              const curr = Number(nextItems[idx].quantity) || 0;
                              nextItems[idx] = { ...nextItems[idx], quantity: curr + 1 };
                              return { ...prev, items: nextItems };
                            })
                          }
                          aria-label="增加數量"
                          className="min-h-[44px] min-w-[48px] flex items-center justify-center rounded-xl bg-[#F2F0E9] text-[#3E3C3A] font-bold active:scale-95"
                        >
                          <Plus className="w-4 h-4" />
                        </button>

                        <select
                          value={item.unit || '斤'}
                          onChange={(e) =>
                            setCreateDraft((prev) => {
                              const nextItems = [...prev.items];
                              nextItems[idx] = { ...nextItems[idx], unit: e.target.value };
                              return { ...prev, items: nextItems };
                            })
                          }
                          className="min-h-[44px] px-2.5 bg-[#F2F0E9]/70 rounded-xl text-sm font-semibold text-[#3E3C3A] border border-black/[0.08]"
                        >
                          {UNITS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() =>
                      setCreateDraft((prev) => ({
                        ...prev,
                        items: [...prev.items, buildDefaultRowItem()],
                      }))
                    }
                    className="w-full min-h-[44px] rounded-xl border border-dashed border-[#5D7586]/50 text-xs font-bold text-[#5D7586] flex items-center justify-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    新增品項
                  </button>
                </div>

                {/* 時間 / 車趟 / 配送方式 / 備註 */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <Clock className="w-3.5 h-3.5 text-[#8C8984] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="time"
                      value={createDraft.deliveryTime}
                      onChange={(e) =>
                        setCreateDraft((prev) => ({ ...prev, deliveryTime: e.target.value }))
                      }
                      className="w-full min-h-[44px] pl-8 pr-2 bg-[#F2F0E9]/60 border border-black/[0.08] rounded-xl text-xs font-semibold tabular-nums"
                    />
                  </div>

                  <select
                    value={createDraft.trip}
                    onChange={(e) =>
                      setCreateDraft((prev) => ({ ...prev, trip: e.target.value }))
                    }
                    className="w-full min-h-[44px] px-2.5 bg-[#F2F0E9]/60 border border-black/[0.08] rounded-xl text-xs font-semibold"
                  >
                    {!trips.includes('未分配') && <option value="未分配">未分配</option>}
                    {createDraft.trip &&
                      createDraft.trip !== '未分配' &&
                      !trips.includes(createDraft.trip) && (
                        <option value={createDraft.trip}>{createDraft.trip}</option>
                      )}
                    {trips.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <select
                  value={createDraft.deliveryMethod}
                  onChange={(e) =>
                    setCreateDraft((prev) => ({ ...prev, deliveryMethod: e.target.value }))
                  }
                  className="w-full min-h-[44px] px-3 bg-[#F2F0E9]/60 border border-black/[0.08] rounded-xl text-xs font-semibold"
                >
                  <option value="">未指定配送方式</option>
                  {DELIVERY_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  value={createDraft.note}
                  onChange={(e) =>
                    setCreateDraft((prev) => ({ ...prev, note: e.target.value }))
                  }
                  placeholder="訂單備註（選填，如：先冰存、放門口）"
                  className="w-full min-h-[44px] px-3 bg-[#F2F0E9]/60 border border-black/[0.08] rounded-xl text-xs"
                />

                <button
                  type="button"
                  disabled={isSubmittingCreate}
                  onClick={handleCreateOrder}
                  className="w-full min-h-[48px] rounded-xl bg-[#4A6356] hover:bg-[#3D5247] disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-all"
                >
                  {isSubmittingCreate ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  確認建立訂單
                </button>
              </div>
            )}
          </div>
        )}

        {/* 分頁 1 & 2 & 4 共用的無權限提示 */}
        {activeTab === 'edit' && !canEditOrder && (
          <div className="p-4 bg-[#FFFFFF] rounded-2xl border border-black/[0.06] flex items-center gap-3 text-sm text-[#8C8984]">
            <ShieldAlert className="w-5 h-5 text-[#9C7C58] shrink-0" />
            <span>目前帳號權限（{formatRoleLabel(role)}）未開放修改訂單內容，僅可更改配送狀態。</span>
          </div>
        )}

        {activeTab === 'delete' && !canDeleteOrder && (
          <div className="p-4 bg-[#FFFFFF] rounded-2xl border border-black/[0.06] flex items-center gap-3 text-sm text-[#8C8984]">
            <ShieldAlert className="w-5 h-5 text-[#9C7C58] shrink-0" />
            <span>刪除訂單僅限管理員（或具備刪除權限的帳號）操作。</span>
          </div>
        )}

        {/* === 分頁 1 / 2 / 4：訂單操作卡片 === */}
        {activeTab !== 'holiday' && activeTab !== 'create' && (
          <>
            {dateOrders.length === 0 ? (
              <div className="py-14 px-6 text-center bg-[#FFFFFF] rounded-2xl border border-black/[0.06]">
                <p className="text-sm font-semibold text-[#3E3C3A]">
                  {selectedDate} 查無符合的訂單
                </p>
                <p className="text-xs text-[#8C8984] mt-1">
                  可切換上方日期或清除搜尋關鍵字
                </p>
              </div>
            ) : (
              dateOrders.map((order) => {
                const isExpanded = expandedOrderId === order.id;
                const isSyncError = order.syncStatus === 'error' || order._syncStatus === 'error';
                const isSyncPending = order.syncStatus === 'pending' || order._syncStatus === 'pending';
                const allowedStatus = canModifyThisOrderStatus(order);

                return (
                  <div
                    key={order.id}
                    className="bg-[#FFFFFF] rounded-2xl border border-black/[0.06] p-4 shadow-[0_2px_10px_rgba(62,60,58,0.03)]"
                  >
                    {/* 卡片標頭 + 潔淨排版分隔資訊（零膠囊標籤） */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="text-base font-bold text-[#3E3C3A] truncate">
                          {order.customerName}
                        </h2>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#8C8984] mt-0.5 tabular-nums">
                          <span>{order.deliveryTime || '未指定時間'}</span>
                          <span aria-hidden="true">·</span>
                          <span>{order.trip || '未排趟'}</span>
                          {order.deliveryMethod && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{order.deliveryMethod}</span>
                            </>
                          )}
                          {order.assignedName && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>司機：{order.assignedName}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-xs font-medium shrink-0 whitespace-nowrap">
                        {isSyncError ? (
                          <span className="text-rose-600">同步失敗</span>
                        ) : isSyncPending ? (
                          <span className="text-[#9C7C58]">同步中…</span>
                        ) : (
                          <span className="text-[#8C8984]">已同步</span>
                        )}
                      </div>
                    </div>

                    {/* 品項清單 */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1 text-sm">
                      {(order.items || []).map((item, idx) => {
                        const pName =
                          item.productName || productNameMap.get(item.productId)?.name || item.productId;
                        return (
                          <div key={idx} className="flex items-center justify-between gap-2">
                            <span className="text-[#3E3C3A] truncate">{pName}</span>
                            <span className="font-bold text-[#3E3C3A] tabular-nums whitespace-nowrap shrink-0">
                              × {item.quantity} {item.unit || '斤'}
                            </span>
                          </div>
                        );
                      })}
                      {order.note && (
                        <p className="text-xs text-[#9C7C58] pt-1">備註：{order.note}</p>
                      )}
                    </div>

                    {/* 分頁 1：更改狀態（3 大按鈕單指點擊） */}
                    {activeTab === 'status' && (
                      <div className="mt-3.5 pt-3 border-t border-slate-100">
                        {!allowedStatus ? (
                          <p className="text-xs text-[#8C8984]">此單未指派給您，無法變更狀態</p>
                        ) : (
                          <div className="grid grid-cols-3 gap-2">
                            {STATUS_BUTTONS.map((btn) => {
                              const isCurrent = order.status === btn.value;
                              return (
                                <button
                                  key={btn.value}
                                  type="button"
                                  onClick={() => {
                                    if (order.status === btn.value) return;
                                    triggerHaptic();
                                    onSwipeStatusChange(order.id, btn.value);
                                  }}
                                  className={`min-h-[44px] rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1 whitespace-nowrap active:scale-[0.98] ${
                                    isCurrent
                                      ? btn.activeCls
                                      : 'bg-[#F2F0E9]/60 text-[#3E3C3A] border-transparent hover:bg-[#F2F0E9]'
                                  }`}
                                >
                                  {isCurrent && <Check className="w-3.5 h-3.5 shrink-0" />}
                                  <span>{btn.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 分頁 2：修改訂單（行內展開步進器） */}
                    {activeTab === 'edit' && canEditOrder && (
                      <div className="mt-3.5 pt-3 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => openOrderEditor(order)}
                          className="w-full min-h-[44px] px-3 rounded-xl bg-[#F2F0E9] hover:bg-[#E7E4DC] text-xs font-bold text-[#3E3C3A] flex items-center justify-between transition-colors"
                        >
                          <span className="flex items-center gap-1.5">
                            <Edit3 className="w-4 h-4 text-[#5D7586]" />
                            {isExpanded ? '收合修改表單' : '調整品項數量 / 時間 / 備註'}
                          </span>
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        {isExpanded && editDraft && (
                          <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                            {editDraft.items.map((item, idx) => (
                              <div key={idx} className="space-y-2 pb-2.5 border-b border-slate-100 last:border-b-0">
                                <div className="flex items-center gap-2">
                                  <select
                                    value={item.productId}
                                    onChange={(e) => {
                                      const pid = e.target.value;
                                      const prod = productNameMap.get(pid);
                                      setEditDraft((prev) => {
                                        if (!prev) return prev;
                                        const nextItems = [...prev.items];
                                        nextItems[idx] = {
                                          ...nextItems[idx],
                                          productId: pid,
                                          productName: prod?.name || pid,
                                          unit: prod?.unit || nextItems[idx].unit || '斤',
                                        };
                                        return { ...prev, items: nextItems };
                                      });
                                    }}
                                    className="flex-1 min-h-[44px] px-2.5 bg-[#F2F0E9]/70 rounded-xl text-sm font-semibold text-[#3E3C3A] border border-black/[0.08] outline-none"
                                  >
                                    {!productNameMap.has(item.productId) && (
                                      <option value={item.productId}>{item.productName || item.productId}</option>
                                    )}
                                    {products.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name}
                                      </option>
                                    ))}
                                  </select>

                                  {editDraft.items.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setEditDraft((prev) =>
                                          prev ? { ...prev, items: prev.items.filter((_, i) => i !== idx) } : prev
                                        )
                                      }
                                      aria-label="移除品項"
                                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rose-600 hover:bg-rose-50"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>

                                {/* 大觸控步進器 */}
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditDraft((prev) => {
                                        if (!prev) return prev;
                                        const nextItems = [...prev.items];
                                        const curr = Number(nextItems[idx].quantity) || 0;
                                        nextItems[idx] = { ...nextItems[idx], quantity: Math.max(0, curr - 1) };
                                        return { ...prev, items: nextItems };
                                      })
                                    }
                                    aria-label="減少數量"
                                    className="min-h-[44px] min-w-[48px] flex items-center justify-center rounded-xl bg-[#F2F0E9] text-[#3E3C3A] font-bold active:scale-95"
                                  >
                                    <Minus className="w-4 h-4" />
                                  </button>

                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.5"
                                    min="0"
                                    value={item.quantity === 0 ? '' : item.quantity}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      setEditDraft((prev) => {
                                        if (!prev) return prev;
                                        const nextItems = [...prev.items];
                                        nextItems[idx] = {
                                          ...nextItems[idx],
                                          quantity: isNaN(val) ? 0 : Math.max(0, val),
                                        };
                                        return { ...prev, items: nextItems };
                                      });
                                    }}
                                    className="flex-1 min-h-[44px] text-center text-base font-bold tabular-nums bg-[#FFFFFF] border border-black/[0.12] rounded-xl outline-none focus:border-[#5D7586]"
                                  />

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditDraft((prev) => {
                                        if (!prev) return prev;
                                        const nextItems = [...prev.items];
                                        const curr = Number(nextItems[idx].quantity) || 0;
                                        nextItems[idx] = { ...nextItems[idx], quantity: curr + 1 };
                                        return { ...prev, items: nextItems };
                                      })
                                    }
                                    aria-label="增加數量"
                                    className="min-h-[44px] min-w-[48px] flex items-center justify-center rounded-xl bg-[#F2F0E9] text-[#3E3C3A] font-bold active:scale-95"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>

                                  <select
                                    value={item.unit || '斤'}
                                    onChange={(e) =>
                                      setEditDraft((prev) => {
                                        if (!prev) return prev;
                                        const nextItems = [...prev.items];
                                        nextItems[idx] = { ...nextItems[idx], unit: e.target.value };
                                        return { ...prev, items: nextItems };
                                      })
                                    }
                                    className="min-h-[44px] px-2.5 bg-[#F2F0E9]/70 rounded-xl text-sm font-semibold text-[#3E3C3A] border border-black/[0.08]"
                                  >
                                    {UNITS.map((u) => (
                                      <option key={u} value={u}>
                                        {u}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            ))}

                            <button
                              type="button"
                              onClick={() => {
                                const firstProd = products[0];
                                setEditDraft((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        items: [
                                          ...prev.items,
                                          {
                                            productId: firstProd?.id || '',
                                            productName: firstProd?.name || '',
                                            quantity: 5,
                                            unit: firstProd?.unit || '斤',
                                          },
                                        ],
                                      }
                                    : prev
                                );
                              }}
                              className="w-full min-h-[44px] rounded-xl border border-dashed border-[#5D7586]/50 text-xs font-bold text-[#5D7586] flex items-center justify-center gap-1"
                            >
                              <Plus className="w-4 h-4" />
                              新增品項
                            </button>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="relative">
                                <Clock className="w-3.5 h-3.5 text-[#8C8984] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <input
                                  type="time"
                                  value={editDraft.deliveryTime}
                                  onChange={(e) =>
                                    setEditDraft((prev) => (prev ? { ...prev, deliveryTime: e.target.value } : prev))
                                  }
                                  className="w-full min-h-[44px] pl-8 pr-2 bg-[#F2F0E9]/60 border border-black/[0.08] rounded-xl text-xs font-semibold tabular-nums"
                                />
                              </div>

                              <select
                                value={editDraft.trip}
                                onChange={(e) =>
                                  setEditDraft((prev) => (prev ? { ...prev, trip: e.target.value } : prev))
                                }
                                className="w-full min-h-[44px] px-2.5 bg-[#F2F0E9]/60 border border-black/[0.08] rounded-xl text-xs font-semibold"
                              >
                                {trips.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <input
                              type="text"
                              value={editDraft.note}
                              onChange={(e) =>
                                setEditDraft((prev) => (prev ? { ...prev, note: e.target.value } : prev))
                              }
                              placeholder="訂單備註（選填）"
                              className="w-full min-h-[44px] px-3 bg-[#F2F0E9]/60 border border-black/[0.08] rounded-xl text-xs"
                            />

                            <button
                              type="button"
                              onClick={() => handleSaveOrderEdit(order)}
                              className="w-full min-h-[48px] rounded-xl bg-[#5D7586] hover:bg-[#4E6473] text-white text-sm font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-all"
                            >
                              <Check className="w-4 h-4" />
                              儲存訂單修改
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 分頁 4：刪除訂單 */}
                    {activeTab === 'delete' && canDeleteOrder && (
                      <div className="mt-3.5 pt-3 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic();
                            setDeleteTargetOrder(order);
                          }}
                          className="w-full min-h-[44px] rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          刪除此筆訂單
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}

        {/* === 分頁 3：設定店家公休 === */}
        {activeTab === 'holiday' && (
          <div className="space-y-3">
            {activeCustomers.length === 0 ? (
              <div className="py-12 px-6 text-center bg-[#FFFFFF] rounded-2xl border border-black/[0.06] text-sm text-[#8C8984]">
                查無符合關鍵字的店家
              </div>
            ) : (
              activeCustomers.map((cust) => {
                const isSelected = selectedCustomerId === cust.id;
                const offText =
                  cust.offDays && cust.offDays.length > 0
                    ? cust.offDays.map((d) => WEEKDAYS.find((w) => w.value === d)?.label || d).join('、')
                    : '無固定週休';
                const upcomingDates = (cust.holidayDates || []).filter((d) => d >= todayStr).sort();

                return (
                  <div
                    key={cust.id}
                    className="bg-[#FFFFFF] rounded-2xl border border-black/[0.06] p-4 shadow-[0_2px_10px_rgba(62,60,58,0.03)]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setSelectedCustomerId(null);
                          setHolidayDraft(null);
                        } else {
                          openHolidayEditor(cust);
                        }
                      }}
                      className="w-full text-left flex items-center justify-between gap-3 min-h-[44px]"
                    >
                      <div className="min-w-0">
                        <div className="text-base font-bold text-[#3E3C3A] truncate">{cust.name}</div>
                        <div className="text-xs text-[#8C8984] mt-0.5 tabular-nums truncate">
                          固定休：{offText}
                          {upcomingDates.length > 0 && ` · 特定休：${upcomingDates.slice(0, 2).join(', ')}${upcomingDates.length > 2 ? '…' : ''}`}
                          {cust.isPaused && ' · 已暫停供貨'}
                        </div>
                      </div>
                      {isSelected ? (
                        <ChevronUp className="w-5 h-5 text-[#8C8984] shrink-0" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-[#8C8984] shrink-0" />
                      )}
                    </button>

                    {isSelected && holidayDraft && (
                      <div className="mt-3.5 pt-3.5 border-t border-slate-100 space-y-4">
                        {/* 一鍵設定今/明日公休 */}
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: `今日公休 (${todayStr.slice(5)})`, date: todayStr },
                            { label: `明日公休 (${tomorrowStr.slice(5)})`, date: tomorrowStr },
                          ].map((preset) => {
                            const active = holidayDraft.holidayDates.includes(preset.date);
                            return (
                              <button
                                key={preset.date}
                                type="button"
                                onClick={() => {
                                  triggerHaptic();
                                  setHolidayDraft((prev) => {
                                    if (!prev) return prev;
                                    const exists = prev.holidayDates.includes(preset.date);
                                    return {
                                      ...prev,
                                      holidayDates: exists
                                        ? prev.holidayDates.filter((d) => d !== preset.date)
                                        : [...prev.holidayDates, preset.date],
                                    };
                                  });
                                }}
                                className={`min-h-[44px] px-3 rounded-xl text-xs font-bold border transition-colors ${
                                  active
                                    ? 'bg-rose-50 border-rose-300 text-rose-700'
                                    : 'bg-[#F2F0E9]/70 border-transparent text-[#3E3C3A]'
                                }`}
                              >
                                {active ? `✓ ${preset.label}` : preset.label}
                              </button>
                            );
                          })}
                        </div>

                        {/* 每週固定公休 */}
                        <div>
                          <div className="text-xs font-semibold text-[#8C8984] mb-2">每週固定公休日</div>
                          <div className="grid grid-cols-7 gap-1.5">
                            {WEEKDAYS.map((day) => {
                              const active = holidayDraft.offDays.includes(day.value);
                              return (
                                <button
                                  key={day.value}
                                  type="button"
                                  onClick={() => {
                                    triggerHaptic();
                                    setHolidayDraft((prev) => {
                                      if (!prev) return prev;
                                      const has = prev.offDays.includes(day.value);
                                      return {
                                        ...prev,
                                        offDays: has
                                          ? prev.offDays.filter((d) => d !== day.value)
                                          : [...prev.offDays, day.value],
                                      };
                                    });
                                  }}
                                  className={`min-h-[44px] rounded-xl text-xs font-bold transition-colors ${
                                    active
                                      ? 'bg-[#3E3C3A] text-white'
                                      : 'bg-[#F2F0E9] text-[#3E3C3A]'
                                  }`}
                                >
                                  {day.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* 日曆挑選特定公休日期 */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-[#8C8984]">
                              已選特定日期（{holidayDraft.holidayDates.filter((d) => d >= todayStr).length} 天）
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowCalendarModal(true)}
                              className="min-h-[36px] px-3 rounded-lg bg-[#F2F0E9] text-xs font-bold text-[#5D7586] flex items-center gap-1"
                            >
                              <Calendar className="w-3.5 h-3.5" />
                              打開月曆挑選
                            </button>
                          </div>

                          {holidayDraft.holidayDates.filter((d) => d >= todayStr).length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {holidayDraft.holidayDates
                                .filter((d) => d >= todayStr)
                                .sort()
                                .map((dateStr) => (
                                  <button
                                    key={dateStr}
                                    type="button"
                                    onClick={() =>
                                      setHolidayDraft((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              holidayDates: prev.holidayDates.filter((d) => d !== dateStr),
                                            }
                                          : prev
                                      )
                                    }
                                    className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 text-xs font-semibold tabular-nums flex items-center gap-1"
                                  >
                                    <span>{dateStr}</span>
                                    <X className="w-3 h-3" />
                                  </button>
                                ))}
                            </div>
                          )}
                        </div>

                        {/* 暫停供貨開關 */}
                        <button
                          type="button"
                          onClick={() =>
                            setHolidayDraft((prev) => (prev ? { ...prev, isPaused: !prev.isPaused } : prev))
                          }
                          className={`w-full min-h-[44px] px-3 rounded-xl text-xs font-bold flex items-center justify-between border ${
                            holidayDraft.isPaused
                              ? 'bg-[#F9F1E6] border-[#9C7C58]/40 text-[#9C7C58]'
                              : 'bg-[#F2F0E9]/60 border-transparent text-[#3E3C3A]'
                          }`}
                        >
                          <span>暫停供貨（無限期公休）</span>
                          <span>{holidayDraft.isPaused ? '已開啟' : '未開啟'}</span>
                        </button>

                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={handleSaveHoliday}
                          className="w-full min-h-[48px] rounded-xl bg-[#4A6356] hover:bg-[#3D5247] disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-all"
                        >
                          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          儲存公休設定
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>

      {/* 特定公休日期月曆彈窗 */}
      {showCalendarModal && selectedCustomer && holidayDraft && (
        <HolidayCalendar
          storeName={selectedCustomer.name}
          offDays={holidayDraft.offDays}
          holidays={holidayDraft.holidayDates}
          onToggle={(dateStr) => {
            setHolidayDraft((prev) => {
              if (!prev) return prev;
              const exists = prev.holidayDates.includes(dateStr);
              return {
                ...prev,
                holidayDates: exists
                  ? prev.holidayDates.filter((d) => d !== dateStr)
                  : [...prev.holidayDates, dateStr],
              };
            });
          }}
          onClose={() => setShowCalendarModal(false)}
        />
      )}

      {/* 刪除訂單 Bottom Sheet 二次確認抽屜（單手拇指操作友善，不用瀏覽器原生 confirm） */}
      {deleteTargetOrder && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end justify-center"
          onClick={() => setDeleteTargetOrder(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#FFFFFF] rounded-t-3xl p-5 pb-[max(20px,env(safe-area-inset-bottom))] space-y-4 shadow-2xl"
          >
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto" />
            <div>
              <h3 className="text-base font-bold text-[#3E3C3A]">確定刪除此筆訂單？</h3>
              <p className="text-xs text-[#8C8984] mt-1 tabular-nums">
                {deleteTargetOrder.customerName} · {deleteTargetOrder.deliveryDate}
              </p>
            </div>
            <div className="p-3 bg-[#F2F0E9] rounded-xl text-xs text-[#3E3C3A] space-y-1">
              {(deleteTargetOrder.items || []).map((it, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>{it.productName || productNameMap.get(it.productId)?.name || it.productId}</span>
                  <span className="font-bold tabular-nums">
                    × {it.quantity} {it.unit || '斤'}
                  </span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setDeleteTargetOrder(null)}
                className="min-h-[48px] rounded-xl bg-[#F2F0E9] text-[#3E3C3A] text-sm font-bold"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic();
                  onDeleteOrder(deleteTargetOrder.id, true);
                  addToast(`已排程刪除 ${deleteTargetOrder.customerName} 訂單`, 'success');
                  setDeleteTargetOrder(null);
                }}
                className="min-h-[48px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold"
              >
                確認永久刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
