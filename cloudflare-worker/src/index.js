/**
 * 麵廠職人 ERP — Cloudflare Worker LINE Edge Webhook
 *
 * 雙軌分流架構：
 * - Track A (<150ms)：SHOW_MENU、W_TODAY、查ID、說明、follow 等直接從 Edge + Firebase 鏡像秒回
 * - Track B (<250ms)：W_SS / W_UNDO_ST 一鍵改狀態樂觀秒回＋樂觀更新鏡像，ctx.waitUntil() 非同步落盤 GAS
 * - Track C (0 Push 額度消耗)：複雜指令 / Gemini AI 先發 LINE Loading 動畫，再轉發 GAS 用免費 replyToken 回覆
 */

const DEFAULT_FIREBASE_URL = 'https://orderapp-sync-default-rtdb.asia-southeast1.firebasedatabase.app';
const DEDUP_TTL_MS = 5 * 60 * 1000;
const MIRROR_MEMORY_TTL_MS = 12 * 1000;

const processedEvents = new Map();
let mirrorMemoryCache = { data: null, fetchedAt: 0 };

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function encodeFirebaseKey(rawKey) {
  return encodeURIComponent(String(rawKey || '').trim()).replace(/\./g, '%2E');
}

function getTodayStrTaipei() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function getStatusChineseLabel(status) {
  const s = String(status || '').trim().toUpperCase();
  if (s === 'SHIPPED' || s === '已配送' || s === '已送達' || s === '已出貨') return '已配送';
  if (s === 'PAID' || s === '已結清' || s === '已收款') return '已收款';
  if (s === 'PAID_UNSHIPPED' || s === '已收款未出貨') return '已收款未出貨';
  if (s === 'CANCELLED' || s === '已取消') return '已取消';
  return '待出貨';
}

function canViewAllOrders(role) {
  const r = String(role || 'staff').trim().toLowerCase();
  return r === 'admin' || r === 'manager';
}

function canUpdateAnyOrderStatus(role) {
  const r = String(role || 'staff').trim().toLowerCase();
  return r === 'admin' || r === 'manager';
}

/**
 * 使用 Web Crypto API 驗證 LINE Webhook HMAC-SHA256 簽章
 */
async function verifyLineSignature(rawBody, signatureHeader, channelSecret) {
  if (!signatureHeader || !channelSecret) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const bytes = new Uint8Array(sigBuf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const expectedBase64 = btoa(binary);

  if (expectedBase64.length !== signatureHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedBase64.length; i++) {
    diff |= expectedBase64.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  }
  return diff === 0;
}

function isDuplicateEvent(webhookEventId) {
  if (!webhookEventId) return false;
  const now = Date.now();
  for (const [key, expiresAt] of processedEvents.entries()) {
    if (expiresAt <= now) processedEvents.delete(key);
  }
  if (processedEvents.has(webhookEventId)) return true;
  processedEvents.set(webhookEventId, now + DEDUP_TTL_MS);
  return false;
}

function parsePostbackData(rawData) {
  const out = {};
  if (!rawData) return out;
  String(rawData)
    .split('&')
    .forEach((pair) => {
      const idx = pair.indexOf('=');
      if (idx === -1) return;
      const k = decodeURIComponent(pair.slice(0, idx));
      const v = decodeURIComponent(pair.slice(idx + 1));
      out[k] = v;
    });
  return out;
}

function normalizeFirebaseBase(env) {
  return String(env.FIREBASE_DB_URL || DEFAULT_FIREBASE_URL).replace(/\/+$/, '');
}

function buildFirebaseAuthQuery(env) {
  const auth = String(env.FIREBASE_DB_AUTH || '').trim();
  return auth ? `?auth=${encodeURIComponent(auth)}` : '';
}

async function getEdgeMirror(env, forceFresh = false) {
  const now = Date.now();
  if (!forceFresh && mirrorMemoryCache.data && now - mirrorMemoryCache.fetchedAt < MIRROR_MEMORY_TTL_MS) {
    return mirrorMemoryCache.data;
  }

  const baseUrl = normalizeFirebaseBase(env);
  const authQuery = buildFirebaseAuthQuery(env);
  const res = await fetch(`${baseUrl}/edgeMirror.json${authQuery}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || typeof data !== 'object') return null;

  mirrorMemoryCache = { data, fetchedAt: Date.now() };
  return data;
}

async function patchMirrorOrderStatus(env, orderId, newStatus) {
  const baseUrl = normalizeFirebaseBase(env);
  const authQuery = buildFirebaseAuthQuery(env);
  const safeKey = encodeFirebaseKey(orderId);

  if (mirrorMemoryCache.data && mirrorMemoryCache.data.activeOrders && mirrorMemoryCache.data.activeOrders[safeKey]) {
    mirrorMemoryCache.data.activeOrders[safeKey].status = newStatus;
  }

  try {
    await fetch(`${baseUrl}/edgeMirror/activeOrders/${safeKey}.json${authQuery}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, updatedAt: Date.now() }),
    });
  } catch (e) {
    console.warn('patchMirrorOrderStatus error:', e);
  }
}

