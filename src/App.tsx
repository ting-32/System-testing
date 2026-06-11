import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Users, 
  Package, 
  ClipboardList, 
  History,
  Settings,
  BellRing,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Search,
  Clock,
  X,
  Plus,
  Trash2,
  Edit2, // Used for Edit Icon
  Layers,
  CalendarDays,
  Loader2,
  WifiOff,
  CheckCircle2,
  FileText,
  ListChecks,
  Printer,
  RefreshCw,
  Save,
  DollarSign,
  Calculator,
  CalendarCheck,
  Copy,
  MapPin,
  Banknote,
  CheckSquare,
  Wallet,
  // New Import
  Filter,
  Check,
  GripVertical,
  Navigation,
  Info,
  MoreVertical,
  Bot,
  Lock,
  Unlock
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { Customer, Product, Order, OrderItem, CustomerPrice, Toast, ToastType, OrderStatus } from './types';
import { COLORS, WEEKDAYS, UNITS, DELIVERY_METHODS, ORDERING_HABITS, PRODUCT_CATEGORIES } from './constants';
import { ToastNotification } from './components/ToastNotification';
import { NavItem } from './components/NavItem';
import { SkeletonCard } from './components/SkeletonCard';
import { LoginScreen } from './components/LoginScreen';
import { AppModals } from './components/layout/AppModals';
import { useDataSync } from './hooks/useDataSync';
import { useOrderCalculations } from './hooks/useOrderCalculations';
import { useVoiceAssistant } from './hooks/useVoiceAssistant';
import { useOrderActions } from './hooks/useOrderActions';
import { useAutoOrderPrediction } from './hooks/useAutoOrderPrediction';
import { useCompactMode } from './hooks/useCompactMode';
import { fetchWithRetry } from './utils/fetchUtils';
import { OrdersPage } from './pages/OrdersPage';
import { CustomersPage } from './pages/CustomersPage';
import { ProductsPage } from './pages/ProductsPage';
import { SchedulePage } from './pages/SchedulePage';
import { FinancePage } from './pages/FinancePage';
import { WorkPage } from './pages/WorkPage';
import { Header } from './components/layout/Header';
import { BottomNav } from './components/layout/BottomNav';
import { getTomorrowDate, getSmartDefaultDate, getLastMonthEndDate, formatTimeDisplay, formatTimeForInput, getUpcomingHolidays, isDateInOffDays } from './utils';
import { buttonTap, buttonHover, triggerHaptic, containerVariants, itemVariants } from './components/animations';

// ... (Toast Types, Variants, Haptic Helper, Helper Functions remain unchanged) ...
// --- Toast Types ---
// (Moved to types.ts)

// --- Animation Variants ---
// (Moved to components/animations.ts)

// Haptic Feedback Helper
// (Moved to components/animations.ts)

// ... (getStatusStyles, normalizeDate, formatDateStr, getTomorrowDate, getLastMonthEndDate, safeJsonArray, formatTimeDisplay, formatTimeForInput moved to utils.ts)


// ... (SortableProductItem, SwipeableOrderCard, ScheduleOrderCard moved to components) ...

// ... (LoginScreen, ConfirmModal, ProductPicker, CustomerPicker, HolidayCalendar, WorkCalendar, DatePickerModal, SettingsModal, NavItem, ToastNotification moved to components) ...

