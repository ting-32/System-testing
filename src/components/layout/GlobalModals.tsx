import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Copy, MapPin, X, CheckCircle2, Check } from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';
import { useAppStore } from '../../store/useAppStore';
import { useSettingsStore } from '../../store/useSettingsStore';

import { UnlockModal } from '../modals/UnlockModal';
import { CustomerPicker } from '../CustomerPicker';
import { ConflictModal } from '../ConflictModal';
import { VoiceInputModal } from '../VoiceInputModal';
import { ConfirmModal } from '../ConfirmModal';
import { DatePickerModal } from '../DatePickerModal';
import { SettingsModal } from '../SettingsModal';
import { TripManagerModal } from '../TripManagerModal';
import { NetworkTimeoutModal } from '../NetworkTimeoutModal';
import { SwipeableOrderCard } from '../SwipeableOrderCard';
import { NotificationCenterModal } from '../NotificationCenterModal';
import { AutoOrderDashboardModal } from '../modals/AutoOrderDashboardModal';
import { buttonTap } from '../animations';

interface GlobalModalsProps {
  isUnlockModalOpen?: boolean;
  onCloseUnlockModal?: () => void;
  handleAppUnlock?: (e: React.FormEvent) => void;
  isUnlocking?: boolean;
  unlockError?: boolean;
  setUnlockError?: (err: boolean) => void;
  unlockPassword?: string;
  setUnlockPassword?: (pwd: string) => void;
  setLayoutMode?: (mode: 'auto' | 'standard' | 'compact') => void;
  apiEndpoint?: string;
  layoutMode?: 'auto' | 'standard' | 'compact';
  syncData?: () => void;
  handleChangePassword?: (a: string, b: string) => void;
  handleSaveApiUrl?: (url: string) => void;
  handleForceRetry?: () => void;
  customers?: any[];
  products?: any[];
  orders?: any[];
  previewDate?: any;
  setPreviewDate?: (date: any) => void;
  prediction?: { greenZone: any[]; grayZone: any[] };
  onToggleAutoOrder?: (customerId: string) => void;
}

