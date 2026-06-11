import { create } from 'zustand';

interface UIStore {
  // === 系統安全鎖彈窗 ===
  isUnlockModalOpen: boolean;
  unlockPassword: string;
  isUnlocking: boolean;
  unlockError: boolean;
  setUnlockPassword: (password: string) => void;
  setIsUnlocking: (is: boolean) => void;
  setUnlockError: (error: boolean) => void;
  openUnlockModal: () => void;
  closeUnlockModal: () => void;
  
  // === 客戶選擇器 ===
  customerPickerConfig: { 
    isOpen: boolean; 
    onSelect?: (id: string) => void;
    currentSelectedId?: string;
    selectedDate?: string;
  };
  openCustomerPicker: (config: { onSelect: (id: string) => void; currentSelectedId?: string; selectedDate?: string }) => void;
  closeCustomerPicker: () => void;

  // === 衝突處理彈窗 ===
  conflictModalConfig: {
    isOpen: boolean;
    data: any | null;
  };
  openConflictModal: (data: any) => void;
  closeConflictModal: () => void;

  // === 語音輸入彈窗 ===
  isVoiceModalOpen: boolean;
  openVoiceModal: () => void;
  closeVoiceModal: () => void;

  // === 時間選擇器彈窗 ===
  datePickerConfig: {
    isOpen: boolean;
    type: 'general' | 'order';
    currentDate: string;
    onSelect?: (date: string) => void;
    offDays?: string[];
    holidayDates?: string[];
  };
  openDatePicker: (config: Omit<UIStore['datePickerConfig'], 'isOpen'>) => void;
  closeDatePicker: () => void;

  // === 系統設定彈窗 ===
  isSettingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;

  // === 趟數管理彈窗 ===
  isTripManagerOpen: boolean;
  openTripManager: () => void;
  closeTripManager: () => void;

  // === 通知中心彈窗 ===
  isNotificationCenterOpen: boolean;
  openNotificationCenter: () => void;
  closeNotificationCenter: () => void;

  // === 欠款客戶部分結帳彈窗 ===
  partialSettlementTarget: { name: string; orders: any[] } | null;
  openPartialSettlement: (target: { name: string; orders: any[] }) => void;
  closePartialSettlement: () => void;

  // === 結帳確認彈窗 ===
  settlementTarget: { name: string; allOrderIds: string[]; totalAmount?: number; count?: number; } | null;
  openSettlement: (target: { name: string; allOrderIds: string[]; totalAmount?: number; count?: number; }) => void;
  closeSettlement: () => void;

  // === 底部抽屜選單 ===
  drawerConfig: {
    isOpen: boolean;
    type: string;
    target: 'order' | 'customer';
    options?: string[];
    onSelect?: (value: string) => void;
  };
  openDrawer: (config: Omit<UIStore['drawerConfig'], 'isOpen'>) => void;
  closeDrawer: () => void;

  // === 財務操作選單 ===
  financeActionTarget: any | null;
  openFinanceAction: (target: any) => void;
  closeFinanceAction: () => void;

  // === 共用確認彈窗 ===
  confirmConfig: {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm?: () => void;
  };
  openConfirm: (config: Omit<UIStore['confirmConfig'], 'isOpen'>) => void;
  closeConfirm: () => void;

  // === 自動訂單 Dashboard 彈窗 ===
  isAutoOrderDashboardOpen: boolean;
  openAutoOrderDashboard: () => void;
  closeAutoOrderDashboard: () => void;

  // === 選擇客戶訂單總覽彈窗 ===
  selectedCustomerForModal: string | null;
  openSelectedCustomerModal: (customerName: string) => void;
  closeSelectedCustomerModal: () => void;

  // === 網路超時彈窗 ===
  showDeadlockModal: boolean;
  openDeadlockModal: () => void;
  closeDeadlockModal: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  isUnlockModalOpen: false,
  unlockPassword: '',
  isUnlocking: false,
  unlockError: false,
  setUnlockPassword: (password) => set({ unlockPassword: password }),
  setIsUnlocking: (is) => set({ isUnlocking: is }),
  setUnlockError: (error) => set({ unlockError: error }),
  openUnlockModal: () => set({ isUnlockModalOpen: true, unlockPassword: '', unlockError: false }),
  closeUnlockModal: () => set({ isUnlockModalOpen: false }),

  customerPickerConfig: { isOpen: false },
  openCustomerPicker: (config) => set({ customerPickerConfig: { ...config, isOpen: true } }),
  closeCustomerPicker: () => set({ customerPickerConfig: { isOpen: false, onSelect: undefined } }),

  conflictModalConfig: { isOpen: false, data: null },
  openConflictModal: (data) => set({ conflictModalConfig: { isOpen: true, data } }),
  closeConflictModal: () => set({ conflictModalConfig: { isOpen: false, data: null } }),

  isVoiceModalOpen: false,
  openVoiceModal: () => set({ isVoiceModalOpen: true }),
  closeVoiceModal: () => set({ isVoiceModalOpen: false }),

  datePickerConfig: { isOpen: false, type: 'general', currentDate: '' },
  openDatePicker: (config) => set({ datePickerConfig: { ...config, isOpen: true } }),
  closeDatePicker: () => set({ datePickerConfig: { isOpen: false, type: 'general', currentDate: '' } }),

  isSettingsOpen: false,
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),

  isTripManagerOpen: false,
  openTripManager: () => set({ isTripManagerOpen: true }),
  closeTripManager: () => set({ isTripManagerOpen: false }),

  isNotificationCenterOpen: false,
  openNotificationCenter: () => set({ isNotificationCenterOpen: true }),
  closeNotificationCenter: () => set({ isNotificationCenterOpen: false }),

  partialSettlementTarget: null,
  openPartialSettlement: (target) => set({ partialSettlementTarget: target }),
  closePartialSettlement: () => set({ partialSettlementTarget: null }),

  settlementTarget: null,
  openSettlement: (target) => set({ settlementTarget: target }),
  closeSettlement: () => set({ settlementTarget: null }),

  drawerConfig: { isOpen: false, type: '', target: 'order' },
  openDrawer: (config) => set({ drawerConfig: { ...config, isOpen: true } }),
  closeDrawer: () => set({ drawerConfig: { isOpen: false, type: '', target: 'order' } }),

  financeActionTarget: null,
  openFinanceAction: (target) => set({ financeActionTarget: target }),
  closeFinanceAction: () => set({ financeActionTarget: null }),

  confirmConfig: { isOpen: false, title: '', message: '' },
  openConfirm: (config) => set({ confirmConfig: { ...config, isOpen: true } }),
  closeConfirm: () => set({ confirmConfig: { isOpen: false, title: '', message: '' } }),

  isAutoOrderDashboardOpen: false,
  openAutoOrderDashboard: () => set({ isAutoOrderDashboardOpen: true }),
  closeAutoOrderDashboard: () => set({ isAutoOrderDashboardOpen: false }),

  selectedCustomerForModal: null,
  openSelectedCustomerModal: (customerName) => set({ selectedCustomerForModal: customerName }),
  closeSelectedCustomerModal: () => set({ selectedCustomerForModal: null }),

  showDeadlockModal: false,
  openDeadlockModal: () => set({ showDeadlockModal: true }),
  closeDeadlockModal: () => set({ showDeadlockModal: false }),
}));
