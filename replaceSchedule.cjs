const fs = require('fs');
let lines = fs.readFileSync('src/App.tsx', 'utf8').split('\n');
const startIdx = lines.findIndex(l => l.includes("{activeTab === 'schedule' && ("));
const endIdx = lines.findIndex((l, i) => i > startIdx && l.includes("            </motion.div>"));

// We need to be careful as there might be a few </motion.div> lines. Let's find exactly the one that corresponds to the end of schedule block.
// Another way is to find the condition `{activeTab === 'finance' && (` which is immediately after it.
const nextTabIdx = lines.findIndex((l, i) => i > startIdx && l.includes("{activeTab === 'finance' && ("));

if (startIdx !== -1 && nextTabIdx !== -1) {
  const replacement = `        {activeTab === 'schedule' && (
          <ScheduleView
            scheduleDate={scheduleDate}
            setScheduleDate={setScheduleDate}
            orders={orders}
            scheduleMoneySummary={scheduleMoneySummary}
            isSelectionMode={isSelectionMode}
            setIsSelectionMode={setIsSelectionMode}
            selectedOrderIds={selectedOrderIds}
            availableTrips={availableTrips}
            handleSetTrip={handleSetTrip}
            showScheduleDeliveryFilters={showScheduleDeliveryFilters}
            setShowScheduleDeliveryFilters={setShowScheduleDeliveryFilters}
            scheduleDeliveryMethodFilter={scheduleDeliveryMethodFilter}
            setScheduleDeliveryMethodFilter={setScheduleDeliveryMethodFilter}
            scheduleOrders={scheduleOrders}
            setIsTripManagerOpen={setIsTripManagerOpen}
            setSelectedDate={setSelectedDate}
            setOrderForm={setOrderForm}
            setEditingOrderId={setEditingOrderId}
            setIsAddingOrder={setIsAddingOrder}
            isOrderReorderMode={isOrderReorderMode}
            setIsOrderReorderMode={setIsOrderReorderMode}
            isSaving={isSaving}
            isWarmingUp={isWarmingUp}
            isRetrying={isRetrying}
            hasReorderedOrders={hasReorderedOrders}
            handleSaveOrderOrder={handleSaveOrderOrder}
            requireAuth={requireAuth}
            groupedScheduleOrders={groupedScheduleOrders}
            setGroupedScheduleOrders={setGroupedScheduleOrders}
            setHasReorderedOrders={setHasReorderedOrders}
            customers={customers}
            toggleOrderSelection={toggleOrderSelection}
            handleSettleOrder={handleSettleOrder}
            handleDeleteOrder={handleDeleteOrder}
            products={products}
          />
        )}
        {/* ... (Finance and Work Tabs remain unchanged) ... */}
`;
  lines.splice(startIdx, nextTabIdx - startIdx, replacement);
  fs.writeFileSync('src/App.tsx', lines.join('\n'));
  console.log('Replaced successfully');
} else {
  console.log('Not found string!', startIdx, nextTabIdx);
}
