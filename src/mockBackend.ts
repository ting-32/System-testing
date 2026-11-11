export function setupMockBackend() {
  const originalFetch = window.fetch;

  const getStorage = (key: string) => {
    const data = localStorage.getItem(`mock_${key}`);
    return data ? JSON.parse(data) : [];
  };

  const setStorage = (key: string, data: any) => {
    localStorage.setItem(`mock_${key}`, JSON.stringify(data));
  };

  Object.defineProperty(window, 'fetch', {
    writable: true,
    configurable: true,
    value: async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    
    // Check if it's our mock endpoint or fallback placeholder URL
    if (url.includes('mock-api.local') || url.includes('placeholder')) {
      if (url.includes('type=init') || url.includes('type=sync_delta') || (!init || init.method === 'GET')) {
        return new Response(JSON.stringify({
          success: true,
          data: {
            customers: getStorage('customers'),
            products: getStorage('products'),
            orders: getStorage('orders'),
            trips: getStorage('trips') || ['第一趟', '第二趟', '未分配'],
            globalLastUpdated: Date.now()
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (init && init.method === 'POST') {
        try {
          const body = typeof init.body === 'string' ? JSON.parse(init.body) : (init.body || {});
          const { action, data } = body;
          const now = Date.now();

          if (action === 'login') {
            const pwd = data?.password || body.password;
            const uname = data?.username || body.username || 'admin';
            
            if (pwd === '8888' || pwd === 'admin123' || pwd === 'staff123') {
              sessionStorage.removeItem('mock_login_fail');
              const role = pwd === 'staff123' ? 'staff' : (uname === 'manager' ? 'manager' : 'admin');
              const userName = role === 'admin' ? '系統管理員' : (role === 'manager' ? '工廠主管' : '作業員工');
              const userInfo = { userId: uname, username: uname, name: userName, role };
              return new Response(JSON.stringify({ 
                success: true, 
                token: 'mock_jwt_token_sample_header.payload.signature',
                user: userInfo,
                data: { success: true, token: 'mock_jwt_token_sample', role, name: userName, user: userInfo } 
              }), { status: 200 });
            }

            const failCount = Number(sessionStorage.getItem('mock_login_fail') || 0) + 1;
            sessionStorage.setItem('mock_login_fail', String(failCount));
            const remaining = Math.max(0, 5 - failCount);
            const errorMsg = remaining > 0 
              ? `無效的帳號或密碼 (剩餘嘗試次數: ${remaining})`
              : "密碼錯誤次數過多，該裝置已暫時鎖定 15 分鐘，請稍後再試。";
            return new Response(JSON.stringify({ success: false, error: errorMsg, data: { success: false, error: errorMsg } }), { status: 200 });
          }
          
          if (action === 'changePassword') {
            return new Response(JSON.stringify({ success: true, data: true }), { status: 200 });
          }

          if (action === 'checkUpdates') {
            return new Response(JSON.stringify({ success: true, data: { globalLastUpdated: now } }), { status: 200 });
          }

          if (action === 'saveTrips') {
            setStorage('trips', data.trips);
            return new Response(JSON.stringify({ success: true, data: { lastUpdated: now } }), { status: 200 });
          }

          if (action === 'batchUpdateOrders') {
            let items = getStorage('orders');
            data.updates.forEach((u: any) => {
              items = items.map((item: any) => item.id === u.id ? { ...item, status: u.status, lastUpdated: now, version: now } : item);
            });
            setStorage('orders', items);
            return new Response(JSON.stringify({ success: true, data: { newLastUpdatedTs: now } }), { status: 200 });
          }

          if (action === 'reorderProducts') {
            let items = getStorage('products');
            const orderedIds = data;
            items.sort((a: any, b: any) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
            setStorage('products', items);
            return new Response(JSON.stringify({ success: true, data: { lastUpdated: now } }), { status: 200 });
          }

          if (action === 'getOrders') {
            const allOrders = getStorage('orders') || [];
            return new Response(JSON.stringify({ success: true, orders: allOrders }), { status: 200 });
          }

          if (action === 'getStaffList') {
            const staffList = [
              { userId: 'admin', username: 'admin', name: '王廠長', role: 'admin' },
              { userId: 'manager1', username: 'manager1', name: '李領班', role: 'manager' },
              { userId: 'staff1', username: 'staff1', name: '陳師傅 (早班製麵)', role: 'staff' },
              { userId: 'staff2', username: 'staff2', name: '張師傅 (包裝分貨)', role: 'staff' },
              { userId: 'staff3', username: 'staff3', name: '林司機 (外送配送)', role: 'staff' }
            ];
            return new Response(JSON.stringify({ success: true, staff: staffList }), { status: 200 });
          }

          if (action === 'assignOrder') {
            let items = getStorage('orders') || [];
            const oId = body.orderId || (data && data.orderId) || body.id || (data && data.id);
            const targetId = body.targetUserId || (data && data.targetUserId);
            const targetName = body.targetUserName || (data && data.targetUserName);
            items = items.map((o: any) => (o.id === oId || o.order_id === oId) ? { ...o, assignedTo: targetId, assignedName: targetName, assigned_to: targetId, assigned_name: targetName, lastUpdated: now } : o);
            setStorage('orders', items);
            return new Response(JSON.stringify({ success: true }), { status: 200 });
          }

          if (action === 'updateOrderStatus') {
            let items = getStorage('orders') || [];
            const oId = body.orderId || (data && data.orderId);
            const status = body.status || (data && data.status);
            items = items.map((o: any) => (o.id === oId || o.order_id === oId) ? { ...o, status, lastUpdated: now } : o);
            setStorage('orders', items);
            return new Response(JSON.stringify({ success: true }), { status: 200 });
          }

          if (action === 'batchDeleteOrders') {
            let items = getStorage('orders') || [];
            const idsToDelete = Array.isArray(body.orderIds || data?.orderIds) 
              ? (body.orderIds || data.orderIds).map((id: any) => String(id).trim())
              : [];
            const idSet = new Set(idsToDelete);
            const countBefore = items.length;
            items = items.filter((o: any) => !idSet.has(String(o.id || o.order_id)));
            const deletedCount = countBefore - items.length;
            setStorage('orders', items);
            return new Response(JSON.stringify({ 
              success: true, 
              deletedCount,
              message: `已成功批次清理 ${deletedCount} 筆訂單` 
            }), { status: 200 });
          }

          if (action === 'getAllUsers') {
            let userList = getStorage('users');
            if (!userList || userList.length === 0) {
              userList = [
                { userId: 'admin', username: 'admin', name: '王廠長', role: 'admin', status: 'ACTIVE' },
                { userId: 'manager1', username: 'manager1', name: '李領班', role: 'manager', status: 'ACTIVE' },
                { userId: 'staff1', username: 'staff1', name: '陳師傅', role: 'staff', status: 'ACTIVE' },
                { userId: 'staff2', username: 'staff2', name: '張師傅', role: 'staff', status: 'ACTIVE' },
                { userId: 'staff3', username: 'staff3', name: '林司機', role: 'staff', status: 'ACTIVE' }
              ];
              setStorage('users', userList);
            }
            return new Response(JSON.stringify({ 
              success: true, 
              users: userList,
              data: { success: true, users: userList } 
            }), { status: 200 });
          }

          if (action === 'saveUser') {
            let userList = getStorage('users') || [];
            const req = body.data || body;
            const targetId = req.userId;

            if (req.actionType === 'CREATE') {
              const newUser = {
                userId: req.userId,
                username: req.username,
                name: req.name,
                role: req.role || 'staff',
                status: req.status || 'ACTIVE'
              };
              userList.push(newUser);
            } else if (req.actionType === 'UPDATE_ROLE') {
              userList = userList.map((u: any) => u.userId === targetId ? { ...u, role: req.role } : u);
            } else if (req.actionType === 'TOGGLE_STATUS') {
              userList = userList.map((u: any) => u.userId === targetId ? { ...u, status: req.status } : u);
            } else if (req.actionType === 'RESET_PASSWORD') {
              // Password updated
            }

            setStorage('users', userList);
            return new Response(JSON.stringify({ success: true, users: userList }), { status: 200 });
          }

          if (action === 'savePermissionMatrix') {
            const matrix = body.matrix || (data && data.matrix);
            if (matrix) {
              setStorage('permission_matrix', matrix);
            }
            return new Response(JSON.stringify({ success: true }), { status: 200 });
          }

          // Handle CRUD operations
          if (action.startsWith('add') || action.startsWith('update') || action.startsWith('delete')) {
            let type = '';
            if (action.includes('Customer')) type = 'customers';
            else if (action.includes('Product')) type = 'products';
            else if (action.includes('Order')) type = 'orders';
            
            if (type) {
              let items = getStorage(type);
              
              if (action.startsWith('add')) {
                items.push({ ...data, lastUpdated: now });
              } else if (action.startsWith('update')) {
                items = items.map((item: any) => item.id === data.id ? { ...data, lastUpdated: now } : item);
              } else if (action.startsWith('delete')) {
                items = items.filter((item: any) => item.id !== data.id);
              }
              
              setStorage(type, items);
            }
            return new Response(JSON.stringify({ success: true, data: { lastUpdated: now } }), { status: 200 });
          }

          return new Response(JSON.stringify({ success: true, data: { lastUpdated: now } }), { status: 200 });
        } catch (e) {
          console.error("Mock backend error:", e);
          return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500 });
        }
      }
    }

    // Fallback to original fetch for other requests
    return originalFetch(input, init);
    }
  });
}
