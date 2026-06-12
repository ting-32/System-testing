import { create } from 'zustand';

interface LogStoreState {
  systemLogs: any[];
  notifyLogs: any[];
  lastSyncSystemTs: number;
  lastSyncNotifyTs: number;
  
  setSystemLogs: (logs: any[], latestTs: number) => void;
  setNotifyLogs: (logs: any[], latestTs: number) => void;
}

export const useLogStore = create<LogStoreState>((set) => ({
  systemLogs: [],
  notifyLogs: [],
  lastSyncSystemTs: 0,
  lastSyncNotifyTs: 0,

  setSystemLogs: (logs, latestTs) => set({ systemLogs: logs, lastSyncSystemTs: latestTs }),
  setNotifyLogs: (logs, latestTs) => set({ notifyLogs: logs, lastSyncNotifyTs: latestTs }),
}));
