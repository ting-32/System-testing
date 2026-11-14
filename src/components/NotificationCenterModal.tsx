import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Plus,
  BellRing,
  Trash2,
  Save,
  MessageCircle,
  AlertCircle,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Smile,
  Truck,
  Star,
  Users,
  ListChecks,
  Send,
  ShieldAlert,
  ClipboardCheck
} from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import {
  Customer,
  Product,
  ReminderRule,
  ReminderDateMode,
  ReminderOutputFormat,
  ReminderRecipientMode,
  ReminderConditionStatus,
  DailyBriefingConfig
} from '../types';
import { NotificationLogViewer } from './NotificationLogViewer';
import { DiagnosticFunnelModal } from './DiagnosticFunnelModal';
import { BriefingTemplateEditor } from './Notification/BriefingTemplateEditor';
import { container } from '../core/di/AppContainer';
import { fetchWithRetry } from '../utils/fetchUtils';
import { useAuth } from '../context/AuthContext';
import { broadcastDataChange } from '../services/firebaseSync';
import { useSettingsStore, DEFAULT_DAILY_BRIEFING } from '../store/useSettingsStore';
import { useLogStore } from '../store/useLogStore';

interface StaffOption {
  userId: string;
  username: string;
  name: string;
  role: string;
  line_user_id?: string;
}

// 1. 取得該規則下次執行的具體 Date 物件
function getNextRunDate(schedule: string | string[], timeToNotify: string): Date | null {
  if (!timeToNotify) return null;
  
  const now = new Date();
  const [hourStr, minuteStr] = timeToNotify.split(':');
  const targetHour = parseInt(hourStr, 10);
  const targetMinute = parseInt(minuteStr || '0', 10);

  // 轉換排程為數字陣列 (0=星期日, 1=星期一...)
  const targetDays = schedule === '每天' 
    ? [0, 1, 2, 3, 4, 5, 6] 
    : (Array.isArray(schedule) ? schedule.map(Number) : [Number(schedule)]);

  if (targetDays.length === 0 || isNaN(targetDays[0])) return null;

  // 從今天開始往後推 7 天內，找出最近的一個觸發時間
  for (let i = 0; i <= 7; i++) {
    const checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const dayOfWeek = checkDate.getDay();

    if (targetDays.includes(dayOfWeek)) {
      checkDate.setHours(targetHour, targetMinute, 0, 0);
      // 如果時間是大於現在的 (也就是未來的時間)，這就是最接近的下一班車
      if (checkDate > now) {
         return checkDate;
      }
    }
  }
  return null;
}

// 2. 將 Date 物件轉為「今天 19:00 (約 2 小時 15 分後)」的格式
function formatNextRunText(nextRun: Date | null): string {
  if (!nextRun) return "無法計算預計時間";
  const now = new Date();
  const diffMs = nextRun.getTime() - now.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  
  const isToday = nextRun.getDate() === now.getDate();
  const isTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getDate() === nextRun.getDate();
  
  let dayStr = "";
  if (isToday) dayStr = "今天";
  else if (isTomorrow) dayStr = "明天";
  else {
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    dayStr = `星期${days[nextRun.getDay()]}`;
  }

  const timeStr = `${String(nextRun.getHours()).padStart(2, '0')}:${String(nextRun.getMinutes()).padStart(2, '0')}`;
  
  if (hours === 0 && mins === 0) return `預計下次執行：${dayStr} ${timeStr} (即將執行)`;
  if (hours === 0) return `預計下次執行：${dayStr} ${timeStr} (約 ${mins} 分後)`;
  return `預計下次執行：${dayStr} ${timeStr} (約 ${hours} 小時 ${mins} 分後)`;
}

// 實時更新的下一班車徽章元件
const NextRunIndicator = ({ rule }: { rule: ReminderRule }) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    // 設定每 60 秒喚醒一次，重新設定當下時間來重算倒數
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  if (!rule.isActive) {
    return (
      <div className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-400 font-medium">
         <span className="w-2 h-2 rounded-full bg-slate-300"></span>
         規則已停用，暫且停止排程
      </div>
    );
  }

  const nextRunDate = getNextRunDate(rule.schedule, rule.timeToNotify);
  const text = formatNextRunText(nextRunDate);

  return (
    <div className="mt-1 flex items-center gap-1.5 text-[12px] text-emerald-600 font-medium">
       <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
       {text}
    </div>
  );
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  customers: Customer[];
  products: Product[];
  lineChannelToken: string;
  setLineChannelToken: (token: string) => void;
  lineUserId: string;
  setLineUserId: (id: string) => void;
  apiEndpoint: string;
}

