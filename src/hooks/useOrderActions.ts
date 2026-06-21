import React, { useCallback, useRef } from 'react';
import { Customer, Product, Order, OrderStatus, ToastType } from '../types';
import { formatTimeForInput, formatTimeDisplay } from '../utils';
import { fetchWithRetry } from '../utils/fetchUtils';
import { broadcastDataChange } from '../services/firebaseSync';

interface UseOrderActionsProps {
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  customers: Customer[];
  products: Product[];
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  apiEndpoint: string;
  isSaving: boolean;
  setIsSaving: (isSaving: boolean) => void;
  setIsRetrying?: (isRetrying: boolean) => void;
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
  addSyncTask?: (task: any) => void;
  removeTaskByPayloadId?: (payloadId: string) => void;
  syncData?: (forceRefresh?: boolean) => void; // also add syncData if needed, wait no we need to trigger syncData, so I will add syncData to props too
}

export const useOrderActions = ({
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
}: UseOrderActionsProps) => {

  const pendingUpdatesRef = useRef<Map<string, any>>(new Map());
  const batchTimeoutRef = useRef<any>(null);

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
    setOrderForm((prev: any) => ({ ...prev, items: lastOrderCandidate.items.map((item: any) => ({
      ...item,
      productName: item.productName || products.find((p:Product) => p.id === item.productId)?.name
    })) }));
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
      const isAdhoc = cust.paymentTerm === 'adhoc';

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
      return { productId: item.productId, productName: item.productName || product?.name, quantity: Math.max(0, finalQuantity), unit: finalUnit };
    });

    const timestamp = Date.now();
    const newOrder: Order = {
      id: 'Q-ORD-' + timestamp + Math.random().toString(36).substring(2, 6),
      createdAt: new Date().toISOString(),
      customerName: quickAddData.customerName,
      deliveryDate: selectedDate,
      deliveryTime: deliveryTime,
      deliveryMethod: deliveryMethod,
      source: '',
      items: processedItems,
      note: '追加單',
      status: OrderStatus.PENDING,
      // 增加以下同步佇列必需的屬性
      syncStatus: 'pending',
      pendingAction: 'create',
      _syncStatus: 'pending',
      _localUpdatedTs: timestamp,
      lastUpdated: timestamp
    };

    // 1. 樂觀更新：立刻把訂單加入畫面
    setOrders((prev: Order[]) => [newOrder, ...prev]);
    setIsSaving(false);
    setQuickAddData(null);
    addToast('追加訂單登錄成功 (背景同步中...)', 'success');

    // 2. 交給統一的雲端佇列接手
    await saveOrderToCloud(
      newOrder,
      'createOrder',
      undefined,
      (updatedOrder: Order) => {
        // 同步成功後更新狀態為 synced
        const orderToApply = updatedOrder || newOrder;
        setOrders((prev: Order[]) => prev.map(o => o.id === newOrder.id ? { ...orderToApply, syncStatus: 'synced', pendingAction: undefined, _syncStatus: 'synced' } : o));
      },
      (errMsg: string) => {
         // 同步失敗處理
         setOrders((prev: Order[]) => prev.map(o => o.id === newOrder.id ? { ...o, syncStatus: 'error', errorMessage: errMsg, _syncStatus: 'error' } : o));
         addToast("追加訂單失敗，請檢查網路狀態", 'error');
      }
    );
  };

  const updateOrderStatus = useCallback(async (orderId: string, newStatus: OrderStatus, showDefaultToast: boolean = true) => {
    const orderToUpdate = orders.find(o => o.id === orderId);
    if (!orderToUpdate) return;

    // 1. 純前端瞬間切換狀態 (Optimistic UI 飛速體驗) 🚀
    const now = Date.now();
    setOrders((prev: Order[]) => prev.map(o => 
      o.id === orderId ? { ...o, status: newStatus, syncStatus: 'pending', pendingAction: 'statusUpdate', _syncStatus: 'pending', _localUpdatedTs: now } : o
    ));

    // 2. 將實際的連線動作包裝成任務，交給背景 Queue 處理
    if (addSyncTask) {
      const customerName = orderToUpdate?.customerName || '';
      const deliveryDate = orderToUpdate?.deliveryDate || '';
      const updatesToProcess = [{ 
          id: orderId, 
          status: newStatus, 
          originalStatus: orderToUpdate?.status, // 轉換前狀態
          items: orderToUpdate?.items?.map((item: any) => ({
              ...item,
              productName: item.productName || products.find((p: any) => p.id === item.productId)?.name || item.productId
          })), // 訂單明細並帶入商品名稱
          version: orderToUpdate?.version || 1, 
          force: true 
      }];

      addSyncTask({
        taskId: crypto.randomUUID(),
        type: 'UPDATE_STATUS',
        payload: { updates: updatesToProcess, customerName, deliveryDate },
        retryCount: 0,
        timestamp: Date.now()
      });
    }

    // 3. 收工退出！沒有 try-catch、也沒有 timeout 檢查！
  }, [orders, products, setOrders, addSyncTask]);

  const handleBatchSettleOrders = useCallback(async (orderIds: string[]) => {
    if (!orderIds.length) return;

    // 1. 純前端瞬間切換狀態 (Optimistic UI)
    const now = Date.now();
    setOrders((prev: Order[]) => prev.map(o => 
      orderIds.includes(o.id) ? { ...o, status: OrderStatus.PAID, syncStatus: 'pending', pendingAction: 'statusUpdate', _syncStatus: 'pending', _localUpdatedTs: now } : o
    ));

    // 2. 將實際的連線動作包裝成任務，交給背景 Queue 處理
    if (addSyncTask) {
        const updatesToProcess = orderIds.map(orderId => {
            const orderToUpdate = orders.find(o => o.id === orderId);
            return {
              id: orderId,
              status: OrderStatus.PAID,
              originalStatus: orderToUpdate?.status,
              items: orderToUpdate?.items?.map((item: any) => ({
                  ...item,
                  productName: item.productName || products.find((p: any) => p.id === item.productId)?.name || item.productId
              })),
              originalVersion: orderToUpdate?.version || 1,
              force: true
            };
        }).filter(Boolean);

        if (updatesToProcess.length === 0) return;

        const firstOrderId = updatesToProcess[0]?.id;
        const firstOrder = orders.find(o => o.id === firstOrderId);
        const customerName = firstOrder?.customerName || '';
        const deliveryDate = firstOrder?.deliveryDate || '';

        // [防呆容錯 / 批次 Payload 節流切塊]
        // 為了避免一次修改 200 筆訂單導致網路壅塞或是 GAS 執行超時，將大型批次操作自動分切為多個 Chunk。
        // 前端瞬間呈現 200 筆綠燈，而背景依照 CHUNK_SIZE 優雅依序更新。
        const CHUNK_SIZE = 30;
        for (let i = 0; i < updatesToProcess.length; i += CHUNK_SIZE) {
            const chunk = updatesToProcess.slice(i, i + CHUNK_SIZE);
            addSyncTask({
              taskId: crypto.randomUUID(),
              type: 'BATCH_UPDATE',
              payload: { updates: chunk, customerName, deliveryDate },
              retryCount: 0,
              timestamp: Date.now()
            });
        }

        addToast(`已成功結清 ${orderIds.length} 筆訂單`, 'success');
    }

    if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
        batchTimeoutRef.current = null;
    }
  }, [orders, products, addToast, setOrders, addSyncTask]);

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
        const pName = item.productName || p?.name || item.productId;
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
      text += `- ${item.productName || p?.name || item.productId}: ${item.quantity} ${item.unit}\n`;
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
    const customer = customers.find(c => c.name === name);
    if (customer?.coordinates) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.coordinates)}`, '_blank');
      return;
    }
    const query = encodeURIComponent(customer?.address || name);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
  };

  const handleEditOrder = (order: Order) => {
    setEditingOrderId(order.id);
    editingVersionRef.current = order.version;

    const cust = customers.find(c => c.name === order.customerName);
    setOrderForm({
      customerType: 'existing',
      customerId: cust ? cust.id : '',
      customerName: order.customerName,
      deliveryTime: formatTimeForInput(order.deliveryTime),
      deliveryMethod: order.deliveryMethod || cust?.deliveryMethod || '',
      trip: order.trip || cust?.defaultTrip || '', // 👈 新增這行：優先使用訂單原本的趟數，否則使用客戶預設
      source: order.source || '', // 保留原有的 source
      items: order.items.map(i => ({ ...i })),
      note: order.note,
      date: order.deliveryDate
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
        source: '', // 手動建立
        items: c.defaultItems && c.defaultItems.length > 0 ? c.defaultItems.map(di => ({ ...di })) : [{ productId: '', quantity: 10, unit: '斤' }],
        note: '',
        date: selectedDate
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
      return { productId: item.productId, productName: item.productName || product?.name, quantity: Math.max(0, finalQuantity), unit: finalUnit };
    });

    const timestamp = Date.now();
    const newOrder: Order = {
      id: editingOrderId || 'ORD-' + timestamp + Math.random().toString(36).substring(2, 6),
      createdAt: editingOrderId ? (orders.find(o => o.id === editingOrderId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
      customerName: orderForm.customerName,
      deliveryDate: orderForm.date || selectedDate,
      deliveryTime: deliveryTime,
      deliveryMethod: orderForm.deliveryMethod,
      trip: orderForm.trip || '未分配',
      source: orderForm.source || '',
      items: processedItems,
      note: orderForm.note,
      status: editingOrderId ? (orders.find(o => o.id === editingOrderId)?.status || OrderStatus.PENDING) : OrderStatus.PENDING,
      version: editingOrderId ? editingVersionRef.current : undefined,
      syncStatus: 'pending',
      pendingAction: editingOrderId ? 'update' : 'create',
      _syncStatus: 'pending',
      _localUpdatedTs: timestamp,
      lastUpdated: timestamp
    };

    // Optimistic Update
    if (editingOrderId) {
      setOrders((prev: Order[]) => prev.map(o => o.id === editingOrderId ? newOrder : o));
    } else {
      setOrders((prev: Order[]) => [newOrder, ...prev]);
    }

    setIsAddingOrder(false);
    setEditingOrderId(null);
    setOrderForm({ customerType: 'existing', customerId: '', customerName: '', deliveryTime: '', deliveryMethod: '', trip: '', source: '', items: [{ productId: '', quantity: 10, unit: '斤' }], note: '', date: '' });
    setIsSaving(false);
    
    if (orderForm.date && orderForm.date !== selectedDate) {
      addToast(editingOrderId ? `訂單已更新至 ${orderForm.date}` : `訂單已建立至 ${orderForm.date}`, 'success');
      setSelectedDate(orderForm.date);
    } else {
      addToast(editingOrderId ? '訂單已更新 (同步中...)' : '訂單已建立 (同步中...)', 'success');
    }

    // Background Sync
    await saveOrderToCloud(
      newOrder,
      editingOrderId ? 'updateOrderContent' : 'createOrder',
      editingVersionRef.current,
      () => {
         if (!editingOrderId) {
           setOrders((prev: Order[]) => prev.map(o => o.id === newOrder.id ? { ...o, syncStatus: 'synced', pendingAction: undefined, _syncStatus: 'synced' } : o));
           addToast('同步成功', 'success');
         }
      },
      (errMsg: string) => {
         setOrders((prev: Order[]) => prev.map(o => o.id === newOrder.id ? { ...o, syncStatus: 'error', errorMessage: errMsg, _syncStatus: 'error' } : o));
         addToast("同步失敗，已標記為錯誤", 'error');
      }
    );
  };

  const executeDeleteOrder = async (orderId: string) => { 
    setConfirmConfig((prev: any) => ({ ...prev, isOpen: false })); 
    const orderBackup = orders.find(o => o.id === orderId); 
    if (!orderBackup) return; 

    const now = Date.now();
    // Instead of completely removing, we mark it as pending deletion to prevent cache revert resurrections
    setOrders((prev: Order[]) => prev.map(o => o.id === orderId ? { ...o, _syncStatus: 'pending', syncStatus: 'pending', pendingAction: 'delete', _localUpdatedTs: now } : o));

    if (apiEndpoint && addSyncTask) {
      addSyncTask({
        taskId: `DELETE_${orderId}_${now}`,
        type: 'delete_order',
        payload: { id: orderId, version: orderBackup.version },
        retryCount: 0,
        timestamp: Date.now()
      });
    } else {
      setOrders((prev: Order[]) => prev.filter(o => o.id !== orderId));
    }
  };

  const handleBatchUpdateTrip = async (tripName: string, selectedOrderIds: Set<string>, setSelectedOrderIds: (s: Set<string>) => void, setIsSelectionMode: (b: boolean) => void) => {
    if (selectedOrderIds.size === 0) return;
    setIsSaving(true);
    
    const ids = Array.from(selectedOrderIds);
    const now = Date.now();
    const updatedOrders = orders.map(o => {
      if (ids.includes(o.id)) {
        return { ...o, trip: tripName, syncStatus: 'pending' as const, pendingAction: 'update' as const, _syncStatus: 'pending' as const, _localUpdatedTs: now };
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
          order.version,
          () => {
             setOrders((prev: Order[]) => prev.map(o => o.id === id ? { ...o, syncStatus: 'synced', pendingAction: undefined, _syncStatus: 'synced' } : o));
          },
          (errMsg: string) => {
             setOrders((prev: Order[]) => prev.map(o => o.id === id ? { ...o, syncStatus: 'error', errorMessage: errMsg, _syncStatus: 'error' } : o));
          }
        );
      }
    }
    
    setSelectedOrderIds(new Set());
    setIsSelectionMode(false);
    setIsSaving(false);
    addToast(`已將 ${ids.length} 筆訂單設為 ${tripName}`, 'success');
  };

  const handleDeleteOrder = (orderId: string, skipConfirm: boolean = false) => {
    if (skipConfirm) {
      executeDeleteOrder(orderId);
      return;
    }
    setConfirmConfig({ isOpen: true, title: '刪除訂單', message: '確定要刪除此訂單嗎？\n此動作將會同步刪除雲端資料。', onConfirm: () => executeDeleteOrder(orderId) }); 
  };

  const handleRetrySync = useCallback(async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order || !order.pendingAction) return;

    // Reset status to pending
    const now = Date.now();
    setOrders((prev: Order[]) => prev.map(o => o.id === orderId ? { ...o, syncStatus: 'pending', errorMessage: undefined, _syncStatus: 'pending', _localUpdatedTs: now } : o));

    const action = order.pendingAction;
    try {
      if (action === 'statusUpdate') {
         await saveOrderToCloud(
          order,
          'updateOrderStatus',
          order.version,
          () => setOrders((prev: Order[]) => prev.map(o => o.id === orderId ? { ...o, syncStatus: 'synced', pendingAction: undefined, _syncStatus: 'synced' } : o)),
          (errMsg: string) => setOrders((prev: Order[]) => prev.map(o => o.id === orderId ? { ...o, syncStatus: 'error', errorMessage: errMsg, _syncStatus: 'error' } : o))
        );
      } else if (action === 'delete') {
         executeDeleteOrder(orderId);
      } else if (action === 'create') {
         await saveOrderToCloud(
          order,
          'createOrder',
          undefined,
          (updatedOrder: Order) => setOrders((prev: Order[]) => prev.map(o => o.id === orderId ? { ...updatedOrder, syncStatus: 'synced', pendingAction: undefined, _syncStatus: 'synced' } : o)),
          (errMsg: string) => setOrders((prev: Order[]) => prev.map(o => o.id === orderId ? { ...o, syncStatus: 'error', errorMessage: errMsg, _syncStatus: 'error' } : o))
        );
      } else if (action === 'update') {
         await saveOrderToCloud(
          order,
          'updateOrderContent',
          order.version,
          (updatedOrder: Order) => {}, // Queue handles the state now
          (errMsg: string) => setOrders((prev: Order[]) => prev.map(o => o.id === orderId ? { ...o, syncStatus: 'error', errorMessage: errMsg, _syncStatus: 'error' } : o))
        );
      }
    } catch (e) {
      console.error(e);
    }
  }, [orders, setOrders, saveOrderToCloud, executeDeleteOrder]);

  const handleDiscardLocalError = useCallback(async (orderId: string) => {
    setOrders((prev: Order[]) => prev.map(o => {
      if (o.id === orderId) {
        if (o.pendingAction === 'create') {
          return null as any; // delete if it was a create
        }
        return { ...o, syncStatus: undefined, _syncStatus: undefined, errorMessage: undefined, pendingAction: undefined };
      }
      return o;
    }).filter(Boolean));
    
    if (removeTaskByPayloadId) {
      await removeTaskByPayloadId(orderId);
    }
    
    addToast('已還原至雲端最新狀態', 'success');
    
    if (syncData) {
      syncData(true);
    }
  }, [setOrders, addToast, removeTaskByPayloadId, syncData]);

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
    findLastOrder,
    applyLastOrder,
    handleSelectExistingCustomer,
    openGoogleMaps,
    handleDeleteOrder,
    handleBatchUpdateTrip,
    handleRetrySync,
    handleDiscardLocalError
  };
};