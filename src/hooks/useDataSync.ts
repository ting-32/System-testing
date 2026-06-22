import { useState, useEffect, useCallback, useRef, MutableRefObject } from 'react';
import localforage from 'localforage';
import { debounce } from 'lodash';
import { Customer, Product, Order, OrderStatus, ToastType } from '../types';
import { GAS_URL as DEFAULT_GAS_URL, APP_VERSION } from '../constants';
import { formatDateStr, normalizeDate, safeNumber } from '../utils';
import { container } from '../core/di/AppContainer';
import { DataMapper } from '../core/mappers/DataMapper';
import { listenToDataChange, broadcastDataChange } from '../services/firebaseSync';
import { useSettingsStore } from '../store/useSettingsStore';
import { useLogStore } from '../store/useLogStore';

localforage.config({
  name: 'NMR_App_DB',
  storeName: 'nmr_cache_store'
});

let globalSyncController: AbortController | null = null;

const debounceCust = debounce(async (data: any) => {
  try { await localforage.setItem('nm_cache_customers', data); } catch (e) { console.error(e); }
}, 800);

const debounceProd = debounce(async (data: any) => {
  try { await localforage.setItem('nm_cache_products', data); } catch (e) { console.error(e); }
}, 800);

const debounceOrd = debounce(async (data: any) => {
  try { await localforage.setItem('nm_cache_orders', data); } catch (e) { console.error(e); }
}, 800);

const debounceTrips = debounce(async (data: any) => {
  try { await localforage.setItem('availableTrips', data); } catch (e) { console.error(e); }
}, 800);

export function mergeWithPendingMutations<T extends { id: string; lastUpdated?: number; _syncStatus?: string; syncStatus?: string; _localUpdatedTs?: number; pendingAction?: string; }>(
  localItems: T[],
  cloudItems: T[]
): T[] {
  const mergedMap = new Map<string, T>();
  
  cloudItems.forEach(item => {
    mergedMap.set(item.id, item);
  });

  localItems.forEach(localItem => {
    const isPending = localItem._syncStatus === 'pending' || localItem.syncStatus === 'pending';
    const isError = localItem._syncStatus === 'error' || localItem.syncStatus === 'error';
    
    if (isPending || isError) {
      const cloudItem = mergedMap.get(localItem.id);
      if (!cloudItem) {
         if (localItem.pendingAction === 'delete') {
            // It is not in the cloud, and we wanted to delete it. It's successfully deleted! Drop it.
         } else {
            // It is not in the cloud, and we wanted to create/update it. It's a new item or server cache is missing it. Keep it.
            mergedMap.set(localItem.id, localItem);
         }
      } else {
         const cloudV = cloudItem.lastUpdated || 0;
         const localV = localItem._localUpdatedTs || localItem.lastUpdated || 0;
         const isServerNewer = cloudV > localV;

         if (isError && isServerNewer) {
            // 代表在本地出錯卡死的這段時間，雲端有人更新過了（雲端時間 > 本地出錯時間）
            // -> 別人已經處理好了，放棄本地錯誤版本，全面擁抱雲端最新資料
            // 雲端資料 (cloudItem) 已經在 mergedMap 裡，所以什麼都不做
         } else if (cloudV < localV || isPending) {
            // 如果本地時間較新，或是我們還處於活躍的 pending 狀態
            // 當 cloudV === localV 時，若為 pending，也優先相信本地
            // (除非要等伺服器回來更新狀態為成功才解鎖)
            mergedMap.set(localItem.id, localItem);
         } else if (cloudV === localV && localItem.pendingAction === 'delete') {
            mergedMap.set(localItem.id, localItem);
         }
      }
    }
  });

  return Array.from(mergedMap.values());
}

