import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth, UserRole } from '../context/AuthContext';
import { usePermission, Can } from '../hooks/usePermission';
import { 
  ClipboardList, 
  RefreshCw, 
  Search, 
  Filter, 
  Trash2, 
  UserCheck, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Loader2, 
  LogOut, 
  ShieldAlert,
  ArrowUpDown,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BatchCleanOrdersModal } from '../components/BatchCleanOrdersModal';

// 相容不同資料來源（純文字欄位或結構化子品項陣列）
export interface OrderDispatchItem {
  id?: string;
  order_id: string;
  customerName: string;
  productName?: string;
  quantity?: number;
  items?: Array<{ productName?: string; name?: string; quantity: number; unit?: string }>;
  assigned_to?: string;
  assigned_name?: string;
  status: string;
  deliveryDate?: string;
  deliveryTime?: string;
}

export interface StaffMember {
  userId: string;
  name: string;
  role: UserRole | string;
}

// 狀態設定與樣式定義（便於集中維護與色彩語意化）
const STATUS_OPTIONS = [
  { value: 'PENDING', label: '待製作 / 待出貨', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'IN_PRODUCTION', label: '製作中', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  { value: 'SHIPPED', label: '已出貨', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { value: 'PAID', label: '已收款 / 已出貨', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'COMPLETED', label: '已結單', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'CANCELLED', label: '已取消', color: 'bg-slate-100 text-slate-500 border-slate-200' }
];

export const OrderDispatchPage: React.FC = () => {
  const { apiFetch, user, logout } = useAuth();
  const { can, role, userId } = usePermission();

  const [orders, setOrders] = useState<OrderDispatchItem[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'UNASSIGNED' | 'MY_ORDERS' | 'PENDING' | 'DONE'>('ALL');
  
  // 操作狀態反饋 (Toast 通知)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // 刪除二次確認對話框狀態
  const [deletingOrder, setDeletingOrder] = useState<OrderDispatchItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 條件式批次清理彈窗狀態 (限定 admin / manager)
  const [showBatchCleanModal, setShowBatchCleanModal] = useState(false);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, []);

  // 1. 取得訂單（後端已依身分進行資料遮蔽與安全過濾）
  const loadOrders = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setRefreshing(true);
    try {
      const res = await apiFetch('getOrders');
      if (res.success) {
        // 標準化欄位：相容 order_id 與 id、assigned_to 與 assignedTo
        const rawOrders: any[] = res.orders || res.data || [];
        const normalized: OrderDispatchItem[] = rawOrders.map(o => ({
          ...o,
          order_id: String(o.order_id || o.id || ''),
          customerName: String(o.customerName || '未註記客戶'),
          assigned_to: o.assigned_to || o.assignedTo || '',
          assigned_name: o.assigned_name || o.assignedName || '',
          status: o.status || 'PENDING',
          items: o.items || []
        }));
        setOrders(normalized);
      } else {
        showToast(res.error || '無法載入訂單列表', 'error');
      }
    } catch (e: any) {
      showToast(e.message || '連線異常，請稍後再試', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiFetch, showToast]);

  // 2. 主管/管理員載入員工名單
  const loadStaff = useCallback(async () => {
    if (can('assign_order')) {
      try {
        const res = await apiFetch('getStaffList');
        const list = res.staff || res.data?.staff || (Array.isArray(res.data) ? res.data : []);
        if (res.success && list && list.length > 0) {
          setStaffList(list);
        }
      } catch (e) {
        console.warn('載入員工名單失敗', e);
      }
    }
  }, [apiFetch, can]);

  useEffect(() => {
    loadOrders();
    loadStaff();
  }, [loadOrders, loadStaff]);

  // 3. 指派訂單（樂觀更新 Optimistic Update 提升介面即時流暢感）
  const handleAssign = async (orderId: string, targetUserId: string) => {
    const target = staffList.find(s => s.userId === targetUserId);
    const targetUserName = target?.name || (targetUserId ? targetUserId : '');

    // 樂觀更新
    const previousOrders = [...orders];
    setOrders(prev => prev.map(o => o.order_id === orderId ? { ...o, assigned_to: targetUserId, assigned_name: targetUserName } : o));

    try {
      const res = await apiFetch('assignOrder', {
        orderId,
        targetUserId,
        targetUserName
      });

      if (res.success) {
        showToast(`訂單 ${orderId} 已指派給 ${targetUserName || '未指派'}`, 'success');
        loadOrders(true); // 背景靜默重整確認
      } else {
        // 失敗復原
        setOrders(previousOrders);
        showToast(res.error || '指派失敗，請檢查權限', 'error');
      }
    } catch (err: any) {
      setOrders(previousOrders);
      showToast('網路逾時，指派未成功', 'error');
    }
  };

  // 4. 更新狀態（staff 只能更動屬於自己的訂單，後端具安全校驗）
  const handleStatusChange = async (orderId: string, newStatus: string) => {
    const previousOrders = [...orders];
    setOrders(prev => prev.map(o => o.order_id === orderId ? { ...o, status: newStatus } : o));

    try {
      const res = await apiFetch('updateOrderStatus', {
        orderId,
        status: newStatus
      });

      if (res.success) {
        showToast(`訂單 ${orderId} 狀態已更新`, 'success');
        loadOrders(true);
      } else {
        setOrders(previousOrders);
        showToast(res.error || '狀態更新失敗，您可能無權變更此訂單', 'error');
      }
    } catch (err: any) {
      setOrders(previousOrders);
      showToast('更新失敗，請檢查連線', 'error');
    }
  };

  // 5. 刪除訂單（二次確認 Modal 執行）
  const handleConfirmDelete = async () => {
    if (!deletingOrder) return;
    setIsDeleting(true);
    const targetId = deletingOrder.order_id;

    try {
      const res = await apiFetch('deleteOrder', { orderId: targetId });
      if (res.success) {
        setOrders(prev => prev.filter(o => o.order_id !== targetId));
        showToast(`訂單 ${targetId} 已成功刪除`, 'success');
      } else {
        showToast(res.error || '刪除失敗，無此權限', 'error');
      }
    } catch (err: any) {
      showToast('通訊逾時，刪除未完成', 'error');
    } finally {
      setIsDeleting(false);
      setDeletingOrder(null);
    }
  };

  // 6. 前端過濾器與搜尋計算
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // 搜尋關鍵字
      const matchSearch = searchTerm.trim() === '' || 
        order.order_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.productName && order.productName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (order.assigned_name && order.assigned_name.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchSearch) return false;

      // 分頁條件
      if (filterType === 'UNASSIGNED') {
        return !order.assigned_to;
      }
      if (filterType === 'MY_ORDERS') {
        return order.assigned_to === userId || order.assigned_name === user?.name;
      }
      if (filterType === 'PENDING') {
        return order.status === 'PENDING' || order.status === 'IN_PRODUCTION';
      }
      if (filterType === 'DONE') {
        return order.status === 'SHIPPED' || order.status === 'COMPLETED' || order.status === 'PAID';
      }
      return true;
    });
  }, [orders, searchTerm, filterType, userId, user]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* 浮動式 Toast 反饋 (取代阻斷式 window.alert) */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg border flex items-center gap-2 text-sm font-medium ${
              toast.type === 'success' 
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                : toast.type === 'error'
                ? 'bg-rose-50 text-rose-800 border-rose-200'
                : 'bg-slate-800 text-white border-slate-700'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 頂部看板標頭與身分資訊 */}
      <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
            <ClipboardList className="w-6 h-6 stroke-[1.75]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-800">訂單派工與生產看板</h1>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                role === 'admin' 
                  ? 'bg-purple-50 text-purple-700 border-purple-200' 
                  : role === 'manager'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}>
                {role === 'admin' ? '最高管理員' : role === 'manager' ? '生產主管' : '作業同仁'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              登入人員：<strong className="text-slate-700">{user?.name || user?.username || '未登入'}</strong>（工號: {userId || '無'}）
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          {/* 管理員專用：條件式快速批次清理工具 (嚴格限 admin 與 manager，一般同仁完全不顯示) */}
          {(role === 'admin' || role === 'manager') && (
            <button
              onClick={() => setShowBatchCleanModal(true)}
              className="px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50/80 hover:bg-rose-100/90 border border-rose-200/80 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
              title="依日期與狀態條件快速清理訂單"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>批次清理工具</span>
            </button>
          )}

          <button
            onClick={() => loadOrders()}
            disabled={refreshing}
            className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5 text-xs font-semibold"
            title="重新整理看板資料"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>重新整理</span>
          </button>
          <button
            onClick={logout}
            className="px-3.5 py-2 text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>登出</span>
          </button>
        </div>
      </div>

      {/* 搜尋列與快速狀態篩選標籤 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* 搜尋框 */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜尋單號、客戶、品項或指派人員..."
            className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 transition-all"
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')} 
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 篩選標籤 */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none text-xs">
          {[
            { id: 'ALL', label: `全部 (${orders.length})` },
            { id: 'UNASSIGNED', label: `待派工 (${orders.filter(o => !o.assigned_to).length})` },
            { id: 'MY_ORDERS', label: `我的負責單 (${orders.filter(o => o.assigned_to === userId || o.assigned_name === user?.name).length})` },
            { id: 'PENDING', label: '製作中/待處理' },
            { id: 'DONE', label: '已出貨/結單' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all whitespace-nowrap cursor-pointer ${
                filterType === tab.id
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 訂單派工看板表格 */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4 w-28">單號</th>
                <th className="p-4">客戶名稱</th>
                <th className="p-4">品項 / 數量</th>
                <th className="p-4">派工責任人</th>
                <th className="p-4">生產與出貨狀態</th>
                <th className="p-4 text-right w-24">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center p-12 text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
                      <span>正在同步最新訂單與派工狀態...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center p-12 text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                        <ClipboardList className="w-6 h-6" />
                      </div>
                      <span className="font-semibold text-slate-600 text-sm">
                        {role === 'staff' ? '目前尚無指派給您的訂單' : '無符合篩選條件的訂單'}
                      </span>
                      <p className="text-[11px] text-slate-400">
                        {role === 'staff' ? '若有疑問可向當班領班或主管確認工作分派。' : '請切換篩選條件或重新整理以獲取最新單據。'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredOrders.map(order => {
                  // 判斷當前操作者是否能改該訂單狀態（主管可改全部，員工只能改指派給自己的單）
                  const isAssignedToCurrent = order.assigned_to === userId || order.assigned_name === user?.name;
                  const canChangeStatus = can('update_any_status') || (can('update_own_status') && isAssignedToCurrent);

                  return (
                    <tr key={order.order_id} className="hover:bg-slate-50/70 transition-colors">
                      {/* 單號 */}
                      <td className="p-4 font-mono font-bold text-slate-800">
                        {order.order_id}
                        {order.deliveryTime && (
                          <div className="text-[10px] text-slate-400 font-normal flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            {order.deliveryTime}
                          </div>
                        )}
                      </td>

                      {/* 客戶名稱 */}
                      <td className="p-4">
                        <span className="font-bold text-slate-800 text-sm">{order.customerName}</span>
                        {order.deliveryDate && (
                          <div className="text-[11px] text-slate-400 mt-0.5">{order.deliveryDate}</div>
                        )}
                      </td>

                      {/* 品項與數量 */}
                      <td className="p-4 text-slate-600">
                        {order.items && order.items.length > 0 ? (
                          <div className="space-y-0.5">
                            {order.items.map((it, idx) => (
                              <div key={idx} className="font-medium text-slate-700">
                                {it.productName || it.name} × <span className="font-bold">{it.quantity}</span> {it.unit || ''}
                              </div>
                            ))}
                          </div>
                        ) : order.productName ? (
                          <div className="font-medium text-slate-700">
                            {order.productName} × <span className="font-bold">{order.quantity || 1}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">無品項明細</span>
                        )}
                      </td>

                      {/* 派工責任人 */}
                      <td className="p-4">
                        <Can
                          do="assign_order"
                          fallback={
                            order.assigned_name ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                                <UserCheck className="w-3.5 h-3.5" />
                                {order.assigned_name}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
                                待主管指派
                              </span>
                            )
                          }
                        >
                          {/* 主管/管理員：互動式指派下拉選單 */}
                          <div className="relative inline-block w-44">
                            <select
                              value={order.assigned_to || ''}
                              onChange={(e) => handleAssign(order.order_id, e.target.value)}
                              className={`w-full text-xs font-semibold py-1.5 px-2.5 rounded-lg border outline-none transition-all cursor-pointer ${
                                order.assigned_to
                                  ? 'bg-slate-50 border-slate-300 text-slate-800 focus:ring-2 focus:ring-slate-800/10'
                                  : 'bg-amber-50/70 border-amber-300 text-amber-900 font-bold focus:ring-2 focus:ring-amber-500/20'
                              }`}
                            >
                              <option value="">⚠️ 未指派責任人</option>
                              {staffList.map(s => (
                                <option key={s.userId} value={s.userId}>
                                  {s.name} ({s.role})
                                </option>
                              ))}
                            </select>
                          </div>
                        </Can>
                      </td>

                      {/* 狀態變更選單 */}
                      <td className="p-4">
                        <select
                          value={order.status || 'PENDING'}
                          disabled={!canChangeStatus}
                          onChange={(e) => handleStatusChange(order.order_id, e.target.value)}
                          title={canChangeStatus ? '點擊變更狀態' : '僅指派責任人或主管可更動'}
                          className={`text-xs font-bold py-1.5 px-2.5 rounded-lg border outline-none transition-all ${
                            STATUS_OPTIONS.find(s => s.value === order.status)?.color || 'bg-slate-50 text-slate-700 border-slate-200'
                          } ${canChangeStatus ? 'cursor-pointer hover:opacity-90 focus:ring-2 focus:ring-slate-800/10' : 'cursor-not-allowed opacity-60'}`}
                        >
                          {STATUS_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* 刪除操作 (嚴格限 admin 權限) */}
                      <td className="p-4 text-right">
                        <Can do="delete_order">
                          <button
                            onClick={() => setDeletingOrder(order)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
                            title="刪除此筆訂單"
                          >
                            <Trash2 className="w-4 h-4 stroke-[1.75]" />
                          </button>
                        </Can>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 刪除確認 Modal 對話框 (消除 window.confirm 帶來的阻斷式劣質體驗) */}
      <AnimatePresence>
        {deletingOrder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-100 space-y-4"
            >
              <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="text-center">
                <h3 className="text-base font-bold text-slate-800">確定要刪除這筆訂單嗎？</h3>
                <p className="text-xs text-slate-500 mt-1">
                  單號：<span className="font-mono font-bold text-slate-700">{deletingOrder.order_id}</span>
                  <br />
                  客戶：<span className="font-bold text-slate-700">{deletingOrder.customerName}</span>
                </p>
                <p className="text-[11px] text-rose-500 mt-2 font-medium">此動作會從資料庫中永久移除，且無法復原。</p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingOrder(null)}
                  disabled={isDeleting}
                  className="flex-1 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="flex-1 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>確認刪除</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 條件式快速批次清理 Modal (管理員專用) */}
      <AnimatePresence>
        {showBatchCleanModal && (
          <BatchCleanOrdersModal
            isOpen={showBatchCleanModal}
            onClose={() => setShowBatchCleanModal(false)}
            orders={orders}
            onSuccess={() => {
              loadOrders(true);
            }}
            showToast={showToast}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