// --- 主要 App 組件 ---
const App: React.FC = () => {
  // ... (State declarations remain unchanged) ...
  const [toasts, setToasts] = useState<Toast[]>([]);

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
    apiEndpoint, customers, setCustomers,
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
    saveTripsToCloud
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
  const [isWarmingUp, _setIsWarmingUp] = useState(false);
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

  useEffect(() => {
    // 移除不必要的 scrollParent 邏輯
  }, []);

  
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
  const [externalAction, setExternalAction] = useState<{type: 'add'} | {type: 'edit', id: string} | null>(null);
  const [externalEditOrderId, setExternalEditOrderId] = useState<string | null>(null);
  const [externalAddOrderData, setExternalAddOrderData] = useState<any>(null);
  
  // Dummy states to satisfy hook dependencies for remaining tabs
  const dummySetOrderForm = useCallback(() => {}, []);
  const __dummyOrderForm = useMemo(() => ({ customerType: 'existing' as any, customerId: '', customerName: '', deliveryTime: '', deliveryMethod: '', trip: '', items: [], note: '', date: '' }), []);
  const __dummySetQuickAddData = useCallback(() => {}, []);
  const __dummySetEditingOrderId = useCallback((id: string | null) => { if (id) setExternalEditOrderId(id); setActiveTab('orders'); }, []);
  const dummySetIsAddingOrder = useCallback((isOpen: boolean) => { if (isOpen) { setExternalAction({type: 'add'}); setActiveTab('orders'); } }, []);
  const __dummySelectedDate = useMemo(() => getSmartDefaultDate(), []);
  const __dummySetSelectedDate = useCallback(() => {}, []);

  const [drawerConfig, setDrawerConfig] = useState<{
    isOpen: boolean;
    type: string;
    target: 'order' | 'customer';
  }>({ isOpen: false, type: '', target: 'order' });

  const [orderSearch, _setOrderSearch] = useState('');
  const [orderDeliveryFilter, _setOrderDeliveryFilter] = useState<string[]>([]);
  const [_showOrderDeliveryFilters, _setShowOrderDeliveryFilters] = useState(false);

  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [quickAddData, setQuickAddData] = useState<{customerName: string, items: {productId: string, quantity: number, unit: string}[]} | null>(null);

  const [collapsedWorkGroups, setCollapsedWorkGroups] = useState<Set<string>>(new Set());
  const [completedWorkItems, setCompletedWorkItems] = useState<Set<string>>(new Set());

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
  const [isEditingCustomer, setIsEditingCustomer] = useState<string | null>(null);
  const [isEditingProduct, setIsEditingProduct] = useState<string | null>(null);
  const [productForm, setProductForm] = useState<Partial<Product>>({});
  
  const [selectedCustomerForModal, setSelectedCustomerForModal] = useState<string | null>(null);
  
  const [isScrollingDown, setIsScrollingDown] = useState(false);
  const [lastScrollY, setLastScrollY] = useState(0);
  
  const [customerForm, setCustomerForm] = useState<Partial<Customer>>({});
  const [editCustomerMode, setEditCustomerMode] = useState<'full' | 'itemsOnly' | 'holidayOnly'>('full');
  const [showAdvancedCustomerSettings, setShowAdvancedCustomerSettings] = useState(false);
  const [initialProductOrder, setInitialProductOrder] = useState<string[]>([]);
  const [hasReorderedProducts, setHasReorderedProducts] = useState(false);

  const [lastOrderCandidate, setLastOrderCandidate] = useState<{date: string, items: OrderItem[], sourceLabel?: string} | null>(null);

  const [hasChanges, setHasChanges] = useState(false);

  // 當 Bottom Sheet 開啟時鎖定背景滾動
  useEffect(() => {
    if (isProductFilterOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isProductFilterOpen]);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY; // 如果你的滾動容器是特定 div，這裡改為該 div 的 scrollTop
      
      // 當向下滑動超過 50px 時隱藏，向上滑動時顯示
      if (currentScrollY > lastScrollY && currentScrollY > 50) {
        setIsScrollingDown(true);
      } else if (currentScrollY < lastScrollY) {
        setIsScrollingDown(false);
      }
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

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
    dummySetIsAddingOrder(false);
    setEditingOrderId(null);
    setIsEditingCustomer(null);
    setIsEditingProduct(null);
    setHasChanges(false);
    return true;
  }, [hasChanges]);

  const handleOrderFormChange = useCallback((_field: any, _value: any) => {
    dummySetOrderForm();
    setHasChanges(true);
  }, []);

  // 新增在 App.tsx 元件內部
  const handleDrawerSelect = (value: string) => {
    if (drawerConfig.target === 'order') {
      setOrderForm(prev => ({ ...prev, [drawerConfig.type as string]: value }));
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
    filteredCustomers,
    workSheetData,
    calculateOrderTotalAmount
  } = useOrderCalculations({
    orders, customers,
    customerSearch: '',
    products,
    selectedDate,
    orderSearch,
    orderDeliveryFilter,
    scheduleDate: '',
    scheduleDeliveryMethodFilter: [],
    workDates,
    workCustomerFilter,
    workProductFilter,
    workDeliveryMethodFilter,

    settlementTarget,
    settlementDate,
    orderForm,
    quickAddData
  });

  // 👇 新增這段：當展開的客戶訂單被刪光時，自動關閉 Modal
  useEffect(() => {
    if (selectedCustomerForModal && !groupedOrders[selectedCustomerForModal]) {
      setSelectedCustomerForModal(null);
    }
  }, [groupedOrders, selectedCustomerForModal]);


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
    // removed wrapper
    applyLastOrder,
    handleSelectExistingCustomer,
    openGoogleMaps,
    handleDeleteOrder,
    // handleRetryOrder removed
  } = useOrderActions({
    orders,
    setOrders, customers,
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
  } = useVoiceAssistant({ customers,
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




  const onSaveCustomerCloud = async (finalCustomer: Customer, isEditingCustomer: string | null, originalLastUpdated: string | undefined, previousCustomers: Customer[]) => {
    if (!apiEndpoint || isSaving) return false;
    setIsSaving(true);
    try {
      const payload = finalCustomer;
      if (isEditingCustomer !== 'new') {
        (payload as any).originalLastUpdated = originalLastUpdated;
        (payload as any).force = true;
      }
      const res = await fetchWithRetry(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'updateCustomer', data: payload }) });
      const json = await res.json();
      if (!json.success) {
        setCustomers(previousCustomers); // Revert
        if (json.errorCode === 'ERR_VERSION_CONFLICT') {
          setConflictData({
            action: 'updateCustomer',
            data: payload,
            description: `更新店家: ${finalCustomer.name}`,
            type: 'customer',
            clientData: payload,
            serverData: json.serverData || json.data
          });
        } else {
          addToast('店家資料儲存失敗', 'error');
        }
        setIsSaving(false);
        return false;
      }
    } catch (e) {
      console.error(e);
      setCustomers(previousCustomers); // Revert
      addToast('店家資料儲存失敗，請檢查網路', 'error');
      setIsSaving(false);
      return false;
    }
    setIsSaving(false);
    addToast('店家資料已儲存', 'success');
    return true;
  };

  const onDeleteCustomerCloud = async (customerId: string, customerBackup: Customer) => {
    if (!apiEndpoint) return;
    try {
      await fetchWithRetry(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'deleteCustomer', data: { id: customerId, originalLastUpdated: customerBackup.lastUpdated } }) });
    } catch (e) {
      console.error("刪除失敗:", e);
      addToast("雲端同步刪除失敗，請檢查網路", 'error');
      setCustomers(prev => [...prev, customerBackup]);
    }
  };


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

  if (!isAuthenticated) return <LoginScreen onLogin={handleLogin} />;
  
  if (isInitialLoading) {
    return (
      <div className="min-h-screen flex flex-col max-w-md mx-auto bg-morandi-oatmeal p-4 space-y-3">
        <div className="h-16 bg-white rounded-2xl shadow-sm mb-6 animate-pulse"></div>
        {[1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
      </div>
    );
  }


  const onSaveProductCloud = async (finalProduct: Product, isEditingProduct: string | null, originalLastUpdated: number | undefined, previousProducts: Product[]) => {
    if (!apiEndpoint || isSaving) return false;
    setIsSaving(true);
    try {
      const payload = finalProduct;
      if (isEditingProduct !== 'new') {
        (payload as any).originalLastUpdated = originalLastUpdated;
      }
      const res = await fetchWithRetry(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'updateProduct', data: payload }) });
      const json = await res.json();
      if (!json.success) {
        setProducts(previousProducts);
        if (json.errorCode === 'ERR_VERSION_CONFLICT') {
          setConflictData({
            action: 'updateProduct',
            data: payload,
            description: `更新品項: ${finalProduct.name}`,
            type: 'product',
            clientData: payload,
            serverData: json.serverData || json.data
          });
        } else {
          addToast('品項資料儲存失敗', 'error');
        }
        setIsSaving(false);
        return false;
      }
    } catch (e) {
      console.error(e);
      setProducts(previousProducts);
      addToast('品項資料儲存失敗，請檢查網路', 'error');
      setIsSaving(false);
      return false;
    }
    setIsSaving(false);
    return true;
  };

  const onDeleteProductCloud = async (productId: string, productBackup: Product) => {
    if (!apiEndpoint) return;
    try {
      await fetchWithRetry(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'deleteProduct', data: { id: productId, originalLastUpdated: productBackup.lastUpdated } }) });
    } catch (e) {
      console.error("刪除失敗:", e);
      addToast("雲端同步刪除失敗，請檢查網路", 'error');
      setProducts(prev => [...prev, productBackup]);
    }
  };

  const onSaveProductOrderCloud = async (orderedIds: string[]) => {
     if (!apiEndpoint || isSaving) return false;
     setIsSaving(true);
     try {
       await fetchWithRetry(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'reorderProducts', data: orderedIds }) });
       setInitialProductOrder(orderedIds);
       return true;
     } catch (e) {
       console.error(e);
       addToast("排序儲存失敗，請檢查網路", 'error');
       return false;
     } finally {
       setIsSaving(false);
     }
  };

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

      <Header
        isBackgroundSyncing={isBackgroundSyncing}
        isInitialLoading={isInitialLoading}
        isUnlocked={isUnlocked}
        setIsUnlocked={setIsUnlocked}
        setShowUnlockModal={setShowUnlockModal}
        setIsNotificationCenterOpen={setIsNotificationCenterOpen}
        setIsSettingsOpen={setIsSettingsOpen}
      />

      {/* --- Toast Container --- */}
      <ToastNotification toasts={toasts} removeToast={removeToast} />



      

      

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

      <main className="flex-1 overflow-y-auto pb-24 px-4" ref={mainRef}>
        <AnimatePresence mode="popLayout">
        {activeTab === 'orders' && (
          <motion.div 
            key="orders-page" 
            initial={{ opacity: 0, x: -10 }} 
            animate={{ opacity: 1, x: 0, zIndex: 10 }} 
            exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }} 
            transition={{ duration: 0.2 }} 
            className="space-y-6 relative"
          >
           <OrdersPage 
              orders={orders} setOrders={setOrders} 
              customers={customers} products={products}
              setDrawerConfig={setDrawerConfig}
              apiEndpoint={apiEndpoint}
              isSaving={isSaving} setIsSaving={setIsSaving}
              isWarmingUp={isWarmingUp} isRetrying={isRetrying} isBackgroundSyncing={isBackgroundSyncing}
              layoutMode={layoutMode}
              addToast={addToast} setToasts={setToasts}
              saveOrderToCloud={saveOrderToCloud} setConflictData={setConflictData}
              handleForceRetry={handleForceRetry} requireAuth={requireAuth}
              setActiveTab={setActiveTab} setIsAutoOrderDashboardOpen={setIsAutoOrderDashboardOpen}
              prediction={prediction}
              isAddingOrder={isAddingOrder} setIsAddingOrder={setIsAddingOrder}
              editingOrderId={editingOrderId} setEditingOrderId={setEditingOrderId}
              quickAddData={quickAddData} setQuickAddData={setQuickAddData}
              lastOrderCandidate={lastOrderCandidate} setLastOrderCandidate={setLastOrderCandidate}
              orderForm={orderForm} setOrderForm={setOrderForm}
              handleQuickAddSubmit={handleQuickAddSubmit}
              handleSwipeStatusChange={handleSwipeStatusChange}
              handleCopyOrder={handleCopyOrder}
              handleShareOrder={handleShareOrder}
              handleEditOrder={handleEditOrder}
              handleSaveOrder={handleSaveOrder}
              applyLastOrder={applyLastOrder}
              handleSelectExistingCustomer={handleSelectExistingCustomer}
              openGoogleMaps={openGoogleMaps}
              handleDeleteOrder={handleDeleteOrder}
              externalEditOrderId={externalEditOrderId || (externalAction?.type === 'edit' ? externalAction.id : null)}
              onClearExternalEdit={() => { setExternalEditOrderId(null); setExternalAction(null); }}
              externalAddOrderData={externalAddOrderData}
              clearExternalAddOrder={() => setExternalAddOrderData(null)}
           />
          </motion.div>
        )}
        {activeTab === 'customers' && (
          <motion.div 
            key="customers-page" 
            initial={{ opacity: 0, x: -10 }} 
            animate={{ opacity: 1, x: 0, zIndex: 10 }} 
            exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }} 
            transition={{ duration: 0.2 }} 
            className="space-y-6 relative"
          >
          <CustomersPage
            customers={customers}
            setCustomers={setCustomers}
            products={products}
            orders={orders}
            apiEndpoint={apiEndpoint}
            isSaving={isSaving}
            setIsSaving={setIsSaving}
            isWarmingUp={isWarmingUp}
            isRetrying={isRetrying}
            addToast={addToast}
            setConflictData={setConflictData}
            setConfirmConfig={setConfirmConfig}
            requireAuth={requireAuth}
            isEditingCustomer={isEditingCustomer}
            setIsEditingCustomer={setIsEditingCustomer}
            customerForm={customerForm}
            setCustomerForm={setCustomerForm}
            editCustomerMode={editCustomerMode}
            setEditCustomerMode={setEditCustomerMode}
            showAdvancedCustomerSettings={showAdvancedCustomerSettings}
            setShowAdvancedCustomerSettings={setShowAdvancedCustomerSettings}
            onSaveCustomerCloud={onSaveCustomerCloud}
            onDeleteCustomerCloud={onDeleteCustomerCloud}
            availableTrips={availableTrips}
            onCreateOrder={(c) => {
              setExternalAddOrderData(c);
              setActiveTab('orders');
            }}
          />
          </motion.div>
        )}
        {activeTab === 'products' && (
          <motion.div 
            key="products-page" 
            initial={{ opacity: 0, x: -10 }} 
            animate={{ opacity: 1, x: 0, zIndex: 10 }} 
            exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }} 
            transition={{ duration: 0.2 }} 
            className="space-y-6 relative"
          >
          <ProductsPage
            products={products}
            setProducts={setProducts}
            apiEndpoint={apiEndpoint}
            isSaving={isSaving}
            setIsSaving={setIsSaving}
            isWarmingUp={isWarmingUp}
            isRetrying={isRetrying}
            addToast={addToast}
            setConfirmConfig={setConfirmConfig}
            requireAuth={requireAuth}
            isEditingProduct={isEditingProduct}
            setIsEditingProduct={setIsEditingProduct}
            onSaveProductCloud={onSaveProductCloud}
            onDeleteProductCloud={onDeleteProductCloud}
            onSaveProductOrderCloud={onSaveProductOrderCloud}
          />
          </motion.div>
        )}
        {/* ... (Other Tabs code remains same) ... */}
        {activeTab === 'schedule' && (
          <motion.div 
            key="schedule-page" 
            initial={{ opacity: 0, x: -10 }} 
            animate={{ opacity: 1, x: 0, zIndex: 10 }} 
            exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }} 
            transition={{ duration: 0.2 }} 
            className="space-y-6 relative"
          >
          <SchedulePage
            orders={orders}
            setOrders={setOrders}
            customers={customers}
            products={products}
            productMap={productMap}
            customerMap={customerMap}
            isLoadingProducts={isLoadingProducts}
            availableTrips={availableTrips}
            setAvailableTrips={setAvailableTrips}
            saveOrderToCloud={saveOrderToCloud}
            setIsTripManagerOpen={setIsTripManagerOpen}
            onNavigateToAddOrder={(date) => {
              setSelectedDate(date);
              dummySetOrderForm();
              setEditingOrderId(null);
              dummySetIsAddingOrder(true);
            }}
            handleSwipeStatusChange={handleSwipeStatusChange}
            handleShareOrder={handleShareOrder}
            openGoogleMaps={openGoogleMaps}
            addToast={addToast}
            calculateOrderTotalAmount={calculateOrderTotalAmount}
          />
          </motion.div>
        )}
        {/* ... (Finance and Work Tabs remain unchanged - they are inside ActiveTab blocks already provided in context, just ensuring closing structure) ... */}
        {activeTab === 'finance' && (
          <FinancePage 
             financeData={financeData}
             calculateOrderTotalAmount={calculateOrderTotalAmount}
             setSettlementDate={setSettlementDate}
             setSettlementTarget={setSettlementTarget}
             products={products}
             customers={customers}
             handleCopyStatement={handleCopyStatement}
             handleShareStatementToLine={handleShareStatementToLine}
          />
        )}
        
        {activeTab === 'work' && (
           <WorkPage
             orders={orders}
             products={products}
             workCustomerFilter={workCustomerFilter}
             setWorkCustomerFilter={setWorkCustomerFilter}
             workDeliveryMethodFilter={workDeliveryMethodFilter}
             setWorkDeliveryMethodFilter={setWorkDeliveryMethodFilter}
             workProductFilter={workProductFilter}
             setWorkProductFilter={setWorkProductFilter}
             workDates={workDates}
             setWorkDates={setWorkDates}
             collapsedWorkGroups={collapsedWorkGroups}
             setCollapsedWorkGroups={setCollapsedWorkGroups}
             completedWorkItems={completedWorkItems}
             setCompletedWorkItems={setCompletedWorkItems}
             workSheetData={workSheetData}
             isProductFilterOpen={isProductFilterOpen}
             setIsProductFilterOpen={setIsProductFilterOpen}
             expandedFilterCats={expandedFilterCats}
             setExpandedFilterCats={setExpandedFilterCats}
             handlePrint={handlePrint}
             setActiveTab={setActiveTab}
           />
        )}
        </AnimatePresence>

      </main>
      
      {/* ... (Modals code remains same - ConfirmModal, HolidayCalendar, DatePickerModal, SettingsModal, QuickAdd, etc.) ... */}
      
      {/* (All Global Modals Moved Here) */}
      <AppModals 
        showUnlockModal={showUnlockModal}
        onCloseUnlockModal={() => setShowUnlockModal(false)}
        handleAppUnlock={handleAppUnlock}
        isUnlocking={isUnlocking}
        unlockError={unlockError}
        setUnlockError={setUnlockError}
        unlockPassword={unlockPassword}
        setUnlockPassword={setUnlockPassword}

        customerPickerConfig={customerPickerConfig}
        onCloseCustomerPicker={() => setCustomerPickerConfig((prev: any) => ({ ...prev, isOpen: false }))}
        customers={customers}
        orders={orders}
        customerPickerSelectedDate={orderForm.date || selectedDate}

        conflictData={conflictData}
        onCloseConflictModal={() => setConflictData(null)}
        onRefreshConflictModal={() => {
          if (conflictData?.type === 'batch_order' && conflictData.clientData) {
            const updatedIds = conflictData.clientData.map((u: any) => u.id);
            setOrders((prev: Order[]) => prev.map(o => updatedIds.includes(o.id) ? { ...o, syncStatus: 'synced', pendingAction: undefined } : o));
          } else if (conflictData?.type === 'order' && conflictData.clientData) {
            setOrders((prev) => prev.map(o => o.id === conflictData.clientData.id ? { ...o, syncStatus: 'synced', pendingAction: undefined } : o));
          }
          setConflictData(null);
          syncData(true);
          setIsAddingOrder(false);
          setIsEditingCustomer(null);
          setIsEditingProduct(null);
          setEditingOrderId(null);
        }}
        handleForceRetry={handleForceRetry}
        isSaving={isSaving}

        isVoiceModalOpen={isVoiceModalOpen}
        onCloseVoiceModal={() => setIsVoiceModalOpen(false)}
        handleProcessVoiceOrder={handleProcessVoiceOrder}
        isAiMode={isAiMode}
        setIsAiMode={setIsAiMode}

        confirmConfig={confirmConfig}
        onCancelConfirm={() => setConfirmConfig((prev: any) => ({ ...prev, isOpen: false }))}

        isDatePickerOpen={isDatePickerOpen}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        onCloseDatePicker={() => setIsDatePickerOpen(false)}

        isOrderDatePickerOpen={isOrderDatePickerOpen}
        orderFormDate={orderForm.date}
        onSelectOrderDate={(date: any) => {
          handleOrderFormChange('date', date);
          setIsOrderDatePickerOpen(false);
        }}
        onCloseOrderDatePicker={() => setIsOrderDatePickerOpen(false)}
        orderDatePickerOffDays={customers.find(c => c.name === orderForm.customerName)?.offDays}
        orderDatePickerHolidayDates={customers.find(c => c.name === orderForm.customerName)?.holidayDates}

        isNotificationCenterOpen={isNotificationCenterOpen}
        onCloseNotificationCenter={() => setIsNotificationCenterOpen(false)}
        products={products}
        lineChannelToken={lineChannelToken}
        setLineChannelToken={setLineChannelToken}
        lineUserId={lineUserId}
        setLineUserId={setLineUserId}
        apiEndpoint={apiEndpoint}

        isSettingsOpen={isSettingsOpen}
        onCloseSettings={() => setIsSettingsOpen(false)}
        syncData={syncData}
        handleChangePassword={handleChangePassword}
        handleSaveApiUrl={handleSaveApiUrl}
        layoutMode={layoutMode}
        setLayoutMode={setLayoutMode}

        isTripManagerOpen={isTripManagerOpen}
        availableTrips={availableTrips}
        setAvailableTrips={setAvailableTrips}
        setOrders={setOrders}
        onCloseTripManager={() => setIsTripManagerOpen(false)}
        saveOrderToCloud={saveOrderToCloud}
        saveTripsToCloud={saveTripsToCloud}

        showDeadlockModal={showDeadlockModal}

        selectedCustomerForModal={selectedCustomerForModal}
        groupedOrdersForModal={selectedCustomerForModal ? groupedOrders[selectedCustomerForModal] : null}
        onCloseSelectedCustomerModal={() => setSelectedCustomerForModal(null)}
        productMap={productMap}
        customerMap={customerMap}
        isLoadingProducts={isLoadingProducts}
        handleSwipeStatusChange={handleSwipeStatusChange}
        handleDeleteOrder={handleDeleteOrder}
        handleShareOrder={handleShareOrder}
        openGoogleMaps={openGoogleMaps}
        handleEditOrder={handleEditOrder}
        setActiveTab={setActiveTab}
        setQuickAddData={setQuickAddData}
        handleCopyOrder={handleCopyOrder}

        settlementTarget={settlementTarget}
        settlementPreview={settlementPreview}
        onCloseSettlement={() => setSettlementTarget(null)}
        isSettling={isSettling}
        handleBatchSettleOrders={async () => {
          if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
          } else if (navigator.vibrate) {
            navigator.vibrate(50);
          }
          setIsSettling(true);
          await handleBatchSettleOrders(settlementPreview!.orders.map(o => o.id));
          setIsSettling(false);
          setSettlementTarget(null);
        }}

        drawerConfig={drawerConfig}
        onCloseDrawer={() => setDrawerConfig({ ...drawerConfig, isOpen: false })}
        getDrawerOptions={getDrawerOptions}
        orderForm={orderForm}
        handleDrawerSelect={handleDrawerSelect}

        isAutoOrderDashboardOpen={isAutoOrderDashboardOpen}
        onCloseAutoOrderDashboard={() => setIsAutoOrderDashboardOpen(false)}
        previewDate={previewDate}
        setPreviewDate={setPreviewDate}
        prediction={prediction}
        onToggleAutoOrder={async (customerId: string) => {
          const customer = customers.find(c => c.id === customerId);
          if (customer) {
            const updatedCustomer = { 
              ...customer, 
              autoOrderEnabled: !customer.autoOrderEnabled,
              lastUpdated: Date.now() 
            };
            setCustomers(prev => prev.map(c => c.id === customerId ? updatedCustomer : c));
            if (apiEndpoint) {
              try {
                const payload = { ...updatedCustomer, originalLastUpdated: customer.lastUpdated, force: true };
                const res = await fetchWithRetry(apiEndpoint, {
                  method: 'POST',
                  body: JSON.stringify({ action: 'updateCustomer', data: payload })
                });
                const json = await res.json();
                if (!json.success) {
                  setCustomers(prev => prev.map(c => c.id === customerId ? customer : c));
                  addToast("儲存失敗，請重新整理後再試", "error");
                } else {
                  const newVersion = json.data?.lastUpdated || payload.lastUpdated;
                  setCustomers(prev => prev.map(c => c.id === customerId ? { ...updatedCustomer, lastUpdated: newVersion } : c));
                }
              } catch (e) {
                setCustomers(prev => prev.map(c => c.id === customerId ? customer : c));
                addToast("網路連線異常，儲存失敗", "error");
              }
            }
          }
        }}
      />

      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
};

export default App;