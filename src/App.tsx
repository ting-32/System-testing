import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Users, 
  Package, 
  ClipboardList, 
  History,
  Settings,
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
  LogOut,
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
  Mic, // New Import
  List,
  Grid,
  Filter,
  Check,
  GripVertical,
  Navigation,
  Info,
  MoreVertical,
  Bot
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { Customer, Product, Order, OrderItem, CustomerPrice, Toast, ToastType, OrderStatus } from './types';
import { COLORS, WEEKDAYS, UNITS, DELIVERY_METHODS, ORDERING_HABITS, PRODUCT_CATEGORIES } from './constants';
import { ConfirmModal } from './components/ConfirmModal';
import { VoiceInputModal } from './components/VoiceInputModal';
import { ConflictModal } from './components/ConflictModal';
import { DatePickerModal } from './components/DatePickerModal';
import { SettingsModal } from './components/SettingsModal';
import { TripManagerModal } from './components/TripManagerModal';
import { LoginScreen } from './components/LoginScreen';
import { ProductPicker } from './components/ProductPicker';
import { CustomerPicker } from './components/CustomerPicker';
import { HolidayCalendar } from './components/HolidayCalendar';
import { WorkCalendar } from './components/WorkCalendar';
import { ToastNotification } from './components/ToastNotification';
import { NavItem } from './components/NavItem';
import { SortableProductItem } from './components/SortableProductItem';
import { SwipeableOrderCard } from './components/SwipeableOrderCard';
import { GridCard } from './components/GridCard';
import { SkeletonCard } from './components/SkeletonCard';
import { ScheduleOrderCard } from './components/ScheduleOrderCard';
import { useDataSync } from './hooks/useDataSync';
import { useOrderCalculations } from './hooks/useOrderCalculations';
import { useVoiceAssistant } from './hooks/useVoiceAssistant';
import { useOrderActions } from './hooks/useOrderActions';
import { useDataManagement } from './hooks/useDataManagement';
import { useAutoOrderPrediction } from './hooks/useAutoOrderPrediction';
import { AutoOrderDashboardModal } from './components/modals/AutoOrderDashboardModal';
import { getTomorrowDate, getSmartDefaultDate, getLastMonthEndDate, formatTimeDisplay, formatTimeForInput, getUpcomingHolidays, isDateInOffDays } from './utils';
import { modalVariants, buttonTap, buttonHover, triggerHaptic, containerVariants, itemVariants } from './components/animations';

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
    handleLogout,
    handleChangePassword,
    handleSaveApiUrl,
    handleForceRetry,
    saveOrderToCloud,
    saveTripsToCloud,
    pendingData,
    setPendingData,
    applyPendingUpdates
  } = useDataSync(addToast);

  const [activeTab, setActiveTab] = useState<'orders' | 'customers' | 'products' | 'work' | 'schedule' | 'finance'>('orders');
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAutoOrderDashboardOpen, setIsAutoOrderDashboardOpen] = useState(false);
  
  const mainRef = useRef<HTMLDivElement>(null);
  
  // NEW: Ref to store the version (lastUpdated timestamp) of the item currently being edited
  const editingVersionRef = useRef<number | undefined>(undefined);

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('nm_selected_date');
      if (saved) return saved;
    }
    return getSmartDefaultDate();
  });

  const { previewDate, setPreviewDate, prediction } = useAutoOrderPrediction(customers);

  const [workDates, setWorkDates] = useState<string[]>([getTomorrowDate()]);
  const [workCustomerFilter, setWorkCustomerFilter] = useState('');
  const [workProductFilter, setWorkProductFilter] = useState<Set<string>>(new Set());
  const [isProductFilterOpen, setIsProductFilterOpen] = useState(false);
  const [expandedFilterCats, setExpandedFilterCats] = useState<Set<string>>(new Set());
  const [workDeliveryMethodFilter, setWorkDeliveryMethodFilter] = useState<string[]>([]);
  
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

  // NEW: Order Search & Filter
  const [orderSearch, setOrderSearch] = useState('');
  const [orderDeliveryFilter, setOrderDeliveryFilter] = useState<string[]>([]);
  const [showOrderDeliveryFilters, setShowOrderDeliveryFilters] = useState(false);

  const [holidayEditorId, setHolidayEditorId] = useState<string | null>(null);

  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [quickAddData, setQuickAddData] = useState<{customerName: string, items: {productId: string, quantity: number, unit: string}[]} | null>(null);

  const [tempPriceProdId, setTempPriceProdId] = useState('');
  const [tempPriceValue, setTempPriceValue] = useState('');
  const [tempPriceUnit, setTempPriceUnit] = useState('斤');

  const [collapsedWorkGroups, setCollapsedWorkGroups] = useState<Set<string>>(new Set());
  const [completedWorkItems, setCompletedWorkItems] = useState<Set<string>>(new Set());

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
  const [financeFilter, setFinanceFilter] = useState<'all' | 'thisMonth' | 'over30' | 'over60'>('all');
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
  const [directHolidayCustomer, setDirectHolidayCustomer] = useState<Customer | null>(null);
  const [editCustomerMode, setEditCustomerMode] = useState<'full' | 'itemsOnly' | 'holidayOnly'>('full');
  const [showAdvancedCustomerSettings, setShowAdvancedCustomerSettings] = useState(false);
  const [isEditingProduct, setIsEditingProduct] = useState<string | null>(null);
  const [productForm, setProductForm] = useState<Partial<Product>>({});
  const [customerSearch, setCustomerSearch] = useState('');
  
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selectedCustomerForModal, setSelectedCustomerForModal] = useState<string | null>(null);
  
  const [isScrollingDown, setIsScrollingDown] = useState(false);
  const [lastScrollY, setLastScrollY] = useState(0);
  
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

  const handleGridCardClick = useCallback((custName: string) => {
    setSelectedCustomerForModal(custName);
  }, []);

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
    customerSearch,
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
          order.lastUpdated,
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

  const handleNavigateTrip = (tripOrders: Order[]) => {
    // 1. 取得該趟數所有不重複的店家名稱 (依照原本的訂單排序)
    const customerNames = Array.from(new Set(tripOrders.map(o => o.customerName)));
    
    if (customerNames.length === 0) return;

    // 取得對應的客戶資料，優先使用座標，其次使用地址，最後使用客戶名稱
    const getCustomerLocation = (name: string) => {
      const customer = customers.find(c => c.name === name);
      
      if (customer?.coordinates) {
        return customer.coordinates;
      }

      if (customer?.address) {
        return customer.address;
      }
      return name;
    };

    const locations = customerNames.map(getCustomerLocation);

    // 2. 終點是最後一個地點 (需進行 URL 編碼)
    const destination = encodeURIComponent(locations[locations.length - 1]);
    
    // 3. 中間的地點是停靠站 (waypoints)
    const waypoints = locations.slice(0, -1).map(loc => encodeURIComponent(loc)).join('|');
    
    // 4. 組合 Google Maps 導航網址 (未指定 origin 預設為使用者當前位置)
    let url = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
    
    if (waypoints) {
      url += `&waypoints=${waypoints}`;
    }
    
    // 5. 開啟新分頁導航 (在手機上會自動喚醒 Google Maps App)
    window.open(url, '_blank');
  };

  const handleDeleteTrip = (tripToDelete: string) => {
    if (window.confirm(`確定要刪除「${tripToDelete}」嗎？\n該趟次的訂單將會被移至「未分配」。`)) {
      // Update orders
      const idsToUpdate = orders.filter(o => o.trip === tripToDelete).map(o => o.id);
      if (idsToUpdate.length > 0) {
        setOrders((prev: Order[]) => prev.map(o => o.trip === tripToDelete ? { ...o, trip: '未分配', syncStatus: 'pending', pendingAction: 'update' } : o));
        idsToUpdate.forEach(id => {
          const order = orders.find(o => o.id === id);
          if (order) {
            saveOrderToCloud({ ...order, trip: '未分配' }, 'updateOrderContent', order.lastUpdated, () => {
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

  const getTripSummary = (tripOrders: Order[]) => {
    let totalWeight = 0;
    let totalAmount = 0;
    let totalQuantity = 0;
    
    tripOrders.forEach(order => {
      const customer = customers.find(c => c.name === order.customerName);
      
      order.items.forEach(item => {
        const product = products.find(p => p.id === item.productId || p.name === item.productId);
        const priceItem = customer?.priceList?.find(pl => pl.productId === (product?.id || item.productId));
        const unitPrice = priceItem ? priceItem.price : (product?.price || 0);
        
        if (item.unit === '元') {
          totalAmount += item.quantity;
        } else {
          totalAmount += Math.round(item.quantity * unitPrice);
          if (item.unit === '斤' || item.unit === '公斤') {
            totalWeight += item.quantity;
          } else {
            totalQuantity += item.quantity;
          }
        }
      });
    });
    
    return { totalWeight, totalQuantity, totalAmount };
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
    setPendingData,
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

    // 1. Define the silent sync executor with safety locks
    const performSilentSync = () => {
      // Safety Lock: Don't sync if user is editing
      if (isAddingOrder || isEditingCustomer || isEditingProduct || quickAddData || editingOrderId) {
        console.log("使用者忙碌中，略過背景同步");
        return;
      }
      
      // Execute sync in silent mode
      syncData(true);
    };

    // 2. Initial Sync on mount (explicitly non-silent if needed, but handled by the original effect below if kept separate.
    // However, to consolidate, we can rely on the original effect for initial load and this one for updates)
    
    // 3. Polling Logic (Every 60 seconds)
    const intervalId = setInterval(performSilentSync, 60000);

    // 4. Focus Logic (Revalidate on Focus)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        performSilentSync();
      }
    };
    
    const onWindowFocus = () => {
        performSilentSync();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onWindowFocus);

    // Cleanup
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onWindowFocus);
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



  const handleSaveProductOrder = async () => { if (!apiEndpoint || isSaving) return; setIsSaving(true); const orderedIds = products.map(p => p.id); try { await fetch(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'reorderProducts', data: orderedIds }) }); setInitialProductOrder(orderedIds); setHasReorderedProducts(false); addToast("排序已更新！", 'success'); } catch (e) { console.error(e); addToast("排序儲存失敗，請檢查網路", 'error'); } finally { setIsSaving(false); } };

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
    productForm,
    isEditingCustomer,
    setIsEditingCustomer,
    isEditingProduct,
    setIsEditingProduct,
    editingVersionRef,
    setConflictData,
    setPendingData,
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

  return (
    <div className="h-[100dvh] flex flex-col max-w-md mx-auto bg-morandi-oatmeal relative shadow-2xl overflow-hidden text-morandi-charcoal font-sans">
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
           
           <motion.button whileTap={buttonTap} onClick={handleLogout} className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center border border-slate-100 text-morandi-pebble hover:text-rose-400 hover:bg-rose-50 transition-colors"><LogOut className="w-5 h-5" /></motion.button>
          <motion.button whileTap={buttonTap} onClick={() => setIsSettingsOpen(true)} className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center border border-slate-100 text-morandi-pebble hover:text-slate-600 transition-colors active:scale-95"><Settings className="w-5 h-5" /></motion.button>
        </div>
      </header>

      {/* New Data Notification Banner */}
      <AnimatePresence>
        {pendingData && (
          <motion.div
            key="pending-data-banner"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-morandi-blue text-white overflow-hidden shadow-md z-30 relative"
          >
            <button 
              onClick={applyPendingUpdates}
              className="w-full py-3 px-4 flex items-center justify-center gap-2 text-sm font-bold active:bg-white/10 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              有新資料可用，點擊更新
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Toast Container --- */}
      <ToastNotification toasts={toasts} removeToast={removeToast} />

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
        description={conflictData?.description}
        onClose={() => setConflictData(null)} 
        onRefresh={() => {
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
        {/* ... (Main content remains unchanged) ... */}
        <AnimatePresence mode="popLayout">
        {activeTab === 'orders' && (
          <motion.div 
            key="orders"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0, zIndex: 10 }} // Step 3: Ensure Z-index high
            exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }} // Step 1: Pointer events none + Low Z-index
            transition={{ duration: 0.2 }}
            className="space-y-6 relative"
          >
            {/* ... (Orders Tab Content) */}
            <div className="sticky top-0 z-30 bg-morandi-oatmeal py-2 space-y-2 px-1 mb-2">
               <div className="flex items-center justify-between">
                  <motion.button whileTap={buttonTap} onClick={() => setIsDatePickerOpen(true)} className="flex-1 mr-2 flex items-center gap-3 bg-white p-3 rounded-[20px] shadow-sm border border-slate-200 active:scale-95 transition-all">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-morandi-blue/10"><CalendarDays className="w-5 h-5 text-morandi-blue" /></div>
                    <div><p className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest">出貨日期</p><p className="font-bold text-morandi-charcoal text-lg tracking-tight">{selectedDate}</p></div>
                  </motion.button>
                  
                  <div className="flex gap-2 shrink-0">
                    <motion.button 
                      whileTap={buttonTap} 
                      onClick={() => {
                        triggerHaptic();
                        setIsAutoOrderDashboardOpen(true);
                      }} 
                      className="relative flex items-center justify-center gap-2 w-14 h-14 md:w-auto md:px-4 rounded-[20px] text-white font-bold shadow-md transition-all bg-gradient-to-br from-morandi-blue to-indigo-500 hover:shadow-lg"
                    >
                      <Bot className="w-6 h-6" />
                      <span className="hidden md:inline">自動建單預覽</span>
                      {prediction.greenZone.length > 0 && (
                        <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm border-2 border-white">
                          預計 {prediction.greenZone.length} 單
                        </span>
                      )}
                    </motion.button>
                    <motion.button whileTap={buttonTap} onClick={() => setActiveTab('work')} className="w-14 h-14 rounded-[20px] bg-white text-morandi-pebble border border-slate-200 shadow-sm flex items-center justify-center hover:bg-slate-50 transition-all">
                       <FileText className="w-6 h-6" />
                    </motion.button>
                  </div>
               </div>

               {/* NEW: Sticky Search Bar & Filter Button */}
               <motion.div
                 initial={false}
                 animate={{ 
                   height: isScrollingDown ? 0 : 'auto', 
                   opacity: isScrollingDown ? 0 : 1,
                   overflow: 'hidden'
                 }}
                 transition={{ duration: 0.3, ease: 'easeInOut' }}
                 className="space-y-2"
               >
                 <div className="flex gap-2 items-center">
                   <div className="relative flex-1 flex items-center">
                     <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                     <input 
                       type="text" 
                       placeholder="搜尋客戶名稱或電話..." 
                       className="w-full pl-10 pr-20 py-3 bg-white rounded-[20px] border border-slate-200 shadow-sm text-sm font-bold text-morandi-charcoal focus:ring-2 focus:ring-morandi-blue transition-all placeholder:text-gray-300" 
                       value={orderSearch} 
                       onChange={(e) => setOrderSearch(e.target.value)} 
                     />
                     <div className="absolute right-2 flex items-center gap-1">
                       {orderSearch && (
                         <button onClick={() => setOrderSearch('')} className="p-1 rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200">
                           <X className="w-3 h-3" />
                         </button>
                       )}
                       <button 
                         onClick={() => setIsVoiceModalOpen(true)}
                         className={`p-1.5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-morandi-blue bg-transparent ${isProcessingVoice ? 'text-rose-500 animate-pulse' : 'text-gray-400 hover:text-blue-500 hover:bg-gray-100'}`}
                         aria-label="語音輸入"
                         title="語音輸入"
                       >
                         <Mic className="w-5 h-5" />
                       </button>
                     </div>
                   </div>
                   
                   {/* 新增的漏斗篩選按鈕 */}
                   <button 
                     onClick={() => setShowOrderDeliveryFilters(!showOrderDeliveryFilters)}
                     className={`relative flex-shrink-0 w-12 h-12 rounded-[20px] border flex items-center justify-center transition-all shadow-sm ${showOrderDeliveryFilters || orderDeliveryFilter.length > 0 ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-400 border-slate-200 hover:bg-slate-50'}`}
                   >
                     <Filter className="w-5 h-5" />
                     {/* 如果有選取條件，顯示一個小紅點提示 */}
                     {orderDeliveryFilter.length > 0 && (
                       <span className="absolute -top-1 -right-1 bg-rose-500 border-2 border-white text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                         {orderDeliveryFilter.length}
                       </span>
                     )}
                   </button>

                   <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl h-12">
                     <button 
                       onClick={() => setViewMode('list')}
                       className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                     >
                       <List className="w-4 h-4" />
                     </button>
                     <button 
                       onClick={() => setViewMode('grid')}
                       className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
                     >
                       <Grid className="w-4 h-4" />
                     </button>
                   </div>
                 </div>

                 {/* 展開的篩選選項區塊 */}
                 <AnimatePresence>
                   {showOrderDeliveryFilters && (
                     <motion.div 
                       key="order-delivery-filters"
                       initial={{ height: 0, opacity: 0, marginTop: 0 }} 
                       animate={{ height: 'auto', opacity: 1, marginTop: 8 }} 
                       exit={{ height: 0, opacity: 0, marginTop: 0 }} 
                       transition={{ duration: 0.2 }}
                       className="overflow-hidden"
                     >
                       <div className="flex gap-2 overflow-x-auto pb-2 pt-1 custom-scrollbar">
                         <button 
                           onClick={() => setOrderDeliveryFilter([])} 
                           className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${orderDeliveryFilter.length === 0 ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-400 border-gray-200'}`}
                         >
                           全部
                         </button>
                         {DELIVERY_METHODS.map(m => {
                           const isSelected = orderDeliveryFilter.includes(m);
                           return (
                             <button 
                               key={m} 
                               onClick={() => {
                                  if (isSelected) setOrderDeliveryFilter(orderDeliveryFilter.filter(x => x !== m));
                                  else setOrderDeliveryFilter([...orderDeliveryFilter, m]);
                               }} 
                               className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${isSelected ? 'text-white border-transparent' : 'bg-white text-gray-400 border-gray-200'}`}
                               style={{ backgroundColor: isSelected ? COLORS.primary : '' }}
                             >
                               {m}
                             </button>
                           );
                         })}
                       </div>
                     </motion.div>
                   )}
                 </AnimatePresence>
               </motion.div>
            </div>
             {/* ... (Orders List - same logic as before but using toast handlers) */}
             <div className="space-y-3">
              <div className="flex items-center justify-between px-2 mb-2">
                <h2 className="text-sm font-bold text-morandi-pebble flex items-center gap-2 uppercase tracking-widest"><Layers className="w-4 h-4" /> 配送列表 [{selectedDate}] ({Object.keys(groupedOrders).length} 家)</h2>
              </div>
              <motion.div variants={containerVariants} initial="hidden" animate="show" className={viewMode === 'grid' ? "grid grid-cols-2 sm:grid-cols-3 gap-2 p-1.5" : ""}>
              {viewMode === 'grid' ? (
                Object.keys(groupedOrders).length > 0 ? (
                  Object.entries(groupedOrders as Record<string, Order[]>).map(([custName, custOrders]) => (
                    <GridCard 
                      key={custName} 
                      customerName={custName}
                      orders={custOrders} 
                      products={products}
                      customers={customers}
                      onClick={handleGridCardClick} 
                    />
                  ))
                ) : (
                  <div className="col-span-3 text-center py-10">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3"><Package className="w-8 h-8 text-slate-300" /></div>
                    <p className="text-slate-400 font-medium">尚無訂單</p>
                  </div>
                )
              ) : Object.keys(groupedOrders).length > 0 ? (
                Object.entries(groupedOrders as Record<string, Order[]>).map(([custName, custOrders]) => {
                  const isExpanded = expandedCustomer === custName;
                  const currentCustomer = customers.find(c => c.name === custName);
                  
                  // 1. 計算商品總和與總價格
                  let totalAmount = 0;
                  const itemTotals = new Map<string, number>();

                  custOrders.forEach(o => { 
                    o.items.forEach(item => { 
                      const p = products.find(prod => prod.id === item.productId); 
                      const pName = p?.name || item.productId; 
                      const unit = item.unit || p?.unit || '斤'; 
                      
                      // 加總相同品項與單位
                      const key = `${pName}::${unit}`;
                      itemTotals.set(key, (itemTotals.get(key) || 0) + item.quantity);

                      // 計算總價格
                      if (unit === '元') { 
                        totalAmount += item.quantity; 
                      } else { 
                        const priceInfo = currentCustomer?.priceList?.find(pl => pl.productId === item.productId); 
                        const price = priceInfo ? priceInfo.price : (p?.price || 0); 
                        totalAmount += Math.round(item.quantity * price); 
                      } 
                    }); 
                  });

                  // 轉換為字串陣列 (例如: 油麵 3斤)
                  const itemSummaries = Array.from(itemTotals.entries()).map(([key, qty]) => {
                    const [name, unit] = key.split('::');
                    return `${name} ${qty}${unit}`;
                  });
                  const summaryText = itemSummaries.join('、');

                  // 2. 判斷綜合狀態
                  const allPaid = custOrders.every(o => o.status === OrderStatus.PAID);
                  const allShipped = custOrders.every(o => o.status === OrderStatus.SHIPPED || o.status === OrderStatus.PAID);
                  let statusTag = { label: '待處理', color: 'bg-blue-50 text-blue-600 border-blue-100' };
                  if (allPaid) statusTag = { label: '已收款', color: 'bg-emerald-50 text-emerald-600 border-emerald-100' };
                  else if (allShipped) statusTag = { label: '已配送', color: 'bg-amber-50 text-amber-600 border-amber-100' };

                  return (
                    <motion.div variants={itemVariants} key={custName} className="bg-white rounded-[24px] shadow-sm border border-slate-200 overflow-hidden mb-3 hover:shadow-md transition-shadow duration-300">
                      <button onClick={() => setExpandedCustomer(isExpanded ? null : custName)} className="w-full flex items-center justify-between p-5 text-left active:bg-morandi-oatmeal/30 transition-colors">
                        <div className="flex items-center gap-4 overflow-hidden">
                          <div className={`w-12 h-12 rounded-[16px] flex-shrink-0 flex items-center justify-center text-xl font-extrabold transition-colors ${isExpanded ? 'bg-morandi-blue text-white' : 'bg-morandi-oatmeal text-morandi-pebble'}`}>{String(custName || '').charAt(0)}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className={`font-bold text-lg truncate tracking-tight ${isExpanded ? 'text-morandi-charcoal' : 'text-slate-700'}`}>{custName}</h3>
                              {/* 新增狀態標籤 */}
                              <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold flex-shrink-0 border ${statusTag.color}`}>{statusTag.label}</span>
                              {/* 原本的總價格 */}
                              {totalAmount > 0 && (<span className="bg-morandi-amber-bg text-morandi-amber-text text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 tracking-wide">${totalAmount.toLocaleString()}</span>)}
                            </div>
                            {!isExpanded && (<p className="text-xs text-morandi-pebble font-medium truncate leading-relaxed tracking-wide">{summaryText || `${custOrders.reduce((sum, o) => sum + o.items.length, 0)} 個品項`}</p>)}
                          </div>
                        </div>
                        {isExpanded ? <ChevronUp className="w-5 h-5 text-morandi-pebble flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-morandi-pebble flex-shrink-0" />}
                      </button>
                      
                      <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="bg-morandi-oatmeal/20 border-t border-slate-100 overflow-hidden">
                          <div className="p-5">
                          {custOrders.map((order) => (
                             <SwipeableOrderCard 
                                key={order.id} 
                                order={order} 
                                products={products} 
                                customers={customers}
                                isSelectionMode={isSelectionMode}
                                isSelected={selectedOrderIds.has(order.id)}
                                onToggleSelection={() => { const newSet = new Set(selectedOrderIds); if (newSet.has(order.id)) newSet.delete(order.id); else newSet.add(order.id); setSelectedOrderIds(newSet); }}
                                onStatusChange={handleSwipeStatusChange} // Use Undo handler
                                onDelete={() => handleDeleteOrder(order.id)}
                                onShare={handleShareOrder}
                                onMap={openGoogleMaps}
                                onEdit={handleEditOrder}
                                onRetry={handleRetryOrder}
                             />
                          ))}
                          <motion.button whileTap={buttonTap} onClick={() => setQuickAddData({ customerName: custName, items: [{productId: '', quantity: 10, unit: '斤'}] })} className="w-full mt-2 py-3 rounded-[16px] border-2 border-dashed border-morandi-blue/30 text-morandi-blue font-bold text-sm flex items-center justify-center gap-2 hover:bg-morandi-blue/5 transition-colors tracking-wide"><Plus className="w-4 h-4" /> 追加訂單</motion.button>
                          <div className="flex gap-2 pt-2">
                             <motion.button whileTap={buttonTap} onClick={() => handleCopyOrder(custName, custOrders)} className="flex-1 py-3 px-4 rounded-[16px] bg-white text-morandi-pebble border border-slate-200 font-bold text-sm flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors shadow-sm tracking-wide"><Copy className="w-4 h-4" /> 複製</motion.button>
                             <motion.button whileTap={buttonTap} onClick={() => openGoogleMaps(custName)} className="flex-1 py-3 px-4 rounded-[16px] bg-morandi-blue text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-600 transition-colors shadow-lg shadow-morandi-blue/20 tracking-wide"><MapPin className="w-4 h-4" /> 導航</motion.button>
                          </div>
                          </div>
                        </motion.div>
                      )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })
              ) : (
                <div className="py-20 flex flex-col items-center text-center gap-4">
                  <ClipboardList className="w-16 h-16 text-gray-200" />
                  {orderSearch || orderDeliveryFilter.length > 0 ? (
                     <>
                       <p className="text-gray-400 font-bold text-sm tracking-wide">找不到符合條件的訂單</p>
                       <button onClick={() => { setOrderSearch(''); setOrderDeliveryFilter([]); }} className="text-xs text-morandi-blue font-bold underline">清除篩選條件</button>
                     </>
                  ) : (
                     <p className="text-gray-300 italic text-sm tracking-wide">此日期尚無訂單</p>
                  )}
                </div>
              )}
              </motion.div>
            </div>
            {/* 👇 新增這層外掛容器來限制按鈕位置，使其與 App 寬度一致 */}
            <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-full max-w-md pointer-events-none z-50 flex justify-end px-6">
              <motion.button 
                whileTap={buttonTap} 
                whileHover={buttonHover} 
                onClick={() => { 
                  setEditingOrderId(null); 
                  setOrderForm({
                    customerType: 'existing',
                    customerId: '',
                    customerName: '',
                    deliveryTime: '',
                    deliveryMethod: '',
                    trip: '',
                    items: [{ productId: '', quantity: 10, unit: '斤' }],
                    note: '',
                    date: selectedDate
                  });
                  setIsAddingOrder(true); 
                }} 
                // 👇 修改這裡的 Tailwind 樣式：移除 absolute，改用 flex 排版
                className="pointer-events-auto w-14 h-14 rounded-full text-white shadow-2xl shadow-morandi-blue/40 hover:bg-slate-600 active:scale-95 transition-all flex items-center justify-center bg-morandi-blue"
              >
                <Plus className="w-8 h-8" />
              </motion.button>
            </div>
          </motion.div>
        )}
        
        {/* ... (Other Tabs remain unchanged) ... */}
        {activeTab === 'customers' && (
           <motion.div key="customers" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0, zIndex: 10 }} exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }} transition={{ duration: 0.2 }} className="relative">
            <div className="sticky top-0 z-20 bg-morandi-oatmeal pt-4 pb-4 -mx-4 px-4 shadow-sm border-b border-slate-100">
              <div className="flex justify-between items-center mb-3"><h2 className="text-xl font-extrabold text-morandi-charcoal flex items-center gap-2 tracking-tight"><Users className="w-5 h-5 text-morandi-blue" /> 店家管理</h2><motion.button whileTap={buttonTap} whileHover={buttonHover} onClick={() => { setCustomerForm({ name: '', phone: '', address: '', coordinates: '', deliveryTime: '08:00', defaultTrip: '', defaultItems: [], offDays: [], holidayDates: [], priceList: [], deliveryMethod: '', paymentTerm: 'regular' }); setIsEditingCustomer('new'); setEditCustomerMode('full'); setTempPriceProdId(''); setTempPriceValue(''); setTempPriceUnit('斤'); }} className="p-3 rounded-2xl text-white shadow-lg bg-morandi-blue hover:bg-slate-600 transition-colors"><Plus className="w-6 h-6" /></motion.button></div>
              <div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input type="text" placeholder="搜尋店家名稱..." className="w-full pl-10 pr-4 py-2.5 bg-white rounded-xl border border-slate-200 shadow-sm text-sm text-morandi-charcoal font-bold tracking-wide focus:ring-2 focus:ring-morandi-blue transition-all placeholder:text-gray-400" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} /></div>
            </div>
            <motion.div variants={containerVariants} initial="hidden" animate="show" className="pt-4">
            {filteredCustomers.map(c => {
               const hasOrderToday = groupedOrders[c.name] && groupedOrders[c.name].length > 0;
               return (
                  <motion.div variants={itemVariants} key={c.id} className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-200 mb-4 hover:shadow-md transition-all relative overflow-hidden">
                    {hasOrderToday && <div className="absolute top-0 right-0 bg-amber-100 text-amber-700 text-[9px] font-bold px-3 py-1 rounded-bl-xl z-10">今日已下單</div>}
                    <div className="flex justify-between items-start mb-4"><div className="flex items-center gap-3"><div className="w-14 h-14 rounded-[22px] bg-morandi-oatmeal flex items-center justify-center text-xl font-extrabold text-morandi-blue">{String(c.name || '').charAt(0)}</div><div><h3 className="font-bold text-slate-800 text-lg tracking-tight">{c.name}</h3><p className="text-xs text-slate-500 font-medium tracking-wide">{c.phone || '無電話'}</p>{(c.address || c.coordinates) && (() => {
  const targetUrl = c.coordinates ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.coordinates)}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address || '')}`;
  const tooltipText = c.coordinates ? "開啟精準地圖連結" : "在 Google 地圖上搜尋此地址";

  return (
    <div className="mt-1.5">
      <a 
        href={targetUrl} 
        target="_blank" 
        rel="noopener noreferrer" 
        title={tooltipText}
        className="group inline-flex items-start gap-1.5 px-1.5 py-1 -ml-1.5 rounded-md transition-all hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-100"
      >
        <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:text-blue-500 transition-colors mt-0.5" />
        <span className="text-xs text-slate-500 group-hover:text-blue-600 transition-colors font-medium tracking-wide">
          {c.address || '查看 Google 地圖'}
        </span>
      </a>
    </div>
  );
})()}</div></div><div className="flex flex-col items-end gap-1 mt-2"><div className="flex gap-1">{WEEKDAYS.map(d => (<div key={d.value} className={`w-4 h-4 rounded-full text-[8px] flex items-center justify-center font-bold ${c.offDays?.includes(d.value) ? 'bg-rose-100 text-rose-400' : 'bg-gray-50 text-gray-300'}`}>{d.label}</div>))}</div>{c.holidayDates && c.holidayDates.length > 0 && <span className="text-[8px] font-bold text-rose-300">+{c.holidayDates.length} 特定休</span>}{c.priceList && c.priceList.length > 0 && <span className="text-[8px] font-bold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded mt-1">已設 {c.priceList.length} 種單價</span>}</div></div>
                    <div className="space-y-3 mb-4 bg-gray-50/60 p-4 rounded-[24px] border border-gray-100"><div className="flex justify-between"><div className="text-[11px] font-bold text-slate-700 tracking-wide">配送時間:{formatTimeDisplay(c.deliveryTime)}</div><div className="flex gap-1">{c.defaultTrip && <div className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">{c.defaultTrip}</div>}{c.deliveryMethod && <div className="text-[11px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-lg border border-gray-100">{c.deliveryMethod}</div>}{c.paymentTerm && (<div className="text-[11px] font-bold text-morandi-blue bg-white px-2 py-0.5 rounded-lg border border-gray-100">{ORDERING_HABITS.find(t => t.value === c.paymentTerm)?.label}</div>)}</div></div>{c.defaultItems && c.defaultItems.length > 0 ? (<div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-200/50">{c.defaultItems.map((di, idx) => { const p = products.find(prod => prod.id === di.productId); return (<div key={idx} className="bg-white px-2 py-1 rounded-xl text-[10px] border border-gray-200 flex items-center gap-1 shadow-sm"><span className="font-bold text-slate-700">{p?.name || '未知品項'}</span><span className="font-extrabold text-morandi-blue">{di.quantity}{di.unit || p?.unit || '斤'}</span></div>); })}</div>) : (<div className="text-[10px] text-gray-400 font-medium italic pt-2 border-t border-gray-200/50 tracking-wide">尚未設定預設品項</div>)}</div>
                    <div className="flex gap-2">
                       <motion.button whileTap={buttonTap} onClick={() => handleCreateOrderFromCustomer(c)} className="flex-[2] py-3 bg-morandi-blue rounded-2xl text-white font-bold text-xs flex items-center justify-center gap-2 hover:bg-slate-600 transition-colors shadow-md shadow-morandi-blue/20"><ClipboardList className="w-3.5 h-3.5" /> 建立訂單</motion.button>
                       <motion.button whileTap={buttonTap} onClick={() => { setCustomerForm({ ...c, address: c.address || '', coordinates: c.coordinates || '', deliveryTime: formatTimeForInput(c.deliveryTime), paymentTerm: c.paymentTerm || 'regular', defaultTrip: c.defaultTrip || '' }); setIsEditingCustomer(c.id); setEditCustomerMode('full'); setTempPriceProdId(''); setTempPriceValue(''); setTempPriceUnit('斤'); }} className="flex-1 py-3 bg-gray-50 rounded-2xl text-slate-700 font-bold text-xs flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors border border-gray-100"><Edit2 className="w-3.5 h-3.5" /> 編輯</motion.button>
                       <motion.button whileTap={buttonTap} onClick={() => handleDeleteCustomer(c.id)} className="px-4 py-3 bg-gray-50 rounded-2xl text-morandi-pink hover:text-rose-500 transition-colors border border-gray-100"><Trash2 className="w-4 h-4" /></motion.button>
                    </div>
                  </motion.div>
               );
            })}
            </motion.div>
            {filteredCustomers.length === 0 && <div className="text-center py-10 text-gray-300 text-sm font-bold tracking-wide">查無店家</div>}
           </motion.div>
        )}
        {activeTab === 'products' && (
          <motion.div key="products" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0, zIndex: 10 }} exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }} transition={{ duration: 0.2 }} className="space-y-6 relative">
             <div className="flex justify-between items-center px-1"><h2 className="text-xl font-extrabold text-morandi-charcoal flex items-center gap-2 tracking-tight"><Package className="w-5 h-5 text-morandi-blue" /> 品項清單</h2><div className="flex gap-2">{hasReorderedProducts && (<motion.button initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} whileTap={buttonTap} onClick={handleSaveProductOrder} disabled={isSaving} className="p-3 rounded-2xl text-white shadow-lg bg-emerald-500 hover:bg-emerald-600 transition-colors flex items-center gap-2">{isSaving ? <Loader2 className="w-6 h-6 animate-spin"/> : <Save className="w-6 h-6" />}<span className="text-xs font-bold hidden sm:inline">儲存排序</span></motion.button>)}<motion.button whileTap={buttonTap} whileHover={buttonHover} onClick={() => { setProductForm({ name: '', unit: '斤', price: 0, category: 'other' }); setIsEditingProduct('new'); }} className="p-3 rounded-2xl text-white shadow-lg bg-morandi-blue hover:bg-slate-600 transition-colors"><Plus className="w-6 h-6" /></motion.button></div></div>
             <Reorder.Group axis="y" values={products} onReorder={(newOrder) => { setProducts(newOrder); setHasReorderedProducts(true); }} className="space-y-0">
               {products.map(p => (<SortableProductItem key={p.id} product={p} onEdit={(p) => { setProductForm(p); setIsEditingProduct(p.id); }} onDelete={(id) => handleDeleteProduct(id)} />))}
             </Reorder.Group>
          </motion.div>
        )}
        {/* ... (Other Tabs code remains same) ... */}
        {activeTab === 'schedule' && (
           <motion.div key="schedule" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0, zIndex: 10 }} exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }} transition={{ duration: 0.2 }} className="space-y-6 relative">
              <div className="px-1"><h2 className="text-xl font-extrabold text-morandi-charcoal flex items-center gap-2 mb-4 tracking-tight"><CalendarCheck className="w-5 h-5 text-morandi-blue" /> 配送行程</h2><div className="mb-6"><WorkCalendar selectedDate={scheduleDate} onSelect={setScheduleDate} orders={orders} /></div>
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay: 0.2 }} className="bg-slate-700 rounded-[28px] p-5 shadow-lg text-white mb-6 relative overflow-hidden"><div className="absolute right-[-10px] bottom-[-20px] text-slate-600 opacity-20 rotate-12"><Banknote className="w-32 h-32" /></div><div className="flex justify-between items-start mb-2 relative z-10"><div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">本日應收總額</p><h3 className="text-3xl font-black mt-1 text-white tracking-tight">${scheduleMoneySummary.totalReceivable.toLocaleString()}</h3></div><div className="text-right"><p className="text-[10px] font-bold text-morandi-green-text uppercase tracking-widest">已收款</p><h3 className="text-xl font-bold text-emerald-300 mt-1 tracking-tight">${scheduleMoneySummary.totalCollected.toLocaleString()}</h3></div></div><div className="w-full bg-slate-600 rounded-full h-1.5 mt-2 relative z-10"><motion.div className="bg-emerald-400 h-1.5 rounded-full" initial={{ width: 0 }} animate={{ width: `${scheduleMoneySummary.totalReceivable > 0 ? (scheduleMoneySummary.totalCollected / scheduleMoneySummary.totalReceivable) * 100 : 0}%` }} transition={{ duration: 1, ease: "easeOut" }} /></div><p className="text-[9px] text-slate-400 mt-2 text-right relative z-10 tracking-wide">尚有 ${(scheduleMoneySummary.totalReceivable - scheduleMoneySummary.totalCollected).toLocaleString()} 未收</p></motion.div>
              <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar mb-4 items-center">
                <button onClick={() => setIsSelectionMode(!isSelectionMode)} className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-1 ${isSelectionMode ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-morandi-blue border-morandi-blue'}`}>{isSelectionMode ? <X className="w-3.5 h-3.5" /> : <CheckSquare className="w-3.5 h-3.5" />}{isSelectionMode ? '取消選取' : '批量操作'}</button>
                
                {isSelectionMode && selectedOrderIds.size > 0 && (
                  <>
                    <div className="w-[1px] h-6 bg-gray-300 mx-1"></div>
                    {availableTrips.map((trip, idx) => {
                      const colorClasses = [
                        'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100',
                        'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100',
                        'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100',
                        'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100',
                        'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100',
                        'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100',
                      ];
                      const colorClass = trip === '未分配' ? 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100' : colorClasses[idx % colorClasses.length];
                      
                      return (
                        <button key={trip} onClick={() => handleSetTrip(trip)} className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${colorClass}`}>
                          設為{trip}
                        </button>
                      );
                    })}
                  </>
                )}
                
                <div className="w-[1px] h-6 bg-gray-300 mx-1"></div>
                <button 
                  onClick={() => setShowScheduleDeliveryFilters(!showScheduleDeliveryFilters)} 
                  className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-1 ${showScheduleDeliveryFilters || scheduleDeliveryMethodFilter.length > 0 ? 'bg-slate-100 text-slate-700 border-slate-300' : 'bg-white text-gray-400 border-gray-200'}`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  篩選配送方式
                  {scheduleDeliveryMethodFilter.length > 0 && (
                    <span className="ml-1 bg-slate-700 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">
                      {scheduleDeliveryMethodFilter.length}
                    </span>
                  )}
                </button>

                {showScheduleDeliveryFilters && (
                  <>
                    <button onClick={() => setScheduleDeliveryMethodFilter([])} className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${scheduleDeliveryMethodFilter.length === 0 ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-400 border-gray-200'}`}>全部方式</button>
                    {DELIVERY_METHODS.map(m => { 
                      const isSelected = scheduleDeliveryMethodFilter.includes(m); 
                      return (
                        <button 
                          key={m} 
                          onClick={() => { 
                            if (isSelected) { 
                              setScheduleDeliveryMethodFilter(scheduleDeliveryMethodFilter.filter(x => x !== m)); 
                            } else { 
                              setScheduleDeliveryMethodFilter([...scheduleDeliveryMethodFilter, m]); 
                            } 
                          }} 
                          className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${isSelected ? 'text-white border-transparent' : 'bg-white text-gray-400 border-gray-200'}`} 
                          style={{ backgroundColor: isSelected ? COLORS.primary : '' }}
                        >
                          {m}
                        </button>
                      ); 
                    })}
                  </>
                )}
              </div>
              <div className="space-y-6 pb-20">
                <div className="flex justify-between items-center px-2">
                  <h3 className="text-xs font-bold text-morandi-pebble uppercase tracking-widest flex items-center gap-2"><Clock className="w-4 h-4" /> 配送明細 [{scheduleDate}]</h3>
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-bold text-gray-300 tracking-wide">共 {scheduleOrders.length} 筆</div>
                    <button 
                      onClick={() => setIsTripManagerOpen(true)}
                      className="px-3 py-1 bg-white text-slate-600 border border-slate-200 text-xs font-bold rounded-full shadow-sm flex items-center gap-1 hover:bg-slate-50 transition-colors"
                    >
                      <Settings className="w-3 h-3" /> 編輯趟數
                    </button>
                    <button 
                      onClick={() => {
                        setSelectedDate(scheduleDate);
                        setOrderForm({
                          customerType: 'existing',
                          customerId: '',
                          customerName: '',
                          deliveryTime: '',
                          deliveryMethod: '',
                          trip: '',
                          items: [{ productId: '', quantity: 10, unit: '斤' }],
                          note: '',
                          date: scheduleDate
                        });
                        setEditingOrderId(null);
                        setIsAddingOrder(true);
                      }}
                      className="px-3 py-1 bg-morandi-blue text-white text-xs font-bold rounded-full shadow-sm flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> 臨時加單
                    </button>
                    <button 
                      onClick={async () => {
                        if (isOrderReorderMode) {
                          // Save reordered orders to cloud
                          if (reorderedOrderIds.size > 0) {
                            const ordersToSync = orders.filter(o => reorderedOrderIds.has(o.id));
                            ordersToSync.forEach(order => {
                              saveOrderToCloud(order, 'updateOrderContent', order.lastUpdated, () => {
                                setOrders((prev: Order[]) => prev.map(o => o.id === order.id ? { ...o, syncStatus: 'synced', pendingAction: undefined } : o));
                              }, (errMsg: string) => {
                                setOrders((prev: Order[]) => prev.map(o => o.id === order.id ? { ...o, syncStatus: 'error', errorMessage: errMsg } : o));
                              });
                            });
                            setReorderedOrderIds(new Set());
                            addToast('排序已儲存', 'success');
                          }
                        }
                        setIsOrderReorderMode(!isOrderReorderMode);
                      }}
                      className={`px-3 py-1 text-xs font-bold rounded-full shadow-sm flex items-center gap-1 transition-colors ${isOrderReorderMode ? 'bg-rose-500 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                    >
                      {isOrderReorderMode ? <CheckSquare className="w-3 h-3" /> : <GripVertical className="w-3 h-3" />}
                      {isOrderReorderMode ? '完成排序' : '調整排序'}
                    </button>
                  </div>
                </div>
                
                {(() => {
                  const groupedByTrip = availableTrips.reduce((acc, trip) => {
                    acc[trip] = [];
                    return acc;
                  }, {} as Record<string, Order[]>);

                  scheduleOrders.forEach(order => {
                    const trip = order.trip || '未分配';
                    if (!groupedByTrip[trip]) groupedByTrip[trip] = [];
                    groupedByTrip[trip].push(order);
                  });

                  const sortedTrips = Object.keys(groupedByTrip).sort((a, b) => {
                    const indexA = availableTrips.indexOf(a);
                    const indexB = availableTrips.indexOf(b);
                    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                    if (indexA !== -1) return -1;
                    if (indexB !== -1) return 1;
                    return a.localeCompare(b);
                  });

                  return sortedTrips.map(trip => {
                    const tripOrders = groupedByTrip[trip].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
                    const summary = getTripSummary(tripOrders);
                    
                    const colorClasses = [
                      'bg-blue-50 text-blue-600 border-blue-100',
                      'bg-indigo-50 text-indigo-600 border-indigo-100',
                      'bg-emerald-50 text-emerald-600 border-emerald-100',
                      'bg-amber-50 text-amber-600 border-amber-100',
                      'bg-rose-50 text-rose-600 border-rose-100',
                      'bg-purple-50 text-purple-600 border-purple-100',
                    ];
                    
                    let headerColor = trip === '未分配' ? 'bg-gray-100 text-gray-600 border-gray-200' : colorClasses[availableTrips.indexOf(trip) % colorClasses.length];

                    return (
                      <div key={trip} className="bg-gray-50 rounded-2xl p-3 border border-gray-100">
                        <div className={`flex justify-between items-center mb-3 px-3 py-2 rounded-xl border ${headerColor}`}>
                          <h4 className="text-sm font-bold flex items-center gap-2">
                            {trip}
                            <span className="text-xs font-normal bg-white/50 px-2 py-0.5 rounded-full">{tripOrders.length}</span>
                            
                            {/* 新增：Google 導航按鈕 */}
                            {tripOrders.length > 0 && (
                              <button 
                                onClick={() => handleNavigateTrip(tripOrders)} 
                                className="ml-2 p-1.5 bg-blue-500 text-white hover:bg-blue-600 rounded-full shadow-sm transition-all flex items-center gap-1"
                                title="Google 路線導航"
                              >
                                <Navigation className="w-3.5 h-3.5" />
                                <span className="text-[10px] font-bold pr-1">導航</span>
                              </button>
                            )}

                            {/* 下面是你原本的刪除趟數按鈕 */}
                            {trip !== '未分配' && (
                              <button onClick={() => handleDeleteTrip(trip)} className="ml-1 p-1 text-current opacity-50 hover:opacity-100 hover:bg-white/50 rounded-full transition-all">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </h4>
                          {trip !== '未分配' && (
                            <div className="text-right">
                              <div className="text-[10px] font-bold opacity-70">總重: {summary.totalWeight}斤 / 數量: {summary.totalQuantity}</div>
                              <div className="text-xs font-bold">金額: ${summary.totalAmount.toLocaleString()}</div>
                            </div>
                          )}
                        </div>
                        
                        {isOrderReorderMode ? (
                          <Reorder.Group 
                            axis="y" 
                            values={tripOrders} 
                            onReorder={(newOrderList) => {
                              const newSet = new Set(reorderedOrderIds);
                              const updatedOrders = orders.map(o => {
                                const index = newOrderList.findIndex(no => no.id === o.id);
                                if (index !== -1) {
                                  const newSortOrder = index * 10;
                                  if (o.sortOrder !== newSortOrder) {
                                    newSet.add(o.id);
                                    return { ...o, sortOrder: newSortOrder, syncStatus: 'pending' as const, pendingAction: 'update' as const };
                                  }
                                }
                                return o;
                              });
                              setReorderedOrderIds(newSet);
                              setOrders(updatedOrders);
                            }}
                            className="space-y-3"
                          >
                            {tripOrders.map((order) => (
                              <Reorder.Item key={order.id} value={order} className="relative">
                                <div className="flex items-center gap-2">
                                  <div className="cursor-grab active:cursor-grabbing p-2">
                                    <GripVertical className="w-5 h-5 text-gray-400" />
                                  </div>
                                  <div className="flex-1 pointer-events-none">
                                    <ScheduleOrderCard 
                                      order={order}
                                      products={products}
                                      customers={customers}
                                      isSelectionMode={isSelectionMode}
                                      isSelected={selectedOrderIds.has(order.id)}
                                      onToggleSelection={() => { const newSet = new Set(selectedOrderIds); if (newSet.has(order.id)) newSet.delete(order.id); else newSet.add(order.id); setSelectedOrderIds(newSet); }}
                                      onStatusChange={handleSwipeStatusChange}
                                      onShare={handleShareOrder}
                                      onMap={openGoogleMaps}
                                    />
                                  </div>
                                </div>
                              </Reorder.Item>
                            ))}
                          </Reorder.Group>
                        ) : (
                          <div className="space-y-3">
                            {tripOrders.map((order) => (
                              <div key={order.id} className="relative">
                                <ScheduleOrderCard 
                                  order={order}
                                  products={products}
                                  customers={customers}
                                  isSelectionMode={isSelectionMode}
                                  isSelected={selectedOrderIds.has(order.id)}
                                  onToggleSelection={() => { const newSet = new Set(selectedOrderIds); if (newSet.has(order.id)) newSet.delete(order.id); else newSet.add(order.id); setSelectedOrderIds(newSet); }}
                                  onStatusChange={handleSwipeStatusChange}
                                  onShare={handleShareOrder}
                                  onMap={openGoogleMaps}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
                
                {scheduleOrders.length === 0 && (
                  <div className="text-center py-10"><p className="text-gray-300 font-bold text-sm tracking-wide">本日無配送行程</p></div>
                )}
              </div>
              </div>
           </motion.div>
        )}
        {/* ... (Finance and Work Tabs remain unchanged - they are inside ActiveTab blocks already provided in context, just ensuring closing structure) ... */}
        {activeTab === 'finance' && (
           <motion.div key="finance" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0, zIndex: 10 }} exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }} transition={{ duration: 0.2 }} className="space-y-6 relative">
             <div className="px-1">
               <div className="flex justify-between items-center mb-4">
                 <h2 className="text-xl font-extrabold text-morandi-charcoal flex items-center gap-2 tracking-tight"><Wallet className="w-5 h-5 text-morandi-blue" /> 帳務總覽</h2>
                 <motion.button 
                   whileTap={buttonTap} 
                   whileHover={buttonHover} 
                   onClick={() => { 
                     setEditingOrderId(null); 
                     setOrderForm({
                       customerType: 'existing',
                       customerId: '',
                       customerName: '',
                       deliveryTime: '',
                       deliveryMethod: '',
                       trip: '',
                       items: [{ productId: '', quantity: 10, unit: '斤' }],
                       note: '',
                       date: selectedDate
                     });
                     setIsAddingOrder(true); 
                   }} 
                   className="p-2.5 rounded-2xl text-white shadow-lg bg-morandi-blue hover:bg-slate-600 transition-colors flex items-center gap-1.5"
                 >
                   <Plus className="w-5 h-5" />
                   <span className="text-xs font-bold">建立訂單</span>
                 </motion.button>
               </div>
               
               {/* Revenue Overview Cards */}
               <div className="grid grid-cols-2 gap-3 mb-6">
                 <div className="bg-morandi-charcoal rounded-[24px] p-5 shadow-lg text-white relative overflow-hidden">
                   <div className="absolute right-[-10px] top-[-10px] opacity-10"><DollarSign className="w-24 h-24" /></div>
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">未結總金額</p>
                   <h3 className="text-2xl font-black text-white tracking-tight">${financeData.grandTotalDebt.toLocaleString()}</h3>
                 </div>
                 <div className="bg-emerald-500 rounded-[24px] p-5 shadow-lg text-white relative overflow-hidden">
                   <div className="absolute right-[-10px] top-[-10px] opacity-10"><CheckCircle2 className="w-24 h-24" /></div>
                   <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest mb-1">本月已收帳款</p>
                   <h3 className="text-2xl font-black text-white tracking-tight">${financeData.thisMonthCollected.toLocaleString()}</h3>
                   <p className="text-[9px] text-emerald-100 mt-1 font-medium tracking-wide">佔本月營收 {financeData.thisMonthRevenue > 0 ? Math.round((financeData.thisMonthCollected / financeData.thisMonthRevenue) * 100) : 0}%</p>
                 </div>
               </div>

               <div className="space-y-4">
                 <div className="flex justify-between items-center px-2">
                   <h3 className="text-xs font-bold text-morandi-pebble uppercase tracking-widest flex items-center gap-2"><ListChecks className="w-4 h-4" /> 欠款客戶列表</h3>
                 </div>
                 
                 {/* Aging Filters */}
                 <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar px-2 -mx-2">
                   <button onClick={() => setFinanceFilter('all')} className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all border ${financeFilter === 'all' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-400 border-gray-200'}`}>全部</button>
                   <button onClick={() => setFinanceFilter('thisMonth')} className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all border ${financeFilter === 'thisMonth' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-400 border-gray-200'}`}>本月新增</button>
                   <button onClick={() => setFinanceFilter('over30')} className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all border ${financeFilter === 'over30' ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-gray-400 border-gray-200'}`}>逾期 30 天</button>
                   <button onClick={() => setFinanceFilter('over60')} className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all border ${financeFilter === 'over60' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-gray-400 border-gray-200'}`}>逾期 60 天</button>
                 </div>

                 <motion.div variants={containerVariants} initial="hidden" animate="show">
                   {financeData.outstanding.length > 0 ? (
                     financeData.outstanding
                       .filter(item => {
                         if (financeFilter === 'all') return true;
                         if (financeFilter === 'thisMonth') return item.agingDays <= 30;
                         if (financeFilter === 'over30') return item.agingDays > 30;
                         if (financeFilter === 'over60') return item.agingDays > 60;
                         return true;
                       })
                       .map((item, idx) => (
                       <motion.div variants={itemVariants} key={idx} className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-200 mb-3 relative overflow-hidden">
                         <div className="flex justify-between items-start mb-4 relative z-10">
                           <div className="flex items-center gap-3">
                             <div className="w-12 h-12 rounded-[16px] bg-rose-50 flex items-center justify-center text-rose-400 font-extrabold text-xl">{String(item.name || '').charAt(0)}</div>
                             <div>
                               <h4 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                 {item.name}
                                 {item.agingDays > 60 ? (
                                   <span className="text-[9px] bg-rose-600 text-white px-1.5 py-0.5 rounded-md font-bold">⚠️ 逾期 60 天</span>
                                 ) : item.agingDays > 30 ? (
                                   <span className="text-[9px] bg-rose-500 text-white px-1.5 py-0.5 rounded-md font-bold">⚠️ 逾期 30 天</span>
                                 ) : null}
                               </h4>
                               <p className="text-xs text-rose-400 font-bold bg-rose-50 inline-block px-1.5 rounded mt-0.5">{item.count} 筆未結</p>
                             </div>
                           </div>
                           <div className="flex items-start gap-2">
                             <div className="text-right">
                               <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">應收金額</p>
                               <p className="text-2xl font-black text-morandi-charcoal tracking-tight">${item.totalDebt.toLocaleString()}</p>
                             </div>
                             <button
                               onClick={() => setActionMenuTarget(item)}
                               className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors -mt-1 -mr-1"
                             >
                               <MoreVertical className="w-5 h-5" />
                             </button>
                           </div>
                         </div>
                         <div className="relative z-10 pt-2 border-t border-gray-100">
                           <button onClick={() => {
                             setPartialSettlementTarget({ name: item.name, orders: item.orders });
                             setSelectedPartialOrderIds(new Set(item.orders.map(o => o.id)));
                           }} className="w-full py-3 rounded-xl bg-blue-50 text-blue-600 font-bold text-sm flex items-center justify-center gap-2 hover:bg-blue-100 transition-colors"><ListChecks className="w-4 h-4" /> 查看明細 / 部分結帳</button>
                         </div>
                       </motion.div>
                     ))
                   ) : (
                     <div className="text-center py-10">
                       <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle2 className="w-8 h-8 text-emerald-400" /></div>
                       <p className="text-gray-400 font-bold text-sm">目前沒有未結款項</p>
                       <p className="text-xs text-gray-300 mt-1">所有配送單皆已完成收款</p>
                     </div>
                   )}
                 </motion.div>
               </div>
             </div>
           </motion.div>
        )}
        
        {activeTab === 'work' && (
           <motion.div key="work" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0, zIndex: 10 }} exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }} transition={{ duration: 0.2 }} className="space-y-6 relative">
             <div className="px-1"><div className="flex items-center gap-2 mb-4"><button onClick={() => setActiveTab('orders')} className="p-2 bg-white rounded-xl shadow-sm border border-slate-200 text-morandi-pebble"><ChevronLeft className="w-5 h-5"/></button><h2 className="text-xl font-extrabold text-morandi-charcoal tracking-tight">工作小抄</h2></div>
              <div className="space-y-3 mb-4"><div className="relative"><Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" /><input type="text" placeholder="篩選特定店家..." className="w-full pl-12 pr-6 py-4 bg-white rounded-[24px] border border-slate-100 shadow-sm text-slate-800 font-bold tracking-wide focus:ring-2 focus:ring-morandi-blue transition-all placeholder:text-gray-300 text-sm" value={workCustomerFilter} onChange={(e) => setWorkCustomerFilter(e.target.value)} />{workCustomerFilter && <button onClick={() => setWorkCustomerFilter('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X className="w-4 h-4" /></button>}</div>
              <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar mb-2"><button onClick={() => setWorkDeliveryMethodFilter([])} className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${workDeliveryMethodFilter.length === 0 ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-400 border-gray-200'}`}>全部方式</button>{DELIVERY_METHODS.map(m => { const isSelected = workDeliveryMethodFilter.includes(m); return (<button key={m} onClick={() => { if (isSelected) { setWorkDeliveryMethodFilter(workDeliveryMethodFilter.filter(x => x !== m)); } else { setWorkDeliveryMethodFilter([...workDeliveryMethodFilter, m]); } }} className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${isSelected ? 'text-white border-transparent' : 'bg-white text-gray-400 border-gray-200'}`} style={{ backgroundColor: isSelected ? COLORS.primary : '' }}>{m}</button>); })}</div>
              {/* 麵種進階篩選區塊 (觸發按鈕) */}
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => setIsProductFilterOpen(true)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-1 ${
                    workProductFilter.size > 0
                      ? 'bg-morandi-blue/10 text-morandi-blue border-morandi-blue/20'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {workProductFilter.size > 0 ? `🍜 已選 ${workProductFilter.size} 種麵 ▾` : '🍜 篩選麵種 ▾'}
                </button>
                {workProductFilter.size > 0 && (
                  <button
                    onClick={() => setWorkProductFilter(new Set())}
                    className="text-xs text-morandi-pebble font-bold px-2 py-1 rounded-md transition-colors hover:text-slate-600 hover:bg-slate-100"
                  >
                    清除全部
                  </button>
                )}
              </div>
              </div>
              <div className="mb-6"><WorkCalendar selectedDate={workDates} onSelect={setWorkDates} orders={orders} /></div>
              
              <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                      <h3 className="text-xs font-bold text-morandi-pebble uppercase tracking-widest flex items-center gap-2"><ListChecks className="w-4 h-4" /> 生產總表 [{workDates.length}天]</h3>
                      <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-gray-300 tracking-wide">{workSheetData.reduce((sum, g) => sum + g.items.length, 0)} 種品項</span>
                          <motion.button whileTap={buttonTap} onClick={handlePrint} className="bg-slate-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-slate-800 transition-colors shadow-sm active:scale-95"><Printer className="w-3.5 h-3.5" /> 列印 / 匯出 PDF</motion.button>
                      </div>
                  </div>
                  
                  <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
                      {workSheetData.length > 0 ? (
                          workSheetData.map((group) => {
                              const isCollapsed = collapsedWorkGroups.has(group.id);
                              
                              return (
                                  <motion.section variants={itemVariants} key={group.id} className="bg-white rounded-[24px] overflow-hidden border border-slate-200 shadow-sm">
                                      {/* Group Header */}
                                      <div 
                                          onClick={() => {
                                              const newSet = new Set(collapsedWorkGroups);
                                              if (newSet.has(group.id)) newSet.delete(group.id);
                                              else newSet.add(group.id);
                                              setCollapsedWorkGroups(newSet);
                                          }}
                                          className="px-5 py-4 flex justify-between items-center cursor-pointer transition-colors hover:bg-opacity-80 active:scale-[0.99]"
                                          style={{ backgroundColor: group.color + '40' }} // 25% opacity using hex code
                                      >
                                          <h3 className="font-extrabold text-slate-800 flex items-center gap-3 text-lg">
                                              <span className="w-3 h-3 rounded-full shadow-sm" style={{ background: group.color, border: '1px solid rgba(0,0,0,0.1)' }}></span>
                                              {group.label}
                                          </h3>
                                          <div className="flex items-center gap-3">
                                              <span className="text-xs font-black text-slate-600 bg-white/60 px-2 py-1 rounded-lg">共 {Math.round(group.totalWeight * 10) / 10} 單位</span>
                                              {isCollapsed ? <ChevronDown className="w-5 h-5 text-slate-500" /> : <ChevronUp className="w-5 h-5 text-slate-500" />}
                                          </div>
                                      </div>

                                      {/* Items List */}
                                      <AnimatePresence>
                                          {!isCollapsed && (
                                              <motion.div 
                                                  key={`group-${group.id}`}
                                                  initial={{ height: 0, opacity: 0 }} 
                                                  animate={{ height: 'auto', opacity: 1 }} 
                                                  exit={{ height: 0, opacity: 0 }} 
                                                  className="divide-y divide-gray-100"
                                              >
                                                  {group.items.map((item, idx) => {
                                                      const itemKey = `${group.id}-${item.name}-${item.unit}`;
                                                      const isCompleted = completedWorkItems.has(itemKey);

                                                      return (
                                                          <div 
                                                              key={idx} 
                                                              onClick={() => {
                                                                  const newSet = new Set(completedWorkItems);
                                                                  if (newSet.has(itemKey)) newSet.delete(itemKey);
                                                                  else newSet.add(itemKey);
                                                                  setCompletedWorkItems(newSet);
                                                                  triggerHaptic(5);
                                                              }}
                                                              className={`p-5 transition-all cursor-pointer select-none ${isCompleted ? 'bg-gray-50' : 'hover:bg-gray-50/50'}`}
                                                          >
                                                              <div className="flex justify-between items-center mb-2">
                                                                  <div className="flex items-center gap-3">
                                                                      <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isCompleted ? 'bg-slate-400 border-slate-400' : 'bg-white border-slate-300'}`}>
                                                                          {isCompleted && <CheckSquare className="w-3.5 h-3.5 text-white" />}
                                                                      </div>
                                                                      <span className={`font-bold text-lg transition-all ${isCompleted ? 'text-gray-400 line-through decoration-2 decoration-gray-300' : 'text-slate-800'}`}>{item.name}</span>
                                                                  </div>
                                                                  <div className={`text-right transition-all ${isCompleted ? 'opacity-40' : 'opacity-100'}`}>
                                                                      <span className="font-black text-3xl text-slate-800 tracking-tight">{item.totalQty}</span>
                                                                      <span className="text-xs text-gray-400 font-bold ml-1">{item.unit}</span>
                                                                  </div>
                                                              </div>
                                                              
                                                              {/* Details */}
                                                              {!isCompleted && (
                                                                  <div className="pl-8 flex flex-wrap gap-2 mt-3">
                                                                      {item.details.map((detail, dIdx) => (
                                                                          <span key={dIdx} className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600 shadow-sm flex items-center gap-1">
                                                                              <span className="font-bold">{detail.customerName}</span>
                                                                              <span className="bg-slate-100 px-1.5 rounded text-[10px] font-black text-slate-500">{detail.qty}</span>
                                                                          </span>
                                                                      ))}
                                                                  </div>
                                                              )}
                                                          </div>
                                                      );
                                                  })}
                                              </motion.div>
                                          )}
                                      </AnimatePresence>
                                  </motion.section>
                              );
                          })
                      ) : (
                          <div className="text-center py-10">
                              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                  <WifiOff className="w-8 h-8 text-gray-300" />
                              </div>
                              <p className="text-gray-300 font-bold text-sm tracking-wide">所選日期無生產需求</p>
                              <p className="text-xs text-gray-200 mt-1">請選擇其他日期或調整篩選條件</p>
                          </div>
                      )}
                  </motion.div>
              </div>
             </div>
           </motion.div>
        )}
        </AnimatePresence>

        {/* 麵種篩選 Bottom Sheet */}
        <AnimatePresence>
          {isProductFilterOpen && (
            <div className="fixed inset-0 z-[100] flex flex-col justify-end">
              {/* 半透明遮罩 */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsProductFilterOpen(false)}
                className="absolute inset-0 bg-black/40"
              />
              
              {/* 視窗本體 */}
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="relative w-full bg-white rounded-t-[32px] max-h-[85vh] flex flex-col shadow-2xl"
              >
                {/* 視窗頭部 */}
                <div className="flex-shrink-0 pb-2">
                  <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mt-3 mb-4" />
                  <div className="flex items-center justify-between px-6">
                    <h3 className="text-lg font-extrabold text-slate-800">選擇麵種</h3>
                    <button 
                      onClick={() => setIsProductFilterOpen(false)}
                      className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* 視窗內容區 */}
                <div className="overflow-y-auto p-5 space-y-3 custom-scrollbar">
                  {PRODUCT_CATEGORIES.map(cat => {
                    const catProducts = products.filter(p => (p.category || 'other') === cat.id);
                    if (catProducts.length === 0) return null;
                    
                    const isExpanded = expandedFilterCats.has(cat.id);
                    const selectedCount = catProducts.filter(p => workProductFilter.has(p.id)).length;
                    const isAllSelected = selectedCount === catProducts.length && catProducts.length > 0;
                    const hasSelection = selectedCount > 0;

                    return (
                      <div key={cat.id} className={`bg-white rounded-[20px] border transition-colors overflow-hidden ${hasSelection ? 'border-morandi-blue/30 bg-blue-50/10' : 'border-slate-200'}`}>
                        <div 
                          className="flex items-center justify-between p-4 min-h-[56px] cursor-pointer hover:bg-slate-50 transition-colors"
                          onClick={() => {
                            const newExpanded = new Set(expandedFilterCats);
                            if (isExpanded) newExpanded.delete(cat.id);
                            else newExpanded.add(cat.id);
                            setExpandedFilterCats(newExpanded);
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-4 h-4 rounded-full" style={{ backgroundColor: cat.color, border: '1px solid rgba(0,0,0,0.1)' }}></span>
                            <span className="font-bold text-base text-slate-700">{cat.label}</span>
                            {selectedCount > 0 && (
                              <span className="bg-morandi-blue text-white text-xs px-2.5 py-0.5 rounded-full font-bold">
                                已選 {selectedCount}
                              </span>
                            )}
                          </div>
                          <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                        
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }} 
                              animate={{ height: 'auto', opacity: 1 }} 
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="p-4 pt-0 border-t border-slate-100 bg-slate-50/50 flex flex-wrap gap-2.5">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newFilter = new Set(workProductFilter);
                                    if (isAllSelected) {
                                      catProducts.forEach(p => newFilter.delete(p.id));
                                    } else {
                                      catProducts.forEach(p => newFilter.add(p.id));
                                    }
                                    setWorkProductFilter(newFilter);
                                  }}
                                  className={`px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-bold transition-all border ${isAllSelected ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                                >
                                  {isAllSelected ? '取消全選' : '全選此類'}
                                </button>
                                
                                {catProducts.map(p => {
                                  const isSelected = workProductFilter.has(p.id);
                                  return (
                                    <button
                                      key={p.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const newFilter = new Set(workProductFilter);
                                        if (isSelected) newFilter.delete(p.id);
                                        else newFilter.add(p.id);
                                        setWorkProductFilter(newFilter);
                                      }}
                                      className={`px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-bold transition-all border flex items-center gap-1.5 ${isSelected ? 'bg-morandi-blue text-white border-morandi-blue shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-morandi-blue/50'}`}
                                    >
                                      {isSelected && <Check className="w-4 h-4" />}
                                      {p.name}
                                    </button>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>

                {/* 視窗底部 */}
                <div className="flex-shrink-0 sticky bottom-0 bg-white p-5 border-t border-gray-100 rounded-b-[32px]">
                  <button
                    onClick={() => setIsProductFilterOpen(false)}
                    className="w-full py-4 bg-morandi-blue text-white rounded-2xl font-bold text-lg shadow-lg shadow-morandi-blue/30 hover:bg-slate-600 active:scale-[0.98] transition-all"
                  >
                    查看結果
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </main>
      
      {/* ... (Modals code remains same - ConfirmModal, HolidayCalendar, DatePickerModal, SettingsModal, QuickAdd, etc.) ... */}
      
      {/* (Modal closing tags are here in original code) */}
      <ConfirmModal isOpen={confirmConfig.isOpen} title={confirmConfig.title} message={confirmConfig.message} onConfirm={confirmConfig.onConfirm} onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))} />
      {holidayEditorId && (<HolidayCalendar storeName={isEditingCustomer ? (customerForm.name || '') : ''} holidays={customerForm.holidayDates || []} offDays={customerForm.offDays || []} onToggle={(date) => { const current = customerForm.holidayDates || []; const newHolidays = current.includes(date) ? current.filter(d => d !== date) : [...current, date]; setCustomerForm({...customerForm, holidayDates: newHolidays}); }} onClose={() => setHolidayEditorId(null)} />)}
      
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
                  // 2. 補上 originalLastUpdated
                  const payload = { ...updatedCustomer, originalLastUpdated: originalCustomer.lastUpdated };
                  const res = await fetch(apiEndpoint, {
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
      <AnimatePresence>{isSettingsOpen && (<SettingsModal onClose={() => setIsSettingsOpen(false)} onSync={syncData} onSavePassword={handleChangePassword} currentUrl={apiEndpoint} onSaveUrl={handleSaveApiUrl} />)}</AnimatePresence>
      <AnimatePresence>{quickAddData && (<div key="quick-add-modal" className="fixed inset-0 bg-morandi-charcoal/40 z-[70] flex flex-col items-center justify-center p-4 backdrop-blur-sm"><motion.div variants={modalVariants} initial="hidden" animate="visible" exit="exit" className="bg-white w-full max-w-sm max-h-[85vh] flex flex-col rounded-[32px] overflow-hidden shadow-xl border border-slate-200"><div className="p-5 bg-morandi-oatmeal/30 border-b border-gray-100 flex-shrink-0"><h3 className="text-center font-extrabold text-morandi-charcoal text-lg">追加訂單</h3><p className="text-center text-xs text-morandi-pebble font-bold tracking-wide mt-1">{quickAddData.customerName}</p></div><div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar"><AnimatePresence initial={false}>{quickAddData.items.map((item, index) => (<motion.div key={index} initial={{ opacity: 0, height: 0, scale: 0.95 }} animate={{ opacity: 1, height: 'auto', scale: 1 }} exit={{ opacity: 0, height: 0, scale: 0.9 }} className="bg-white rounded-[20px] p-3 shadow-sm border border-slate-100 flex flex-wrap gap-2 items-center"><div className="flex-1 min-w-[120px]"><div onClick={() => { const currentCustomer = customers.find(c => c.name === quickAddData.customerName); setPickerConfig({ isOpen: true, currentProductId: item.productId, customPrices: currentCustomer?.priceList, onSelect: (pid) => { const newItems = [...quickAddData.items]; const p = products.find(x => x.id === pid); newItems[index] = { ...item, productId: pid, unit: p?.unit || '斤' }; setQuickAddData({...quickAddData, items: newItems}); } }); }} className="w-full bg-morandi-oatmeal/50 p-3 rounded-xl font-bold text-sm text-morandi-charcoal border border-slate-200 flex items-center justify-between cursor-pointer hover:border-morandi-blue transition-all"><span className={item.productId ? 'text-slate-800' : 'text-gray-400'}>{products.find(p => p.id === item.productId)?.name || '選擇品項...'}</span><ChevronDown className="w-4 h-4 text-gray-400" /></div></div><div className="w-20"><input type="number" min="0" onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} placeholder="數量" className="w-full bg-morandi-oatmeal/50 p-3 rounded-xl text-center font-black text-lg text-morandi-charcoal border border-slate-200 outline-none focus:ring-2 focus:ring-morandi-blue transition-all" value={item.quantity === 0 ? '' : item.quantity} onChange={(e) => { const newItems = [...quickAddData.items]; const val = parseFloat(e.target.value); newItems[index].quantity = isNaN(val) ? 0 : Math.max(0, val); setQuickAddData({...quickAddData, items: newItems}); }} /></div><div className="w-20"><select value={item.unit || '斤'} onChange={(e) => { const newItems = [...quickAddData.items]; newItems[index].unit = e.target.value; setQuickAddData({...quickAddData, items: newItems}); }} className="w-full bg-morandi-oatmeal/50 p-3 rounded-xl font-bold text-morandi-charcoal border border-slate-100 outline-none focus:ring-2 focus:ring-morandi-blue transition-all">{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></div><button onClick={() => { const newItems = quickAddData.items.filter((_, i) => i !== index); setQuickAddData({...quickAddData, items: newItems}); }} className="p-3 bg-rose-50 text-rose-400 hover:text-rose-600 rounded-xl transition-colors"><Trash2 className="w-4 h-4" /></button></motion.div>))}</AnimatePresence><motion.button whileTap={buttonTap} onClick={() => setQuickAddData({...quickAddData, items: [...quickAddData.items, {productId: '', quantity: 10, unit: '斤'}]})} className="w-full py-3 rounded-[16px] border-2 border-dashed border-morandi-blue/30 text-morandi-blue font-bold text-sm flex items-center justify-center gap-2 hover:bg-morandi-blue/5 transition-colors tracking-wide mt-2"><Plus className="w-4 h-4" /> 增加品項</motion.button></div><div className="p-5 bg-white border-t border-gray-100 flex-shrink-0 space-y-4"><AnimatePresence>{(() => { const preview = getQuickAddPricePreview(); if (preview && preview.total > 0) { return (<motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-morandi-amber-bg p-4 rounded-xl border border-amber-100 flex justify-between items-center"><div className="flex flex-col"><span className="text-[10px] font-bold text-morandi-amber-text/70 uppercase tracking-widest">預估總金額</span><span className="text-xs font-medium text-morandi-amber-text/60 mt-0.5 tracking-wide">共 {preview.itemCount} 個品項</span></div><span className="text-2xl font-black text-morandi-amber-text tracking-tight">${preview.total.toLocaleString()}</span></motion.div>); } return null; })()}</AnimatePresence><div className="flex gap-2"><motion.button whileTap={buttonTap} onClick={() => setQuickAddData(null)} className="flex-1 py-3 rounded-[16px] font-bold text-morandi-pebble hover:bg-gray-50 transition-colors border border-slate-200">取消</motion.button><motion.button whileTap={buttonTap} onClick={handleQuickAddSubmit} className="flex-1 py-3 rounded-[16px] font-bold text-white shadow-md bg-morandi-blue hover:bg-slate-600">確認追加</motion.button></div></div></motion.div></div>)}</AnimatePresence>
      <AnimatePresence>
      {isAddingOrder && (
        <motion.div key="order-modal" className="fixed inset-0 bg-morandi-oatmeal z-[60] flex flex-col">
          <motion.div initial={{ opacity: 0, y: "100%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="flex flex-col h-full">
          <div className="bg-white p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 z-10"><motion.button whileTap={buttonTap} onClick={() => { setIsAddingOrder(false); setEditingOrderId(null); }} className="p-2 rounded-2xl bg-gray-50 text-morandi-pebble"><X className="w-6 h-6" /></motion.button><h2 className="text-lg font-extrabold text-morandi-charcoal tracking-tight">{editingOrderId ? `編輯訂單 - ${orderForm.customerName}` : '建立配送訂單'}</h2><motion.button whileTap={buttonTap} onClick={handleSaveOrder} disabled={isSaving} className="font-bold px-4 py-2 transition-colors text-morandi-blue disabled:text-gray-300">{isSaving ? '儲存中...' : (editingOrderId ? '更新訂單' : '儲存')}</motion.button></div>
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
             <div className="space-y-4"><div className="flex justify-between items-center"><label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">品項明細</label><div className="flex gap-2">{lastOrderCandidate && (<motion.button whileTap={buttonTap} onClick={applyLastOrder} className="text-[10px] font-bold text-white bg-morandi-blue px-2 py-1 rounded-lg shadow-sm flex items-center gap-1"><History className="w-3 h-3" /> 帶入{lastOrderCandidate.sourceLabel || '上次'} ({lastOrderCandidate.date})</motion.button>)}<button onClick={() => handleOrderFormChange('items', [...orderForm.items, {productId: '', quantity: 10, unit: '斤'}])} className="text-[10px] font-bold text-morandi-blue tracking-wide"><Plus className="w-3 h-3 inline mr-1" /> 增加品項</button></div></div>{orderForm.items.map((item, idx) => (<motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} key={idx} className="bg-white p-5 rounded-[28px] shadow-sm border border-slate-200 flex items-center gap-2 flex-wrap"><div onClick={() => { const currentCustomer = customers.find(c => c.id === orderForm.customerId); setPickerConfig({ isOpen: true, currentProductId: item.productId, customPrices: currentCustomer?.priceList, onSelect: (pid) => { const n = [...orderForm.items]; const p = products.find(x => x.id === pid); n[idx] = { ...item, productId: pid, unit: p?.unit || '斤' }; handleOrderFormChange('items', n); } }); }} className="w-full sm:flex-1 bg-morandi-oatmeal/50 p-4 rounded-xl text-sm font-bold border border-slate-100 flex items-center justify-between cursor-pointer hover:border-morandi-blue transition-all mb-2 sm:mb-0"><span className={item.productId ? 'text-morandi-charcoal' : 'text-gray-400'}>{products.find(p => p.id === item.productId)?.name || '選擇品項...'}</span><ChevronDown className="w-4 h-4 text-gray-400" /></div><div className="flex items-center gap-2 w-full sm:w-auto justify-between"><input type="number" min="0" onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} className="w-20 bg-morandi-oatmeal/50 p-4 rounded-xl text-center font-bold border border-slate-100 text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" value={item.quantity === 0 ? '' : item.quantity} onChange={(e) => { const n = [...orderForm.items]; const val = parseFloat(e.target.value); n[idx].quantity = isNaN(val) ? 0 : Math.max(0, val); handleOrderFormChange('items', n); }} /><select value={item.unit || '斤'} onChange={(e) => { const n = [...orderForm.items]; n[idx].unit = e.target.value; handleOrderFormChange('items', n); }} className="w-20 bg-morandi-oatmeal/50 p-4 rounded-xl font-bold text-morandi-charcoal border border-slate-100 outline-none focus:ring-2 focus:ring-morandi-blue transition-all">{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select><motion.button whileTap={buttonTap} onClick={() => { const n = orderForm.items.filter((_, i) => i !== idx); handleOrderFormChange('items', n.length ? n : [{productId:'', quantity:10, unit:'斤'}]); }} className="p-2 text-morandi-pink hover:text-rose-300 transition-colors"><Trash2 className="w-4 h-4" /></motion.button></div></motion.div>))}</div>
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
          <div className="bg-white p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 z-10"><motion.button whileTap={buttonTap} onClick={() => { setIsEditingCustomer(null); setEditCustomerMode('full'); }} className="p-2 rounded-2xl bg-gray-50"><X className="w-6 h-6 text-morandi-pebble" /></motion.button><h2 className="text-lg font-extrabold text-morandi-charcoal tracking-tight">{editCustomerMode === 'itemsOnly' ? '修改預設品項' : editCustomerMode === 'holidayOnly' ? '設定公休' : '店家詳細資料'}</h2><motion.button whileTap={buttonTap} onClick={handleSaveCustomer} disabled={isSaving} className="font-bold px-4 py-2 transition-colors text-morandi-blue disabled:text-gray-300">{isSaving ? '儲存中...' : '儲存'}</motion.button></div>
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
                           <div onClick={() => setPickerConfig({ isOpen: true, currentProductId: item.productId, customPrices: customerForm.priceList, onSelect: (pid) => { const newItems = [...(customerForm.defaultItems || [])]; const p = products.find(x => x.id === pid); newItems[idx] = { ...item, productId: pid, unit: p?.unit || '斤' }; setCustomerForm({...customerForm, defaultItems: newItems}); } })} className="flex-1 bg-morandi-oatmeal/50 p-3 rounded-xl font-bold text-sm text-morandi-charcoal border border-slate-200 flex items-center justify-between cursor-pointer hover:border-morandi-blue transition-all">
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

      <AnimatePresence>
      {isEditingProduct && (
         <motion.div key="product-modal" className="fixed inset-0 bg-morandi-oatmeal z-[60] flex flex-col">
           <motion.div initial={{ opacity: 0, y: "100%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="flex flex-col h-full">
           <div className="bg-white p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 z-10"><motion.button whileTap={buttonTap} onClick={() => setIsEditingProduct(null)} className="p-2 rounded-2xl bg-gray-50"><X className="w-6 h-6 text-morandi-pebble" /></motion.button><h2 className="text-lg font-extrabold text-morandi-charcoal tracking-tight">品項資料</h2><motion.button whileTap={buttonTap} onClick={handleSaveProduct} disabled={isSaving} className="font-bold px-4 py-2 transition-colors text-morandi-blue disabled:text-gray-300">完成儲存</motion.button></div>
           <div className="p-6 space-y-6">
              <div className="space-y-2"><label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">品項名稱</label><input type="text" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="例如：油麵 (小)" value={productForm.name || ''} onChange={(e) => setProductForm({...productForm, name: e.target.value})} /></div>
              <div className="space-y-2"><label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">分類</label><div className="flex flex-wrap gap-2 p-2 bg-white rounded-[24px] border border-slate-200">{PRODUCT_CATEGORIES.map(cat => (<button key={cat.id} onClick={() => setProductForm({...productForm, category: cat.id})} className={`px-4 py-2 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5 ${productForm.category === cat.id ? 'border-transparent shadow-sm' : 'bg-white text-gray-400 border-gray-200'}`} style={{ backgroundColor: productForm.category === cat.id ? cat.color : '', color: productForm.category === cat.id ? '#3E3C3A' : '' }}><span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: cat.color, border: '1px solid rgba(0,0,0,0.1)' }}></span>{cat.label}</button>))}</div></div>
              <div className="space-y-2"><label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">計算單位</label><input type="text" className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="例如：斤" value={productForm.unit || ''} onChange={(e) => setProductForm({...productForm, unit: e.target.value})} /></div>
              <div className="space-y-2"><label className="text-[10px] font-bold text-morandi-pebble uppercase tracking-widest px-2">預設單價</label><input type="number" min="0" onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} className="w-full p-5 bg-white rounded-[24px] shadow-sm border border-slate-200 font-bold text-morandi-charcoal outline-none focus:ring-2 focus:ring-morandi-blue transition-all" placeholder="例如：35" value={productForm.price === 0 ? '' : productForm.price} onChange={(e) => { const val = parseFloat(e.target.value); setProductForm({...productForm, price: isNaN(val) ? 0 : Math.max(0, val)}); }} /></div>
           </div>
           </motion.div>
         </motion.div>
      )}
      </AnimatePresence>

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
              {groupedOrders[selectedCustomerForModal].map(order => (
                <SwipeableOrderCard 
                  key={order.id}
                  order={order} 
                  products={products} 
                  customers={customers}
                  isSelectionMode={false}
                  isSelected={false}
                  onToggleSelection={() => {}}
                  onStatusChange={handleSwipeStatusChange}
                  onDelete={() => {
                    handleDeleteOrder(order.id);
                  }}
                  onShare={handleShareOrder}
                  onMap={openGoogleMaps}
                  onEdit={(orderToEdit) => {
                    handleEditOrder(orderToEdit);
                    setSelectedCustomerForModal(null);
                  }}
                  onRetry={handleRetryOrder}
                />
              ))}
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
          <motion.div key="bottom-drawer" className="fixed inset-0 z-[100] flex flex-col justify-end">
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
                    const res = await fetch(apiEndpoint, {
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