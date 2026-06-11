import React, { useState, useCallback, useEffect } from 'react';

interface UseAppAuthProps {
  handleLogin: (password: string) => Promise<boolean>;
  addToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export function useAppAuth({ handleLogin, addToast }: UseAppAuthProps) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [unlockTimeout, setUnlockTimeout] = useState<number | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState(false);
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
    }
  }, [isUnlocked]);

  // 處理實際輸入密碼的事件
  const handleAppUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockPassword || isUnlocking) return;
    
    setIsUnlocking(true);
    try {
      const success = await handleLogin(unlockPassword);
      
      if (success) {
        setIsUnlocked(true);
        setUnlockTimeout(Date.now() + 30 * 60 * 1000);
        setShowUnlockModal(false);
        if (pendingAction) {
          pendingAction();
          setPendingAction(null);
        }
      } else {
        setUnlockError(true);
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
    isUnlocking,
    requireAuth,
    handleAppUnlock
  };
}
