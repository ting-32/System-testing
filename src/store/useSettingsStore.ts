import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ReminderRule, DailyBriefingConfig } from '../types';

export const DEFAULT_DAILY_BRIEFING: DailyBriefingConfig = {
  id: 'default_briefing',
  name: '每日出車簡報',
  enabled: false,
  schedule: ['1', '2', '3', '4', '5', '6'],
  timeToNotify: '06:00',
  groupBy: 'BY_DRIVER',
  targetStaffIds: [],
  targetStaffNames: {},
  includeItemTotals: true,
  includeWatchlistMissingCheck: true,
  watchlistMissingOnlyRegular: true,
  fallbackToAdminIfUnassigned: true,
  briefingMode: 'STANDARD_ALL',
  includedCustomerIds: [],
  customTemplate: '🚚【今日重點出車】{{今日日期}}\n',
  emptyStoreBehavior: 'HIDE_LINE',
  customIncludeItemTotals: false,
  includeTripInfo: false,
  includeDeliveryTime: false,
};

export function normalizeBriefingsList(
  list?: DailyBriefingConfig[],
  legacySingle?: DailyBriefingConfig
): DailyBriefingConfig[] {
  if (Array.isArray(list)) {
    return list.map((b, idx) => ({
      ...DEFAULT_DAILY_BRIEFING,
      ...b,
      id: b?.id || (idx === 0 ? 'default_briefing' : `briefing_${idx}`),
      name: b?.name || '每日出車簡報',
    }));
  }
  if (legacySingle && typeof legacySingle === 'object') {
    return [
      {
        ...DEFAULT_DAILY_BRIEFING,
        ...legacySingle,
        id: legacySingle.id || 'default_briefing',
        name: legacySingle.name || '每日出車簡報',
      },
    ];
  }
  return [{ ...DEFAULT_DAILY_BRIEFING }];
}

interface SettingsState {
  rules: ReminderRule[];
  lineChannelToken: string;
  lineUserId: string;
  dailyBriefing: DailyBriefingConfig;
  dailyBriefings: DailyBriefingConfig[];
  hasCloudUpdate: boolean;
  lastLocalUpdateAt: number;
  isSavingToCloud: boolean;
  
  // Actions
  setRules: (rules: ReminderRule[]) => void;
  setLineSettings: (token: string, userId: string) => void;
  setLineChannelToken: (token: string) => void;
  setLineUserId: (userId: string) => void;
  setDailyBriefing: (briefing: DailyBriefingConfig) => void;
  setDailyBriefings: (briefings: DailyBriefingConfig[]) => void;
  markLocalUpdate: () => void;
  setSavingToCloud: (saving: boolean) => void;
  updateFromCloud: (settings: any) => void;
  resetCloudUpdateFlag: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      rules: [],
      lineChannelToken: '',
      lineUserId: '',
      dailyBriefing: DEFAULT_DAILY_BRIEFING,
      dailyBriefings: [{ ...DEFAULT_DAILY_BRIEFING }],
      hasCloudUpdate: false,
      lastLocalUpdateAt: 0,
      isSavingToCloud: false,

      setRules: (rules) => set({ rules, lastLocalUpdateAt: Date.now() }),
      
