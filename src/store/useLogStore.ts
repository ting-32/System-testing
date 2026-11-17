import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SystemLog, NotificationLog } from '../types';

export interface SystemLogMeta {
  totalRows?: number | null;
  hasMore?: boolean | null;
}

interface LogStoreState {
  systemLogs: SystemLog[];
  notifyLogs: NotificationLog[];
  lastSyncSystemTs: number;
  lastSyncNotifyTs: number;
  hasUnreadLogs: boolean;
  totalSystemRows: number | null;
  hasMoreSystemLogs: boolean | null;

  setSystemLogs: (logs: SystemLog[], latestTs: number, meta?: SystemLogMeta) => void;
  mergeNewSystemLogs: (incomingLogs: SystemLog[], latestTs: number, meta?: SystemLogMeta) => void;
  appendOlderSystemLogs: (olderLogs: SystemLog[], meta?: SystemLogMeta) => void;
  setNotifyLogs: (logs: NotificationLog[], latestTs: number) => void;
  setUnreadLogs: (status: boolean) => void;
}

const getLogFingerprint = (log: SystemLog): string =>
  `${log.timestamp || log.timestampStr || '0'}|${log.actionType || ''}|${log.target || ''}|${log.details || ''}`;

export const useLogStore = create<LogStoreState>()(
  persist(
    (set) => ({
      systemLogs: [],
      notifyLogs: [],
      lastSyncSystemTs: 0,
      lastSyncNotifyTs: 0,
      hasUnreadLogs: false,
      totalSystemRows: null,
      hasMoreSystemLogs: null,

      setSystemLogs: (logs, latestTs, meta) =>
        set((state) => ({
          systemLogs: logs,
          lastSyncSystemTs: Math.max(state.lastSyncSystemTs, latestTs || 0),
          totalSystemRows: meta?.totalRows !== undefined ? meta.totalRows : state.totalSystemRows,
          hasMoreSystemLogs: meta?.hasMore !== undefined ? meta.hasMore : state.hasMoreSystemLogs,
        })),

      mergeNewSystemLogs: (incomingLogs, latestTs, meta) =>
        set((state) => {
          if (!Array.isArray(incomingLogs) || incomingLogs.length === 0) {
            return {
              lastSyncSystemTs: Math.max(state.lastSyncSystemTs, latestTs || 0),
            };
          }

          const incomingCounts = new Map<string, number>();
          incomingLogs.forEach((log) => {
            const fp = getLogFingerprint(log);
            incomingCounts.set(fp, (incomingCounts.get(fp) || 0) + 1);
          });

          const keptOlder: SystemLog[] = [];
          state.systemLogs.forEach((existing) => {
            const fp = getLogFingerprint(existing);
            const rem = incomingCounts.get(fp) || 0;
            if (rem > 0) {
              incomingCounts.set(fp, rem - 1);
            } else {
              keptOlder.push(existing);
            }
          });

          const merged = [...incomingLogs, ...keptOlder].sort((a, b) => {
            const ta = a.timestamp || 0;
            const tb = b.timestamp || 0;
            if (ta !== tb) return tb - ta;
            return 0;
          });

          const totalRows = meta?.totalRows !== undefined ? meta.totalRows : state.totalSystemRows;
          let hasMore = state.hasMoreSystemLogs;
          if (typeof totalRows === 'number') {
            hasMore = merged.length < totalRows;
          } else if (meta?.hasMore !== undefined) {
            hasMore = meta.hasMore;
          }

          return {
            systemLogs: merged,
            lastSyncSystemTs: Math.max(state.lastSyncSystemTs, latestTs || 0),
            totalSystemRows: totalRows,
            hasMoreSystemLogs: hasMore,
          };
        }),

      appendOlderSystemLogs: (olderLogs, meta) =>
        set((state) => {
          const existingCounts = new Map<string, number>();
          state.systemLogs.forEach((log) => {
            const fp = getLogFingerprint(log);
            existingCounts.set(fp, (existingCounts.get(fp) || 0) + 1);
          });

          const toAppend: SystemLog[] = [];
          olderLogs.forEach((log) => {
            const fp = getLogFingerprint(log);
            const rem = existingCounts.get(fp) || 0;
            if (rem > 0) {
              existingCounts.set(fp, rem - 1);
            } else {
              toAppend.push(log);
            }
          });

          const merged = [...state.systemLogs, ...toAppend];
          const totalRows = meta?.totalRows !== undefined ? meta.totalRows : state.totalSystemRows;
          const hasMore =
            meta?.hasMore !== undefined
              ? meta.hasMore
              : typeof totalRows === 'number'
                ? merged.length < totalRows
                : state.hasMoreSystemLogs;

          return {
            systemLogs: merged,
            totalSystemRows: totalRows,
            hasMoreSystemLogs: hasMore,
          };
        }),

      setNotifyLogs: (logs, latestTs) => set({ notifyLogs: logs, lastSyncNotifyTs: latestTs }),
      setUnreadLogs: (status) => set({ hasUnreadLogs: status }),
    }),
    {
      name: 'nm_logs_storage',
      partialize: (state) => ({
        systemLogs: state.systemLogs.slice(0, 200),
        notifyLogs: state.notifyLogs.slice(0, 100),
        lastSyncSystemTs: state.lastSyncSystemTs,
        lastSyncNotifyTs: state.lastSyncNotifyTs,
        hasUnreadLogs: state.hasUnreadLogs,
        totalSystemRows: state.totalSystemRows,
        hasMoreSystemLogs: state.hasMoreSystemLogs,
      }),
    }
  )
);
