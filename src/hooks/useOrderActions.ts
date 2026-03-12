import React, { useCallback } from 'react';
import { Customer, Product, Order, OrderStatus, OrderItem, ToastType } from '../types';
import { formatTimeForInput, formatTimeDisplay } from '../utils';

interface UseOrderActionsProps {
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  customers: Customer[];
  products: Product[];
  selectedDate: string;
  apiEndpoint: string;
  isSaving: boolean;
  setIsSaving: (isSaving: boolean) => void;
  orderForm: any;
  setOrderForm: React.Dispatch<React.SetStateAction<any>>;
  editingOrderId: string | null;
  setEditingOrderId: (id: string | null) => void;
  editingVersionRef: React.MutableRefObject<number | undefined>;
  quickAddData: any;
  setQuickAddData: React.Dispatch<React.SetStateAction<any>>;
  groupedOrders: { [key: string]: Order[] };
  orderSummary: any;
  saveOrderToCloud: any;
  setConflictData: any;
  addToast: (msg: string, type: ToastType) => void;
  setIsAddingOrder: (isAdding: boolean) => void;
  setIsEditingCustomer: (id: string | null) => void;
  setIsEditingProduct: (id: string | null) => void;
  setConfirmConfig: React.Dispatch<React.SetStateAction<any>>;
  handleForceRetry: () => Promise<boolean>;
  lastOrderCandidate: any;
  setLastOrderCandidate: React.Dispatch<React.SetStateAction<any>>;
  setToasts: React.Dispatch<React.SetStateAction<any[]>>;
}

