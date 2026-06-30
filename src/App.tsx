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
import { COLORS, WEEKDAYS, UNITS, DELIVERY_METHODS, ORDERING_HABITS, PRODUCT_CATEGORIES, APP_VERSION } from './constants';
import localforage from 'localforage';
import { ToastNotification } from './components/ToastNotification';
import { NavItem } from './components/NavItem';
import { SkeletonCard } from './components/SkeletonCard';
import { LoginScreen } from './components/LoginScreen';
import { GlobalModals } from './components/layout/GlobalModals';
import { ViewManager } from './components/layout/ViewManager';
import { useAppAuth } from './hooks/useAppAuth';
import { useDataSync } from './hooks/useDataSync';
import { useBackgroundSync } from './hooks/useBackgroundSync';
import { useOrderCalculations } from './hooks/useOrderCalculations';
import { useVoiceAssistant } from './hooks/useVoiceAssistant';
import { useOrderActions } from './hooks/useOrderActions';
import { useAutoOrderPrediction } from './hooks/useAutoOrderPrediction';
import { useCompactMode } from './hooks/useCompactMode';
import { useSyncQueue } from './hooks/useSyncQueue';
import { useUIStore } from './store/useUIStore';
import { fetchWithRetry } from './utils/fetchUtils';
import { broadcastDataChange } from './services/firebaseSync';
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
  // Version Cache Busting
  useEffect(() => {
    const checkVersion = async () => {
      const localVersion = localStorage.getItem('nm_app_version');
      if (localVersion !== APP_VERSION) {
        console.log(`Version changed from ${localVersion} to ${APP_VERSION}. Clearing cache...`);
        
        // 保留重要的連線設定，清空其餘狀態
        const gasUrl = localStorage.getItem('nm_gas_url');
        await localforage.clear();
        localStorage.clear();
        
        // 把重要的存回去
        if (gasUrl) localStorage.setItem('nm_gas_url', gasUrl);
        localStorage.setItem('nm_app_version', APP_VERSION);
        
        // 強制重整畫面，確保載入全新狀態
        window.location.reload();
      }
    };
    checkVersion();
  }, []);

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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

  useEffect(() => {
    const handleNetworkToast = (e: any) => {
      if (e.detail) {
        addToast(e.detail.message, e.detail.type);
      }
    };
    window.addEventListener('app-network-toast', handleNetworkToast as EventListener);
    return () => window.removeEventListener('app-network-toast', handleNetworkToast as EventListener);
  }, [addToast]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const onReconciledRef = useRef<(id: string) => void>();
  const isEditingRef = useRef(false);
  const addSyncTaskRef = useRef<any>();

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
  } = useDataSync(addToast, isEditingRef, (id) => onReconciledRef.current?.(id), () => addSyncTaskRef.current);

  const auth = useAppAuth({ handleLogin, addToast });

  const onSyncSuccess = useCallback((task: any, responseData: any) => {
    setOrders((prev: Order[]) => {
      // 關鍵修復：如果是刪除成功，直接根除該筆資料
      const filtered = task.type === 'delete_order' 
          ? prev.filter(o => o.id !== task.payload.id) 
          : prev;
          
      return filtered.map(o => {
        if (task.type === 'UPDATE_STATUS' || task.type === 'BATCH_UPDATE') {
          const ids = task.payload.updates.map((u: any) => u.id);
          if (ids.includes(o.id)) {
             return { ...o, syncStatus: 'synced', pendingAction: undefined, version: responseData.version || (o.version + 1), _syncStatus: 'synced' };
          }
        } else if (task.type === 'UPDATE_CONTENT') {
          if (o.id === task.payload.id) {
             return { ...o, syncStatus: 'synced', pendingAction: undefined, version: responseData.version || o.version, _syncStatus: 'synced' };
          }
        }
        return o;
      });
    });
    broadcastDataChange();
  }, [setOrders]);

  const onSyncError = useCallback((task: any, errorMsg: string) => {
    setOrders((prev: Order[]) => prev.map(o => {
      if (task.type === 'UPDATE_STATUS' || task.type === 'BATCH_UPDATE') {
        const ids = task.payload.updates.map((u: any) => u.id);
        if (ids.includes(o.id)) {
           return { ...o, syncStatus: 'error', errorMessage: errorMsg, _syncStatus: 'error' };
        }
      } else if (task.type === 'UPDATE_CONTENT' || task.type === 'delete_order') {
        if (o.id === task.payload.id) {
           return { ...o, syncStatus: 'error', errorMessage: errorMsg, _syncStatus: 'error' };
        }
      }
      return o;
    }));
  }, [setOrders]);

  const onSyncGiveUp = useCallback((task: any) => {
    setOrders((prev: Order[]) => prev.map(o => {
      let isMatch = false;
      if (task.type === 'UPDATE_STATUS' || task.type === 'BATCH_UPDATE') {
        const ids = task.payload.updates.map((u: any) => u.id);
        if (ids.includes(o.id)) isMatch = true;
      } else if (task.payload && task.payload.id === o.id) {
        isMatch = true;
      }
      
      if (isMatch) {
         // [防呆容錯 / 版本衝突退回]
         // 當網路任務被徹底捨棄(例如：重試次數用盡，或遭遇不可逆的 VERSION_CONFLICT)
         // 清除此筆本地死鎖標記。後續緊接著的 syncData 由於找不到 pending 標記，
         // 就會聽命於雲端最新下發的資料，從而實現 UI 狀態的完美 Rollback。
         return { ...o, syncStatus: undefined, _syncStatus: undefined, errorMessage: undefined, pendingAction: undefined };
      }
      return o;
    }));
    
    // 引發一次雲端強拉
    syncData(true);
  }, [setOrders, syncData]);

  const { syncQueue, addSyncTask, isSyncingQueue, removeTaskByPayloadId } = useSyncQueue(apiEndpoint, addToast, onSyncSuccess, onSyncError, onSyncGiveUp);

  useEffect(() => {
    addSyncTaskRef.current = addSyncTask;
  }, [addSyncTask]);

  useEffect(() => {
    onReconciledRef.current = removeTaskByPayloadId;
  }, [removeTaskByPayloadId]);

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

  const [isWarmingUp, _setIsWarmingUp] = useState(false);
  const [showDeadlockModal, setShowDeadlockModal] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    const handleDeadlock = () => setShowDeadlockModal(true);
    const handleRetryStart = () => setIsRetrying(true);
    const handleRetryEnd = () => setIsRetrying(false);
    const handleUnauthorized = () => {
      localStorage.removeItem('nm_auth_status');
      localStorage.removeItem('APP_SESSION_TOKEN');
      localStorage.removeItem('APP_USER_ROLE');
      localStorage.removeItem('APP_USER_NAME');
      window.location.reload();
    };

    window.addEventListener('networkDeadlock', handleDeadlock);
    window.addEventListener('networkRetryStart', handleRetryStart);
    window.addEventListener('networkRetryEnd', handleRetryEnd);
    window.addEventListener('app-unauthorized', handleUnauthorized);

    return () => {
      window.removeEventListener('networkDeadlock', handleDeadlock);
      window.removeEventListener('networkRetryStart', handleRetryStart);
      window.removeEventListener('networkRetryEnd', handleRetryEnd);
      window.removeEventListener('app-unauthorized', handleUnauthorized);
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
  
  const { layoutMode, setLayoutMode } = useCompactMode();

  const ui = useUIStore();
  
  // Compatibility wrappers for UI store
  const setDrawerConfig = (val: any) => {
    const next = typeof val === 'function' ? val(ui.drawerConfig) : val;
    if (next.isOpen) ui.openDrawer(next); else ui.closeDrawer();
  };
  const setIsAutoOrderDashboardOpen = (open: boolean) => open ? ui.openAutoOrderDashboard() : ui.closeAutoOrderDashboard();
  const setConfirmConfig = (val: any) => {
    const next = typeof val === 'function' ? val({ isOpen: ui.confirmConfig.isOpen, title: ui.confirmConfig.title, message: ui.confirmConfig.message, onConfirm: ui.confirmConfig.onConfirm, onCancel: ui.confirmConfig.onCancel }) : val;
    if (next.isOpen) ui.openConfirm(next); else ui.closeConfirm();
  };
  const setIsTripManagerOpen = (open: boolean) => open ? ui.openTripManager() : ui.closeTripManager();
  const setCustomerPickerConfig = (val: any) => {
    const next = typeof val === 'function' ? val(ui.customerPickerConfig) : val;
    if (next.isOpen) ui.openCustomerPicker(next); else ui.closeCustomerPicker();
  };
  
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

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isOrderReorderMode, setIsOrderReorderMode] = useState(false);
  const [reorderedOrderIds, setReorderedOrderIds] = useState<Set<string>>(new Set());
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

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

  const [orderSearch, _setOrderSearch] = useState('');
  const [orderDeliveryFilter, _setOrderDeliveryFilter] = useState<string[]>([]);
  const [_showOrderDeliveryFilters, _setShowOrderDeliveryFilters] = useState(false);

  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [quickAddData, setQuickAddData] = useState<{customerName: string, items: {productId: string, quantity: number, unit: string}[]} | null>(null);

  const [collapsedWorkGroups, setCollapsedWorkGroups] = useState<Set<string>>(new Set());
  const [completedWorkItems, setCompletedWorkItems] = useState<Set<string>>(new Set());

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
    if (ui.selectedCustomerForModal && !groupedOrders[ui.selectedCustomerForModal]) {
      ui.closeSelectedCustomerModal();
    }
  }, [groupedOrders, ui.selectedCustomerForModal, ui.closeSelectedCustomerModal]);


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
    handleBatchUpdateTrip,
    handleRetrySync,
    handleDiscardLocalError
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
    setToasts,
    addSyncTask,
    removeTaskByPayloadId,
    syncData
  });

  // NEW: Trigger confirm dialog for settlement
  useEffect(() => {
    if (settlementTarget && settlementPreview) {
      setConfirmConfig({
        isOpen: true,
        title: `確認結帳`,
        message: `即將為 ${settlementTarget.name} 將 ${settlementPreview.orders.length} 筆單據設為結清狀態。\n總結清金額預估為 $${settlementPreview.totalAmount.toLocaleString()}`,
        onConfirm: () => {
          handleBatchSettleOrders(settlementPreview.orders.map((o: any) => o.id));
          setSettlementTarget(null);
        },
        onCancel: () => {
          setSettlementTarget(null);
        }
      });
    }
  }, [settlementTarget, settlementPreview]);
  
  // REFACTORED: syncData logic moved to useDataSync hook

  const isEditingAny = isAddingOrder || isEditingCustomer || isEditingProduct || !!quickAddData || !!editingOrderId;
  isEditingRef.current = isEditingAny;

  useBackgroundSync({ isAuthenticated, apiEndpoint, syncData, isEditingLock: isEditingAny });

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
      const payload = { ...finalCustomer };
      delete payload._syncStatus;
      delete payload._localUpdatedTs;
      
      if (isEditingCustomer !== 'new') {
        (payload as any).originalLastUpdated = originalLastUpdated;
        (payload as any).force = true;
      }
      const token = localStorage.getItem('APP_SESSION_TOKEN');
      const res = await fetchWithRetry(apiEndpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'updateCustomer', token: token || "", data: payload }) });
      const json = await res.json();
      if (!json.success) {
        if (json.error === "UNAUTHORIZED_OR_EXPIRED") {
             localStorage.removeItem('nm_auth_status');
             localStorage.removeItem('APP_SESSION_TOKEN');
             window.dispatchEvent(new Event('app-unauthorized'));
             return false;
        }
        if (json.errorCode === 'ERR_VERSION_CONFLICT') {
          setCustomers(previousCustomers); // 版本衝突時復原，交給 conflict UI 處理
          setConflictData({
            action: 'updateCustomer',
            data: payload,
            description: `更新店家: ${finalCustomer.name}`,
            type: 'customer',
            clientData: payload,
            serverData: json.serverData || json.data
          });
        } else {
          setCustomers(prev => prev.map(c => c.id === finalCustomer.id ? { ...c, _syncStatus: 'error' } : c));
          addToast('店家資料儲存失敗', 'error');
        }
        setIsSaving(false);
        return false;
      }
    } catch (e) {
      console.error(e);
      setCustomers(prev => prev.map(c => c.id === finalCustomer.id ? { ...c, _syncStatus: 'error' } : c));
      addToast('店家資料儲存失敗，請檢查網路', 'error');
      setIsSaving(false);
      return false;
    }
    setIsSaving(false);
    
    // 解除 pending 狀態
    setCustomers(prev => prev.map(c => c.id === finalCustomer.id ? { ...c, _syncStatus: 'synced' } : c));
    
    addToast('店家資料已儲存', 'success');
    broadcastDataChange();
    return true;
  };

  const onDeleteCustomerCloud = async (customerId: string, customerBackup: Customer) => {
    if (!apiEndpoint) return;
    const token = localStorage.getItem('APP_SESSION_TOKEN');
    const res = await fetchWithRetry(apiEndpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'deleteCustomer', token: token || "", data: { id: customerId, originalLastUpdated: customerBackup.lastUpdated } }) });
    const json = await res.json();
    if (!json.success) {
      if (json.error === "UNAUTHORIZED_OR_EXPIRED") {
          localStorage.removeItem('nm_auth_status');
          localStorage.removeItem('APP_SESSION_TOKEN');
          window.dispatchEvent(new Event('app-unauthorized'));
          return;
      }
      throw new Error(json.error || 'Delete failed');
    }
    broadcastDataChange();
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
          /* 1. 拔除 body 預設留白 */
          body { font-family: sans-serif; margin: 0; padding: 0; color: #333; } 
          h1 { text-align: center; margin-bottom: 10px; font-size: 32px; } 
          p.date { text-align: center; color: #666; margin-bottom: 30px; font-size: 20px; font-weight: bold; } 
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 18px; } 
          th, td { vertical-align: top; } 
          
          /* 1. 標題欄位縮小 50%：設定具體 px，並把 padding 稍微調小讓標題列不要太厚 */
          th { background-color: #f8f9fa; font-weight: bold; text-align: center; border: 1px solid #ccc; font-size: 9px; padding: 6px; -webkit-print-color-adjust: exact; print-color-adjust: exact; } 
          
          /* 2. 內容欄位放大 150%：統一設定在 td */
          td { border: 1px solid #ccc; padding: 12px; text-align: left; font-size: 27px; } 

          /* 如果你想讓品項名稱特別粗，可以加一個專屬 class */
          .item-name { font-weight: bold; font-size: 32px; }

          tr:nth-child(even) { background-color: #fafafa; -webkit-print-color-adjust: exact; print-color-adjust: exact; } 
          .text-right { text-align: right; } 
          .text-center { text-align: center; } 
          .badge { display: inline-block; background: #fff; padding: 4px 8px; border-radius: 4px; font-size: 24px; margin: 4px; border: 1px solid #ddd; color: #555; } 
          /* 總量欄位：極大化至 54px (200%)，並強制粗體 */
          .total-cell { font-size: 54px; font-weight: bold; } 
          .footer { margin-top: 40px; text-align: right; font-size: 14px; color: #999; border-top: 1px solid #eee; padding-top: 10px; } 
          
          /* 移除瀏覽器預設列印頁首頁尾 */
          @page {
            size: A4; /* 建議明確指定紙張尺寸 */
            margin: 5mm; /* 建議保留 5mm 安全邊距防印表機硬體切字，若要極致貼滿可設為 0 */
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
              margin: 0;
              padding: 0; /* 移除原本錯誤的 Body padding */
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            thead {
              display: table-header-group; /* 讓長表格如果跨到下一頁，每一頁都會自動重複顯示表頭 */
            }
            .group-header {
              page-break-after: avoid; /* 避免分類標題印在第一頁底，但表格內容卻跑到第二頁 */
            }
            .print-row {
              page-break-inside: avoid; /* 核心：讓斷頁只允許發生在「品項圖塊之間」，不會把單一列從中切斷 */
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
        </button>`; 
        
    workSheetData.forEach(group => { 
      htmlContent += `
        <div style="margin-bottom: 0;"> 
          <table>
            <thead>
              <tr>
                <th width="20%">品項</th><th width="15%">總量</th><th width="10%">單位</th><th>分配明細</th>
              </tr>
            </thead>
            <tbody>
              ${group.items.map(item => `
                <tr class="print-row"> 
                  <td class="item-name">${item.name}</td>
                  <td class="text-center total-cell">${item.totalQty}</td>
                  <td class="text-center">${item.unit}</td>
                  <td>${item.details.map(d => `<span class="badge">${d.customerName} <b>${d.qty}</b></span>`).join('')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`; 
    }); 
    
    htmlContent += `<div class="footer">列印時間: ${new Date().toLocaleString()}</div><script>window.onload = function() { setTimeout(function() { window.print(); }, 500); };</script></body></html>`; 
    
    printWindow.document.write(htmlContent); 
    printWindow.document.close(); 
  };

  if (!isAuthenticated || isInitialLoading) {
    return (
      <AnimatePresence mode="wait">
        {!isAuthenticated ? (
          <LoginScreen key="login-screen" onLogin={handleLogin} onSaveApiUrl={handleSaveApiUrl} apiEndpoint={apiEndpoint} addToast={addToast} />
        ) : (
          <motion.div 
            key="initial-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            className="min-h-screen flex flex-col max-w-md mx-auto bg-morandi-oatmeal p-4 space-y-3"
          >
            <div className="h-16 bg-white rounded-2xl shadow-sm mb-6 animate-pulse"></div>
            {[1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  const onSaveProductCloud = async (finalProduct: Product, isEditingProduct: string | null, originalLastUpdated: number | undefined, previousProducts: Product[]) => {
    if (!apiEndpoint || isSaving) return false;
    setIsSaving(true);
    try {
      const payload = { ...finalProduct };
      delete payload._syncStatus;
      delete payload._localUpdatedTs;
      
      if (isEditingProduct !== 'new') {
        (payload as any).originalLastUpdated = originalLastUpdated;
        (payload as any).force = true;
      }
      const token = localStorage.getItem('APP_SESSION_TOKEN');
      const res = await fetchWithRetry(apiEndpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'updateProduct', token: token || "", data: payload }) });
      const json = await res.json();
      if (!json.success) {
        if (json.error === "UNAUTHORIZED_OR_EXPIRED") {
             localStorage.removeItem('nm_auth_status');
             localStorage.removeItem('APP_SESSION_TOKEN');
             window.dispatchEvent(new Event('app-unauthorized'));
             return false;
        }
        if (json.errorCode === 'ERR_VERSION_CONFLICT') {
          setProducts(previousProducts);
          setConflictData({
            action: 'updateProduct',
            data: payload,
            description: `更新品項: ${finalProduct.name}`,
            type: 'product',
            clientData: payload,
            serverData: json.serverData || json.data
          });
        } else {
          setProducts(prev => prev.map(p => p.id === finalProduct.id ? { ...p, _syncStatus: 'error' } : p));
          addToast('品項資料儲存失敗', 'error');
        }
        setIsSaving(false);
        return false;
      }
    } catch (e) {
      console.error(e);
      setProducts(prev => prev.map(p => p.id === finalProduct.id ? { ...p, _syncStatus: 'error' } : p));
      addToast('品項資料儲存失敗，請檢查網路', 'error');
      setIsSaving(false);
      return false;
    }
    setIsSaving(false);
    
    // 解除 pending 狀態
    setProducts(prev => prev.map(p => p.id === finalProduct.id ? { ...p, _syncStatus: 'synced' } : p));
    
    broadcastDataChange();
    return true;
  };

  const onDeleteProductCloud = async (productId: string, productBackup: Product) => {
    if (!apiEndpoint) return;
    const token = localStorage.getItem('APP_SESSION_TOKEN');
    const res = await fetchWithRetry(apiEndpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'deleteProduct', token: token || "", data: { id: productId, originalLastUpdated: productBackup.lastUpdated } }) });
    const json = await res.json();
    if (!json.success) {
      if (json.error === "UNAUTHORIZED_OR_EXPIRED") {
          localStorage.removeItem('nm_auth_status');
          localStorage.removeItem('APP_SESSION_TOKEN');
          window.dispatchEvent(new Event('app-unauthorized'));
          return;
      }
      throw new Error(json.error || 'Delete failed');
    }
    broadcastDataChange();
  };

  const onSaveProductOrderCloud = async (orderedIds: string[]) => {
     if (!apiEndpoint || isSaving) return false;
     setIsSaving(true);
     try {
       const token = localStorage.getItem('APP_SESSION_TOKEN');
       const res = await fetchWithRetry(apiEndpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'reorderProducts', token: token || "", data: orderedIds }) });
       const json = await res.json();
       if (json.error === "UNAUTHORIZED_OR_EXPIRED") {
           localStorage.removeItem('nm_auth_status');
           localStorage.removeItem('APP_SESSION_TOKEN');
           window.dispatchEvent(new Event('app-unauthorized'));
           return false;
       }
       setInitialProductOrder(orderedIds);
       broadcastDataChange();
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
        isUnlocked={auth.isUnlocked}
        setIsUnlocked={auth.setIsUnlocked}
        isOnline={isOnline}
        syncQueue={syncQueue}
        isSyncingQueue={isSyncingQueue}
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
        <ViewManager
          activeTab={activeTab}
          // OrdersPage Props
          orders={orders} setOrders={setOrders} 
          customers={customers} products={products}
          trips={trips}
          setDrawerConfig={setDrawerConfig}
          apiEndpoint={apiEndpoint}
          isSaving={isSaving} setIsSaving={setIsSaving}
          isWarmingUp={isWarmingUp} isRetrying={isRetrying} isBackgroundSyncing={isBackgroundSyncing}
          layoutMode={layoutMode}
          addToast={addToast} setToasts={setToasts}
          saveOrderToCloud={saveOrderToCloud} setConflictData={setConflictData}
          handleForceRetry={handleForceRetry} requireAuth={auth.requireAuth}
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
          handleRetrySync={handleRetrySync}
          handleDiscardLocalError={handleDiscardLocalError}
          externalEditOrderId={externalEditOrderId || (externalAction?.type === 'edit' ? externalAction.id : null)}
          onClearExternalEdit={() => { setExternalEditOrderId(null); setExternalAction(null); }}
          externalAddOrderData={externalAddOrderData}
          clearExternalAddOrder={() => setExternalAddOrderData(null)}
          // CustomersPage Props
          setCustomers={setCustomers}
          setConfirmConfig={setConfirmConfig}
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
          onCreateOrder={(c: any) => { setExternalAddOrderData(c); setActiveTab('orders'); }}
          // ProductsPage Props
          setProducts={setProducts}
          isEditingProduct={isEditingProduct}
          setIsEditingProduct={setIsEditingProduct}
          onSaveProductCloud={onSaveProductCloud}
          onDeleteProductCloud={onDeleteProductCloud}
          onSaveProductOrderCloud={onSaveProductOrderCloud}
          // SchedulePage Props
          productMap={productMap}
          customerMap={customerMap}
          isLoadingProducts={isLoadingProducts}
          setAvailableTrips={setAvailableTrips}
          setIsTripManagerOpen={setIsTripManagerOpen}
          calculateOrderTotalAmount={calculateOrderTotalAmount}
          // FinancePage Props
          financeData={financeData}
          setSettlementDate={setSettlementDate}
          setSettlementTarget={setSettlementTarget}
          handleCopyStatement={handleCopyStatement}
          handleShareStatementToLine={handleShareStatementToLine}
          // WorkPage Props
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
        />

      </main>

      {/* (All Global Modals Moved Here) */}
      <GlobalModals
         isUnlockModalOpen={auth.showUnlockModal}
         onCloseUnlockModal={() => auth.setShowUnlockModal(false)}
         handleAppUnlock={auth.handleAppUnlock}
         isUnlocking={auth.isUnlocking}
         unlockError={auth.unlockError}
         onEditCustomerItems={(customer) => {
           setCustomerForm({ ...customer }); // 2. 塞入店家原始資料準備編輯
           setIsEditingCustomer(customer.id); // 3. 觸發編輯狀態
           setEditCustomerMode('itemsOnly'); // 4. 指定為修改品項模式 (避開完整資料模式)
         }}
         onEditCustomerHoliday={(customerId) => {
           // 這裡只傳了 customerId，所以要先找一遍店家物件
           const customer = customers.find(c => c.id === customerId);
           if (customer) {
             setCustomerForm({ ...customer });
             setIsEditingCustomer(customerId);
             setEditCustomerMode('holidayOnly'); // 指定為設定公休模式
           }
         }}
         setUnlockError={auth.setUnlockError}
         unlockPassword={auth.unlockPassword}
         setUnlockPassword={auth.setUnlockPassword}
         apiEndpoint={apiEndpoint}
         layoutMode={layoutMode}
         setLayoutMode={setLayoutMode}
         syncData={syncData}
         handleChangePassword={handleChangePassword}
         handleSaveApiUrl={handleSaveApiUrl}
         handleForceRetry={handleForceRetry}
         isSaving={isSaving}
         customers={customers}
         setCustomers={setCustomers}
         products={products}
         setProducts={setProducts}
         orders={orders}
         previewDate={previewDate}
         setPreviewDate={setPreviewDate}
         prediction={prediction}
         isEditingCustomer={isEditingCustomer}
         setIsEditingCustomer={setIsEditingCustomer}
         customerForm={customerForm}
         setCustomerForm={setCustomerForm}
         editCustomerMode={editCustomerMode}
         setEditCustomerMode={setEditCustomerMode}
         onSaveCustomerCloud={onSaveCustomerCloud}
         availableTrips={availableTrips}
         setAvailableTrips={setTrips}
         setOrders={setOrders}
         saveOrderToCloud={saveOrderToCloud}
         saveTripsToCloud={saveTripsToCloud}
         onToggleAutoOrder={(customerId) => {
           setCustomers(prev => prev.map(c => 
             c.id === customerId ? { ...c, autoOrderEnabled: !c.autoOrderEnabled } : c
           ));
         }}
      />

      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
};

export default App;