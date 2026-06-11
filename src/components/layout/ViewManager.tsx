import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { OrdersPage } from '../../pages/OrdersPage';
import { CustomersPage } from '../../pages/CustomersPage';
import { ProductsPage } from '../../pages/ProductsPage';
import { SchedulePage } from '../../pages/SchedulePage';
import { FinancePage } from '../../pages/FinancePage';
import { WorkPage } from '../../pages/WorkPage';

interface ViewManagerProps {
  activeTab: string;
  [key: string]: any; // Accept loosely typed props for simplicity in refactoring, or strictly type it based on App.tsx usage.
}

export function ViewManager({ activeTab, ...props }: ViewManagerProps) {
  return (
    <AnimatePresence mode="popLayout">
      {activeTab === 'orders' && (
        <motion.div
          key="orders-page"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0, zIndex: 10 }}
          exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }}
          transition={{ duration: 0.2 }}
          className="space-y-6 relative"
        >
          <OrdersPage {...props as any} />
        </motion.div>
      )}

      {activeTab === 'customers' && (
        <motion.div
          key="customers-page"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0, zIndex: 10 }}
          exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }}
          transition={{ duration: 0.2 }}
          className="space-y-6 relative"
        >
          <CustomersPage {...props as any} />
        </motion.div>
      )}

      {activeTab === 'products' && (
        <motion.div
          key="products-page"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0, zIndex: 10 }}
          exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }}
          transition={{ duration: 0.2 }}
          className="space-y-6 relative"
        >
          <ProductsPage {...props as any} />
        </motion.div>
      )}

      {activeTab === 'schedule' && (
        <motion.div
          key="schedule-page"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0, zIndex: 10 }}
          exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }}
          transition={{ duration: 0.2 }}
          className="space-y-6 relative"
        >
          <SchedulePage {...props as any} />
        </motion.div>
      )}

      {activeTab === 'finance' && (
        <motion.div
          key="finance-page"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0, zIndex: 10 }}
          exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }}
          transition={{ duration: 0.2 }}
          className="space-y-6 relative"
        >
          <FinancePage {...props as any} />
        </motion.div>
      )}

      {activeTab === 'work' && (
        <motion.div
          key="work-page"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0, zIndex: 10 }}
          exit={{ opacity: 0, x: 10, zIndex: 0, pointerEvents: 'none' }}
          transition={{ duration: 0.2 }}
          className="space-y-6 relative"
        >
          <WorkPage {...props as any} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
