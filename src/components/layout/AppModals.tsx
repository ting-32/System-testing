import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Copy, MapPin, X, CheckCircle2, Check } from 'lucide-react';
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
import { Order, Customer, Product } from '../../types';

interface AppModalsProps {
  [key: string]: any;
}

export function AppModals(props: AppModalsProps) {
  return (
    <>
      {/* --- Unlock Modal --- */}
      <UnlockModal 
        isOpen={props.showUnlockModal}
        onClose={props.onCloseUnlockModal}
        handleAppUnlock={props.handleAppUnlock}
        isUnlocking={props.isUnlocking}
        unlockError={props.unlockError}
        setUnlockError={props.setUnlockError}
        unlockPassword={props.unlockPassword}
        setUnlockPassword={props.setUnlockPassword}
      />

      {/* --- Customer Picker Modal --- */}
      <CustomerPicker 
        isOpen={props.customerPickerConfig.isOpen} 
        onClose={props.onCloseCustomerPicker} 
        onSelect={props.customerPickerConfig.onSelect} 
        customers={props.customers}
        orders={props.orders}
        selectedDate={props.customerPickerSelectedDate}
        currentSelectedId={props.customerPickerConfig.currentSelectedId}
      />

      {/* --- Conflict Resolution Modal --- */}
      <ConflictModal 
        isOpen={!!props.conflictData}
        conflictData={props.conflictData}
        onClose={props.onCloseConflictModal} 
        onRefresh={props.onRefreshConflictModal}
        onForceSave={props.handleForceRetry}
        isSaving={props.isSaving}
      />

      {/* --- Voice Input Modal --- */}
      <VoiceInputModal 
        isOpen={props.isVoiceModalOpen}
        onClose={props.onCloseVoiceModal}
        onTranscriptComplete={props.handleProcessVoiceOrder}
        isAiMode={props.isAiMode}
        onToggleAiMode={props.setIsAiMode}
      />

      <ConfirmModal 
        isOpen={props.confirmConfig.isOpen} 
        title={props.confirmConfig.title} 
        message={props.confirmConfig.message} 
        onConfirm={props.confirmConfig.onConfirm} 
        onCancel={props.onCancelConfirm} 
      />

      <AnimatePresence>
        {props.isDatePickerOpen && (
          <DatePickerModal 
            selectedDate={props.selectedDate} 
            onSelect={props.setSelectedDate} 
            onClose={props.onCloseDatePicker} 
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {props.isOrderDatePickerOpen && (
          <DatePickerModal 
            selectedDate={props.orderFormDate || props.selectedDate} 
            onSelect={props.onSelectOrderDate} 
            onClose={props.onCloseOrderDatePicker} 
            offDays={props.orderDatePickerOffDays || []}
            holidayDates={props.orderDatePickerHolidayDates || []}
          />
        )}
      </AnimatePresence>

      <NotificationCenterModal 
        isOpen={props.isNotificationCenterOpen} 
        onClose={props.onCloseNotificationCenter} 
        customers={props.customers} 
        products={props.products} 
        lineChannelToken={props.lineChannelToken} 
        setLineChannelToken={props.setLineChannelToken}
        lineUserId={props.lineUserId}
        setLineUserId={props.setLineUserId}
        apiEndpoint={props.apiEndpoint}
      />

      <AnimatePresence>
        {props.isSettingsOpen && (
          <SettingsModal 
            onClose={props.onCloseSettings} 
            onSync={props.syncData} 
            onSavePassword={props.handleChangePassword} 
            currentUrl={props.apiEndpoint} 
            onSaveUrl={props.handleSaveApiUrl} 
            layoutMode={props.layoutMode} 
            onLayoutModeChange={props.setLayoutMode} 
          />
        )}
      </AnimatePresence>

      {props.isTripManagerOpen && (
        <motion.div key="trip-manager-modal" className="fixed inset-0 z-[60]">
          <TripManagerModal 
            availableTrips={props.availableTrips}
            setAvailableTrips={props.setAvailableTrips}
            orders={props.orders}
            setOrders={props.setOrders}
            onClose={props.onCloseTripManager}
            saveOrderToCloud={props.saveOrderToCloud}
            saveTripsToCloud={props.saveTripsToCloud}
          />
        </motion.div>
      )}

      {/* 連線逾時/死鎖彈窗 */}
      <NetworkTimeoutModal isOpen={props.showDeadlockModal} />

      <AnimatePresence>
      {props.selectedCustomerForModal && props.groupedOrdersForModal && (
        <motion.div 
          key="selected-customer-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" 
          onClick={props.onCloseSelectedCustomerModal}
        >
          <motion.div 
            initial={{ scale: 0.95 }} 
            animate={{ scale: 1 }} 
            exit={{ scale: 0.95 }} 
            className="w-full max-w-sm max-h-[90vh] overflow-y-auto" 
            onClick={e => e.stopPropagation()}
          >
            <div className="space-y-3">
              {props.groupedOrdersForModal.map((order: any) => (
                <SwipeableOrderCard 
                  key={order.id}
                  order={order} 
                  productMap={props.productMap} 
                  customerMap={props.customerMap}
                  isLoadingProducts={props.isLoadingProducts}
                  isSelectionMode={false}
                  isSelected={false}
                  onToggleSelection={() => {}}
                  onStatusChange={props.handleSwipeStatusChange}
                  onDelete={() => {
                    props.handleDeleteOrder(order.id);
                  }}
                  onShare={props.handleShareOrder}
                  onMap={props.openGoogleMaps}
                  onEdit={(orderToEdit: any) => {
                    props.handleEditOrder(orderToEdit);
                    props.onCloseSelectedCustomerModal();
                  }}
                  onRetry={props.handleForceRetry}
                  onViewCustomer={(name: string) => {
                    props.onCloseSelectedCustomerModal();
                    props.setActiveTab('customers');
                  }}
                />
              ))}
            </div>
            <div className="bg-white rounded-[24px] p-4 mt-2 shadow-sm">
              <motion.button 
                whileTap={buttonTap} 
                onClick={() => {
                  props.setQuickAddData({ customerName: props.selectedCustomerForModal, items: [{productId: '', quantity: 10, unit: '斤'}] });
                  props.onCloseSelectedCustomerModal();
                }} 
                className="w-full mb-2 py-3 rounded-[16px] border-2 border-dashed border-morandi-blue/30 text-morandi-blue font-bold text-sm flex items-center justify-center gap-2 hover:bg-morandi-blue/5 transition-colors tracking-wide"
              >
                <Plus className="w-4 h-4" /> 追加訂單
              </motion.button>
              <div className="flex gap-2">
                <motion.button 
                  whileTap={buttonTap} 
                  onClick={() => {
                    props.handleCopyOrder(props.selectedCustomerForModal, props.groupedOrdersForModal);
                    props.onCloseSelectedCustomerModal();
                  }} 
                  className="flex-1 py-3 px-4 rounded-[16px] bg-slate-50 text-morandi-pebble border border-slate-200 font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-100 transition-colors shadow-sm tracking-wide"
                >
                  <Copy className="w-4 h-4" /> 複製
                </motion.button>
                <motion.button 
                  whileTap={buttonTap} 
                  onClick={() => {
                    props.openGoogleMaps(props.selectedCustomerForModal);
                    props.onCloseSelectedCustomerModal();
                  }} 
                  className="flex-1 py-3 px-4 rounded-[16px] bg-morandi-blue text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-600 transition-colors shadow-lg shadow-morandi-blue/20 tracking-wide"
                >
                  <MapPin className="w-4 h-4" /> 導航
                </motion.button>
              </div>
            </div>
            <button onClick={props.onCloseSelectedCustomerModal} className="mt-4 w-full bg-white py-3 rounded-[16px] font-bold text-slate-700 shadow-sm active:bg-slate-50 transition-colors">
              關閉
            </button>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Settlement Confirmation Modal */}
      <AnimatePresence>
        {props.settlementTarget && props.settlementPreview && (
          <motion.div key="settlement-modal" className="fixed inset-0 bg-black/60 z-[160] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => !props.isSettling && props.onCloseSettlement()}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[24px] p-6 w-full max-w-sm shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-extrabold text-slate-800">結帳確認</h3>
                <button disabled={props.isSettling} onClick={props.onCloseSettlement} className="p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-50"><X className="w-4 h-4" /></button>
              </div>
              
              <div className="flex flex-col items-center justify-center p-6 bg-emerald-50 rounded-2xl border border-emerald-100 mb-6">
                <span className="text-sm font-bold text-emerald-600 mb-1">{props.settlementTarget.name}</span>
                <span className="text-4xl font-black text-emerald-600 tracking-tight">
                  ${props.settlementPreview.totalAmount.toLocaleString()}
                </span>
                <span className="text-xs font-medium text-emerald-600/70 mt-2">
                  預計結清筆數：{props.settlementPreview.count} 筆
                </span>
              </div>
              
              <div className="flex gap-3">
                <button 
                  disabled={props.isSettling}
                  onClick={props.onCloseSettlement}
                  className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button 
                  disabled={props.isSettling}
                  onClick={props.handleBatchSettleOrders}
                  className="flex-1 py-3.5 rounded-xl bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-emerald-600 shadow-lg shadow-emerald-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {props.isSettling ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5" />
                  )}
                  {props.isSettling ? '處理中...' : '確認收款'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 底部抽屜選單 (Bottom Sheet) */}
      <AnimatePresence>
        {props.drawerConfig.isOpen && (
          <motion.div key="bottom-drawer" className="fixed inset-0 z-[120] flex flex-col justify-end">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={props.onCloseDrawer}
            />
            
            <motion.div 
              initial={{ y: "100%" }} 
              animate={{ y: 0 }} 
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative bg-gray-50 rounded-t-[32px] p-6 pb-12 shadow-2xl flex flex-col max-h-[70vh]"
            >
              <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-6" />
              <h3 className="text-lg font-extrabold text-morandi-charcoal mb-4 text-center tracking-tight">
                {props.drawerConfig.type === 'trip' ? '選擇趟數' : '選擇配送方式'}
              </h3>
              
              <div className="space-y-2 overflow-y-auto custom-scrollbar">
                {props.getDrawerOptions().map((option: string) => {
                  const isSelected = props.orderForm[props.drawerConfig.type as keyof typeof props.orderForm] === option;
                  return (
                    <motion.button
                      key={option}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => props.handleDrawerSelect(option)}
                      className={`w-full p-4 rounded-2xl text-left font-bold transition-all flex justify-between items-center ${
                        isSelected 
                          ? 'bg-morandi-blue text-white shadow-md' 
                          : 'bg-white text-slate-700 border border-slate-200 hover:border-morandi-blue'
                      }`}
                    >
                      <span>{option}</span>
                      {isSelected && <Check className="w-5 h-5" />}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {props.isAutoOrderDashboardOpen && (
          <AutoOrderDashboardModal
            isOpen={props.isAutoOrderDashboardOpen}
            onClose={props.onCloseAutoOrderDashboard}
            previewDate={props.previewDate}
            setPreviewDate={props.setPreviewDate}
            greenZone={props.prediction.greenZone}
            grayZone={props.prediction.grayZone}
            products={props.products}
            onToggleAutoOrder={props.onToggleAutoOrder}
            onEditItems={(customer: Customer) => {
              props.onCloseAutoOrderDashboard();
              props.setActiveTab('customers');
            }}
            onSetHoliday={(customerId: string) => {
              props.onCloseAutoOrderDashboard();
              props.setActiveTab('customers');
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
