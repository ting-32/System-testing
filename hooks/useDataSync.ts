import { useState, useEffect, useCallback, useRef } from 'react';
import { Customer, Product, Order, OrderStatus, GASResponse, ToastType } from '../types';
import { GAS_URL as DEFAULT_GAS_URL } from '../constants';
import { formatDateStr, normalizeDate, safeJsonArray } from '../utils';

export const useDataSync = (addToast: (msg: string, type: ToastType) => void) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [apiEndpoint, setApiEndpoint] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('nm_gas_url') || DEFAULT_GAS_URL;
    return DEFAULT_GAS_URL;
  });

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [conflictData, setConflictData] = useState<{
    action: string;
    data: any;
    description: string;
  } | null>(null);

  const [pendingData, setPendingData] = useState<{
    customers: Customer[];
    products: Product[];
    orders: Order[];
  } | null>(null);

  const applyPendingUpdates = useCallback(() => {
    if (pendingData) {
      setCustomers(pendingData.customers);
      setProducts(pendingData.products);
      
      setOrders(currentOrders => {
          const serverOrders = pendingData.orders;
          const mergedOrders = [...serverOrders];
          
          currentOrders.forEach(localOrder => {
              if (localOrder.syncStatus === 'pending' || localOrder.syncStatus === 'error') {
                  const index = mergedOrders.findIndex(o => o.id === localOrder.id);
                  if (index !== -1) {
                      // Replace server version with local pending version
                      mergedOrders[index] = localOrder;
                  } else {
                      // Add local new order
                      mergedOrders.push(localOrder);
                  }
              }
          });
          return mergedOrders;
      });

      setPendingData(null);
      addToast('資料已更新', 'success');
    }
  }, [pendingData, addToast]);

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
      const res = await fetch(`${apiEndpoint}?type=init&startDate=${startDateStr}`); 
      const result: GASResponse<any> = await res.json(); 
      if (result.success && result.data) { 
        const mappedCustomers: Customer[] = (result.data.customers || []).map((c: any) => { 
          const priceListKey = Object.keys(c).find(k => k.includes('價目表') || k.includes('Price') || k.includes('priceList')) || '價目表JSON'; 
          return { 
            id: String(c.ID || c.id || ''), 
            name: c.客戶名稱 || c.name || '', 
            phone: c.電話 || c.phone || '', 
            deliveryTime: c.配送時間 || c.deliveryTime || '', 
            deliveryMethod: c.配送方式 || c.deliveryMethod || '', 
            paymentTerm: c.付款週期 || c.paymentTerm || 'daily', 
            defaultItems: safeJsonArray(c.預設品項JSON || c.預設品項 || c.defaultItems), 
            priceList: safeJsonArray(c[priceListKey] || c.priceList).map((pl: any) => ({ productId: pl.productId, price: Number(pl.price) || 0, unit: pl.unit || '斤' })), 
            offDays: safeJsonArray(c.公休日週期JSON || c.公休日週期 || c.offDays), 
            holidayDates: safeJsonArray(c.特定公休日JSON || c.特定公休日 || c.holidayDates),
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
              deliveryMethod: o.配送方式 || o.deliveryMethod || '',
              lastUpdated: Number(o.lastUpdated) || 0,
              syncStatus: 'synced' // Default to synced for fetched data
            }; 
          } 
          const prodName = o.品項 || o.productName; 
          const prod = mappedProducts.find(p => p.name === prodName); 
          orderMap[oid].items.push({ productId: prod ? prod.id : prodName, quantity: Number(o.數量 || o.quantity) || 0, unit: o.unit || prod?.unit || '斤' }); 
        }); 
        
        const newOrders = Object.values(orderMap);

        if (isSilent) {
            const omitMetadata = (obj: any) => {
                const { lastUpdated, syncStatus, errorMessage, pendingAction, ...rest } = obj;
                return rest;
            };

            const stableStringify = (obj: any) => {
                if (typeof obj !== 'object' || obj === null) return JSON.stringify(obj);
                const keys = Object.keys(obj).sort();
                const sortedObj = keys.reduce((acc: any, key) => {
                    acc[key] = obj[key];
                    return acc;
                }, {});
                return JSON.stringify(sortedObj);
            };

            const hasChanges = (local: any[], server: any[], idKey: string = 'id') => {
                const localMap = new Map(local.map(i => [i[idKey], i]));
                const serverMap = new Map(server.map(i => [i[idKey], i]));
                
                for (const serverItem of server) {
                    const localItem = localMap.get(serverItem[idKey]);
                    if (!localItem) return true; // Server has new item
                    
                    // If local item is pending, ignore
                    if (localItem.syncStatus === 'pending' || localItem.syncStatus === 'error') continue;
                    
                    const serverStr = stableStringify(omitMetadata(serverItem));
                    const localStr = stableStringify(omitMetadata(localItem));
                    
                    if (serverStr !== localStr) return true;
                }
                
                for (const localItem of local) {
                    if (localItem.syncStatus === 'pending' || localItem.syncStatus === 'error') continue;
                    if (!serverMap.has(localItem[idKey])) return true; // Server deleted item
                }
                return false;
            };
            
            const customersChanged = hasChanges(customers, mappedCustomers);
            const productsChanged = hasChanges(products, mappedProducts);
            const ordersChanged = hasChanges(orders, newOrders);
            
            if (customersChanged || productsChanged || ordersChanged) {
                 setPendingData({
                    customers: mappedCustomers,
                    products: mappedProducts,
                    orders: newOrders
                });
            }
        } else {
            setCustomers(mappedCustomers); 
            setProducts(mappedProducts); 
            setOrders(newOrders); 
            if (!isSilent) addToast('雲端資料已同步完成 (近60天)', 'success'); 
        }
      } 
    } catch (e) { 
      console.error("無法連線至雲端:", e); 
      if (!isSilent) addToast("同步失敗，請檢查網路連線", 'error'); 
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
      const res = await fetch(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'login', data: { password: pwd } }) }); 
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
      const res = await fetch(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'changePassword', data: { oldPassword: oldPwd, newPassword: newPwd } }) }); 
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
    localStorage.setItem('nm_gas_url', newUrl); 
    setApiEndpoint(newUrl); 
  };

  const handleForceRetry = async () => {
    if (!conflictData || !apiEndpoint) return;
    setIsSaving(true);
    
    const newPayload = { ...conflictData.data, force: true };
    
    try {
      const res = await fetch(apiEndpoint, { 
        method: 'POST', 
        body: JSON.stringify({ action: conflictData.action, data: newPayload }) 
      });
      const json = await res.json();
      
      if (json.success) {
        addToast('強制覆蓋成功', 'success');
        setConflictData(null);
        syncData(true);
        return true;
      } else {
        addToast('強制覆蓋失敗，請檢查網路', 'error');
        return false;
      }
    } catch (e) {
      console.error(e);
      addToast('強制覆蓋發生錯誤', 'error');
      return false;
    } finally {
      setIsSaving(false);
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
    onConflict: (data: any) => void,
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
                    return { productName: p?.name || item.productId, quantity: item.quantity, unit: item.unit };
                });

                const payload = { ...newOrder, items: uploadItems };
                
                // CRITICAL: Use the version from the chain, NOT just what was passed in.
                if (versionToUse !== undefined) {
                    (payload as any).originalLastUpdated = versionToUse;
                }

                const res = await fetch(apiEndpoint, {
                    method: 'POST',
                    body: JSON.stringify({ action: actionName, data: payload })
                });
                const json = await res.json();

                if (!json.success) {
                    if (json.errorCode === 'ERR_VERSION_CONFLICT') {
                        onConflict(payload);
                    } else {
                        onError(json.error || 'Unknown error');
                    }
                    // If failed, return the version we tried to use, so the next task uses it (or fails too)
                    // Or return undefined to let next task fallback to its own originalLastUpdated?
                    // Returning versionToUse is safer to maintain the chain's state.
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
      syncData(false); 
    } 
  }, [isAuthenticated, syncData]);

  return {
    isAuthenticated, setIsAuthenticated,
    apiEndpoint, setApiEndpoint,
    customers, setCustomers,
    products, setProducts,
    orders, setOrders,
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
    pendingData,
    applyPendingUpdates
  };
};