export function GlobalModals(props: GlobalModalsProps) {
  const ui = useUIStore();
  
  // 從業務 Store 拿取需要的全域資料
  const { setOrderForm, isSaving } = useAppStore();
  
  // ✨ 把通知設定從真正的 store 取出來
  const notificationSettings = useSettingsStore();
  
  // 優先使用 props 傳入的資料，若無則從 store 提取
  const customers = props.customers || useAppStore(s => s.customers);
  const products = props.products || useAppStore(s => s.products);
  const orders = props.orders || useAppStore(s => s.orders);

  // 預留介面：由於包含部分尚未移入全域 Store 的業務邏輯（如同步機制、API），
  // 在完成全面重構前，可使用 window.dispatchEvent、EventBus，或暫時預留。
  // 為保持載體元件完全無 Props，此處預留回呼介面（未來可整合至對應 Store）。
  const mockHandleAppUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ui.unlockPassword) return;
    ui.setIsUnlocking(true);
    // TODO: Connect to handleLogin via store or event bus
    setTimeout(() => {
      ui.setIsUnlocking(false);
      ui.closeUnlockModal();
    }, 1000);
  };

  const syncData = props.syncData || (() => { /* TODO: Hook to useDataSync */ });
  const handleChangePassword = props.handleChangePassword || ((oldP, newP) => { /* TODO */ });
  const handleSaveApiUrl = props.handleSaveApiUrl || ((url) => { /* TODO */ });
  const handleForceRetry = props.handleForceRetry || (() => { /* TODO */ });
  const handleProcessVoiceOrder = () => { /* TODO */ };
  const handleBatchSettleOrders = () => { /* TODO */ };
  const saveOrderToCloud = async () => false;
  const saveTripsToCloud = async () => false;

  const handleDrawerSelect = (value: string) => {
    if (ui.drawerConfig.target === 'order') {
      import('../../store/useAppStore').then(({ useAppStore }) => {
        useAppStore.getState().setOrderForm((prev: any) => ({ ...prev, [ui.drawerConfig.type]: value }));
      });
    }
    if (ui.drawerConfig.onSelect) {
      ui.drawerConfig.onSelect(value);
    }
    ui.closeDrawer();
  };

  return (
    <>
      <UnlockModal 
        isOpen={props.isUnlockModalOpen ?? ui.isUnlockModalOpen}
        onClose={props.onCloseUnlockModal ?? ui.closeUnlockModal}
        handleAppUnlock={props.handleAppUnlock ?? mockHandleAppUnlock}
        isUnlocking={props.isUnlocking ?? ui.isUnlocking}
        unlockError={props.unlockError ?? ui.unlockError}
        setUnlockError={props.setUnlockError ?? ui.setUnlockError}
        unlockPassword={props.unlockPassword ?? ui.unlockPassword}
        setUnlockPassword={props.setUnlockPassword ?? ui.setUnlockPassword}
      />

      <CustomerPicker 
        isOpen={ui.customerPickerConfig.isOpen} 
        onClose={ui.closeCustomerPicker} 
        onSelect={ui.customerPickerConfig.onSelect!} 
        customers={customers}
        orders={orders}
        selectedDate={ui.customerPickerConfig.selectedDate}
        currentSelectedId={ui.customerPickerConfig.currentSelectedId}
      />

      <ConflictModal 
        isOpen={ui.conflictModalConfig.isOpen}
        conflictData={ui.conflictModalConfig.data}
        onClose={ui.closeConflictModal} 
        onRefresh={() => { syncData(); ui.closeConflictModal(); }}
        onForceSave={handleForceRetry}
        isSaving={isSaving}
      />

      <VoiceInputModal 
        isOpen={ui.isVoiceModalOpen}
        onClose={ui.closeVoiceModal}
        onTranscriptComplete={(transcript) => {
          handleProcessVoiceOrder();
          ui.closeVoiceModal();
        }}
        isAiMode={true} // 預留：此狀態也可移入 Store
        onToggleAiMode={() => {}} 
      />

      <ConfirmModal 
        isOpen={ui.confirmConfig.isOpen} 
        title={ui.confirmConfig.title} 
        message={ui.confirmConfig.message} 
        onConfirm={() => {
          if (ui.confirmConfig.onConfirm) ui.confirmConfig.onConfirm();
          ui.closeConfirm();
        }} 
        onCancel={ui.closeConfirm} 
      />

      <AnimatePresence>
        {ui.datePickerConfig.isOpen && (
          <DatePickerModal 
            selectedDate={ui.datePickerConfig.currentDate} 
            onSelect={(date) => {
              if (ui.datePickerConfig.onSelect) ui.datePickerConfig.onSelect(date);
              ui.closeDatePicker();
            }} 
            onClose={ui.closeDatePicker}
            offDays={ui.datePickerConfig.offDays || []}
            holidayDates={ui.datePickerConfig.holidayDates || []}
          />
        )}
      </AnimatePresence>

      <NotificationCenterModal 
        isOpen={ui.isNotificationCenterOpen} 
        onClose={ui.closeNotificationCenter} 
        customers={customers} 
        products={products} 
        lineChannelToken={notificationSettings.lineChannelToken || ''} 
        setLineChannelToken={(token) => {
          localStorage.setItem('nm_line_channel_token', token);
          notificationSettings.setLineSettings(token, notificationSettings.lineUserId);
        }}
        lineUserId={notificationSettings.lineUserId || ''}
        setLineUserId={(id) => {
          localStorage.setItem('nm_line_user_id', id);
          notificationSettings.setLineSettings(notificationSettings.lineChannelToken, id);
        }}
        apiEndpoint={props.apiEndpoint || ""}
      />

      <AnimatePresence>
        {ui.isSettingsOpen && (
          <SettingsModal 
            onClose={ui.closeSettings} 
            onSync={syncData} 
            onSavePassword={handleChangePassword} 
            currentUrl={props.apiEndpoint || ""} 
            onSaveUrl={handleSaveApiUrl} 
            layoutMode={props.layoutMode || "auto"} 
            onLayoutModeChange={(mode) => {
              if (props.setLayoutMode) props.setLayoutMode(mode);
            }} 
          />
        )}
      </AnimatePresence>

      {ui.isTripManagerOpen && (
        <motion.div key="trip-manager-modal" className="fixed inset-0 z-[60]">
          <TripManagerModal 
            availableTrips={[]} // 預留介面從 Store 中獲取
            setAvailableTrips={() => {}}
            orders={orders}
            setOrders={(orders) => {}}
            onClose={ui.closeTripManager}
            saveOrderToCloud={saveOrderToCloud}
            saveTripsToCloud={saveTripsToCloud}
          />
        </motion.div>
      )}

      <NetworkTimeoutModal isOpen={ui.showDeadlockModal} />

      <AnimatePresence>
        {ui.selectedCustomerForModal && (
          <motion.div 
            key="selected-customer-modal"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" 
            onClick={ui.closeSelectedCustomerModal}
          >
            <motion.div 
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} 
              className="w-full max-w-sm max-h-[90vh] overflow-y-auto" 
              onClick={e => e.stopPropagation()}
            >
              {/* 預留內容。此層需動態尋找對應的 orders。此依賴於 groupedOrders 的封裝 */}
              <button 
                onClick={ui.closeSelectedCustomerModal} 
                className="mt-4 w-full bg-white py-3 rounded-[16px] font-bold text-slate-700 shadow-sm active:bg-slate-50 transition-colors"
              >
                關閉
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 結帳確認彈窗 */}
      <AnimatePresence>
        {ui.settlementTarget && (
          <motion.div key="settlement-modal" className="fixed inset-0 bg-black/60 z-[160] flex items-center justify-center p-4 backdrop-blur-sm" onClick={ui.closeSettlement}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[24px] p-6 w-full max-w-sm shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-extrabold text-slate-800">結帳確認</h3>
                <button onClick={ui.closeSettlement} className="p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-50"><X className="w-4 h-4" /></button>
              </div>
              
              <div className="flex flex-col items-center justify-center p-6 bg-emerald-50 rounded-2xl border border-emerald-100 mb-6">
                <span className="text-sm font-bold text-emerald-600 mb-1">{ui.settlementTarget.name}</span>
                {ui.settlementTarget.totalAmount !== undefined && (
                  <span className="text-4xl font-black text-emerald-600 tracking-tight">
                    ${ui.settlementTarget.totalAmount.toLocaleString()}
                  </span>
                )}
                {ui.settlementTarget.count !== undefined && (
                  <span className="text-xs font-medium text-emerald-600/70 mt-2">
                    預計結清筆數：{ui.settlementTarget.count} 筆
                  </span>
                )}
              </div>
              
              <div className="flex gap-3">
                <button 
                  onClick={ui.closeSettlement}
                  className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button 
                  onClick={() => {
                    handleBatchSettleOrders();
                    ui.closeSettlement();
                  }}
                  className="flex-1 py-3.5 rounded-xl bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-emerald-600 shadow-lg shadow-emerald-200 transition-all active:scale-95 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  確認收款
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 底部抽屜選單 (Bottom Sheet) */}
      <AnimatePresence>
        {ui.drawerConfig.isOpen && (
          <motion.div key="bottom-drawer" className="fixed inset-0 z-[120] flex flex-col justify-end">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={ui.closeDrawer}
            />
            
            <motion.div 
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative bg-gray-50 rounded-t-[32px] p-6 pb-12 shadow-2xl flex flex-col max-h-[70vh]"
            >
              <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-6" />
              <h3 className="text-lg font-extrabold text-morandi-charcoal mb-4 text-center tracking-tight">
                {ui.drawerConfig.type === 'trip' ? '選擇趟數' : '選擇選項'}
              </h3>
              
              <div className="space-y-2 overflow-y-auto custom-scrollbar">
                {(ui.drawerConfig.options || []).map((option: string) => {
                  return (
                    <motion.button
                      key={option}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleDrawerSelect(option)}
                      className="w-full p-4 rounded-2xl text-left font-bold transition-all flex justify-between items-center bg-white text-slate-700 border border-slate-200 hover:border-morandi-blue"
                    >
                      <span>{option}</span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {ui.isAutoOrderDashboardOpen && (
          <AutoOrderDashboardModal
            isOpen={ui.isAutoOrderDashboardOpen}
            onClose={ui.closeAutoOrderDashboard}
            previewDate={props.previewDate || new Date()}
            setPreviewDate={props.setPreviewDate || (() => {})}
            greenZone={props.prediction?.greenZone || []}
            grayZone={props.prediction?.grayZone || []}
            products={products}
            onToggleAutoOrder={props.onToggleAutoOrder || (() => {})}
            onEditItems={(customer: any) => {
              ui.closeAutoOrderDashboard();
            }}
            onSetHoliday={(customerId: string) => {
              ui.closeAutoOrderDashboard();
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