      setLineSettings: (token, userId) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('nm_line_channel_token', token);
          localStorage.setItem('nm_line_user_id', userId);
        }
        set({ lineChannelToken: token, lineUserId: userId, lastLocalUpdateAt: Date.now() });
      },

      setLineChannelToken: (token) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('nm_line_channel_token', token);
        }
        set({ lineChannelToken: token, lastLocalUpdateAt: Date.now() });
      },

      setLineUserId: (userId) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('nm_line_user_id', userId);
        }
        set({ lineUserId: userId, lastLocalUpdateAt: Date.now() });
      },

      setDailyBriefing: (dailyBriefing) => {
        const currList = get().dailyBriefings || [];
        const normalized = {
          ...DEFAULT_DAILY_BRIEFING,
          ...dailyBriefing,
          id: dailyBriefing.id || currList[0]?.id || 'default_briefing',
          name: dailyBriefing.name || currList[0]?.name || '每日出車簡報',
        };
        const nextList = currList.length > 0
          ? currList.map((b, i) => (b.id === normalized.id || (i === 0 && !dailyBriefing.id) ? normalized : b))
          : [normalized];
        set({
          dailyBriefing: nextList[0] || DEFAULT_DAILY_BRIEFING,
          dailyBriefings: nextList,
          lastLocalUpdateAt: Date.now(),
        });
      },

      setDailyBriefings: (briefings) => {
        const normalizedList = normalizeBriefingsList(briefings);
        set({
          dailyBriefings: normalizedList,
          dailyBriefing: normalizedList[0] || DEFAULT_DAILY_BRIEFING,
          lastLocalUpdateAt: Date.now(),
        });
      },

      markLocalUpdate: () => set({ lastLocalUpdateAt: Date.now() }),

      setSavingToCloud: (saving) => set({
        isSavingToCloud: saving,
        ...(saving ? { lastLocalUpdateAt: Date.now() } : {})
      }),

      updateFromCloud: (settings) => {
        if (!settings) return;

        // 若正在儲存中、使用者正在編輯「通知中心」彈窗，或剛完成本地修改/儲存（10 秒冷卻期內），
        // 禁止雲端舊快照反向覆蓋，徹底杜絕「需改兩次才生效」的競態問題
        const isModalOpen = typeof document !== 'undefined' && document.getElementById('notification-center-modal') !== null;
        const isWithinCooldown = Date.now() - (get().lastLocalUpdateAt || 0) < 10000;
        if (get().isSavingToCloud || isModalOpen || isWithinCooldown) {
          return;
        }
        
        const currentRules = JSON.stringify(get().rules);
        const newRules = JSON.stringify(settings.rules || []);
        const hasCloudBriefings = settings.dailyBriefings !== undefined || settings.dailyBriefing !== undefined;
        const incomingBriefings = hasCloudBriefings
          ? normalizeBriefingsList(settings.dailyBriefings, settings.dailyBriefing)
          : undefined;
        
        const isRulesChanged = currentRules !== newRules;
        const isTokenChanged = settings.lineChannelToken !== undefined && settings.lineChannelToken !== get().lineChannelToken;
        const isUserIdChanged = settings.lineUserId !== undefined && settings.lineUserId !== get().lineUserId;
        const isBriefingChanged = incomingBriefings !== undefined && JSON.stringify(incomingBriefings) !== JSON.stringify(get().dailyBriefings);

        if (isRulesChanged || isTokenChanged || isUserIdChanged || isBriefingChanged) {
          const nextToken = settings.lineChannelToken !== undefined ? settings.lineChannelToken : get().lineChannelToken;
          const nextUserId = settings.lineUserId !== undefined ? settings.lineUserId : get().lineUserId;

          if (typeof window !== 'undefined') {
            if (settings.lineChannelToken !== undefined) {
              localStorage.setItem('nm_line_channel_token', nextToken);
            }
            if (settings.lineUserId !== undefined) {
              localStorage.setItem('nm_line_user_id', nextUserId);
            }
          }

          set({
            rules: settings.rules || get().rules,
            lineChannelToken: nextToken,
            lineUserId: nextUserId,
            dailyBriefings: incomingBriefings || get().dailyBriefings,
            dailyBriefing: (incomingBriefings && incomingBriefings[0]) || get().dailyBriefing,
            hasCloudUpdate: true
          });
        }
      },

      resetCloudUpdateFlag: () => set({ hasCloudUpdate: false })
    }),
    {
      name: 'nm_settings_storage',
      partialize: (state) => ({
        rules: state.rules,
        lineChannelToken: state.lineChannelToken,
        lineUserId: state.lineUserId,
        dailyBriefing: state.dailyBriefing,
        dailyBriefings: state.dailyBriefings,
      }),
      merge: (persistedState: any, currentState) => {
        const p = persistedState || {};
        const migratedBriefings = normalizeBriefingsList(p.dailyBriefings, p.dailyBriefing);
        return {
          ...currentState,
          ...p,
          dailyBriefings: migratedBriefings,
          dailyBriefing: migratedBriefings[0] || DEFAULT_DAILY_BRIEFING,
        };
      },
    }
  )
);
