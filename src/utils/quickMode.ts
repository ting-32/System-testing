export type QuickModeAction = 'status' | 'edit' | 'holiday' | 'delete';
export type QuickModeScope = 'orders' | 'holiday' | null;

export interface QuickModeConfig {
  isQuickMode: boolean;
  quick: QuickModeScope;
  action: QuickModeAction;
  liffId: string;
  gasUrlOverride: string;
}

/**
 * 解析網址與 LINE LIFF 的 `liff.state` 重導向參數，取得快速操作頁模式與動作。
 */
export function parseQuickModeConfig(): QuickModeConfig {
  if (typeof window === 'undefined') {
    return {
      isQuickMode: false,
      quick: null,
      action: 'status',
      liffId: '',
      gasUrlOverride: '',
    };
  }

  const rawSearch = window.location.search || '';
  const searchParams = new URLSearchParams(rawSearch);

  // LINE LIFF 首次開啟會將原始 query 編碼進 liff.state，例如 ?liff.state=%3Fquick%3Dorders%26action%3Dstatus
  const liffStateRaw = searchParams.get('liff.state') || '';
  let stateParams = new URLSearchParams();
  if (liffStateRaw) {
    const cleanedState = liffStateRaw.startsWith('?') ? liffStateRaw.slice(1) : liffStateRaw;
    const qIdx = cleanedState.indexOf('?');
    stateParams = new URLSearchParams(qIdx !== -1 ? cleanedState.slice(qIdx + 1) : cleanedState);
  }

  const pickParam = (key: string): string => {
    return (searchParams.get(key) || stateParams.get(key) || '').trim();
  };

  const quickRaw = pickParam('quick').toLowerCase();
  const actionRaw = pickParam('action').toLowerCase();
  const liffIdParam = pickParam('liffId') || pickParam('liff_id');
  const gasOverride = pickParam('gas') || pickParam('gasUrl');

  const envLiffId = String((import.meta as any).env?.VITE_LIFF_ID || '').trim();
  const storedLiffId = (localStorage.getItem('nm_liff_id') || '').trim();
  const resolvedLiffId = liffIdParam || envLiffId || storedLiffId;

  if (liffIdParam) {
    try {
      localStorage.setItem('nm_liff_id', liffIdParam);
    } catch {}
  }

  if (gasOverride && gasOverride.startsWith('https://')) {
    try {
      localStorage.setItem('nm_gas_url', gasOverride);
    } catch {}
  }

  const validQuick: QuickModeScope =
    quickRaw === 'holiday' ? 'holiday' : quickRaw === 'orders' || quickRaw === 'dispatch' ? 'orders' : null;

  const isQuickMode = Boolean(validQuick || actionRaw);

  let action: QuickModeAction = 'status';
  if (actionRaw === 'edit' || actionRaw === 'update') action = 'edit';
  else if (actionRaw === 'holiday' || validQuick === 'holiday') action = 'holiday';
  else if (actionRaw === 'delete') action = 'delete';
  else if (actionRaw === 'status') action = 'status';

  return {
    isQuickMode,
    quick: validQuick || (isQuickMode ? 'orders' : null),
    action,
    liffId: resolvedLiffId,
    gasUrlOverride: gasOverride,
  };
}

export function clearQuickModeFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('quick');
  url.searchParams.delete('action');
  url.searchParams.delete('liff.state');
  window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash);
}
