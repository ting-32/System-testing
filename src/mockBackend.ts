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
        const storedSettingsRaw = localStorage.getItem('mock_settings');
        const storedSettings = storedSettingsRaw ? JSON.parse(storedSettingsRaw) : undefined;
        return new Response(JSON.stringify({
          success: true,
          data: {
            customers: getStorage('customers'),
            products: getStorage('products'),
            orders: getStorage('orders'),
            trips: getStorage('trips') || ['第一趟', '第二趟', '未分配'],
            ...(storedSettings ? { settings: storedSettings } : {}),
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

          if (action === 'saveSettings') {
            const payload = data || body;
            const prevRaw = localStorage.getItem('mock_settings');
            const prev = prevRaw ? JSON.parse(prevRaw) : {};
            localStorage.setItem('mock_settings', JSON.stringify({
              ...prev,
              ...(payload.rules !== undefined ? { rules: payload.rules } : {}),
              ...(payload.lineChannelToken !== undefined ? { lineChannelToken: payload.lineChannelToken } : {}),
              ...(payload.lineUserId !== undefined ? { lineUserId: payload.lineUserId } : {}),
              ...(payload.dailyBriefing !== undefined ? { dailyBriefing: payload.dailyBriefing } : {}),
              ...(payload.dailyBriefings !== undefined ? { dailyBriefings: payload.dailyBriefings } : {})
            }));
            return new Response(JSON.stringify({ success: true, data: true }), { status: 200 });
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
            const userList = getStorage('users');
            if (userList && userList.length > 0) {
              const staff = userList.map((u: any) => ({
                userId: u.userId,
                username: u.username,
                name: u.name,
                role: u.role,
                line_user_id: u.line_user_id || ''
              }));
              return new Response(JSON.stringify({ success: true, staff }), { status: 200 });
            }
            const staffList = [
              { userId: 'admin', username: 'admin', name: '王廠長', role: 'admin', line_user_id: '' },
              { userId: 'manager1', username: 'manager1', name: '李領班', role: 'manager', line_user_id: '' },
              { userId: 'staff1', username: 'staff1', name: '陳師傅 (早班製麵)', role: 'staff', line_user_id: 'U9948102938472910482019482019482' },
              { userId: 'staff2', username: 'staff2', name: '張師傅 (包裝分貨)', role: 'staff', line_user_id: '' },
              { userId: 'staff3', username: 'staff3', name: '林司機 (外送配送)', role: 'staff', line_user_id: 'U8849201948201928401928401928401' }
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

            // 檢查該指派同仁是否有綁定 LINE ID
            const userList = getStorage('users') || [];
            const assignedStaff = userList.find((u: any) => u.userId === targetId);
            const lineNotified = !!(assignedStaff && assignedStaff.line_user_id);

            return new Response(JSON.stringify({ 
              success: true, 
              lineNotified,
              targetUserId: targetId,
              targetUserName: targetName,
              message: lineNotified ? `已指派並自動推播至 ${targetName} 的 LINE` : `已指派給 ${targetName}`
            }), { status: 200 });
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
                { userId: 'admin', username: 'admin', name: '王廠長', role: 'admin', status: 'ACTIVE', line_user_id: '' },
                { userId: 'manager1', username: 'manager1', name: '李領班', role: 'manager', status: 'ACTIVE', line_user_id: '' },
                { userId: 'staff1', username: 'staff1', name: '陳師傅', role: 'staff', status: 'ACTIVE', line_user_id: 'U9948102938472910482019482019482' },
                { userId: 'staff2', username: 'staff2', name: '張師傅', role: 'staff', status: 'ACTIVE', line_user_id: '' },
                { userId: 'staff3', username: 'staff3', name: '林司機', role: 'staff', status: 'ACTIVE', line_user_id: 'U8849201948201928401928401928401' }
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
                status: req.status || 'ACTIVE',
                line_user_id: req.line_user_id || req.lineUserId || ''
              };
              userList.push(newUser);
            } else if (req.actionType === 'UPDATE_ROLE') {
              userList = userList.map((u: any) => u.userId === targetId ? { ...u, role: req.role } : u);
            } else if (req.actionType === 'TOGGLE_STATUS') {
              userList = userList.map((u: any) => u.userId === targetId ? { ...u, status: req.status } : u);
            } else if (req.actionType === 'UPDATE_LINE_ID') {
              const newLineId = (req.line_user_id !== undefined ? req.line_user_id : req.lineUserId) || '';
              userList = userList.map((u: any) => u.userId === targetId ? { ...u, line_user_id: String(newLineId).trim() } : u);
            } else if (req.actionType === 'RESET_PASSWORD') {
              // Password updated
            }

            setStorage('users', userList);
            return new Response(JSON.stringify({ success: true, users: userList }), { status: 200 });
          }

          if (action === 'testLineMessage') {
            const req = body.data || body;
            const targetLineId = req.lineUserId || req.line_user_id;
            if (!targetLineId) {
              return new Response(JSON.stringify({ success: false, error: '缺少 LINE User ID' }), { status: 400 });
            }
            return new Response(JSON.stringify({ 
              success: true, 
              message: `已向 LINE 用戶 (${targetLineId.substring(0, 6)}...) 成功送出測試訊息！` 
            }), { status: 200 });
          }

          if (action === 'sendStaffDispatchNotification') {
            const req = body.data || body;
            const staffUserId = req.staffUserId || req.targetUserId;
            const userList = getStorage('users') || [];
            const staff = userList.find((u: any) => u.userId === staffUserId);
            if (!staff || !staff.line_user_id) {
              return new Response(JSON.stringify({ 
                success: false, 
                error: `同仁尚未綁定 LINE ID，無法推播` 
              }), { status: 400 });
            }
            return new Response(JSON.stringify({ 
              success: true, 
              recipient: staff.name,
              lineUserId: staff.line_user_id,
              message: `已成功將今日配送明細推播至「${staff.name}」的 LINE！` 
            }), { status: 200 });
          }

          if (action === 'savePermissionMatrix') {
            const matrix = body.matrix || (data && data.matrix);
            if (matrix) {
              setStorage('permission_matrix', matrix);
            }
            return new Response(JSON.stringify({ success: true }), { status: 200 });
          }

          if (action === 'dryRunRule' || action === 'testRule') {
            const req = body.data || body;
            const ruleId = req.ruleId;
            const storedSettingsRaw = localStorage.getItem('mock_settings');
            const storedSettings = storedSettingsRaw ? JSON.parse(storedSettingsRaw) : { rules: [] };
            const rulesList = Array.isArray(storedSettings.rules) ? storedSettings.rules : [];
            const targetRule = rulesList.find((r: any) => String(r.id) === String(ruleId));

            if (!targetRule) {
              return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
            }

            const ordersAll = getStorage('orders') || [];
            const customersAll = getStorage('customers') || [];
            const usersAll = getStorage('users') || [];
            const nowDate = new Date();
            const fmtDate = (d: Date) =>
              `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

            const dateMode = targetRule.targetDateMode || (targetRule.targetOrderDays?.length ? 'WEEKDAYS' : 'TOMORROW');
            const targetDateStrs: string[] = [];
            if (dateMode === 'TODAY') {
              targetDateStrs.push(fmtDate(nowDate));
            } else if (dateMode === 'TOMORROW') {
              targetDateStrs.push(fmtDate(new Date(nowDate.getTime() + 86400000)));
            } else {
              const tDays = targetRule.targetOrderDays || [];
              for (let i = 1; i <= 7; i++) {
                const d = new Date(nowDate.getTime() + i * 86400000);
                if (tDays.includes(String(d.getDay()))) targetDateStrs.push(fmtDate(d));
              }
              if (targetDateStrs.length === 0) targetDateStrs.push(fmtDate(new Date(nowDate.getTime() + 86400000)));
            }

            const activeOrders = ordersAll.filter((o: any) => {
              const s = String(o.status || '').toUpperCase();
              const d = String(o.deliveryDate || '').split(' ')[0].replace(/\//g, '-');
              return targetDateStrs.includes(d) && s !== 'CANCELLED' && s !== '已取消';
            });

            const matchedOrders = activeOrders.filter((o: any) => {
              const conds = targetRule.conditions || [];
              if (conds.length === 0) return true;
              return conds.some((c: any) => {
                if (c.status === 'UNORDERED') return false;
                if (c.status === 'PENDING') return o.status === 'PENDING' || o.status === '待處理';
                if (c.status === 'UNASSIGNED') return !String(o.assignedTo || o.assigned_to || '').trim();
                return true;
              });
            });

            const previewSamples: Array<{ recipientName: string; previewText: string }> = [];
            if (targetRule.recipientMode === 'ASSIGNED_DRIVER' && matchedOrders.length > 0) {
              const byDriver: Record<string, any[]> = {};
              matchedOrders.forEach((o: any) => {
                const aId = String(o.assignedTo || o.assigned_to || 'UNASSIGNED');
                if (!byDriver[aId]) byDriver[aId] = [];
                byDriver[aId].push(o);
              });
              Object.entries(byDriver).forEach(([aId, list]) => {
                const u = usersAll.find((x: any) => x.userId === aId);
                const label = aId === 'UNASSIGNED' ? '管理員 (未指派補送)' : `${u?.name || aId} (司機)`;
                const lines = list.map((o: any) => `▸ ${o.customerName} (${o.deliveryTime || '不限'})\n  • ${o.productName || '麵品'} × ${o.quantity || 1}`);
                previewSamples.push({
                  recipientName: label,
                  previewText: `【${targetRule.name}】\n📅 配送日：${targetDateStrs.join('、')}\n━━━━━━━━━━━━━━\n${lines.join('\n──────────\n')}`
                });
              });
            } else if (matchedOrders.length > 0) {
              const lines = matchedOrders.slice(0, 6).map((o: any) => `▸ ${o.customerName}：${o.productName || '麵品'} × ${o.quantity || 1}`);
              previewSamples.push({
                recipientName: targetRule.recipientMode === 'SPECIFIC_STAFF' ? '指定同仁' : '預設管理員',
                previewText: `【${targetRule.name}】\n📅 配送日：${targetDateStrs.join('、')}\n━━━━━━━━━━━━━━\n${lines.join('\n')}`
              });
            }

            const uniqueCustCount = new Set(matchedOrders.map((o: any) => o.customerName)).size;
            const dryResult = [{
              ruleId: targetRule.id,
              ruleName: targetRule.name,
              status: matchedOrders.length > 0 ? 'SUCCESS' : 'SKIPPED',
              details: {
                reason: matchedOrders.length > 0 ? undefined : '條件未達成（目前目標日尚無符合條件之訂單）',
                customersEvaluated: customersAll.length,
                customersMatched: uniqueCustCount,
                ordersMatched: matchedOrders.length,
                driverPushCount: previewSamples.length,
                recipients: previewSamples.map(p => p.recipientName).join('、'),
                previewSamples
              }
            }];

            return new Response(JSON.stringify({ success: true, data: dryResult }), { status: 200 });
          }

          if (action === 'dryRunBriefing' || action === 'sendBriefingNow') {
            const req = body.data || body;
            const storedSettingsRaw = localStorage.getItem('mock_settings');
            const storedSettings = storedSettingsRaw ? JSON.parse(storedSettingsRaw) : {};
            const briefing = req.briefing || (Array.isArray(storedSettings.dailyBriefings) && storedSettings.dailyBriefings[0]) || storedSettings.dailyBriefing || {
              id: 'default_briefing',
              name: '每日出車簡報',
              enabled: true,
              groupBy: 'BY_DRIVER',
              includeItemTotals: true,
              includeWatchlistMissingCheck: true,
              watchlistMissingOnlyRegular: true,
              fallbackToAdminIfUnassigned: true
            };

            const ordersAll = getStorage('orders') || [];
            const customersAll = getStorage('customers') || [];
            const usersAll = getStorage('users') || [];
            const nowDate = new Date();
            const todayNum = nowDate.getDay();
            const fmtDate = (d: Date) =>
              `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const todayStr = fmtDate(nowDate);
            const shortDays = ['日', '一', '二', '三', '四', '五', '六'];
            const titleDate = `${nowDate.getMonth() + 1}/${nowDate.getDate()}(${shortDays[todayNum]})`;

            const custMap: Record<string, any> = {};
            customersAll.forEach((c: any) => {
              if (c.name) custMap[String(c.name).trim()] = c;
            });

            const todayOrders = ordersAll.filter((o: any) => {
              const s = String(o.status || '').toUpperCase();
              const d = String(o.deliveryDate || '').split(' ')[0].replace(/\//g, '-');
              return d === todayStr && s !== 'CANCELLED' && s !== '已取消';
            });

            const orderedNames = new Set(todayOrders.map((o: any) => String(o.customerName || '').trim()));

            if (briefing.briefingMode === 'CUSTOM_TEMPLATE') {
              const custById: Record<string, any> = {};
              customersAll.forEach((c: any) => {
                if (c.id) custById[String(c.id).trim()] = c;
              });
              const includedIds: string[] = Array.isArray(briefing.includedCustomerIds) ? briefing.includedCustomerIds : [];
              const allowedNameSet = new Set<string>();
              includedIds.forEach((id: string) => {
                const c = custById[String(id).trim()];
                if (c?.name && !c.isArchived) allowedNameSet.add(String(c.name).trim());
              });

              const scopedOrders = todayOrders.filter((o: any) => allowedNameSet.has(String(o.customerName || '').trim()));
              const missingIncluded = includedIds
                .map((id: string) => custById[id])
                .filter((c: any) => {
                  if (!c || c.isArchived || c.isPaused) return false;
                  const isOff = (Array.isArray(c.offDays) && c.offDays.includes(todayNum)) ||
                    (Array.isArray(c.holidayDates) && c.holidayDates.includes(todayStr));
                  return !isOff && !orderedNames.has(String(c.name || '').trim());
                });

              const renderCustomMock = (ordersSlice: any[], allowMissingBlock: boolean) => {
                const byName: Record<string, any[]> = {};
                const totals: Record<string, { qty: number; unit: string }> = {};
                ordersSlice.forEach((o: any) => {
                  const cn = String(o.customerName || '').trim();
                  if (!byName[cn]) byName[cn] = [];
                  byName[cn].push(o);
                  const pn = o.productName || '麵品';
                  if (!totals[pn]) totals[pn] = { qty: 0, unit: o.unit || '' };
                  totals[pn].qty += Number(o.quantity || 0);
                });

                const subtotalText = Object.keys(totals).length > 0
                  ? `📦 總備貨小計：\n${Object.entries(totals).map(([k, v]) => `${k} ${v.qty}${v.unit}`).join('、')}`
                  : (briefing.emptyStoreBehavior === 'SHOW_NO_ORDER' ? '📦 總備貨小計：\n（無出貨品項）' : '__REMOVE_LINE__');

                const missingText = allowMissingBlock && missingIncluded.length > 0
                  ? `❓ 以下標籤店家今日無單：\n${missingIncluded.map((c: any) => `• ${c.name}`).join('\n')}`
                  : '__REMOVE_LINE__';

                const rawTpl = String(briefing.customTemplate || '');
                const hasManualTotals = rawTpl.includes('{{總備貨小計}}');
                let out = rawTpl
                  .replace(/\{\{今日日期\}\}/g, titleDate)
                  .replace(/\{\{總備貨小計\}\}/g, subtotalText)
                  .replace(/\{\{無單確認名單\}\}/g, missingText)
                  .replace(/\{\{店家:([^|}]+)(?:\|([^}]+))?\}\}/g, (_, rawName, rawId) => {
                    const c = (rawId && custById[rawId]) || custMap[rawName];
                    const targetName = c?.name || rawName;
                    const list = byName[targetName] || [];
                    if (list.length === 0) {
                      return briefing.emptyStoreBehavior === 'SHOW_NO_ORDER'
                        ? `▸ ${targetName}（⭕ 今日無單）`
                        : '__REMOVE_LINE__';
                    }
                    const firstOrd = list[0] || {};
                    const metaParts: string[] = [];
                    const effTrip = firstOrd.trip || c?.defaultTrip || '';
                    const effTime = firstOrd.deliveryTime || c?.deliveryTime || '';
                    const effMethod = firstOrd.deliveryMethod || c?.deliveryMethod || '';
                    if (briefing.includeTripInfo === true && effTrip && effTrip !== '未分配') metaParts.push(effTrip);
                    if (briefing.includeDeliveryTime === true && effTime) metaParts.push(effTime);
                    if (effMethod && effMethod !== '外送') metaParts.push(effMethod);
                    const metaStr = metaParts.length > 0 ? ` (${metaParts.join(' ')})` : '';
                    const lines = list.map((o: any) => `  • ${o.productName || '麵品'} × ${o.quantity || 1}${o.unit || ''}`).join('\n');
                    return `${c?.isWatchlist ? '🚨 ' : '▸ '}${targetName}${metaStr}\n${lines}`;
                  });

                out = out
                  .split('\n')
                  .filter((line: string) => line.trim() !== '__REMOVE_LINE__')
                  .map((line: string) => line.replace(/__REMOVE_LINE__/g, ''))
                  .join('\n')
                  .replace(/\n{3,}/g, '\n\n')
                  .trim();

                if (briefing.customIncludeItemTotals === true && !hasManualTotals && Object.keys(totals).length > 0) {
                  out += `\n━━━━━━━━━━━━━━\n${subtotalText}`;
                }
                return out;
              };

              const previewSamples: Array<{ recipientName: string; previewText: string }> = [];
              if ((briefing.groupBy || 'BY_DRIVER') === 'BY_DRIVER') {
                const byDriver: Record<string, any[]> = {};
                const unassigned: any[] = [];
                scopedOrders.forEach((o: any) => {
                  const aId = String(o.assignedTo || o.assigned_to || '').trim();
                  const u = usersAll.find((x: any) => x.userId === aId);
                  if (aId && u?.line_user_id) {
                    if (!byDriver[aId]) byDriver[aId] = [];
                    byDriver[aId].push(o);
                  } else {
                    unassigned.push(o);
                  }
                });
                Object.entries(byDriver).forEach(([aId, list]) => {
                  const u = usersAll.find((x: any) => x.userId === aId);
                  const txt = renderCustomMock(list, false);
                  if (txt) {
                    previewSamples.push({ recipientName: `${u?.name || aId} (司機)`, previewText: txt });
                  }
                });
                if ((unassigned.length > 0 && briefing.fallbackToAdminIfUnassigned !== false) || missingIncluded.length > 0) {
                  const adminTxt = renderCustomMock(briefing.fallbackToAdminIfUnassigned !== false ? unassigned : [], true);
                  if (adminTxt) {
                    previewSamples.push({ recipientName: '管理員 (監控／未指派補送)', previewText: adminTxt });
                  }
                }
              } else if (briefing.groupBy === 'SPECIFIC_STAFF') {
                const staffIds: string[] = Array.isArray(briefing.targetStaffIds) ? briefing.targetStaffIds : [];
                const selectedUsers = staffIds
                  .map(id => usersAll.find((u: any) => u.userId === id || u.username === id))
                  .filter((u: any) => Boolean(u?.line_user_id));
                if (selectedUsers.length > 0 && (scopedOrders.length > 0 || missingIncluded.length > 0 || briefing.emptyStoreBehavior === 'SHOW_NO_ORDER')) {
                  const txt = renderCustomMock(scopedOrders, true);
                  if (txt) {
                    previewSamples.push({
                      recipientName: `指定用戶：${selectedUsers.map((u: any) => u.name).join('、')}`,
                      previewText: txt
                    });
                  }
                }
              } else if (scopedOrders.length > 0 || missingIncluded.length > 0 || briefing.emptyStoreBehavior === 'SHOW_NO_ORDER') {
                const txt = renderCustomMock(scopedOrders, true);
                if (txt) {
                  previewSamples.push({ recipientName: '預設管理員 (客製化標籤模板)', previewText: txt });
                }
              }

              const dryResult = [{
                ruleId: briefing.id || 'DAILY_BRIEFING',
                ruleName: briefing.name || '每日出車簡報',
                status: previewSamples.length > 0 ? 'SUCCESS' : 'SKIPPED',
                details: {
                  reason: previewSamples.length > 0 ? undefined : '今日標籤白名單店家尚無有效訂單',
                  customersEvaluated: includedIds.length,
                  customersMatched: new Set(scopedOrders.map((o: any) => o.customerName)).size,
                  ordersMatched: scopedOrders.length,
                  driverPushCount: previewSamples.length,
                  recipients: previewSamples.map(p => p.recipientName).join('、'),
                  previewSamples
                }
              }];
              return new Response(JSON.stringify({ success: true, data: dryResult }), { status: 200 });
            }

            const missingWatchlist = briefing.includeWatchlistMissingCheck !== false
              ? customersAll.filter((c: any) => {
                  if (!c.isWatchlist || c.isArchived || c.isPaused) return false;
                  if (briefing.watchlistMissingOnlyRegular !== false) {
                    const term = String(c.paymentTerm || 'regular').toLowerCase();
                    if (term === 'occasional' || term === 'adhoc') return false;
                  }
                  const isOff = (Array.isArray(c.offDays) && c.offDays.includes(todayNum)) ||
                    (Array.isArray(c.holidayDates) && c.holidayDates.includes(todayStr));
                  return !isOff && !orderedNames.has(String(c.name || '').trim());
                })
              : [];

            const formatOrderMeta = (o: any) => {
              const cust = custMap[String(o.customerName || '').trim()];
              const parts: string[] = [];
              const effTrip = o.trip || cust?.defaultTrip || '';
              const effTime = o.deliveryTime || cust?.deliveryTime || '';
              const effMethod = o.deliveryMethod || cust?.deliveryMethod || '';
              if (briefing.includeTripInfo === true && effTrip && effTrip !== '未分配') parts.push(effTrip);
              if (briefing.includeDeliveryTime === true && effTime) parts.push(effTime);
              if (effMethod && effMethod !== '外送') parts.push(effMethod);
              return parts.length > 0 ? ` (${parts.join(' ')})` : '';
            };

            const formatThreeSections = (ordersSlice: any[], subHeader: string, includeMissing: boolean) => {
              const watchOrders = ordersSlice.filter((o: any) => custMap[String(o.customerName || '').trim()]?.isWatchlist);
              const normalOrders = ordersSlice.filter((o: any) => !custMap[String(o.customerName || '').trim()]?.isWatchlist);
              let text = `🚚【今日出車簡報】${titleDate}\n${subHeader}\n`;
              if (watchOrders.length > 0) {
                text += `━━━━━━━━━━━━━━\n🚨【第一段｜易漏重點必送】(${watchOrders.length} 筆)\n`;
                text += watchOrders.map((o: any) => `▸ ${o.customerName}${formatOrderMeta(o)}\n  • ${o.productName || '麵品'} × ${o.quantity || 1}${o.unit || ''}`).join('\n');
              }
              if (normalOrders.length > 0) {
                text += `\n━━━━━━━━━━━━━━\n🚚【第二段｜今日一般配送】(${normalOrders.length} 筆)\n`;
                text += normalOrders.map((o: any) => `▸ ${o.customerName}${formatOrderMeta(o)}\n  • ${o.productName || '麵品'} × ${o.quantity || 1}${o.unit || ''}`).join('\n');
              }
              if (briefing.includeItemTotals !== false && ordersSlice.length > 0) {
                const totals: Record<string, { qty: number; unit: string }> = {};
                ordersSlice.forEach((o: any) => {
                  const k = o.productName || '麵品';
                  if (!totals[k]) totals[k] = { qty: 0, unit: o.unit || '' };
                  totals[k].qty += Number(o.quantity || 0);
                });
                const sumLine = Object.entries(totals).map(([k, v]) => `${k} ${v.qty}${v.unit}`).join('、');
                if (sumLine) text += `\n━━━━━━━━━━━━━━\n📦 總備貨小計：\n${sumLine}`;
              }
              if (includeMissing && missingWatchlist.length > 0) {
                text += `\n━━━━━━━━━━━━━━\n❓【第三段｜盯哨店家今日無單確認】(${missingWatchlist.length} 家)\n${missingWatchlist.map((c: any) => `• ${c.name}`).join('\n')}`;
              }
              return text.trim();
            };

            const previewSamples: Array<{ recipientName: string; previewText: string }> = [];
            if (todayOrders.length > 0 || missingWatchlist.length > 0) {
              if ((briefing.groupBy || 'BY_DRIVER') === 'BY_DRIVER') {
                const byDriver: Record<string, any[]> = {};
                const unassigned: any[] = [];
                todayOrders.forEach((o: any) => {
                  const aId = String(o.assignedTo || o.assigned_to || '').trim();
                  const u = usersAll.find((x: any) => x.userId === aId);
                  if (aId && u?.line_user_id) {
                    if (!byDriver[aId]) byDriver[aId] = [];
                    byDriver[aId].push(o);
                  } else {
                    unassigned.push(o);
                  }
                });
                Object.entries(byDriver).forEach(([aId, list]) => {
                  const u = usersAll.find((x: any) => x.userId === aId);
                  previewSamples.push({
                    recipientName: `${u?.name || aId} (司機)`,
                    previewText: formatThreeSections(list, `👤 負責司機：${u?.name || aId}`, false)
                  });
                });
                if ((unassigned.length > 0 && briefing.fallbackToAdminIfUnassigned !== false) || missingWatchlist.length > 0) {
                  previewSamples.push({
                    recipientName: '管理員 (監控／未指派補送)',
                    previewText: formatThreeSections(briefing.fallbackToAdminIfUnassigned !== false ? unassigned : [], '🛡️ 內勤／管理員監控摘要', true)
                  });
                }
              } else if (briefing.groupBy === 'SPECIFIC_STAFF') {
                const staffIds: string[] = Array.isArray(briefing.targetStaffIds) ? briefing.targetStaffIds : [];
                const selectedUsers = staffIds
                  .map(id => usersAll.find((u: any) => u.userId === id || u.username === id))
                  .filter((u: any) => Boolean(u?.line_user_id));
                if (selectedUsers.length > 0) {
                  const namesLabel = selectedUsers.map((u: any) => u.name).join('、');
                  previewSamples.push({
                    recipientName: `指定用戶：${namesLabel}`,
                    previewText: formatThreeSections(todayOrders, `👥 指定接收：${namesLabel}`, true)
                  });
                }
              } else {
                previewSamples.push({
                  recipientName: '預設管理員 (全車趟總表)',
                  previewText: formatThreeSections(todayOrders, '🚚 全廠依車趟出車總表', true)
                });
              }
            }

            const dryResult = [{
              ruleId: briefing.id || 'DAILY_BRIEFING',
              ruleName: briefing.name || '每日出車簡報',
              status: previewSamples.length > 0 ? 'SUCCESS' : 'SKIPPED',
              details: {
                reason: previewSamples.length > 0 ? undefined : '今日尚無有效配送訂單，且無漏單盯哨異常',
                customersEvaluated: customersAll.length,
                customersMatched: orderedNames.size,
                ordersMatched: todayOrders.length,
                driverPushCount: previewSamples.length,
                recipients: previewSamples.map(p => p.recipientName).join('、'),
                previewSamples
              }
            }];

            return new Response(JSON.stringify({ success: true, data: dryResult }), { status: 200 });
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
