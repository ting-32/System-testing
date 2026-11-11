import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  ShieldCheck, 
  Key, 
  Plus, 
  Save, 
  RotateCcw, 
  Trash2, 
  Lock, 
  Unlock, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  ChevronRight, 
  Search,
  UserCheck,
  UserX,
  ShieldAlert,
  Loader2,
  Sliders
} from 'lucide-react';
import { useAuth, UserRole } from '../context/AuthContext';
import { usePermission, ActionType, ROLE_PERMISSIONS as DEFAULT_ROLE_PERMISSIONS } from '../hooks/usePermission';

// 權限動作的中英文對照與詳細說明
export const PERMISSION_CONFIG: Record<ActionType, { label: string; description: string; risk: 'low' | 'medium' | 'high' }> = {
  view_all_orders: {
    label: '檢視全部訂單',
    description: '可瀏覽全廠所有客戶之訂單，關閉則僅能看到指派給自己的單據',
    risk: 'medium'
  },
  assign_order: {
    label: '訂單派工指派',
    description: '可指派訂單責任人並轉發工作給產線同仁',
    risk: 'medium'
  },
  update_any_status: {
    label: '變更任意訂單狀態',
    description: '可隨意修改任何訂單的進度（待製作、製作中、出貨等）',
    risk: 'medium'
  },
  update_own_status: {
    label: '變更個人訂單狀態',
    description: '作業同仁回報自身負責單據之進度',
    risk: 'low'
  },
  delete_order: {
    label: '刪除訂單',
    description: '永久移除訂單記錄，極高危險性，強烈建議僅限管理員',
    risk: 'high'
  },
  edit_order: {
    label: '編輯訂單品項與內容',
    description: '修改訂單之客戶名稱、送達時間、數量與備註',
    risk: 'medium'
  }
};

export interface ManagedUser {
  userId: string;
  username: string;
  name: string;
  role: UserRole;
  status: 'ACTIVE' | 'DISABLED';
  lastActive?: string;
}

interface PermissionSettingsModalProps {
  onClose: () => void;
  addToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const PermissionSettingsModal: React.FC<PermissionSettingsModalProps> = ({ onClose, addToast }) => {
  const { apiFetch, user: currentUser } = useAuth();
  const { role: currentRole, isAdmin } = usePermission();

  const [activeTab, setActiveTab] = useState<'users' | 'matrix'>('users');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 1. 人員列表狀態
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');

  // 2. 權限矩陣狀態 (支援自訂與本地快取)
  const [matrix, setMatrix] = useState<Record<UserRole, ActionType[]>>(() => {
    try {
      const saved = localStorage.getItem('APP_ROLE_PERMISSIONS');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse cached permissions matrix', e);
    }
    return {
      admin: [...DEFAULT_ROLE_PERMISSIONS.admin],
      manager: [...DEFAULT_ROLE_PERMISSIONS.manager],
      staff: [...DEFAULT_ROLE_PERMISSIONS.staff]
    };
  });

  // 新增人員 Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUserData, setNewUserData] = useState<{
    userId: string;
    username: string;
    name: string;
    role: UserRole;
    password: string;
  }>({
    userId: '',
    username: '',
    name: '',
    role: 'staff',
    password: ''
  });

  // 重設密碼 Modal
  const [resetPwdUser, setResetPwdUser] = useState<ManagedUser | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');

  // 載入使用者名單
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('getAllUsers');
      const userList: ManagedUser[] | null = 
        res.users || 
        res.data?.users || 
        (Array.isArray(res.data) ? res.data : null);