async function sendLineReply(replyToken, channelToken, messages) {
  if (!replyToken || !channelToken) return { ok: false, error: 'Missing token' };
  const msgArray = Array.isArray(messages)
    ? messages.map((m) => (typeof m === 'string' ? { type: 'text', text: m } : m))
    : [typeof messages === 'string' ? { type: 'text', text: messages } : messages];

  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelToken}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: msgArray.slice(0, 5),
    }),
  });
  return { ok: res.ok, status: res.status };
}

async function sendLinePush(userId, channelToken, messages) {
  if (!userId || !channelToken) return;
  const msgArray = Array.isArray(messages)
    ? messages.map((m) => (typeof m === 'string' ? { type: 'text', text: m } : m))
    : [typeof messages === 'string' ? { type: 'text', text: messages } : messages];

  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelToken}`,
    },
    body: JSON.stringify({
      to: userId,
      messages: msgArray.slice(0, 5),
    }),
  });
}

async function startLineLoading(userId, channelToken, loadingSeconds = 20) {
  if (!userId || !channelToken) return;
  try {
    await fetch('https://api.line.me/v2/bot/chat/loading/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channelToken}`,
      },
      body: JSON.stringify({
        chatId: userId,
        loadingSeconds: Math.min(60, Math.max(5, loadingSeconds)),
      }),
    });
  } catch {}
}

function buildControlMenuFlex(lineUser) {
  const userStatusLine = lineUser
    ? `👤 已綁定：${lineUser.name} (${String(lineUser.role || 'staff').toUpperCase()})`
    : '⚠️ 尚未綁定帳號（請先輸入：#綁定 工號）';

  return {
    type: 'flex',
    altText: '🎛️ ERP 快速控制面板（改單 / 狀態 / 公休 / 刪單）',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0F172A',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: '🎛️ 系統快速控制面板', weight: 'bold', size: 'lg', color: '#FFFFFF' },
          { type: 'text', text: userStatusLine, size: 'xs', color: '#94A3B8', margin: 'xs', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '14px',
        contents: [
          { type: 'text', text: '直接點選下方按鈕操作，免背指令：', size: 'xs', color: '#64748B', margin: 'none' },
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            margin: 'sm',
            contents: [
              {
                type: 'button',
                style: 'primary',
                color: '#2563EB',
                height: 'sm',
                flex: 1,
                action: { type: 'postback', label: '✏️ 修改訂單', data: 'cmd=W_START&op=U&day=T&p=0', displayText: '✏️ 修改訂單' },
              },
              {
                type: 'button',
                style: 'primary',
                color: '#059669',
                height: 'sm',
                flex: 1,
                action: { type: 'postback', label: '📊 更改狀態', data: 'cmd=W_START&op=S&day=T&p=0', displayText: '📊 更改訂單狀態' },
              },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            margin: 'sm',
            contents: [
              {
                type: 'button',
                style: 'primary',
                color: '#D97706',
                height: 'sm',
                flex: 1,
                action: { type: 'postback', label: '🏖️ 設定公休', data: 'cmd=W_START&op=H&p=0', displayText: '🏖️ 設定店家公休' },
              },
              {
                type: 'button',
                style: 'primary',
                color: '#DC2626',
                height: 'sm',
                flex: 1,
                action: { type: 'postback', label: '🗑️ 刪除訂單', data: 'cmd=W_START&op=D&day=T&p=0', displayText: '🗑️ 刪除訂單' },
              },
            ],
          },
          {
            type: 'button',
            style: 'secondary',
            height: 'sm',
            margin: 'sm',
            action: { type: 'postback', label: '📋 查看今日訂單一覽', data: 'cmd=W_TODAY', displayText: '📋 查看今日訂單' },
          },
        ],
      },
    },
  };
}

