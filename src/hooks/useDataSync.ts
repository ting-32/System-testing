import { useState, useEffect, useCallback, useRef } from 'react';
import localforage from 'localforage';
import { debounce } from 'lodash';
import { Customer, Product, Order, OrderStatus, ToastType } from '../types';
import { GAS_URL as DEFAULT_GAS_URL } from '../constants';
import { formatDateStr, normalizeDate, safeNumber } from '../utils';
import { container } from '../core/di/AppContainer';
import { DataMapper } from '../core/mappers/DataMapper';

localforage.config({
  name: 'NMR_App_DB',
  storeName: 'nmr_cache_store'
});

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
  const isSavingRef = useRef(false);
  useEffect(() => {
    isSavingRef.current = isSaving;
  }, [isSaving]);

  const [conflictData, setConflictData] = useState<{
    action: string;
    data: any;
    description: string;
  } | null>(null);

  // Sync Data Logic
  const syncData = useCallback(async (isSilent = false) => { 
    if (isSavingRef.current) {
      console.log("UX Block: Bypassing sync while user is saving data.");
      return;
    }

    if (!apiEndpoint) { 
      setIsInitialLoading(false); 
      return; 
    } 
    
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

      const result = await container.syncRepo.sync(endpointParams);
      
      if (result) { 
        if (result.serverGlobalTs) {
           localStorage.setItem('nm_last_sync_ts', String(result.serverGlobalTs));
        }

        const mappedCustomers: Customer[] = DataMapper.mapCustomers(result.customers || []);
        const mappedProducts: Product[] = DataMapper.mapProducts(result.products || []);
        
        const rawOrders = result.orders || []; 
        const orderMap: { [key: string]: Order } = {}; 
        rawOrders.forEach((o: any) => { 
          // 支援人工在試算表輸入時沒有給 ID 的狀況，使用複合鍵當作暫時 ID 分群
          const fallbackId = `MIGRATED-${o.客戶名 || o.customerName}-${o.配送日期 || o.deliveryDate}-${o.配送時間 || o.deliveryTime || ''}`.trim();
          let rawId = o.訂單ID || o.id;
          if (rawId && typeof rawId === 'string' && rawId.trim() === '') rawId = null;
          const oid = String(rawId || fallbackId); 
          if (!orderMap[oid]) { 
            const rawDate = o.配送日期 || o.deliveryDate; 
            const normalizedDate = normalizeDate(rawDate); 
            orderMap[oid] = { 
              id: oid, 
              createdAt: o.建立時間 || o.createdAt, 
              customerName: o.客戶名 || o.customerName || '未知客戶', 
              deliveryDate: normalizedDate, 
              deliveryTime: o.配送時間 || o.deliveryTime, 
              items: [], 
              note: o.備註 || o.note || '', 
              status: (o.狀態 || o.status as OrderStatus) || OrderStatus.PENDING, 
              source: o.資料來源 || o.source || (String(oid).startsWith('AUTO-') ? '🤖 自動建單' : ''),
              deliveryMethod: o.配送方式 || o.deliveryMethod || '',
              trip: o.趟次 || o.trip || '',
              lastUpdated: safeNumber(o.lastUpdated, 0, `Order ${oid} lastUpdated`),
              syncStatus: 'synced' 
            }; 
          } 
          const prodName = o.品項 || o.productName; 
          
          // Try to map using delta mapping products, fallback to global products context...
          let prod = mappedProducts.find(p => p.name === prodName);
          if (!prod) {
             const currentProducts = latestDataRef.current.products || [];
             prod = currentProducts.find(p => p.name === prodName);
          }
           
          orderMap[oid].items.push({ productId: prod ? prod.id : prodName, quantity: safeNumber(o.數量 || o.quantity, 0, `Order ${oid} item ${prodName} quantity`), unit: o.unit || prod?.unit || '斤' }); 
        }); 
        
        const newOrders = Object.values(orderMap);
        const fetchedTrips = result.trips || [];
        
        // === 加入這段：每次輪詢時，將通知中心的設定存更新至本機快取 ===
        if (result.settings) {
           if (result.settings.rules) {
               localStorage.setItem('nm_reminder_rules', JSON.stringify(result.settings.rules));
           }
           if (result.settings.lineChannelToken) {
               localStorage.setItem('nm_line_token', result.settings.lineChannelToken);
           }
           if (result.settings.lineUserId) {
               localStorage.setItem('nm_line_user_id', result.settings.lineUserId);
           }
           // 發送一個全域的更新事件，讓如果有開啟通知介面的人可以即時看到新資料
           window.dispatchEvent(new Event('rules_updated_from_cloud'));
        }
        // ========================================================
        
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
           if (newOrders.length > 0) {
              setOrders(currentOrders => {
                 const mergedMap = new Map();
                 currentOrders.forEach(o => mergedMap.set(o.id, o));
                 newOrders.forEach(newOrder => {
                    // ✅ 修改後：若是發現帶有 DELETED 狀態的資料，直接從 Map 中連根拔起
                    if (newOrder.status === 'DELETED') {
                        mergedMap.delete(newOrder.id);
                        return;
                    }

                    const existOrder = mergedMap.get(newOrder.id);
                    if (existOrder) {
                        if (existOrder.syncStatus === 'pending' || existOrder.syncStatus === 'error') {
                            return; 
                        }
                        if ((existOrder.lastUpdated || 0) >= (newOrder.lastUpdated || 0)) {
                            return;
                        }
                    }
                    mergedMap.set(newOrder.id, newOrder);
                 });
                 return Array.from(mergedMap.values());
              });
           }
        } else {
           // Full replacement
           setCustomers(mappedCustomers);
           setProducts(mappedProducts);
           if (fetchedTrips.length > 0) {
               setTrips(fetchedTrips);
           }
           
           setOrders(currentOrders => {
             const activeNewOrders = newOrders.filter(o => o.status !== 'DELETED');
             const mergedOrders = [...activeNewOrders];
             
             currentOrders.forEach(localOrder => {
                 const index = mergedOrders.findIndex(o => o.id === localOrder.id);
                 if (index !== -1) {
                     const cloudOrder = mergedOrders[index];
                     if (localOrder.syncStatus === 'pending' || localOrder.syncStatus === 'error') {
                         mergedOrders[index] = localOrder;
                     } else if ((localOrder.lastUpdated || 0) >= (cloudOrder.lastUpdated || 0)) {
                         mergedOrders[index] = localOrder;
                     }
                 } else {
                     if (localOrder.syncStatus === 'pending' || localOrder.syncStatus === 'error') {
                         mergedOrders.push(localOrder);
                     }
                 }
             });
             return mergedOrders;
           });
        }

        if (!isSilent) {
          addToast('雲端資料已同步完成 (近60天)', 'success');
        } else {
          addToast(`已更新至最新資料`, 'success');
        }
      } 
    } catch (e) { 
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
      if (e.errorCode === 'VERSION_CONFLICT' || errMsg.includes('ERR_VERSION_CONFLICT')) {
         errMsg = '此訂單已被其他設備更新，請選擇如何處理衝突。';
         setConflictData({
           action: actionName,
           data: { ...newOrder, originalVersion },
           description: `更新訂單: ${newOrder.customerName}`,
           type: 'order',
           clientData: newOrder,
           serverData: e.serverData
         });
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

    const pollInterval = setInterval(async () => {
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
        // console.error("Polling error:", e);
      }
    }, 30000); // 30 seconds

    return () => clearInterval(pollInterval);
  }, [isAuthenticated, apiEndpoint, syncData]);

  // 🔔 Firebase Realtime Database 門鈴監聽器
  useEffect(() => {
    // 只有在登入成功後才開啟監聽
    if (!isAuthenticated) return;

    const firebaseUrl = 'https://orderapp-sync-default-rtdb.asia-southeast1.firebasedatabase.app/sync.json';
    let eventSource: EventSource | null = null;

    try {
      // 使用原生 EventSource 訂閱 Firebase 的 Server-Sent Events (SSE)
      eventSource = new EventSource(firebaseUrl);
      
      // 我們把處理邏輯抽出來變成一個獨立的函數
      const handleFirebaseEvent = (event: any) => {
        if (event && event.data) {
          const parsed = JSON.parse(event.data);
          
          // 如果解析到的數據內有 lastUpdateTime，就觸動背景同步
          if (
            (parsed && parsed.data && parsed.data.lastUpdateTime) || 
            (parsed && parsed.path === '/lastUpdateTime') ||
            (parsed && parsed.path === '/')
          ) {
            console.log(`🔔 收到 Firebase 門鈴訊號 (${event.type})！準備背景同步...`);
            
            // 觸發靜默更新機制 (isSilent = true)
            syncData(true); 
          }
        }
      };

      // 同時拿它來接聽 put 和 patch 兩種廣播
      eventSource.addEventListener('put', handleFirebaseEvent);
      eventSource.addEventListener('patch', handleFirebaseEvent);
    } catch (err) {
      console.warn('門鈴連線中斷', err);
    }

    // 當使用者關閉網頁或登出時，拔除監聽器以節省資源
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [isAuthenticated, syncData]);

  return {
    isAuthenticated, setIsAuthenticated,
    apiEndpoint, setApiEndpoint,
    customers, setCustomers,
    products, setProducts,
    orders, setOrders,
    trips, setTrips,
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