      if (res.success && userList && userList.length > 0) {
        setUsers(userList);
      } else {
        // Fallback: 如果後端尚未有 getAllUsers 或回傳空，從 getStaffList 或相容資料補齊
        const staffRes = await apiFetch('getStaffList');
        const staffList: any[] | null = 
          staffRes.staff || 
          staffRes.data?.staff || 
          (Array.isArray(staffRes.data) ? staffRes.data : null);

        if (staffRes.success && staffList && staffList.length > 0) {
          const mapped: ManagedUser[] = staffList.map((s: any) => ({
            userId: s.userId || s.id,
            username: s.username || s.name,
            name: s.name,
            role: (s.role as UserRole) || 'staff',
            status: s.status || 'ACTIVE'
          }));
          setUsers(mapped);
        } else if (userList) {
          setUsers(userList);
        }
      }
    } catch (e) {
      console.warn('Fetch users failed', e);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // 切換某角色的特定權限勾選
  const handleTogglePermission = (targetRole: UserRole, action: ActionType) => {
    // 防止取消管理員的基本維護權
    if (targetRole === 'admin' && (action === 'view_all_orders' || action === 'assign_order')) {
      if (addToast) addToast('系統核心權限不可取消管理員之配置', 'info');
      return;
    }

    setMatrix(prev => {
      const currentList = prev[targetRole] || [];
      const hasAction = currentList.includes(action);
      const updatedList = hasAction
        ? currentList.filter(a => a !== action)
        : [...currentList, action];

      return {
        ...prev,
        [targetRole]: updatedList
      };
    });
  };

  // 儲存權限矩陣
  const handleSaveMatrix = async () => {
    setSaving(true);
    try {
      // 1. 本地立即生效
      localStorage.setItem('APP_ROLE_PERMISSIONS', JSON.stringify(matrix));
      
      // 2. 廣播事件讓使用 usePermission 的組件立即感測
      window.dispatchEvent(new Event('app-permissions-updated'));

      // 3. 同步至後端保存
      const res = await apiFetch('savePermissionMatrix', { matrix });
      if (res.success) {
        if (addToast) addToast('權限配置矩陣已成功同步至伺服器', 'success');
      } else {
        if (addToast) addToast('本地已套用新設定（伺服器儲存提醒：' + (res.error || '將於下次連線時同步') + '）', 'info');
      }
    } catch (err: any) {
      if (addToast) addToast('已儲存至本機，網路通訊逾時', 'info');
    } finally {
      setSaving(false);
    }
  };

  // 還原預設權限
  const handleResetMatrix = () => {
    if (window.confirm('確定要將所有角色的權限還原為系統初始預設值嗎？')) {
      const defaultState = {
        admin: [...DEFAULT_ROLE_PERMISSIONS.admin],
        manager: [...DEFAULT_ROLE_PERMISSIONS.manager],
        staff: [...DEFAULT_ROLE_PERMISSIONS.staff]
      };
      setMatrix(defaultState);
      localStorage.removeItem('APP_ROLE_PERMISSIONS');
      window.dispatchEvent(new Event('app-permissions-updated'));
      if (addToast) addToast('已還原為系統初始權限矩陣', 'info');
    }
  };

  // 修改特定使用者的職位
  const handleRoleChange = async (targetUser: ManagedUser, newRole: UserRole) => {
    // 防止管理員把自己降級為 staff
    if (targetUser.userId === currentUser?.userId && newRole !== 'admin') {
      if (addToast) addToast('無法將自己目前登入之帳號降級，以免失去管理權限！', 'error');
      return;
    }

    const previousUsers = [...users];
    setUsers(prev => prev.map(u => u.userId === targetUser.userId ? { ...u, role: newRole } : u));

    try {
      const res = await apiFetch('saveUser', {
        userId: targetUser.userId,
        role: newRole,
        actionType: 'UPDATE_ROLE'
      });

      if (res.success) {
        if (addToast) addToast(`已將 ${targetUser.name} 職位更新為 ${newRole.toUpperCase()}`, 'success');
      } else {
        setUsers(previousUsers);
        if (addToast) addToast(res.error || '職位更新失敗', 'error');
      }
    } catch (e) {
      setUsers(previousUsers);
      if (addToast) addToast('網路異常，未能更新', 'error');
    }
  };

  // 切換帳號啟用 / 停用狀態
  const handleToggleStatus = async (targetUser: ManagedUser) => {
    if (targetUser.userId === currentUser?.userId) {
      if (addToast) addToast('無法停用自己目前登入的帳號！', 'error');
      return;
    }

    const newStatus = targetUser.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    const previousUsers = [...users];
    setUsers(prev => prev.map(u => u.userId === targetUser.userId ? { ...u, status: newStatus } : u));

    try {
      const res = await apiFetch('saveUser', {
        userId: targetUser.userId,
        status: newStatus,
        actionType: 'TOGGLE_STATUS'
      });

      if (res.success) {
        if (addToast) addToast(`帳號 ${targetUser.name} 已切換為 ${newStatus === 'ACTIVE' ? '啟用' : '停用'}`, 'success');
      } else {
        setUsers(previousUsers);
        if (addToast) addToast(res.error || '狀態更新失敗', 'error');
      }
    } catch (e) {
      setUsers(previousUsers);
      if (addToast) addToast('通訊逾時，未能更新狀態', 'error');
    }
  };

  // 提交新增人員
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserData.username || !newUserData.name || !newUserData.password) {
      if (addToast) addToast('請完整填寫帳號、姓名與初始密碼', 'error');
      return;
    }

    const userId = newUserData.userId.trim() || newUserData.username.trim();

    try {
      const res = await apiFetch('saveUser', {
        userId,
        username: newUserData.username.trim(),
        name: newUserData.name.trim(),
        role: newUserData.role,
        password: newUserData.password,
        status: 'ACTIVE',
        actionType: 'CREATE'
      });

      if (res.success) {
        if (addToast) addToast(`人員「${newUserData.name}」已成功新增！`, 'success');
        setShowAddModal(false);
        const createdUser: ManagedUser = {
          userId,
          username: newUserData.username.trim(),
          name: newUserData.name.trim(),
          role: newUserData.role,
          status: 'ACTIVE'
        };
        // 樂觀更新確保畫面即時呈現
        setUsers(prev => {
          const exists = prev.some(u => u.userId === userId || u.username === createdUser.username);
          return exists ? prev : [...prev, createdUser];
        });
        setNewUserData({ userId: '', username: '', name: '', role: 'staff', password: '' });
        fetchUsers();
      } else {
        if (addToast) addToast(res.error || '新增人員失敗', 'error');
      }
    } catch (e: any) {
      if (addToast) addToast('通訊失敗，無法新增人員', 'error');
    }
  };

  // 提交重設密碼
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPwdUser || !newPasswordInput || newPasswordInput.length < 4) {
      if (addToast) addToast('新密碼長度請至少輸入 4 碼', 'error');
      return;
    }

    try {
      const res = await apiFetch('saveUser', {
        userId: resetPwdUser.userId,
        newPassword: newPasswordInput,
        actionType: 'RESET_PASSWORD'
      });

      if (res.success) {
        if (addToast) addToast(`已重設 ${resetPwdUser.name} 之密碼！`, 'success');
        setResetPwdUser(null);
        setNewPasswordInput('');
      } else {
        if (addToast) addToast(res.error || '重設失敗', 'error');
      }
    } catch (e) {
      if (addToast) addToast('通訊異常', 'error');
    }
  };

  // 搜尋過濾人員
  const filteredUsers = useMemo(() => {
    return users.filter(u => 
      u.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      u.username.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      u.userId.toLowerCase().includes(searchKeyword.toLowerCase())
    );
  }, [users, searchKeyword]);

  // 安全防護：非管理員直接阻擋
  if (!isAdmin) {
    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
        <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white rounded-2xl max-w-sm w-full p-6 text-center space-y-4 shadow-xl">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-800 text-lg">無存取權限</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            職位與權限設定面板僅限 <strong className="text-slate-800">最高管理員 (admin)</strong> 身分開啟。您目前的角色為：<span className="font-bold uppercase text-indigo-600">{currentRole}</span>。
          </p>
          <button onClick={onClose} className="w-full py-2.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all cursor-pointer">
            返回
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.96, y: 15 }} 
        animate={{ opacity: 1, scale: 1, y: 0 }} 
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <span>RBAC 職位權限與使用者管理</span>
                <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">管理員專用</span>
              </h2>
              <p className="text-xs text-slate-500">配置各職務之存取授權與產線同仁帳號維護</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab 選單 */}
        <div className="px-6 border-b border-slate-200 bg-white flex items-center gap-4 shrink-0">
          <button
            onClick={() => setActiveTab('users')}
            className={`py-3.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'users'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>人員帳號與角色分配 ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('matrix')}
            className={`py-3.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'matrix'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>角色權限矩陣設定 (Matrix Editor)</span>
          </button>
        </div>

        {/* 內容區塊 */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {activeTab === 'users' ? (
            /* TAB 1: 人員帳號管理 */
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="搜尋同仁姓名、帳號或工號..."
                    className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchUsers}
                    disabled={loading}
                    className="px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>整理</span>
                  </button>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="px-3.5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>新增人員帳號</span>
                  </button>
                </div>
              </div>

              {/* 使用者列表表格 */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 font-bold text-slate-500">
                      <th className="p-3.5">姓名 / 帳號</th>
                      <th className="p-3.5">工號 (ID)</th>
                      <th className="p-3.5">指派角色 (Role)</th>
                      <th className="p-3.5">狀態</th>
                      <th className="p-3.5 text-right">安全操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="text-center p-8 text-slate-400">
                          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
                          載入人員清單中...
                        </td>
                      </tr>
                    ) : filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center p-8 text-slate-400">
                          查無符合條件的人員記錄
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map(u => (
                        <tr key={u.userId} className="hover:bg-slate-50/60 transition-colors">
                          <td className="p-3.5 font-bold text-slate-800">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs uppercase">
                                {u.name.substring(0, 1)}
                              </div>
                              <div>
                                <span>{u.name}</span>
                                <div className="text-[10px] text-slate-400 font-normal">@{u.username}</div>
                              </div>
                            </div>
                          </td>

                          <td className="p-3.5 font-mono text-slate-600">{u.userId}</td>

                          <td className="p-3.5">
                            {/* 職位選單 */}
                            <select
                              value={u.role}
                              onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                              className={`font-bold text-[11px] px-2 py-1 rounded-lg border outline-none cursor-pointer ${
                                u.role === 'admin'
                                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                                  : u.role === 'manager'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}
                            >
                              <option value="admin">最高管理員 (admin)</option>
                              <option value="manager">工廠主管 (manager)</option>
                              <option value="staff">作業員工 (staff)</option>
                            </select>
                          </td>

                          <td className="p-3.5">
                            <button
                              onClick={() => handleToggleStatus(u)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                                u.status === 'ACTIVE'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100'
                              }`}
                              title="點擊切換帳號啟用/停用"
                            >
                              {u.status === 'ACTIVE' ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                              <span>{u.status === 'ACTIVE' ? '正常啟用' : '已停用'}</span>
                            </button>
                          </td>

                          <td className="p-3.5 text-right space-x-2">
                            <button
                              onClick={() => setResetPwdUser(u)}
                              className="px-2.5 py-1 text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                              title="重設密碼"
                            >
                              改密碼
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* TAB 2: 角色權限矩陣編輯器 */
            <div className="space-y-5">
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">細粒度權限動態矩陣 (RBAC Matrix)</p>
                  <p className="text-amber-800 leading-relaxed">
                    您可以在此勾選或撤銷各職務所具備之權限。儲存後會立即在全系統前端介面生效，並同步至雲端後端防護檢查。
                  </p>
                </div>
              </div>

              {/* 矩陣表格 */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/90 border-b border-slate-200">
                      <th className="p-4 w-1/3 font-bold text-slate-700">操作權限名稱與說明</th>
                      <th className="p-4 text-center font-bold text-purple-700 bg-purple-50/40 border-l border-slate-200">
                        最高管理員 (admin)
                      </th>
                      <th className="p-4 text-center font-bold text-blue-700 bg-blue-50/40 border-l border-slate-200">
                        工廠主管 (manager)
                      </th>
                      <th className="p-4 text-center font-bold text-emerald-700 bg-emerald-50/40 border-l border-slate-200">
                        作業員工 (staff)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(Object.keys(PERMISSION_CONFIG) as ActionType[]).map(actionKey => {
                      const cfg = PERMISSION_CONFIG[actionKey];
                      return (
                        <tr key={actionKey} className="hover:bg-slate-50/60 transition-colors">
                          <td className="p-4">
                            <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                              <span>{cfg.label}</span>
                              <span className="font-mono text-[10px] text-slate-400 font-normal">({actionKey})</span>
                              {cfg.risk === 'high' && (
                                <span className="text-[10px] bg-rose-100 text-rose-700 font-bold px-1.5 py-0.5 rounded">
                                  高危險
                                </span>
                              )}
                            </div>
                            <p className="text-slate-500 text-[11px] mt-0.5 leading-relaxed">{cfg.description}</p>
                          </td>

                          {/* Admin 列 */}
                          <td className="p-4 text-center border-l border-slate-100 bg-purple-50/10">
                            <input
                              type="checkbox"
                              checked={matrix.admin.includes(actionKey)}
                              onChange={() => handleTogglePermission('admin', actionKey)}
                              className="w-4 h-4 text-purple-600 rounded cursor-pointer accent-purple-600"
                            />
                          </td>

                          {/* Manager 列 */}
                          <td className="p-4 text-center border-l border-slate-100 bg-blue-50/10">
                            <input
                              type="checkbox"
                              checked={matrix.manager.includes(actionKey)}
                              onChange={() => handleTogglePermission('manager', actionKey)}
                              className="w-4 h-4 text-blue-600 rounded cursor-pointer accent-blue-600"
                            />
                          </td>

                          {/* Staff 列 */}
                          <td className="p-4 text-center border-l border-slate-100 bg-emerald-50/10">
                            <input
                              type="checkbox"
                              checked={matrix.staff.includes(actionKey)}
                              onChange={() => handleTogglePermission('staff', actionKey)}
                              className="w-4 h-4 text-emerald-600 rounded cursor-pointer accent-emerald-600"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 底部操作按鈕 */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleResetMatrix}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>還原為初始預設值</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveMatrix}
                  disabled={saving}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>儲存權限設定變更</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 新增人員 Modal */}
        <AnimatePresence>
          {showAddModal && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-60 flex items-center justify-center p-4">
              <motion.div initial={{ scale: 0.95, y: 15 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 15 }} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <h3 className="font-bold text-slate-800 text-sm">新增同仁帳號與職位</h3>
                  <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                </div>

                <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">同仁姓名</label>
                    <input
                      type="text"
                      required
                      placeholder="例：張師傅"
                      value={newUserData.name}
                      onChange={(e) => setNewUserData({ ...newUserData, name: e.target.value })}
                      className="w-full p-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">登入帳號 (Username)</label>
                    <input
                      type="text"
                      required
                      placeholder="例：staff2"
                      value={newUserData.username}
                      onChange={(e) => setNewUserData({ ...newUserData, username: e.target.value })}
                      className="w-full p-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">工號或識別碼 (選填，預設同帳號)</label>
                    <input
                      type="text"
                      placeholder="例：EMP-003"
                      value={newUserData.userId}
                      onChange={(e) => setNewUserData({ ...newUserData, userId: e.target.value })}
                      className="w-full p-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">初始登入密碼</label>
                    <input
                      type="password"
                      required
                      placeholder="至少 4 碼"
                      value={newUserData.password}
                      onChange={(e) => setNewUserData({ ...newUserData, password: e.target.value })}
                      className="w-full p-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">預設職位角色</label>
                    <select
                      value={newUserData.role}
                      onChange={(e) => setNewUserData({ ...newUserData, role: e.target.value as UserRole })}
                      className="w-full p-2.5 border border-slate-200 rounded-xl outline-none font-bold"
                    >
                      <option value="staff">作業員工 (staff) - 僅能看/改自己被指派的單</option>
                      <option value="manager">工廠主管 (manager) - 可看全單與派工，不可刪單</option>
                      <option value="admin">最高管理員 (admin) - 擁有全部功能</option>
                    </select>
                  </div>

                  <div className="pt-3 flex gap-2">
                    <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-2 font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl">
                      取消
                    </button>
                    <button type="submit" className="flex-1 py-2 font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs">
                      確認新增
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 重設密碼 Modal */}
        <AnimatePresence>
          {resetPwdUser && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-60 flex items-center justify-center p-4">
              <motion.div initial={{ scale: 0.95, y: 15 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 15 }} className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <h3 className="font-bold text-slate-800 text-sm">重設「{resetPwdUser.name}」的密碼</h3>
                  <button onClick={() => setResetPwdUser(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                </div>

                <form onSubmit={handleResetPassword} className="space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">新密碼</label>
                    <input
                      type="password"
                      required
                      placeholder="請輸入至少 4 碼新密碼"
                      value={newPasswordInput}
                      onChange={(e) => setNewPasswordInput(e.target.value)}
                      className="w-full p-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div className="pt-2 flex gap-2">
                    <button type="button" onClick={() => setResetPwdUser(null)} className="flex-1 py-2 font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl">
                      取消
                    </button>
                    <button type="submit" className="flex-1 py-2 font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs">
                      更新密碼
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
