import { useEffect, useRef } from 'react';
import { container } from '../core/di/AppContainer';

interface UseBackgroundSyncProps {
  isAuthenticated: boolean;
  apiEndpoint: string | null;
  syncData: (isSilent?: boolean) => Promise<void>;
  isEditingLock: boolean;
}

export function useBackgroundSync({ isAuthenticated, apiEndpoint, syncData, isEditingLock }: UseBackgroundSyncProps) {
  const isPollingRef = useRef(false);
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !apiEndpoint) {
      isPollingRef.current = false;
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
      return;
    }

    isPollingRef.current = true;

    const performPolling = async () => {
      if (!isPollingRef.current) return;

      let nextInterval = 30000; // 預設: 30秒
      let shouldProceed = true;

      // 如果使用者離線，暫停打探針，拉長等待間隔
      if (!navigator.onLine) {
        nextInterval = 60000;
        shouldProceed = false;
      }

      // 如果使用者把分頁縮小或切換到背景（hidden），放慢探針頻率省電
      if (shouldProceed && document.visibilityState === 'hidden') {
        nextInterval = 60000;
      }

      // Safety Lock: Don't sync if user is editing
      if (shouldProceed && isEditingLock) {
        console.log("使用者忙碌中，暫停探針...");
        shouldProceed = false;
      }

      if (shouldProceed) {
        try {
          // 極輕量探針，只獲取全局最新變更時間
          const { globalLastUpdated } = await container.syncRepo.checkUpdates();
          const serverGlobalTs = globalLastUpdated;
          
          // 取得本地上次同步的時間
          const localLastSyncTs = Number(localStorage.getItem('nm_last_sync_ts') || 0);

          if (serverGlobalTs > localLastSyncTs) {
            console.log("發現背景更新，默默同步中...", { serverGlobalTs, localLastSyncTs });
            // 觸發增量同步 (傳入 true 代表背景默默執行)
            await syncData(true);
            // 註: syncData 內部成功抓到資料後會覆寫 localStorage.setItem('nm_last_sync_ts')
          }
        } catch (e) {
          //  Suppress polling error log to avoid console spam when offline or endpoint is invalid
          nextInterval = 60000; // 出錯時退避
        }
      }

      // 使用 setTimeout 確保上一次請求完成後，才開始計算下一次，避免 request pile-up
      if (isPollingRef.current) {
        timeoutIdRef.current = setTimeout(performPolling, nextInterval);
      }
    };

    // 初次啟動 (延遲以避免剛重整畫面時就與 Initial Sync 衝撞)
    timeoutIdRef.current = setTimeout(performPolling, 15000);

    // 監聽 visibility state 以便在重新回到網頁時可以加快同步檢查
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // 使用者回到頁面，立刻清掉舊的等待，短期內觸發檢查
        if (timeoutIdRef.current) {
          clearTimeout(timeoutIdRef.current);
        }
        if (isPollingRef.current) {
          timeoutIdRef.current = setTimeout(performPolling, 1000);
        }
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      isPollingRef.current = false;
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isAuthenticated, apiEndpoint, syncData, isEditingLock]);
}
