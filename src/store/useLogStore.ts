import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LogStoreState {
  systemLogs: any[];
  notifyLogs: any[];
  lastSyncSystemTs: number;
  lastSyncNotifyTs: number;
  hasUnreadLogs: boolean;
  
  setSystemLogs: (logs: any[], latestTs: number) => void;
  setNotifyLogs: (logs: any[], latestTs: number) => void;
  setUnreadLogs: (status: boolean) => void;
}

export const useLogStore = create<LogStoreState>()(
  persist(
    (set) => ({
      systemLogs: [],
      notifyLogs: [],
      lastSyncSystemTs: 0,
      lastSyncNotifyTs: 0,
      hasUnreadLogs: false,

      setSystemLogs: (logs, latestTs) => set({ systemLogs: logs, lastSyncSystemTs: latestTs }),
      setNotifyLogs: (logs, latestTs) => set({ notifyLogs: logs, lastSyncNotifyTs: latestTs }),
      setUnreadLogs: (status) => set({ hasUnreadLogs: status })
    }),
    {
      name: 'nm_logs_storage'
    }
  )
);