export const useDataSync = (addToast: (msg: string, type: ToastType) => void, isEditingRef?: MutableRefObject<boolean>, onReconciled?: (orderId: string) => void, getAddSyncTask?: () => any) => {
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

        if (cachedCust) { setCustomers(cachedCust); hasAnyCache = true; }
        if (cachedProd) { setProducts(cachedProd); hasAnyCache = true; }
        if (cachedOrd) { 
           // 偵測並清理「幽靈狀態」，將上次意外中斷而遺留的 pending 轉為 error
           const cleanedOrders = cachedOrd.map(o => 
             o.syncStatus === 'pending' 
               ? { ...o, syncStatus: 'error' as const, errorMessage: '應用程式意外關閉或網路超時，請點擊重試' } 
               : o
           );
           setOrders(cleanedOrders); 
           hasAnyCache = true; 
        }
        if (cachedTrips) { setTrips(cachedTrips); hasAnyCache = true; }
        
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
    if (typeof window !== 'undefined' && trips.length > 0) {
      debounceTrips(trips);
    }
  }, [trips]);
  
  // NEW: Automator Effect to sink data to cache whenever it changes successfully
  useEffect(() => {
    if (typeof window !== 'undefined' && customers.length > 0) {
      debounceCust(customers);
    }
  }, [customers]);

  useEffect(() => {
    if (typeof window !== 'undefined' && products.length > 0) {
      debounceProd(products);
    }
  }, [products]);

  useEffect(() => {
    if (typeof window !== 'undefined' && orders.length > 0) {
      debounceOrd(orders);
    }
  }, [orders]);

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const isSyncingRef = useRef(false);
  const isInitialLoadedRef = useRef(false);
  const lastGlobalUpdateRef = useRef<number>(0);
  
  useEffect(() => {
    isSavingRef.current = isSaving;
  }, [isSaving]);

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
    if (!isSilent && !isInitialLoadedRef.current) setIsInitialLoading(true);
    else setIsBackgroundSyncing(true);

    try { 
      // 控制 checkUpdates 的寫入頻率 (只在初次或手動時紀錄)
      if (!isSilent) {
        try {
          const auditPayload = {
            deviceId: getOrCreateDeviceId(),
            userAgent: navigator.userAgent,
            isManual: true
          };
          // 這裡主要目的是為了紀錄登入或手動重整，不阻擋真正的資料拉取
          await container.syncRepo.checkUpdates(auditPayload, globalSyncController.signal);
        } catch (err) {
          console.warn("Audit log ping failed", err);
        }
      }

      const startDate = new Date(); 
      startDate.setDate(startDate.getDate() - 90); 
      const startDateStr = formatDateStr(startDate); 
      
      let lastSyncStr = localStorage.getItem('nm_last_sync_ts');
      
      // 強制執行一次全量同步，確保近期人工新增但沒有 LastUpdated 的資料能被抓下來
      if (localStorage.getItem('nm_force_full_sync_7') !== 'done') {
        lastSyncStr = null;
        localStorage.setItem('nm_force_full_sync_7', 'done');
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
           lastGlobalUpdateRef.current = result.serverGlobalTs;
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
            let rawDate = o.配送日期 || o.deliveryDate; 
            if (typeof rawDate === 'string') {
               rawDate = rawDate.replace(/\//g, '-').replace(/-0?/g, '-').replace(/-(\d)(?!\d)/g, '-0$1');
            }
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
        
        // === 將通知中心的設定存更新至 Store ===
        if (result.settings) {
          const store = useSettingsStore.getState();
          store.updateFromCloud(result.settings);
          
          const isModalOpen = document.getElementById('notification-center-modal') !== null;
          if (!isModalOpen && store.hasCloudUpdate) {
            addToast("通知提醒規則已從雲端同步最新設定", "info");
            store.resetCloudUpdateFlag();
          }
        }
        
        const logStore = useLogStore.getState();
        if (result.latestSystemLogTs && result.latestSystemLogTs > logStore.lastSyncSystemTs) {
          container.logRepo.getSystemLogs(50).then(logs => {
            logStore.setSystemLogs(logs, result.latestSystemLogTs!);
            const isModalOpen = document.getElementById('notification-center-modal') !== null;
            if (!isModalOpen) logStore.setUnreadLogs(true);
          }).catch(err => console.error("Auto fetch system logs error:", err));
        }

        if (result.latestNotifyLogTs && result.latestNotifyLogTs > logStore.lastSyncNotifyTs) {
          container.logRepo.getNotificationLogs(50).then(logs => {
            logStore.setNotifyLogs(logs, result.latestNotifyLogTs!);
            const isModalOpen = document.getElementById('notification-center-modal') !== null;
            if (!isModalOpen) logStore.setUnreadLogs(true);
          }).catch(err => console.error("Auto fetch notify logs error:", err));
        }
        // ========================================================
        
        if (since > 0 && result.serverGlobalTs) {
           // 💡 訂單依然做增量合併，但字典檔 (客戶/商品) 採用全量覆蓋
           if (mappedCustomers.length > 0) {
              setCustomers(curr => mergeWithPendingMutations(curr, mappedCustomers));
           }
           if (mappedProducts.length > 0) {
              setProducts(curr => mergeWithPendingMutations(curr, mappedProducts));
           }
           if (fetchedTrips.length > 0) {
              setTrips(fetchedTrips);
           }
           if (newOrders.length > 0 || (result.allActiveOrderIds && result.allActiveOrderIds.length > 0)) {
              setOrders(currentOrders => {
                 const mergedMap = new Map();
                 currentOrders.forEach(o => mergedMap.set(o.id, o));
                 
                 // 1. 處理這次有發生內容變動的新訂單 (處理邏輯維持不變)
                 newOrders.forEach(newOrder => {
                    // 若是發現帶有 DELETED 狀態的資料，直接從 Map 中連根拔起
                    if (String(newOrder.status) === 'DELETED') {
                        mergedMap.delete(newOrder.id);
                        return;
                    }

                    const existOrder = mergedMap.get(newOrder.id);
                    if (existOrder) {
                        if (existOrder.syncStatus === 'pending' || existOrder.syncStatus === 'error') {
                            // [Reconciliation / 假性失敗的自動和解]
                            // 偷看答案：如果目前這筆訂單的「雲端實際狀態」已經等於了我們本地「樂觀更新鎖死」的「變更目標」
                            // 就代表我們先前的請求（如：切換為 PAID）GAS 已經處理成功，只是回傳時 Timeout 導致被誤判失敗。
                            // 若狀態與趟次等關鍵維度完全吻合，即可「握手言和」，解除 UI 死鎖。
                            if (existOrder.pendingAction !== 'delete' && newOrder.status === existOrder.status && newOrder.trip === existOrder.trip && newOrder.deliveryMethod === existOrder.deliveryMethod) {
                                // 覆寫成純淨的雲端資料（無 pending/error）解鎖 UI
                                mergedMap.set(newOrder.id, newOrder);
                                // 通知 Queue 把舊的失敗任務刪除
                                if (onReconciled) {
                                    onReconciled(newOrder.id);
                                }
                            }
                            return; 
                        }
                        if ((existOrder.lastUpdated || 0) >= (newOrder.lastUpdated || 0)) {
                            return;
                        }
                    }
                    mergedMap.set(newOrder.id, newOrder);
                 });

                 // 2. 啟動您的幽靈剔除機制 (Array/Set 比對)
                 if (result.allActiveOrderIds && Array.isArray(result.allActiveOrderIds)) {
                     const activeSet = new Set(result.allActiveOrderIds);
                     
                     for (const [orderId, orderData] of mergedMap.entries()) {
                        // 安全保護：跳過 "本地尚未上傳/重試中" 的訂單 以及 "歷史未帶 ID" 自動被冠上 MIGRATED- 前綴的老訂單
                        if (orderData.syncStatus === 'pending' || orderData.syncStatus === 'error') continue;
                        if (orderId.startsWith('MIGRATED-')) continue;
                        if (orderId.startsWith('fallback_')) continue;
                        
                        // 若雲端有效名單內已經沒有這個 ID，即判定為已被其他裝置/後台刪除，進行本地除名
                        if (!activeSet.has(orderId)) {
                            mergedMap.delete(orderId);
                        }
                     }
                 }

                 return Array.from(mergedMap.values());
              });
           }
        } else {
           // Full replacement
           setCustomers(curr => mergeWithPendingMutations(curr, mappedCustomers));
           setProducts(curr => mergeWithPendingMutations(curr, mappedProducts));
           if (fetchedTrips.length > 0) {
               setTrips(fetchedTrips);
           }
           
           setOrders(currentOrders => {
             const activeNewOrders = newOrders.filter(o => String(o.status) !== 'DELETED');
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
          addToast('雲端資料已同步完成 (近90天)', 'success');
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
      isInitialLoadedRef.current = true;
      setIsInitialLoading(false); 
      setIsBackgroundSyncing(false);
      isSyncingRef.current = false;
    } 
  }, [apiEndpoint, addToast]);

  // Auth Functions
  const handleLogin = async (pwd: string) => { 
    if (!apiEndpoint || apiEndpoint === 'https://mock-api.local') { 
      if (pwd === '8888') { 
        setIsAuthenticated(true); 
        localStorage.setItem('nm_auth_status', 'true'); 
        return true; 
      } 
      return false; 
    } 
    try { 
      const deviceId = getOrCreateDeviceId();
      const userAgent = navigator.userAgent;
      
      const isOk = await container.authRepo.login(pwd, deviceId, userAgent); 
      if (isOk && isOk.success !== false) { // 兼容舊版與新版的 true 及物件
        if (isOk.token) {
          localStorage.setItem('APP_SESSION_TOKEN', isOk.token);
          localStorage.setItem('APP_USER_ROLE', isOk.role || 'admin');
          localStorage.setItem('APP_USER_NAME', isOk.name || '系統管理員');
        }
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

  const handleLogout = async () => { 
    setIsAuthenticated(false); 
    setIsInitialLoading(true); // 重置載入狀態
    
    // 1. 保留 API 網址，因為同業換帳號不需要重新輸入網址
    const currentEndpoint = localStorage.getItem('nm_gas_url');
    
    // 2. 清除所有 LocalStorage 與 IndexedDB
    localStorage.clear();
    await localforage.clear();
    
    // 3. 把 API 網址跟版本號救回來
    if (currentEndpoint) localStorage.setItem('nm_gas_url', currentEndpoint);
    localStorage.setItem('nm_app_version', APP_VERSION);
    
    // 4. 通知使用者並讓畫面乾淨重整
    addToast('已安全登出並清除本地快取', 'info');
    setTimeout(() => window.location.reload(), 500);
  };

  // 在送出 payload 之前，準備指紋特徵
  const getOrCreateDeviceId = () => {
    let deviceId = localStorage.getItem('APP_DEVICE_ID');
    if (!deviceId) {
      // 優先使用 crypto.randomUUID，若不支援則使用降級方案
      deviceId = typeof crypto.randomUUID === 'function' 
        ? crypto.randomUUID() 
        : Math.random().toString(36).substring(2, 15);
      localStorage.setItem('APP_DEVICE_ID', deviceId);
    }
    return deviceId;
  };

  const handleChangePassword = async (oldPwd: string, newPwd: string) => { 
    if (!apiEndpoint) return false; 
    try { 
      const deviceId = getOrCreateDeviceId();
      const userAgent = navigator.userAgent;
      
      const isOk = await container.authRepo.changePassword(oldPwd, newPwd, deviceId, userAgent);
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
      broadcastDataChange();
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
        broadcastDataChange();
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
    if (actionName === 'updateOrderContent' && getAddSyncTask) {
      const addSyncTask = getAddSyncTask();
      if (addSyncTask) {
        addSyncTask({
          taskId: `UPDATE_CONTENT_${newOrder.id}_${Date.now()}`,
          type: 'UPDATE_CONTENT',
          payload: { ...newOrder, version: originalVersion },
          retryCount: 0,
          timestamp: Date.now()
        });

        // 樂觀讓畫面直接更新，剩下的讓 Queue 背景處理
        setOrders(prev => prev.map(o => o.id === newOrder.id ? { ...o, _syncStatus: 'pending' } : o));
        onSuccess(newOrder);
        broadcastDataChange();
        return;
      }
    }

    try {
      // @ts-ignore
      const savedOrder = await container.orderService.saveOrder(actionName, newOrder, products, originalVersion);
      setOrders(prev => prev.map(o => o.id === newOrder.id ? { ...o, version: savedOrder.version } : o));
      onSuccess(savedOrder);
      broadcastDataChange();
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
      
      if (String(e).includes("UNAUTHORIZED_OR_EXPIRED") || (e.message && e.message.includes("UNAUTHORIZED_OR_EXPIRED"))) {
         return; // 此情況已被全域捕捉並將自動重新整理，不再拋出及顯示跳窗
      }

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
      Promise.all([
        localforage.getItem('nm_cache_customers'),
        localforage.getItem('nm_cache_products'),
        localforage.getItem('nm_cache_orders')
      ]).then(([c, p, o]) => {
        const hasCache = !!(c || p || o);
        syncData(hasCache); 
      });
    } 
  }, [isAuthenticated, syncData]);

  // 🔔 Firebase Realtime Database 門鈴監聽器
  useEffect(() => {
    // 只有在登入成功後才開啟監聽
    if (!isAuthenticated) return;

    let unsubscribe = () => {};

    try {
      unsubscribe = listenToDataChange(() => {
        if (isEditingRef && isEditingRef.current) {
          console.log(`收到 Firebase 門鈴訊號，但使用者編輯中，暫緩同步...`);
          return;
        }
        console.log(`🔔 收到 Firebase 門鈴訊號！準備背景同步...`);
        syncData(true);
      });
    } catch (err) {
      console.warn('門鈴連線中斷', err);
    }

    // 當使用者關閉網頁或登出時，拔除監聽器以節省資源
    return () => {
      unsubscribe();
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