async function callGasEdgeDispatch(env, data) {
  if (!env.GAS_URL || !env.EDGE_SHARED_SECRET) {
    return { success: false, error: 'Missing GAS_URL or EDGE_SHARED_SECRET' };
  }
  const res = await fetch(env.GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'edgeWebhookDispatch',
      edgeSecret: env.EDGE_SHARED_SECRET,
      data,
    }),
  });
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return json?.data && typeof json.data === 'object' ? { ...json.data, ...json } : json;
  } catch {
    return { success: false, error: text.slice(0, 120) };
  }
}

async function forwardEventToGasWithLoading(event, env) {
  const userId = event?.source?.userId || '';
  if (userId) {
    // 非同步觸發「輸入中」動畫，不阻塞轉發且不消耗 replyToken
    startLineLoading(userId, env.LINE_CHANNEL_ACCESS_TOKEN, 20);
  }
  const res = await callGasEdgeDispatch(env, { op: 'PROXY_EVENT', event });
  if (!res?.success && event?.replyToken && env.LINE_CHANNEL_ACCESS_TOKEN) {
    await sendLineReply(
      event.replyToken,
      env.LINE_CHANNEL_ACCESS_TOKEN,
      '⚠️ 系統處理逾時或設定未完成，請改用底部極速網頁按鈕或稍後重試。'
    );
  }
}

async function handleTodayOrdersEdge(replyToken, userId, env, ctx) {
  const mirror = await getEdgeMirror(env);
  if (!mirror || !mirror.usersByLineId || !mirror.activeOrders) {
    return false; // 鏡像尚未就緒時自動無縫退回 GAS
  }

  const lineUser = mirror.usersByLineId[userId] || null;
  if (!lineUser) {
    await sendLineReply(
      replyToken,
      env.LINE_CHANNEL_ACCESS_TOKEN,
      '🔒 權限驗證失敗：您的 LINE 尚未綁定系統工號。\n請先輸入「#綁定 您的工號」完成綁定（例如：#綁定 staff3）。'
    );
    return true;
  }
  if (!lineUser.isActive) {
    await sendLineReply(replyToken, env.LINE_CHANNEL_ACCESS_TOKEN, `🔒 帳號【${lineUser.name}】目前已停用，無法執行此操作。`);
    return true;
  }

  const todayStr = getTodayStrTaipei();
  const viewAll = canViewAllOrders(lineUser.role);
  const myId = String(lineUser.userId || '').trim();
  const myName = String(lineUser.name || '').trim();

  const orders = Object.values(mirror.activeOrders || {}).filter((o) => {
    if (!o || o.deliveryDate !== todayStr || String(o.status || '').toUpperCase() === 'DELETED') return false;
    if (viewAll) return true;
    const aTo = String(o.assignedTo || '').trim();
    const aName = String(o.assignedName || '').trim();
    return (myId && aTo === myId) || (myName && (aName === myName || aTo === myName));
  });

  if (orders.length === 0) {
    await sendLineReply(replyToken, env.LINE_CHANNEL_ACCESS_TOKEN, `📋 今日 (${todayStr.substring(5)}) 目前尚無有效訂單。`);
  } else {
    const summary = orders
      .slice(0, 15)
      .map((o, i) => {
        const itemsStr = (o.items || []).map((it) => `${it.productName}×${it.quantity}${it.unit || '斤'}`).join('、');
        return `${i + 1}. 【${o.customerName}】${o.trip ? `(${o.trip}) ` : ''}[${getStatusChineseLabel(o.status)}]\n   ${itemsStr}`;
      })
      .join('\n');
    const extra = orders.length > 15 ? `\n...尚有 ${orders.length - 15} 筆，請點擊按鈕分頁檢視。` : '';
    await sendLineReply(
      replyToken,
      env.LINE_CHANNEL_ACCESS_TOKEN,
      `📋【今日訂單總覽】${todayStr}\n共 ${orders.length} 筆\n━━━━━━━━━━━━━━\n${summary}${extra}`
    );
  }

  // 若鏡像超過 5 分鐘未更新，順手在背景叫 GAS 重整一次
  if (!mirror.updatedAt || Date.now() - Number(mirror.updatedAt) > 5 * 60 * 1000) {
    ctx.waitUntil(callGasEdgeDispatch(env, { op: 'REFRESH_MIRROR' }));
  }
  return true;
}

