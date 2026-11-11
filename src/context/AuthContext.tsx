import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserRole } from '../types';
import { GAS_URL } from '../constants';

export type { UserRole };

export interface User {
  userId: string;
  username: string;
  name: string;
  role: UserRole;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  role: UserRole;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string; user?: User; token?: string }>;
  logout: () => void;
  apiFetch: <T = any>(action: string, payload?: Record<string, any>) => Promise<{ success: boolean; data?: T; error?: string; [key: string]: any }>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 動態解析 GAS API 端點：支援 localStorage 覆蓋與環境變數，維持高度彈性與跨環境部署能力
export const getResolvedGasUrl = (): string => {
  const custom = (
    localStorage.getItem('nm_gas_url') ||
    localStorage.getItem('nm_gas_api_url') ||
    localStorage.getItem('APP_GAS_API_URL') ||
    (import.meta as any).env?.VITE_GAS_API_URL ||
    (import.meta as any).env?.VITE_API_URL ||
    ''
  ).trim();

  // 若未設定真實網址、或為 placeholder / 預設虛擬端點，自動回退至 GAS_URL（預設 'https://mock-api.local'）
  if (!custom || custom.includes('placeholder') || custom === 'undefined' || custom === 'null') {
    return GAS_URL || 'https://mock-api.local';
  }
  return custom;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. 初始化使用者與 Token 狀態（整合新舊 localStorage 鍵值）
  const [user, setUser] = useState<User | null>(() => {
    try {
      const savedUser = localStorage.getItem('APP_USER');
      if (savedUser) return JSON.parse(savedUser);
      
      // 相容舊版個別 key
      const legacyRole = (localStorage.getItem('APP_USER_ROLE') || 'admin') as UserRole;
      const legacyId = localStorage.getItem('APP_USER_ID') || 'admin';
      const legacyName = localStorage.getItem('APP_USER_NAME') || '系統管理員';
      if (localStorage.getItem('APP_USER_ROLE') || localStorage.getItem('APP_SESSION_TOKEN') || localStorage.getItem('nm_auth_status')) {
        return {
          userId: legacyId,
          username: legacyId,
          name: legacyName,
          role: legacyRole
        };
      }
    } catch (e) {
      console.warn('Failed to parse user from localStorage', e);
    }
    return null;
  });

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('APP_TOKEN') || localStorage.getItem('APP_SESSION_TOKEN') || null;
  });

  // 2. 登出清理作業（徹底清除新舊相容 key 並廣播事件）
  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    
    // 清理新版 keys
    localStorage.removeItem('APP_USER');
    localStorage.removeItem('APP_TOKEN');
    
    // 清理舊版相容 keys
    localStorage.removeItem('APP_USER_ROLE');
    localStorage.removeItem('APP_USER_ID');
    localStorage.removeItem('APP_USER_NAME');
    localStorage.removeItem('APP_SESSION_TOKEN');
    sessionStorage.removeItem('temp_unlock_key');
    localStorage.removeItem('nm_auth_status');
    
    // 派發全域登出事件，通知各模組清理暫存或跳轉
    window.dispatchEvent(new Event('app-unauthorized'));
  }, []);

  // 3. 監聽全域 Token 失效事件
  useEffect(() => {
    const handleUnauthorized = () => {
      logout();
    };
    window.addEventListener('app-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('app-unauthorized', handleUnauthorized);
  }, [logout]);

  // 4. 統一 API 呼叫器：以 POST + text/plain 避免 CORS Preflight (OPTIONS) 阻斷，並自動注入 Token
  const apiFetch = useCallback(
    async <T = any>(action: string, payload: Record<string, any> = {}): Promise<{ success: boolean; data?: T; error?: string; [key: string]: any }> => {
      const apiUrl = getResolvedGasUrl();
      const currentToken = token || localStorage.getItem('APP_TOKEN') || localStorage.getItem('APP_SESSION_TOKEN');

      const bodyData = {
        action,
        token: currentToken,
        ...payload
      };

      try {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify(bodyData)
        });

        if (!res.ok) {
          throw new Error(`HTTP Error ${res.status}`);
        }

        const json = await res.json();

        // 偵測 Token 是否過期或未授權，自動觸發登出
        const errorMsg = json?.error || (json?.data && json.data.error) || '';
        const isAuthError = 
          (json?.success === false || (json?.data && json.data.success === false)) &&
          (errorMsg.includes('未授權') ||
           errorMsg.includes('憑證已過期') ||
           errorMsg.includes('TOKEN_EXPIRED') ||
           errorMsg.includes('UNAUTHORIZED_OR_EXPIRED') ||
           errorMsg.includes('帳號已被停用'));

        if (isAuthError) {
          logout();
        }

        // 核心解構：平滑相容 GAS 的 { success: true, data: { success: true, users: [...] } } 與直接回傳
        let normalized: any = { ...json };
        if (json.data && typeof json.data === 'object' && !Array.isArray(json.data)) {
          normalized = {
            ...json.data,
            ...json,
            success: json.data.success !== undefined ? json.data.success : json.success,
            data: json.data
          };
        }

        return normalized;
      } catch (err: any) {
        console.warn(`[AuthContext] apiFetch failed for action "${action}":`, err?.message || err);

        // 容錯降級機制：當遠端 GAS 無法連線（如離線、CORS 或伺服器啟動中），自動嘗試本地 mock 服務獲取資料
        if (apiUrl !== 'https://mock-api.local') {
          try {
            const fallbackRes = await fetch('https://mock-api.local', {
              method: 'POST',
              headers: {
                'Content-Type': 'text/plain;charset=utf-8'
              },
              body: JSON.stringify(bodyData)
            });
            if (fallbackRes.ok) {
              const fallbackJson = await fallbackRes.json();
              let normalized: any = { ...fallbackJson };
              if (fallbackJson.data && typeof fallbackJson.data === 'object' && !Array.isArray(fallbackJson.data)) {
                normalized = {
                  ...fallbackJson.data,
                  ...fallbackJson,
                  success: fallbackJson.data.success !== undefined ? fallbackJson.data.success : fallbackJson.success,
                  data: fallbackJson.data
                };
              }
              return {
                ...normalized,
                _isOfflineFallback: true
              };
            }
          } catch {
            // 忽略 mock 降級錯誤，回傳原始失敗
          }
        }

        return {
          success: false,
          error: err?.message || '網路通訊失敗，請檢查網路連線'
        };
      }
    },
    [token, logout]
  );

  // 5. 登入函式（支援標準 RBAC 帳密驗證，同時寫入雙版本 LocalStorage）
  const login = useCallback(
    async (username: string, password: string): Promise<{ success: boolean; error?: string; user?: User; token?: string }> => {
      const res = await apiFetch('login', { username, password });
      
      if (res.success && res.token && res.user) {
        const loggedUser: User = {
          userId: String(res.user.userId || res.user.id || username),
          username: String(res.user.username || username),
          name: String(res.user.name || res.user.username || username),
          role: (res.user.role as UserRole) || 'staff'
        };

        setUser(loggedUser);
        setToken(res.token);

        // 寫入新規格
        localStorage.setItem('APP_USER', JSON.stringify(loggedUser));
        localStorage.setItem('APP_TOKEN', res.token);

        // 雙向相容舊規格
        localStorage.setItem('APP_USER_ROLE', loggedUser.role);
        localStorage.setItem('APP_USER_ID', loggedUser.userId);
        localStorage.setItem('APP_USER_NAME', loggedUser.name);
        localStorage.setItem('APP_SESSION_TOKEN', res.token);
        localStorage.setItem('nm_auth_status', 'unlocked');

        // 廣播登入變更事件
        window.dispatchEvent(new Event('app-auth-changed'));

        return { success: true, user: loggedUser, token: res.token };
      }

      return {
        success: false,
        error: res.error || '登入失敗，請確認帳號密碼'
      };
    },
    [apiFetch]
  );

  const value: AuthContextType = {
    user,
    token,
    role: user?.role || 'staff',
    isAuthenticated: !!user && !!token,
    login,
    logout,
    apiFetch
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Custom Hook: 取得 Auth 狀態與 API 發送工具
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
