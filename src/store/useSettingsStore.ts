import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ReminderRule } from '../types';

interface SettingsState {
  rules: ReminderRule[];
  lineChannelToken: string;
  lineUserId: string;
  hasCloudUpdate: boolean;
  
  // Actions
  setRules: (rules: ReminderRule[]) => void;
  setLineSettings: (token: string, userId: string) => void;
  updateFromCloud: (settings: any) => void;
  resetCloudUpdateFlag: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      rules: [],
      lineChannelToken: '',
      lineUserId: '',
      hasCloudUpdate: false,

      setRules: (rules) => set({ rules }),
      
      setLineSettings: (token, userId) => set({ lineChannelToken: token, lineUserId: userId }),

      updateFromCloud: (settings) => {
        if (!settings) return;
        
        const currentRules = JSON.stringify(get().rules);
        const newRules = JSON.stringify(settings.rules || []);
        
        const isRulesChanged = currentRules !== newRules;
        const isTokenChanged = settings.lineChannelToken !== undefined && settings.lineChannelToken !== get().lineChannelToken;
        const isUserIdChanged = settings.lineUserId !== undefined && settings.lineUserId !== get().lineUserId;

        if (isRulesChanged || isTokenChanged || isUserIdChanged) {
          set({
            rules: settings.rules || get().rules,
            lineChannelToken: settings.lineChannelToken !== undefined ? settings.lineChannelToken : get().lineChannelToken,
            lineUserId: settings.lineUserId !== undefined ? settings.lineUserId : get().lineUserId,
            hasCloudUpdate: true
          });
        }
      },

      resetCloudUpdateFlag: () => set({ hasCloudUpdate: false })
    }),
    {
      name: 'nm_settings_storage'
    }
  )
);