export const NotificationCenterModal: React.FC<Props> = ({
  isOpen,
  onClose,
  customers,
  products,
  lineChannelToken,
  setLineChannelToken,
  lineUserId,
  setLineUserId,
  apiEndpoint
}) => {
  const { 
    rules, 
    lineChannelToken: storeLineChannelToken, 
    lineUserId: storeLineUserId, 
    dailyBriefing,
    dailyBriefings,
    hasCloudUpdate, 
    setRules, 
    setDailyBriefings,
    resetCloudUpdateFlag 
  } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<'rules' | 'briefing' | 'settings' | 'logs'>('rules');
  const [editingRule, setEditingRule] = useState<ReminderRule | null>(null);
  const [editingBriefing, setEditingBriefing] = useState<DailyBriefingConfig | null>(null);
  const [briefingStaffSearch, setBriefingStaffSearch] = useState('');
  const [dryRunBriefingTarget, setDryRunBriefingTarget] = useState<DailyBriefingConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [staffLoadError, setStaffLoadError] = useState<string | null>(null);
  const { setUnreadLogs } = useLogStore();
  const { apiFetch } = useAuth();

  useEffect(() => {
    if (activeTab === 'logs') {
      setUnreadLogs(false);
    }
  }, [activeTab, setUnreadLogs]);
  
  const [isFunnelOpen, setIsFunnelOpen] = useState(false);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [currentDryRunRuleId, setCurrentDryRunRuleId] = useState<string | null>(null);

  const normalizeStaffArray = (rawList: any[]): StaffOption[] =>
    rawList
      .filter((u: any) => !u?.status || ['ACTIVE', 'TRUE', ''].includes(String(u.status).trim().toUpperCase()))
      .map((s: any) => ({
        userId: String(s.userId || s.id || s.username || '').trim(),
        username: String(s.username || s.userId || s.name || '').trim(),
        name: String(s.name || s.username || s.userId || '未命名用戶').trim(),
        role: String(s.role || 'staff').trim().toLowerCase(),
        line_user_id: String(s.line_user_id || s.lineUserId || '').trim()
      }))
      .filter((s: StaffOption) => Boolean(s.userId));

  const extractUsersFromPayload = (res: any): any[] | null => {
    if (!res) return null;
    const candidate =
      res.users ||
      res.staff ||
      res.data?.users ||
      res.data?.staff ||
      (Array.isArray(res.data) ? res.data : null);
    return Array.isArray(candidate) ? candidate : null;
  };

  const loadStaffList = React.useCallback(async () => {
    setIsLoadingStaff(true);
    setStaffLoadError(null);
    try {
      // 1. 透過 AuthContext apiFetch（自動帶入 APP_TOKEN / APP_SESSION_TOKEN 與解構 GAS data 包裝）
      const allRes = await apiFetch('getAllUsers');
      const allArr = extractUsersFromPayload(allRes);
      if (allRes?.success && allArr && allArr.length > 0) {
        setStaffList(normalizeStaffArray(allArr));
        return;
      }

      const staffRes = await apiFetch('getStaffList');
      const staffArr = extractUsersFromPayload(staffRes);
      if (staffRes?.success && staffArr && staffArr.length > 0) {
        setStaffList(normalizeStaffArray(staffArr));
        return;
      }

      // 2. 若外部傳入的 apiEndpoint 與 AuthContext 不同，補查一次指定端點並相容 data.staff 包裝
      if (apiEndpoint) {
        const token = localStorage.getItem('APP_TOKEN') || localStorage.getItem('APP_SESSION_TOKEN') || '';
        for (const action of ['getAllUsers', 'getStaffList']) {
          try {
            const resp = await fetchWithRetry(apiEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({ action, token, data: {} })
            });
            const json = await resp.json();
            const arr = extractUsersFromPayload(json);
            if ((json?.success || json?.data?.success) && arr && arr.length > 0) {
              setStaffList(normalizeStaffArray(arr));
              return;
            }
          } catch {
            // continue fallback
          }
        }
      }

      const errText = staffRes?.error || allRes?.error || staffRes?.data?.error || allRes?.data?.error || null;
      if (errText) {
        setStaffLoadError(String(errText));
      } else {
        setStaffList([]);
      }
    } catch (e: any) {
      setStaffLoadError(e?.message || '載入系統用戶失敗');
    } finally {
      setIsLoadingStaff(false);
    }
  }, [apiFetch, apiEndpoint]);

  useEffect(() => {
    if (isOpen) {
      resetCloudUpdateFlag();
      if (activeTab === 'logs') {
        setUnreadLogs(false);
      }
      loadStaffList();
    } else {
      setEditingBriefing(null);
      setEditingRule(null);
    }
  }, [isOpen, resetCloudUpdateFlag, activeTab, setUnreadLogs, loadStaffList]);

  useEffect(() => {
    if (hasCloudUpdate) {
      if (editingRule || editingBriefing) {
        // 使用者正在編輯中：靜靜等待，不改變其正在編輯的內容
      } else {
        // 使用者沒有在編輯：利用 AnimatePresence 讓列表自行觸發動畫刷新
      }
      resetCloudUpdateFlag();
    }
  }, [hasCloudUpdate, editingRule, editingBriefing, resetCloudUpdateFlag]);

  const saveToGas = async (
    currentRules: ReminderRule[],
    channelToken: string,
    userId: string,
    throwOnError = false,
    briefingsOverride?: DailyBriefingConfig[]
  ) => {
    const store = useSettingsStore.getState();
    const nextBriefings = briefingsOverride ?? store.dailyBriefings;
    const primaryBriefing = nextBriefings[0] || DEFAULT_DAILY_BRIEFING;
    store.setRules(currentRules);
    store.setLineSettings(channelToken, userId);
    store.setDailyBriefings(nextBriefings);

    if (!apiEndpoint) return;
    setIsSaving(true);
    store.setSavingToCloud(true);
    try {
      container.updateApiEndpoint(apiEndpoint);
      await container.apiClient.post('saveSettings', {
        rules: currentRules,
        lineChannelToken: channelToken,
        lineUserId: userId,
        dailyBriefings: nextBriefings,
        dailyBriefing: primaryBriefing
      });
      // 寫入完成後再次刷新本地鎖定時間窗，避免隨後的同步拉取到舊快照覆蓋
      useSettingsStore.getState().markLocalUpdate();
      // 廣播給其他裝置更新設定與規則
      broadcastDataChange();
    } catch(e) {
      console.error(e);
      if (throwOnError) throw e;
    } finally {
      useSettingsStore.getState().markLocalUpdate();
      useSettingsStore.getState().setSavingToCloud(false);
      setIsSaving(false);
    }
  };

  const saveRules = (newRules: ReminderRule[]) => {
    setRules(newRules); // Store 狀態改變 -> 畫面瞬間更新
    
    // 呼叫原本的 API 同步給 GAS
    saveToGas(newRules, storeLineChannelToken ?? lineChannelToken, storeLineUserId ?? lineUserId);
  };
  
  const handleDryRunRule = async (ruleId: string) => {
    const targetRule = rules.find(r => r.id === ruleId);
    const needsDefaultAdminId = !targetRule?.recipientMode || targetRule.recipientMode === 'DEFAULT_ADMIN';
    if (!apiEndpoint || !lineChannelToken || (needsDefaultAdminId && !lineUserId)) {
      alert(needsDefaultAdminId ? '請填寫完整 Token 與預設 User ID' : '請先填寫 LINE Channel Access Token');
      return;
    }
    
    setIsFunnelOpen(true);
    setIsDryRunning(true);
    setDryRunResult(null);
    setCurrentDryRunRuleId(ruleId);
    
    try {
      container.updateApiEndpoint(apiEndpoint);
      await saveToGas(rules, lineChannelToken, lineUserId);
      const res = await container.logRepo.runDryRun(ruleId);
      if (res?.data) {
        setDryRunResult(res.data);
      } else {
        // Fallback for API structure changes
        setDryRunResult(res);
      }
    } catch(err: any) {
      console.error(err);
      alert('推演時發生錯誤: ' + err.message);
      setIsFunnelOpen(false);
    } finally {
      setIsDryRunning(false);
    }
  };

  const handleCreateBriefing = () => {
    setBriefingStaffSearch('');
    setEditingBriefing({
      ...DEFAULT_DAILY_BRIEFING,
      id: `briefing_${Date.now()}`,
      name: `出車簡報 ${dailyBriefings.length + 1}`,
      enabled: true,
      schedule: ['1', '2', '3', '4', '5', '6'],
      timeToNotify: '06:00',
      includedCustomerIds: [],
      targetStaffIds: [],
      targetStaffNames: {}
    });
  };

  const startEditingBriefing = (target: DailyBriefingConfig) => {
    setBriefingStaffSearch('');
    setEditingBriefing({
      ...DEFAULT_DAILY_BRIEFING,
      ...target,
      id: target.id || `briefing_${Date.now()}`,
      name: target.name || '每日出車簡報'
    });
  };

  const cancelEditingBriefing = () => {
    setEditingBriefing(null);
  };

  const upsertBriefingList = (target: DailyBriefingConfig): { finalized: DailyBriefingConfig; nextList: DailyBriefingConfig[] } => {
    const finalized: DailyBriefingConfig = {
      ...DEFAULT_DAILY_BRIEFING,
      ...target,
      id: target.id || `briefing_${Date.now()}`,
      name: (target.name || '').trim() || '每日出車簡報'
    };
    const exists = dailyBriefings.some(b => b.id === finalized.id);
    const nextList = exists
      ? dailyBriefings.map(b => (b.id === finalized.id ? finalized : b))
      : [...dailyBriefings, finalized];
    return { finalized, nextList };
  };

  const validateBriefingBeforeSend = (target: DailyBriefingConfig): boolean => {
    const activeToken = (storeLineChannelToken || lineChannelToken || '').trim();
    const activeUserId = (storeLineUserId || lineUserId || '').trim();
    if (!apiEndpoint || !activeToken) {
      alert('請先於「LINE 設定」填寫 Channel Access Token');
      return false;
    }
    if (target.groupBy === 'BY_TRIP' && !activeUserId) {
      alert('「預設管理員／群組」模式需填寫預設 User ID');
      return false;
    }
    if (target.groupBy === 'SPECIFIC_STAFF' && (!target.targetStaffIds || target.targetStaffIds.length === 0)) {
      alert('請先在「簡報分組與接收對象」勾選至少 1 位系統用戶！');
      return false;
    }
    if (target.briefingMode === 'CUSTOM_TEMPLATE' && (!target.includedCustomerIds || target.includedCustomerIds.length === 0)) {
      alert('請先在「① 添加要通知的店家」至少選取 1 家店家！');
      return false;
    }
    return true;
  };

  const handleSaveBriefing = async () => {
    if (!editingBriefing) return;
    if (editingBriefing.groupBy === 'SPECIFIC_STAFF' && (!editingBriefing.targetStaffIds || editingBriefing.targetStaffIds.length === 0)) {
      alert('已選擇「指定系統用戶接收」，請至少勾選 1 位接收用戶！');
      return;
    }
    const { nextList } = upsertBriefingList(editingBriefing);
    try {
      await saveToGas(
        rules,
        storeLineChannelToken ?? lineChannelToken,
        storeLineUserId ?? lineUserId,
        true,
        nextList
      );
      setEditingBriefing(null);
      alert('出車簡報設定已儲存至雲端！');
    } catch (e: any) {
      alert('儲存簡報設定失敗：' + (e?.message || '網路異常'));
    }
  };

  const handleDeleteBriefing = async (briefingId: string) => {
    const nextList = dailyBriefings.filter((b, idx) => (b.id || `briefing_${idx}`) !== briefingId);
    setDailyBriefings(nextList);
    try {
      await saveToGas(
        rules,
        storeLineChannelToken ?? lineChannelToken,
        storeLineUserId ?? lineUserId,
        false,
        nextList
      );
    } catch (e) {
      console.error(e);
    }
  };

  const handleDryRunBriefing = async (target: DailyBriefingConfig) => {
    if (!validateBriefingBeforeSend(target)) return;
    const activeToken = (storeLineChannelToken || lineChannelToken || '').trim();
    const activeUserId = (storeLineUserId || lineUserId || '').trim();
    const { finalized, nextList } = upsertBriefingList(target);

    setDryRunBriefingTarget(finalized);
    setIsFunnelOpen(true);
    setIsDryRunning(true);
    setDryRunResult(null);
    setCurrentDryRunRuleId(finalized.id || 'DAILY_BRIEFING');

    try {
      await saveToGas(rules, activeToken, activeUserId, true, nextList);
      if (editingBriefing && editingBriefing.id === finalized.id) {
        setEditingBriefing(finalized);
      }
      const token = localStorage.getItem('APP_TOKEN') || localStorage.getItem('APP_SESSION_TOKEN') || '';
      const res = await fetchWithRetry(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'dryRunBriefing',
          token,
          data: { briefing: finalized }
        })
      });
      const json = await res.json();
      setDryRunResult(json?.data ?? json);
    } catch (err: any) {
      console.error(err);
      alert('推演出車簡報時發生錯誤: ' + (err?.message || '未知錯誤'));
      setIsFunnelOpen(false);
    } finally {
      setIsDryRunning(false);
    }
  };

  const handleSendBriefingNow = async (target: DailyBriefingConfig) => {
    if (!validateBriefingBeforeSend(target)) return;
    const activeToken = (storeLineChannelToken || lineChannelToken || '').trim();
    const activeUserId = (storeLineUserId || lineUserId || '').trim();
    const { finalized, nextList } = upsertBriefingList(target);

    setIsSaving(true);
    try {
      await saveToGas(rules, activeToken, activeUserId, true, nextList);
      if (editingBriefing && editingBriefing.id === finalized.id) {
        setEditingBriefing(finalized);
      }
      const token = localStorage.getItem('APP_TOKEN') || localStorage.getItem('APP_SESSION_TOKEN') || '';
      const res = await fetchWithRetry(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'sendBriefingNow',
          token,
          data: { briefing: finalized }
        })
      });
      const json = await res.json();
      const firstResult = Array.isArray(json?.data) ? json.data[0] : json?.data;
      if (json?.success) {
        if (firstResult?.status === 'SKIPPED') {
          alert(`「${finalized.name}」未發送：${firstResult?.details?.reason || '條件未達成'}`);
        } else {
          alert(`已成功發送「${finalized.name}」！收件人：${firstResult?.details?.recipients || '已推播'}`);
        }
      } else {
        alert('發送失敗: ' + (json?.message || json?.error || '未知錯誤'));
      }
    } catch (err: any) {
      alert('發送時發生錯誤: ' + (err?.message || '未知錯誤'));
    } finally {
      setIsSaving(false);
    }
  };

  const executeRealSend = async () => {
    if (!currentDryRunRuleId) return;
    setIsSaving(true);
    try {
      const token = localStorage.getItem('APP_TOKEN') || localStorage.getItem('APP_SESSION_TOKEN') || '';
      const isBriefing = Boolean(dryRunBriefingTarget) || currentDryRunRuleId === 'DAILY_BRIEFING';
      const briefingPayload = dryRunBriefingTarget || dailyBriefings[0] || dailyBriefing;
      const res = await fetchWithRetry(apiEndpoint, {
        method: "POST",
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: isBriefing ? "sendBriefingNow" : "testRule",
          token,
          data: isBriefing ? { briefing: briefingPayload } : { ruleId: currentDryRunRuleId }
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(isBriefing ? '今日出車簡報已立即發送！請確認 LINE 訊息。' : '測試觸發指令已送出！應會立即發送 LINE 訊息。');
        setIsFunnelOpen(false);
        setDryRunBriefingTarget(null);
      } else {
        alert('測試失敗: ' + (data.message || data.error || '未知錯誤'));
      }
    } catch(err: any) {
      alert('測試時發生錯誤: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSettingsOnly = async () => {
    const trimmedToken = lineChannelToken.trim();
    const trimmedUserId = lineUserId.trim();
    if (!apiEndpoint || !trimmedToken || !trimmedUserId) {
      alert('請填寫完整 Token 與 User ID');
      return;
    }
    useSettingsStore.getState().setLineSettings(trimmedToken, trimmedUserId);
    try {
      await saveToGas(rules, trimmedToken, trimmedUserId, true);
      alert('LINE 串接設定已儲存至雲端！');
    } catch (e: any) {
      alert('儲存設定失敗：' + (e?.message || '網路異常'));
    }
  };

  const handleSaveAndTestToken = async () => {
    const trimmedToken = lineChannelToken.trim();
    const trimmedUserId = lineUserId.trim();
    if (!apiEndpoint || !trimmedToken || !trimmedUserId) {
      alert('請填寫完整 Token 與 User ID');
      return;
    }
    // 原子化寫入本地 Store 與 localStorage，避免閉包殘留舊值
    useSettingsStore.getState().setLineSettings(trimmedToken, trimmedUserId);
    setIsSaving(true);
    try {
      // First save (throw if save fails)
      await saveToGas(rules, trimmedToken, trimmedUserId, true);
      
      // Then trigger test message
      container.updateApiEndpoint(apiEndpoint);
      await container.apiClient.post('testLineMessage', {
        lineChannelToken: trimmedToken,
        lineUserId: trimmedUserId
      });
      useSettingsStore.getState().markLocalUpdate();
      alert('已成功儲存並發送測試訊息，請確認您的 LINE！');
    } catch(e: any) {
      alert('執行失敗：' + (e?.message || '未知錯誤'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateRule = () => {
    setEditingRule({
      id: Date.now().toString(),
      name: '今日出車配送明細',
      schedule: ['1', '2', '3', '4', '5', '6'],
      targetDateMode: 'TODAY',
      targetOrderDays: [],
      conditions: [{
        customers: [],
        status: 'ACTIVE_ORDERS',
        products: []
      }],
      timeToNotify: '06:00',
      isActive: true,
      customMessage: '',
      outputFormat: 'DELIVERY_MANIFEST',
      includeItemTotals: true,
      recipientMode: 'ASSIGNED_DRIVER',
      targetStaffIds: [],
      fallbackToAdminIfUnassigned: true,
      priorityCustomerIds: []
    });
  };

  const statusTextMap: Record<string, string> = {
    UNORDERED: '未訂購',
    PENDING: '狀態為待處理',
    ACTIVE_ORDERS: '今日有有效配送單',
    READY_OR_PENDING: '尚待出貨/處理中',
    UNASSIGNED: '尚未指派司機',
    HAS_PRODUCT: '含指定品項訂單'
  };

  const calculatePreview = (rule: ReminderRule) => {
    if (!rule) return "";

    const days = ['日', '一', '二', '三', '四', '五', '六'];
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 86400000);
    const fakeTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}(${days[now.getDay()]}) ${rule.timeToNotify || '06:00'}`;

    const dateMode: ReminderDateMode = rule.targetDateMode || (rule.targetOrderDays && rule.targetOrderDays.length > 0 ? 'WEEKDAYS' : 'TOMORROW');
    let targetDayStr = '';
    if (dateMode === 'TODAY') {
      targetDayStr = `${now.getMonth() + 1}-${now.getDate()}(${days[now.getDay()]})`;
    } else if (dateMode === 'TOMORROW') {
      targetDayStr = `${tomorrow.getMonth() + 1}-${tomorrow.getDate()}(${days[tomorrow.getDay()]})`;
    } else if (rule.targetOrderDays && rule.targetOrderDays.length > 0) {
      targetDayStr = rule.targetOrderDays.map(d => `下個(${days[parseInt(d, 10)]})`).join('、');
    } else {
      targetDayStr = `${tomorrow.getMonth() + 1}-${tomorrow.getDate()}(${days[tomorrow.getDay()]})`;
    }

    if (rule.outputFormat === 'DELIVERY_MANIFEST') {
      const firstPriorityName = (rule.priorityCustomerIds && rule.priorityCustomerIds.length > 0)
        ? (customers.find(c => c.id === rule.priorityCustomerIds![0])?.name || '重點易漏店家')
        : null;
      const sampleProd1 = products[0]?.name || '招牌油麵';
      const sampleProd2 = products[1]?.name || '陽春麵';
      const sampleCust = customers.find(c => !rule.priorityCustomerIds?.includes(c.id))?.name || '示範早餐店';

      let manifest = `【${rule.name || '未命名規則'}】\n`;
      manifest += `📅 配送日：${targetDayStr}（共 ${firstPriorityName ? 2 : 1} 家 / 3 筆明細）\n`;
      if (rule.recipientMode === 'ASSIGNED_DRIVER') {
        manifest += `👤 負責司機：林司機 (依訂單自動拆發)\n`;
      }
      manifest += `🕒 通知時間：${fakeTime}\n`;
      manifest += `━━━━━━━━━━━━━━\n`;
      if (firstPriorityName) {
        manifest += `🚨【重點必送】${firstPriorityName} (第1趟 06:30)\n`;
        manifest += `  • ${sampleProd1} × 15斤\n`;
        manifest += `──────────\n`;
      }
      manifest += `▸ ${sampleCust} (第1趟 07:00)\n`;
      manifest += `  • ${sampleProd1} × 20斤\n`;
      manifest += `  • ${sampleProd2} × 10斤\n`;
      manifest += `  📝 備註：放門口藍色籃子`;
      if (rule.includeItemTotals !== false) {
        manifest += `\n━━━━━━━━━━━━━━\n📦 總備貨小計：\n${sampleProd1} ${firstPriorityName ? 35 : 20}斤、${sampleProd2} 10斤`;
      }
      if (rule.customMessage) {
        const previewMsg = rule.customMessage
          .replace(/{日期}/g, targetDayStr)
          .replace(/{{日期}}/g, targetDayStr)
          .replace(/{總店數}/g, firstPriorityName ? '2' : '1')
          .replace(/{總單數}/g, '3');
        manifest += `\n\n${previewMsg}`;
      }
      return manifest;
    }

    let desc = `【${rule.name || '未命名規則'}】:\n`;
    desc += `${fakeTime}\n`;
    
    (rule.conditions || []).forEach((cond, idx) => {
      const custNames = cond.customers && cond.customers.length > 0 ? cond.customers.map(cId => customers.find(c => c.id === cId)?.name || cId).join('、') : '所有客戶';
      const prodNames = cond.products && cond.products.length > 0 ? cond.products.join('、') : '任何品項';
      const statusStr = statusTextMap[cond.status] || cond.status;
      const opStr = idx > 0 ? (cond.operator === 'AND' ? '【且】' : '【或】') : '';
      desc += `${opStr}${custNames} ${statusStr} ${targetDayStr} ${prodNames}\n`;
    });

    if (rule.customMessage) {
      const previewMsg = rule.customMessage
        .replace(/{日期}/g, targetDayStr)
        .replace(/{{日期}}/g, targetDayStr)
        .replace(/{總店數}/g, '3')
        .replace(/{總單數}/g, '5');
      desc += `\n${previewMsg}`;
    }
    
    return desc;
  };

  const calculateBriefingPreview = (targetBriefing: DailyBriefingConfig) => {
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    const now = new Date();
    const titleDate = `${now.getMonth() + 1}/${now.getDate()}(${days[now.getDay()]})`;
    const prod1 = products[0]?.name || '招牌油麵';
    const prod2 = products[1]?.name || '陽春麵';

    const showTrip = targetBriefing.includeTripInfo === true;
    const showTime = targetBriefing.includeDeliveryTime === true;
    const formatMeta = (tripVal?: string, timeVal?: string) => {
      const parts: string[] = [];
      if (showTrip && tripVal && tripVal !== '未分配') parts.push(tripVal);
      if (showTime && timeVal) parts.push(timeVal);
      return parts.length > 0 ? ` (${parts.join(' ')})` : '';
    };

    if (targetBriefing.briefingMode === 'CUSTOM_TEMPLATE') {
      const includedIds = targetBriefing.includedCustomerIds || [];
      const includedCusts = customers.filter(c => includedIds.includes(c.id) && !c.isArchived);
      const custById = new Map<string, Customer>(includedCusts.map(c => [c.id, c] as const));
      const custByName = new Map<string, Customer>(includedCusts.map(c => [c.name, c] as const));

      const sampleQuantities: Record<string, { prod1: number; prod2: number }> = {};
      let total1 = 0;
      let total2 = 0;
      includedCusts.forEach((c, idx) => {
        const q1 = 15 + idx * 5;
        const q2 = idx % 2 === 0 ? 10 : 0;
        sampleQuantities[c.id] = { prod1: q1, prod2: q2 };
        total1 += q1;
        total2 += q2;
      });

      const subtotalText = includedCusts.length > 0
        ? `📦 總備貨小計（已添加店家）：\n${prod1} ${total1}斤${total2 > 0 ? `、${prod2} ${total2}斤` : ''}`
        : `📦 總備貨小計：\n（尚未添加店家）`;

      const rawTpl = targetBriefing.customTemplate || '';
      if (!rawTpl.trim()) {
        return '（尚未輸入模板內容，請於上方輸入文字並插入店家標籤）';
      }

      let rendered = rawTpl
        .replace(/\{\{今日日期\}\}/g, titleDate)
        .replace(/\{\{無單確認名單\}\}/g, includedCusts[0] ? `❓ 以下標籤店家今日無單：\n• ${includedCusts[includedCusts.length - 1].name}（示範）` : '❓（無異常）');

      const hasManualTotals = rendered.includes('{{總備貨小計}}');
      rendered = rendered.replace(/\{\{總備貨小計\}\}/g, subtotalText);

      rendered = rendered.replace(/\{\{店家:([^|}]+)(?:\|([^}]+))?\}\}/g, (_, rawName, rawId) => {
        const c = (rawId && custById.get(rawId)) || custByName.get(rawName);
        if (!c) {
          return targetBriefing.emptyStoreBehavior === 'SHOW_NO_ORDER'
            ? `▸ ${rawName}（⭕ 今日無單）`
            : '__REMOVE_LINE__';
        }
        const q = sampleQuantities[c.id] || { prod1: 15, prod2: 0 };
        const prefix = c.isWatchlist ? '🚨 ' : '▸ ';
        const metaStr = formatMeta(c.defaultTrip || '第1趟', c.deliveryTime || '07:00');
        let block = `${prefix}${c.name}${metaStr}\n  • ${prod1} × ${q.prod1}斤`;
        if (q.prod2 > 0) block += `\n  • ${prod2} × ${q.prod2}斤`;
        return block;
      });

      rendered = rendered
        .split('\n')
        .filter(line => line.trim() !== '__REMOVE_LINE__')
        .map(line => line.replace(/__REMOVE_LINE__/g, ''))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (targetBriefing.customIncludeItemTotals && !hasManualTotals) {
        rendered += `\n━━━━━━━━━━━━━━\n${subtotalText}`;
      }
      return rendered;
    }

    const watchlistStores = customers.filter(c => c.isWatchlist && !c.isArchived);
    const normalStores = customers.filter(c => !c.isWatchlist && !c.isArchived);

    const watch1 = watchlistStores[0]?.name || '阿明牛肉麵 (範例盯哨)';
    const watchMissing = watchlistStores[1]?.name || (watchlistStores[0]?.name ? null : '老王切仔麵 (範例盯哨)');
    const normal1 = normalStores[0]?.name || '示範早午餐';
    const normal2 = normalStores[1]?.name || '巷口陽春麵';

    const assignedStaffNames = (targetBriefing.targetStaffIds || []).map(id => {
      const s = staffList.find(st => st.userId === id);
      return s?.name || targetBriefing.targetStaffNames?.[id] || id;
    });

    let msg = `🚚【${targetBriefing.name || '今日出車簡報'}】${titleDate}\n`;
    msg += targetBriefing.groupBy === 'BY_DRIVER'
      ? `👤 負責司機：林司機 (依指派拆單)\n`
      : targetBriefing.groupBy === 'SPECIFIC_STAFF'
      ? `👥 指定接收：${assignedStaffNames.length > 0 ? assignedStaffNames.join('、') : '尚未指定用戶'}\n`
      : `🚚 全廠依車趟出車總表\n`;
    msg += `━━━━━━━━━━━━━━\n`;
    msg += `🚨【第一段｜易漏重點必送】(1 家)\n`;
    msg += `▸ ${watch1}${formatMeta('第1趟', '06:30')}\n`;
    msg += `  • ${prod1} × 15斤\n`;
    msg += `  📝 放後門冰櫃旁\n`;
    msg += `━━━━━━━━━━━━━━\n`;
    msg += `🚚【第二段｜今日一般配送】(2 家)\n`;
    if (targetBriefing.groupBy === 'BY_TRIP') {
      msg += `【第一趟】\n`;
    }
    msg += `▸ ${normal1}${formatMeta('第1趟', '07:00')}\n`;
    msg += `  • ${prod1} × 20斤\n`;
    msg += `  • ${prod2} × 10斤\n`;
    msg += `──────────\n`;
    msg += `▸ ${normal2}${formatMeta('第2趟', '09:00')}\n`;
    msg += `  • ${prod2} × 15斤\n`;

    if (targetBriefing.includeItemTotals) {
      msg += `━━━━━━━━━━━━━━\n📦 總備貨小計：\n${prod1} 35斤、${prod2} 25斤\n`;
    }

    if (targetBriefing.includeWatchlistMissingCheck && watchMissing) {
      msg += `━━━━━━━━━━━━━━\n`;
      msg += `❓【第三段｜盯哨店家今日無單確認】(1 家)\n`;
      msg += `以下重點店家今日非公休但 0 筆訂單，請確認是否漏打單：\n`;
      msg += `• ${watchMissing}`;
    }
    return msg.trim();
  };

  if (!isOpen) return null;

  const activeDryRunRule: ReminderRule | undefined = dryRunBriefingTarget
    ? {
        id: dryRunBriefingTarget.id || 'DAILY_BRIEFING',
        name: dryRunBriefingTarget.name || '每日出車簡報',
        schedule: dryRunBriefingTarget.schedule,
        conditions: [],
        timeToNotify: dryRunBriefingTarget.timeToNotify,
        isActive: dryRunBriefingTarget.enabled
      }
    : rules.find(r => r.id === currentDryRunRuleId);

  return (
    <>
      <AnimatePresence>
        <div id="notification-center-modal" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/40 backdrop-blur-sm">
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-white w-full max-w-md h-[95dvh] sm:h-[85dvh] sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl relative rounded-t-3xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-white/80 backdrop-blur z-10 sticky top-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 relative">
                <BellRing className="w-5 h-5" />
                {isSaving && (
                  <div className="absolute -top-1 -right-1 bg-white rounded-full">
                    <RefreshCw className="w-4 h-4 text-emerald-500 animate-spin" />
                  </div>
                )}
              </div>
              <div className="flex flex-col">
                <h2 className="text-xl font-bold text-slate-800">通知中心</h2>
                <div className="flex items-center gap-1 mt-0.5">
                  {isSaving ? (
                    <span className="text-[10px] font-medium text-emerald-600 flex flex-row items-center gap-1">
                      雲端儲存中...
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-slate-400 flex flex-row items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      已同步至雲端
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                // 如果正在編輯或新增規則／出車簡報中，點擊叉叉時「返回卡片列表」
                if (activeTab === 'rules' && editingRule) {
                  setEditingRule(null);
                } else if (activeTab === 'briefing' && editingBriefing) {
                  cancelEditingBriefing();
                } else {
                  onClose();
                }
              }}
              className="p-2 bg-slate-50 text-slate-400 rounded-full hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Tabs */}
          <div className="flex border-b border-slate-100 p-2 gap-1.5 bg-slate-50/50">
            <button
              className={`flex-1 py-2 px-1 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${activeTab === 'rules' ? 'bg-white text-amber-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:bg-slate-100'}`}
              onClick={() => setActiveTab('rules')}
            >
              提醒規則
            </button>
            <button
              className={`flex-1 py-2 px-1 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap flex items-center justify-center gap-1 ${activeTab === 'briefing' ? 'bg-white text-rose-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:bg-slate-100'}`}
              onClick={() => setActiveTab('briefing')}
            >
              <span>出車簡報</span>
              {dailyBriefings.some(b => b.enabled) && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
            </button>
            <button
              className={`flex-1 py-2 px-1 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${activeTab === 'logs' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:bg-slate-100'}`}
              onClick={() => setActiveTab('logs')}
            >
              執行日誌
            </button>
            <button
              className={`flex-1 py-2 px-1 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${activeTab === 'settings' ? 'bg-white text-emerald-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:bg-slate-100'}`}
              onClick={() => setActiveTab('settings')}
            >
              LINE 設定
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-50/30 p-4">
            {activeTab === 'rules' && (
              <div className="space-y-4 pb-20">
                {editingRule ? (
                  <>
                    <RuleBuilder 
                      rule={editingRule} 
                      setRule={setEditingRule} 
                      customers={customers} 
                      products={products}
                      staffList={staffList}
                      onSave={() => {
                        const updated = rules.filter(r => r.id !== editingRule.id);
                        saveRules([...updated, editingRule]);
                        setEditingRule(null);
                      }}
                      onCancel={() => setEditingRule(null)}
                      previewText={calculatePreview(editingRule)}
                    />
                  </>
                ) : (
                  <>
                    <AnimatePresence mode="popLayout">
                      {rules.map(rule => {
                        const dateMode: ReminderDateMode = rule.targetDateMode || (rule.targetOrderDays && rule.targetOrderDays.length > 0 ? 'WEEKDAYS' : 'TOMORROW');
                        const dateBadge = dateMode === 'TODAY' ? '今日配送' : dateMode === 'TOMORROW' ? '明日訂單' : '指定星期';
                        const formatBadge = rule.outputFormat === 'DELIVERY_MANIFEST' ? '配送明細表' : '精簡名單';
                        const recipientBadge =
                          rule.recipientMode === 'ASSIGNED_DRIVER'
                            ? '依指派司機拆發'
                            : rule.recipientMode === 'SPECIFIC_STAFF'
                            ? `指定同仁 (${rule.targetStaffIds?.length || 0})`
                            : '預設管理員';

                        return (
                        <motion.div 
                          layout
                          key={rule.id}
                          initial={{ opacity: 0, scale: 0.95, y: -20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                          className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm relative overflow-hidden mb-4"
                        >
                          <div className="flex justify-between items-start mb-2 gap-2">
                            <div className="min-w-0">
                              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2 flex-wrap">
                                <span className="truncate">{rule.name}</span>
                                {!rule.isActive && <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">已停用</span>}
                              </h3>
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${dateMode === 'TODAY' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
                                  {dateBadge}
                                </span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                                  {formatBadge}
                                </span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                                  {recipientBadge}
                                </span>
                                {(rule.priorityCustomerIds?.length || 0) > 0 && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                                    🚨 置頂 {rule.priorityCustomerIds!.length} 家
                                  </span>
                                )}
                              </div>
                              <NextRunIndicator rule={rule} />
                            </div>
                            <div className="flex gap-2 items-center shrink-0">
                              <button onClick={() => handleDryRunRule(rule.id)} className="text-indigo-600 text-[11px] px-2 py-1 flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 rounded-md font-semibold transition-colors">
                                <Sparkles className="w-3 h-3" />
                                診斷
                              </button>
                              <button onClick={() => setEditingRule(rule)} className="text-amber-600 text-sm font-semibold hover:underline border-l border-slate-200 pl-2">編輯</button>
                              <button onClick={() => saveRules(rules.filter(r => r.id !== rule.id))} className="text-rose-500 text-sm pl-1"><Trash2 className="w-4 h-4"/></button>
                            </div>
                          </div>
                          <p className="text-xs text-slate-600 mt-2 bg-slate-50 p-2.5 rounded-xl whitespace-pre-line leading-relaxed max-h-36 overflow-y-auto">
                            {calculatePreview(rule)}
                          </p>
                        </motion.div>
                        );
                      })}
                    </AnimatePresence>
                    
                    <button
                      onClick={handleCreateRule}
                      className="w-full py-4 border-2 border-dashed border-slate-300 rounded-2xl text-slate-500 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-600 transition-all flex items-center justify-center gap-2 font-semibold"
                    >
                      <Plus className="w-5 h-5" />
                      新增提醒規則
                    </button>
                  </>
                )}
              </div>
            )}

            {activeTab === 'briefing' && (() => {
              const watchlistCustomers = customers.filter(c => c.isWatchlist && !c.isArchived);
              const boundDriversCount = staffList.filter(s => Boolean(s.line_user_id)).length;
              const daysList = [
                { label: '日', val: '0' },
                { label: '一', val: '1' },
                { label: '二', val: '2' },
                { label: '三', val: '3' },
                { label: '四', val: '4' },
                { label: '五', val: '5' },
                { label: '六', val: '6' }
              ];

              const roleLabelMap: Record<string, string> = {
                admin: '管理員',
                manager: '領班',
                staff: '員工'
              };

              const resolveStaffName = (staffId: string, namesMap?: Record<string, string>) => {
                const found = staffList.find(s => s.userId === staffId);
                return found?.name || namesMap?.[staffId] || staffId;
              };

              if (!editingBriefing) {
                return (
                  <div className="space-y-4 pb-20">
                    {dailyBriefings.length === 0 ? (
                      <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center text-slate-500 text-sm">
                        尚未建立任何出車簡報，請點擊下方按鈕新增。
                      </div>
                    ) : (
                      <AnimatePresence mode="popLayout">
                        {dailyBriefings.map((briefing, idx) => {
                          const bId = briefing.id || `briefing_${idx}`;
                          const assignedIds = briefing.targetStaffIds || [];
                          const isCustom = briefing.briefingMode === 'CUSTOM_TEMPLATE';
                          const scheduleLabels = (briefing.schedule || [])
                            .slice()
                            .sort((a, b) => Number(a) - Number(b))
                            .map(v => daysList.find(d => d.val === v)?.label || v)
                            .join('');

                          const briefingAsRule: ReminderRule = {
                            id: bId,
                            name: briefing.name || '每日出車簡報',
                            schedule: briefing.schedule || [],
                            conditions: [],
                            timeToNotify: briefing.timeToNotify || '06:00',
                            isActive: briefing.enabled
                          };

                          return (
                            <motion.div
                              layout
                              key={bId}
                              initial={{ opacity: 0, scale: 0.95, y: -20 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                              className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm relative overflow-hidden mb-4"
                            >
                              <div className="flex justify-between items-start mb-2 gap-2">
                                <div className="min-w-0">
                                  <h3 className="font-bold text-slate-800 text-base flex items-center gap-2 flex-wrap">
                                    <span className="truncate">{briefing.name || '每日出車簡報'}</span>
                                    {briefing.enabled ? (
                                      <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                                        ● 已啟用
                                      </span>
                                    ) : (
                                      <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">
                                        ○ 未啟用
                                      </span>
                                    )}
                                  </h3>

                                  {/* 排程與模式標籤 */}
                                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                      isCustom
                                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                                        : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                    }`}>
                                      {isCustom
                                        ? `✨ 標籤模板 (${(briefing.includedCustomerIds || []).length} 家)`
                                        : '📋 標準三段式'}
                                    </span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                                      🕒 週{scheduleLabels || '未設定'} {briefing.timeToNotify || '06:00'}
                                    </span>
                                    {(isCustom ? briefing.customIncludeItemTotals === true : briefing.includeItemTotals !== false) && (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        📦 含備貨小計
                                      </span>
                                    )}
                                    {briefing.includeTripInfo === true && (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                                        含趟數
                                      </span>
                                    )}
                                    {briefing.includeDeliveryTime === true && (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                                        含配送時間
                                      </span>
                                    )}
                                  </div>

                                  {/* 指派接收對象標籤列 */}
                                  <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-slate-100">
                                    <span className="text-[11px] font-bold text-slate-500">接收對象：</span>
                                    {briefing.groupBy === 'SPECIFIC_STAFF' ? (
                                      assignedIds.length > 0 ? (
                                        assignedIds.map(id => {
                                          const matchedStaff = staffList.find(s => s.userId === id);
                                          const unbound = matchedStaff && !matchedStaff.line_user_id;
                                          return (
                                            <span
                                              key={id}
                                              className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                                                unbound
                                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                              }`}
                                            >
                                              <Users className="w-3 h-3" />
                                              <span>{resolveStaffName(id, briefing.targetStaffNames)}</span>
                                              {unbound && <span className="text-[10px] opacity-80">(未綁定LINE)</span>}
                                            </span>
                                          );
                                        })
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                          ⚠️ 尚未指派系統用戶
                                        </span>
                                      )
                                    ) : briefing.groupBy === 'BY_DRIVER' ? (
                                      <>
                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                          🚚 依指派司機自動拆發
                                        </span>
                                        {briefing.fallbackToAdminIfUnassigned !== false && (
                                          <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                            + 未指派轉管理員
                                          </span>
                                        )}
                                      </>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                                        📨 預設管理員／群組 (User ID)
                                      </span>
                                    )}
                                  </div>

                                  <NextRunIndicator rule={briefingAsRule} />
                                </div>

                                <div className="flex gap-2 items-center shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleDryRunBriefing(briefing)}
                                    disabled={isSaving || isDryRunning}
                                    className="text-indigo-600 text-[11px] px-2 py-1 flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 rounded-md font-semibold transition-colors disabled:opacity-50"
                                  >
                                    <Sparkles className="w-3 h-3" />
                                    診斷
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => startEditingBriefing(briefing)}
                                    className="text-amber-600 text-sm font-semibold hover:underline border-l border-slate-200 pl-2"
                                  >
                                    編輯
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteBriefing(bId)}
                                    className="text-rose-500 text-sm pl-1 hover:text-rose-700"
                                    title="刪除此出車簡報"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>

                              <p className="text-xs text-slate-600 mt-2 bg-slate-50 p-2.5 rounded-xl whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto border border-slate-100">
                                {calculateBriefingPreview(briefing)}
                              </p>

                              <div className="mt-3 pt-3 border-t border-slate-100 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => startEditingBriefing(briefing)}
                                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                                >
                                  編輯簡報與接收對象
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSendBriefingNow(briefing)}
                                  disabled={isSaving}
                                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  立即發送今日簡報
                                </button>
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    )}

                    <button
                      type="button"
                      onClick={handleCreateBriefing}
                      className="w-full py-4 border-2 border-dashed border-slate-300 rounded-2xl text-slate-500 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600 transition-all flex items-center justify-center gap-2 font-semibold"
                    >
                      <Plus className="w-5 h-5" />
                      新增出車簡報
                    </button>
                  </div>
                );
              }

              const toggleBriefingDay = (dayVal: string) => {
                const curr = [...(editingBriefing.schedule || [])];
                const next = curr.includes(dayVal)
                  ? curr.filter(d => d !== dayVal)
                  : [...curr, dayVal];
                setEditingBriefing({ ...editingBriefing, schedule: next });
              };

              const toggleBriefingStaff = (staff: StaffOption) => {
                const currIds = [...(editingBriefing.targetStaffIds || [])];
                const exists = currIds.includes(staff.userId);
                const nextIds = exists
                  ? currIds.filter(id => id !== staff.userId)
                  : [...currIds, staff.userId];
                const nextNames = { ...(editingBriefing.targetStaffNames || {}) };
                if (exists) {
                  delete nextNames[staff.userId];
                } else {
                  nextNames[staff.userId] = staff.name;
                }
                setEditingBriefing({
                  ...editingBriefing,
                  targetStaffIds: nextIds,
                  targetStaffNames: nextNames
                });
              };

              const filteredStaff = staffList.filter(s => {
                const q = briefingStaffSearch.trim().toLowerCase();
                if (!q) return true;
                return (
                  String(s.name || '').toLowerCase().includes(q) ||
                  String(s.username || '').toLowerCase().includes(q)
                );
              });

              return (
                <div className="space-y-4 pb-16">
                  {/* 編輯頂部返回列 */}
                  <div className="flex items-center justify-between gap-2 bg-white px-3.5 py-2.5 rounded-2xl border border-slate-200 shadow-sm">
                    <button
                      type="button"
                      onClick={cancelEditingBriefing}
                      className="text-xs font-bold text-slate-600 hover:text-slate-900 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      ← 取消返回列表
                    </button>
                    <span className="text-xs font-bold text-rose-600">
                      {dailyBriefings.some(b => b.id === editingBriefing.id) ? '編輯出車簡報' : '新增出車簡報'}
                    </span>
                  </div>

                  {/* 基本名稱、啟用開關與狀態摘要卡 */}
                  <div className="bg-gradient-to-br from-rose-50 via-amber-50/70 to-white p-4 rounded-2xl border border-rose-200/70 shadow-sm space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                          簡報名稱
                        </label>
                        <input
                          type="text"
                          value={editingBriefing.name || ''}
                          onChange={e => setEditingBriefing({ ...editingBriefing, name: e.target.value })}
                          placeholder="例如：早班司機出車簡報 / 內勤盯哨總表"
                          className="w-full px-3 py-2 bg-white border border-rose-200 rounded-xl font-bold text-sm text-slate-800 outline-none focus:ring-2 focus:ring-rose-400"
                        />
                      </div>
                      <div className="pt-5">
                        <button
                          type="button"
                          onClick={() => setEditingBriefing({ ...editingBriefing, enabled: !editingBriefing.enabled })}
                          className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                            editingBriefing.enabled
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                              : 'bg-white text-slate-500 border-slate-300'
                          }`}
                        >
                          {editingBriefing.enabled ? '● 已啟用' : '○ 未啟用'}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${
                        watchlistCustomers.length > 0
                          ? 'bg-amber-100/80 text-amber-800 border-amber-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        🚨 易漏盯哨店家：{watchlistCustomers.length} 家
                      </span>
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                        🚚 已綁定 LINE 司機：{boundDriversCount} 人
                      </span>
                      {editingBriefing.briefingMode === 'CUSTOM_TEMPLATE' && (
                        <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
                          🏷️ 白名單標籤：{(editingBriefing.includedCustomerIds || []).length} 家
                        </span>
                      )}
                    </div>

                    {/* 模式切換：標準全店 vs 自訂標籤模板 */}
                    <div>
                      <div className="grid grid-cols-2 gap-1.5 bg-white/80 p-1 rounded-xl border border-rose-200/70">
                        <button
                          type="button"
                          onClick={() => setEditingBriefing({ ...editingBriefing, briefingMode: 'STANDARD_ALL' })}
                          className={`py-2 px-2 rounded-lg text-xs font-bold transition-all ${
                            (editingBriefing.briefingMode || 'STANDARD_ALL') === 'STANDARD_ALL'
                              ? 'bg-slate-800 text-white shadow-sm'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          標準三段式（全部店家）
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingBriefing({ ...editingBriefing, briefingMode: 'CUSTOM_TEMPLATE' })}
                          className={`py-2 px-2 rounded-lg text-xs font-bold transition-all ${
                            editingBriefing.briefingMode === 'CUSTOM_TEMPLATE'
                              ? 'bg-rose-600 text-white shadow-sm'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          ✨ 標籤模板（僅傳指定店家）
                        </button>
                      </div>
                    </div>

                    {(editingBriefing.briefingMode || 'STANDARD_ALL') === 'STANDARD_ALL' && watchlistCustomers.length === 0 && (
                      <div className="text-[11px] text-amber-800 bg-amber-100/60 border border-amber-200 rounded-xl px-3 py-2">
                        💡 目前尚未標記任何「易漏盯哨」店家；可前往「客戶管理 → 編輯客戶 → 配送與習慣」打開「🚨 易漏盯哨店家」開關，即會自動列入第一段置頂與第三段漏單確認。
                      </div>
                    )}
                  </div>

                  {/* 方案 B：標籤模板編輯器 */}
                  {editingBriefing.briefingMode === 'CUSTOM_TEMPLATE' && (
                    <BriefingTemplateEditor
                      briefing={editingBriefing}
                      onChange={setEditingBriefing}
                      customers={customers}
                    />
                  )}

                  {/* 每日推播排程 */}
                  <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                      {editingBriefing.briefingMode === 'CUSTOM_TEMPLATE' ? '④ 每日推播排程' : '① 每日推播排程'}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {daysList.map(d => {
                        const active = (editingBriefing.schedule || []).includes(d.val);
                        return (
                          <button
                            key={d.val}
                            type="button"
                            onClick={() => toggleBriefingDay(d.val)}
                            className={`w-9 h-9 rounded-full font-bold text-xs transition-colors ${
                              active ? 'bg-rose-500 text-white shadow-sm' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            }`}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">推播時間（建議設整點，系統將於該小時推播一次）</label>
                      <input
                        type="time"
                        value={editingBriefing.timeToNotify || '06:00'}
                        onChange={e => {
                          let val = e.target.value;
                          if (val && val.includes(':')) {
                            const [h, m] = val.split(':');
                            val = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
                          }
                          setEditingBriefing({ ...editingBriefing, timeToNotify: val });
                        }}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold"
                      />
                    </div>
                  </div>

                  {/* 分組與發送對象 */}
                  <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                      {editingBriefing.briefingMode === 'CUSTOM_TEMPLATE' ? '⑤ 簡報分組與接收對象' : '② 簡報分組與接收對象'}
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingBriefing({ ...editingBriefing, groupBy: 'BY_DRIVER' })}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          editingBriefing.groupBy === 'BY_DRIVER'
                            ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div className="text-sm font-bold text-slate-800 flex items-center justify-between">
                          <span>👤 依指派司機自動拆發</span>
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md font-bold">推薦現場使用</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          每位司機只看自己今日要送的店家與品項；{editingBriefing.briefingMode === 'CUSTOM_TEMPLATE' ? '未指派給該司機的白名單店家會自動隱藏。' : '「盯哨無單確認」會另發給管理員避免干擾司機。'}
                        </div>
                      </button>

                      {editingBriefing.groupBy === 'BY_DRIVER' && (
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-amber-50/70 px-3 py-2 rounded-xl border border-amber-200/70 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editingBriefing.fallbackToAdminIfUnassigned !== false}
                            onChange={e => setEditingBriefing({ ...editingBriefing, fallbackToAdminIfUnassigned: e.target.checked })}
                            className="rounded text-amber-500 focus:ring-amber-500"
                          />
                          <span>有未指派司機或司機尚未綁定 LINE 的訂單時，併入管理員摘要中提醒</span>
                        </label>
                      )}

                      <button
                        type="button"
                        onClick={() => setEditingBriefing({ ...editingBriefing, groupBy: 'SPECIFIC_STAFF' })}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          editingBriefing.groupBy === 'SPECIFIC_STAFF'
                            ? 'bg-amber-50 border-amber-500 ring-1 ring-amber-500'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div className="text-sm font-bold text-slate-800 flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5">
                            <Users className="w-4 h-4 text-amber-600" />
                            👥 指定系統用戶接收（直接勾選指派）
                          </span>
                          {(editingBriefing.targetStaffIds || []).length > 0 && (
                            <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md font-bold">
                              已指派 {(editingBriefing.targetStaffIds || []).length} 人
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          從系統帳號列表中直接指派 1 位或多位同仁接收此簡報（不論訂單指派給誰）。
                        </div>
                      </button>

                      {editingBriefing.groupBy === 'SPECIFIC_STAFF' && (
                        <div className="p-3 bg-slate-50 rounded-xl border border-amber-200/80 space-y-2.5">
                          {/* 已選用戶標籤列 */}
                          {(editingBriefing.targetStaffIds || []).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pb-2 border-b border-slate-200/80">
                              {(editingBriefing.targetStaffIds || []).map(id => {
                                const staffObj = staffList.find(s => s.userId === id);
                                return (
                                  <span
                                    key={id}
                                    className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold px-2.5 py-1 rounded-full"
                                  >
                                    <span>👤 {resolveStaffName(id, editingBriefing.targetStaffNames)}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (staffObj) {
                                          toggleBriefingStaff(staffObj);
                                        } else {
                                          const nextIds = (editingBriefing.targetStaffIds || []).filter(x => x !== id);
                                          const nextNames = { ...(editingBriefing.targetStaffNames || {}) };
                                          delete nextNames[id];
                                          setEditingBriefing({ ...editingBriefing, targetStaffIds: nextIds, targetStaffNames: nextNames });
                                        }
                                      }}
                                      className="text-amber-700 hover:text-rose-600"
                                      title="移除指派"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </span>
                                );
                              })}
                            </div>
                          )}

                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-600">系統用戶列表（點選指派接收）：</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-slate-400">
                                已綁定 {boundDriversCount} / {staffList.length} 人
                              </span>
                              <button
                                type="button"
                                onClick={loadStaffList}
                                disabled={isLoadingStaff}
                                className="text-[11px] font-bold text-amber-700 hover:text-amber-900 bg-white border border-amber-200 px-2 py-0.5 rounded-md flex items-center gap-1 disabled:opacity-50"
                                title="重新整理系統用戶列表"
                              >
                                <RefreshCw className={`w-3 h-3 ${isLoadingStaff ? 'animate-spin' : ''}`} />
                                重新載入
                              </button>
                            </div>
                          </div>

                          {staffList.length > 4 && (
                            <input
                              type="text"
                              value={briefingStaffSearch}
                              onChange={e => setBriefingStaffSearch(e.target.value)}
                              placeholder="🔍 搜尋系統用戶姓名或帳號..."
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-amber-400"
                            />
                          )}

                          {isLoadingStaff && staffList.length === 0 ? (
                            <div className="text-xs text-slate-500 py-2 flex items-center gap-1.5">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600" />
                              正在載入系統用戶列表...
                            </div>
                          ) : staffList.length === 0 ? (
                            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2">
                              {staffLoadError
                                ? `載入失敗：${staffLoadError}（請確認登入帳號具備管理員／領班權限，或點右上「重新載入」）`
                                : '目前尚無可用的系統用戶資料（請先於「權限設定」確認已建立帳號，並點右上「重新載入」）。'}
                            </div>
                          ) : filteredStaff.length === 0 ? (
                            <div className="text-xs text-slate-400 py-2">找不到符合「{briefingStaffSearch}」的系統用戶</div>
                          ) : (
                            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-0.5">
                              {filteredStaff.map(s => {
                                const isSelected = (editingBriefing.targetStaffIds || []).includes(s.userId);
                                const hasLine = Boolean(s.line_user_id);
                                return (
                                  <button
                                    key={s.userId}
                                    type="button"
                                    disabled={!hasLine}
                                    onClick={() => toggleBriefingStaff(s)}
                                    className={`text-left px-2.5 py-2 rounded-lg text-xs border transition-all ${
                                      !hasLine
                                        ? 'bg-slate-100 text-slate-400 border-slate-200 opacity-65 cursor-not-allowed'
                                        : isSelected
                                        ? 'bg-amber-50 border-amber-500 text-amber-900 font-bold ring-1 ring-amber-500'
                                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="truncate font-semibold">{s.name}</span>
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">
                                        {roleLabelMap[String(s.role).toLowerCase()] || s.role}
                                      </span>
                                    </div>
                                    <div className="text-[10px] mt-0.5">
                                      {hasLine ? '✅ 已綁定 LINE' : '未綁定 LINE（需先綁定）'}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setEditingBriefing({ ...editingBriefing, groupBy: 'BY_TRIP' })}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          editingBriefing.groupBy === 'BY_TRIP'
                            ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div className="text-sm font-bold text-slate-800">
                          {editingBriefing.briefingMode === 'CUSTOM_TEMPLATE' ? '📨 統一發給預設管理員／群組' : '🚚 依車趟彙整總表（發給預設管理員／群組）'}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {editingBriefing.briefingMode === 'CUSTOM_TEMPLATE'
                            ? '依您編輯的模板格式，將白名單店家今日訂單統一發給 LINE 設定內的預設 User ID。'
                            : '將今日全部訂單依車趟（第一趟、第二趟...）與時間排序，統一發給 LINE 設定內的預設 User ID。'}
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* 標準模式才顯示的三段式開關 */}
                  {(editingBriefing.briefingMode || 'STANDARD_ALL') === 'STANDARD_ALL' && (
                    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-2.5">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                        ③ 簡報內容開關
                      </label>
                      <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-200/70 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingBriefing.includeItemTotals !== false}
                          onChange={e => setEditingBriefing({ ...editingBriefing, includeItemTotals: e.target.checked })}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>附上「📦 總備貨量小計」（依今日品項自動加總斤數/數量）</span>
                      </label>

                      <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-200/70 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingBriefing.includeWatchlistMissingCheck !== false}
                          onChange={e => setEditingBriefing({ ...editingBriefing, includeWatchlistMissingCheck: e.target.checked })}
                          className="rounded text-rose-500 focus:ring-rose-500"
                        />
                        <span>附上「❓ 第三段｜盯哨店家今日無單確認」（傳送給管理員）</span>
                      </label>

                      {editingBriefing.includeWatchlistMissingCheck !== false && (
                        <label className="flex items-center gap-2 ml-4 text-[11px] font-semibold text-slate-600 bg-rose-50/60 px-3 py-2 rounded-xl border border-rose-200/70 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editingBriefing.watchlistMissingOnlyRegular !== false}
                            onChange={e => setEditingBriefing({ ...editingBriefing, watchlistMissingOnlyRegular: e.target.checked })}
                            className="rounded text-rose-500 focus:ring-rose-500"
                          />
                          <span>僅檢查「固定預訂客 (regular)」，排除臨時散客／偶爾叫貨避免誤報</span>
                        </label>
                      )}

                      <div className="bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-200/70 space-y-2">
                        <div className="text-[11px] font-bold text-slate-500">
                          店家明細附加欄位（選填，預設不顯示）：
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-white px-2.5 py-2 rounded-lg border border-slate-200 cursor-pointer hover:border-amber-300 transition-colors">
                            <input
                              type="checkbox"
                              checked={editingBriefing.includeTripInfo === true}
                              onChange={e => setEditingBriefing({ ...editingBriefing, includeTripInfo: e.target.checked })}
                              className="rounded text-amber-600 focus:ring-amber-500"
                            />
                            <span>顯示趟數資訊</span>
                          </label>
                          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-white px-2.5 py-2 rounded-lg border border-slate-200 cursor-pointer hover:border-amber-300 transition-colors">
                            <input
                              type="checkbox"
                              checked={editingBriefing.includeDeliveryTime === true}
                              onChange={e => setEditingBriefing({ ...editingBriefing, includeDeliveryTime: e.target.checked })}
                              className="rounded text-amber-600 focus:ring-amber-500"
                            />
                            <span>顯示配送時間</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 即時排版預覽 */}
                  <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100/70">
                    <h4 className="text-xs font-bold text-blue-800 flex items-center gap-1.5 mb-2">
                      <ClipboardCheck className="w-4 h-4" />
                      {editingBriefing.briefingMode === 'CUSTOM_TEMPLATE' ? '客製化標籤模板即時預覽（範例貨量）' : '固定三段式 LINE 簡報排版預覽'}
                    </h4>
                    <pre className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans bg-white/85 p-3 rounded-xl border border-blue-100">
                      {calculateBriefingPreview(editingBriefing)}
                    </pre>
                  </div>

                  {/* 操作按鈕區 */}
                  <div className="flex flex-col gap-2 pt-1">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSaveBriefing}
                        disabled={isSaving}
                        className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        <Save className="w-4 h-4" />
                        儲存簡報設定
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDryRunBriefing(editingBriefing)}
                        disabled={isSaving || isDryRunning}
                        className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        <Sparkles className="w-4 h-4" />
                        預覽今日簡報 (Dry-Run)
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSendBriefingNow(editingBriefing)}
                      disabled={isSaving}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                      立即發送今日出車簡報
                    </button>
                  </div>
                </div>
              );
            })()}

            {activeTab === 'logs' && (
              <NotificationLogViewer apiEndpoint={apiEndpoint} />
            )}

            {activeTab === 'settings' && (
              <div className="space-y-6">
                 <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                      <MessageCircle className="w-24 h-24 text-emerald-600" />
                    </div>
                    <h3 className="font-bold text-slate-800 text-lg mb-2 relative z-10">LINE Messaging API 串接</h3>
                    <p className="text-sm text-slate-500 mb-4 relative z-10 leading-relaxed">
                      請前往 LINE Developers 建立官方帳號 (Messaging API)，並貼上對應的憑證與您想接收對象的 User ID。<br/>
                      這會讓系統在背景自動發送提醒到您的手機。
                    </p>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Channel Access Token</label>
                        <input 
                          type="text" 
                          value={lineChannelToken}
                          onChange={(e) => setLineChannelToken(e.target.value)}
                          placeholder="請輸入長期有效的 Channel Access Token..."
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-shadow font-mono text-sm relative z-10"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Your User ID (可填寫多個)</label>
                        <input 
                          type="text" 
                          value={lineUserId}
                          onChange={(e) => setLineUserId(e.target.value)}
                          placeholder="請輸入 User ID，多個人請用半形逗號 (,) 分隔"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-shadow font-mono text-sm relative z-10"
                        />
                        <p className="text-[11px] text-slate-400 mt-1">
                          範例: U123..., U456... (最多支援 500 人)。
                          <br/>
                          💡 <b>獲取提示：</b>請到 LINE 將該機器人加為好友，並傳送「<b>查ID</b>」，機器人就會自動回覆您的 User ID。
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex justify-end relative z-10 gap-2">
                      <button onClick={handleSaveSettingsOnly} disabled={isSaving} className="bg-slate-100 text-slate-700 px-4 py-2 rounded-xl font-semibold hover:bg-slate-200 transition-colors disabled:opacity-50">
                        僅儲存設定
                      </button>
                      <button onClick={handleSaveAndTestToken} disabled={isSaving} className="bg-emerald-600 text-white px-6 py-2 rounded-xl font-semibold shadow-sm hover:bg-emerald-700 transition-colors disabled:opacity-50">
                        {isSaving ? '儲存中...' : '儲存與測試'}
                      </button>
                    </div>
                 </div>

                 <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 text-amber-800 text-sm flex gap-3">
                   <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                   <p className="leading-relaxed">
                     提醒功能依賴背景排程 (Google Apps Script 時間觸發器)。當您儲存規則後，雲端每天會自動執行檢查腳本。如果客戶的「公休日」設定包含當天，則會自動跳過不提醒。
                   </p>
                 </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
    <DiagnosticFunnelModal 
      isOpen={isFunnelOpen} 
      onClose={() => {
        setIsFunnelOpen(false);
        setDryRunBriefingTarget(null);
      }} 
      isLoading={isDryRunning} 
      result={dryRunResult} 
      onRealSend={executeRealSend} 
      rule={activeDryRunRule}
    />
  </>
  );
};