async function handleOptimisticStatusUpdate(event, params, isUndo, env, ctx) {
  const userId = event?.source?.userId || '';
  const replyToken = event?.replyToken || '';
  const orderId = String(params.oid || '').trim();
  const newStatus = String(params.st || '').trim().toUpperCase();
  const validStatuses = ['PENDING', 'SHIPPED', 'PAID', 'PAID_UNSHIPPED', 'CANCELLED'];

  if (!orderId || !validStatuses.includes(newStatus)) return false;

  const mirror = await getEdgeMirror(env);
  if (!mirror || !mirror.usersByLineId || !mirror.activeOrders) return false;

  const lineUser = mirror.usersByLineId[userId] || null;
  if (!lineUser) {
    await sendLineReply(
      replyToken,
      env.LINE_CHANNEL_ACCESS_TOKEN,
      '🔒 權限驗證失敗：您的 LINE 尚未綁定系統工號。\n請先輸入「#綁定 您的工號」完成綁定（例如：#綁定 staff3）。'
    );
    return true;
  }
  if (!lineUser.isActive) {
    await sendLineReply(replyToken, env.LINE_CHANNEL_ACCESS_TOKEN, `🔒 帳號【${lineUser.name}】目前已停用，無法執行此操作。`);
    return true;
  }

  const safeKey = encodeFirebaseKey(orderId);
  const order = mirror.activeOrders[safeKey];
  if (!order) return false; // 可能是較舊日期訂單，轉回 GAS 處理

  if (!canUpdateAnyOrderStatus(lineUser.role)) {
    const myId = String(lineUser.userId || '').trim();
    const myName = String(lineUser.name || '').trim();
    const aTo = String(order.assignedTo || '').trim();
    const aName = String(order.assignedName || '').trim();
    const isMine = (myId && aTo === myId) || (myName && (aName === myName || aTo === myName));
    if (!isMine) {
      await sendLineReply(replyToken, env.LINE_CHANNEL_ACCESS_TOKEN, '🔒 權限不足：您無權變更非指派給您的訂單狀態。');
      return true;
    }
  }

  const prevStatus = String(order.status || 'PENDING').trim().toUpperCase();

  if (isUndo) {
    await sendLineReply(replyToken, env.LINE_CHANNEL_ACCESS_TOKEN, {
      type: 'text',
      text: `↩️ 已復原訂單狀態！\n━━━━━━━━━━━━━━\n🏪 客戶：${order.customerName}\n📊 恢復為：【${getStatusChineseLabel(newStatus)}】\n👤 操作同仁：${lineUser.name}`,
      quickReply: {
        items: [
          {
            type: 'action',
            action: { type: 'postback', label: '🎛️ 返回控制面板', data: 'cmd=SHOW_MENU', displayText: '開啟控制主選單' },
          },
        ],
      },
    });
  } else {
    const undoLabel = `↩️ 復原(${getStatusChineseLabel(prevStatus)})`.substring(0, 20);
    await sendLineReply(replyToken, env.LINE_CHANNEL_ACCESS_TOKEN, {
      type: 'text',
      text: `✅ 訂單狀態已更新！\n━━━━━━━━━━━━━━\n🏪 客戶：${order.customerName}\n📅 日期：${order.deliveryDate}\n📊 狀態：${getStatusChineseLabel(prevStatus)} ➡️【${getStatusChineseLabel(newStatus)}】\n👤 操作同仁：${lineUser.name}`,
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'postback',
              label: undoLabel,
              data: `cmd=W_UNDO_ST&oid=${encodeURIComponent(orderId)}&st=${encodeURIComponent(prevStatus)}`,
              displayText: `↩️ 復原為：${getStatusChineseLabel(prevStatus)}`,
            },
          },
          {
            type: 'action',
            action: { type: 'postback', label: '🎛️ 返回控制面板', data: 'cmd=SHOW_MENU', displayText: '開啟控制主選單' },
          },
        ],
      },
    });
  }

  // 樂觀更新鏡像＋背景寫入 Google Sheets（失敗時自動退回並 Push 提醒）
  ctx.waitUntil(
    (async () => {
      await patchMirrorOrderStatus(env, orderId, newStatus);
      const gasRes = await callGasEdgeDispatch(env, {
        op: 'UPDATE_ORDER_STATUS',
        lineUserId: userId,
        orderId,
        newStatus,
        isUndo,
      });
      if (!gasRes?.success) {
        await patchMirrorOrderStatus(env, orderId, prevStatus);
        await sendLinePush(
          userId,
          env.LINE_CHANNEL_ACCESS_TOKEN,
          `⚠️ 背景寫入試算表失敗（已還原「${order.customerName}」狀態）：${gasRes?.error || '請稍後再試'}`
        );
      }
    })()
  );

  return true;
}

