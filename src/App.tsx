import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { throttle } from 'lodash';
import { Users, Package, ClipboardList, History, Settings, BellRing, ChevronDown, ChevronUp, X, Plus, Trash2, // Used for Edit Icon
  CalendarDays, CheckCircle2, RefreshCw, Calculator, CalendarCheck, Copy, MapPin, Wallet, // New Import
  Check, Info, Lock, Unlock, ArrowUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
;
import { Customer, Product, Order, OrderItem, CustomerPrice, Toast, ToastType, OrderStatus } from './types';
import { WEEKDAYS, UNITS, DELIVERY_METHODS, ORDERING_HABITS, } from './constants';
import { ConfirmModal } from './components/ConfirmModal';
import { ProductEditModal } from './components/ProductEditModal';
import { NetworkTimeoutModal } from './components/NetworkTimeoutModal';
import { VoiceInputModal } from './components/VoiceInputModal';
import { ConflictModal } from './components/ConflictModal';
import { DatePickerModal } from './components/DatePickerModal';
import { SettingsModal } from './components/SettingsModal';
import { TripManagerModal } from './components/TripManagerModal';
import { ProductPicker } from './components/ProductPicker';
import { CustomerPicker } from './components/CustomerPicker';
import { HolidayCalendar } from './components/HolidayCalendar';
;
import { CustomerProfileDrawer } from './components/CustomerProfileDrawer';
import { CustomerReportModal } from './components/CustomerReportModal';
import { ToastNotification } from './components/ToastNotification';
import { NotificationCenterModal } from './components/NotificationCenterModal';
import { NavItem } from './components/NavItem';
;
import { SwipeableOrderCard } from './components/SwipeableOrderCard';
import { SkeletonCard } from './components/SkeletonCard';
;
;
import { LoginScreen } from './components/LoginScreen';
import { useDataSync } from './hooks/useDataSync';
import { useOrderCalculations } from './hooks/useOrderCalculations';
import { useVoiceAssistant } from './hooks/useVoiceAssistant';
import { useOrderActions } from './hooks/useOrderActions';
import { useDataManagement } from './hooks/useDataManagement';
import { useAutoOrderPrediction } from './hooks/useAutoOrderPrediction';
import { useCompactMode } from './hooks/useCompactMode';
import { fetchWithRetry } from './utils/fetchUtils';
import { AutoOrderDashboardModal } from './components/modals/AutoOrderDashboardModal';
import { getTomorrowDate, getSmartDefaultDate, getLastMonthEndDate, formatTimeForInput, getUpcomingHolidays, isDateInOffDays } from './utils';
import { modalVariants, buttonTap, triggerHaptic } from './components/animations';

// ... (Toast Types, Variants, Haptic Helper, Helper Functions remain unchanged) ...
// --- Toast Types ---
// (Moved to types.ts)

// --- Animation Variants ---
// (Moved to components/animations.ts)

// Haptic Feedback Helper
// (Moved to components/animations.ts)

// ... (getStatusStyles, normalizeDate, formatDateStr, getTomorrowDate, getLastMonthEndDate, safeJsonArray, formatTimeDisplay, formatTimeForInput moved to utils.ts)


// ... (SortableProductItem, SwipeableOrderCard, ScheduleOrderCard moved to components) ...
;
;
import { CustomersView } from './views/CustomersView';
import { ProductsView } from './views/ProductsView';

import { FinanceView } from './views/FinanceView';
import { WorkView } from './views/WorkView';
import { ScheduleView } from './views/ScheduleView';
import { OrdersView } from './views/OrdersView';

// ... (LoginScreen, ConfirmModal, ProductPicker, CustomerPicker, HolidayCalendar, WorkCalendar, DatePickerModal, SettingsModal, NavItem, ToastNotification moved to components) ...

// --- 主要 App 組件 ---
const App: React.FC = () => {
  // ... (State declarations remain unchanged) ...
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);

  const scrollRef = useCallback((node: HTMLElement | null) => {
    if (node !== null) {
      setScrollElement(node);
    }
    // Update mainRef to allow programmatic scrolling
    (mainRef as React.MutableRefObject<HTMLElement | null>).current = node;
  }, []);

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const {
    isAuthenticated,
    apiEndpoint,
    customers, setCustomers,
    products, setProducts,
    orders, setOrders,
    trips, setTrips,
    isInitialLoading,
    isBackgroundSyncing,
    isSaving, setIsSaving,
    conflictData, setConflictData,
    syncData,
    handleLogin,
    handleChangePassword,
    handleSaveApiUrl,
    handleForceRetry,
    saveOrderToCloud,
    saveTripsToCloud,
    pendingNewOrders,
    applyPendingOrders
  } = useDataSync(addToast);

  const customerMap = useMemo(() => {
    const map: Record<string, Customer> = {};
    customers.forEach(c => {
      map[c.name] = c;
      if (c.id) map[c.id] = c;
    });
    return map;
  }, [customers]);

  const isLoadingProducts = isBackgroundSyncing && products.length === 0;

  const productMap = useMemo(() => {
    const map: Record<string, Product> = {};
    products.forEach(p => {
      if (p.id) map[p.id] = p;
      if (p.name) map[p.name] = p;
    });
    return map;
  }, [products]);

  const [isUnlocked, setIsUnlocked] = useState(false);
  const [unlockTimeout, setUnlockTimeout] = useState<number | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isWarmingUp] = useState(false);
  const [showDeadlockModal, setShowDeadlockModal] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    const handleDeadlock = () => setShowDeadlockModal(true);
    const handleRetryStart = () => setIsRetrying(true);
    const handleRetryEnd = () => setIsRetrying(false);

    window.addEventListener('networkDeadlock', handleDeadlock);
    window.addEventListener('networkRetryStart', handleRetryStart);
    window.addEventListener('networkRetryEnd', handleRetryEnd);

    return () => {
      window.removeEventListener('networkDeadlock', handleDeadlock);
      window.removeEventListener('networkRetryStart', handleRetryStart);
      window.removeEventListener('networkRetryEnd', handleRetryEnd);
    };
  }, []);

  useEffect(() => {
    if (!apiEndpoint) return;
    
    // 初次掛載直接發射後不理
    fetch(`${apiEndpoint}?action=ping`, { method: 'GET' }).catch(() => {});

    // 定義一個不重試、不報錯、不干擾 UI 的極輕量 Ping
    const pingGas = () => {
      fetch(`${apiEndpoint}?action=ping`, { method: 'GET' })
        .catch(() => { /* 忽略任何網路錯誤，不要跳 Modal */ });
    };

    const intervalId = setInterval(pingGas, 5 * 60 * 1000); // 每 5 分鐘
    
    return () => clearInterval(intervalId);
  }, [apiEndpoint]);

  useEffect(() => {
    if (isUnlocked && unlockTimeout) {
      const interval = setInterval(() => {
        if (Date.now() > unlockTimeout) {
          setIsUnlocked(false);
          setUnlockTimeout(null);
          addToast('安全時效已過，系統已自動進入檢視模式', 'info');
        }
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [isUnlocked, unlockTimeout, addToast]);

  const requireAuth = useCallback((action: () => void) => {
    if (isUnlocked) {
      action();
      setUnlockTimeout(Date.now() + 30 * 60 * 1000);
    } else {
      setPendingAction(() => action);
      setShowUnlockModal(true);
      setUnlockPassword('');
      setUnlockError(false);
    }
  }, [isUnlocked]);

  const handleAppUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockPassword || isUnlocking) return;
    
    setIsUnlocking(true);
    try {
      const success = await handleLogin(unlockPassword);
      
      if (success) {
        setIsUnlocked(true);
        setUnlockTimeout(Date.now() + 30 * 60 * 1000);
        setShowUnlockModal(false);
        if (pendingAction) {
          pendingAction();
          setPendingAction(null);
        }
      } else {
        setUnlockError(true);
      }
    } finally {
      setIsUnlocking(false);
    }
  };

  const [activeTab, setActiveTab] = useState<'orders' | 'customers' | 'products' | 'work' | 'schedule' | 'finance'>(() => {
    return (localStorage.getItem('nm_active_tab') as any) || 'orders';
  });
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [lineChannelToken, setLineChannelToken] = useState(() => {
    return localStorage.getItem('nm_line_channel_token') || '';
  });
  const [lineUserId, setLineUserId] = useState(() => {
    return localStorage.getItem('nm_line_user_id') || '';
  });
  
  useEffect(() => {
    localStorage.setItem('nm_line_channel_token', lineChannelToken);
    localStorage.setItem('nm_line_user_id', lineUserId);
  }, [lineChannelToken, lineUserId]);
  
  const [isAutoOrderDashboardOpen, setIsAutoOrderDashboardOpen] = useState(false);
  
  const { layoutMode, setLayoutMode } = useCompactMode();

  const mainRef = useRef<HTMLDivElement>(null);



  
  // NEW: Ref to store the version (lastUpdated timestamp) of the item currently being edited
  const editingVersionRef = useRef<number | undefined>(undefined);

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return getSmartDefaultDate();
  });

  const { previewDate, setPreviewDate, prediction } = useAutoOrderPrediction(customers);

  const [workDates, setWorkDates] = useState<string[]>([getTomorrowDate()]);
  const [workCustomerFilter, setWorkCustomerFilter] = useState('');
  const [workProductFilter, setWorkProductFilter] = useState<Set<string>>(new Set());
  const [isProductFilterOpen, setIsProductFilterOpen] = useState(false);
  const [expandedFilterCats, setExpandedFilterCats] = useState<Set<string>>(new Set());
  const [workDeliveryMethodFilter, setWorkDeliveryMethodFilter] = useState<string[]>([]);
  
  const [visibleWorkCount, setVisibleWorkCount] = useState(10);
  useEffect(() => {
    setVisibleWorkCount(10);
  }, [workCustomerFilter, workProductFilter, workDeliveryMethodFilter, workDates]);

  const [scheduleDate, setScheduleDate] = useState<string>(getTomorrowDate());
  const [scheduleDeliveryMethodFilter, setScheduleDeliveryMethodFilter] = useState<string[]>([]);
  const [showScheduleDeliveryFilters, setShowScheduleDeliveryFilters] = useState(false);
  
  const [actionMenuTarget, setActionMenuTarget] = useState<any | null>(null);
  
  const availableTrips = trips;
  const setAvailableTrips = setTrips;

  const [isTripManagerOpen, setIsTripManagerOpen] = useState(false);

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isOrderReorderMode, setIsOrderReorderMode] = useState(false);
  const [reorderedOrderIds, setReorderedOrderIds] = useState<Set<string>>(new Set());
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isOrderDatePickerOpen, setIsOrderDatePickerOpen] = useState(false);
  const [isAddingOrder, setIsAddingOrder] = useState(false);
  // NEW: State for editing order
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  
  // 新增在 App.tsx 的狀態宣告區
  const [drawerConfig, setDrawerConfig] = useState<{
    isOpen: boolean;
    type: 'deliveryMethod' | 'trip' | null;
    target: 'order' | 'customer'; // 用來區分是「訂單表單」還是「客戶表單」在呼叫
  }>({ isOpen: false, type: null, target: 'order' });

  // NEW: Order Search
  const [orderSearch, setOrderSearch] = useState('');
  const [orderDeliveryFilter, setOrderDeliveryFilter] = useState<string[]>([]);
  const [showOrderDeliveryFilters, setShowOrderDeliveryFilters] = useState(false);

  const [holidayEditorId, setHolidayEditorId] = useState<string | null>(null);

  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [quickAddData, setQuickAddData] = useState<{customerName: string, items: {productId: string, quantity: number, unit: string}[]} | null>(null);

  const [tempPriceProdId, setTempPriceProdId] = useState('');
  const [tempPriceValue, setTempPriceValue] = useState('');
  const [tempPriceUnit, setTempPriceUnit] = useState('斤');


  const [pickerConfig, setPickerConfig] = useState<{
    isOpen: boolean;
    onSelect: (productId: string) => void;
    currentProductId?: string;
    customPrices?: CustomerPrice[];
  }>({ isOpen: false, onSelect: () => {} });

  const [customerPickerConfig, setCustomerPickerConfig] = useState<{
    isOpen: boolean;
    onSelect: (customerId: string) => void;
    currentSelectedId?: string;
  }>({ isOpen: false, onSelect: () => {} });

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const [isSettling, setIsSettling] = useState(false);
  const [settlementTarget, setSettlementTarget] = useState<{name: string, allOrderIds: string[]} | null>(null);
  const [settlementDate, setSettlementDate] = useState<string>(getLastMonthEndDate());
  const [partialSettlementTarget, setPartialSettlementTarget] = useState<{name: string, orders: Order[]} | null>(null);
  const [selectedPartialOrderIds, setSelectedPartialOrderIds] = useState<Set<string>>(new Set());

  const [orderForm, setOrderForm] = useState<{
    customerType: 'existing' | 'retail';
    customerId: string;
    customerName: string;
    deliveryTime: string;
    deliveryMethod: string;
    trip: string;
    items: OrderItem[];
    note: string;
    date: string;
  }>({
    customerType: 'existing',
    customerId: '',
    customerName: '',
    deliveryTime: '08:00',
    deliveryMethod: '',
    trip: '',
    items: [{ productId: '', quantity: 10, unit: '斤' }],
    note: '',
    date: ''
  });

  // ... (Rest of states remain unchanged) ...
  const [customerForm, setCustomerForm] = useState<Partial<Customer>>({});
  const [isEditingCustomer, setIsEditingCustomer] = useState<string | null>(null);
  const [viewingCustomerProfile, setViewingCustomerProfile] = useState<string | null>(null);
  const [viewingCustomerReport, setViewingCustomerReport] = useState<string | null>(null);
  const [directHolidayCustomer, setDirectHolidayCustomer] = useState<Customer | null>(null);
  const [editCustomerMode, setEditCustomerMode] = useState<'full' | 'itemsOnly' | 'holidayOnly'>('full');
  const [showAdvancedCustomerSettings, setShowAdvancedCustomerSettings] = useState(false);
  const [isEditingProduct, setIsEditingProduct] = useState<string | null>(null);
  
  const [selectedCustomerForModal, setSelectedCustomerForModal] = useState<string | null>(null);
  const [visibleModalOrderCount, setVisibleModalOrderCount] = useState(20);
  
  const [isScrollingDown, setIsScrollingDown] = useState(false);
  const lastScrollYRef = useRef(0);
  
  const [initialProductOrder, setInitialProductOrder] = useState<string[]>([]);
  const [hasReorderedProducts, setHasReorderedProducts] = useState(false);

  const [lastOrderCandidate, setLastOrderCandidate] = useState<{date: string, items: OrderItem[], sourceLabel?: string} | null>(null);

  const [hasChanges, setHasChanges] = useState(false);

  // 當 Bottom Sheet 開啟時鎖定背景滾動
  useEffect(() => {
    if (isProductFilterOpen || actionMenuTarget !== null) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isProductFilterOpen, actionMenuTarget]);

  useEffect(() => {
    // 1. 綁定到真正的內部滾動主體
    if (!scrollElement) return;

    const handleScroll = throttle(() => {
      const currentScrollY = scrollElement.scrollTop; 
      
      // 2. 使用 ref 的最新值來判斷滑動方向
      if (currentScrollY > lastScrollYRef.current && currentScrollY > 50) {
        setIsScrollingDown(true);
      } else if (currentScrollY < lastScrollYRef.current) {
        setIsScrollingDown(false);
      }
      
      // 3. 直接寫入 ref，這不會觸發整頁重新渲染！(拯救效能的關鍵)
      lastScrollYRef.current = currentScrollY;
    }, 300);

    // 掛載事件監聽
    scrollElement.addEventListener('scroll', handleScroll, { passive: true });
    // 清除機制
    return () => {
      scrollElement.removeEventListener('scroll', handleScroll);
      handleScroll.cancel();
    };
  }, [scrollElement]); // 當 scrollElement 就緒時綁定一次

  useEffect(() => {
    if (isAddingOrder || isEditingCustomer || isEditingProduct || editingOrderId) {
      setHasChanges(false);
    }
  }, [isAddingOrder, isEditingCustomer, isEditingProduct, editingOrderId]);

  const handleCloseModal = useCallback(() => {
    if (hasChanges) {
      const confirmLeave = window.confirm("您有未儲存的變更，確定要放棄嗎？");
      if (!confirmLeave) return false;
    }
    setIsAddingOrder(false);
    setEditingOrderId(null);
    setIsEditingCustomer(null);
    setIsEditingProduct(null);
    setHasChanges(false);
    return true;
  }, [hasChanges]);

  const handleOrderFormChange = useCallback((field: keyof typeof orderForm, value: any) => {
    setOrderForm(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  }, []);

  // 新增在 App.tsx 元件內部
  const handleDrawerSelect = (value: string) => {
    if (drawerConfig.target === 'order') {
      handleOrderFormChange(drawerConfig.type as any, value);
    } else if (drawerConfig.target === 'customer') {
      if (drawerConfig.type === 'trip') {
        setCustomerForm(prev => ({ ...prev, defaultTrip: value }));
      } else {
        setCustomerForm(prev => ({ ...prev, deliveryMethod: value }));
      }
    }
    setDrawerConfig({ ...drawerConfig, isOpen: false });
  };

  const getDrawerOptions = () => {
    if (drawerConfig.type === 'deliveryMethod') return DELIVERY_METHODS;
    if (drawerConfig.type === 'trip') return availableTrips.filter(t => t !== '未分配');
    return [];
  };

  // NEW: History Stack Management for Android Back Button
  useEffect(() => {
    // 1. Push initial state to prevent immediate exit on first back press
    window.history.pushState(null, document.title, window.location.href);

    const handlePopState = () => {
      // Priority 1: Close Modals
      if (isAddingOrder || editingOrderId || isEditingCustomer || isEditingProduct) {
        if (!handleCloseModal()) {
           window.history.pushState(null, document.title, window.location.href); // Restore stack
        }
        return;
      }
      if (isSettingsOpen) {
        setIsSettingsOpen(false);
        window.history.pushState(null, document.title, window.location.href); // Restore stack
        return;
      }
      if (isDatePickerOpen) {
        setIsDatePickerOpen(false);
        window.history.pushState(null, document.title, window.location.href); // Restore stack
        return;
      }
      if (pickerConfig.isOpen) {
        setPickerConfig(prev => ({ ...prev, isOpen: false }));
        window.history.pushState(null, document.title, window.location.href); // Restore stack
        return;
      }
      if (customerPickerConfig.isOpen) {
        setCustomerPickerConfig(prev => ({ ...prev, isOpen: false }));
        window.history.pushState(null, document.title, window.location.href); // Restore stack
        return;
      }
      if (quickAddData) {
        setQuickAddData(null);
        window.history.pushState(null, document.title, window.location.href); // Restore stack
        return;
      }
      if (expandedCustomer) {
        setExpandedCustomer(null);
        window.history.pushState(null, document.title, window.location.href); // Restore stack
        return;
      }

      // Priority 2: Navigate Tabs
      if (activeTab !== 'orders') {
        setActiveTab('orders');
        window.history.pushState(null, document.title, window.location.href); // Restore stack
        return;
      }

      // Priority 3: Allow Exit (No pushState here)
      // If we are at 'orders' tab and no modals are open, allow the browser to go back (exit app or prev page)
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [
    isAddingOrder, 
    editingOrderId, 
    isEditingCustomer, 
    isEditingProduct, 
    isSettingsOpen, 
    isDatePickerOpen, 
    pickerConfig.isOpen, 
    customerPickerConfig.isOpen, 
    quickAddData, 
    expandedCustomer, 
    activeTab
  ]);

  useEffect(() => {
    setIsSelectionMode(false);
    setSelectedOrderIds(new Set());
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
    // 當分頁切換時，將目前的分頁名稱存入 localStorage
    localStorage.setItem('nm_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (selectedOrderIds.size > 0) {
      setSelectedOrderIds(new Set());
    }
  }, [selectedDate, scheduleDate, scheduleDeliveryMethodFilter]);

  useEffect(() => {
    if (products.length > 0 && initialProductOrder.length === 0) {
      setInitialProductOrder(products.map(p => p.id));
    }
  }, [products]);

  // NEW: Effect for dynamic loading text
  // (Moved to useVoiceAssistant)

  // ... (Computed values moved to useOrderCalculations) ...
  const {
    orderSummary,
    getQuickAddPricePreview,
    scheduleOrders,
    scheduleMoneySummary,
    financeData,
    settlementPreview,
    groupedOrders,
    workSheetData,
    calculateOrderTotalAmount
  } = useOrderCalculations({
    activeTab,
    orders,
    customers,
    products,
    selectedDate,
    orderSearch,
    orderDeliveryFilter,
    scheduleDate,
    scheduleDeliveryMethodFilter,
    workDates,
    workCustomerFilter,
    workProductFilter,
    workDeliveryMethodFilter,
    customerSearch: '',
    settlementTarget,
    settlementDate,
    orderForm,
    quickAddData,
    customerMap,
    productMap
  });

  // 👇 新增這段：當展開的客戶訂單被刪光時，自動關閉 Modal
  useEffect(() => {
    if (selectedCustomerForModal && !groupedOrders[selectedCustomerForModal]) {
      setSelectedCustomerForModal(null);
    }
  }, [groupedOrders, selectedCustomerForModal]);

  const handleSetTrip = async (tripName: string) => {
    if (selectedOrderIds.size === 0) return;

    const ids = Array.from(selectedOrderIds);
    
    // Optimistic update
    setOrders((prev: Order[]) => prev.map(o => {
      if (ids.includes(o.id)) {
        return { ...o, trip: tripName, syncStatus: 'pending', pendingAction: 'update' };
      }
      return o;
    }));

    // Sync each order
    for (const id of ids) {
      const order = orders.find(o => o.id === id);
      if (order) {
        const updatedOrder = { ...order, trip: tripName };
        saveOrderToCloud(
          updatedOrder,
          'updateOrderContent',
          order.version,
          () => {
            setOrders((prev: Order[]) => prev.map(o => o.id === id ? { ...o, syncStatus: 'synced', pendingAction: undefined } : o));
          },
          (errMsg: string) => {
            setOrders((prev: Order[]) => prev.map(o => o.id === id ? { ...o, syncStatus: 'error', errorMessage: errMsg } : o));
          }
        );
      }
    }

    setSelectedOrderIds(new Set());
    setIsSelectionMode(false);
  };

  

  // @ts-ignore
  const handleDeleteTrip = (tripToDelete: string) => {
    if (window.confirm(`確定要刪除「${tripToDelete}」嗎？\n該趟次的訂單將會被移至「未分配」。`)) {
      // Update orders
      const idsToUpdate = orders.filter(o => o.trip === tripToDelete).map(o => o.id);
      if (idsToUpdate.length > 0) {
        setOrders((prev: Order[]) => prev.map(o => o.trip === tripToDelete ? { ...o, trip: '未分配', syncStatus: 'pending', pendingAction: 'update' } : o));
        idsToUpdate.forEach(id => {
          const order = orders.find(o => o.id === id);
          if (order) {
            saveOrderToCloud({ ...order, trip: '未分配' }, 'updateOrderContent', order.version, () => {
              setOrders((prev: Order[]) => prev.map(o => o.id === id ? { ...o, syncStatus: 'synced', pendingAction: undefined } : o));
            }, (errMsg: string) => {
              setOrders((prev: Order[]) => prev.map(o => o.id === id ? { ...o, syncStatus: 'error', errorMessage: errMsg } : o));
            });
          }
        });
      }
      // Remove from availableTrips
      setAvailableTrips(prev => prev.filter(t => t !== tripToDelete));
    }
  };

  

  // ... (Other handlers remain unchanged until handleCreateOrderFromCustomer) ...
  const {
    handleQuickAddSubmit,
    handleBatchSettleOrders,
    handleSwipeStatusChange,
    handleCopyOrder,
    handleShareOrder,
    handleCopyStatement,
    handleShareStatementToLine,
    handleEditOrder,
    handleCreateOrderFromCustomer,
    handleSaveOrder,
    handleForceRetryWrapper,
    applyLastOrder,
    handleSelectExistingCustomer,
    openGoogleMaps,
    handleDeleteOrder,
    handleRetryOrder
  } = useOrderActions({
    orders,
    setOrders,
    customers,
    products,
    selectedDate,
    setSelectedDate,
    apiEndpoint,
    isSaving,
    setIsSaving,
    orderForm,
    setOrderForm,
    editingOrderId,
    setEditingOrderId,
    editingVersionRef,
    quickAddData,
    setQuickAddData,
    groupedOrders,
    orderSummary,
    saveOrderToCloud,
    setConflictData,
    addToast,
    setIsAddingOrder,
    setIsEditingCustomer,
    setIsEditingProduct,
    setConfirmConfig,
    handleForceRetry,
    lastOrderCandidate,
    setLastOrderCandidate,
    setToasts
  });
  
  const actionsRef = useRef({
    handleDeleteOrder,
    handleEditOrder,
    requireAuth,
    handleSwipeStatusChange,
    handleShareOrder,
    openGoogleMaps: (name: string) => openGoogleMaps(name)
  });

  useEffect(() => {
    actionsRef.current = {
      handleDeleteOrder,
      handleEditOrder,
      requireAuth,
      handleSwipeStatusChange,
      handleShareOrder,
      openGoogleMaps: (name: string) => openGoogleMaps(name)
    };
  });
  
  const handleToggleSelectionStable = useCallback((orderId: string) => {
    setSelectedOrderIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) newSet.delete(orderId);
      else newSet.add(orderId);
      return newSet;
    });
  }, []);

  const handleDeleteOrderStable = useCallback((orderId: string) => {
    actionsRef.current.requireAuth(() => actionsRef.current.handleDeleteOrder(orderId));
  }, []);

  const handleEditOrderStable = useCallback((orderToEdit: Order) => {
    actionsRef.current.requireAuth(() => actionsRef.current.handleEditOrder(orderToEdit));
  }, []);

  const handleModalEditOrderStable = useCallback((orderToEdit: Order) => {
    actionsRef.current.requireAuth(() => {
      actionsRef.current.handleEditOrder(orderToEdit);
      setSelectedCustomerForModal(null);
    });
  }, []);

  const handleModalViewCustomerStable = useCallback((name: string) => {
    setSelectedCustomerForModal(null);
    setViewingCustomerProfile(name);
  }, []);

  const handleSwipeStatusChangeStable = useCallback((orderId: string, status: OrderStatus) => {
    actionsRef.current.handleSwipeStatusChange(orderId, status);
  }, []);

  const handleShareOrderStable = useCallback((order: Order) => {
    actionsRef.current.handleShareOrder(order);
  }, []);

  const openGoogleMapsStable = useCallback((name: string) => {
    actionsRef.current.openGoogleMaps(name);
  }, []);

  

  

  // REFACTORED: syncData logic moved to useDataSync hook

  // NEW: Automator Effect for Polling and Focus Refetch
  useEffect(() => {
    if (!isAuthenticated) return;

    let intervalId: any = null;
    let wakeoutId: any = null;

    // 1. Define the silent sync executor with safety locks
    const performSilentSync = () => {
      if (document.visibilityState === 'hidden') return;
      // Safety Lock: Don't sync if user is editing
      if (isAddingOrder || isEditingCustomer || isEditingProduct || quickAddData || editingOrderId) {
        console.log("使用者忙碌中，略過背景同步");
        return;
      }
      
      // Execute sync in silent mode
      syncData(true);
    };

    const startPolling = () => {
      if (!intervalId) {
        intervalId = setInterval(performSilentSync, 60000);
      }
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (wakeoutId) {
        clearTimeout(wakeoutId);
        wakeoutId = null;
      }
    };

    // Initial Start
    startPolling();

    // 4. Focus Logic (Revalidate on Focus with 2 seconds debounce on wake-up)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // 等待兩秒鐘暖機，讓作業系統重新連結 Wi-Fi 或蜂窩網路
        wakeoutId = setTimeout(() => {
          performSilentSync();
          startPolling();
        }, 2000);
      } else {
        // 進入隱藏休眠，清除所有可能引爆的定時器
        stopPolling();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    // Cleanup
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isAuthenticated, syncData, isAddingOrder, isEditingCustomer, isEditingProduct, quickAddData, editingOrderId]);

  // Keep original initial load effect for first render
  // (Handled in useDataSync)

  const {
    isVoiceModalOpen,
    setIsVoiceModalOpen,
    isProcessingVoice,
    voiceLoadingText,
    handleProcessVoiceOrder,
    isAiMode,
    setIsAiMode
  } = useVoiceAssistant({
    customers,
    products,
    selectedDate,
    setSelectedDate,
    setOrderForm,
    setEditingOrderId,
    setIsAddingOrder,
    setCustomerPickerConfig,
    handleSelectExistingCustomer,
    addToast
  });



  const handleSaveProductOrder = async () => { if (!apiEndpoint || isSaving) return; setIsSaving(true); const orderedIds = products.map(p => p.id); try { await fetchWithRetry(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'reorderProducts', data: orderedIds }) }); setInitialProductOrder(orderedIds); setHasReorderedProducts(false); addToast("排序已更新！", 'success'); } catch (e) { console.error(e); addToast("排序儲存失敗，請檢查網路", 'error'); } finally { setIsSaving(false); } };

  const {
    handleSaveCustomer,
    handleSaveProduct,
    handleDeleteCustomer,
    handleDeleteProduct
  } = useDataManagement({
    customers,
    setCustomers,
    products,
    setProducts,
    apiEndpoint,
    isSaving,
    setIsSaving,
    customerForm,
    isEditingCustomer,
    setIsEditingCustomer,
    isEditingProduct,
    setIsEditingProduct,
    editingVersionRef,
    setConflictData,
    addToast,
    setConfirmConfig
  });

  const handlePrint = () => { 
    if (workSheetData.length === 0) { 
      addToast('目前沒有資料可供匯出', 'info'); 
      return; 
    } 
    const printWindow = window.open('', '_blank'); 
    if (!printWindow) { 
      addToast('彈跳視窗被封鎖，無法開啟列印頁面', 'error'); 
      window.print(); 
      return; 
    } 
    const sortedDates = [...workDates].sort(); 
    const dateRangeDisplay = sortedDates.length > 1 ? `${sortedDates[0]} ~ ${sortedDates[sortedDates.length - 1]} (${sortedDates.length}天)` : sortedDates[0]; 
    
    let htmlContent = `<!DOCTYPE html>
    <html>
      <head>
        <title>麵廠職人 - 生產總表</title>
        <style>
          body { font-family: sans-serif; padding: 20px; color: #333; } 
          h1 { text-align: center; margin-bottom: 10px; font-size: 32px; } 
          p.date { text-align: center; color: #666; margin-bottom: 30px; font-size: 20px; font-weight: bold; } 
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 18px; } 
          th, td { border: 1px solid #ddd; padding: 12px; text-align: left; vertical-align: top; } 
          th { background-color: #f5f5f5; font-weight: bold; text-align: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 20px; } 
          tr:nth-child(even) { background-color: #fafafa; -webkit-print-color-adjust: exact; print-color-adjust: exact; } 
          .text-right { text-align: right; } 
          .text-center { text-align: center; } 
          .badge { display: inline-block; background: #fff; padding: 4px 8px; border-radius: 4px; font-size: 16px; margin: 4px; border: 1px solid #ddd; color: #555; } 
          .total-cell { font-size: 24px; font-weight: bold; } 
          .footer { margin-top: 40px; text-align: right; font-size: 14px; color: #999; border-top: 1px solid #eee; padding-top: 10px; } 
          
          /* 移除瀏覽器預設列印頁首頁尾 */
          @page {
            margin: 0;
          }
          
          /* 僅在螢幕上顯示，列印時隱藏 */
          @media screen {
            .no-print {
              display: block;
            }
            .close-btn {
              position: fixed;
              top: 20px;
              right: 20px;
              background-color: #ff4444;
              color: white;
              border: none;
              padding: 15px 30px;
              font-size: 20px;
              border-radius: 8px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.2);
              z-index: 9999;
              cursor: pointer;
              font-weight: bold;
            }
          }
          @media print {
            body {
              padding: 15mm;
            }
            .no-print {
              display: none !important;
            }
          }
        </style>
      </head>
      <body>
        <!-- 新增這行 -->
        <button class="no-print close-btn" onclick="window.close(); if(!window.closed){window.history.back();}">
          ╳ 關閉 / 返回
        </button>
        
        <h1>生產總表</h1>
        <p class="date">出貨日期: ${dateRangeDisplay}</p>`; 
        
    workSheetData.forEach(group => { 
      htmlContent += `<div style="page-break-inside: avoid;"><div class="group-header" style="background-color: ${group.color}40; border-left: 8px solid ${group.color};"> ${group.label} (共 ${group.totalWeight} 單位)</div><table><thead><tr><th width="20%">品項</th><th width="15%">總量</th><th width="10%">單位</th><th>分配明細</th></tr></thead><tbody>${group.items.map(item => `<tr><td style="font-weight: bold; font-size: 22px;">${item.name}</td><td class="text-right total-cell">${item.totalQty}</td><td class="text-center" style="font-size: 18px;">${item.unit}</td><td>${item.details.map(d => `<span class="badge">${d.customerName} <b>${d.qty}</b></span>`).join('')}</td></tr>`).join('')}</tbody></table></div>`; 
    }); 
    
    htmlContent += `<div class="footer">列印時間: ${new Date().toLocaleString()}</div><script>window.onload = function() { setTimeout(function() { window.print(); }, 500); };</script></body></html>`; 
    
    printWindow.document.write(htmlContent); 
    printWindow.document.close(); 
  };

  const virtuosoOrderData = useMemo(() => {
    return Object.entries(groupedOrders as Record<string, Order[]>).map(([custName, custOrders]) => {
      let totalAmount = 0;
      const itemTotals = new Map<string, number>();
      const currentCustomer = customerMap[custName];

      custOrders.forEach(o => { 
        o.items.forEach(item => { 
          const p = productMap[item.productId]; 
          const pName = item.productName || p?.name || (isBackgroundSyncing && products.length === 0 ? '載入中...' : item.productId); 
          const unit = item.unit || p?.unit || '斤'; 
          
          const key = `${pName}::${unit}`;
          itemTotals.set(key, (itemTotals.get(key) || 0) + item.quantity);

          if (unit === '元') { 
            totalAmount += item.quantity; 
          } else { 
            const priceInfo = currentCustomer?.priceList?.find(pl => pl.productId === item.productId); 
            const price = priceInfo ? priceInfo.price : (p?.price || 0); 
            totalAmount += Math.round(item.quantity * price); 
          } 
        }); 
      });

      const itemSummaries = Array.from(itemTotals.entries()).map(([key, qty]) => {
        const [name, unit] = key.split('::');
        return `${name} ${qty}${unit}`;
      });
      const summaryText = itemSummaries.join('、');

      const allPaid = custOrders.every(o => o.status === OrderStatus.PAID);
      const allShipped = custOrders.every(o => o.status === OrderStatus.SHIPPED || o.status === OrderStatus.PAID);
      let statusTag = { label: '待處理', color: 'bg-blue-50 text-blue-600 border-blue-100' };
      if (allPaid) statusTag = { label: '已收款', color: 'bg-emerald-50 text-emerald-600 border-emerald-100' };
      else if (allShipped) statusTag = { label: '已配送', color: 'bg-amber-50 text-amber-600 border-amber-100' };
      const totalItemCount = custOrders.reduce((sum, o) => sum + o.items.length, 0);

      return {
        custName,
        custOrders,
        currentCustomer,
        totalAmount,
        summaryText,
        statusTag,
        allPaid,
        allShipped,
        totalItemCount
      };
    });
  }, [groupedOrders, productMap, customerMap, products.length, isBackgroundSyncing]);

  const virtuosoContext = useMemo(() => ({
    expandedCustomer, 
    setExpandedCustomer, 
    requireAuth, 
    setQuickAddData, 
    handleCopyOrder, 
    openGoogleMaps: openGoogleMapsStable, 
    productMap, 
    customerMap, 
    isLoadingProducts, 
    isSelectionMode, 
    selectedOrderIds, 
    handleToggleSelectionStable, 
    handleSwipeStatusChange: handleSwipeStatusChangeStable, 
    handleDeleteOrderStable, 
    handleShareOrder: handleShareOrderStable, 
    handleEditOrderStable, 
    handleRetryOrder, 
    setViewingCustomerProfile, 
    buttonTap
  }), [
    expandedCustomer, setExpandedCustomer, requireAuth, setQuickAddData, 
    handleCopyOrder, openGoogleMapsStable, productMap, customerMap, 
    isLoadingProducts, isSelectionMode, selectedOrderIds, 
    handleToggleSelectionStable, handleSwipeStatusChangeStable, 
    handleDeleteOrderStable, handleShareOrderStable, handleEditOrderStable, 
    handleRetryOrder, setViewingCustomerProfile, buttonTap
  ]);

  const renderVirtuosoItem = useCallback((_index: number, data: any, context: any) => {
    const { custName, custOrders, totalAmount, summaryText, statusTag, totalItemCount } = data;
    const { 
      expandedCustomer, setExpandedCustomer, requireAuth, setQuickAddData, 
      handleCopyOrder, openGoogleMaps, productMap, customerMap, 
      isLoadingProducts, isSelectionMode, selectedOrderIds, 
      handleToggleSelectionStable, handleSwipeStatusChange, 
      handleDeleteOrderStable, handleShareOrder, handleEditOrderStable, 
      handleRetryOrder, setViewingCustomerProfile, buttonTap 
    } = context;

    const isExpanded = expandedCustomer === custName;
    
    return (
      <div key={custName} className="pb-3 px-1">
        <div className="bg-white rounded-[24px] shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all duration-300">
          <button onClick={() => setExpandedCustomer(isExpanded ? null : custName)} className="w-full flex items-center justify-between p-5 text-left active:bg-morandi-oatmeal/30 transition-colors">
            <div className="flex items-center gap-4 overflow-hidden">
              <div className={`w-12 h-12 rounded-[16px] flex-shrink-0 flex items-center justify-center text-xl font-extrabold transition-colors ${isExpanded ? 'bg-morandi-blue text-white' : 'bg-morandi-oatmeal text-morandi-pebble'}`}>{String(custName || '').charAt(0)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className={`font-bold text-lg truncate tracking-tight ${isExpanded ? 'text-morandi-charcoal' : 'text-slate-700'}`}>{custName}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold flex-shrink-0 border ${statusTag.color}`}>{statusTag.label}</span>
                  {totalAmount > 0 && (<span className="bg-morandi-amber-bg text-morandi-amber-text text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 tracking-wide">${totalAmount.toLocaleString()}</span>)}
                </div>
                {!isExpanded && (<p className="text-xs text-morandi-pebble font-medium truncate leading-relaxed tracking-wide">{summaryText || `${totalItemCount} 個品項`}</p>)}
              </div>
            </div>
            {isExpanded ? <ChevronUp className="w-5 h-5 text-morandi-pebble flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-morandi-pebble flex-shrink-0" />}
          </button>
          
          {isExpanded && (
            <div className="bg-morandi-oatmeal/20 border-t border-slate-100 overflow-hidden">
              <div className="p-5 flex flex-col gap-3">
                {custOrders.map((order: any) => (
                  <SwipeableOrderCard 
                    key={`card-${order.id}`} 
                    order={order} 
                    productMap={productMap} 
                    customerMap={customerMap}
                    isLoadingProducts={isLoadingProducts}
                    isSelectionMode={isSelectionMode}
                    isSelected={selectedOrderIds.has(order.id)}
                    onToggleSelection={handleToggleSelectionStable}
                    onStatusChange={handleSwipeStatusChange}
                    onDelete={handleDeleteOrderStable}
                    onShare={handleShareOrder}
                    onMap={openGoogleMaps}
                    onEdit={handleEditOrderStable}
                    onRetry={handleRetryOrder}
                    onViewCustomer={setViewingCustomerProfile}
                  />
              ))}
              <motion.button whileTap={buttonTap} onClick={() => requireAuth(() => setQuickAddData({ customerName: custName, items: [{productId: '', quantity: 10, unit: '斤'}] }))} className="w-full mt-2 py-3 rounded-[16px] border-2 border-dashed border-morandi-blue/30 text-morandi-blue font-bold text-sm flex items-center justify-center gap-2 hover:bg-morandi-blue/5 transition-colors tracking-wide"><Plus className="w-4 h-4" /> 追加訂單</motion.button>
              <div className="flex gap-2 pt-2">
                 <motion.button whileTap={buttonTap} onClick={() => requireAuth(() => handleCopyOrder(custName, custOrders))} className="flex-1 py-3 px-4 rounded-[16px] bg-white text-morandi-pebble border border-slate-200 font-bold text-sm flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors shadow-sm tracking-wide"><Copy className="w-4 h-4" /> 複製</motion.button>
                 <motion.button whileTap={buttonTap} onClick={() => openGoogleMaps(custName)} className="flex-1 py-3 px-4 rounded-[16px] bg-morandi-blue text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-600 transition-colors shadow-lg shadow-morandi-blue/20 tracking-wide"><MapPin className="w-4 h-4" /> 導航</motion.button>
              </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }, []); // 🚨 空依賴保證參照不變

  if (!isAuthenticated) return <LoginScreen onLogin={handleLogin} />;
  
  if (isInitialLoading) {
    return (
      <div className="min-h-screen flex flex-col max-w-md mx-auto bg-morandi-oatmeal p-4 space-y-3">
        <div className="h-16 bg-white rounded-2xl shadow-sm mb-6 animate-pulse"></div>
        {[1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col max-w-md mx-auto bg-morandi-oatmeal relative shadow-2xl overflow-hidden text-morandi-charcoal font-sans">
      {/* 熱機 UI 橫幅 */}
      <AnimatePresence>
        {isWarmingUp && (
          <motion.div 
            initial={{ opacity: 0, y: -20, x: '-50%' }} 
            animate={{ opacity: 1, y: 16, x: '-50%' }} 
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="fixed top-0 left-1/2 z-[200] bg-indigo-600/90 backdrop-blur-md text-white px-5 py-2.5 rounded-full shadow-lg border border-indigo-500/50 flex items-center gap-2.5 text-sm font-medium"
          >
            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            系統重新連線與熱機中...
          </motion.div>
        )}
      </AnimatePresence>

      <header className="px-4 py-3 bg-white border-b border-gray-100 flex justify-between items-center sticky top-0 z-40">
        <div><h1 className="text-xl font-extrabold text-morandi-charcoal tracking-tight">麵廠職人</h1><p className="text-[10px] text-morandi-pebble font-bold uppercase tracking-widest mt-0.5">專業訂單管理系統</p></div>
        <div className="flex gap-2 items-center">
           {/* Step 6: Visual Indicator for Background Sync */}
           <AnimatePresence>
             {isBackgroundSyncing && !isInitialLoading && (
               <motion.div 
                 key="background-sync-indicator"
                 initial={{ opacity: 0, scale: 0.5 }} 
                 animate={{ opacity: 1, scale: 1 }} 
                 exit={{ opacity: 0, scale: 0.5 }}
                 className="w-10 h-10 flex items-center justify-center"
               >
                 <RefreshCw className="w-4 h-4 text-morandi-blue animate-spin" />
               </motion.div>
             )}
           </AnimatePresence>
           
           <button 
             onClick={() => isUnlocked ? setIsUnlocked(false) : setShowUnlockModal(true)}
             className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
               isUnlocked 
                 ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                 : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
             }`}
           >
             {isUnlocked ? (
               <><Unlock className="w-3.5 h-3.5" /> 編輯中</>
             ) : (
               <><Lock className="w-3.5 h-3.5" /> 僅檢視</>
             )}
           </button>
           
          <motion.button whileTap={buttonTap} onClick={() => setIsNotificationCenterOpen(true)} className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center border border-amber-100 text-amber-500 hover:bg-amber-100 transition-colors active:scale-95"><BellRing className="w-5 h-5" /></motion.button>
          <motion.button whileTap={buttonTap} onClick={() => setIsSettingsOpen(true)} className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center border border-slate-100 text-morandi-pebble hover:text-slate-600 transition-colors active:scale-95"><Settings className="w-5 h-5" /></motion.button>
        </div>
      </header>

      {/* --- Toast Container --- */}
      <ToastNotification toasts={toasts} removeToast={removeToast} />

      {/* --- Unlock Modal --- */}
      <AnimatePresence>
        {showUnlockModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowUnlockModal(false)} />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative bg-white rounded-[32px] shadow-2xl p-6 w-full max-w-sm border border-slate-100">
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-slate-500">
                  <Lock className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-extrabold text-slate-800 tracking-tight">系統安全鎖</h3>
                <p className="text-xs text-slate-400 mt-1 font-medium">請輸入系統密碼以啟用編輯模式</p>
              </div>
              <form onSubmit={handleAppUnlock} className="space-y-4">
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="password" 
                    placeholder="請輸入密碼" 
                    autoFocus
                    className={`w-full pl-12 pr-4 py-3 bg-slate-50 border rounded-xl text-sm font-bold tracking-wide outline-none transition-all ${unlockError ? 'border-rose-300 focus:border-rose-400 focus:ring-4 focus:ring-rose-100' : 'border-slate-200 focus:border-morandi-blue focus:ring-4 focus:ring-morandi-blue/20'}`}
                    value={unlockPassword}
                    onChange={(e) => { setUnlockPassword(e.target.value); setUnlockError(false); }}
                  />
                </div>
                <AnimatePresence>
                  {unlockError && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-rose-500 text-xs font-bold text-center">
                      密碼錯誤
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex gap-2 mt-6">
                  <button type="button" onClick={() => setShowUnlockModal(false)} className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-500 font-bold text-sm tracking-wide hover:bg-slate-200 transition-colors">取消</button>
                  <button type="submit" disabled={isUnlocking} className={`flex-1 py-3 rounded-xl text-white font-bold text-sm tracking-wide transition-colors shadow-md ${isUnlocking ? 'bg-slate-400 cursor-not-allowed' : 'bg-morandi-blue hover:bg-slate-600'}`}>
                    {isUnlocking ? '處理中...' : '解鎖'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- Product Picker Modal --- */}
      <ProductPicker 
        isOpen={pickerConfig.isOpen} 
        onClose={() => setPickerConfig(prev => ({ ...prev, isOpen: false }))} 
        onSelect={pickerConfig.onSelect} 
        products={products}
        currentSelectedId={pickerConfig.currentProductId}
        customPrices={pickerConfig.customPrices} // Added support for custom price list injection
      />

      {/* --- NEW: Customer Picker Modal --- */}
      <CustomerPicker 
        isOpen={customerPickerConfig.isOpen} 
        onClose={() => setCustomerPickerConfig(prev => ({ ...prev, isOpen: false }))} 
        onSelect={customerPickerConfig.onSelect} 
        customers={customers}
        orders={orders} // Pass orders here
        selectedDate={orderForm.date || selectedDate} // Pass selected date for filtering open stores
        currentSelectedId={customerPickerConfig.currentSelectedId}
      />

      {/* --- NEW: Conflict Resolution Modal --- */}
      <ConflictModal 
        isOpen={!!conflictData}
        conflictData={conflictData}
        onClose={() => setConflictData(null)} 
        onRefresh={() => {
          // 修正一直卡在同步中: 把發生衝突卡住的訂單狀態先清空，否則 syncData 的增量合併會保留 pending 狀態導致卡死
          if (conflictData?.type === 'batch_order' && conflictData.clientData) {
            const updatedIds = conflictData.clientData.map((u: any) => u.id);
            setOrders((prev: Order[]) => prev.map(o => updatedIds.includes(o.id) ? { ...o, syncStatus: 'synced', pendingAction: undefined } : o));
          } else if (conflictData?.type === 'order' && conflictData.clientData) {
            setOrders((prev: Order[]) => prev.map(o => o.id === conflictData.clientData.id ? { ...o, syncStatus: 'synced', pendingAction: undefined } : o));
          }
          setConflictData(null);
          syncData(true); // Re-fetch latest data
          setIsAddingOrder(false); // Force close any open editors to prevent stale data usage
          setIsEditingCustomer(null);
          setIsEditingProduct(null);
          setEditingOrderId(null);
        }}
        onForceSave={handleForceRetryWrapper}
        isSaving={isSaving}
      />

      {/* --- NEW: Voice Input Modal --- */}
      <VoiceInputModal 
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onTranscriptComplete={handleProcessVoiceOrder}
        isAiMode={isAiMode}
        onToggleAiMode={setIsAiMode}
      />

      {viewingCustomerProfile && (
        <CustomerProfileDrawer
          isOpen={true}
          onClose={() => setViewingCustomerProfile(null)}
          customerName={viewingCustomerProfile}
          customers={customers}
          orders={orders}
          products={products}
          onCreateOrder={(c) => {
            handleCreateOrderFromCustomer(c);
            setActiveTab('orders');
          }}
          onOpenReport={setViewingCustomerReport}
        />
      )}

      {viewingCustomerReport && (
        <CustomerReportModal
          isOpen={true}
          onClose={() => setViewingCustomerReport(null)}
          customerName={viewingCustomerReport}
          customers={customers}
          orders={orders}
          products={products}
        />
      )}

      {/* --- Global Loading Overlay for Voice Processing --- */}
      <AnimatePresence>
        {isProcessingVoice && (
          <motion.div key="voice-processing-overlay" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/60 z-[210] flex flex-col items-center justify-center backdrop-blur-sm">
             <motion.div 
               animate={{ rotate: 360 }}
               transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
               className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full mb-4"
             />
             <p className="text-white font-bold text-lg tracking-widest animate-pulse">{voiceLoadingText}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pendingNewOrders && pendingNewOrders.length > 0 && activeTab === 'orders' && (
          <motion.div 
            initial={{ opacity: 0, y: -50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -50, x: '-50%' }}
            className="fixed top-20 left-1/2 z-[60] drop-shadow-2xl"
          >
            <button 
              className="px-6 py-3 bg-morandi-charcoal/95 backdrop-blur-md border border-slate-600 text-white rounded-full flex items-center justify-center gap-2 hover:bg-slate-700 transition-colors shadow-[0_8px_30px_rgb(0,0,0,0.2)]"
              onClick={applyPendingOrders}
            >
              <ArrowUp className="w-5 h-5 animate-bounce text-morandi-blue" />
              <span className="font-extrabold tracking-wide">有 {pendingNewOrders.length} 筆最新訂單</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <main id="main-scroll-container" className="flex-1 overflow-y-auto pb-24 px-4" ref={scrollRef}>
        {/* ... (Main content remains unchanged) ... */}
        <AnimatePresence mode="popLayout">
        {activeTab === 'orders' && (
          <OrdersView
            isScrollingDown={isScrollingDown}
            layoutMode={layoutMode}
            selectedDate={selectedDate}
            setIsDatePickerOpen={setIsDatePickerOpen}
            triggerHaptic={triggerHaptic}
            setIsAutoOrderDashboardOpen={setIsAutoOrderDashboardOpen}
            prediction={prediction}
            setActiveTab={setActiveTab}
            orderSearch={orderSearch}
            setOrderSearch={setOrderSearch}
            setIsVoiceModalOpen={setIsVoiceModalOpen}
            isProcessingVoice={isProcessingVoice}
            showOrderDeliveryFilters={showOrderDeliveryFilters}
            setShowOrderDeliveryFilters={setShowOrderDeliveryFilters}
            orderDeliveryFilter={orderDeliveryFilter}
            setOrderDeliveryFilter={setOrderDeliveryFilter}
            virtuosoOrderData={virtuosoOrderData}
            virtuosoContext={virtuosoContext}
            renderVirtuosoItem={renderVirtuosoItem}
            scrollElement={scrollElement}
            requireAuth={requireAuth}
            setEditingOrderId={setEditingOrderId}
            setOrderForm={setOrderForm}
            setIsAddingOrder={setIsAddingOrder}
          />
        )}
        
        {/* ... (Other Tabs remain unchanged) ... */}

        {activeTab === 'customers' && (
          <CustomersView
            customers={customers}
            products={products}
            groupedOrders={groupedOrders}
            requireAuth={requireAuth}
            setCustomerForm={setCustomerForm}
            setIsEditingCustomer={setIsEditingCustomer}
            setEditCustomerMode={setEditCustomerMode}
            setTempPriceProdId={setTempPriceProdId}
            setTempPriceValue={setTempPriceValue}
            setTempPriceUnit={setTempPriceUnit}
            setViewingCustomerProfile={setViewingCustomerProfile}
            handleDeleteCustomer={handleDeleteCustomer}
          />
        )}
        {activeTab === 'products' && (
          <ProductsView
            products={products}
            setProducts={setProducts}
            hasReorderedProducts={hasReorderedProducts}
            setHasReorderedProducts={setHasReorderedProducts}
            isSaving={isSaving}
            isWarmingUp={isWarmingUp}
            isRetrying={isRetrying}
            requireAuth={requireAuth}
            handleSaveProductOrder={handleSaveProductOrder}
            setIsEditingProduct={setIsEditingProduct}
            handleDeleteProduct={handleDeleteProduct}
          />
        )}
        {/* ... (Other Tabs code remains same) ... */}
        {activeTab === 'schedule' && (
          <ScheduleView
            scheduleDate={scheduleDate}
            setScheduleDate={setScheduleDate}
            orders={orders}
            setOrders={setOrders}
            scheduleMoneySummary={scheduleMoneySummary}
            isSelectionMode={isSelectionMode}
            setIsSelectionMode={setIsSelectionMode}
            selectedOrderIds={selectedOrderIds}
            availableTrips={availableTrips}
            handleSetTrip={handleSetTrip}
            showScheduleDeliveryFilters={showScheduleDeliveryFilters}
            setShowScheduleDeliveryFilters={setShowScheduleDeliveryFilters}
            scheduleDeliveryMethodFilter={scheduleDeliveryMethodFilter}
            setScheduleDeliveryMethodFilter={setScheduleDeliveryMethodFilter}
            scheduleOrders={scheduleOrders}
            setIsTripManagerOpen={setIsTripManagerOpen}
            setSelectedDate={setSelectedDate}
            setOrderForm={setOrderForm}
            setEditingOrderId={setEditingOrderId}
            setIsAddingOrder={setIsAddingOrder}
            isOrderReorderMode={isOrderReorderMode}
            setIsOrderReorderMode={setIsOrderReorderMode}
            requireAuth={requireAuth}
            customers={customers}
            products={products}
            handleToggleSelectionStable={handleToggleSelectionStable}
            handleDeleteOrderStable={handleDeleteOrderStable}
            handleSwipeStatusChangeStable={handleSwipeStatusChangeStable}
            handleShareOrderStable={handleShareOrderStable}
            isLoadingProducts={isLoadingProducts}
            openGoogleMaps={openGoogleMaps}
            reorderedOrderIds={reorderedOrderIds}
            setReorderedOrderIds={setReorderedOrderIds}
          />
        )}
        {/* ... (Finance and Work Tabs remain unchanged) ... */}

        {activeTab === 'finance' && (
          <FinanceView 
            financeData={financeData}
            setSettlementTarget={setSettlementTarget}
            setViewingCustomerReport={setViewingCustomerReport}
            setActionMenuTarget={setActionMenuTarget}
            setPartialSettlementTarget={setPartialSettlementTarget}
            setSelectedPartialOrderIds={setSelectedPartialOrderIds}
          />
        )}
        
        {activeTab === 'work' && (
          <WorkView
            orders={orders}
            products={products}
            workDates={workDates}
            setWorkDates={setWorkDates}
            workCustomerFilter={workCustomerFilter}
            setWorkCustomerFilter={setWorkCustomerFilter}
            workDeliveryMethodFilter={workDeliveryMethodFilter}
            setWorkDeliveryMethodFilter={setWorkDeliveryMethodFilter}
            workProductFilter={workProductFilter}
            setWorkProductFilter={setWorkProductFilter}
            workSheetData={workSheetData}
            handlePrint={handlePrint}
            setActiveTab={setActiveTab}
            isProductFilterOpen={isProductFilterOpen}
            setIsProductFilterOpen={setIsProductFilterOpen}
            expandedFilterCats={expandedFilterCats}
            setExpandedFilterCats={setExpandedFilterCats}
            visibleWorkCount={visibleWorkCount}
            setVisibleWorkCount={setVisibleWorkCount}
          />
        )}
        </AnimatePresence>
      </main>
      
      {/* ... (Modals code remains same - ConfirmModal, HolidayCalendar, DatePickerModal, SettingsModal, QuickAdd, etc.) ... */}
      
      {/* (Modal closing tags are here in original code) */}
      <ConfirmModal isOpen={confirmConfig.isOpen} title={confirmConfig.title} message={confirmConfig.message} onConfirm={confirmConfig.onConfirm} onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))} />
      {holidayEditorId && (<HolidayCalendar storeName={isEditingCustomer ? (customerForm.name || '') : ''} holidays={customerForm.holidayDates || []} offDays={customerForm.offDays || []} onToggle={(date) => { setCustomerForm(prev => { const current = prev.holidayDates || []; const newHolidays = current.includes(date) ? current.filter(d => d !== date) : [...current, date]; return {...prev, holidayDates: newHolidays}; }); }} onClose={() => setHolidayEditorId(null)} />)}
      
      <AnimatePresence>
        {directHolidayCustomer && (
          <HolidayCalendar
            storeName={directHolidayCustomer.name}
            holidays={directHolidayCustomer.holidayDates || []}
            offDays={directHolidayCustomer.offDays || []}
            onToggle={(date) => {
              setDirectHolidayCustomer(prev => {
                if (!prev) return prev;
                const current = prev.holidayDates || [];
                const newHolidays = current.includes(date) 
                  ? current.filter(d => d !== date) 
                  : [...current, date];
                return { ...prev, holidayDates: newHolidays };
              });
            }}
            onClose={async () => {
              // 記住原本的狀態，以備失敗時還原
              const originalCustomer = customers.find(c => c.id === directHolidayCustomer?.id);
              if (!directHolidayCustomer) return;
              const updatedCustomer = { ...directHolidayCustomer, lastUpdated: Date.now() };
              
              // 1. 樂觀更新畫面
              setCustomers(prev => prev.map(c => c.id === directHolidayCustomer.id ? updatedCustomer : c));
              setDirectHolidayCustomer(null);
              
              if (apiEndpoint && originalCustomer) {
                try {
                  // 2. 補上 originalLastUpdated 與強制覆蓋屬性
                  const payload = { 
                    ...updatedCustomer, 
                    originalLastUpdated: originalCustomer.lastUpdated, 
                    force: true  // 👉 新增這行，讓後端放行公休狀態的單點更新
                  };
                  const res = await fetchWithRetry(apiEndpoint, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'updateCustomer', data: payload })
                  });
                  const json = await res.json();
                  
                  if (!json.success) {
                    console.error("公休儲存失敗:", json);
                    // 3. 失敗還原
                    setCustomers(prev => prev.map(c => c.id === originalCustomer.id ? originalCustomer : c));
                    addToast("公休儲存失敗，請重新整理後再試", "error");
                  } else {
                    // 成功時，把後端產生的最新時間戳記更新到本地
                    const newVersion = json.data?.lastUpdated || payload.lastUpdated;
                    setCustomers(prev => prev.map(c => c.id === originalCustomer.id ? { ...updatedCustomer, lastUpdated: newVersion } : c));
                  }
                } catch (e) {
                  console.error("公休儲存失敗", e);
                  // 3. 失敗還原
                  setCustomers(prev => prev.map(c => c.id === originalCustomer.id ? originalCustomer : c));
                  addToast("網路連線異常，公休儲存失敗", "error");
                }
              }
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>{isDatePickerOpen && <DatePickerModal selectedDate={selectedDate} onSelect={setSelectedDate} onClose={() => setIsDatePickerOpen(false)} />}</AnimatePresence>
      <AnimatePresence>
        {isOrderDatePickerOpen && (
          <DatePickerModal 
            selectedDate={orderForm.date || selectedDate} 
            onSelect={(date) => {
              handleOrderFormChange('date', date);
              setIsOrderDatePickerOpen(false);
            }} 
            onClose={() => setIsOrderDatePickerOpen(false)} 
            offDays={customers.find(c => c.name === orderForm.customerName)?.offDays || []}
            holidayDates={customers.find(c => c.name === orderForm.customerName)?.holidayDates || []}
          />
        )}
      </AnimatePresence>
      <NotificationCenterModal 
        isOpen={isNotificationCenterOpen} 
        onClose={() => setIsNotificationCenterOpen(false)} 
        customers={customers} 
        products={products} 
        lineChannelToken={lineChannelToken} 
        setLineChannelToken={setLineChannelToken}
        lineUserId={lineUserId}
        setLineUserId={setLineUserId}
        apiEndpoint={apiEndpoint}
      />
      <AnimatePresence>{isSettingsOpen && (<SettingsModal onClose={() => setIsSettingsOpen(false)} onSync={syncData} onSavePassword={handleChangePassword} currentUrl={apiEndpoint} onSaveUrl={handleSaveApiUrl} layoutMode={layoutMode} onLayoutModeChange={setLayoutMode} />)}</AnimatePresence>
      <AnimatePresence>{quickAddData && (<div key="quick-add-modal" className="fixed inset-0 bg-morandi-charcoal/40 z-[70] flex flex-col items-center justify-center p-4 backdrop-blur-sm"><motion.div variants={modalVariants} initial="hidden" animate="visible" exit="exit" className="bg-white w-full max-w-sm max-h-[85vh] flex flex-col rounded-[32px] overflow-hidden shadow-xl border border-slate-200"><div className="p-5 bg-morandi-oatmeal/30 border-b border-gray-100 flex-shrink-0"><h3 className="text-center font-extrabold text-morandi-charcoal text-lg">追加訂單</h3><p className="text-center text-xs text-morandi-pebble font-bold tracking-wide mt-1">{quickAddData.customerName}</p></div><div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar"><AnimatePresence initial={false}>{quickAddData.items.map((item, index) => (<motion.div key={index} initial={{ opacity: 0, height: 0, scale: 0.95 }} animate={{ opacity: 1, height: 'auto', scale: 1 }} exit={{ opacity: 0, height: 0, scale: 0.9 }} className="bg-white rounded-[20px] p-3 shadow-sm border border-slate-100 flex flex-wrap gap-2 items-center"><div className="flex-1 min-w-[120px]"><div onClick={() => { const currentCustomer = customers.find(c => c.name === quickAddData.customerName); setPickerConfig({ isOpen: true, currentProductId: item.productId, customPrices: currentCustomer?.priceList, onSelect: (pid) => { const newItems = [...quickAddData.items]; const p = products.find(x => x.id === pid); newItems[index] = { ...item, productId: pid, productName: p?.name, unit: p?.unit || '斤' }; setQuickAddData({...quickAddData, items: newItems}); } }); }} className="w-full bg-morandi-oatmeal/50 p-3 rounded-xl font-bold text-sm text-morandi-charcoal border border-slate-200 flex items-center justify-between cursor-pointer hover:border-morandi-blue transition-all"><span className={item.productId ? 'text-slate-800' : 'text-gray-400'}>{products.find(p => p.id === item.productId)?.name || '選擇品項...'}</span><ChevronDown className="w-4 h-4 text-gray-400" /></div></div><div className="w-20"><input type="number" min="0" onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} placeholder="數量" className="w-full bg-morandi-oatmeal/50 p-3 rounded-xl text-center font-black text-lg text-morandi-charcoal border border-slate-200 outline-none focus:ring-2 focus:ring-morandi-blue transition-all" value={item.quantity === 0 ? '' : item.quantity} onChange={(e) => { const newItems = [...quickAddData.items]; const val = parseFloat(e.target.value); newItems[index].quantity = isNaN(val) ? 0 : Math.max(0, val); setQuickAddData({...quickAddData, items: newItems}); }} /></div><div className="w-20"><select value={item.unit || '斤'} onChange={(e) => { const newItems = [...quickAddData.items]; newItems[index].unit = e.target.value; setQuickAddData({...quickAddData, items: newItems}); }} className="w-full bg-morandi-oatmeal/50 p-3 rounded-xl font-bold text-morandi-charcoal border border-slate-100 outline-none focus:ring-2 focus:ring-morandi-blue transition-all">{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></div><button onClick={() => { const newItems = quickAddData.items.filter((_, i) => i !== index); setQuickAddData({...quickAddData, items: newItems}); }} className="p-3 bg-rose-50 text-rose-400 hover:text-rose-600 rounded-xl transition-colors"><Trash2 className="w-4 h-4" /></button></motion.div>))}</AnimatePresence><motion.button whileTap={buttonTap} onClick={() => setQuickAddData({...quickAddData, items: [...quickAddData.items, {productId: '', quantity: 10, unit: '斤'}]})} className="w-full py-3 rounded-[16px] border-2 border-dashed border-morandi-blue/30 text-morandi-blue font-bold text-sm flex items-center justify-center gap-2 hover:bg-morandi-blue/5 transition-colors tracking-wide mt-2"><Plus className="w-4 h-4" /> 增加品項</motion.button></div><div className="p-5 bg-white border-t border-gray-100 flex-shrink-0 space-y-4"><AnimatePresence>{(() => { const preview = getQuickAddPricePreview(); if (preview && preview.total > 0) { return (<motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-morandi-amber-bg p-4 rounded-xl border border-amber-100 flex justify-between items-center"><div className="flex flex-col"><span className="text-[10px] font-bold text-morandi-amber-text/70 uppercase tracking-widest">預估總金額</span><span className="text-xs font-medium text-morandi-amber-text/60 mt-0.5 tracking-wide">共 {preview.itemCount} 個品項</span></div><span className="text-2xl font-black text-morandi-amber-text tracking-tight">${preview.total.toLocaleString()}</span></motion.div>); } return null; })()}</AnimatePresence><div className="flex gap-2"><motion.button whileTap={buttonTap} onClick={() => setQuickAddData(null)} className="flex-1 py-3 rounded-[16px] font-bold text-morandi-pebble hover:bg-gray-50 transition-colors border border-slate-200">取消</motion.button><motion.button whileTap={buttonTap} onClick={handleQuickAddSubmit} className="flex-1 py-3 rounded-[16px] font-bold text-white shadow-md bg-morandi-blue hover:bg-slate-600">確認追加</motion.button></div></div></motion.div></div>)}</AnimatePresence>
      <AnimatePresence>
      {isAddingOrder && (
        <motion.div key="order-modal" className="fixed inset-0 bg-morandi-oatmeal z-[60] flex flex-col">
          <motion.div initial={{ opacity: 0, y: "100%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="flex flex-col h-full">
          <div className="bg-white p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 z-10"><motion.button whileTap={buttonTap} onClick={() => { setIsAddingOrder(false); setEditingOrderId(null); }} className="p-2 rounded-2xl bg-gray-50 text-morandi-pebble"><X className="w-6 h-6" /></motion.button><h2 className="text-lg font-extrabold text-morandi-charcoal tracking-tight">{editingOrderId ? `編輯訂單 - ${orderForm.customerName}` : '建立配送訂單'}</h2><motion.button whileTap={buttonTap} onClick={() => requireAuth(handleSaveOrder)} disabled={isSaving || isWarmingUp} className="font-bold px-4 py-2 transition-colors text-morandi-blue disabled:text-gray-300">{isWarmingUp ? '連線中...' : (isRetrying ? '↻ 正在重試...' : (isSaving ? '儲存中...' : (editingOrderId ? '更新訂單' : '儲存')))}</motion.button></div>
          <div className="p-6 space-y-6 overflow-y-auto pb-10">
            {/* NEW: Date Picker for Order */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">配送日期</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                  <CalendarDays className="w-5 h-5 text-gray-400" />
                </div>
                <button 
                  type="button"
                  onClick={() => setIsOrderDatePickerOpen(true)}
                  className="w-full pl-12 pr-5 py-5 bg-white rounded-[24px] shadow-sm border border-slate-200 text-morandi-charcoal font-bold outline-none focus:ring-2 focus:ring-morandi-blue transition-all text-left flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span>{orderForm.date || selectedDate}</span>
                    {(() => {
                      const c = customers.find(x => x.name === orderForm.customerName);
                      if (!c) return null;
                      const dateObj = new Date(orderForm.date || selectedDate);
                      const dayOfWeek = dateObj.getDay();
                      const isHoliday = (c.offDays || []).includes(dayOfWeek) || (c.holidayDates || []).includes(orderForm.date || selectedDate);
                      if (isHoliday) {
                        return <span className="bg-rose-100 text-rose-500 text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap">此日公休</span>;
                      }
                      return null;
                    })()}
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>

            <div className="flex bg-white p-1 rounded-[24px] shadow-sm border border-slate-100"><button onClick={() => handleOrderFormChange('customerType', 'existing')} className={`flex-1 py-4 rounded-[20px] text-xs font-bold transition-all tracking-wide ${orderForm.customerType === 'existing' ? 'bg-morandi-blue text-white shadow-md' : 'text-morandi-pebble'}`}>現有客戶</button><button onClick={() => { handleOrderFormChange('customerType', 'retail'); handleOrderFormChange('customerId', ''); }} className={`flex-1 py-4 rounded-[20px] text-xs font-bold transition-all tracking-wide ${orderForm.customerType === 'retail' ? 'bg-morandi-blue text-white shadow-md' : 'text-morandi-pebble'}`}>零售客戶</button></div>
            {orderForm.customerType === 'existing' ? (
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">配送店家</label>
                <div className="relative">
                  {/* 使用 CustomerPicker 取代原本的下拉選單 */}
                  <motion.button 
                    whileTap={buttonTap} 
                    onClick={() => setCustomerPickerConfig({
                       isOpen: true,
                       currentSelectedId: orderForm.customerId,
                       onSelect: (id) => handleSelectExistingCustomer(id)
                    })} 
                    className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 flex justify-between items-center font-bold text-morandi-charcoal focus:ring-2 focus:ring-morandi-blue transition-all"
                  >
                    <span className="flex items-center gap-2">
                       {orderForm.customerName || "選擇店家..."}
                       {orderForm.customerName && groupedOrders[orderForm.customerName] && (<span className="bg-amber-400 text-white text-[9px] px-2 py-0.5 rounded-full tracking-wide">已建立</span>)}
                    </span>
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  </motion.button>
                </div>
              </div>
            ) : (<div className="space-y-2"><label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">客戶名稱</label><input type="text" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 text-morandi-charcoal font-bold outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="輸入零售名稱..." value={orderForm.customerName} onChange={(e) => handleOrderFormChange('customerName', e.target.value)} /></div>)}
            
            {/* ... Order Form Fields (Time, Items, Note etc.) ... */}
             <div className="space-y-2"><label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">配送設定</label><div className="flex gap-2"><div className="flex-1"><input type="time" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 text-morandi-charcoal font-bold outline-none focus:ring-2 focus:ring-morandi-blue transition-all" value={orderForm.deliveryTime} onChange={(e) => handleOrderFormChange('deliveryTime', e.target.value)} /></div><div className="flex-1"><button type="button" onClick={() => setDrawerConfig({ isOpen: true, type: 'deliveryMethod', target: 'order' })} className="w-full h-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 text-morandi-charcoal font-bold outline-none focus:ring-2 focus:ring-morandi-blue transition-all flex justify-between items-center"><span className={orderForm.deliveryMethod ? 'text-morandi-charcoal' : 'text-gray-400'}>{orderForm.deliveryMethod || '配送方式...'}</span><ChevronDown className="w-4 h-4 text-gray-400" /></button></div><div className="flex-1"><button type="button" onClick={() => setDrawerConfig({ isOpen: true, type: 'trip', target: 'order' })} className="w-full h-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 text-morandi-charcoal font-bold outline-none focus:ring-2 focus:ring-morandi-blue transition-all flex justify-between items-center"><span className={orderForm.trip ? 'text-morandi-charcoal' : 'text-gray-400'}>{orderForm.trip || '選擇趟數...'}</span><ChevronDown className="w-4 h-4 text-gray-400" /></button></div></div></div>
             <div className="space-y-4"><div className="flex justify-between items-center"><label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">品項明細</label><div className="flex gap-2">{lastOrderCandidate && (<motion.button whileTap={buttonTap} onClick={applyLastOrder} className="text-[10px] font-bold text-white bg-morandi-blue px-2 py-1 rounded-lg shadow-sm flex items-center gap-1"><History className="w-3 h-3" /> 帶入{lastOrderCandidate.sourceLabel || '上次'} ({lastOrderCandidate.date})</motion.button>)}<button onClick={() => handleOrderFormChange('items', [...orderForm.items, {productId: '', quantity: 10, unit: '斤'}])} className="text-[10px] font-bold text-morandi-blue tracking-wide"><Plus className="w-3 h-3 inline mr-1" /> 增加品項</button></div></div>{orderForm.items.map((item, idx) => (<motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} key={idx} className="bg-white p-5 rounded-[28px] shadow-sm border border-slate-200 flex items-center gap-2 flex-wrap"><div onClick={() => { const currentCustomer = customers.find(c => c.id === orderForm.customerId); setPickerConfig({ isOpen: true, currentProductId: item.productId, customPrices: currentCustomer?.priceList, onSelect: (pid) => { const n = [...orderForm.items]; const p = products.find(x => x.id === pid); n[idx] = { ...item, productId: pid, productName: p?.name, unit: p?.unit || '斤' }; handleOrderFormChange('items', n); } }); }} className="w-full sm:flex-1 bg-morandi-oatmeal/50 p-4 rounded-xl text-sm font-bold border border-slate-100 flex items-center justify-between cursor-pointer hover:border-morandi-blue transition-all mb-2 sm:mb-0"><span className={item.productId ? 'text-morandi-charcoal' : 'text-gray-400'}>{products.find(p => p.id === item.productId)?.name || '選擇品項...'}</span><ChevronDown className="w-4 h-4 text-gray-400" /></div><div className="flex items-center gap-2 w-full sm:w-auto justify-between"><input type="number" min="0" onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} className="w-20 bg-morandi-oatmeal/50 p-4 rounded-xl text-center font-bold border border-slate-100 text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" value={item.quantity === 0 ? '' : item.quantity} onChange={(e) => { const n = [...orderForm.items]; const val = parseFloat(e.target.value); n[idx].quantity = isNaN(val) ? 0 : Math.max(0, val); handleOrderFormChange('items', n); }} /><select value={item.unit || '斤'} onChange={(e) => { const n = [...orderForm.items]; n[idx].unit = e.target.value; handleOrderFormChange('items', n); }} className="w-20 bg-morandi-oatmeal/50 p-4 rounded-xl font-bold text-morandi-charcoal border border-slate-100 outline-none focus:ring-2 focus:ring-morandi-blue transition-all">{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select><motion.button whileTap={buttonTap} onClick={() => { const n = orderForm.items.filter((_, i) => i !== idx); handleOrderFormChange('items', n.length ? n : [{productId:'', quantity:10, unit:'斤'}]); }} className="p-2 text-morandi-pink hover:text-rose-300 transition-colors"><Trash2 className="w-4 h-4" /></motion.button></div></motion.div>))}</div>
             <div className="space-y-2"><label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">訂單預覽</label><div className="bg-morandi-amber-bg rounded-[24px] p-5 shadow-sm border border-amber-100/50"><div className="flex justify-between items-center mb-3 border-b border-amber-100 pb-2"><div className="flex items-center gap-2 text-morandi-amber-text"><Calculator className="w-4 h-4" /><span className="text-xs font-bold tracking-wide">預估清單</span></div><div className="text-xs font-bold text-morandi-amber-text/60 tracking-wide">共 {orderSummary.details.filter(d => d.rawQty > 0).length} 項</div></div><div className="space-y-2 mb-4">{orderSummary.details.filter(d => d.rawQty > 0).map((detail, i) => (<div key={i} className="flex justify-between items-center text-sm"><div className="flex flex-col"><span className="font-bold text-slate-700 tracking-wide">{detail.name}</span>{detail.isCalculated && (<span className="text-[10px] text-gray-400">(以單價 ${detail.unitPrice} 換算: {detail.rawQty}元 &rarr; {detail.displayQty}{detail.displayUnit})</span>)}</div><div className="flex items-center gap-3"><span className="font-bold text-slate-600">{detail.displayQty} {detail.displayUnit}</span><span className="font-black text-amber-600 w-12 text-right tracking-tight">${detail.subtotal}</span></div></div>))}{orderSummary.details.filter(d => d.rawQty > 0).length === 0 && (<div className="text-center text-xs text-amber-400 italic py-2 tracking-wide">尚未加入有效品項</div>)}</div><div className="flex justify-between items-center pt-3 border-t border-amber-200"><span className="text-xs font-bold text-amber-700 tracking-wide">預估總金額</span><span className="text-xl font-black text-amber-600 tracking-tight">${orderSummary.totalPrice}</span></div></div></div>
             <div className="space-y-2"><label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">訂單備註</label><textarea className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 text-morandi-charcoal font-bold resize-none outline-none focus:ring-2 focus:ring-morandi-blue transition-all placeholder:text-gray-300" rows={3} placeholder="備註特殊需求..." value={orderForm.note} onChange={(e) => handleOrderFormChange('note', e.target.value)} /></div>
          </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {/* 移除 AnimatePresence，讓視窗立即關閉，避免動畫與資料更新衝突導致崩潰 */}
      {isTripManagerOpen && (
        <motion.div key="trip-manager-modal" className="fixed inset-0 z-[60]">
          <TripManagerModal 
            availableTrips={availableTrips}
            setAvailableTrips={setAvailableTrips}
            orders={orders}
            setOrders={setOrders}
            onClose={() => setIsTripManagerOpen(false)}
            saveOrderToCloud={saveOrderToCloud}
            saveTripsToCloud={saveTripsToCloud}
          />
        </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence>
       {isEditingCustomer && (
        <motion.div 
          key="customer-modal" 
          className={`fixed inset-0 z-[110] flex ${
            editCustomerMode === 'itemsOnly' 
              ? 'bg-morandi-charcoal/40 backdrop-blur-sm items-center justify-center p-4' 
              : 'bg-morandi-oatmeal flex-col'
          }`}
        >
          <motion.div 
            initial={{ opacity: 0, y: "100%" }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: "100%" }} 
            transition={{ type: "spring", damping: 25, stiffness: 300 }} 
            className={`flex flex-col ${
              editCustomerMode === 'itemsOnly' 
                ? 'bg-white w-full max-w-2xl rounded-[32px] overflow-hidden shadow-xl max-h-[90vh]' 
                : 'h-full'
            }`}
          >
          <div className="bg-white p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 z-10"><motion.button whileTap={buttonTap} onClick={() => { setIsEditingCustomer(null); setEditCustomerMode('full'); }} className="p-2 rounded-2xl bg-gray-50"><X className="w-6 h-6 text-morandi-pebble" /></motion.button><h2 className="text-lg font-extrabold text-morandi-charcoal tracking-tight">{editCustomerMode === 'itemsOnly' ? '修改預設品項' : editCustomerMode === 'holidayOnly' ? '設定公休' : '店家詳細資料'}</h2><motion.button whileTap={buttonTap} onClick={() => requireAuth(handleSaveCustomer)} disabled={isSaving || isWarmingUp} className="font-bold px-4 py-2 transition-colors text-morandi-blue disabled:text-gray-300">{isWarmingUp ? '連線中...' : (isRetrying ? '↻ 正在重試...' : (isSaving ? '儲存中...' : '儲存'))}</motion.button></div>
          <div className="p-6 overflow-y-auto pb-10">
            <div className={`grid grid-cols-1 ${editCustomerMode === 'full' ? 'lg:grid-cols-2' : 'max-w-2xl mx-auto'} gap-6`}>
              {/* 左欄：基本資訊與配送 */}
              {editCustomerMode === 'full' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">基本資訊</label>
                  <div className="space-y-4">
                    <input type="text" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="店名" value={customerForm.name || ''} onChange={(e) => setCustomerForm({...customerForm, name: e.target.value})} />
                    <input type="tel" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="電話" value={customerForm.phone || ''} onChange={(e) => setCustomerForm({...customerForm, phone: e.target.value})} />
                    <input type="text" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="請輸入完整地址" value={customerForm.address || ''} onChange={(e) => setCustomerForm({...customerForm, address: e.target.value})} />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">配送與習慣</label>
                  <div className="space-y-4">
                    <div className="space-y-1"><label className="text-[10px] font-bold text-gray-400 pl-1">配送方式</label><select value={customerForm.deliveryMethod || ''} onChange={(e) => setCustomerForm({...customerForm, deliveryMethod: e.target.value})} className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#8e9775] transition-all appearance-none"><option value="">選擇配送方式...</option>{DELIVERY_METHODS.map(method => (<option key={method} value={method}>{method}</option>))}</select></div>
                    <div className="space-y-1"><label className="text-[10px] font-bold text-gray-400 pl-1">預定習慣</label><select value={customerForm.paymentTerm || 'regular'} onChange={(e) => setCustomerForm({...customerForm, paymentTerm: e.target.value as any})} className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#8e9775] transition-all appearance-none">{ORDERING_HABITS.map(habit => (<option key={habit.value} value={habit.value}>{habit.label}</option>))}</select></div>
                    <div className="space-y-1"><label className="text-[10px] font-bold text-gray-400 pl-1">配送時間</label><input type="time" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#8e9775] transition-all" value={customerForm.deliveryTime || '08:00'} onChange={(e) => setCustomerForm({...customerForm, deliveryTime: e.target.value})} /></div>
                    <div className="space-y-1"><label className="text-[10px] font-bold text-gray-400 pl-1">預設趟數</label><button type="button" onClick={() => setDrawerConfig({ isOpen: true, type: 'trip', target: 'customer' })} className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold outline-none focus:ring-2 focus:ring-morandi-blue transition-all flex justify-between items-center"><span className={customerForm.defaultTrip ? 'text-slate-800' : 'text-gray-400'}>{customerForm.defaultTrip || '選擇預設趟數...'}</span><ChevronDown className="w-4 h-4 text-gray-400" /></button></div>
                  </div>
                </div>
              </div>
              )}

              {/* 右欄：品項與價格 */}
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">預設品項</label>
                  <div className="space-y-3">
                     {(customerForm.defaultItems || []).map((item, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                           <div onClick={() => setPickerConfig({ isOpen: true, currentProductId: item.productId, customPrices: customerForm.priceList, onSelect: (pid) => { const newItems = [...(customerForm.defaultItems || [])]; const p = products.find(x => x.id === pid); newItems[idx] = { ...item, productId: pid, productName: p?.name, unit: p?.unit || '斤' }; setCustomerForm({...customerForm, defaultItems: newItems}); } })} className="flex-1 bg-morandi-oatmeal/50 p-3 rounded-xl font-bold text-sm text-morandi-charcoal border border-slate-200 flex items-center justify-between cursor-pointer hover:border-morandi-blue transition-all">
                              <span className={item.productId ? 'text-morandi-charcoal' : 'text-gray-400'}>{products.find(p => p.id === item.productId)?.name || '選擇品項...'}</span>
                              <ChevronDown className="w-4 h-4 text-gray-400" />
                           </div>
                           <input type="number" min="0" onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} className="w-16 p-3 bg-white rounded-xl text-center font-bold text-slate-700 outline-none border border-slate-200" value={item.quantity === 0 ? '' : item.quantity} onChange={(e) => { const newItems = [...(customerForm.defaultItems || [])]; const val = parseFloat(e.target.value); newItems[idx].quantity = isNaN(val) ? 0 : Math.max(0, val); setCustomerForm({...customerForm, defaultItems: newItems}); }} />
                           <select value={item.unit || '斤'} onChange={(e) => { const newItems = [...(customerForm.defaultItems || [])]; newItems[idx].unit = e.target.value; setCustomerForm({...customerForm, defaultItems: newItems}); }} className="w-20 p-3 bg-white rounded-xl font-bold text-slate-700 outline-none border border-slate-200">{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select>
                           <button onClick={() => setCustomerForm({...customerForm, defaultItems: customerForm.defaultItems?.filter((_, i) => i !== idx)})} className="p-3 bg-rose-50 text-rose-400 rounded-xl"><Trash2 className="w-4 h-4" /></button>
                        </div>
                     ))}
                     <button onClick={() => setCustomerForm({...customerForm, defaultItems: [...(customerForm.defaultItems || []), {productId: '', quantity: 10, unit: '斤'}]})} className="w-full py-3 rounded-xl border border-dashed border-gray-300 text-gray-400 font-bold text-xs flex items-center justify-center gap-1 hover:bg-gray-50 tracking-wide"><Plus className="w-4 h-4" /> 新增預設品項</button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">專屬價目表</label>
                  <div className="bg-amber-50 p-4 rounded-[24px] space-y-3 border border-amber-100">
                     <div className="flex gap-2">
                        <div onClick={() => setPickerConfig({ isOpen: true, currentProductId: tempPriceProdId, onSelect: (pid) => { setTempPriceProdId(pid); const p = products.find(x => x.id === pid); if (p?.unit) setTempPriceUnit(p.unit); } })} className="flex-1 bg-white p-3 rounded-xl font-bold text-sm text-slate-700 border border-slate-100 flex items-center justify-between cursor-pointer hover:border-amber-400 transition-all">
                           <span className={tempPriceProdId ? 'text-slate-700' : 'text-gray-400'}>{products.find(p => p.id === tempPriceProdId)?.name || '選擇品項...'}</span>
                           <ChevronDown className="w-4 h-4 text-gray-400" />
                        </div>
                        <input type="number" min="0" onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} placeholder="單價" className="w-20 p-3 bg-white rounded-xl text-center font-bold text-slate-700 outline-none border border-slate-100" value={tempPriceValue} onChange={(e) => { const val = e.target.value; if (val === '' || (!isNaN(Number(val)) && Number(val) >= 0)) { setTempPriceValue(val); } }} />
                        <select value={tempPriceUnit} onChange={(e) => setTempPriceUnit(e.target.value)} className="w-20 p-3 bg-white rounded-xl font-bold text-slate-700 outline-none border border-slate-100">{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select>
                        <button onClick={() => { if(tempPriceProdId && tempPriceValue) { const newPriceList = [...(customerForm.priceList || [])]; const existingIdx = newPriceList.findIndex(x => x.productId === tempPriceProdId); if(existingIdx >= 0) { newPriceList[existingIdx].price = Number(tempPriceValue); newPriceList[existingIdx].unit = tempPriceUnit; } else { newPriceList.push({productId: tempPriceProdId, price: Number(tempPriceValue), unit: tempPriceUnit}); } setCustomerForm({...customerForm, priceList: newPriceList}); setTempPriceProdId(''); setTempPriceValue(''); setTempPriceUnit('斤'); } }} className="p-3 bg-amber-400 text-white rounded-xl shadow-sm"><Plus className="w-4 h-4" /></button>
                     </div>
                     <div className="space-y-2">{(customerForm.priceList || []).map((pl, idx) => { const p = products.find(prod => prod.id === pl.productId); return (<div key={idx} className="flex justify-between items-center bg-white p-3 rounded-xl shadow-sm border border-slate-100"><span className="text-sm font-bold text-slate-700 tracking-wide">{p?.name || pl.productId}</span><div className="flex items-center gap-3"><div className="flex items-center gap-1"><span className="font-black text-amber-500">$</span><input type="number" min="0" className="w-16 bg-transparent font-black text-amber-500 tracking-tight outline-none border-b border-transparent hover:border-amber-200 focus:border-amber-500 text-right" value={pl.price} onChange={(e) => { const val = e.target.value; if (val === '' || (!isNaN(Number(val)) && Number(val) >= 0)) { const newPriceList = [...(customerForm.priceList || [])]; newPriceList[idx].price = Number(val); setCustomerForm({...customerForm, priceList: newPriceList}); } }} /><span className="text-xs text-gray-400 font-bold">/ {pl.unit || '斤'}</span></div><button onClick={() => setCustomerForm({...customerForm, priceList: customerForm.priceList?.filter((_, i) => i !== idx)})} className="text-gray-300 hover:text-rose-400"><X className="w-4 h-4" /></button></div></div>); })}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 進階設定區塊 */}
            {(editCustomerMode === 'full' || editCustomerMode === 'holidayOnly') && (
            <div className="mt-8 pt-6 border-t border-gray-100">
              {editCustomerMode === 'full' && (
              <button
                type="button"
                onClick={() => setShowAdvancedCustomerSettings(!showAdvancedCustomerSettings)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gray-50 hover:bg-gray-100 rounded-2xl transition-colors text-sm font-bold text-gray-500"
              >
                {showAdvancedCustomerSettings ? '收起進階設定' : '展開進階設定'}
                <ChevronDown className={`w-4 h-4 transition-transform ${showAdvancedCustomerSettings ? 'rotate-180' : ''}`} />
              </button>
              )}

              <AnimatePresence>
                {(showAdvancedCustomerSettings || editCustomerMode === 'holidayOnly') && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {editCustomerMode === 'full' && (
                      <div className="space-y-4">
                        <div className="p-4 bg-slate-50 rounded-[20px] border border-slate-100 space-y-3">
                          <label className="text-[10px] font-bold text-gray-400 pl-1">座標設定</label>
                          <div>
                            <input type="text" className="w-full p-4 bg-white rounded-[16px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="例如: 25.033964, 121.564468" value={customerForm.coordinates || ''} onChange={(e) => setCustomerForm({...customerForm, coordinates: e.target.value})} />
                            <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed flex items-start gap-1">
                              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              💡 提示：在 Google 地圖上對著地點按右鍵，即可點擊複製座標。
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                          <div>
                            <label className="font-bold text-slate-700 block text-sm">自動產生預設訂單</label>
                            <span className="text-xs text-gray-400">每日半夜自動依據預設品項建立當日訂單</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setCustomerForm({ ...customerForm, autoOrderEnabled: !customerForm.autoOrderEnabled })}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              customerForm.autoOrderEnabled ? 'bg-emerald-500' : 'bg-gray-200'
                            }`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              customerForm.autoOrderEnabled ? 'translate-x-6' : 'translate-x-1'
                            }`} />
                          </button>
                        </div>
                      </div>
                      )}

                      <div className="space-y-4">
                        <div className="space-y-1"><label className="text-[10px] font-bold text-gray-400 pl-1">每週公休</label><div className="flex gap-2">{WEEKDAYS.map(d => { const isOff = (customerForm.offDays || []).includes(d.value); return (<button key={d.value} onClick={() => { const current = customerForm.offDays || []; const newOff = isOff ? current.filter(x => x !== d.value) : [...current, d.value]; setCustomerForm({...customerForm, offDays: newOff}); }} className={`w-10 h-10 rounded-xl font-bold text-xs transition-all ${isOff ? 'bg-rose-500 text-white shadow-md' : 'bg-white text-gray-400 border border-slate-200'}`}>{d.label}</button>); })}</div></div>
                        <div className="space-y-1"><label className="text-[10px] font-bold text-gray-400 pl-1">特定公休</label><div className="flex flex-wrap gap-2">{getUpcomingHolidays(customerForm.offDays || [], customerForm.holidayDates || []).map(date => { const isWeeklyOff = isDateInOffDays(date, customerForm.offDays || []); return (<span key={date} className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border ${isWeeklyOff ? 'bg-gray-100 text-gray-500 border-gray-200' : 'bg-rose-50 text-rose-500 border-rose-100'}`}>{date}{isWeeklyOff ? <span className="text-[10px] ml-1">(每週公休)</span> : <button onClick={() => setCustomerForm({...customerForm, holidayDates: customerForm.holidayDates?.filter(d => d !== date)})}><X className="w-3 h-3" /></button>}</span>); })}<button onClick={() => setHolidayEditorId('new')} className="bg-gray-50 text-gray-400 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-gray-100 border border-slate-200"><Plus className="w-3 h-3" /> 新增日期</button></div></div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            )}
          </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* 連線逾時/死鎖彈窗 */}
      <NetworkTimeoutModal isOpen={showDeadlockModal} />

      
      <ProductEditModal 
        isOpen={!!isEditingProduct}
        onClose={() => setIsEditingProduct(null)}
        initialData={isEditingProduct === 'new' ? null : productMap[isEditingProduct as string]}
        onSave={async (data) => requireAuth(() => handleSaveProduct(data))}
        isSaving={isSaving}
        isWarmingUp={isWarmingUp}
        isRetrying={isRetrying}
      />


      <AnimatePresence>
      {selectedCustomerForModal && groupedOrders[selectedCustomerForModal] && (
        <motion.div 
          key="selected-customer-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" 
          onClick={() => setSelectedCustomerForModal(null)}
        >
          <motion.div 
            initial={{ scale: 0.95 }} 
            animate={{ scale: 1 }} 
            exit={{ scale: 0.95 }} 
            className="w-full max-w-sm max-h-[90vh] overflow-y-auto" 
            onClick={e => e.stopPropagation()}
          >
            <div className="space-y-3">
              <AnimatePresence initial={false}>
              {groupedOrders[selectedCustomerForModal].slice(0, visibleModalOrderCount).map(order => (
                <motion.div
                  key={order.id}
                  layout="position"
                  initial={{ opacity: 0, height: 0, y: -20, overflow: 'hidden' }}
                  animate={{ opacity: 1, height: 'auto', y: 0, overflow: 'visible' }}
                  exit={{ opacity: 0, height: 0, scale: 0.95, overflow: 'hidden' }}
                  transition={{ 
                     opacity: { duration: 0.2 },
                     height: { type: "spring", stiffness: 300, damping: 30 },
                     y: { type: "spring", stiffness: 300, damping: 30 }
                  }}
                >
                  <SwipeableOrderCard 
                    key={order.id}
                    order={order} 
                    productMap={productMap} 
                    customerMap={customerMap}
                    isLoadingProducts={isLoadingProducts}
                    isSelectionMode={false}
                    isSelected={false}
                    onToggleSelection={handleToggleSelectionStable}
                    onStatusChange={handleSwipeStatusChangeStable}
                    onDelete={handleDeleteOrderStable}
                    onShare={handleShareOrderStable}
                    onMap={openGoogleMapsStable}
                    onEdit={handleModalEditOrderStable}
                    onRetry={handleRetryOrder}
                    onViewCustomer={handleModalViewCustomerStable}
                  />
                </motion.div>
              ))}
              </AnimatePresence>
              {groupedOrders[selectedCustomerForModal].length > visibleModalOrderCount && (
                <div className="flex justify-center mt-2 mb-2">
                  <button 
                    onClick={() => setVisibleModalOrderCount(v => v + 20)}
                    className="px-6 py-2 bg-white border border-slate-200 text-slate-600 rounded-full text-xs font-bold shadow-sm hover:bg-slate-50 transition-colors"
                  >
                    載入更多 ({groupedOrders[selectedCustomerForModal].length - visibleModalOrderCount})
                  </button>
                </div>
              )}
            </div>
            <div className="bg-white rounded-[24px] p-4 mt-2 shadow-sm">
              <motion.button 
                whileTap={buttonTap} 
                onClick={() => {
                  setQuickAddData({ customerName: selectedCustomerForModal, items: [{productId: '', quantity: 10, unit: '斤'}] });
                  setSelectedCustomerForModal(null);
                }} 
                className="w-full mb-2 py-3 rounded-[16px] border-2 border-dashed border-morandi-blue/30 text-morandi-blue font-bold text-sm flex items-center justify-center gap-2 hover:bg-morandi-blue/5 transition-colors tracking-wide"
              >
                <Plus className="w-4 h-4" /> 追加訂單
              </motion.button>
              <div className="flex gap-2">
                <motion.button 
                  whileTap={buttonTap} 
                  onClick={() => {
                    handleCopyOrder(selectedCustomerForModal, groupedOrders[selectedCustomerForModal]);
                    setSelectedCustomerForModal(null);
                  }} 
                  className="flex-1 py-3 px-4 rounded-[16px] bg-slate-50 text-morandi-pebble border border-slate-200 font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-100 transition-colors shadow-sm tracking-wide"
                >
                  <Copy className="w-4 h-4" /> 複製
                </motion.button>
                <motion.button 
                  whileTap={buttonTap} 
                  onClick={() => {
                    openGoogleMaps(selectedCustomerForModal);
                    setSelectedCustomerForModal(null);
                  }} 
                  className="flex-1 py-3 px-4 rounded-[16px] bg-morandi-blue text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-600 transition-colors shadow-lg shadow-morandi-blue/20 tracking-wide"
                >
                  <MapPin className="w-4 h-4" /> 導航
                </motion.button>
              </div>
            </div>
            <button onClick={() => setSelectedCustomerForModal(null)} className="mt-4 w-full bg-white py-3 rounded-[16px] font-bold text-slate-700 shadow-sm active:bg-slate-50 transition-colors">
              關閉
            </button>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Partial Settlement Modal */}
      <AnimatePresence>
        {partialSettlementTarget && (
          <motion.div key="partial-settlement-modal" className="fixed inset-0 bg-black/60 z-[150] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setPartialSettlementTarget(null)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[24px] p-6 w-full max-w-sm shadow-2xl max-h-[80vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-extrabold text-slate-800">部分結帳 - {partialSettlementTarget.name}</h3>
                <button onClick={() => setPartialSettlementTarget(null)} className="p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"><X className="w-4 h-4" /></button>
              </div>
              
              <div className="flex-1 overflow-y-auto mb-4 space-y-2 custom-scrollbar pr-2">
                {partialSettlementTarget.orders.map(order => {
                  const isSelected = selectedPartialOrderIds.has(order.id);
                  const amount = calculateOrderTotalAmount(order);
                  return (
                    <div 
                      key={order.id} 
                      onClick={() => {
                        const newSet = new Set(selectedPartialOrderIds);
                        if (isSelected) newSet.delete(order.id);
                        else newSet.add(order.id);
                        setSelectedPartialOrderIds(newSet);
                      }}
                      className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                    >
                      <div className={`w-5 h-5 rounded flex items-center justify-center border ${isSelected ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300'}`}>
                        {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-700">{order.deliveryDate}</p>
                        <div className="mt-1 space-y-1">
                          {order.items.map((item, idx) => {
                            // 找出商品名稱
                            const p = products.find(x => x.id === item.productId);
                            const productName = p?.name || '未知商品';
                            
                            // 計算單項金額
                            let itemTotal = 0;
                            if (item.unit === '元') {
                              itemTotal = item.quantity;
                            } else {
                              const cust = customers.find(c => c.name === partialSettlementTarget.name);
                              const priceInfo = cust?.priceList?.find(pl => pl.productId === item.productId);
                              const price = priceInfo ? priceInfo.price : 0;
                              itemTotal = Math.round(item.quantity * price);
                            }

                            return (
                              <div key={idx} className="text-xs text-gray-500 flex justify-between pr-4">
                                <span>• {productName} {item.quantity}{item.unit}</span>
                                <span>${itemTotal.toLocaleString()}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-slate-800">${amount.toLocaleString()}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <div className="pt-4 border-t border-gray-100">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm font-bold text-slate-600">已選 {selectedPartialOrderIds.size} 筆</span>
                  <span className="text-xl font-black text-blue-600">
                    ${partialSettlementTarget.orders.filter(o => selectedPartialOrderIds.has(o.id)).reduce((sum, o) => sum + calculateOrderTotalAmount(o), 0).toLocaleString()}
                  </span>
                </div>
                <button 
                  disabled={selectedPartialOrderIds.size === 0}
                  onClick={() => {
                    setSettlementDate('9999-12-31'); // 改為未來日期，確保包含所有手動選取的訂單
                    setSettlementTarget({
                      name: partialSettlementTarget.name,
                      allOrderIds: Array.from(selectedPartialOrderIds)
                    });
                    setPartialSettlementTarget(null);
                  }}
                  className="w-full py-3 rounded-xl bg-blue-500 text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" /> 確認結帳
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settlement Confirmation Modal */}
      <AnimatePresence>
        {settlementTarget && settlementPreview && (
          <motion.div key="settlement-modal" className="fixed inset-0 bg-black/60 z-[160] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => !isSettling && setSettlementTarget(null)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[24px] p-6 w-full max-w-sm shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-extrabold text-slate-800">結帳確認</h3>
                <button disabled={isSettling} onClick={() => setSettlementTarget(null)} className="p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-50"><X className="w-4 h-4" /></button>
              </div>
              
              <div className="flex flex-col items-center justify-center p-6 bg-emerald-50 rounded-2xl border border-emerald-100 mb-6">
                <span className="text-sm font-bold text-emerald-600 mb-1">{settlementTarget.name}</span>
                <span className="text-4xl font-black text-emerald-600 tracking-tight">
                  ${settlementPreview.totalAmount.toLocaleString()}
                </span>
                <span className="text-xs font-medium text-emerald-600/70 mt-2">
                  預計結清筆數：{settlementPreview.count} 筆
                </span>
              </div>
              
              <div className="flex gap-3">
                <button 
                  disabled={isSettling}
                  onClick={() => setSettlementTarget(null)}
                  className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button 
                  disabled={isSettling}
                  onClick={async () => {
                    if (window.Telegram?.WebApp?.HapticFeedback) {
                      window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
                    } else if (navigator.vibrate) {
                      navigator.vibrate(50);
                    }
                    setIsSettling(true);
                    // 改為使用 settlementPreview 中的訂單 ID，確保所見即所得
                    await handleBatchSettleOrders(settlementPreview.orders.map(o => o.id));
                    setIsSettling(false);
                    setSettlementTarget(null);
                  }}
                  className="flex-1 py-3.5 rounded-xl bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-emerald-600 shadow-lg shadow-emerald-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSettling ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5" />
                  )}
                  {isSettling ? '處理中...' : '確認收款'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 底部抽屜選單 (Bottom Sheet) */}
      <AnimatePresence>
        {drawerConfig.isOpen && (
          <motion.div key="bottom-drawer" className="fixed inset-0 z-[120] flex flex-col justify-end">
            {/* 黑色半透明遮罩 */}
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setDrawerConfig({ ...drawerConfig, isOpen: false })}
            />
            
            {/* 抽屜本體 */}
            <motion.div 
              initial={{ y: "100%" }} 
              animate={{ y: 0 }} 
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative bg-gray-50 rounded-t-[32px] p-6 pb-12 shadow-2xl flex flex-col max-h-[70vh]"
            >
              {/* 頂部小灰條 (視覺提示) */}
              <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-6" />
              
              <h3 className="text-lg font-extrabold text-morandi-charcoal mb-4 text-center tracking-tight">
                {drawerConfig.type === 'trip' ? '選擇趟數' : '選擇配送方式'}
              </h3>
              
              {/* 選項列表 */}
              <div className="space-y-2 overflow-y-auto custom-scrollbar">
                {getDrawerOptions().map((option) => {
                  // 判斷當前是否選中
                  const isSelected = drawerConfig.target === 'order' 
                    ? orderForm[drawerConfig.type as keyof typeof orderForm] === option
                    : (drawerConfig.type === 'trip' ? customerForm.defaultTrip === option : customerForm.deliveryMethod === option);

                  return (
                    <motion.button
                      key={option}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleDrawerSelect(option)}
                      className={`w-full p-4 rounded-2xl text-left font-bold transition-all flex justify-between items-center ${
                        isSelected 
                          ? 'bg-morandi-blue text-white shadow-md' 
                          : 'bg-white text-slate-700 border border-slate-200 hover:border-morandi-blue'
                      }`}
                    >
                      <span>{option}</span>
                      {isSelected && <Check className="w-5 h-5" />}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Finance Action Menu Bottom Sheet */}
      <AnimatePresence>
        {actionMenuTarget && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-[60] flex items-end justify-center sm:items-center"
            onClick={() => setActionMenuTarget(null)}
          >
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white w-full max-w-md rounded-t-[32px] sm:rounded-[32px] overflow-hidden flex flex-col max-h-[85vh] shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-6 pt-4 pb-2 flex justify-center">
                <div className="w-12 h-1.5 bg-gray-200 rounded-full"></div>
              </div>
              
              <div className="px-6 pb-4 border-b border-gray-100 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-slate-800">{actionMenuTarget.name} 的對帳單</h3>
                  <p className="text-sm text-gray-500 mt-1">總欠款：<span className="font-bold text-rose-500">${actionMenuTarget.totalDebt.toLocaleString()}</span></p>
                </div>
                <button 
                  onClick={() => setActionMenuTarget(null)}
                  className="p-2 bg-gray-50 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 flex flex-col gap-2 overflow-y-auto">
                <button 
                  onClick={() => {
                    handleCopyStatement(actionMenuTarget.name, actionMenuTarget.totalDebt, actionMenuTarget.orders);
                    setActionMenuTarget(null);
                  }} 
                  className="w-full min-h-[56px] px-4 rounded-2xl bg-white text-slate-700 font-bold text-base flex items-center gap-3 hover:bg-slate-50 active:bg-slate-100 transition-colors border border-transparent hover:border-slate-100"
                >
                  <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-500">
                    <Copy className="w-5 h-5" />
                  </div>
                  複製對帳單
                </button>

                <button 
                  onClick={() => {
                    handleShareStatementToLine(actionMenuTarget.name, actionMenuTarget.totalDebt, actionMenuTarget.orders);
                    setActionMenuTarget(null);
                  }} 
                  className="w-full min-h-[56px] px-4 rounded-2xl bg-white text-slate-700 font-bold text-base flex items-center gap-3 hover:bg-slate-50 active:bg-slate-100 transition-colors border border-transparent hover:border-slate-100"
                >
                  <div className="w-10 h-10 rounded-full bg-[#06C755]/10 flex items-center justify-center text-[#06C755]">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <span className="text-[#06C755]">Line 傳送對帳單</span>
                </button>

                <div className="h-px bg-gray-100 my-2 mx-4"></div>

                <button 
                  onClick={() => {
                    setSettlementDate(getLastMonthEndDate());
                    setSettlementTarget({name: actionMenuTarget.name, allOrderIds: actionMenuTarget.orderIds});
                    setActionMenuTarget(null);
                  }} 
                  className="w-full min-h-[56px] px-4 rounded-2xl bg-white text-slate-700 font-bold text-base flex items-center gap-3 hover:bg-slate-50 active:bg-slate-100 transition-colors border border-transparent hover:border-slate-100"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <span className="text-emerald-600">全部結清</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAutoOrderDashboardOpen && (
          <AutoOrderDashboardModal
            isOpen={isAutoOrderDashboardOpen}
            onClose={() => setIsAutoOrderDashboardOpen(false)}
            previewDate={previewDate}
            setPreviewDate={setPreviewDate}
            greenZone={prediction.greenZone}
            grayZone={prediction.grayZone}
            products={products}
            onToggleAutoOrder={async (customerId) => {
              const customer = customers.find(c => c.id === customerId);
              if (customer) {
                const updatedCustomer = { 
                  ...customer, 
                  autoOrderEnabled: !customer.autoOrderEnabled,
                  // 💡 修正 1：lastUpdated 應該是數字 (Timestamp)
                  lastUpdated: Date.now() 
                };
                
                // 1. 先樂觀更新畫面
                setCustomers(prev => prev.map(c => c.id === customerId ? updatedCustomer : c));
                
                if (apiEndpoint) {
                  try {
                    // 2. 補上 originalLastUpdated 與 force 給後端驗證 (開關自動建單不需要嚴格檢查版本)
                    const payload = { ...updatedCustomer, originalLastUpdated: customer.lastUpdated, force: true };
                    const res = await fetchWithRetry(apiEndpoint, {
                      method: 'POST',
                      body: JSON.stringify({ action: 'updateCustomer', data: payload })
                    });
                    const json = await res.json();
                    
                    if (!json.success) {
                      console.error("儲存失敗，後端回傳錯誤:", json);
                      // 3. 失敗時：把畫面還原成原本的狀態，並跳出提示
                      setCustomers(prev => prev.map(c => c.id === customerId ? customer : c));
                      addToast("儲存失敗，請重新整理後再試", "error");
                    } else {
                      // 💡 修正 2：成功時，把後端產生的最新時間戳記更新到本地，防止背景同步誤判
                      const newVersion = json.data?.lastUpdated || payload.lastUpdated;
                      setCustomers(prev => prev.map(c => c.id === customerId ? { ...updatedCustomer, lastUpdated: newVersion } : c));
                    }
                  } catch (e) {
                    console.error("自動建單狀態儲存失敗，請檢查網路:", e);
                    // 3. 失敗時：把畫面還原成原本的狀態，並跳出提示
                    setCustomers(prev => prev.map(c => c.id === customerId ? customer : c));
                    addToast("網路連線異常，儲存失敗", "error");
                  }
                }
              }
            }}
            onEditItems={(customer) => {
              setEditCustomerMode('itemsOnly');
              setIsEditingCustomer(customer.id);
              setCustomerForm({
                ...customer,
                address: customer.address || '',
                coordinates: customer.coordinates || '',
                deliveryTime: formatTimeForInput(customer.deliveryTime),
                paymentTerm: customer.paymentTerm || 'regular',
                defaultTrip: customer.defaultTrip || ''
              });
              setTempPriceProdId('');
              setTempPriceValue('');
              setTempPriceUnit('斤');
            }}
            onSetHoliday={(customerId) => {
              const customer = customers.find(c => c.id === customerId);
              if (customer) {
                setDirectHolidayCustomer(customer);
              }
            }}
          />
        )}
      </AnimatePresence>

      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-100 flex justify-around py-3 z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        <NavItem active={activeTab === 'orders'} onClick={() => setActiveTab('orders')} icon={<ClipboardList className="w-6 h-6" />} label="訂單" />
        <NavItem active={activeTab === 'customers'} onClick={() => setActiveTab('customers')} icon={<Users className="w-6 h-6" />} label="客戶" />
        <NavItem active={activeTab === 'products'} onClick={() => setActiveTab('products')} icon={<Package className="w-6 h-6" />} label="品項" />
        <NavItem active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} icon={<CalendarCheck className="w-6 h-6" />} label="行程" />
        <NavItem active={activeTab === 'finance'} onClick={() => setActiveTab('finance')} icon={<Wallet className="w-6 h-6" />} label="帳務" />
      </nav>
    </div>
  );
};

export default App;