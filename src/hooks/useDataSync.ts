import { useState, useEffect, useCallback, useRef } from 'react';
import localforage from 'localforage';
import { debounce } from 'lodash';
import { Customer, Product, Order, OrderStatus, GASResponse, ToastType } from '../types';
import { GAS_URL as DEFAULT_GAS_URL } from '../constants';
import { formatDateStr, normalizeDate, safeJsonArray } from '../utils';

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
        if (cachedOrd && cachedOrd.length > 0) { setOrders(cachedOrd); hasAnyCache = true; }
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

  const [conflictData, setConflictData] = useState<{
    action: string;
    data: any;
    description: string;
  } | null>(null);

  // Sync Data Logic
  const syncData = useCallback(async (isSilent = false) => { 
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
      
      const lastSyncStr = localStorage.getItem('nm_last_sync_ts');
      const since = lastSyncStr && isSilent ? Number(lastSyncStr) : 0;
      
      const endpointParams = new URLSearchParams({
        type: since > 0 ? 'sync_delta' : 'init',
        startDate: startDateStr,
        _t: Date.now().toString(),
        ...(since > 0 && { since: String(since) })
      });

      const res = await fetch(`${apiEndpoint}?${endpointParams.toString()}`, { redirect: 'follow' }); 
      const result: GASResponse<any> = await res.json(); 
      
      if (result.success && result.data) { 
        if (result.data.serverGlobalTs) {
           localStorage.setItem('nm_last_sync_ts', String(result.data.serverGlobalTs));
        }

        const mappedCustomers: Customer[] = (result.data.customers || []).map((c: any) => { 
          const priceListKey = Object.keys(c).find(k => k.includes('價目表') || k.includes('Price') || k.includes('priceList')) || '價目表JSON'; 
          return { 
            id: String(c.ID || c.id || ''), 
            name: c.客戶名稱 || c.name || '', 
            phone: c.電話 || c.phone || '', 
            address: c.地址 || c.address || '',
            coordinates: c.座標位置 || c.coordinates || c.GoogleMap網址 || c.googleMapUrl || '',
            deliveryTime: c.配送時間 || c.deliveryTime || '', 
            deliveryMethod: c.配送方式 || c.deliveryMethod || '', 
            defaultTrip: c.預設趟數 || c.defaultTrip || '',
            paymentTerm: c.付款週期 || c.paymentTerm || 'daily', 
            defaultItems: safeJsonArray(c.預設品項JSON || c.預設品項 || c.defaultItems), 
            priceList: safeJsonArray(c[priceListKey] || c.priceList).map((pl: any) => ({ productId: pl.productId, price: Number(pl.price) || 0, unit: pl.unit || '斤' })), 
            offDays: safeJsonArray(c.公休日週期JSON || c.公休日週期 || c.offDays), 
            holidayDates: safeJsonArray(c.特定公休日JSON || c.特定公休日 || c.holidayDates).map((d: any) => normalizeDate(d)),
            autoOrderEnabled: c.autoOrderEnabled === true || String(c.autoOrderEnabled).trim().toLowerCase() === 'true' || String(c.自動建單開關).trim().toLowerCase() === 'true' || c.自動建單開關 === true,
            lastUpdated: Number(c.lastUpdated) || 0
          }; 
        }); 
        
        const mappedProducts: Product[] = (result.data.products || []).map((p: any) => ({ 
          id: String(p.ID || p.id), 
          name: p.品項 || p.name, 
          unit: p.單位 || p.unit, 
          price: Number(p.單價 || p.price) || 0, 
          category: p.分類 || p.category || 'other',
          lastUpdated: Number(p.lastUpdated) || 0
        })); 
        
        const rawOrders = result.data.orders || []; 
        const orderMap: { [key: string]: Order } = {}; 
        rawOrders.forEach((o: any) => { 
          const oid = String(o.訂單ID || o.id); 
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
              lastUpdated: Number(o.lastUpdated) || 0,
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
           
          orderMap[oid].items.push({ productId: prod ? prod.id : prodName, quantity: Number(o.數量 || o.quantity) || 0, unit: o.unit || prod?.unit || '斤' }); 
        }); 
        
        const newOrders = Object.values(orderMap);
        const fetchedTrips = result.data.trips || [];
        
        if (since > 0 && result.data.serverGlobalTs) {
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
                 newOrders.forEach(o => mergedMap.set(o.id, o));
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
             const mergedOrders = [...newOrders];
             
             currentOrders.forEach(localOrder => {
                 if (localOrder.syncStatus === 'pending' || localOrder.syncStatus === 'error') {
                     const index = mergedOrders.findIndex(o => o.id === localOrder.id);
                     if (index !== -1) {
                         mergedOrders[index] = localOrder;
                     } else {
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
        if (e instanceof Error && e.message === 'Failed to fetch') {
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
      const res = await fetch(apiEndpoint, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'login', data: { password: pwd } }) }); 
      const json = await res.json(); 
      if (json.success && json.data === true) { 
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
      const res = await fetch(apiEndpoint, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'changePassword', data: { oldPassword: oldPwd, newPassword: newPwd } }) }); 
      const json = await res.json(); 
      if (json.success && json.data === true) { 
        return true; 
      } 
      return false; 
    } catch (e) { 
      console.error("Change Password Error:", e); 
      return false; 
    } 
  };

  const handleSaveApiUrl = (newUrl: string) => { 
    localStorage.setItem('nm_gas_url', newUrl.trim()); 
    setApiEndpoint(newUrl.trim()); 
  };

  const handleForceRetry = async () => {
    if (!conflictData || !apiEndpoint) return;
    setIsSaving(true);
    
    const newPayload = { ...conflictData.data, force: true };
    
    try {
      const res = await fetch(apiEndpoint, { 
        method: 'POST', 
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: conflictData.action, data: newPayload }) 
      });
      const json = await res.json();
      
      if (json.success) {
        addToast('強制覆蓋成功', 'success');
        setConflictData(null);
        syncData(true);
        return true;
      } else {
        // -----------------------------------------------------------------
        // [UX 優化重點 1]：處理「後端明確回傳失敗」的情況
        // 原因：這不是網路斷線，而是伺服器邏輯拒絕了強制覆蓋。
        // 動作：
        // 1. 顯示 warning 顏色的提示，語氣改為「伺服器拒絕...」，避免誤導。
        // 2. 強制關閉 Modal (setConflictData(null))，解除卡死狀態。
        // 3. 強制重新抓取最新資料 (syncData(true))，讓畫面恢復到伺服器最新狀態。
        // -----------------------------------------------------------------
        addToast('伺服器拒絕強制執行，已為您重新整理為最新資料', 'warning');
        setConflictData(null); 
        syncData(true);        
        return false;
      }
    } catch (e) {
      console.error(e);
      // -----------------------------------------------------------------
      // [UX 優化重點 2]：處理「真正的網路錯誤」(Fetch 失敗)
      // 原因：使用者的網路真的斷了，連不到伺服器。
      // 動作：
      // 1. 顯示 error 顏色的提示，明確告知「連線失敗」。
      // 2. 「不」關閉 Modal。保留視窗讓使用者在網路恢復後可以再次點擊重試。
      // -----------------------------------------------------------------
      addToast('連線失敗，請檢查網路狀態', 'error');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const saveTripsToCloud = async (newTrips: string[]) => {
    if (!apiEndpoint) return false;
    try {
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'saveTrips', data: { trips: newTrips } })
      });
      const json = await res.json();
      if (json.success) {
        setTrips(newTrips);
        return true;
      }
      return false;
    } catch (e) {
      console.error("Save Trips Error:", e);
      return false;
    }
  };

  // Request Queue
  // Stores a promise that resolves to the latest lastUpdated version (number) or undefined if failed/unknown
  const queueRef = useRef<{ [orderId: string]: Promise<number | undefined> }>({});

  // Helper for saving orders to cloud with Queue
  const saveOrderToCloud = async (
    newOrder: Order, 
    actionName: string, 
    originalLastUpdated: number | undefined,
    onSuccess: (updatedOrder?: Order) => void,
    onError: (msg: string) => void
  ) => {
    const orderId = newOrder.id;
    
    // 1. Get the previous task from the queue. 
    // If it doesn't exist, start with a resolved promise containing the originalLastUpdated passed by the caller.
    const previousTask = queueRef.current[orderId] || Promise.resolve(originalLastUpdated);

    const currentTask = previousTask.then(async (latestVersionFromPrevTask) => {
        // 2. Determine which version to use.
        // If the previous task returned a version (meaning it succeeded and got a new version), use it.
        // Otherwise, fall back to the originalLastUpdated passed to this function call.
        const versionToUse = latestVersionFromPrevTask !== undefined ? latestVersionFromPrevTask : originalLastUpdated;
        
        try {
            if (apiEndpoint) {
                const uploadItems = newOrder.items.map(item => {
                    const p = products.find(prod => prod.id === item.productId);
                    return { productName: item.productName || p?.name || item.productId, quantity: item.quantity, unit: item.unit };
                });

                const payload = { ...newOrder, items: uploadItems };
                
                // CRITICAL: Use the version from the chain, NOT just what was passed in.
                if (versionToUse !== undefined) {
                    (payload as any).originalLastUpdated = versionToUse;
                }

                const res = await fetch(apiEndpoint, {
                    method: 'POST',
                    redirect: 'follow',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action: actionName, data: payload })
                });
                const json = await res.json();

                if (!json.success) {
                    if (json.errorCode === 'ERR_VERSION_CONFLICT') {
                        console.log("Auto-resolving conflict for order:", orderId);
                        try {
                            // Fetch latest data silently
                            const latestRes = await fetch(apiEndpoint, {
                                method: 'POST',
                                redirect: 'follow',
                                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                                body: JSON.stringify({ action: 'getOrder', data: { id: orderId } })
                            });
                            const latestJson = await latestRes.json();
                            if (latestJson.success && latestJson.data) {
                                const latestOrder = latestJson.data;
                                if (latestOrder && latestOrder.lastUpdated !== undefined) {
                                    // Retry with the new lastUpdated
                                    const retryPayload = { ...payload, originalLastUpdated: latestOrder.lastUpdated };
                                    const retryRes = await fetch(apiEndpoint, {
                                        method: 'POST',
                                        redirect: 'follow',
                                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                                        body: JSON.stringify({ action: actionName, data: retryPayload })
                                    });
                                    const retryJson = await retryRes.json();
                                    if (retryJson.success) {
                                        const newVersion = retryJson.data?.lastUpdated || latestOrder.lastUpdated;
                                        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, lastUpdated: newVersion } : o));
                                        onSuccess({ ...newOrder, lastUpdated: newVersion });
                                        return newVersion;
                                    }
                                }
                            }
                            // If auto-retry fails, fallback to error
                            onError('自動合併失敗，請重新整理畫面');
                        } catch (e) {
                            console.error("Auto-retry failed:", e);
                            let errMsg = '自動合併發生錯誤，請檢查網路';
                            if (e instanceof Error && e.message === 'Failed to fetch') {
                                errMsg = '網路連線失敗或伺服器無回應 (Failed to fetch)。請檢查 Apps Script 是否發生錯誤。';
                            }
                            onError(errMsg);
                        }
                    } else {
                        onError(json.error || 'Unknown error');
                    }
                    // If failed, return the version we tried to use, so the next task uses it (or fails too)
                    return versionToUse;
                } else {
                    // Success!
                    const updatedData = json.data;
                    let updatedOrder = { ...newOrder };
                    let newVersion = versionToUse;

                    if (updatedData && updatedData.lastUpdated) {
                        newVersion = updatedData.lastUpdated;
                        updatedOrder.lastUpdated = newVersion;
                        
                        // Update local state for UI consistency
                        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, lastUpdated: newVersion } : o));
                    }
                    
                    onSuccess(updatedOrder);
                    
                    // CRITICAL: Return the NEW version for the next task in the chain
                    return newVersion;
                }
            }
            return versionToUse;
        } catch (e) {
            console.error("Sync Failed:", e);
            onError(e instanceof Error ? e.message : 'Network error');
            // On network error, return the version we had, hoping next retry might work or just to keep chain alive
            return versionToUse;
        }
    }).catch(e => {
        console.error("Queue Error:", e);
        return originalLastUpdated;
    });

    // Update Queue
    queueRef.current[orderId] = currentTask;
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
        const res = await fetch(apiEndpoint, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'checkUpdates', data: {} })
        });
        const json = await res.json();
        if (json.success && json.data) {
          const serverGlobalTs = json.data.globalLastUpdated;
          if (lastGlobalUpdateRef.current > 0 && serverGlobalTs > lastGlobalUpdateRef.current) {
            console.log("Background updates detected, syncing silently...");
            syncData(true);
          }
          lastGlobalUpdateRef.current = serverGlobalTs;
        }
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
