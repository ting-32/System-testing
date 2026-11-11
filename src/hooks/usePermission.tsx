import React, { useContext } from 'react';
import { AuthContext, UserRole } from '../context/AuthContext';

export type ActionType = 
  | 'view_all_orders'
  | 'assign_order'
  | 'update_any_status'
  | 'update_own_status'
  | 'delete_order'
  | 'edit_order';

/**
 * 權限對照表 (Role-Based Permissions Matrix)
 * 集中定義各職務能執行的原子操作，日後擴充新動作只需在此陣列增減
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly ActionType[]> = {
  admin: [
    'view_all_orders',
    'assign_order',
    'update_any_status',
    'update_own_status',
    'delete_order',
    'edit_order'
  ],
  manager: [
    'view_all_orders',
    'assign_order',
    'update_any_status',
    'update_own_status',
    'edit_order'
  ],
  staff: [
    'update_own_status'
  ]
} as const;

export const getActivePermissions = (): Record<UserRole, readonly ActionType[]> => {
  try {
    const custom = localStorage.getItem('APP_ROLE_PERMISSIONS');
    if (custom) return JSON.parse(custom);
  } catch {}
  return ROLE_PERMISSIONS;
};

/**
 * usePermission Hook
 * 提供細粒度權限判定、階層判斷 (isAdmin/isManager/isStaff) 與身分資訊
 */
export function usePermission() {
  const authContext = useContext(AuthContext);
  const [, setTick] = React.useState(0);

  React.useEffect(() => {
    const handleUpdate = () => setTick(t => t + 1);
    window.addEventListener('app-permissions-updated', handleUpdate);
    return () => window.removeEventListener('app-permissions-updated', handleUpdate);
  }, []);

  // 取得使用者狀態，具備 context 與 localStorage 雙層防禦（避免在獨立測試或渲染邊界失效）
  const user = authContext?.user || (() => {
    try {
      const saved = localStorage.getItem('APP_USER');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  })();

  const role: UserRole = user?.role || (localStorage.getItem('APP_USER_ROLE') as UserRole) || 'staff';
  const userId: string = user?.userId || localStorage.getItem('APP_USER_ID') || '';
  const userName: string = user?.name || user?.username || localStorage.getItem('APP_USER_NAME') || '';

  const activePermissions = getActivePermissions();

  // 1. 單一權限檢查
  const can = (action: ActionType): boolean => {
    if (!role) return false;
    const permissions = activePermissions[role] || ROLE_PERMISSIONS[role] || [];
    return (permissions as readonly ActionType[]).includes(action);
  };

  // 2. 複合權限檢查 (任一符合)
  const canAny = (actions: ActionType[]): boolean => {
    return actions.some(action => can(action));
  };

  // 3. 複合權限檢查 (全部符合)
  const canAll = (actions: ActionType[]): boolean => {
    return actions.every(action => can(action));
  };

  return {
    can,
    canAny,
    canAll,
    role,
    userId,
    userName,
    user,
    // 便利的職位層級旗標，方便在 UI 快速做判斷
    isAdmin: role === 'admin',
    isManager: role === 'manager',
    isStaff: role === 'staff',
    isAtLeastManager: role === 'admin' || role === 'manager'
  };
}

export interface CanProps {
  do: ActionType | ActionType[];
  match?: 'all' | 'any';
  fallback?: React.ReactNode;
  children: React.ReactNode | ((authProps: { can: boolean; role: UserRole; userId: string }) => React.ReactNode);
}

/**
 * 宣告式權限守門組件 <Can />
 * 
 * 支援兩種使用情境：
 * 1. 條件隱藏/替換：未授權時隱藏或渲染 fallback
 *    <Can do="delete_order" fallback={<span>無權限</span>}>
 *      <DeleteButton />
 *    </Can>
 * 
 * 2. 視覺保留但停用 (UX 最佳實踐)：讓使用者了解有此功能但需對應權限
 *    <Can do="assign_order">
 *      {({ can }) => (
 *        <button disabled={!can} title={can ? '' : '需主管以上權限'}>
 *          指派訂單
 *        </button>
 *      )}
 *    </Can>
 */
export const Can: React.FC<CanProps> = ({
  do: actionProp,
  match = 'all',
  fallback = null,
  children
}) => {
  const { can, canAny, canAll, role, userId } = usePermission();

  const isAllowed = Array.isArray(actionProp)
    ? match === 'any'
      ? canAny(actionProp)
      : canAll(actionProp)
    : can(actionProp);

  // 支援 Render Props 模式，方便 UI 呈現「停用 (disabled)」或「警示 Tooltip」
  if (typeof children === 'function') {
    return <>{children({ can: isAllowed, role, userId })}</>;
  }

  return isAllowed ? <>{children}</> : <>{fallback}</>;
};
