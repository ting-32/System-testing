import { useState, useEffect, useCallback, useRef } from 'react';
import liff from '@line/liff';
import { GAS_URL } from '../constants';

export interface LiffAuthResult {
  success: boolean;
  token?: string;
  user?: {
    userId: string;
    username: string;
    name: string;
    role: string;
  };
  error?: string;
  errorCode?: string;
}

interface UseLiffSessionOptions {
  enabled: boolean;
  liffId: string;
  apiEndpoint: string;
  isAuthenticated: boolean;
  onSessionReady: (payload: {
    token: string;
    user: { userId: string; username: string; name: string; role: string };
  }) => void;
}

export function useLiffSession({
  enabled,
  liffId,
  apiEndpoint,
  isAuthenticated,
  onSessionReady,
}: UseLiffSessionOptions) {
  const [isInitializing, setIsInitializing] = useState(false);
  const [isInClient, setIsInClient] = useState(false);
  const [needsBind, setNeedsBind] = useState(false);
  const [liffError, setLiffError] = useState<string | null>(null);
  const [lineProfileName, setLineProfileName] = useState<string>('');
  const tokensRef = useRef<{ idToken: string | null; accessToken: string | null }>({
    idToken: null,
    accessToken: null,
  });
  const initAttemptedRef = useRef(false);

  const resolvedApi =
    (apiEndpoint && apiEndpoint !== 'https://mock-api.local'
      ? apiEndpoint
      : localStorage.getItem('nm_gas_url') || GAS_URL) || 'https://mock-api.local';

  const exchangeLiffToken = useCallback(
    async (idToken: string | null, accessToken: string | null) => {
      if (!idToken && !accessToken) {
        setLiffError('無法取得 LINE 登入憑證，請確認 LIFF Scope 已勾選 profile / openid');
        return false;
      }

      try {
        const res = await fetch(resolvedApi, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'liffLogin',
            data: {
              idToken: idToken || '',
              accessToken: accessToken || '',
              liffId,
              deviceId: 'LIFF_WEBVIEW',
            },
          }),
        });
        const json = await res.json();
        const data = json?.data && typeof json.data === 'object' ? { ...json.data, ...json } : json;

        if (data?.success && data?.token && data?.user) {
          setNeedsBind(false);
          setLiffError(null);
          onSessionReady({ token: data.token, user: data.user });
          return true;
        }

        if (data?.errorCode === 'LINE_NOT_BOUND') {
          if (data.lineDisplayName) setLineProfileName(data.lineDisplayName);
          setNeedsBind(true);
          setLiffError(null);
          return false;
        }

        setLiffError(data?.error || 'LINE 自動登入失敗，請改用系統帳號登入');
        return false;
      } catch (err: any) {
        setLiffError(err?.message || '連線 GAS 失敗，請確認網路連線');
        return false;
      }
    },
    [resolvedApi, liffId, onSessionReady]
  );

  // 初始化 LIFF：若本地已有有效 Token 則背景靜默拿憑證以備不時之需，完全不卡住秒開畫面
  useEffect(() => {
    if (!enabled || !liffId || initAttemptedRef.current) return;
    initAttemptedRef.current = true;

    let cancelled = false;

    const bootstrap = async () => {
      const hasLocalToken = Boolean(
        localStorage.getItem('APP_SESSION_TOKEN') || localStorage.getItem('APP_TOKEN')
      );

      if (!hasLocalToken) {
        setIsInitializing(true);
      }

      try {
        await liff.init({ liffId });
        if (cancelled) return;

        const inClient = liff.isInClient();
        setIsInClient(inClient);

        if (!liff.isLoggedIn()) {
          if (inClient) {
            liff.login({ redirectUri: window.location.href });
            return;
          }
          // 外部瀏覽器未登入 LINE 時，先不強迫跳轉，讓已登入或手動帳密入口可運作
          setIsInitializing(false);
          return;
        }

        const idToken = liff.getIDToken();
        const accessToken = liff.getAccessToken();
        tokensRef.current = { idToken, accessToken };

        try {
          const prof = await liff.getProfile();
          if (!cancelled && prof?.displayName) setLineProfileName(prof.displayName);
        } catch {}

        if (!hasLocalToken && !isAuthenticated) {
          await exchangeLiffToken(idToken, accessToken);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.warn('[LIFF] init error:', err?.message || err);
          if (!isAuthenticated) {
            setLiffError('LIFF 初始化失敗，可直接使用系統帳號登入');
          }
        }
      } finally {
        if (!cancelled) {
          setIsInitializing(false);
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [enabled, liffId, isAuthenticated, exchangeLiffToken]);

  // 當 Token 逾期觸發 app-unauthorized 時，若有 LIFF 憑證可自動靜默換新 Token
  useEffect(() => {
    if (!enabled || !liffId) return;
    const handleUnauthorized = async () => {
      if (tokensRef.current.idToken || tokensRef.current.accessToken) {
        await exchangeLiffToken(tokensRef.current.idToken, tokensRef.current.accessToken);
      }
    };
    window.addEventListener('app-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('app-unauthorized', handleUnauthorized);
  }, [enabled, liffId, exchangeLiffToken]);

  // 首次登入後把目前這隻 LINE 帳號綁進 Users 工作表
  const bindCurrentLineAccount = useCallback(
    async (sessionToken?: string): Promise<{ success: boolean; error?: string }> => {
      const { idToken, accessToken } = tokensRef.current;
      if (!idToken && !accessToken) {
        return { success: false, error: '找不到 LINE 驗證憑證' };
      }
      const tokenToUse =
        sessionToken ||
        localStorage.getItem('APP_SESSION_TOKEN') ||
        localStorage.getItem('APP_TOKEN') ||
        '';
      try {
        const res = await fetch(resolvedApi, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'bindLiffAccount',
            token: tokenToUse,
            data: {
              idToken: idToken || '',
              accessToken: accessToken || '',
              liffId,
            },
          }),
        });
        const json = await res.json();
        const data = json?.data && typeof json.data === 'object' ? { ...json.data, ...json } : json;
        if (data?.success) {
          setNeedsBind(false);
          return { success: true };
        }
        return { success: false, error: data?.error || '綁定失敗' };
      } catch (err: any) {
        return { success: false, error: err?.message || '網路異常' };
      }
    },
    [resolvedApi, liffId]
  );

  const triggerManualLineLogin = useCallback(() => {
    if (!liffId) return;
    try {
      liff.login({ redirectUri: window.location.href });
    } catch (e) {
      console.warn('[LIFF] manual login failed:', e);
    }
  }, [liffId]);

  const closeLiffWindow = useCallback(() => {
    try {
      if (liff.isInClient()) {
        liff.closeWindow();
        return true;
      }
    } catch {}
    return false;
  }, []);

  return {
    isInitializing,
    isInClient,
    needsBind,
    liffError,
    lineProfileName,
    hasLiffTokens: Boolean(tokensRef.current.idToken || tokensRef.current.accessToken),
    bindCurrentLineAccount,
    triggerManualLineLogin,
    closeLiffWindow,
    retryLiffExchange: () => exchangeLiffToken(tokensRef.current.idToken, tokensRef.current.accessToken),
  };
}