// Sub-component for editing a rule
const RuleBuilder = ({ rule, setRule, customers, products, staffList = [], onSave, onCancel, previewText }: any) => {
  const [activePicker, setActivePicker] = useState<{index: number, type: 'customers' | 'products' | 'priority'} | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const onEmojiClick = (emojiData: any) => {
    setRule({
      ...rule,
      customMessage: (rule.customMessage || '') + emojiData.emoji
    });
  };

  const addConditionGroup = (operator: 'AND' | 'OR') => {
    setRule({
      ...rule,
      conditions: [...rule.conditions, { operator, customers: [], status: 'ACTIVE_ORDERS' as ReminderConditionStatus, products: [] }]
    });
  };

  const toggleDay = (dayStr: string) => {
    let curr = [...(rule.schedule || [])];
    if (curr.includes(dayStr)) {
      curr = curr.filter(d => d !== dayStr);
    } else {
      curr.push(dayStr);
    }
    setRule({...rule, schedule: curr});
  };

  const toggleTargetDay = (dayStr: string) => {
    let curr = [...(rule.targetOrderDays || [])];
    if (curr.includes(dayStr)) {
      curr = curr.filter(d => d !== dayStr);
    } else {
      curr.push(dayStr);
    }
    setRule({...rule, targetOrderDays: curr});
  };

  const toggleItem = (cIdx: number, type: 'customers' | 'products', val: string) => {
    const newConds = [...rule.conditions];
    const targetCond = { ...newConds[cIdx] }; 

    let arr = [...(targetCond[type] || [])];
    if (arr.includes(val)) {
      arr = arr.filter(item => item !== val);
    } else {
      arr.push(val);
    }
    
    targetCond[type] = arr;
    newConds[cIdx] = targetCond;

    setRule({...rule, conditions: newConds});
  };

  const togglePriorityCustomer = (custId: string) => {
    const curr: string[] = [...(rule.priorityCustomerIds || [])];
    const next = curr.includes(custId) ? curr.filter(id => id !== custId) : [...curr, custId];
    setRule({ ...rule, priorityCustomerIds: next });
  };

  const toggleTargetStaff = (staffId: string) => {
    const curr: string[] = [...(rule.targetStaffIds || [])];
    const next = curr.includes(staffId) ? curr.filter(id => id !== staffId) : [...curr, staffId];
    setRule({ ...rule, targetStaffIds: next });
  };

  const insertTemplateVar = (token: string) => {
    setRule({ ...rule, customMessage: (rule.customMessage || '') + token });
  };

  const daysList = [
    { label: '日', val: '0' },
    { label: '一', val: '1' },
    { label: '二', val: '2' },
    { label: '三', val: '3' },
    { label: '四', val: '4' },
    { label: '五', val: '5' },
    { label: '六', val: '6' }
  ];

  const dateMode: ReminderDateMode = rule.targetDateMode || (rule.targetOrderDays && rule.targetOrderDays.length > 0 ? 'WEEKDAYS' : 'TOMORROW');
  const outputFormat: ReminderOutputFormat = rule.outputFormat || 'SUMMARY_NAMES';
  const recipientMode: ReminderRecipientMode = rule.recipientMode || 'DEFAULT_ADMIN';
  const boundDriversCount = (staffList as StaffOption[]).filter(s => Boolean(s.line_user_id)).length;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* 區塊 1: 基本資訊與排程時間 */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">規則名稱</label>
            <input 
              type="text" 
              value={rule.name || ''} 
              onChange={e => setRule({...rule, name: e.target.value})} 
              placeholder="例如：早班今日出車明細 / 易漏店家確認"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
            />
          </div>
          <div className="pt-5">
            <button
              type="button"
              onClick={() => setRule({ ...rule, isActive: rule.isActive === false ? true : false })}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${rule.isActive !== false ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}
            >
              {rule.isActive !== false ? '● 已啟用' : '○ 已停用'}
            </button>
          </div>
        </div>
        
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">① 執行週期 (星期幾要跑檢查)</label>
            <div className="flex flex-wrap gap-2">
              {daysList.map(d => {
                const isActive = rule.schedule?.includes(d.val);
                return (
                  <button
                    key={d.val}
                    type="button"
                    onClick={() => toggleDay(d.val)}
                    className={`w-10 h-10 rounded-full font-bold text-sm transition-colors ${isActive ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">檢查哪一天的訂單</label>
            <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setRule({ ...rule, targetDateMode: 'TODAY' })}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition-all ${dateMode === 'TODAY' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                今日配送 (當日)
              </button>
              <button
                type="button"
                onClick={() => setRule({ ...rule, targetDateMode: 'TOMORROW' })}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition-all ${dateMode === 'TOMORROW' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                明日配送 (隔天)
              </button>
              <button
                type="button"
                onClick={() => setRule({ ...rule, targetDateMode: 'WEEKDAYS' })}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition-all ${dateMode === 'WEEKDAYS' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                指定未來星期
              </button>
            </div>

            {dateMode === 'WEEKDAYS' && (
              <div className="mt-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200/70">
                <div className="text-[11px] text-slate-400 mb-2 leading-snug">
                  尋找未來 7 天內（不含今天）符合下列星期的配送單：
                </div>
                <div className="flex flex-wrap gap-2">
                  {daysList.map(d => {
                    const isActive = rule.targetOrderDays?.includes(d.val);
                    return (
                      <button
                        key={'target_'+d.val}
                        type="button"
                        onClick={() => toggleTargetDay(d.val)}
                        className={`w-9 h-9 rounded-full font-bold text-xs transition-colors ${isActive ? 'bg-indigo-500 text-white shadow-sm' : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-100'}`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">提醒時間</label>
            <input 
              type="time" 
              value={rule.timeToNotify || ''} 
              onChange={e => {
                let val = e.target.value;
                if (val && val.includes(':')) {
                   const [h, m] = val.split(':');
                   val = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
                }
                setRule({ ...rule, timeToNotify: val });
              }} 
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" 
            />
            <p className="text-[11px] text-slate-400 mt-1">
              建議設定整點（如 06:00、20:00）；系統每小時觸發時會於該小時區間內推播一次，並自動避免重複洗版。
            </p>
          </div>
        </div>
      </div>

      {/* 區塊 2: 邏輯條件組件 */}
      <div className="space-y-3">
        <label className="block text-sm font-bold text-slate-800 pl-1">② 訂單觸發條件 (條件組件)</label>
        {rule.conditions.map((cond: any, cIdx: number) => (
          <div key={cIdx} className="bg-slate-100 rounded-2xl p-4 border border-slate-200 relative flex flex-col gap-4">
            {cIdx > 0 && (
              <div className={`absolute -top-3 left-1/2 -translate-x-1/2 text-white text-[10px] font-bold px-3 py-0.5 rounded-full z-10 shadow-sm ${cond.operator === 'AND' ? 'bg-indigo-600' : 'bg-slate-800'}`}>
                {cond.operator === 'AND' ? 'AND (且)' : 'OR (或)'}
              </div>
            )}
            
            <div className="space-y-4 mt-1">
              {/* WHO */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">對象 (不選代表全部客戶)</span>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {(cond.customers || []).map((cId: string) => {
                    const cName = customers.find((c:any) => c.id === cId)?.name || cId;
                    return (
                      <span key={cId} className="bg-white border border-slate-200 text-slate-700 text-sm px-3 py-1 rounded-full flex items-center gap-1 shadow-sm font-medium">
                        {cName}
                        <button 
                          type="button" 
                          onClick={(e) => { e.preventDefault(); toggleItem(cIdx, 'customers', cId); }} 
                          className="text-slate-400 hover:text-rose-500 rounded-full ml-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )
                  })}
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setActivePicker(activePicker?.index === cIdx && activePicker.type === 'customers' ? null : {index: cIdx, type: 'customers'});
                      setSearchTerm('');
                    }} className="text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1 rounded-full text-sm font-bold flex items-center shadow-sm transition-colors border border-emerald-200/50">
                    ＋ 挑選店家
                  </button>
                </div>
                {activePicker?.index === cIdx && activePicker.type === 'customers' && (
                  <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm mt-1 flex flex-col gap-3">
                    <input 
                      type="text" 
                      placeholder="🔍 搜尋店家..." 
                      value={searchTerm} 
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-shadow"
                    />
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                      {customers.filter((c: any) => String(c?.name || '').toLowerCase().includes(searchTerm.toLowerCase())).map((c: any) => {
                        const selected = (cond.customers || []).includes(c.id);
                        return (
                          <button 
                            key={c.id} 
                            type="button" 
                            onClick={(e) => { e.preventDefault(); toggleItem(cIdx, 'customers', c.id); }} 
                            className={`text-left px-3 py-2 rounded-lg text-sm transition-all border ${selected ? 'border-amber-500 bg-amber-50 text-amber-700 font-bold ring-1 ring-amber-500' : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-300 font-medium'}`}
                          >
                            {c.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ACTION / STATUS */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">發生狀況</span>
                <select 
                  className="bg-white border border-slate-200 rounded-xl text-sm p-2.5 font-medium shadow-sm w-full outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  value={cond.status}
                  onChange={(e) => {
                    const newConds = [...rule.conditions];
                    newConds[cIdx].status = e.target.value;
                    setRule({...rule, conditions: newConds});
                  }}
                >
                  <optgroup label="🚚 正向出貨 / 備貨與派工檢查">
                    <option value="ACTIVE_ORDERS">有有效訂單（排除已取消，含全部配送狀態）</option>
                    <option value="READY_OR_PENDING">尚待出貨／未結案（排除已取消與已送達）</option>
                    <option value="UNASSIGNED">有訂單但尚未指派司機（防漏派提醒）</option>
                    <option value="HAS_PRODUCT">訂單內含下列指定品項（易漏加購品）</option>
                  </optgroup>
                  <optgroup label="⚠️ 異常 / 漏單警戒">
                    <option value="UNORDERED">未訂購（非公休日完全沒有有效訂單）</option>
                    <option value="PENDING">狀態為待處理（訂單尚未處理）</option>
                  </optgroup>
                </select>
              </div>

              {/* PRODUCTS */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">品項範圍 (不選代表全部品項)</span>
                <div className="flex flex-wrap gap-2 items-center">
                  {(cond.products || []).map((pId: string) => {
                    return (
                      <span key={pId} className="bg-white border border-slate-200 text-slate-700 text-sm px-3 py-1 rounded-full flex items-center gap-1 shadow-sm font-medium">
                        {pId}
                        <button 
                          type="button" 
                          onClick={(e) => { e.preventDefault(); toggleItem(cIdx, 'products', pId); }} 
                          className="text-slate-400 hover:text-rose-500 rounded-full ml-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )
                  })}
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setActivePicker(activePicker?.index === cIdx && activePicker.type === 'products' ? null : {index: cIdx, type: 'products'});
                      setSearchTerm('');
                    }} className="text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-full text-sm font-bold flex items-center shadow-sm transition-colors border border-blue-200/50">
                    ＋ 挑選品項
                  </button>
                </div>
                {activePicker?.index === cIdx && activePicker.type === 'products' && (
                  <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm mt-1 flex flex-col gap-3">
                    <input 
                      type="text" 
                      placeholder="🔍 搜尋品項..." 
                      value={searchTerm} 
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                    />
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                      {products.filter((p: any) => String(p?.name || '').toLowerCase().includes(searchTerm.toLowerCase())).map((p: any) => {
                        const selected = (cond.products || []).includes(p.name);
                        return (
                          <button 
                            key={p.name} 
                            type="button" 
                            onClick={(e) => { e.preventDefault(); toggleItem(cIdx, 'products', p.name); }} 
                            className={`text-left px-3 py-2 rounded-lg text-sm transition-all border ${selected ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold ring-1 ring-blue-500' : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-300 font-medium'}`}
                          >
                            {p.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {rule.conditions.length > 1 && (
              <button 
                type="button"
                onClick={() => {
                  const newConds = rule.conditions.filter((_: any, i: number) => i !== cIdx);
                  setRule({...rule, conditions: newConds});
                  setActivePicker(null);
                }}
                className="absolute top-2 right-2 p-1.5 text-rose-400 hover:bg-rose-50 rounded-lg transition-colors"
               >
                <Trash2 className="w-4 h-4"/>
              </button>
            )}
          </div>
        ))}

        <div className="flex gap-2">
          <button 
            type="button"
            onClick={(e) => { e.preventDefault(); addConditionGroup('OR'); }}
            className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-bold flex justify-center items-center gap-2 transition-colors border border-dashed border-slate-300"
          >
            <Plus className="w-4 h-4" />
            新增條件 (OR / 或)
          </button>
          <button 
            type="button"
            onClick={(e) => { e.preventDefault(); addConditionGroup('AND'); }}
            className="flex-1 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-sm font-bold flex justify-center items-center gap-2 transition-colors border border-dashed border-indigo-200"
          >
            <Plus className="w-4 h-4" />
            新增條件 (AND / 且)
          </button>
        </div>
      </div>

      {/* 區塊 3: LINE 訊息格式與易漏置頂強調 */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <ListChecks className="w-4 h-4 text-amber-500" />
            ③ LINE 訊息排版格式
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRule({ ...rule, outputFormat: 'DELIVERY_MANIFEST' })}
              className={`p-3 rounded-xl border text-left transition-all ${outputFormat === 'DELIVERY_MANIFEST' ? 'bg-amber-50 border-amber-400 ring-1 ring-amber-400' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
            >
              <div className="text-sm font-bold text-slate-800">完整配送明細表</div>
              <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">聚合店名＋品項×數量＋時間備註</div>
            </button>
            <button
              type="button"
              onClick={() => setRule({ ...rule, outputFormat: 'SUMMARY_NAMES' })}
              className={`p-3 rounded-xl border text-left transition-all ${outputFormat === 'SUMMARY_NAMES' ? 'bg-indigo-50 border-indigo-400 ring-1 ring-indigo-400' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
            >
              <div className="text-sm font-bold text-slate-800">精簡名單模式</div>
              <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">僅列出符合條件的店家名稱</div>
            </button>
          </div>

          {outputFormat === 'DELIVERY_MANIFEST' && (
            <label className="flex items-center gap-2 mt-3 text-xs font-semibold text-slate-700 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/70 cursor-pointer">
              <input
                type="checkbox"
                checked={rule.includeItemTotals !== false}
                onChange={e => setRule({ ...rule, includeItemTotals: e.target.checked })}
                className="rounded text-amber-500 focus:ring-amber-500"
              />
              <span>在訊息底部自動附加「📦 總備貨量小計」（方便搬貨上車核對）</span>
            </label>
          )}
        </div>

        {/* 易漏店家置頂強調 */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-rose-600 flex items-center gap-1">
              <Star className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
              易漏重點店家（輸出時強制置頂 + 🚨標記）
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            {(rule.priorityCustomerIds || []).map((cId: string) => {
              const cName = customers.find((c: any) => c.id === cId)?.name || cId;
              return (
                <span key={'pri_'+cId} className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-2.5 py-1 rounded-full flex items-center gap-1 font-bold">
                  🚨 {cName}
                  <button
                    type="button"
                    onClick={() => togglePriorityCustomer(cId)}
                    className="text-rose-400 hover:text-rose-600 ml-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setActivePicker(activePicker?.type === 'priority' ? null : { index: -1, type: 'priority' });
                setSearchTerm('');
              }}
              className="text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-1 rounded-full text-xs font-bold border border-rose-200/70 transition-colors"
            >
              ＋ 標記易漏店家
            </button>
          </div>

          {activePicker?.type === 'priority' && (
            <div className="bg-slate-50 rounded-xl p-3 border border-rose-200 mt-2 flex flex-col gap-2.5">
              <input
                type="text"
                placeholder="🔍 搜尋容易忘記配送的店家..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-1 focus:ring-rose-400"
              />
              <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto">
                {customers.filter((c: any) => String(c?.name || '').toLowerCase().includes(searchTerm.toLowerCase())).map((c: any) => {
                  const selected = (rule.priorityCustomerIds || []).includes(c.id);
                  return (
                    <button
                      key={'p_opt_'+c.id}
                      type="button"
                      onClick={() => togglePriorityCustomer(c.id)}
                      className={`text-left px-3 py-2 rounded-lg text-xs transition-all border ${selected ? 'border-rose-500 bg-rose-50 text-rose-700 font-bold' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 font-medium'}`}
                    >
                      {selected ? '🚨 ' : ''}{c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 區塊 4: 發送對象分流 */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
          <Truck className="w-4 h-4 text-emerald-600" />
          ④ LINE 推播對象分流
        </label>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setRule({ ...rule, recipientMode: 'ASSIGNED_DRIVER' })}
            className={`w-full p-3 rounded-xl border text-left transition-all flex items-start justify-between gap-2 ${recipientMode === 'ASSIGNED_DRIVER' ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
          >
            <div>
              <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                依訂單「指派司機」自動拆單推播
                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">
                  已綁定 {boundDriversCount} 人
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                每位司機只會收到自己名下負責的店家與數量，互不干擾
              </div>
            </div>
          </button>

          {recipientMode === 'ASSIGNED_DRIVER' && (
            <label className="flex items-center gap-2 ml-1 text-xs font-semibold text-slate-700 bg-amber-50/70 px-3 py-2 rounded-xl border border-amber-200/70 cursor-pointer">
              <input
                type="checkbox"
                checked={rule.fallbackToAdminIfUnassigned !== false}
                onChange={e => setRule({ ...rule, fallbackToAdminIfUnassigned: e.target.checked })}
                className="rounded text-amber-500 focus:ring-amber-500"
              />
              <span>若有「尚未指派司機」或「司機尚未綁定 LINE」的單，改轉發預設管理員避免漏送</span>
            </label>
          )}

          <button
            type="button"
            onClick={() => setRule({ ...rule, recipientMode: 'DEFAULT_ADMIN' })}
            className={`w-full p-3 rounded-xl border text-left transition-all ${recipientMode === 'DEFAULT_ADMIN' ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
          >
            <div className="text-sm font-bold text-slate-800">預設通知對象 (LINE 串接設定內的 User ID)</div>
            <div className="text-[11px] text-slate-500 mt-0.5">適合管理員自己收總表、異常未訂購或未派工警戒</div>
          </button>

          <button
            type="button"
            onClick={() => setRule({ ...rule, recipientMode: 'SPECIFIC_STAFF' })}
            className={`w-full p-3 rounded-xl border text-left transition-all ${recipientMode === 'SPECIFIC_STAFF' ? 'bg-amber-50 border-amber-500 ring-1 ring-amber-500' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
          >
            <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              指定特定員工接收（無論訂單指派給誰）
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">固定傳給內勤組長或特定配送人員</div>
          </button>

          {recipientMode === 'SPECIFIC_STAFF' && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="text-xs font-bold text-slate-600">勾選要接收此規則通知的同仁：</div>
              {staffList.length === 0 ? (
                <div className="text-xs text-slate-400">正在載入員工名單或尚無資料...</div>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                  {(staffList as StaffOption[]).map(s => {
                    const isSelected = (rule.targetStaffIds || []).includes(s.userId);
                    const hasLine = Boolean(s.line_user_id);
                    return (
                      <button
                        key={s.userId}
                        type="button"
                        disabled={!hasLine}
                        onClick={() => toggleTargetStaff(s.userId)}
                        className={`text-left px-2.5 py-2 rounded-lg text-xs border transition-all ${
                          !hasLine
                            ? 'bg-slate-100 text-slate-400 border-slate-200 opacity-60 cursor-not-allowed'
                            : isSelected
                            ? 'bg-amber-50 border-amber-500 text-amber-800 font-bold ring-1 ring-amber-500'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className="truncate">{s.name}</div>
                        <div className="text-[10px] mt-0.5">{hasLine ? '✅ 已綁定 LINE' : '未綁定 LINE'}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 自訂補充內容 */}
      <div className="space-y-2 mt-4">
        <div className="flex justify-between items-center flex-wrap gap-1">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
            自訂附註結尾 (選填)
          </label>
          <div className="flex gap-1">
            {['{日期}', '{總店數}', '{總單數}'].map(v => (
              <button
                key={v}
                type="button"
                onClick={() => insertTemplateVar(v)}
                className="text-[11px] text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-md font-bold"
              >
                +{v}
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <textarea
            value={rule.customMessage || ''}
            onChange={e => setRule({...rule, customMessage: e.target.value})}
            placeholder="例如：請優先確認🚨重點店家是否有上車！如有臨時異動請回報內勤。"
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-1 focus:ring-emerald-500 pr-10"
            rows={2}
          />
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="absolute right-2 top-2 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <Smile className="w-5 h-5" />
          </button>
          
          {showEmojiPicker && (
            <div className="absolute right-0 bottom-full mb-2 z-50 shadow-2xl rounded-lg" ref={emojiPickerRef}>
              <EmojiPicker onEmojiClick={onEmojiClick} width={300} height={400} />
            </div>
          )}
        </div>
      </div>

      <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100/50 mt-4">
        <h4 className="text-xs font-bold text-blue-800 flex items-center gap-2 mb-2">
          <MessageCircle className="w-4 h-4" />
          LINE 推播格式即時預覽
        </h4>
        <p className="text-xs text-blue-950/90 leading-relaxed whitespace-pre-line font-medium bg-white/70 p-3 rounded-xl border border-blue-100">
          {previewText}
        </p>
      </div>

      <div className="flex gap-3 pt-4 border-t border-slate-100 mt-6 pb-6">
        <button type="button" onClick={onCancel} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors">
          取消
        </button>
        <button type="button" onClick={onSave} className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-bold shadow-md shadow-amber-500/20 hover:bg-amber-600 transition-colors flex justify-center items-center gap-2">
          <Save className="w-4 h-4" />
          儲存規則
        </button>
      </div>
    </div>
  );
};