async function processSingleEvent(event, env, ctx) {
  const userId = event?.source?.userId || '';
  const replyToken = event?.replyToken || '';
  const token = env.LINE_CHANNEL_ACCESS_TOKEN;

  if (event.type === 'follow') {
    const mirror = await getEdgeMirror(env);
    const lineUser = mirror?.usersByLineId?.[userId] || null;
    await sendLineReply(replyToken, token, [
      buildControlMenuFlex(lineUser),
      {
        type: 'text',
        text: '👋 歡迎使用製麵廠 ERP 智慧助理！\n您可以直接點選上方按鈕操作，或傳送「#綁定 您的工號」啟用操控與派工通知。',
      },
    ]);
    return;
  }

  if (event.type === 'postback' && event.postback?.data) {
    const params = parsePostbackData(event.postback.data);
    const cmd = String(params.cmd || '').trim();

    if (cmd === 'SHOW_MENU') {
      const mirror = await getEdgeMirror(env);
      const lineUser = mirror?.usersByLineId?.[userId] || null;
      await sendLineReply(replyToken, token, buildControlMenuFlex(lineUser));
      ctx.waitUntil(callGasEdgeDispatch(env, { op: 'CLEAR_WIZARD', lineUserId: userId }));
      return;
    }

    if (cmd === 'W_CANCEL') {
      await sendLineReply(replyToken, token, '❌ 已取消本次操作，您可點選下方按鈕進行其他操作。');
      ctx.waitUntil(callGasEdgeDispatch(env, { op: 'CLEAR_WIZARD', lineUserId: userId }));
      return;
    }

    if (cmd === 'W_TODAY') {
      const handled = await handleTodayOrdersEdge(replyToken, userId, env, ctx);
      if (handled) return;
    }

    if (cmd === 'W_SS' || cmd === 'W_UNDO_ST') {
      const handled = await handleOptimisticStatusUpdate(event, params, cmd === 'W_UNDO_ST', env, ctx);
      if (handled) return;
    }

    ctx.waitUntil(forwardEventToGasWithLoading(event, env));
    return;
  }

  if (event.type === 'message' && event.message?.type === 'text') {
    const text = String(event.message.text || '').trim();

    if (text === '查ID' || text === '我的ID' || text === 'id' || text === 'ID') {
      await sendLineReply(
        replyToken,
        token,
        `您的 LINE User ID 是：\n${userId}\n\n💡 若要綁定系統帳號，請輸入：\n#綁定 您的工號\n（例如：#綁定 staff3）`
      );
      return;
    }

    if (/^(?:🎛️\s*)?(?:選單|主選單|控制|控制主選單|控制面板|操作|面板|按鈕|menu|0)$/i.test(text)) {
      const mirror = await getEdgeMirror(env);
      const lineUser = mirror?.usersByLineId?.[userId] || null;
      await sendLineReply(replyToken, token, buildControlMenuFlex(lineUser));
      ctx.waitUntil(callGasEdgeDispatch(env, { op: 'CLEAR_WIZARD', lineUserId: userId }));
      return;
    }

    if (/^(?:📋\s*)?(?:今日訂單|查看今日訂單)$/.test(text)) {
      const handled = await handleTodayOrdersEdge(replyToken, userId, env, ctx);
      if (handled) return;
    }

    if (text === '說明' || text === '幫助' || text === 'help' || text === '功能' || text === '?') {
      const mirror = await getEdgeMirror(env);
      const lineUser = mirror?.usersByLineId?.[userId] || null;
      const guideText =
        '🤖【系統 LINE 按鈕與指令說明】\n' +
        '━━━━━━━━━━━━━━\n' +
        '💡 免打字操作：輸入「選單」或直接點下方快捷列按鈕，即可用點選完成改單、改狀態、設公休、刪單！\n\n' +
        '⚡ 進階文字指令（#指令 與 口語皆可）：\n' +
        '• #改單 誠石 油麵 30（或 #改單 誠石 +油麵 5）\n' +
        '• #狀態 誠石 已送達（待出貨/已送達/已收款/已取消）\n' +
        '• #公休 鵝肉亭 5/20（或 週日 / 取消 5/20）\n' +
        '• #刪單 誠石 5/30\n' +
        '• 口語：「把誠石今天的油麵改成30斤」\n\n' +
        '🔍 查詢範例：「鵝肉亭今天有營業嗎？」、「誠石 5月貨款是多少？」';
      await sendLineReply(replyToken, token, [buildControlMenuFlex(lineUser), { type: 'text', text: guideText }]);
      return;
    }

    // 其餘文字指令 / 精靈回覆 / Gemini AI 查詢交由 GAS 處理（先觸發免費 Loading 動畫）
    ctx.waitUntil(forwardEventToGasWithLoading(event, env));
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/')) {
      return jsonResponse({
        ok: true,
        service: 'noodle-erp-line-edge',
        hasLineSecret: Boolean(env.LINE_CHANNEL_SECRET),
        hasLineToken: Boolean(env.LINE_CHANNEL_ACCESS_TOKEN),
        hasGasUrl: Boolean(env.GAS_URL),
        hasEdgeSecret: Boolean(env.EDGE_SHARED_SECRET),
        mirrorCachedAt: mirrorMemoryCache.fetchedAt || null,
      });
    }

    if (request.method === 'POST' && url.pathname === '/refresh-mirror') {
      const adminSecret = request.headers.get('x-edge-secret') || url.searchParams.get('secret') || '';
      if (!env.EDGE_SHARED_SECRET || adminSecret !== env.EDGE_SHARED_SECRET) {
        return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      }
      const res = await callGasEdgeDispatch(env, { op: 'REFRESH_MIRROR' });
      mirrorMemoryCache = { data: null, fetchedAt: 0 };
      return jsonResponse(res, res?.success ? 200 : 500);
    }

    if (request.method === 'POST' && (url.pathname === '/' || url.pathname === '/webhook')) {
      const rawBody = await request.text();
      const signature = request.headers.get('x-line-signature') || '';
      const valid = await verifyLineSignature(rawBody, signature, env.LINE_CHANNEL_SECRET);
      if (!valid) {
        return jsonResponse({ error: 'Invalid LINE signature' }, 401);
      }

      let payload = null;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return jsonResponse({ error: 'Invalid JSON' }, 400);
      }

      const events = Array.isArray(payload?.events) ? payload.events : [];
      if (events.length === 0) {
        // LINE Developers Console 點 Verify 時會傳入空 events
        return jsonResponse({ ok: true });
      }

      for (const event of events) {
        if (isDuplicateEvent(event?.webhookEventId)) continue;
        await processSingleEvent(event, env, ctx);
      }

      return new Response('OK', { status: 200 });
    }

    return new Response('Not Found', { status: 404 });
  },
};
