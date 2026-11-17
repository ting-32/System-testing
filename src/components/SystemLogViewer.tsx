import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Search, RefreshCw, Activity, PlusCircle, Edit2, Trash2, Settings, ChevronDown, ChevronUp, ArrowRight, AlertCircle, Clock, History } from 'lucide-react';
import { SystemLog } from '../types';
import { container } from '../core/di/AppContainer';
import { motion, AnimatePresence } from 'framer-motion';
import { useLogStore } from '../store/useLogStore';
import { useAppStore } from '../store/useAppStore';

interface Props {
  apiEndpoint: string;
}

export function SystemLogViewer({ apiEndpoint }: Props) {
  const {
    systemLogs: logs,
    totalSystemRows,
    hasMoreSystemLogs,
    setSystemLogs,
    mergeNewSystemLogs,
    appendOlderSystemLogs,
  } = useLogStore();
  const { products } = useAppStore();
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const hasAutoToppedUpRef = useRef(false);
  
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [filterTime, setFilterTime] = useState<number>(0);
  const [searchWord, setSearchWord] = useState<string>('');
  const [showSecondsAudit, setShowSecondsAudit] = useState<boolean>(false);
  
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchLogs = async (explicitLimit?: number) => {
    setIsLoadingLogs(true);
    try {
      if (apiEndpoint) {
        container.updateApiEndpoint(apiEndpoint);
      }
      const targetBatch = Math.min(3000, Math.max(200, explicitLimit || logs.length));
      const page = await container.logRepo.getSystemLogsPage({ batchSize: targetBatch, offset: 0 });
      const latestTs = page.logs.reduce((max, item) => Math.max(max, item.timestamp || 0), 0) || Date.now();
      setSystemLogs(page.logs, latestTs, {
        totalRows: page.totalRows,
        hasMore: page.hasMore,
      });
    } catch (e) {
      console.error("Failed to fetch logs", e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const loadOlderLogs = async (batchSize: number = 300) => {
    if (isLoadingMore || isLoadingLogs) return;
    setIsLoadingMore(true);
    try {
      if (apiEndpoint) {
        container.updateApiEndpoint(apiEndpoint);
      }
      const page = await container.logRepo.getSystemLogsPage({
        batchSize,
        offset: logs.length,
      });
      if (page.paged) {
        appendOlderSystemLogs(page.logs, {
          totalRows: page.totalRows,
          hasMore: page.hasMore,
        });
      } else {
        const latestTs = page.logs.reduce((max, item) => Math.max(max, item.timestamp || 0), 0) || Date.now();
        mergeNewSystemLogs(page.logs, latestTs, {
          totalRows: page.totalRows,
          hasMore: page.hasMore,
        });
      }
    } catch (e) {
      console.error("Failed to load older logs", e);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const loadLogsForDays = async (days: number) => {
    if (isLoadingMore || isLoadingLogs) return;
    setIsLoadingMore(true);
    try {
      if (apiEndpoint) {
        container.updateApiEndpoint(apiEndpoint);
      }
      const maxScan = days >= 30 ? 3000 : 1500;
      const page = await container.logRepo.getSystemLogsPage({
        batchSize: maxScan,
        offset: 0,
        days,
      });
      const latestTs = page.logs.reduce((max, item) => Math.max(max, item.timestamp || 0), 0) || Date.now();
      const sheetHasEvenOlder =
        Boolean(page.hasMore) ||
        (typeof page.totalRows === 'number' && page.logs.length < page.totalRows);
      mergeNewSystemLogs(page.logs, latestTs, {
        totalRows: page.totalRows,
        hasMore: sheetHasEvenOlder,
      });
    } catch (e) {
      console.error("Failed to load logs by days", e);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!apiEndpoint) return;
    if (logs.length === 0) {
      hasAutoToppedUpRef.current = true;
      fetchLogs(200);
    } else if (!hasAutoToppedUpRef.current && logs.length < 200 && hasMoreSystemLogs !== false) {
      hasAutoToppedUpRef.current = true;
      fetchLogs(200);
    }
  }, [apiEndpoint, logs.length, hasMoreSystemLogs]);

  const _uniqueActions = useMemo(() => {
    const actions = new Set<string>();
    logs.forEach(log => {
      if (log.actionType) actions.add(log.actionType.split('_')[0]); // GROUP BY CREATE/UPDATE/DELETE
    });
    return Array.from(actions);
  }, [logs]);

  const describeDeviceFromUserAgent = (ua?: string): string => {
    if (!ua || typeof ua !== 'string') return '未知設備';

    let platform = '未知裝置';
    if (/iPhone/i.test(ua)) platform = 'iPhone';
    else if (/iPad/i.test(ua)) platform = 'iPad';
    else if (/Android/i.test(ua)) {
      if (/SM-/i.test(ua)) platform = 'Android 手機 (三星)';
      else if (/Pixel/i.test(ua)) platform = 'Android 手機 (Pixel)';
      else platform = 'Android 手機';
    } else if (/Macintosh|Mac OS X/i.test(ua)) platform = 'Mac 電腦';
    else if (/Windows/i.test(ua)) platform = 'Windows 電腦';

    let channel = '網頁瀏覽器';
    if (/LIFF/i.test(ua)) channel = 'LINE 快速面板 (LIFF)';
    else if (/Line\//i.test(ua)) channel = 'LINE 內建瀏覽器';
    else if (/Edg\//i.test(ua)) channel = 'Edge 瀏覽器';
    else if (/Chrome\//i.test(ua)) channel = 'Chrome 瀏覽器';
    else if (/Safari\//i.test(ua)) channel = 'Safari 瀏覽器';

    return `${platform} · ${channel}`;
  };

  const formatShortDeviceCode = (deviceId?: string): string => {
    if (!deviceId || typeof deviceId !== 'string') return '未記錄';
    const clean = deviceId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!clean) return '未記錄';
    return `#${clean.slice(-6)}`;
  };

  const translateRole = (role?: string): string => {
    if (!role) return '';
    const map: Record<string, string> = {
      ADMIN: '管理員',
      DRIVER: '司機',
      STAFF: '廠內人員',
      USER: '一般人員',
    };
    return map[role.toUpperCase()] || role;
  };

  const translateApiAction = (action?: string): string => {
    if (!action) return '系統操作';
    const map: Record<string, string> = {
      checkUpdates: '手動同步／檢視最新資料',
      getLogs: '讀取系統操作日誌',
      saveOrder: '新增或修改訂單',
      deleteOrder: '刪除訂單',
      batchDeleteOrders: '批次刪除舊訂單',
      updateOrderStatus: '變更訂單狀態',
      assignOrder: '指派訂單配送人員',
      saveCustomer: '新增或修改店家資料',
      deleteCustomer: '刪除店家資料',
      saveProduct: '新增或修改麵類品項',
      deleteProduct: '刪除麵類品項',
      updateProductOrder: '調整商品顯示順序',
      saveTrips: '調整配送車趟設定',
      saveSettings: '變更系統與通知設定',
      updateSecurityPassword: '變更系統登入密碼',
      triggerAutoOrders: '執行自動建立常規訂單',
      syncLineOrders: '同步 LINE 傳入訂單',
      sendBriefingNow: '發送每日出車簡報',
      setupRichMenu: '套用 LINE 圖文主選單',
      backfillMissingOrderPrices: '補齊訂單單價與小計',
      saveEdgeConfig: '同步極速連線鏡像設定',
      testLineMessage: '發送 LINE 測試通知',
      testRule: '測試提醒規則',
      login: '帳號密碼登入',
    };
    return map[action] || action;
  };

  const matchesFilterAction = (log: SystemLog) => {
    if (filterAction === 'ALL') return true;
    const type = log.actionType || '';
    if (filterAction === 'LINE') {
      return (
        type.startsWith('LINE_') ||
        type === 'SYNC_LINE_ORDERS' ||
        type === 'SETUP_LINE_RICHMENU' ||
        type === 'SYSTEM_LIFF_LOGIN' ||
        log.details.includes('"source":"LIFF"') ||
        log.details.includes('"source": "LIFF"')
      );
    }
    if (filterAction === 'SYSTEM') {
      return (
        type.startsWith('SYSTEM_') ||
        [
          'UPDATE_SETTINGS',
          'UPDATE_SECURITY_PASSWORD',
          'TRIGGER_AUTO_ORDERS',
          'SYNC_LINE_ORDERS',
          'SEND_DAILY_BRIEFING',
          'SETUP_LINE_RICHMENU',
          'BACKFILL_ORDER_PRICES',
          'SAVE_EDGE_CONFIG',
          'ASSIGN_ORDER',
          'UPDATE_TRIPS',
          'UPDATE_PRODUCT',
          'UPDATE_PRODUCT_ORDER',
        ].includes(type)
      );
    }
    if (filterAction === 'CREATE') {
      return type.startsWith('CREATE') || type === 'TRIGGER_AUTO_ORDERS';
    }
    if (filterAction === 'UPDATE') {
      return (
        type.startsWith('UPDATE') ||
        type === 'ASSIGN_ORDER' ||
        type === 'BACKFILL_ORDER_PRICES' ||
        type === 'LINE_UPDATE_STATUS' ||
        type === 'LINE_EDGE_UPDATE_STATUS' ||
        type === 'LINE_UNDO_STATUS' ||
        type === 'LINE_EDGE_UNDO_STATUS' ||
        type === 'LINE_ONE_CLICK_DELIVERED' ||
        type === 'LINE_UPDATE_ORDER' ||
        type === 'LINE_SET_HOLIDAY'
      );
    }
    if (filterAction === 'DELETE') {
      return type.startsWith('DELETE') || type === 'BATCH_DELETE_ORDERS' || type === 'LINE_DELETE_ORDER';
    }
    return type.startsWith(filterAction);
  };

  const formatLogTimestampParts = (log: SystemLog) => {
    let ms = typeof log.timestamp === 'number' && Number.isFinite(log.timestamp) && log.timestamp > 0 ? log.timestamp : 0;
    if (!ms && log.timestampStr) {
      const str = String(log.timestampStr).trim();
      const bareMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
      if (bareMatch) {
        const pad = (v?: string) => String(v || '0').padStart(2, '0');
        const parsedBare = new Date(`${bareMatch[1]}-${pad(bareMatch[2])}-${pad(bareMatch[3])}T${pad(bareMatch[4])}:${pad(bareMatch[5])}:${pad(bareMatch[6])}+08:00`);
        if (!isNaN(parsedBare.getTime())) ms = parsedBare.getTime();
      } else {
        const parsed = new Date(str);
        if (!isNaN(parsed.getTime())) ms = parsed.getTime();
      }
    }
    if (!ms) {
      return {
        isValid: false,
        timeHM: '--:--',
        timeHMS: '--:--:--',
        dateLabel: log.timestampStr ? log.timestampStr.slice(0, 10) : '未記錄',
        fullDateTime: log.timestampStr || '時間未記錄',
      };
    }

    const d = new Date(ms);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(d);
    const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
    const year = get('year');
    const month = get('month');
    const day = get('day');
    const hour = get('hour');
    const minute = get('minute');
    const second = get('second');

    const weekdayStr = new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      weekday: 'short',
    }).format(d).replace(/^週|^星期/, '');

    const currentYear = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
    }).format(new Date());

    const shortDate = year === currentYear ? `${month}/${day}` : `${year}/${month}/${day}`;

    return {
      isValid: true,
      timeHM: `${hour}:${minute}`,
      timeHMS: `${hour}:${minute}:${second}`,
      dateLabel: `${shortDate} (${weekdayStr})`,
      fullDateTime: `${year}/${month}/${day} (${weekdayStr}) ${hour}:${minute}:${second}`,
    };
  };

  const oldestValidTimestamp = useMemo(() => {
    let minTs = Infinity;
    logs.forEach(log => {
      if (typeof log.timestamp === 'number' && log.timestamp > 0 && log.timestamp < minTs) {
        minTs = log.timestamp;
      }
    });
    return minTs === Infinity ? 0 : minTs;
  }, [logs]);

  const oldestCoverageLabel = useMemo(() => {
    if (!oldestValidTimestamp) return '';
    return formatLogTimestampParts({
      id: 'oldest',
      timestamp: oldestValidTimestamp,
      timestampStr: '',
      actionType: '',
      target: '',
      details: '',
    }).fullDateTime;
  }, [oldestValidTimestamp]);

  const handleTimeFilterClick = (hours: number) => {
    setFilterTime(hours);
    if (hours >= 168 && apiEndpoint && hasMoreSystemLogs !== false) {
      const targetCutoff = Date.now() - hours * 60 * 60 * 1000;
      if (!oldestValidTimestamp || oldestValidTimestamp > targetCutoff) {
        loadLogsForDays(Math.round(hours / 24));
      }
    }
  };

  const filteredLogs = useMemo(() => {
    const now = Date.now();
    const q = searchWord.trim().toLowerCase();
    return logs.filter(log => {
      if (!matchesFilterAction(log)) return false;
      if (filterTime > 0 && (now - log.timestamp) > filterTime * 60 * 60 * 1000) return false;
      if (
        q &&
        !log.target.toLowerCase().includes(q) &&
        !log.details.toLowerCase().includes(q) &&
        !log.timestampStr.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [logs, filterAction, filterTime, searchWord]);
  
  const getActionStyles = (actionType: string, detailsStr?: string) => {
    const isLiffSource = Boolean(
      detailsStr && (detailsStr.includes('"source":"LIFF"') || detailsStr.includes('"source": "LIFF"'))
    );
    if (actionType === 'SYSTEM_DATA_ACCESS') {
      return {
        icon: <RefreshCw className="w-5 h-5 text-sky-600" />,
        bg: 'bg-sky-50',
        text: 'text-sky-700',
        border: 'border-sky-200',
        ring: 'ring-sky-100',
        label: '手動同步'
      };
    }
    if (actionType === 'SYSTEM_LOGIN_SUCCESS' || actionType === 'SYSTEM_LIFF_LOGIN') {
      return {
        icon: <Activity className="w-5 h-5 text-emerald-600" />,
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        ring: 'ring-emerald-100',
        label: actionType === 'SYSTEM_LIFF_LOGIN' ? 'LINE 免密登入' : '系統登入'
      };
    }
    if (actionType === 'SYSTEM_LOGIN_FAILED') {
      return {
        icon: <AlertCircle className="w-5 h-5 text-orange-600" />,
        bg: 'bg-orange-50',
        text: 'text-orange-700',
        border: 'border-orange-200',
        ring: 'ring-orange-100',
        label: '登入失敗'
      };
    }
    if (
      actionType === 'SYSTEM_FORBIDDEN' ||
      actionType === 'SYSTEM_UNAUTHORIZED_ACCESS' ||
      actionType === 'SYSTEM_UNAUTHORIZED_EDGE' ||
      actionType === 'UPDATE_SECURITY_PASSWORD'
    ) {
      return {
        icon: <AlertCircle className="w-5 h-5 text-rose-600" />,
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        border: 'border-rose-200',
        ring: 'ring-rose-100',
        label:
          actionType === 'UPDATE_SECURITY_PASSWORD'
            ? '重設密碼'
            : actionType === 'SYSTEM_FORBIDDEN'
              ? '權限攔截'
              : '未授權攔截'
      };
    }
    if (actionType === 'SYSTEM_TEST_MSG' || actionType === 'SYSTEM_TEST_RULE') {
      return {
        icon: <Settings className="w-5 h-5 text-indigo-500" />,
        bg: 'bg-indigo-50',
        text: 'text-indigo-700',
        border: 'border-indigo-200',
        ring: 'ring-indigo-100',
        label: '通知測試'
      };
    }
    if (actionType === 'TRIGGER_AUTO_ORDERS') {
      return {
        icon: <PlusCircle className="w-5 h-5 text-emerald-600" />,
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        ring: 'ring-emerald-100',
        label: '自動建單'
      };
    }
    if (actionType === 'SYNC_LINE_ORDERS' || actionType === 'SETUP_LINE_RICHMENU' || actionType === 'LINE_SELF_BIND_LIFF') {
      return {
        icon: <Settings className="w-5 h-5 text-teal-600" />,
        bg: 'bg-teal-50',
        text: 'text-teal-700',
        border: 'border-teal-200',
        ring: 'ring-teal-100',
        label:
          actionType === 'SYNC_LINE_ORDERS'
            ? 'LINE 同步'
            : actionType === 'SETUP_LINE_RICHMENU'
              ? '選單套用'
              : 'LINE 綁定'
      };
    }
    if (actionType === 'SEND_DAILY_BRIEFING' || actionType === 'SAVE_EDGE_CONFIG' || actionType === 'ASSIGN_ORDER') {
      return {
        icon: <Settings className="w-5 h-5 text-indigo-600" />,
        bg: 'bg-indigo-50',
        text: 'text-indigo-700',
        border: 'border-indigo-200',
        ring: 'ring-indigo-100',
        label:
          actionType === 'SEND_DAILY_BRIEFING'
            ? '每日簡報'
            : actionType === 'SAVE_EDGE_CONFIG'
              ? '極速同步'
              : '配送指派'
      };
    }
    if (actionType === 'BACKFILL_ORDER_PRICES') {
      return {
        icon: <Edit2 className="w-5 h-5 text-amber-600" />,
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
        ring: 'ring-amber-100',
        label: '單價補齊'
      };
    }
    if (
      actionType === 'LINE_UPDATE_STATUS' ||
      actionType === 'LINE_EDGE_UPDATE_STATUS' ||
      actionType === 'LINE_UNDO_STATUS' ||
      actionType === 'LINE_EDGE_UNDO_STATUS' ||
      actionType === 'LINE_ONE_CLICK_DELIVERED'
    ) {
      return {
        icon: <Edit2 className="w-5 h-5 text-teal-600" />,
        bg: 'bg-teal-50',
        text: 'text-teal-700',
        border: 'border-teal-200',
        ring: 'ring-teal-100',
        label: actionType.includes('UNDO') ? 'LINE 復原' : 'LINE 改狀態'
      };
    }
    if (actionType === 'LINE_UPDATE_ORDER') {
      return {
        icon: <Edit2 className="w-5 h-5 text-teal-600" />,
        bg: 'bg-teal-50',
        text: 'text-teal-700',
        border: 'border-teal-200',
        ring: 'ring-teal-100',
        label: 'LINE 改單'
      };
    }
    if (actionType === 'LINE_SET_HOLIDAY') {
      return {
        icon: <Edit2 className="w-5 h-5 text-amber-600" />,
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
        ring: 'ring-amber-100',
        label: 'LINE 公休'
      };
    }
    if (actionType === 'LINE_DELETE_ORDER') {
      return {
        icon: <Trash2 className="w-5 h-5 text-rose-500" />,
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        border: 'border-rose-200',
        ring: 'ring-rose-100',
        label: 'LINE 刪單'
      };
    }
    if (actionType === 'BATCH_DELETE_ORDERS') {
      return {
        icon: <Trash2 className="w-5 h-5 text-rose-500" />,
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        border: 'border-rose-200',
        ring: 'ring-rose-100',
        label: '批次刪除'
      };
    }
    if (actionType === 'UPDATE_ORDER_BATCH') {
      return {
        icon: <Edit2 className="w-5 h-5 text-indigo-500" />,
        bg: 'bg-indigo-50',
        text: 'text-indigo-700',
        border: 'border-indigo-200',
        ring: 'ring-indigo-100',
        label: '批次修改'
      };
    }
    if (actionType.startsWith('CREATE')) {
      return {
        icon: <PlusCircle className="w-5 h-5 text-emerald-500" />,
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        ring: 'ring-emerald-100',
        label: isLiffSource ? 'LIFF 新增' : '新增'
      };
    }
    if (actionType.startsWith('UPDATE')) {
      const updateLabelMap: Record<string, string> = {
        UPDATE_CUSTOMER: '店家資料',
        UPDATE_SETTINGS: '系統設定',
        UPDATE_TRIPS: '車趟調整',
        UPDATE_PRODUCT: '商品異動',
        UPDATE_PRODUCT_ORDER: '商品排序',
      };
      return {
        icon: <Edit2 className="w-5 h-5 text-amber-500" />,
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
        ring: 'ring-amber-100',
        label: updateLabelMap[actionType] || '修改'
      };
    }
    if (actionType.startsWith('DELETE')) {
      return {
        icon: <Trash2 className="w-5 h-5 text-rose-500" />,
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        border: 'border-rose-200',
        ring: 'ring-rose-100',
        label: '刪除'
      };
    }
    return {
      icon: <Settings className="w-5 h-5 text-indigo-500" />,
      bg: 'bg-indigo-50',
      text: 'text-indigo-700',
      border: 'border-indigo-200',
      ring: 'ring-indigo-100',
      label: '系統'
    };
  };

  const parseDetails = (details: string) => {
    try {
      return JSON.parse(details);
    } catch {
      return null;
    }
  };

  const renderHumanReadableDetails = (actionType: string, parsedJson: any) => {
    const renderStatusBadge = (status: string) => {
      const statusMap: Record<string, { label: string, classes: string }> = {
        'PAID': { label: '已收款', classes: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
        'PAID_UNSHIPPED': { label: '已收未配', classes: 'bg-teal-100 text-teal-700 border border-teal-200' },
        'PENDING': { label: '待出貨', classes: 'bg-rose-100 text-rose-700 border border-rose-200' }, 
        'SHIPPED': { label: '已配送', classes: 'bg-blue-100 text-blue-700 border border-blue-200' },
        'CANCELLED': { label: '已取消', classes: 'bg-slate-200 text-slate-600 border border-slate-300' },
      };
      const config = statusMap[status] || { label: status, classes: 'bg-slate-100 text-slate-600 border border-slate-200' };
      
      return (
        <span className={`px-3 py-1 rounded-md text-sm font-bold ${config.classes}`}>
          {config.label}
        </span>
      );
    };

    const operatorName = parsedJson?.operator && parsedJson.operator !== '未知' ? parsedJson.operator : '';

    // === 1. 新增訂單 ===
    if (actionType === 'CREATE_ORDER') {
      const payload = parsedJson.payload || {};
      const customerName = payload.customerName || '未知店家';
      const deliveryDate = payload.deliveryDate || '未指定日期';
      const items = parsedJson.items || payload.items || [];
      const source = parsedJson.source || payload.source || '';
      
      return (
        <div className="space-y-3 mt-2 bg-emerald-50/80 p-3.5 rounded-xl border border-emerald-100">
          <p className="text-sm sm:text-base font-bold text-slate-800 flex flex-wrap items-center gap-1.5">
            ✅ <span>{operatorName ? `【${operatorName}】` : ''}向【<span className="text-emerald-700 text-lg">{customerName}</span>】建立了一筆 <span className="text-indigo-600 underline decoration-indigo-200 underline-offset-4">{deliveryDate}</span> 的訂單{source === 'LIFF' ? '（LINE LIFF）' : ''}</span>
          </p>
          <div className="bg-white p-3 rounded-lg border border-emerald-100 shadow-sm">
            <p className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1">
              📦 訂單內容：
            </p>
            <ul className="space-y-1.5 pl-1">
              {items.map((item: any, idx: number) => {
                const validSavedName = item.productName && item.productName !== item.productId ? item.productName : null;
                const pNameFromStore = products.find(p => p.id === item.productId)?.name;
                const pName = pNameFromStore || validSavedName || item.productId || '未知商品';

                return (
                  <li key={idx} className="text-sm font-bold text-slate-700">
                    • {pName} <span className="text-indigo-600 ml-1.5">{item.quantity} {item.unit || '斤'}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      );
    }

    // === 1.5 LINE 按鈕 / Worker Edge 狀態變更 ===
    if (
      actionType === 'LINE_UPDATE_STATUS' ||
      actionType === 'LINE_EDGE_UPDATE_STATUS' ||
      actionType === 'LINE_UNDO_STATUS' ||
      actionType === 'LINE_EDGE_UNDO_STATUS' ||
      actionType === 'LINE_ONE_CLICK_DELIVERED'
    ) {
      const nextSt = parsedJson.newStatus || parsedJson.restoredStatus || '';
      const prevSt = parsedJson.prevStatus || '';
      const isEdge = actionType.includes('EDGE');
      const isUndo = actionType.includes('UNDO');
      const isOneClick = actionType === 'LINE_ONE_CLICK_DELIVERED';
      const deliveryDate = parsedJson.deliveryDate || '';

      return (
        <div className="space-y-3 mt-2 bg-teal-50/70 p-4 rounded-xl border border-teal-200">
          <p className="text-sm sm:text-base font-bold text-slate-800">
            📱 {operatorName ? `【${operatorName}】` : '同仁'}透過 LINE{isEdge ? '（Edge 秒回按鈕）' : ''}{isOneClick ? '一鍵回報送達' : isUndo ? '復原了訂單狀態' : '更新了訂單狀態'}
            {deliveryDate ? ` · 日期 ${deliveryDate}` : ''}
          </p>
          <div className="bg-white px-4 py-3 rounded-lg border border-teal-100 shadow-sm flex flex-wrap items-center gap-3">
            {prevSt && (
              <>
                <div className="opacity-60 relative">
                  {renderStatusBadge(prevSt)}
                  <div className="absolute inset-0 top-1/2 h-[2px] bg-slate-400 -translate-y-1/2 w-full"></div>
                </div>
                <ArrowRight className="w-5 h-5 text-teal-400" />
              </>
            )}
            <div>{renderStatusBadge(nextSt)}</div>
          </div>
        </div>
      );
    }

    // === 1.6 LINE Bot 改單 ===
    if (actionType === 'LINE_UPDATE_ORDER') {
      const od = parsedJson.orderData || {};
      const items = Array.isArray(od.items) ? od.items : [];
      return (
        <div className="space-y-3 mt-2 bg-teal-50/70 p-4 rounded-xl border border-teal-200">
          <p className="text-sm sm:text-base font-bold text-slate-800">
            📱 {operatorName ? `【${operatorName}】` : '同仁'}透過 LINE 修改了【{od.customerName || '店家'}】{od.deliveryDate ? ` (${od.deliveryDate}) ` : ''}的訂單內容
          </p>
          {items.length > 0 && (
            <div className="bg-white p-3 rounded-lg border border-teal-100 shadow-sm space-y-1">
              {items.map((item: any, idx: number) => (
                <div key={idx} className="text-sm font-bold text-slate-700">
                  • {item.productName || item.productId} × <span className="text-indigo-600">{item.quantity} {item.unit || '斤'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // === 1.7 店家資料／公休異動（網頁 / LIFF / LINE Bot） ===
    if (actionType === 'UPDATE_CUSTOMER' || actionType === 'LINE_SET_HOLIDAY') {
      const cust = parsedJson.data || parsedJson || {};
      const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六'];
      const offDays: number[] = Array.isArray(cust.offDays) ? cust.offDays : [];
      const holidayDates: string[] = Array.isArray(cust.holidayDates) ? cust.holidayDates : [];
      return (
        <div className="space-y-2.5 mt-2 bg-amber-50/60 p-4 rounded-xl border border-amber-200">
          <p className="text-sm sm:text-base font-bold text-slate-800">
            🏖️ {operatorName ? `【${operatorName}】` : ''}{actionType === 'LINE_SET_HOLIDAY' ? '透過 LINE ' : ''}更新了【{cust.name || '店家'}】的公休／店家設定
          </p>
          <div className="bg-white p-3 rounded-lg border border-amber-100 text-xs sm:text-sm text-slate-700 space-y-1.5 font-medium">
            <div>每週固定休：{offDays.length > 0 ? offDays.map(d => `週${weekdayLabels[d] ?? d}`).join('、') : '無'}</div>
            <div>特定公休日：{holidayDates.length > 0 ? holidayDates.slice(-8).join('、') : '無'}</div>
            {cust.isPaused !== undefined && (
              <div>暫停供貨狀態：<span className="font-bold">{cust.isPaused ? '已暫停供貨' : '正常供貨'}</span></div>
            )}
          </div>
        </div>
      );
    }

    // === 2. 訂單修改/狀態變更 (拔除 UUID、字體放大、導入狀態字典) ===
    if (actionType === 'UPDATE_ORDER_BATCH' || actionType === 'UPDATE_ORDER' || actionType === 'UPDATE_ORDER_STATUS') {
      const isLegacyArray = Array.isArray(parsedJson.updates);
      const updatesData = isLegacyArray ? parsedJson.updates : (parsedJson?.updates?.updates || parsedJson?.diff?.updates || []);
      const customerName = isLegacyArray
        ? (updatesData[0]?.customerName || '多筆訂單 (批次)')
        : (parsedJson?.updates?.customerName || parsedJson?.diff?.customerName || '未知店家');
      const deliveryDate = isLegacyArray ? (updatesData[0]?.deliveryDate || '') : (parsedJson?.updates?.deliveryDate || parsedJson?.diff?.deliveryDate || '');
      const editedItems = Array.isArray(parsedJson?.diff?.items) ? parsedJson.diff.items : [];

      return (
        <div className="space-y-3 mt-2 bg-amber-50/50 p-4 rounded-xl border border-amber-100">
          <p className="text-sm sm:text-base font-bold text-slate-800 flex flex-wrap items-center gap-1.5">
            🔄 <span>{operatorName ? `【${operatorName}】` : ''}修改了【<span className="text-amber-700 text-lg">{customerName}</span>】{deliveryDate && `在 ${deliveryDate} `}的{updatesData.length > 0 ? '狀態' : '訂單內容'}</span>
          </p>
          
          {updatesData.length > 0 && (
            <div className="space-y-2 mt-2">
              {updatesData.map((update: any, idx: number) => (
                 <div key={idx} className="bg-white px-4 py-3 rounded-lg border border-amber-100 shadow-sm flex flex-wrap items-center justify-between gap-2">
                   {updatesData.length > 1 && update.customerName && (
                     <span className="text-xs font-bold text-slate-700 mr-2">{update.customerName}</span>
                   )}
                   <div className="flex items-center gap-3">
                     {update.originalStatus && (
                       <div className="opacity-60 relative group">
                         {renderStatusBadge(update.originalStatus)}
                         <div className="absolute inset-0 top-1/2 h-[2px] bg-slate-400 -translate-y-1/2 w-full"></div>
                       </div>
                     )}
                     
                     {update.originalStatus && (
                       <ArrowRight className="w-5 h-5 text-amber-300" />
                     )}
                     
                     <div className="scale-105 origin-left">
                       {renderStatusBadge(update.status || update.originalStatus)}
                     </div>
                   </div>
                 </div>
              ))}
            </div>
          )}

          {updatesData.length === 0 && editedItems.length > 0 && (
            <div className="bg-white p-3 rounded-lg border border-amber-100 shadow-sm space-y-1">
              {editedItems.map((item: any, idx: number) => {
                const pName = item.productName || products.find(p => p.id === item.productId)?.name || item.productId;
                return (
                  <div key={idx} className="text-sm font-bold text-slate-700">
                    • {pName} × <span className="text-indigo-600">{item.quantity} {item.unit || '斤'}</span>
                  </div>
                );
              })}
              {parsedJson?.diff?.note && (
                <div className="text-xs text-amber-700 pt-1">備註：{parsedJson.diff.note}</div>
              )}
            </div>
          )}
        </div>
      );
    }

    // === 3. 刪除類日誌 (涵蓋 Order, Customer, Product, LINE_DELETE_ORDER) ===
    if (actionType.startsWith('DELETE_') || actionType === 'LINE_DELETE_ORDER') {
      const targetType = actionType === 'LINE_DELETE_ORDER' ? 'ORDER' : actionType.replace('DELETE_', '');
      const sourceName = targetType === 'ORDER' ? '每日訂單' : targetType === 'CUSTOMER' ? '店家名單' : targetType === 'PRODUCT' ? '商品庫存' : '系統資料';
      const rawName = parsedJson.deletedName || parsedJson.customerName || '';
      const deletedName = (rawName && rawName !== '未知店家') ? rawName : (parsedJson.deletedId || '未知店家');
      const deleteDateVal = parsedJson.deletedDate || parsedJson.deliveryDate || '';
      const deleteDate = deleteDateVal ? ` (日期: ${deleteDateVal})` : '';
      const deletedItems: any[] = Array.isArray(parsedJson.deletedItems)
        ? parsedJson.deletedItems
        : (Array.isArray(parsedJson.items) ? parsedJson.items : []);
      const deletedId = parsedJson.deletedId || parsedJson.id || '';

      return (
        <div className="mt-2 bg-rose-50/80 p-4 rounded-xl border border-rose-200 flex items-start gap-3 shadow-sm">
          <div className="bg-white p-2 rounded-lg shadow-sm border border-rose-100 flex-shrink-0">
            <span className="text-xl sm:text-2xl">🗑️</span>
          </div>
          
          <div className="flex-1 min-w-0 pt-0.5 space-y-2">
            <p className="text-sm sm:text-base font-bold text-rose-900 leading-relaxed">
              {operatorName ? `【${operatorName}】` : '您'}{actionType === 'LINE_DELETE_ORDER' ? '透過 LINE ' : ''}從【{sourceName}】中<span className="text-rose-600 underline underline-offset-4 decoration-rose-300 mx-1">永久移除</span>了以下資料：
            </p>
            <div>
              <p className="text-base sm:text-lg font-bold text-rose-700 bg-rose-100/60 inline-block px-3 py-1 rounded-lg border border-rose-200/70">
                「{deletedName}{deleteDate}」
              </p>
            </div>

            {deletedItems.length > 0 && (
              <div className="bg-white p-3 rounded-lg border border-rose-100 shadow-sm">
                <p className="text-xs font-bold text-rose-500 mb-1.5">📦 已刪除品項內容：</p>
                <ul className="space-y-1 pl-1">
                  {deletedItems.map((item: any, idx: number) => {
                    const validSavedName = item.productName && item.productName !== item.productId ? item.productName : null;
                    const pNameFromStore = products.find(p => p.id === item.productId || p.name === item.productName)?.name;
                    const pName = pNameFromStore || validSavedName || item.productName || item.productId || '未知商品';
                    return (
                      <li key={idx} className="text-sm font-bold text-slate-700">
                        • {pName} <span className="text-rose-600 ml-1.5">{item.quantity} {item.unit || '斤'}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {(deletedId || deleteDate) && (
              <p className="text-[11px] sm:text-xs text-rose-500/80 font-mono">
                {deletedId ? `訂單 ID：${deletedId}` : deleteDate}
              </p>
            )}
          </div>
        </div>
      );
    }

    // === 4. 系統設定（僅處理真正的設定變更，不再誤抓 SYSTEM_*） ===
    if (actionType === 'UPDATE_SETTINGS') {
      const data = parsedJson.data || parsedJson || {};
      const fieldDictionary: Record<string, string> = {
        autoOrderEnabled: '自動建單排程',
        defaultHoliday: '每週預設公休日',
        holidays: '特定店休日清單',
        rules: '提醒與通知規則',
        dailyBriefing: '每日出車簡報設定',
        lineChannelToken: 'LINE 官方帳號權杖',
        lineUserId: '預設通知接收對象',
        lineLiffId: 'LINE 快速面板識別碼',
        reminderThreshold: '未出貨提醒時間門檻',
      };

      const changedKeys = Object.keys(data).filter(
        k => k !== 'ruleId' && k !== 'actionType' && k !== 'operator' && data[k] !== undefined
      );

      return (
        <div className="mt-2 bg-slate-100/80 p-4 rounded-xl border border-slate-200 flex items-start gap-3 shadow-sm">
          <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-200 flex-shrink-0">
            <span className="text-xl sm:text-2xl">⚙️</span>
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="text-sm sm:text-base font-bold text-slate-800">
              {operatorName ? `【${operatorName}】更新了系統與通知設定` : '系統設定已更新'}
            </p>
            {changedKeys.length > 0 ? (
              <div className="mt-2 space-y-1.5 bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                {changedKeys.map(key => {
                  const val = data[key];
                  let displayVal = String(val);
                  if (typeof val === 'boolean') displayVal = val ? '開啟' : '關閉';
                  else if (Array.isArray(val)) displayVal = `共 ${val.length} 項`;
                  else if (typeof val === 'object' && val !== null) {
                    displayVal = val.enabled !== undefined ? (val.enabled ? '已啟用並更新內容' : '已關閉') : '已調整詳細規則';
                  } else if (key.toLowerCase().includes('token') && displayVal.length > 12) {
                    displayVal = '已更新（為保安全隱藏顯示）';
                  }

                  return (
                    <p key={key} className="text-sm text-slate-700 font-medium">
                      • <span className="font-bold">{fieldDictionary[key] || key}</span>：<span className="text-indigo-600 font-bold">{displayVal}</span>
                    </p>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-slate-500 mt-1">管理員儲存了應用程式設定項目。</p>
            )}
          </div>
        </div>
      );
    }

    // === 4.1 批次刪除訂單 ===
    if (actionType === 'BATCH_DELETE_ORDERS') {
      const count = parsedJson.deletedCount || (Array.isArray(parsedJson.targetIds) ? parsedJson.targetIds.length : 0);
      const detailsList: any[] = Array.isArray(parsedJson.deletedDetails) ? parsedJson.deletedDetails : [];
      return (
        <div className="mt-2 bg-rose-50/80 p-4 rounded-xl border border-rose-200 space-y-2.5 shadow-sm">
          <p className="text-sm sm:text-base font-bold text-rose-900">
            🗑️ {operatorName ? `【${operatorName}】` : '管理員'}批次清理了 <span className="text-rose-600 text-lg">{count}</span> 筆舊訂單
          </p>
          {detailsList.length > 0 && (
            <div className="bg-white p-3 rounded-lg border border-rose-100 space-y-1 max-h-40 overflow-y-auto">
              {detailsList.slice(0, 12).map((d, i) => (
                <div key={i} className="text-xs sm:text-sm font-medium text-slate-700 flex items-center justify-between gap-2">
                  <span>• {d.customer || '未知店家'}</span>
                  <span className="text-xs text-slate-400 font-mono">{d.id}</span>
                </div>
              ))}
              {detailsList.length > 12 && (
                <p className="text-xs text-slate-400 pt-1">…以及另外 {detailsList.length - 12} 筆訂單</p>
              )}
            </div>
          )}
        </div>
      );
    }

    // === 4.2 車趟與商品列表／單價異動 ===
    if (actionType === 'UPDATE_TRIPS') {
      const tripList: string[] = Array.isArray(parsedJson.trips) ? parsedJson.trips : [];
      return (
        <div className="mt-2 bg-amber-50/60 p-4 rounded-xl border border-amber-200 space-y-2">
          <p className="text-sm sm:text-base font-bold text-slate-800">
            🚚 {operatorName ? `【${operatorName}】` : '管理員'}更新了配送車趟清單（共 {parsedJson.count ?? tripList.length} 個車趟）
          </p>
          {tripList.length > 0 && (
            <div className="bg-white p-2.5 rounded-lg border border-amber-100 text-xs sm:text-sm font-semibold text-slate-700">
              目前車趟：{tripList.join('、')}
            </div>
          )}
        </div>
      );
    }

    if (actionType === 'UPDATE_PRODUCT_ORDER') {
      return (
        <div className="mt-2 bg-amber-50/60 p-4 rounded-xl border border-amber-200">
          <p className="text-sm sm:text-base font-bold text-slate-800">
            📋 {operatorName ? `【${operatorName}】` : '管理員'}重新調整了商品顯示順序（共 {parsedJson.updatedCount || 0} 項）
          </p>
        </div>
      );
    }

    if (actionType === 'UPDATE_PRODUCT') {
      const prod = parsedJson.data || parsedJson || {};
      return (
        <div className="mt-2 bg-amber-50/60 p-4 rounded-xl border border-amber-200 space-y-2">
          <p className="text-sm sm:text-base font-bold text-slate-800">
            🍜 {operatorName ? `【${operatorName}】` : '管理員'}更新了商品【{prod.name || '商品'}】資料
          </p>
          <div className="bg-white p-3 rounded-lg border border-amber-100 text-xs sm:text-sm text-slate-700 flex flex-wrap gap-4 font-semibold">
            {prod.price !== undefined && <span>預設單價：${prod.price}</span>}
            {prod.unit && <span>計價單位：{prod.unit}</span>}
            {prod.category && <span>分類：{prod.category}</span>}
          </div>
        </div>
      );
    }

    // === 4.3 派工指派 ===
    if (actionType === 'ASSIGN_ORDER') {
      const driverName = parsedJson.assignedName || parsedJson.assignedTo || '取消指派';
      return (
        <div className="mt-2 bg-indigo-50/70 p-4 rounded-xl border border-indigo-200">
          <p className="text-sm sm:text-base font-bold text-slate-800">
            🚚 {operatorName ? `【${operatorName}】` : '領班／管理員'}將此筆訂單指派給【<span className="text-indigo-700">{driverName}</span>】配送
          </p>
        </div>
      );
    }

    // === 4.4 排程／自動建單／LINE 同步／價格補齊／極速設定 ===
    if (actionType === 'TRIGGER_AUTO_ORDERS') {
      const resObj = parsedJson.result || parsedJson || {};
      const createdCount = resObj.createdCount ?? resObj.count ?? resObj.addedCount;
      const msgText = resObj.message || '';
      return (
        <div className="mt-2 bg-emerald-50/70 p-4 rounded-xl border border-emerald-200 space-y-2">
          <p className="text-sm sm:text-base font-bold text-emerald-900">
            🤖 {operatorName ? `【${operatorName}】` : '系統排程'}執行了「自動建立常規訂單」
          </p>
          <div className="bg-white p-3 rounded-lg border border-emerald-100 text-xs sm:text-sm font-medium text-slate-700 space-y-1">
            {createdCount !== undefined && (
              <div>本次產生訂單：<span className="font-bold text-emerald-700">{createdCount} 筆</span></div>
            )}
            {msgText && <div>執行摘要：{msgText}</div>}
          </div>
        </div>
      );
    }

    if (actionType === 'SYNC_LINE_ORDERS') {
      const resObj = parsedJson.result || parsedJson || {};
      return (
        <div className="mt-2 bg-teal-50/70 p-4 rounded-xl border border-teal-200 space-y-2">
          <p className="text-sm sm:text-base font-bold text-teal-900">
            💬 {operatorName ? `【${operatorName}】` : '系統'}同步了 LINE 傳入訂單
          </p>
          <div className="bg-white p-3 rounded-lg border border-teal-100 text-xs sm:text-sm font-medium text-slate-700">
            {resObj.message || `已處理 ${resObj.count ?? 0} 筆 LINE 建單資料`}
          </div>
        </div>
      );
    }

    if (actionType === 'SEND_DAILY_BRIEFING') {
      return (
        <div className="mt-2 bg-indigo-50/70 p-4 rounded-xl border border-indigo-200">
          <p className="text-sm sm:text-base font-bold text-indigo-900">
            🚚 {operatorName ? `【${operatorName}】` : '系統'}發送了「每日出車／配送簡報」到 LINE
          </p>
          <p className="text-xs text-slate-600 mt-1">已彙整當日訂單並推播給管理員／對應人員。</p>
        </div>
      );
    }

    if (actionType === 'SETUP_LINE_RICHMENU') {
      return (
        <div className="mt-2 bg-teal-50/70 p-4 rounded-xl border border-teal-200">
          <p className="text-sm sm:text-base font-bold text-teal-900">
            📱 {operatorName ? `【${operatorName}】` : '管理員'}重新套用了 LINE 官方帳號圖文主選單
          </p>
          <p className="text-xs text-slate-600 mt-1">
            執行結果：<span className={parsedJson.success ? 'font-bold text-emerald-600' : 'font-bold text-rose-600'}>
              {parsedJson.success ? '已成功套用新版按鈕' : '套用未完成'}
            </span>
          </p>
        </div>
      );
    }

    if (actionType === 'LINE_SELF_BIND_LIFF') {
      return (
        <div className="mt-2 bg-teal-50/70 p-4 rounded-xl border border-teal-200">
          <p className="text-sm sm:text-base font-bold text-teal-900">
            🔗 人員完成 LINE 帳號免密綁定
          </p>
          <p className="text-xs text-slate-600 mt-1">
            人員代碼：{parsedJson.userId || '已綁定人員'}（之後開啟 LINE 操作面板將自動登入）
          </p>
        </div>
      );
    }

    if (actionType === 'BACKFILL_ORDER_PRICES') {
      const resObj = parsedJson.result || parsedJson || {};
      return (
        <div className="mt-2 bg-amber-50/70 p-4 rounded-xl border border-amber-200">
          <p className="text-sm sm:text-base font-bold text-amber-900">
            💰 {operatorName ? `【${operatorName}】` : '管理員'}執行了「補齊訂單單價與小計」
          </p>
          {resObj.message && <p className="text-xs text-slate-600 mt-1">{resObj.message}</p>}
        </div>
      );
    }

    if (actionType === 'SAVE_EDGE_CONFIG') {
      const c = parsedJson.counts || {};
      return (
        <div className="mt-2 bg-indigo-50/70 p-4 rounded-xl border border-indigo-200 space-y-2">
          <p className="text-sm sm:text-base font-bold text-indigo-900">
            ⚡ {operatorName ? `【${operatorName}】` : '管理員'}更新了極速連線與即時鏡像資料
          </p>
          <div className="bg-white p-3 rounded-lg border border-indigo-100 text-xs sm:text-sm font-medium text-slate-700">
            已同步：同仁 {c.users ?? 0} 人 · 店家 {c.customers ?? 0} 間 · 活躍訂單 {c.activeOrders ?? 0} 筆
          </div>
        </div>
      );
    }

    // === 5. 通知測試 ===
    if (actionType === 'SYSTEM_TEST_MSG' || actionType === 'SYSTEM_TEST_RULE') {
      return (
        <div className="mt-2 bg-indigo-50/70 p-4 rounded-xl border border-indigo-200">
          <p className="text-sm sm:text-base font-bold text-indigo-900">
            📣 {operatorName ? `【${operatorName}】` : '管理員'}進行了「{actionType === 'SYSTEM_TEST_MSG' ? 'LINE 測試訊息發送' : '提醒規則觸發測試'}」
          </p>
          <p className="text-xs text-slate-600 mt-1">
            此為系統測試發送，用來確認 LINE 推播連線是否正常。
          </p>
        </div>
      );
    }

    // === 6. 安全性警告 (核心密碼修改) ===
    if (actionType === 'UPDATE_SECURITY_PASSWORD') {
      const deviceDesc = describeDeviceFromUserAgent(parsedJson.userAgent);
      const shortCode = formatShortDeviceCode(parsedJson.deviceId);

      return (
        <div className="mt-2 bg-rose-50/90 p-4 rounded-xl border-2 border-rose-200 shadow-sm space-y-2.5">
          <p className="text-sm sm:text-base font-bold text-rose-800 flex items-center gap-1.5 border-b border-rose-200/60 pb-2">
            <AlertCircle className="w-5 h-5 text-rose-600" />
            <span>系統登入密碼已被重設！</span>
          </p>
          <div className="bg-white p-3 rounded-lg border border-rose-100 text-xs sm:text-sm text-slate-700 space-y-1 font-medium">
            <div>📱 操作設備：<span className="font-bold">{deviceDesc}</span></div>
            <div>🔖 裝置代號：<span className="font-mono font-bold text-rose-700">{shortCode}</span></div>
          </div>
          <p className="text-xs font-bold text-rose-600">
            ⚠️ 若非管理員本人操作，請盡速重新更改系統密碼。
          </p>
        </div>
      );
    }

    // -- [登入異常] --
    if (actionType === 'SYSTEM_LOGIN_FAILED') {
      const deviceDesc = describeDeviceFromUserAgent(parsedJson.userAgent);
      const shortCode = formatShortDeviceCode(parsedJson.deviceId);
      const failCount = parsedJson.failCount;
      const remaining = parsedJson.remainingAttempts;

      return (
        <div className="mt-2 bg-orange-50 p-4 rounded-xl border border-orange-200 space-y-2">
          <p className="text-sm sm:text-base font-bold text-orange-800">⚠️ 有設備嘗試登入系統但密碼錯誤</p>
          <div className="bg-white p-3 rounded-lg border border-orange-100 text-xs sm:text-sm text-slate-700 space-y-1 font-medium">
            <div>📱 來源設備：<span className="font-bold">{deviceDesc}</span>（代號 <span className="font-mono">{shortCode}</span>）</div>
            {failCount !== undefined && (
              <div>🔐 錯誤紀錄：第 <span className="font-bold text-orange-700">{failCount}</span> 次失敗{remaining !== undefined ? `（剩餘 ${remaining} 次嘗試機會，超過將暫時鎖定）` : ''}</div>
            )}
          </div>
        </div>
      );
    }

    // -- [登入成功 / LIFF 自動登入] --
    if (actionType === 'SYSTEM_LOGIN_SUCCESS' || actionType === 'SYSTEM_LIFF_LOGIN') {
      const loginName = parsedJson.name || operatorName || parsedJson.username || '系統人員';
      const roleLabel = translateRole(parsedJson.role);
      const deviceDesc = actionType === 'SYSTEM_LIFF_LOGIN'
        ? 'LINE 快速操作面板 (自動換票)'
        : describeDeviceFromUserAgent(parsedJson.userAgent);
      const shortCode = formatShortDeviceCode(parsedJson.deviceId);

      return (
        <div className="mt-2 bg-emerald-50/70 p-4 rounded-xl border border-emerald-200 space-y-2">
          <p className="text-sm sm:text-base font-bold text-emerald-900">
            🔓 【{loginName}】{roleLabel ? `(${roleLabel}) ` : ''}已成功登入系統
          </p>
          <div className="bg-white p-3 rounded-lg border border-emerald-100 text-xs sm:text-sm text-slate-700 space-y-1 font-medium">
            <div>📱 使用設備：<span className="font-bold">{deviceDesc}</span></div>
            {shortCode !== '未記錄' && (
              <div>🔖 裝置代號：<span className="font-mono text-slate-600">{shortCode}</span></div>
            )}
          </div>
        </div>
      );
    }

    // -- [調閱與手動重整] (方案 1：白話翻譯 + 裝置簡化版) --
    if (actionType === 'SYSTEM_DATA_ACCESS') {
      const methodText = parsedJson.method === '手動重整' ? '手動重新整理了資料' : '開啟系統載入了最新資料';
      const deviceDesc = describeDeviceFromUserAgent(parsedJson.userAgent);
      const shortCode = formatShortDeviceCode(parsedJson.deviceId);

      return (
        <div className="mt-2 bg-sky-50/70 p-4 rounded-xl border border-sky-200 space-y-2.5 shadow-sm">
          <p className="text-sm sm:text-base font-bold text-slate-800 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-sky-600 shrink-0" />
            <span>{operatorName ? `【${operatorName}】` : '使用者'}透過【{deviceDesc}】{methodText}</span>
          </p>
          <div className="bg-white p-3 rounded-lg border border-sky-100 text-xs sm:text-sm text-slate-700 space-y-1 font-medium">
            <div>🔄 操作動作：<span className="font-bold text-sky-700">{parsedJson.method || '同步資料'}</span></div>
            <div>📱 使用設備：<span className="font-bold">{deviceDesc}</span></div>
            <div>🔖 裝置代號：<span className="font-mono text-slate-600">{shortCode}</span></div>
          </div>
        </div>
      );
    }

    // -- [越權阻擋 / 未授權存取] --
    if (actionType === 'SYSTEM_FORBIDDEN') {
      const emp = parsedJson.employee || '該同仁';
      const actionLabel = translateApiAction(parsedJson.action);
      return (
        <div className="mt-2 bg-rose-50/80 p-4 rounded-xl border border-rose-200 space-y-1.5">
          <p className="text-sm sm:text-base font-bold text-rose-800">
            🚫 權限不足：已系統阻擋操作
          </p>
          <div className="bg-white p-3 rounded-lg border border-rose-100 text-xs sm:text-sm text-slate-700 font-medium">
            【<span className="font-bold">{emp}</span>】嘗試執行「<span className="font-bold text-rose-700">{actionLabel}</span>」，因帳號職位權限不符已被安全攔截。
          </div>
        </div>
      );
    }

    if (actionType === 'SYSTEM_UNAUTHORIZED_ACCESS' || actionType === 'SYSTEM_UNAUTHORIZED_EDGE') {
      const actionLabel = actionType === 'SYSTEM_UNAUTHORIZED_EDGE'
        ? 'LINE 秒回按鈕安全驗證'
        : translateApiAction(parsedJson.action);
      return (
        <div className="mt-2 bg-rose-50/90 p-4 rounded-xl border border-rose-200 space-y-2">
          <p className="text-sm sm:text-base font-bold text-rose-800">
            🚨 攔截到「登入逾期或未授權」的連線請求
          </p>
          <div className="bg-white p-3 rounded-lg border border-rose-100 text-xs sm:text-sm text-slate-700 space-y-1 font-medium">
            <div>📌 嘗試執行項目：<span className="font-bold text-rose-700">{actionLabel}</span></div>
            <div className="text-xs text-slate-500">
              {actionType === 'SYSTEM_UNAUTHORIZED_EDGE'
                ? 'Edge 安全密鑰驗證失敗，請確認設定中的 Edge 密鑰是否一致。'
                : parsedJson.tokenProvided
                  ? '原因：該裝置的登入憑證已過期（系統會引導重新登入）。'
                  : '原因：未攜帶有效登入憑證。'}
            </div>
          </div>
        </div>
      );
    }

    // === 7. 沒被捕捉到的日誌 (Fallback，留給工程師看) ===
    return (
      <div className="mt-2">
        <p className="text-xs text-slate-400 font-bold mb-1 ml-1 cursor-help" title="這是系統內部保留的原始紀錄">🕵️ 系統保留明細：</p>
        <pre className="bg-slate-800 text-emerald-400 p-3 rounded-xl font-mono text-[10px] sm:text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-inner">
          {JSON.stringify(parsedJson, null, 2)}
        </pre>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4 pb-24">
        {/* Header & Refresh */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-500" />
            操作軌跡
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSecondsAudit(prev => !prev)}
              title="切換顯示精準到秒的對帳時間"
              className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
                showSecondsAudit
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200 hover:text-indigo-600'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              秒級對帳
            </button>
            <button 
              onClick={() => fetchLogs()} 
              disabled={isLoadingLogs || isLoadingMore}
              className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? 'animate-spin' : ''}`} />
              {isLoadingLogs ? '更新中' : '最新'}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-[20px] border border-slate-100 shadow-sm flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 ml-1">快速尋找</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  value={searchWord}
                  onChange={e => setSearchWord(e.target.value)}
                  placeholder="搜尋對象、內容、時間 (如 14:30)..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                />
              </div>
            </div>
            
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 ml-1">時間範圍</label>
              <div className="flex bg-slate-50 p-1 rounded-xl gap-1 border border-slate-200">
                {[
                  { label: '今天', val: 24 },
                  { label: '近 3 天', val: 72 },
                  { label: '近 7 天', val: 168 },
                  { label: '近 30 天', val: 720 },
                  { label: '全部', val: 0 },
                ].map(time => (
                   <button 
                     key={time.val}
                     onClick={() => handleTimeFilterClick(time.val)}
                     className={`flex-1 py-1.5 px-1.5 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${filterTime === time.val ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                   >
                     {time.label}
                   </button>
                ))}
              </div>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 ml-1">動作分類</label>
              <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                <button 
                  onClick={() => setFilterAction('ALL')}
                  className={`py-1.5 px-3 whitespace-nowrap rounded-lg text-[11px] font-bold transition-all border ${filterAction === 'ALL' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                >
                  全部
                </button>
                <button
                  onClick={() => setFilterAction('CREATE')}
                  className={`py-1.5 px-3 whitespace-nowrap rounded-lg text-[11px] font-bold transition-all border ${filterAction === 'CREATE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-200'}`}
                >
                   新增
                </button>
                <button
                  onClick={() => setFilterAction('UPDATE')}
                  className={`py-1.5 px-3 whitespace-nowrap rounded-lg text-[11px] font-bold transition-all border ${filterAction === 'UPDATE' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-white text-slate-500 border-slate-200 hover:border-amber-200'}`}
                >
                   修改
                </button>
                <button
                  onClick={() => setFilterAction('DELETE')}
                  className={`py-1.5 px-3 whitespace-nowrap rounded-lg text-[11px] font-bold transition-all border ${filterAction === 'DELETE' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-white text-slate-500 border-slate-200 hover:border-rose-200'}`}
                >
                   刪除
                </button>
                <button
                  onClick={() => setFilterAction('LINE')}
                  className={`py-1.5 px-3 whitespace-nowrap rounded-lg text-[11px] font-bold transition-all border ${filterAction === 'LINE' ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-white text-slate-500 border-slate-200 hover:border-teal-200'}`}
                >
                   LINE
                </button>
                <button
                  onClick={() => setFilterAction('SYSTEM')}
                  className={`py-1.5 px-3 whitespace-nowrap rounded-lg text-[11px] font-bold transition-all border ${filterAction === 'SYSTEM' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-200'}`}
                >
                   系統
                </button>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 font-semibold">
            <div className="flex items-center gap-1.5 flex-wrap">
              <History className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>
                已載入 <span className="font-bold text-slate-700">{logs.length}</span> 筆
                {typeof totalSystemRows === 'number' ? ` / 試算表共 ${totalSystemRows} 筆` : ''}
              </span>
              {oldestCoverageLabel && (
                <span className="text-slate-400">（最早至 {oldestCoverageLabel}）</span>
              )}
            </div>
            {hasMoreSystemLogs !== false && (
              <div className="flex items-center gap-1.5">
                {logs.length < 500 && (
                  <button
                    type="button"
                    disabled={isLoadingMore || isLoadingLogs}
                    onClick={() => loadOlderLogs(500)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 font-bold transition-colors disabled:opacity-50"
                  >
                    + 載入 500 筆
                  </button>
                )}
                {logs.length < 1000 && (
                  <button
                    type="button"
                    disabled={isLoadingMore || isLoadingLogs}
                    onClick={() => loadOlderLogs(Math.max(500, 1000 - logs.length))}
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold transition-colors disabled:opacity-50"
                  >
                    直達 1,000 筆
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Timeline Log Area */}
        {(isLoadingLogs || isLoadingMore) && logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-indigo-300 animate-spin mb-3" />
            <p className="text-sm font-semibold text-slate-500">正在讀取操作日誌...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
            <Activity className="w-10 h-10 text-slate-300" />
            <p className="text-sm font-semibold text-slate-500">目前條件下沒有符合的操作紀錄</p>
            {hasMoreSystemLogs !== false && (
              <button
                type="button"
                disabled={isLoadingMore || isLoadingLogs}
                onClick={() => loadOlderLogs(500)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-indigo-200 text-xs font-bold text-indigo-600 hover:bg-indigo-50 shadow-sm transition-colors disabled:opacity-50"
              >
                <History className={`w-3.5 h-3.5 ${isLoadingMore ? 'animate-spin' : ''}`} />
                {isLoadingMore ? '正在讀取更早紀錄...' : '往更早紀錄搜尋 (+500 筆)'}
              </button>
            )}
          </div>
        ) : (
          <div className="relative pl-6 space-y-6 before:absolute before:inset-0 before:ml-[1.4rem] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent mt-8">
            <AnimatePresence>
            {filteredLogs.map(log => {
              const styles = getActionStyles(log.actionType, log.details);
              const isExpanded = expandedLogId === log.id;
              const parsedJson = parseDetails(log.details);
              const timeParts = formatLogTimestampParts(log);
              
              return (
              <motion.div 
                layout
                key={log.id} 
                initial={{ opacity: 0, scale: 0.95, y: -20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className={`relative flex items-start group`}
              >
                {/* Timeline dot */}
                <div className={`absolute -left-6 bg-white p-1 rounded-full ring-4 ${styles.ring} z-10 shadow-sm border ${styles.border}`}>
                  {styles.icon}
                </div>

                <div className="flex-1 ml-4 bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:border-indigo-100 transition-all text-left w-full">
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        title={timeParts.isValid ? `台北時間 ${timeParts.fullDateTime}` : '時間未記錄'}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-black font-mono tabular-nums border ${
                          showSecondsAudit
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200/80'
                        }`}
                      >
                        <Clock className={`w-3 h-3 ${showSecondsAudit ? 'text-indigo-500' : 'text-slate-500'}`} />
                        {showSecondsAudit ? timeParts.timeHMS : timeParts.timeHM}
                      </span>
                      <div className={`px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest ${styles.bg} ${styles.text}`}>
                        {styles.label || log.actionType}
                      </div>
                      {parsedJson?.operator && parsedJson.operator !== '未知' && (
                        <span className="text-[11px] font-bold text-slate-500">
                          操作：{parsedJson.operator}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col items-end shrink-0 pt-0.5">
                      <span className="text-slate-400 text-[11px] font-bold leading-none whitespace-nowrap">
                        {timeParts.dateLabel}
                      </span>
                    </div>
                  </div>
                  
                  <h4 className="text-[13px] font-black text-slate-800 mb-1 leading-snug">{log.target}</h4>
                  
                  {/* Content / Details */}
                  {parsedJson ? (
                    <div className="mt-2 text-xs">
                      <button 
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className="flex items-center gap-1 text-indigo-500 font-bold hover:text-indigo-600 transition-colors bg-indigo-50/50 hover:bg-indigo-50 px-2 py-1 rounded-md"
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5"/> : <ChevronDown className="w-3.5 h-3.5"/>}
                        {isExpanded ? '收合詳細資料' : '檢視詳細資料'}
                      </button>
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden mt-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-100/90 border border-slate-200/80 text-[11px] text-slate-600 font-semibold">
                              <span className="flex items-center gap-1.5 font-mono tabular-nums">
                                <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                對帳時間：{timeParts.fullDateTime}（台北時間）
                              </span>
                              <span className="text-[10px] font-mono text-slate-400">
                                {log.actionType}
                              </span>
                            </div>
                            {renderHumanReadableDetails(log.actionType, parsedJson)}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 leading-relaxed font-medium bg-slate-50 p-2.5 rounded-lg mt-2 space-y-1.5">
                      <div>{log.details.length > 150 ? log.details.substring(0, 150) + '...' : log.details}</div>
                      <div className="text-[11px] text-slate-400 font-mono tabular-nums flex items-center gap-1 pt-1 border-t border-slate-200/60">
                        <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                        對帳時間：{timeParts.fullDateTime}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )})}
            </AnimatePresence>

            {/* Pagination / Load Earlier Controls */}
            <div className="pt-2 pb-10 flex flex-col items-center gap-2.5">
              {hasMoreSystemLogs === false ? (
                <div className="text-xs font-semibold text-slate-400 bg-white px-4 py-2 rounded-xl border border-slate-200/80 shadow-xs">
                  已顯示試算表內所有保留的操作紀錄（共 {logs.length} 筆）
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    disabled={isLoadingMore || isLoadingLogs}
                    onClick={() => loadOlderLogs(300)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 text-xs font-bold text-slate-700 hover:text-indigo-700 shadow-sm transition-colors disabled:opacity-50"
                  >
                    <History className={`w-3.5 h-3.5 ${isLoadingMore ? 'animate-spin text-indigo-500' : 'text-slate-500'}`} />
                    {isLoadingMore ? '正在讀取更早紀錄...' : '載入更早 300 筆'}
                  </button>
                  <button
                    type="button"
                    disabled={isLoadingMore || isLoadingLogs}
                    onClick={() => loadLogsForDays(30)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-xs font-bold text-indigo-700 shadow-sm transition-colors disabled:opacity-50"
                  >
                    讀取近 30 天完整紀錄
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