export const useOrderActions = ({
  orders,
  setOrders,
  customers,
  products,
  selectedDate,
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
}: UseOrderActionsProps) => {

  const findLastOrder = (customerId: string, customerName: string) => {
    const customerOrders = orders.filter(o => o.customerName === customerName || customers.find(c => c.id === customerId)?.name === o.customerName);
    
    // 1. Calculate same day last week
    const currentDay = new Date(selectedDate);
    const lastWeekDate = new Date(currentDay);
    lastWeekDate.setDate(currentDay.getDate() - 7);
    // Helper to format date as YYYY-MM-DD manually since we don't have formatDateStr imported here (it's in utils but let's be safe)
    // Actually formatDateStr is imported in utils.ts, let's assume we can use a local helper or just standard ISO string slice
    const lastWeekDateStr = lastWeekDate.toISOString().split('T')[0]; 

    // 2. Try to find order from same day last week
    const sameDayLastWeekOrder = customerOrders.find(o => o.deliveryDate === lastWeekDateStr);

    if (sameDayLastWeekOrder && sameDayLastWeekOrder.items.length > 0) {
       setLastOrderCandidate({ 
         date: sameDayLastWeekOrder.deliveryDate, 
         items: sameDayLastWeekOrder.items.map(i => ({...i})),
         sourceLabel: '上週同日' 
       });
       return;
    }

    // 3. Fallback: Find most recent order (excluding today)
    const sorted = customerOrders.sort((a, b) => new Date(b.deliveryDate).getTime() - new Date(a.deliveryDate).getTime());
    const last = sorted.find(o => o.deliveryDate !== selectedDate);
    
    if (last && last.items.length > 0) {
      setLastOrderCandidate({ 
        date: last.deliveryDate, 
        items: last.items.map(i => ({...i})),
        sourceLabel: '最近一次'
      });
    } else {
      setLastOrderCandidate(null);
    }
  };

  const applyLastOrder = () => {
    if (!lastOrderCandidate) return;
    setOrderForm((prev: any) => ({ ...prev, items: lastOrderCandidate.items.map((i: any) => ({...i})) }));
    setLastOrderCandidate(null);
    addToast(`已帶入${lastOrderCandidate.sourceLabel || '上次'}訂單內容`, 'success');
  };

  const handleSelectExistingCustomer = (id: string) => {
    const cust = customers.find(c => c.id === id);
    if (cust) {
      if (groupedOrders[cust.name] && groupedOrders[cust.name].length > 0) {
        addToast(`注意：${cust.name} 今日已建立過訂單`, 'info');
      }
      
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const isAdhoc = cust.category === 'adhoc';

      setOrderForm(prev => {
        // 判斷目前的 items 是否為乾淨的預設狀態
        const isDefaultItems = prev.items.length === 1 && prev.items[0].productId === '' && prev.items[0].quantity === 10;
        // 如果是乾淨狀態，才帶入客戶的預設品項；否則保留目前的品項（例如語音解析出來的結果）
        const newItems = isDefaultItems 
          ? (cust.defaultItems && cust.defaultItems.length > 0 ? cust.defaultItems.map(di => ({ ...di })) : [{ productId: '', quantity: 10, unit: '斤' }])
          : prev.items;

        return {
          ...prev,
          customerId: id,
          customerName: cust.name,
          deliveryTime: isAdhoc ? currentTime : formatTimeForInput(cust.deliveryTime),
          deliveryMethod: cust.deliveryMethod || '',
          trip: cust.defaultTrip || '', // 👈 這裡會正確帶入預設趟數
          items: newItems
        };
      });
      findLastOrder(id, cust.name);
    }
  };

  const handleQuickAddSubmit = async () => {
    if (!quickAddData || isSaving) return;
    const validItems = quickAddData.items.filter((i: any) => i.productId && i.quantity > 0);
    if (validItems.length === 0) return;

    setIsSaving(true);
    const existingOrders = groupedOrders[quickAddData.customerName] || [];
    const baseOrder = existingOrders[0];
    const now = new Date();
    const deliveryTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const customer = customers.find(c => c.name === quickAddData.customerName);
    const deliveryMethod = baseOrder?.deliveryMethod || customer?.deliveryMethod || '';

    const processedItems = validItems.map((item: any) => {
      let finalQuantity = Math.max(0, item.quantity);
      let finalUnit = item.unit;
      const product = products.find(p => p.id === item.productId);
      const targetUnit = product?.unit || '斤';

      if (item.unit === '元') {
        const priceItem = customer?.priceList?.find(pl => pl.productId === item.productId);
        const unitPrice = priceItem ? priceItem.price : (product?.price || 0);
        if (unitPrice > 0) {
          finalQuantity = parseFloat((finalQuantity / unitPrice).toFixed(2));
          finalUnit = targetUnit;
        }
      } else if (item.unit === '公斤' && targetUnit === '斤') {
        finalQuantity = parseFloat((finalQuantity * (1000 / 600)).toFixed(2));
        finalUnit = '斤';
      }
      return { productId: item.productId, quantity: Math.max(0, finalQuantity), unit: finalUnit };
    });

    const newOrder: Order = {
      id: 'Q-ORD-' + Date.now(),
      createdAt: new Date().toISOString(),
      customerName: quickAddData.customerName,
      deliveryDate: selectedDate,
      deliveryTime: deliveryTime,
      deliveryMethod: deliveryMethod,
      items: processedItems,
      note: '追加單',
      status: OrderStatus.PENDING
    };

    try {
      if (apiEndpoint) {
        const uploadItems = processedItems.map((item: any) => {
          const p = products.find(prod => prod.id === item.productId);
          return { productName: p?.name || item.productId, quantity: item.quantity, unit: item.unit };
        });
        await fetch(apiEndpoint, {
          method: 'POST',
          body: JSON.stringify({ action: 'createOrder', data: { ...newOrder, items: uploadItems } })
        });
      }
    } catch (e) {
      console.error(e);
      addToast("追加失敗，請檢查網路", 'error');
    }

    setOrders((prev: Order[]) => [newOrder, ...prev]);
    setIsSaving(false);
    setQuickAddData(null);
    addToast('追加訂單成功！', 'success');
  };

  const handleRetryOrder = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    if (order.pendingAction === 'delete') {
      await executeDeleteOrder(orderId);
      return;
    }

    // For create/update
    setOrders((prev: Order[]) => prev.map(o => o.id === orderId ? { ...o, syncStatus: 'pending', errorMessage: undefined } : o));
    
    // Determine action name
    const actionName = order.pendingAction === 'create' ? 'createOrder' : 'updateOrderContent';
    // Note: updateOrderStatus also sets pendingAction='update', but the payload is different.
    // We need to distinguish between content update and status update?
    // Actually updateOrderStatus uses 'updateOrderStatus' action name.
    // Maybe we need more granular pendingAction or check the payload structure?
    // For simplicity, let's assume 'update' means content update for now, unless we add 'updateStatus'.
    // But wait, updateOrderStatus sets status directly.
    // Let's check updateOrderStatus implementation. It calls API with 'updateOrderStatus'.
    // If we want to retry status update, we need to know it was a status update.
    
    // Let's refine pendingAction: 'create' | 'update' | 'delete' | 'statusUpdate'
    
    let realActionName = actionName;
    if (order.pendingAction === 'statusUpdate') {
        realActionName = 'updateOrderStatus';
    }

    await saveOrderToCloud(
      order,
      realActionName,
      order.lastUpdated, // Use current lastUpdated
      () => {
        setOrders((prev: Order[]) => prev.map(o => o.id === orderId ? { ...o, syncStatus: 'synced', pendingAction: undefined } : o));
        addToast('重試同步成功', 'success');
      },
      (errMsg: string) => {
        setOrders((prev: Order[]) => prev.map(o => o.id === orderId ? { ...o, syncStatus: 'error', errorMessage: errMsg } : o));
        addToast("重試失敗", 'error');
      }
    );
  };

  const batchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = React.useRef<Map<string, { id: string, status: OrderStatus, originalLastUpdated: number, force: boolean }>>(new Map());

  const updateOrderStatus = useCallback(async (orderId: string, newStatus: OrderStatus, showDefaultToast: boolean = true) => {
    const orderToUpdate = orders.find(o => o.id === orderId);
    if (!orderToUpdate) return;

    // Optimistic update
    setOrders((prev: Order[]) => prev.map(o => o.id === orderId ? { ...o, status: newStatus, syncStatus: 'pending', pendingAction: 'statusUpdate' } : o));

    // Add to pending updates map
    pendingUpdatesRef.current.set(orderId, {
      id: orderId,
      status: newStatus,
      originalLastUpdated: orderToUpdate.lastUpdated || 0,
      force: true // Force update for status changes to avoid conflicts
    });

    if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
    }

    batchTimeoutRef.current = setTimeout(async () => {
        const updatesToProcess: { id: string, status: OrderStatus, originalLastUpdated: number, force: boolean }[] = Array.from(pendingUpdatesRef.current.values());
        pendingUpdatesRef.current.clear(); // Clear the map for future updates
        batchTimeoutRef.current = null;

        if (updatesToProcess.length === 0) return;

        try {
            if (apiEndpoint) {
                const res = await fetch(apiEndpoint, {
                    method: 'POST',
                    body: JSON.stringify({ 
                        action: 'batchUpdateOrders', 
                        data: { updates: updatesToProcess } 
                    })
                });
                const json = await res.json();

                if (!json.success) {
                    if (json.errorCode === 'ERR_VERSION_CONFLICT') {
                         setConflictData({
                           action: 'batchUpdateOrders',
                           data: { updates: updatesToProcess },
                           description: `批量更新狀態發生版本衝突`
                         });
                    } else {
                         throw new Error(json.error || 'Unknown error');
                    }
                } else {
                    // Success!
                    const newVersion = json.data.newLastUpdatedTs;
                    const updatedIds = updatesToProcess.map(u => u.id);
                    
                    setOrders((prev: Order[]) => prev.map(o => {
                        if (updatedIds.includes(o.id)) {
                            return { ...o, syncStatus: 'synced', pendingAction: undefined, lastUpdated: newVersion };
                        }
                        return o;
                    }));
                }
            }
        } catch (e) {
            console.error("Batch Sync Failed:", e);
            const updatedIds = updatesToProcess.map(u => u.id);
            setOrders((prev: Order[]) => prev.map(o => {
                if (updatedIds.includes(o.id)) {
                    return { ...o, syncStatus: 'error', errorMessage: e instanceof Error ? e.message : 'Network error' };
                }
                return o;
            }));
            if (showDefaultToast) addToast("狀態更新失敗，已標記為錯誤", 'error');
        }
    }, 1000);
    
  }, [orders, apiEndpoint, addToast, setOrders, setConflictData]);

  const handleBatchSettleOrders = useCallback(async (orderIds: string[]) => {
    if (!orderIds.length) return;

    // Optimistic update
    setOrders((prev: Order[]) => prev.map(o => 
      orderIds.includes(o.id) ? { ...o, status: OrderStatus.PAID, syncStatus: 'pending', pendingAction: 'statusUpdate' } : o
    ));

    // Add to pending updates map
    orderIds.forEach(orderId => {
      const orderToUpdate = orders.find(o => o.id === orderId);
      if (orderToUpdate) {
        pendingUpdatesRef.current.set(orderId, {
          id: orderId,
          status: OrderStatus.PAID,
          originalLastUpdated: orderToUpdate.lastUpdated || 0,
          force: true
        });
      }
    });

    if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
    }

    // Trigger batch update immediately and return a promise
    return new Promise<void>((resolve) => {
      batchTimeoutRef.current = setTimeout(async () => {
          const updatesToProcess = Array.from(pendingUpdatesRef.current.values());
          pendingUpdatesRef.current.clear();
          batchTimeoutRef.current = null;

          if (updatesToProcess.length === 0) {
            resolve();
            return;
          }

          try {
              if (apiEndpoint) {
                  const res = await fetch(apiEndpoint, {
                      method: 'POST',
                      body: JSON.stringify({ 
                          action: 'batchUpdateOrders', 
                          data: { updates: updatesToProcess } 
                      })
                  });
                  const json = await res.json();

                  if (!json.success) {
                      if (json.errorCode === 'ERR_VERSION_CONFLICT') {
                           setConflictData({
                             action: 'batchUpdateOrders',
                             data: { updates: updatesToProcess },
                             description: `批量結帳更新發生版本衝突`
                           });
                      } else {
                           throw new Error(json.error || 'Unknown error');
                      }
                  } else {
                      // Success!
                      const newVersion = json.data.newLastUpdatedTs;
                      const updatedIds = updatesToProcess.map(u => u.id);
                      
                      setOrders((prev: Order[]) => prev.map(o => {
                          if (updatedIds.includes(o.id)) {
                              return { ...o, syncStatus: 'synced', pendingAction: undefined, lastUpdated: newVersion };
                          }
                          return o;
                      }));
                      addToast(`已成功結清 ${orderIds.length} 筆訂單`, 'success');
                  }
              }
          } catch (e) {
              console.error("Batch Sync Failed:", e);
              const updatedIds = updatesToProcess.map(u => u.id);
              setOrders((prev: Order[]) => prev.map(o => {
                  if (updatedIds.includes(o.id)) {
                      return { ...o, syncStatus: 'error', errorMessage: e instanceof Error ? e.message : 'Network error' };
                  }
                  return o;
              }));
              addToast("結帳更新失敗，已標記為錯誤", 'error');
          } finally {
              resolve();
          }
      }, 100);
    });

  }, [orders, apiEndpoint, addToast, setOrders, setConflictData]);

  const handleSwipeStatusChange = useCallback((orderId: string, newStatus: OrderStatus) => {
    const order = orders.find(o => o.id === orderId);
    if (!order || order.status === newStatus) return;

    updateOrderStatus(orderId, newStatus, false);

    const getLabel = (s: OrderStatus) => {
      if (s === OrderStatus.PENDING) return '待處理';
      if (s === OrderStatus.SHIPPED) return '已配送';
      if (s === OrderStatus.PAID) return '已收款';
      return s;
    };

    const toastId = Date.now().toString();
    setToasts((prev: any[]) => [...prev, {
      id: toastId,
      message: `已標記為 ${getLabel(newStatus)}`,
      type: 'success',
      action: {
        label: '復原',
        onClick: () => updateOrderStatus(orderId, order.status, true)
      }
    }]);
    
    setTimeout(() => {
       setToasts((prev: any[]) => prev.filter(t => t.id !== toastId));
    }, 3000);

  }, [orders, updateOrderStatus, setToasts]);

  const handleCopyOrder = (custName: string, ordersToCopy: Order[]) => {
    const customer = customers.find(c => c.name === custName);
    let totalAmount = 0;
    const lines = [`📅 訂單日期: ${selectedDate}`, `👤 客戶: ${custName}`];
    lines.push('----------------');

    ordersToCopy.forEach(o => {
      o.items.forEach(item => {
        const p = products.find(prod => prod.id === item.productId);
        const pName = p?.name || item.productId;
        const unit = item.unit || p?.unit || '斤';
        let itemPrice = 0;

        if (unit === '元') {
          itemPrice = item.quantity;
        } else {
          const priceInfo = customer?.priceList?.find(pl => pl.productId === item.productId);
          const uPrice = priceInfo ? priceInfo.price : 0;
          itemPrice = Math.round(item.quantity * uPrice);
        }
        totalAmount += itemPrice;
        lines.push(`- ${pName}: ${item.quantity}${unit}`);
      });
    });

    lines.push('----------------');
    lines.push(`💰 總金額: $${totalAmount.toLocaleString()}`);
    if (ordersToCopy[0]?.note) lines.push(`📝 備註: ${ordersToCopy[0].note}`);

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      addToast('訂單內容已複製！', 'success');
    });
  };

  const handleShareOrder = async (order: Order) => {
    const customer = customers.find(c => c.name === order.customerName);
    const calculateOrderTotalAmount = (order: Order) => {
        const customer = customers.find(c => c.name === order.customerName);
        let total = 0;
        (Array.isArray(order.items) ? order.items : []).forEach(item => {
            const product = products.find(p => p.id === item.productId || p.name === item.productId);
            const priceItem = customer?.priceList?.find(pl => pl.productId === (product?.id || item.productId));
            const unitPrice = priceItem ? priceItem.price : (product?.price || 0);
            if (item.unit === '元') {
                total += item.quantity;
            } else {
                total += Math.round(item.quantity * unitPrice);
            }
        });
        return total;
    };
    const totalAmount = calculateOrderTotalAmount(order);

    let text = `🚚 配送單 [${order.deliveryDate}]\n`;
    text += `----------------\n`;
    text += `👤 客戶: ${order.customerName}\n`;
    if (customer?.phone) text += `📞 電話: ${customer.phone}\n`;
    text += `⏰ 時間: ${formatTimeDisplay(order.deliveryTime)}\n`;
    if (order.deliveryMethod) text += `🛵 方式: ${order.deliveryMethod}\n`;
    text += `\n📦 品項:\n`;

    order.items.forEach(item => {
      const p = products.find(prod => prod.id === item.productId || prod.name === item.productId);
      text += `- ${p?.name || item.productId}: ${item.quantity} ${item.unit}\n`;
    });

    if (order.note) text += `\n📝 備註: ${order.note}\n`;
    text += `----------------\n`;
    text += `💰 總金額: $${totalAmount.toLocaleString()}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: `配送單 - ${order.customerName}`, text: text });
      } catch (err) {
        console.log('Share canceled');
      }
    } else {
      navigator.clipboard.writeText(text);
      addToast('配送資訊已複製！', 'success');
    }
  };

  const handleCopyStatement = (customerName: string, totalDebt: number, orders: Order[]) => {
    let text = `【對帳單】${customerName} 老闆 您好：\n目前未結清款項共計：$${totalDebt.toLocaleString()}\n\n明細如下：\n`;
    orders.forEach(o => {
      let dailyTotal = 0;
      let itemDetails = '';
      
      // 逐筆列出商品明細
      o.items.forEach(item => {
        const p = products.find(x => x.id === item.productId);
        const productName = p?.name || '未知商品';
        
        let itemTotal = 0;
        if (item.unit === '元') {
          itemTotal = item.quantity;
        } else {
          const cust = customers.find(c => c.name === customerName);
          const priceInfo = cust?.priceList?.find(pl => pl.productId === item.productId);
          const price = priceInfo ? priceInfo.price : 0;
          itemTotal = Math.round(item.quantity * price);
        }
        
        dailyTotal += itemTotal;
        // 組合單項商品字串，例如： • 豬肉 10斤 ($500)
        itemDetails += `  • ${productName} ${item.quantity}${item.unit} ($${itemTotal.toLocaleString()})\n`;
      });

      const dateStr = o.deliveryDate.substring(5).replace('-', '/'); // 轉為 MM/DD
      // 將日期、小計與商品明細組合
      text += `- ${dateStr} 小計: $${dailyTotal.toLocaleString()}\n${itemDetails}`;
    });
    text += `\n再麻煩您確認，謝謝！`;
    
    navigator.clipboard.writeText(text).then(() => addToast('對帳單文字已複製', 'success'));
  };

  const handleShareStatementToLine = (customerName: string, totalDebt: number, orders: Order[]) => {
    let text = `【對帳單】${customerName} 老闆 您好：\n目前未結清款項共計：$${totalDebt.toLocaleString()}\n\n明細如下：\n`;
    orders.forEach(o => {
      let dailyTotal = 0;
      let itemDetails = '';
      
      // 逐筆列出商品明細
      o.items.forEach(item => {
        const p = products.find(x => x.id === item.productId);
        const productName = p?.name || '未知商品';
        
        let itemTotal = 0;
        if (item.unit === '元') {
          itemTotal = item.quantity;
        } else {
          const cust = customers.find(c => c.name === customerName);
          const priceInfo = cust?.priceList?.find(pl => pl.productId === item.productId);
          const price = priceInfo ? priceInfo.price : 0;
          itemTotal = Math.round(item.quantity * price);
        }
        
        dailyTotal += itemTotal;
        // 組合單項商品字串，例如： • 豬肉 10斤 ($500)
        itemDetails += `  • ${productName} ${item.quantity}${item.unit} ($${itemTotal.toLocaleString()})\n`;
      });

      const dateStr = o.deliveryDate.substring(5).replace('-', '/'); // 轉為 MM/DD
      // 將日期、小計與商品明細組合
      text += `- ${dateStr} 小計: $${dailyTotal.toLocaleString()}\n${itemDetails}`;
    });
    text += `\n再麻煩您確認，謝謝！`;
    
    const encodedText = encodeURIComponent(text);
    window.open(`https://line.me/R/msg/text/?${encodedText}`, '_blank');
  };

  const openGoogleMaps = (name: string) => {
    const query = encodeURIComponent(name);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
  };

  const handleEditOrder = (order: Order) => {
    setEditingOrderId(order.id);
    editingVersionRef.current = order.lastUpdated;

    const cust = customers.find(c => c.name === order.customerName);
    setOrderForm({
      customerType: 'existing',
      customerId: cust ? cust.id : '',
      customerName: order.customerName,
      deliveryTime: formatTimeForInput(order.deliveryTime),
      deliveryMethod: order.deliveryMethod || cust?.deliveryMethod || '',
      trip: order.trip || cust?.defaultTrip || '', // 👈 新增這行：優先使用訂單原本的趟數，否則使用客戶預設
      items: order.items.map(i => ({ ...i })),
      note: order.note
    });
    setIsAddingOrder(true);
  };

  const handleCreateOrderFromCustomer = (c: Customer) => {
    const proceedWithCreation = () => {
      setEditingOrderId(null);
      editingVersionRef.current = undefined;
      setOrderForm({
        customerType: 'existing',
        customerId: c.id,
        customerName: c.name,
        deliveryTime: formatTimeForInput(c.deliveryTime),
        deliveryMethod: c.deliveryMethod || '',
        trip: c.defaultTrip || '',
        items: c.defaultItems && c.defaultItems.length > 0 ? c.defaultItems.map(di => ({ ...di })) : [{ productId: '', quantity: 10, unit: '斤' }],
        note: ''
      });
      findLastOrder(c.id, c.name);
      setIsAddingOrder(true);
    };

    const dateObj = new Date(selectedDate);
    const dayOfWeek = dateObj.getDay();
    const isWeeklyOff = (c.offDays || []).includes(dayOfWeek);
    const isHoliday = (c.holidayDates || []).includes(selectedDate);
    const isRestingToday = isWeeklyOff || isHoliday;

    const checkExistingOrder = () => {
      if (groupedOrders[c.name] && groupedOrders[c.name].length > 0) {
        setConfirmConfig({
          isOpen: true,
          title: '重複訂單提醒',
          message: `「${c.name}」在今日 (${selectedDate}) 已經有訂單了！\n\n確定要「追加」一筆新訂單嗎？`,
          onConfirm: () => {
            setConfirmConfig((prev: any) => ({ ...prev, isOpen: false }));
            proceedWithCreation();
          }
        });
      } else {
        proceedWithCreation();
      }
    };

    if (isRestingToday) {
      setConfirmConfig({
        isOpen: true,
        title: '公休提醒',
        message: `「${c.name}」今日公休，確定要強制建立訂單嗎？`,
        onConfirm: () => {
          setConfirmConfig((prev: any) => ({ ...prev, isOpen: false }));
          checkExistingOrder();
        }
      });
    } else {
      checkExistingOrder();
    }
  };

  const handleSaveOrder = async () => {
    if (!orderForm.customerName || orderForm.items.length === 0) {
      addToast('請填寫完整訂單資訊', 'error');
      return;
    }

    setIsSaving(true);
    const now = new Date();
    const deliveryTime = orderForm.deliveryTime || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const processedItems = orderForm.items.map((item: any) => {
      let finalQuantity = Math.max(0, item.quantity);
      let finalUnit = item.unit;
      const product = products.find(p => p.id === item.productId);
      const targetUnit = product?.unit || '斤';

      if (item.unit === '元') {
        const customer = customers.find(c => c.id === orderForm.customerId);
        const priceItem = customer?.priceList?.find(pl => pl.productId === item.productId);
        const unitPrice = priceItem ? priceItem.price : (product?.price || 0);
        if (unitPrice > 0) {
          finalQuantity = parseFloat((finalQuantity / unitPrice).toFixed(2));
          finalUnit = targetUnit;
        }
      } else if (item.unit === '公斤' && targetUnit === '斤') {
        finalQuantity = parseFloat((finalQuantity * (1000 / 600)).toFixed(2));
        finalUnit = '斤';
      }
      return { productId: item.productId, quantity: Math.max(0, finalQuantity), unit: finalUnit };
    });

    const newOrder: Order = {
      id: editingOrderId || 'ORD-' + Date.now(),
      createdAt: editingOrderId ? (orders.find(o => o.id === editingOrderId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
      customerName: orderForm.customerName,
      deliveryDate: selectedDate,
      deliveryTime: deliveryTime,
      deliveryMethod: orderForm.deliveryMethod,
      trip: orderForm.trip || '未分配',
      items: processedItems,
      note: orderForm.note,
      status: editingOrderId ? (orders.find(o => o.id === editingOrderId)?.status || OrderStatus.PENDING) : OrderStatus.PENDING,
      lastUpdated: editingOrderId ? editingVersionRef.current : undefined,
      syncStatus: 'pending',
      pendingAction: editingOrderId ? 'update' : 'create'
    };

    // Optimistic Update
    if (editingOrderId) {
      setOrders((prev: Order[]) => prev.map(o => o.id === editingOrderId ? newOrder : o));
    } else {
      setOrders((prev: Order[]) => [newOrder, ...prev]);
    }

    setIsAddingOrder(false);
    setEditingOrderId(null);
    setOrderForm({ customerType: 'existing', customerId: '', customerName: '', deliveryTime: '', deliveryMethod: '', trip: '', items: [{ productId: '', quantity: 10, unit: '斤' }], note: '' });
    setIsSaving(false);
    addToast(editingOrderId ? '訂單已更新 (同步中...)' : '訂單已建立 (同步中...)', 'success');

    // Background Sync
    await saveOrderToCloud(
      newOrder,
      editingOrderId ? 'updateOrderContent' : 'createOrder',
      editingVersionRef.current,
      () => {
         setOrders((prev: Order[]) => prev.map(o => o.id === newOrder.id ? { ...o, syncStatus: 'synced', pendingAction: undefined } : o));
         addToast('同步成功', 'success');
      },
      (errMsg: string) => {
         setOrders((prev: Order[]) => prev.map(o => o.id === newOrder.id ? { ...o, syncStatus: 'error', errorMessage: errMsg } : o));
         addToast("同步失敗，已標記為錯誤", 'error');
      }
    );
  };

  const handleForceRetryWrapper = async () => {
    const success = await handleForceRetry();
    if (success) {
      setIsAddingOrder(false);
      setEditingOrderId(null);
      setIsEditingCustomer(null);
      setIsEditingProduct(null);
    }
  };

  const executeDeleteOrder = async (orderId: string) => { 
    setConfirmConfig((prev: any) => ({ ...prev, isOpen: false })); 
    const orderBackup = orders.find(o => o.id === orderId); 
    if (!orderBackup) return; 
    setOrders((prev: Order[]) => prev.filter(o => o.id !== orderId)); 
    try { 
      if (apiEndpoint) { 
        const payload = { id: orderId, originalLastUpdated: orderBackup.lastUpdated };
        const res = await fetch(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'deleteOrder', data: payload }) }); 
        const json = await res.json();
        if (!json.success) {
           if (json.errorCode === 'ERR_VERSION_CONFLICT') {
              setOrders((prev: Order[]) => [...prev, orderBackup]); // Revert
              setConflictData({
                 action: 'deleteOrder',
                 data: payload,
                 description: `刪除訂單: ${orderBackup.customerName}`
              });
           } else {
              // Add back with error status
              setOrders((prev: Order[]) => [...prev, { ...orderBackup, syncStatus: 'error', errorMessage: json.error || 'Delete failed', pendingAction: 'delete' }]);
              addToast("刪除失敗，已標記為錯誤", 'error');
           }
        }
      } 
    } catch (e) { 
      console.error("刪除失敗:", e); 
      setOrders((prev: Order[]) => [...prev, { ...orderBackup, syncStatus: 'error', errorMessage: e instanceof Error ? e.message : 'Network error', pendingAction: 'delete' }]);
      addToast("刪除失敗，已標記為錯誤", 'error'); 
    } 
  };

  const handleBatchUpdateTrip = async (tripName: string, selectedOrderIds: Set<string>, setSelectedOrderIds: (s: Set<string>) => void, setIsSelectionMode: (b: boolean) => void) => {
    if (selectedOrderIds.size === 0) return;
    setIsSaving(true);
    
    const ids = Array.from(selectedOrderIds);
    const updatedOrders = orders.map(o => {
      if (ids.includes(o.id)) {
        return { ...o, trip: tripName, syncStatus: 'pending' as const, pendingAction: 'update' as const };
      }
      return o;
    });
    setOrders(updatedOrders);
    
    // Process one by one
    for (const id of ids) {
      const order = updatedOrders.find(o => o.id === id);
      if (order) {
        await saveOrderToCloud(
          order,
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
    setIsSaving(false);
    addToast(`已將 ${ids.length} 筆訂單設為 ${tripName}`, 'success');
  };

  const handleDeleteOrder = (orderId: string) => { setConfirmConfig({ isOpen: true, title: '刪除訂單', message: '確定要刪除此訂單嗎？\n此動作將會同步刪除雲端資料。', onConfirm: () => executeDeleteOrder(orderId) }); };

  return {
    handleQuickAddSubmit,
    updateOrderStatus,
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
    findLastOrder,
    applyLastOrder,
    handleSelectExistingCustomer,
    openGoogleMaps,
    handleDeleteOrder,
    handleRetryOrder,
    handleBatchUpdateTrip
  };
};