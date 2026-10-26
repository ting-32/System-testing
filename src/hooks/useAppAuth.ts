import React, { useState, useCallback, useEffect } from 'react';

interface UseAppAuthProps {
  handleLogin: (password: string) => Promise<{ success: boolean; error?: string } | boolean>;
  addToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export function useAppAuth({ handleLogin, addToast }: UseAppAuthProps) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [unlockTimeout, setUnlockTimeout] = useState<number | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState(false);
  const [unlockErrorMessage, setUnlockErrorMessage] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  // 逾時自動上鎖檢查機制
  useEffect(() => {
    if (isUnlocked && unlockTimeout) {
      const interval = setInterval(() => {
        if (Date.now() > unlockTimeout) {
          setIsUnlocked(false);
          setUnlockTimeout(null);
          addToast('安全時效已過，系統已自動進入檢視模式', 'info');
        }
      }, 60000); // 每 1 分鐘檢查一次
      return () => clearInterval(interval);
    }
  }, [isUnlocked, unlockTimeout, addToast]);

  // 要求權限的高階函式（檢查是否要彈出密碼框，或直接執行動作）
  const requireAuth = useCallback((action: () => void) => {
    if (isUnlocked) {
      action();
      setUnlockTimeout(Date.now() + 30 * 60 * 1000); // 重設 30 分鐘
    } else {
      setPendingAction(() => action);
      setShowUnlockModal(true);
      setUnlockPassword('');
      setUnlockError(false);
      setUnlockErrorMessage(null);
    }
  }, [isUnlocked]);

  // 處理實際輸入密碼的事件
  const handleAppUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockPassword || isUnlocking) return;

    // 1. 檢查是否處於 15 分鐘鎖定狀態
    const lockFailKey = 'app_unlock_fail_count';
    const lockUntilKey = 'app_unlock_locked_until';
    const lockedUntil = Number(sessionStorage.getItem(lockUntilKey) || 0);

    if (lockedUntil && Date.now() < lockedUntil) {
      const remainingMinutes = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000));
      const msg = `密碼錯誤次數過多，該裝置已暫時鎖定（約剩餘 ${remainingMinutes} 分鐘）`;
      setUnlockErrorMessage(msg);
      setUnlockError(true);
      addToast(msg, 'error');
      return;
    }
    
    setIsUnlocking(true);
    setUnlockError(false);
    setUnlockErrorMessage(null);

    try {
      const cachedKey = sessionStorage.getItem('temp_unlock_key');
      let isSuccess = false;
      let failureError: string | null = null;
      
      if (cachedKey) {
        try {
          isSuccess = atob(cachedKey) === unlockPassword;
        } catch (e) {
          console.error("Failed to decode cached key", e);
        }
        await new Promise(resolve => setTimeout(resolve, 150)); 
      } else {
        const res = await handleLogin(unlockPassword);
        isSuccess = typeof res === 'boolean' ? res : (res && res.success);
        if (typeof res === 'object' && res?.error) {
          failureError = res.error;
        }
        if (isSuccess) {
          try {
            sessionStorage.setItem('temp_unlock_key', btoa(unlockPassword));
          } catch (e) {
            console.error(e);
          }
        }
      }
      
      if (isSuccess) {
        // 解鎖成功，清除失敗累計與鎖定時間
        sessionStorage.removeItem(lockFailKey);
        sessionStorage.removeItem(lockUntilKey);
        setIsUnlocked(true);
        setUnlockTimeout(Date.now() + 30 * 60 * 1000);
        setShowUnlockModal(false);
        setUnlockErrorMessage(null);
        if (pendingAction) {
          pendingAction();
          setPendingAction(null);
        }
      } else {
        // 解鎖失敗，累計失敗次數
        const currentFail = Number(sessionStorage.getItem(lockFailKey) || 0) + 1;
        sessionStorage.setItem(lockFailKey, String(currentFail));
        const remaining = Math.max(0, 5 - currentFail);

        let errorMsg = '';
        if (remaining <= 0) {
          sessionStorage.setItem(lockUntilKey, String(Date.now() + 15 * 60 * 1000));
          errorMsg = "密碼錯誤次數過多，該裝置已暫時鎖定 15 分鐘，請稍後再試。";
        } else {
          errorMsg = failureError || `密碼錯誤 (剩餘嘗試次數: ${remaining})`;
        }

        setUnlockErrorMessage(errorMsg);
        setUnlockError(true);
        addToast(errorMsg, 'error');
      }
    } finally {
      setIsUnlocking(false);
    }
  };

  return {
    isUnlocked,
    setIsUnlocked,
    showUnlockModal,
    setShowUnlockModal,
    unlockPassword,
    setUnlockPassword,
    unlockError,
    setUnlockError,
    unlockErrorMessage,
    setUnlockErrorMessage,
    isUnlocking,
    requireAuth,
    handleAppUnlock
  };
}
