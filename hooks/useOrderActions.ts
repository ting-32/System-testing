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

  const getLastOrderItems = (customerId: string, customerName: string) => {
    const customerOrders = orders.filter(o => o.customerName === customerName || customers.find(c => c.id === customerId)?.name === o.customerName);
    
    // 1. Calculate same day last week
    const currentDay = new Date(selectedDate);
    const lastWeekDate = new Date(currentDay);
    lastWeekDate.setDate(currentDay.getDate() - 7);
    const lastWeekDateStr = lastWeekDate.toISOString().split('T')[0]; 

    // 2. Try to find order from same day last week
    const sameDayLastWeekOrder = customerOrders.find(o => o.deliveryDate === lastWeekDateStr);

    if (sameDayLastWeekOrder && sameDayLastWeekOrder.items.length > 0) {
       return { 
         date: sameDayLastWeekOrder.deliveryDate, 
         items: sameDayLastWeekOrder.items.map(i => ({...i})),
         sourceLabel: '上週同日' 
       };
    }

    // 3. Fallback: Find most recent order (excluding today)
    const sorted = customerOrders.sort((a, b) => new Date(b.deliveryDate).getTime() - new Date(a.deliveryDate).getTime());
    const last = sorted.find(o => o.deliveryDate !== selectedDate);
    
    if (last && last.items.length > 0) {
      return { 
        date: last.deliveryDate, 
        items: last.items.map(i => ({...i})),
        sourceLabel: '最近一次'
      };
    }
    return null;
  };

  const findLastOrder = (customerId: string, customerName: string) => {
    const result = getLastOrderItems(customerId, customerName);
    if (result) {
      setLastOrderCandidate(result);
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

      // Smart Auto-fill Logic
      let initialItems = [{ productId: '', quantity: 10, unit: '斤' }];
      let autoFilledSource = '';

      if (cust.defaultItems && cust.defaultItems.length > 0) {
          initialItems = cust.defaultItems.map(di => ({ ...di }));
      } else {
          // If no default items, try to find last order immediately
          const lastOrder = getLastOrderItems(id, cust.name);
          if (lastOrder) {
              initialItems = lastOrder.items;
              autoFilledSource = lastOrder.sourceLabel;
          }
      }

      setOrderForm({
        ...orderForm,
        customerId: id,
        customerName: cust.name,
        deliveryTime: formatTimeForInput(cust.deliveryTime),
        deliveryMethod: cust.deliveryMethod || '',
        items: initialItems
      });
      
      // Still call this to populate the "History" button if user wants to switch back/forth
      findLastOrder(id, cust.name);

      if (autoFilledSource) {
          addToast(`已自動帶入${autoFilledSource}訂單`, 'info');
      }
    }
  };

  const handleQuickCreateOrder = async (c: Customer) => {
      if (!c.defaultItems || c.defaultItems.length === 0) {
          addToast('該客戶未設定預設品項，無法一鍵下單', 'error');
          handleCreateOrderFromCustomer(c); // Fallback to normal flow
          return;
      }

      if (groupedOrders[c.name] && groupedOrders[c.name].length > 0) {
          addToast('今日已建立過訂單，請使用一般流程追加', 'error');
          handleCreateOrderFromCustomer(c);
          return;
      }

      setIsSaving(true);
      const now = new Date();
      // Use customer default time or current time
      const deliveryTime = c.deliveryTime ? formatTimeForInput(c.deliveryTime) : `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      
      // Process items (price calculation etc.)
      const processedItems = c.defaultItems.map((item: any) => {
        let finalQuantity = Math.max(0, item.quantity);
        let finalUnit = item.unit;
        const product = products.find(p => p.id === item.productId);
        const targetUnit = product?.unit || '斤';
  
        if (item.unit === '元') {
          const priceItem = c.priceList?.find(pl => pl.productId === item.productId);
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
        customerName: c.name,
        deliveryDate: selectedDate,
        deliveryTime: deliveryTime,
        deliveryMethod: c.deliveryMethod || '',
        items: processedItems,
        note: '',
        status: OrderStatus.PENDING,
        syncStatus: 'pending',
        pendingAction: 'create'
      };

      setOrders((prev: Order[]) => [newOrder, ...prev]);
      addToast(`⚡ 已快速建立 ${c.name} 的訂單！`, 'success');
      setIsSaving(false);

      // Background Sync
      await saveOrderToCloud(
        newOrder,
        'createOrder',
        undefined,
        () => {
           setOrders((prev: Order[]) => prev.map(o => o.id === newOrder.id ? { ...o, syncStatus: 'synced', pendingAction: undefined } : o));
        },
        (conflictPayload: any) => {
           setConflictData({
             action: 'createOrder',
             data: conflictPayload,
             description: `訂單客戶：${newOrder.customerName}`
           });
        },
        (errMsg: string) => {
           setOrders((prev: Order[]) => prev.map(o => o.id === newOrder.id ? { ...o, syncStatus: 'error', errorMessage: errMsg } : o));
        }
      );
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
      (conflictPayload: any) => {
        setConflictData({
          action: realActionName,
          data: conflictPayload,
          description: `訂單客戶：${order.customerName}`
        });
      },
      (errMsg: string) => {
        setOrders((prev: Order[]) => prev.map(o => o.id === orderId ? { ...o, syncStatus: 'error', errorMessage: errMsg } : o));
        addToast("重試失敗", 'error');
      }
    );
  };

  const updateOrderStatus = useCallback(async (orderId: string, newStatus: OrderStatus, showDefaultToast: boolean = true) => {
    const orderToUpdate = orders.find(o => o.id === orderId);
    if (!orderToUpdate) return;

    // Optimistic update
    setOrders((prev: Order[]) => prev.map(o => o.id === orderId ? { ...o, status: newStatus, syncStatus: 'pending', pendingAction: 'statusUpdate' } : o));

    // Debounce logic handled by saveOrderToCloud queue? 
    // No, debounce is for UI actions. Queue is for serializing requests.
    // If we want to debounce the actual API call, we should do it here.
    // However, the user asked for debounce in updateOrderStatus.
    // But since we are using a queue now, do we still need debounce?
    // Yes, to avoid filling the queue with intermediate states if the user clicks fast.
    
    // But implementing debounce inside a callback that might be called with different arguments is tricky.
    // Usually we debounce the function itself.
    // Let's use a ref to store timeouts for each orderId.
    
    if (updateTimeoutRef.current[orderId]) {
        clearTimeout(updateTimeoutRef.current[orderId]);
    }

    updateTimeoutRef.current[orderId] = setTimeout(async () => {
        // This runs after 500ms of inactivity for this orderId
        // We need to get the LATEST status from the state, because 'newStatus' in the closure might be stale if multiple clicks happened.
        // But wait, 'orders' dependency in useCallback might make this function recreate.
        // If we use a ref for orders (like in useDataSync), we can get the latest.
        // Or we just trust that the last call to updateOrderStatus has the correct final status.
        // Yes, the last call sets the timeout with the 'newStatus' of that call.
        
        // Actually, we should call saveOrderToCloud here.
        
        // We need to pass the latest order object to saveOrderToCloud.
        // Since we optimistically updated 'orders', the 'orders' in state has the new status.
        // But 'orders' in this closure is from the render cycle where updateOrderStatus was created.
        // If we use functional state update, we are good for UI.
        // For API, we need the latest data.
        
        // Let's use the orderToUpdate (which is from the closure) but override status with newStatus.
        // And we need the latest lastUpdated... which is handled by the queue!
        
        const payloadOrder = { ...orderToUpdate, status: newStatus };
        
        await saveOrderToCloud(
            payloadOrder,
            'updateOrderStatus',
            orderToUpdate.lastUpdated, // The queue will override this with the latest version if needed
            (updatedOrder) => {
                 setOrders((prev: Order[]) => prev.map(o => o.id === orderId ? { ...o, syncStatus: 'synced', pendingAction: undefined, ...(updatedOrder ? { lastUpdated: updatedOrder.lastUpdated } : {}) } : o));
            },
            (conflictPayload: any) => {
                 setConflictData({
                   action: 'updateOrderStatus',
                   data: conflictPayload,
                   description: `更新狀態: ${orderToUpdate?.customerName}`
                 });
                 // Revert optimistic update on conflict? Or let the user resolve?
                 // Usually conflict modal handles it.
                 // But we should probably revert the syncStatus to 'error' or keep it pending until resolved.
                 // The current logic sets conflictData.
            },
            (errMsg: string) => {
                 setOrders((prev: Order[]) => prev.map(o => o.id === orderId ? { ...o, syncStatus: 'error', errorMessage: errMsg } : o));
                 if (showDefaultToast) addToast("狀態更新失敗，已標記為錯誤", 'error');
            }
        );
        
        delete updateTimeoutRef.current[orderId];
    }, 500);
    
  }, [orders, apiEndpoint, addToast, setOrders, setConflictData, saveOrderToCloud]);

  const updateTimeoutRef = React.useRef<{ [key: string]: NodeJS.Timeout }>({});

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

  const handleCopyStatement = (customerName: string, totalDebt: number) => {
    const text = `【${customerName} 對帳單】\n截至目前未結款項: $${totalDebt.toLocaleString()}\n請核對，謝謝！`;
    navigator.clipboard.writeText(text).then(() => addToast('對帳單文字已複製', 'success'));
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
        items: c.defaultItems && c.defaultItems.length > 0 ? c.defaultItems.map(di => ({ ...di })) : [{ productId: '', quantity: 10, unit: '斤' }],
        note: ''
      });
      findLastOrder(c.id, c.name);
      setIsAddingOrder(true);
    };

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
    setOrderForm({ customerType: 'existing', customerId: '', customerName: '', deliveryTime: '', deliveryMethod: '', items: [{ productId: '', quantity: 10, unit: '斤' }], note: '' });
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
      (conflictPayload: any) => {
         setConflictData({
           action: editingOrderId ? 'updateOrderContent' : 'createOrder',
           data: conflictPayload,
           description: `訂單客戶：${newOrder.customerName}`
         });
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

  const handleDeleteOrder = (orderId: string) => { setConfirmConfig({ isOpen: true, title: '刪除訂單', message: '確定要刪除此訂單嗎？\n此動作將會同步刪除雲端資料。', onConfirm: () => executeDeleteOrder(orderId) }); };

  return {
    handleQuickAddSubmit,
    updateOrderStatus,
    handleSwipeStatusChange,
    handleCopyOrder,
    handleShareOrder,
    handleCopyStatement,
    handleEditOrder,
    handleCreateOrderFromCustomer,
    handleSaveOrder,
    handleForceRetryWrapper,
    findLastOrder,
    applyLastOrder,
    handleSelectExistingCustomer,
    openGoogleMaps,
    handleDeleteOrder,
    handleRetryOrder
  };
};