import { useState, useEffect, useCallback, useRef } from 'react';
import localforage from 'localforage';
import { debounce, throttle } from 'lodash';
import { Customer, Product, Order, OrderStatus, ToastType } from '../types';
import { GAS_URL as DEFAULT_GAS_URL } from '../constants';
import { formatDateStr, normalizeDate, safeNumber } from '../utils';
import { container } from '../core/di/AppContainer';
import { DataMapper } from '../core/mappers/DataMapper';
import DataWorker from '../workers/dataParser.worker.ts?worker';

localforage.config({
  name: 'NMR_App_DB',
  storeName: 'nmr_cache_store'
});

let globalSyncController: AbortController | null = null;

const debouncedSaveData = debounce(async (key: string, data: any) => {
  try {
    await localforage.setItem(key, data);
  } catch (error) {
    console.error(`背景快取儲存失敗 [${key}]:`, error);
  }
}, 800);

export const useDataSync = (addToast: (msg: string, type: ToastType) => void) => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('nm_auth_status') === 'true';
    }
    return false;
  });
  const [apiEndpoint, setApiEndpoint] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('nm_gas_url');
      if (saved && saved !== 'undefined' && saved !== 'null') return saved.trim();
    }
    return DEFAULT_GAS_URL;
  });

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [trips, setTrips] = useState<string[]>(['第一趟', '第二趟', '未分配']);
  
  // 2. 利用組件掛載 (Mount) 時觸發的 useEffect，建立非同步提取快取的方法
  useEffect(() => {
    const loadInitialCacheFromDB = async () => {
      try {
        const pCustomers = localforage.getItem<Customer[]>('nm_cache_customers');
        const pProducts = localforage.getItem<Product[]>('nm_cache_products');
        const pOrders = localforage.getItem<Order[]>('nm_cache_orders');
        const pTrips = localforage.getItem<string[]>('availableTrips');

        // 為了畫面順暢，推薦用 Promise.all 平行一次把所有資料拉回來
        const [cachedCust, cachedProd, cachedOrd, cachedTrips] = await Promise.all([pCustomers, pProducts, pOrders, pTrips]);

        let hasAnyCache = false;

        if (cachedCust && cachedCust.length > 0) { setCustomers(cachedCust); hasAnyCache = true; }
        if (cachedProd && cachedProd.length > 0) { setProducts(cachedProd); hasAnyCache = true; }
        if (cachedOrd && cachedOrd.length > 0) { 
           // 偵測並清理「幽靈狀態」，將上次意外中斷而遺留的 pending 轉為 error
           const cleanedOrders = cachedOrd.map(o => 
             o.syncStatus === 'pending' 
               ? { ...o, syncStatus: 'error' as const, errorMessage: '應用程式意外關閉或網路超時，請點擊重試' } 
               : o
           );
           setOrders(cleanedOrders); 
           hasAnyCache = true; 
        }
        if (cachedTrips && cachedTrips.length > 0) { setTrips(cachedTrips); hasAnyCache = true; }
        
        if (hasAnyCache) {
          setIsInitialLoading(false);
        }
      } catch (error) {
        console.error('從資料庫還原快取崩潰:', error);
      }
    };

    if (typeof window !== 'undefined') {
      loadInitialCacheFromDB();
    }
  }, []);
  
  // 👇 新增這段：用 useRef 隨時追蹤最新的資料狀態，避開閉包陷阱
  const latestDataRef = useRef({ customers: [] as Customer[], products: [] as Product[], orders: [] as Order[], trips: [] as string[] });
  useEffect(() => {
    latestDataRef.current = { customers, products, orders, trips };
  }, [customers, products, orders, trips]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      debouncedSaveData('availableTrips', trips);
    }
  }, [trips]);
  
  // NEW: Automator Effect to sink data to cache whenever it changes successfully
  useEffect(() => {
    if (typeof window !== 'undefined' && customers.length > 0) {
      debouncedSaveData('nm_cache_customers', customers);
    }
  }, [customers]);

  useEffect(() => {
    if (typeof window !== 'undefined' && products.length > 0) {
      debouncedSaveData('nm_cache_products', products);
    }
  }, [products]);

  useEffect(() => {
    if (typeof window !== 'undefined' && orders.length > 0) {
      debouncedSaveData('nm_cache_orders', orders);
    }
  }, [orders]);

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingNewOrders, setPendingNewOrders] = useState<Order[]>([]);
  const isAtTopRef = useRef({ val: true });
  const isSavingRef = useRef(false);
  const isSyncingRef = useRef(false);
  
  useEffect(() => {
    isSavingRef.current = isSaving;
  }, [isSaving]);

  useEffect(() => {
    const el = document.getElementById('main-scroll-container');
    const handleScroll = throttle(() => {
      isAtTopRef.current.val = (el?.scrollTop || 0) < 100;
    }, 200);
    if (el) {
      el.addEventListener('scroll', handleScroll, { passive: true });
    }
    return () => {
      if (el) el.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const applyPendingOrders = useCallback(() => {
    if (pendingNewOrders.length === 0) return;
    setOrders(prev => {
      const mergedMap = new Map();
      prev.forEach(o => mergedMap.set(o.id, o));
      pendingNewOrders.forEach(o => mergedMap.set(o.id, o));
      const newArray = Array.from(mergedMap.values());
      newArray.sort((a, b) => {
         const dateA = a.deliveryDate;
         const dateB = b.deliveryDate;
         if (dateA !== dateB) return dateA > dateB ? -1 : 1; 
         if (a.deliveryTime !== b.deliveryTime) return (a.deliveryTime || '').localeCompare(b.deliveryTime || '');
         return (a.lastUpdated || 0) > (b.lastUpdated || 0) ? -1 : 1;
      });
      return newArray;
    });
    setPendingNewOrders([]);
    const el = document.getElementById('main-scroll-container');
    if (el) {
      el.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [pendingNewOrders]);

  const [conflictData, setConflictData] = useState<{
    action: string;
    data: any;
    description: string;
    type?: string;
    clientData?: any;
    serverData?: any;
  } | null>(null);

  // Sync Data Logic
  const syncData = useCallback(async (isSilent = false) => { 
    if (isSavingRef.current) {
      console.log("UX Block: Bypassing sync while user is saving data.");
      return;
    }
    
    if (globalSyncController) {
      console.log("Canceling previous stale sync request");
      globalSyncController.abort();
    }
    globalSyncController = new AbortController();

    if (!apiEndpoint) { 
      setIsInitialLoading(false); 
      return; 
    } 
    
    isSyncingRef.current = true;
    if (!isSilent) setIsInitialLoading(true);
    else setIsBackgroundSyncing(true);

    try { 
      const startDate = new Date(); 
      startDate.setDate(startDate.getDate() - 60); 
      const startDateStr = formatDateStr(startDate); 
      
      let lastSyncStr = localStorage.getItem('nm_last_sync_ts');
      
      // 強制執行一次全量同步，確保近期人工新增但沒有 LastUpdated 的資料能被抓下來
      if (localStorage.getItem('nm_force_full_sync_2') !== 'done') {
        lastSyncStr = null;
        localStorage.setItem('nm_force_full_sync_2', 'done');
      }

      const since = lastSyncStr && isSilent ? Number(lastSyncStr) : 0;
      
      const endpointParams = {
        type: since > 0 ? 'sync_delta' : 'init',
        startDate: startDateStr,
        _t: Date.now().toString(),
        ...(since > 0 && { since: String(since) })
      };

      const result = await container.syncRepo.sync(endpointParams, isSilent, globalSyncController.signal);
      
      if (result) { 
        if (result.serverGlobalTs) {
           localStorage.setItem('nm_last_sync_ts', String(result.serverGlobalTs));
        }

        const mappedCustomers: Customer[] = DataMapper.mapCustomers(result.customers || []);
        const mappedProducts: Product[] = DataMapper.mapProducts(result.products || []);
        
        const rawOrders = result.orders || []; 
        const fetchedTrips = result.trips || [];
        
        // === 加入這段：每次輪詢時，將通知中心的設定存更新至本機快取 ===
        if (result.settings) {
           let rulesChanged = false;
           if (result.settings.rules) {
               const newRulesStr = JSON.stringify(result.settings.rules);
               const oldRulesStr = localStorage.getItem('nm_reminder_rules');
               if (newRulesStr !== oldRulesStr) {
                   localStorage.setItem('nm_reminder_rules', newRulesStr);
                   rulesChanged = true;
               }
           }
           if (result.settings.lineChannelToken) {
               localStorage.setItem('nm_line_token', result.settings.lineChannelToken);
           }
           if (result.settings.lineUserId) {
               localStorage.setItem('nm_line_user_id', result.settings.lineUserId);
           }
           
           if (rulesChanged) {
               // 判斷當前是否開啟 NotificationCenterModal (用自訂屬性等方式，或者讓 NotificationCenterModal 攔截)
               const evt = new CustomEvent('rules_updated_from_cloud', { detail: { isPollingUpdate: true } });
               window.dispatchEvent(evt);
               
               // 這裡直接判斷 DOM 是不是有彈窗
               const isModalOpen = document.getElementById('notification-center-modal') !== null;
               if (!isModalOpen) {
                 addToast("通知提醒規則已從雲端同步最新設定", "info");
               }
           }
        }
        // ========================================================
        
        const currentOrders = latestDataRef.current.orders || [];
        const currentProducts = latestDataRef.current.products || [];

        const { resultOrders, pendingOrders } = await new Promise<{resultOrders: Order[], pendingOrders: Order[]}>((resolve, reject) => {
           const worker = new DataWorker();
           worker.onmessage = (e) => {
              resolve(e.data);
              worker.terminate();
           };
           worker.onerror = (err) => {
              reject(err);
              worker.terminate();
           };
           worker.postMessage({
              type: 'MERGE_AND_SORT',
              rawOrders,
              oldOrders: currentOrders,
              mappedProducts,
              currentProducts,
              since,
              isSilent,
              isAtTop: isAtTopRef.current.val
           });
        });

        if (since > 0 && result.serverGlobalTs) {
           // 💡 訂單依然做增量合併，但字典檔 (客戶/商品) 採用全量覆蓋
           if (mappedCustomers.length > 0) {
              setCustomers(mappedCustomers);
           }
           if (mappedProducts.length > 0) {
              setProducts(mappedProducts);
           }
           if (fetchedTrips.length > 0) {
              setTrips(fetchedTrips);
           }
           if (rawOrders.length > 0) {
              setOrders(resultOrders);
              if (pendingOrders && pendingOrders.length > 0) {
                 setPendingNewOrders(prev => {
                     const pm = new Map();
                     prev.forEach(p => pm.set(p.id, p));
                     pendingOrders.forEach(n => pm.set(n.id, n));
                     return Array.from(pm.values());
                 });
              }
           }
        } else {
           // Full replacement
           setCustomers(mappedCustomers);
           setProducts(mappedProducts);
           if (fetchedTrips.length > 0) {
               setTrips(fetchedTrips);
           }
           setOrders(resultOrders);
        }

        if (!isSilent) {
          addToast('雲端資料已同步完成 (近60天)', 'success');
        } else {
          addToast(`已更新至最新資料`, 'success');
        }
      } 
    } catch (e: any) { 
      if (e.message === 'ABORTED_BY_USER' || e.message === 'ABORTED') {
        console.log("Stale sync request was aborted successfully.");
        return;
      }
      console.error("無法連線至雲端:", e); 
      if (!isSilent) {
        let errMsg = "同步失敗，請檢查網路連線";
        if ((e instanceof Error && e.message.includes('Failed to fetch')) || String(e).includes('Failed to fetch')) {
          errMsg = "雲端連線失敗 (CORS / 網址無效)。請確認 Apps Script 部署 URL 是否正確、權限是否為「所有人」，或程式碼是否有錯。";
        }
        addToast(errMsg, 'error'); 
      }
    } finally { 
      setIsInitialLoading(false); 
      setIsBackgroundSyncing(false);
      isSyncingRef.current = false;
    } 
  }, [apiEndpoint, addToast]);

  // Auth Functions
  const handleLogin = async (pwd: string) => { 
    if (!apiEndpoint) { 
      if (pwd === '8888') { 
        setIsAuthenticated(true); 
        localStorage.setItem('nm_auth_status', 'true'); 
        return true; 
      } 
      return false; 
    } 
    try { 
      const isOk = await container.authRepo.login(pwd); 
      if (isOk) { 
        setIsAuthenticated(true); 
        localStorage.setItem('nm_auth_status', 'true'); 
        return true; 
      } 
      return false; 
    } catch (e) { 
      console.error("Login Error:", e); 
      return false; 
    } 
  };

  const handleLogout = () => { 
    setIsAuthenticated(false); 
    localStorage.removeItem('nm_auth_status'); 
    setCustomers([]); 
    setOrders([]); 
    setProducts([]); 
    addToast("已安全登出", 'info'); 
  };

  const handleChangePassword = async (oldPwd: string, newPwd: string) => { 
    if (!apiEndpoint) return false; 
    try { 
      const isOk = await container.authRepo.changePassword(oldPwd, newPwd);
      return isOk;
    } catch (e) { 
      console.error("Change Password Error:", e); 
      return false; 
    } 
  };

  const handleSaveApiUrl = (newUrl: string) => { 
    localStorage.setItem('nm_gas_url', newUrl.trim()); 
    setApiEndpoint(newUrl.trim()); 
    container.updateApiEndpoint(newUrl.trim());
  };

  const handleForceRetry = async () => {
    if (!conflictData || !apiEndpoint) return;
    setIsSaving(true);
    
    const newPayload = { ...conflictData.data, force: true };
    
    try {
      await container.apiClient.post(conflictData.action, newPayload);
      
      // Update local orders to clear pending status
      setOrders(prev => {
        if (conflictData.type === 'batch_order' && conflictData.clientData) {
          const updatedIds = conflictData.clientData.map((u: any) => u.id);
          return prev.map(o => updatedIds.includes(o.id) ? { ...o, syncStatus: 'synced', pendingAction: undefined } : o);
        } else if (conflictData.type === 'order' && conflictData.clientData) {
          return prev.map(o => o.id === conflictData.clientData.id ? { ...o, syncStatus: 'synced', pendingAction: undefined } : o);
        }
        return prev;
      });

      addToast('強制覆蓋成功', 'success');
      setConflictData(null);
      setTimeout(() => syncData(true), 100);
      return true;
    } catch (e: any) {
      console.error(e);
      // Backend error returned explicit success: false (GasApiClient throws an Error with errorCode if it fails)
      if (e.errorCode || !String(e).includes('Failed to fetch')) {
        addToast('伺服器拒絕強制執行，已為您重新整理為最新資料', 'warning');
        setConflictData(null); 
        setTimeout(() => syncData(true), 100);
        return false;
      }

      // Real network error
      addToast('連線失敗，請檢查網路狀態', 'error');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const saveTripsToCloud = async (newTrips: string[]) => {
    if (!apiEndpoint) return false;
    try {
      const isOk = await container.tripsRepo.saveTrips(newTrips);
      if (isOk) {
        setTrips(newTrips);
        return true;
      }
      return false;
    } catch (e) {
      console.error("Save Trips Error:", e);
      return false;
    }
  };

  // Helper for saving orders to cloud with Queue
  const saveOrderToCloud = async (
    newOrder: Order, 
    actionName: string, 
    originalVersion: number | undefined,
    onSuccess: (updatedOrder?: Order) => void,
    onError: (msg: string) => void
  ) => {
    try {
      // @ts-ignore
      const savedOrder = await container.orderService.saveOrder(actionName, newOrder, products, originalVersion);
      setOrders(prev => prev.map(o => o.id === newOrder.id ? { ...o, version: savedOrder.version } : o));
      onSuccess(savedOrder);
    } catch (e: any) {
      if (e.errorCode === 'VERSION_CONFLICT' || (e.message && (e.message.includes('ERR_VERSION_CONFLICT') || e.message.includes('VERSION_CONFLICT')))) {
         setConflictData({
           action: actionName,
           data: { ...newOrder, originalVersion },
           description: `更新訂單: ${newOrder.customerName}`,
           type: 'order',
           clientData: newOrder,
           serverData: e.serverData
         });
         return; // 這裡攔截衝突不丟出錯誤，等待使用者解決
      }
      
      console.error("Sync Failed:", e);
      let errMsg = e instanceof Error ? e.message : String(e);
      
      // === 自動修復機制 (幽靈訂單 UPSERT) ===
      // 如果後端說找不到訂單 (發生於本地建立失敗，但被使用者改了狀態後重試)
      // 我們直接將它當作新的內容強制覆寫(UPSERT)回去！
      if (errMsg.includes('Order not found')) {
        try {
          console.log("Order not found on backend. Falling back to upsert (updateOrderContent)...");
          // @ts-ignore
          const fallbackSavedOrder = await container.orderService.saveOrder('updateOrderContent', newOrder, products, undefined);
          setOrders(prev => prev.map(o => o.id === newOrder.id ? { ...o, version: fallbackSavedOrder.version } : o));
          onSuccess(fallbackSavedOrder);
          return; // 成功的話就結束，不要走到 onerror
        } catch (fallbackErr: any) {
          console.error("Fallback UPSERT Failed:", fallbackErr);
          errMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        }
      }
      
      if (e.name === 'AbortError' || (e.message && e.message.includes('aborted')) || String(e).includes('aborted') || String(e).includes('Timeout')) {
         errMsg = '請求連線逾時 (超過45秒)，這可能是網路不穩定或雲端處理較慢引起，請重試。';
      } else if ((e instanceof Error && e.message.includes('Failed to fetch')) || String(e).includes('Failed to fetch')) {
         errMsg = '網路連線失敗或伺服器無回應 (Failed to fetch)。請檢查 Apps Script 是否發生錯誤。';
      }
      onError(errMsg);
    }
  };

  // Initial Sync
  useEffect(() => { 
    if (isAuthenticated) { 
      localforage.getItem('nm_cache_orders').then(cache => {
        const hasCache = Array.isArray(cache) && cache.length > 0;
        syncData(hasCache); 
      });
    } 
  }, [isAuthenticated, syncData]);

  // Silent Background Polling
  const lastGlobalUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (!isAuthenticated || !apiEndpoint) return;

    let pollInterval: any = null;
    let wakeoutId: any = null;

    const performPolling = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const { globalLastUpdated } = await container.syncRepo.checkUpdates();
        const serverGlobalTs = globalLastUpdated;
        if (lastGlobalUpdateRef.current > 0 && serverGlobalTs > lastGlobalUpdateRef.current) {
          console.log("Background updates detected, syncing silently...");
          syncData(true);
        }
        lastGlobalUpdateRef.current = serverGlobalTs;
      } catch (e) {
        // Suppress polling error log to avoid console spam when offline or endpoint is invalid
      }
    };

    const startPolling = () => {
      if (!pollInterval) {
        pollInterval = setInterval(performPolling, 30000); // 30 seconds
      }
    };

    const stopPolling = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      if (wakeoutId) {
        clearTimeout(wakeoutId);
        wakeoutId = null;
      }
    };

    startPolling();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        wakeoutId = setTimeout(() => {
          performPolling();
          startPolling();
        }, 2000);
      } else {
        stopPolling();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isAuthenticated, apiEndpoint, syncData]);

  // 🔔 Firebase Realtime Database 門鈴監聽器
  useEffect(() => {
    // 只有在登入成功後才開啟監聽
    if (!isAuthenticated) return;

    const firebaseUrl = 'https://orderapp-sync-default-rtdb.asia-southeast1.firebasedatabase.app/sync.json';
    let eventSource: EventSource | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;

    // 加入防抖處理，避免在短時間內多筆推播進來時轟炸 GAS，延遲 3 秒讓 Google Sheets 完成寫入
    const debouncedSync = debounce(() => {
        console.log(`🔔 Firebase 門鈴確認，開始延遲合併抓取...`);
        syncData(true);
    }, 3000);

    const connectDoorbell = () => {
      try {
        if (eventSource) {
           eventSource.close();
        }
        // 使用原生 EventSource 訂閱 Firebase 的 Server-Sent Events (SSE)
        eventSource = new EventSource(firebaseUrl);
        
        const handleFirebaseEvent = (event: any) => {
          if (event && event.data) {
            const parsed = JSON.parse(event.data);
            
            // 如果解析到的數據內有 lastUpdateTime，就觸發背景同步 (具有防抖機制)
            if (
              (parsed && parsed.data && parsed.data.lastUpdateTime) || 
              (parsed && parsed.path === '/lastUpdateTime') ||
              (parsed && parsed.path === '/')
            ) {
              debouncedSync(); 
            }
          }
        };

        // 同時拿它來接聽 put 和 patch 兩種廣播
        eventSource.addEventListener('put', handleFirebaseEvent);
        eventSource.addEventListener('patch', handleFirebaseEvent);

        // 如果連線因為休眠或其他原因中斷，我們補上自動重連的邏輯
        eventSource.onerror = (err) => {
          console.warn('⚠️ Firebase 門鈴連線發生異常，準備重新連線...', err);
          eventSource?.close();
          // 斷線後延遲 5 秒重連
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connectDoorbell, 5000);
        };
      } catch (err) {
        console.warn('門鈴連線建立失敗', err);
      }
    };

    connectDoorbell();

    // 當使用者關閉網頁或登出時，拔除監聽器以節省資源
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (eventSource) {
        eventSource.close();
      }
      debouncedSync.cancel();
    };
  }, [isAuthenticated, syncData]);

  return {
    isAuthenticated, setIsAuthenticated,
    apiEndpoint, setApiEndpoint,
    customers, setCustomers,
    products, setProducts,
    orders, setOrders,
    trips, setTrips,
    pendingNewOrders, setPendingNewOrders,
    applyPendingOrders,
    isInitialLoading, setIsInitialLoading,
    isBackgroundSyncing, setIsBackgroundSyncing,
    isSaving, setIsSaving,
    conflictData, setConflictData,
    syncData,
    handleLogin,
    handleLogout,
    handleChangePassword,
    handleSaveApiUrl,
    handleForceRetry,
    saveOrderToCloud,
    saveTripsToCloud
  };
};
