
// @ts-nocheck

const SS = SpreadsheetApp.getActiveSpreadsheet();

let cachedTimeZone = null;

// ==========================================
// 🛡️ RBAC 職位權限矩陣定義 (易於日後增刪維護)
// ==========================================
const PERMISSIONS = {
  admin: {
    canViewAllOrders: true,
    canAssignOrders: true,
    canUpdateAnyOrderStatus: true,
    canDeleteOrders: true,
    canEditOrderContent: true
  },
  manager: {
    canViewAllOrders: true,
    canAssignOrders: true,
    canUpdateAnyOrderStatus: true,
    canDeleteOrders: false,
    canEditOrderContent: true
  },
  staff: {
    canViewAllOrders: false,        // 嚴格限制：只能讀取 assigned_to === 自己的單
    canAssignOrders: false,         // 無權指派
    canUpdateAnyOrderStatus: false, // 只能更新 assigned_to === 自己的單
    canDeleteOrders: false,
    canEditOrderContent: false
  }
};

function hasPermission(role, permKey) {
  const normRole = String(role || 'staff').trim().toLowerCase();
  const perms = PERMISSIONS[normRole] || PERMISSIONS.staff;
  return !!perms[permKey];
}

function safeFormatDate(sheetValue, format = "yyyy-MM-dd HH:mm:ss") {
  if (!sheetValue) return '';
  
  if (sheetValue instanceof Date) {
    const tz = (typeof SS !== 'undefined' && SS) ? SS.getSpreadsheetTimeZone() : "Asia/Taipei";
    return Utilities.formatDate(sheetValue, tz, format);
  }
  
  return String(sheetValue).trim();
}

function normalizeDateStr(rawVal) {
  if (!rawVal) return '';
  const formatted = safeFormatDate(rawVal, "yyyy-MM-dd");
  return formatted.replace(/\//g, '-').slice(0, 10);
}

// 僅寫回實際異動到的連續列區塊，避免每次改狀態就重寫整張 ORDERS 表造成 15~30 秒鎖死與超時
function flushUpdatedRows_(sheet, values, rowNumbers) {
  if (!rowNumbers || rowNumbers.length === 0) return;
  const sorted = Array.from(new Set(rowNumbers)).sort((a, b) => a - b);
  let blockStart = sorted[0];
  let prevRow = sorted[0];
  const writeBlock = (startRow, endRow) => {
    const slice = values.slice(startRow - 1, endRow);
    safeSetValues(sheet, startRow, 1, slice);
  };
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prevRow + 1) {
      prevRow = sorted[i];
    } else {
      writeBlock(blockStart, prevRow);
      blockStart = sorted[i];
      prevRow = sorted[i];
    }
  }
  writeBlock(blockStart, prevRow);
}

function safeFormatTime(timeValue) {
  if (!timeValue) return '';
  if (timeValue instanceof Date) {
    const tz = (typeof SS !== 'undefined' && SS) ? SS.getSpreadsheetTimeZone() : "Asia/Taipei";
    return Utilities.formatDate(timeValue, tz, "HH:mm");
  }
  const str = String(timeValue).trim();
  // 處理如果已經被轉成 Date 字串格式 (例如含有 GMT 或 1899)
  if (str.includes("GMT") || str.includes("1899") || str.includes("T")) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const tz = (typeof SS !== 'undefined' && SS) ? SS.getSpreadsheetTimeZone() : "Asia/Taipei";
      return Utilities.formatDate(d, tz, "HH:mm");
    }
  }
  return str;
}

// 👇 新增這個輔助函數：用來將試算表的 Date 物件格式化為乾淨的字串
// Helper to ensure Config sheet exists and return it
function getConfigSheet() {
  let sheet = SS.getSheetByName("Config");
  if (!sheet) {
    sheet = SS.insertSheet("Config");
    sheet.getRange("A1").setValue("SystemPassword");
    sheet.getRange("B1").setNumberFormat("@").setValue("8888"); 
  }
  return sheet;
}

function getSystemConfig(sheet, keyName) {
  const values = sheet.getDataRange().getValues();
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === keyName) {
      return values[i][1];
    }
  }
  return null;
}

function setSystemConfig(sheet, keyName, value) {
  const values = sheet.getDataRange().getValues();
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === keyName) {
      sheet.getRange(i + 1, 2).setValue(value);
      SpreadsheetApp.flush();
      return;
    }
  }
  // If not found, append to end
  const lastRow = Math.max(sheet.getLastRow(), 1);
  sheet.getRange(lastRow + 1, 1).setValue(keyName);
  sheet.getRange(lastRow + 1, 2).setValue(value);
  SpreadsheetApp.flush();
}

// Helper to get fresh references (avoiding top-level const caching issues)
function getSheets() {
  return {
    ORDERS: SS.getSheetByName("Orders") || SS.getSheetByName("ORDERS") || SS.insertSheet("Orders"),
    CUSTOMERS: SS.getSheetByName("Customers") || SS.getSheetByName("CUSTOMERS") || SS.insertSheet("Customers"),
    PRODUCTS: SS.getSheetByName("Products") || SS.getSheetByName("PRODUCTS") || SS.insertSheet("Products"),
    TRIPS: SS.getSheetByName("Trips") || SS.getSheetByName("TRIPS") || SS.insertSheet("Trips"),
    CONFIG: getConfigSheet() // Use the helper
  };
}

function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};

    // 輕量心跳偵測 (Ping)：不查詢試算表亦不洩漏任何業務資料
    if (params.action === "ping") {
      return ContentService.createTextOutput(JSON.stringify({ success: true, ping: "pong" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const token = params.token;
    
    // 嚴格驗證 Token (使用伺服器獨立 256-bit 高強度密鑰)
    const tokenPayload = verifyTokenAndGetPayload(token);
    if (!tokenPayload) {
      writeSystemLog("SYSTEM_UNAUTHORIZED_ACCESS", "未授權的 GET 資料查詢", JSON.stringify({ tokenProvided: !!token }));
      return ContentService.createTextOutput(JSON.stringify({ 
        success: false, 
        error: "UNAUTHORIZED_OR_EXPIRED" 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const startDateStr = params.startDate;
    const since = Number(params.since) || 0;
    const data = getData(startDateStr, since, tokenPayload);
    return ContentService.createTextOutput(JSON.stringify({ success: true, data: data }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.message || String(error),
      stack: error.stack
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    
    if (params.events && Array.isArray(params.events)) {
      return handleLineWebhook(params);
    }
    
    const action = params.action;
    let tokenPayload = null;
    
    // 【核心防護】除了 login / liffLogin / edgeWebhookDispatch 以外的所有操作，全部要驗證 Token
    if (action !== "login" && action !== "liffLogin" && action !== "edgeWebhookDispatch") {
      tokenPayload = verifyTokenAndGetPayload(params.token);
      if (!tokenPayload) {
        // 優化：背景 checkUpdates 的過期視為正常 Session 結束，不寫入紅色 SYSTEM_UNAUTHORIZED_ACCESS
        if (action !== "checkUpdates") {
          writeSystemLog("SYSTEM_UNAUTHORIZED_ACCESS", "未授權的 API 調用", JSON.stringify({ action: action, tokenProvided: !!params.token }));
        }
        return ContentService.createTextOutput(JSON.stringify({ 
          success: false, 
          error: "UNAUTHORIZED_OR_EXPIRED" 
        })).setMimeType(ContentService.MimeType.JSON);
      }
      
      const userRole = String(tokenPayload.role || 'staff').trim().toLowerCase();

      // 🛡️ 1. 基於 PERMISSIONS 權限矩陣的細粒度動作阻擋
      if (action === "deleteOrder" && !hasPermission(userRole, "canDeleteOrders")) {
        writeSystemLog("SYSTEM_FORBIDDEN", "越權刪除訂單阻擋", JSON.stringify({ action, employee: tokenPayload.name }));
        return ContentService.createTextOutput(JSON.stringify({ 
          success: false, 
          error: "FORBIDDEN_ACTION: 權限不足，您無權刪除訂單" 
        })).setMimeType(ContentService.MimeType.JSON);
      }

      if (action === "updateOrderContent" && !hasPermission(userRole, "canEditOrderContent")) {
        writeSystemLog("SYSTEM_FORBIDDEN", "越權修改訂單內容阻擋", JSON.stringify({ action, employee: tokenPayload.name }));
        return ContentService.createTextOutput(JSON.stringify({ 
          success: false, 
          error: "FORBIDDEN_ACTION: 權限不足，您無權修改訂單內容" 
        })).setMimeType(ContentService.MimeType.JSON);
      }

      if (action === "assignOrder" && !hasPermission(userRole, "canAssignOrders")) {
        writeSystemLog("SYSTEM_FORBIDDEN", "越權派工指派阻擋", JSON.stringify({ action, employee: tokenPayload.name }));
        return ContentService.createTextOutput(JSON.stringify({ 
          success: false, 
          error: "FORBIDDEN_ACTION: 權限不足，您無權執行派工指派" 
        })).setMimeType(ContentService.MimeType.JSON);
      }

      const adminOnlyActions = ["saveSettings", "deleteCustomer", "deleteProduct", "changePassword", "getSystemLogs", "setupLineRichMenu", "saveEdgeConfig", "getEdgeConfigStatus", "syncEdgeMirror"];
      if (userRole === "staff" && adminOnlyActions.includes(action)) {
        writeSystemLog("SYSTEM_FORBIDDEN", "越權管理員操作阻擋", JSON.stringify({ action: action, employee: tokenPayload.name }));
        return ContentService.createTextOutput(JSON.stringify({ 
          success: false, 
          error: "FORBIDDEN_ACTION: 僅限管理員執行此項操作" 
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    let result = null;

    switch (action) {
      case "login":
        result = login(params.data);
        break;
      case "liffLogin":
        result = liffLogin(params.data || params);
        break;
      case "bindLiffAccount":
        result = handleBindLiffAccount(params.data || params, tokenPayload);
        break;
      case "edgeWebhookDispatch":
        result = handleEdgeWebhookDispatch(params);
        break;
      case "saveEdgeConfig":
        result = handleSaveEdgeConfig(params.data || params, tokenPayload);
        break;
      case "getEdgeConfigStatus":
        result = handleGetEdgeConfigStatus(tokenPayload);
        break;
      case "syncEdgeMirror":
        result = handleSyncEdgeMirrorAction(tokenPayload);
        break;
      case "changePassword":
        result = changePassword(params.data);
        break;
      case "createOrder":
        result = createOrder(params.data);
        writeSystemLog("CREATE_ORDER", params.data.customerName || "未知", JSON.stringify({
          operator: tokenPayload ? tokenPayload.name : '未知',
          role: tokenPayload ? tokenPayload.role : '',
          source: params.data.source || '',
          items: params.data.items,
          payload: params.data
        }));
        break;
      case "updateOrderContent":
        result = updateOrderContent(params.data);
        writeSystemLog("UPDATE_ORDER", params.data.customerName || "未知", JSON.stringify({
          operator: tokenPayload ? tokenPayload.name : '未知',
          role: tokenPayload ? tokenPayload.role : '',
          diff: params.data
        }));
        break;
      case "updateOrderStatus":
        result = updateOrderStatus(params.data, tokenPayload);
        writeSystemLog(
          "UPDATE_ORDER_STATUS",
          `${(result && result.customerName) || params.data?.customerName || '訂單'} (${params.data?.id || ''})`,
          JSON.stringify({
            operator: tokenPayload ? tokenPayload.name : '未知',
            role: tokenPayload ? tokenPayload.role : '',
            source: params.data?.source || '',
            updates: [{
              id: params.data?.id,
              customerName: (result && result.customerName) || params.data?.customerName || '',
              deliveryDate: (result && result.deliveryDate) || params.data?.deliveryDate || '',
              originalStatus: result && result.prevStatus,
              status: params.data?.status
            }]
          })
        );
        break;
      case "assignOrder":
        result = assignOrder(params.data || params, tokenPayload);
        writeSystemLog("ASSIGN_ORDER", `訂單: ${params.data?.id || params.data?.orderId || params.orderId || params.id}`, JSON.stringify({
          assignedTo: params.data?.targetUserId || params.data?.assignedTo || params.targetUserId,
          assignedName: params.data?.targetUserName || params.data?.assignedName || params.targetUserName,
          operator: tokenPayload ? tokenPayload.name : '未知'
        }));
        break;
      case "getOrders":
        result = handleGetOrders(tokenPayload);
        break;
      case "getStaffList":
        result = handleGetStaffList(tokenPayload);
        break;
      case "getAllUsers":
        result = handleGetAllUsers(tokenPayload);
        break;
      case "saveUser":
        result = handleSaveUser(params.data || params, tokenPayload);
        break;
      case "savePermissionMatrix":
        result = handleSavePermissionMatrix(params.data || params, tokenPayload);
        break;
      case "sendStaffDispatchNotification":
        result = handleSendStaffDispatchNotification(params.data || params, tokenPayload);
        break;
      case "batchUpdateOrders": {
        result = batchUpdateOrders(params.data, tokenPayload);
        const summaries = (result && Array.isArray(result.logSummaries)) ? result.logSummaries : [];
        if (summaries.length > 0) {
          const isSingle = summaries.length === 1;
          const firstSum = summaries[0];
          writeSystemLog(
            isSingle ? "UPDATE_ORDER_STATUS" : "UPDATE_ORDER_BATCH",
            isSingle ? `${firstSum.customerName || '訂單'} (${firstSum.id})` : `批次更新 ${summaries.length} 筆訂單狀態`,
            JSON.stringify({
              operator: tokenPayload ? tokenPayload.name : '未知',
              role: tokenPayload ? tokenPayload.role : '',
              updates: summaries
            })
          );
        }
        break;
      }
      case "batchUpdatePaymentStatus": {
        result = batchUpdatePaymentStatus(params.data);
        const paySummaries = (result && Array.isArray(result.logSummaries)) ? result.logSummaries : [];
        if (paySummaries.length > 0) {
          writeSystemLog(
            "UPDATE_ORDER_BATCH",
            paySummaries.length === 1 ? `${paySummaries[0].customerName || '訂單'} (${paySummaries[0].id})` : `批次結帳 ${paySummaries.length} 筆訂單`,
            JSON.stringify({
              operator: tokenPayload ? tokenPayload.name : '未知',
              role: tokenPayload ? tokenPayload.role : '',
              updates: paySummaries
            })
          );
        }
        break;
      }
      case "deleteOrder": {
        result = deleteOrder(params.data);
        const delCustomer = (result && result.customerName) || params.data.customerName || "";
        const delOrderId = params.data.id || params.data.orderId || "未知";
        const delTargetLabel = delCustomer && delCustomer !== "未知店家"
          ? `${delCustomer} (Order ID: ${delOrderId})`
          : `Order ID: ${delOrderId}`;
        writeSystemLog("DELETE_ORDER", delTargetLabel, JSON.stringify({
          operator: tokenPayload ? tokenPayload.name : '未知',
          role: tokenPayload ? tokenPayload.role : '',
          source: params.data.source || '',
          deletedId: delOrderId,
          deletedName: delCustomer || "未知店家",
          deletedDate: (result && result.deliveryDate) || params.data.deliveryDate || "",
          deletedItems: (result && Array.isArray(result.items) && result.items.length > 0)
            ? result.items
            : (Array.isArray(params.data.items) ? params.data.items : [])
        }));
        break;
      }
      case "batchDeleteOrders":
        result = handleBatchDeleteOrders(params.data || params, tokenPayload);
        break;
      case "reorderProducts":
        result = reorderProducts(params.data);
        writeSystemLog("UPDATE_PRODUCT_ORDER", "商品列表", JSON.stringify({ updatedCount: (params.data.products || []).length }));
        break;
      case "updateCustomer":
        result = updateCustomer(params.data);
        writeSystemLog("UPDATE_CUSTOMER", params.data.name || "未知", JSON.stringify({
          operator: tokenPayload ? tokenPayload.name : '未知',
          role: tokenPayload ? tokenPayload.role : '',
          data: params.data
        }));
        break;
      case "deleteCustomer": {
        let custSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CUSTOMERS") || SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Customers");
        if (!custSheet) {
          return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "找不到工作表" })).setMimeType(ContentService.MimeType.JSON);
        }
        var targetId = params.data.id;
        var sheetData = custSheet.getDataRange().getValues();
        var deleted = false;
        for (var i = 1; i < sheetData.length; i++) {
          if (String(sheetData[i][0]) === String(targetId)) {
            custSheet.deleteRow(i + 1);
            deleted = true;
            break;
          }
        }
        if (deleted) {
          try { CacheService.getScriptCache().remove("APP_CACHE_CPT"); } catch (err) {}
          writeSystemLog("DELETE_CUSTOMER", "Customer ID: " + (targetId || "未知"), JSON.stringify({
            operator: tokenPayload ? tokenPayload.name : '未知',
            deletedId: targetId,
            deletedName: params.data.name || "未知店家"
          }));
          return ContentService.createTextOutput(JSON.stringify({ success: true, status: "success" })).setMimeType(ContentService.MimeType.JSON);
        } else {
          return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "找不到指定的客戶" })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      case "updateProduct":
        result = updateProduct(params.data);
        writeSystemLog("UPDATE_PRODUCT", params.data.name || "未知", JSON.stringify({
          operator: tokenPayload ? tokenPayload.name : '未知',
          data: params.data
        }));
        break;
      case "deleteProduct":
        result = deleteProduct(params.data);
        writeSystemLog("DELETE_PRODUCT", `Product ID: ${params.data.id || "未知"}`, JSON.stringify({
          operator: tokenPayload ? tokenPayload.name : '未知',
          deletedId: params.data.id,
          deletedName: params.data.name || "未知商品"
        }));
        break;
      case "checkUpdates":
        result = checkUpdates(params.data, tokenPayload);
        break;
      case "getOrder":
        result = getOrder(params.data);
        break;
      case "saveTrips":
        result = saveTrips(params.data);
        writeSystemLog("UPDATE_TRIPS", "車趟清單", JSON.stringify({
          operator: tokenPayload ? tokenPayload.name : '未知',
          count: (params.data.trips || []).length,
          trips: params.data.trips || []
        }));
        break;
      case "saveSettings":
        result = saveSettings(params.data);
        writeSystemLog("UPDATE_SETTINGS", "APP 設定/提醒規則", JSON.stringify({
          operator: tokenPayload ? tokenPayload.name : '未知',
          data: params.data
        }));
        break;
      case "testLineMessage":
        result = testLineMessage(params.data);
        writeSystemLog("SYSTEM_TEST_MSG", "LINE Notify", JSON.stringify({
          operator: tokenPayload ? tokenPayload.name : '未知',
          msg: "Triggered test message"
        }));
        break;
      case "setupLineRichMenu":
        result = handleSetupLineRichMenu(params.data || params, tokenPayload);
        writeSystemLog("SETUP_LINE_RICHMENU", "LINE 圖文選單", JSON.stringify({ operator: tokenPayload ? tokenPayload.name : '未知', success: !!(result && result.success) }));
        break;
      case "testRule":
        result = checkReminders(params.data.ruleId);
        writeSystemLog("SYSTEM_TEST_RULE", `Rule ID: ${params.data.ruleId}`, JSON.stringify({
          operator: tokenPayload ? tokenPayload.name : '未知',
          ruleId: params.data.ruleId,
          action: "testRule"
        }));
        break;
      case "dryRunRule":
        result = checkReminders(params.data.ruleId, true);
        break;
      case "dryRunBriefing":
        result = runDailyBriefingCheck(true, true, params.data?.briefing || null);
        break;
      case "sendBriefingNow":
        result = runDailyBriefingCheck(false, true, params.data?.briefing || null);
        writeSystemLog("SEND_DAILY_BRIEFING", "手動發送每日出車簡報", JSON.stringify({
          operator: tokenPayload ? tokenPayload.name : '未知',
          action: "sendBriefingNow"
        }));
        break;
      case "getNotificationLogs":
        result = getNotificationLogs();
        break;
      case "getSystemLogs":
        result = getSystemLogs(params.data || {});
        break;
      case "triggerAutoOrders":
        result = generateTomorrowDefaultOrders(params.data?.dates);
        writeSystemLog("TRIGGER_AUTO_ORDERS", "觸發自動建單", JSON.stringify({
          operator: tokenPayload ? tokenPayload.name : '系統排程',
          result: result
        }));
        break;
      case "syncLineOrders":
        result = syncLineOrders();
        writeSystemLog("SYNC_LINE_ORDERS", "同步 LINE 訂單", JSON.stringify({
          operator: tokenPayload ? tokenPayload.name : '系統',
          result: result
        }));
        break;
      case "backfillMissingOrderPrices":
        result = backfillMissingOrderPrices();
        writeSystemLog("BACKFILL_ORDER_PRICES", "補齊訂單單價小計", JSON.stringify({
          operator: tokenPayload ? tokenPayload.name : '管理員',
          result: result
        }));
        break;
      default:
        throw new Error("Unknown action: " + action);
    }
    
    // Invalidate Cache for entities that don't change often but changed now
    if (["reorderProducts", "updateCustomer", "deleteCustomer", "updateProduct", "deleteProduct", "saveTrips"].includes(action)) {
      try { CacheService.getScriptCache().remove("APP_CACHE_CPT"); } catch (err) {}
    }

    const mutationActions = [
      "changePassword", "createOrder", "updateOrderContent", "updateOrderStatus",
      "batchUpdateOrders", "batchUpdatePaymentStatus", "deleteOrder", "batchDeleteOrders",
      "assignOrder", "saveUser", "bindLiffAccount",
      "reorderProducts", "updateCustomer", "deleteCustomer", 
      "updateProduct", "deleteProduct", "saveTrips", "saveSettings",
      "triggerAutoOrders"
    ];
    if (mutationActions.includes(action)) {
      updateGlobalTimestamp();
    }

    const unneededNotifyActions = [
      "login", "liffLogin", "edgeWebhookDispatch", "saveEdgeConfig", "getEdgeConfigStatus", "syncEdgeMirror",
      "checkUpdates", "getOrder", "testLineMessage", "dryRunRule", "getNotificationLogs", "getSystemLogs"
    ];
    if (!unneededNotifyActions.includes(action)) {
      SpreadsheetApp.flush(); // 先強制寫入 Sheets 再觸發 Firebase 推播，避免前端搶先抓到舊快照
      notifyFirebase({ action: action });
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true, data: result }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log("Error in doPost: " + error.toString());
    // 如果是版本衝突，回傳指定的格式
    const isConflict = error.toString().includes("ERR_VERSION_CONFLICT");
    if (isConflict) {
      return ContentService.createTextOutput(JSON.stringify({ 
        success: false, 
        error: "VERSION_CONFLICT",
        message: "此訂單已被其他設備更新，請重新整理頁面。",
        errorCode: "VERSION_CONFLICT"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      error: error.toString(),
      errorCode: "UNKNOWN_ERROR"
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    SpreadsheetApp.flush(); // 強制將快取變更寫入 Sheets，確保後續 Lock 拿到最新資料
  }
}

// --- Logic Functions ---

function updateGlobalTimestamp() {
  try {
    let metaSheet = SS.getSheetByName("SystemMeta");
    if (!metaSheet) {
      metaSheet = SS.insertSheet("SystemMeta");
      metaSheet.hideSheet();
      metaSheet.getRange("A1").setValue("LastGlobalUpdate");
    }
    metaSheet.getRange("B1").setValue(new Date().getTime());
  } catch (e) {
    console.error("updateGlobalTimestamp error: ", e);
  }
}

function checkUpdates(data, currentUser = null) {
  // 新增審計日誌攔截 (只有前端帶 auditObj 時才寫入)
  if (data && data.auditObj) {
    writeSystemLog("SYSTEM_DATA_ACCESS", "資料手動同步與檢視", JSON.stringify({
      operator: currentUser ? currentUser.name : '',
      role: currentUser ? currentUser.role : '',
      deviceId: data.auditObj.deviceId || "未知",
      method: data.auditObj.isManual ? "手動重整" : "初次載入",
      userAgent: data.auditObj.userAgent
    }));
  }
  
  const metaSheet = SS.getSheetByName("SystemMeta");
  const lastGlobalTs = metaSheet ? Number(metaSheet.getRange("B1").getValue()) : 0; 
  return { globalLastUpdated: lastGlobalTs || 0 };
}

function getOrder(data) {
  const orderId = data.id;
  if (!orderId) throw new Error("Missing order ID");
  
  const sheets = getSheets();
  const sheet = sheets.ORDERS;
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0];
  
  let orderRows = [];
  for (let i = 1; i < values.length; i++) {
    const rowId = String(values[i][1]).trim();
    if (rowId === String(orderId).trim()) {
      let obj = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = values[i][j];
      }
      orderRows.push(obj);
    }
  }
  
  if (orderRows.length === 0) return null;
  
  const firstRow = orderRows[0];
  const order = {
    id: firstRow.ID || firstRow.id || firstRow["Order ID"] || firstRow.訂單ID,
    createdAt: firstRow.CreatedAt || firstRow.createdAt || firstRow.建立時間,
    customerName: firstRow.CustomerName || firstRow.customerName || firstRow.客戶名,
    deliveryDate: firstRow.DeliveryDate || firstRow.deliveryDate || firstRow.配送日期,
    deliveryTime: firstRow.DeliveryTime || firstRow.deliveryTime || firstRow.配送時間,
    note: firstRow.Note || firstRow.note || firstRow.備註,
    status: firstRow.Status || firstRow.status || firstRow.狀態,
    deliveryMethod: firstRow.DeliveryMethod || firstRow.deliveryMethod || firstRow.配送方式,
    lastUpdated: parseLastUpdated(firstRow.LastUpdated),
    version: Number(firstRow.Version || 0),
    trip: firstRow.Trip || firstRow.trip || firstRow.趟次 || '',
    items: orderRows.map(r => ({
      productId: r.ProductName || r.productName || r.品項,
      quantity: r.Quantity || r.quantity || r.數量,
      unit: r.Unit || r.unit || r.單位
    }))
  };
  
  return order;
}

function login(data) {
  const dId = String(data.deviceId || "未知裝置").trim();
  const uAgent = String(data.userAgent || "未知環境").trim();
  const inputUsername = String(data.username || "").trim();
  const inputPassword = String(data.password || "").trim();
  const cache = CacheService.getScriptCache();

  // 1. 優先檢查 Users 表 (帳密 + 鹽值雜湊驗證，支援中英文欄位)
  const usersSheet = SS.getSheetByName("Users") || SS.getSheetByName("USERS") || SS.getSheetByName("使用者");
  if (usersSheet && usersSheet.getLastRow() > 1) {
    const values = usersSheet.getDataRange().getValues();
    const headers = values[0];
    const idIdx = findHeaderIndex(headers, ["user_id", "userid", "id", "使用者id", "工號", "編號", "代號"]);
    const userIdx = findHeaderIndex(headers, ["username", "user", "帳號", "登入帳號", "使用者名稱"]);
    const hashIdx = findHeaderIndex(headers, ["password_hash", "hash", "password", "密碼雜湊", "密碼hash", "密碼"]);
    const saltIdx = findHeaderIndex(headers, ["salt", "鹽值", "鹽", "密鑰"]);
    const roleIdx = findHeaderIndex(headers, ["role", "職位", "角色", "職務", "職級", "職位角色"]);
    const statusIdx = findHeaderIndex(headers, ["status", "狀態", "帳號狀態", "啟用狀態"]);
    const nameIdx = findHeaderIndex(headers, ["name", "display_name", "displayname", "姓名", "顯示姓名", "同仁姓名", "員工姓名"]);

    if (hashIdx !== -1 && (userIdx !== -1 || idIdx !== -1 || nameIdx !== -1)) {
      for (let i = 1; i < values.length; i++) {
        const row = values[i];
        const rowId = idIdx !== -1 ? String(row[idIdx] || '').trim() : '';
        const rowUsername = userIdx !== -1 ? String(row[userIdx] || '').trim() : '';
        const rowName = nameIdx !== -1 ? String(row[nameIdx] || '').trim() : '';
        
        // 寬容且精準比對：帳號、工號、顯示名稱任一吻合均可；若未輸入帳號（例如司機快捷 PIN）則比對密碼
        const normInput = inputUsername.toLowerCase();
        const matchUser = !inputUsername || 
          (rowUsername && rowUsername.toLowerCase() === normInput) ||
          (rowId && rowId.toLowerCase() === normInput) ||
          (rowName && rowName.toLowerCase() === normInput);

        if (matchUser) {
          const salt = saltIdx !== -1 ? String(row[saltIdx] || '').trim() : '';
          const expectedHash = String(row[hashIdx] || '').trim();
          
          // 支援三種情況：
          // 1. 鹽值雜湊 (SHA-256 with salt)
          // 2. 明文密碼 (例如管理員在試算表直接手動輸入 123456)
          // 3. 無鹽雜湊 (SHA-256 without salt)
          const computedHash = salt ? hashPassword(inputPassword, salt) : '';
          const computedNoSalt = hashPassword(inputPassword, '');
          
          const isPasswordValid = (computedHash && computedHash === expectedHash) ||
                                  (expectedHash === inputPassword) ||
                                  (computedNoSalt === expectedHash);

          if (expectedHash && isPasswordValid) {
            const status = statusIdx !== -1 ? String(row[statusIdx] || '').trim().toUpperCase() : 'ACTIVE';
            if (status !== 'ACTIVE' && status !== 'TRUE' && status !== '') {
              return { success: false, error: "此帳號已被停用，請聯絡管理員" };
            }

            // 若原本是明文，自動升級為加鹽雜湊以保障安全性
            if (expectedHash === inputPassword && saltIdx !== -1) {
              try {
                const autoSalt = Utilities.getUuid().substring(0, 8);
                const autoHash = hashPassword(inputPassword, autoSalt);
                usersSheet.getRange(i + 1, hashIdx + 1).setValue(autoHash);
                usersSheet.getRange(i + 1, saltIdx + 1).setValue(autoSalt);
              } catch(e) {}
            }

            const failKey = "LOGIN_FAIL_" + encodeURIComponent(dId.slice(0, 60));
            cache.remove(failKey);

            const userId = rowId || rowUsername || `U${i}`;
            const role = roleIdx !== -1 && String(row[roleIdx] || '').trim() ? String(row[roleIdx]).trim().toLowerCase() : 'staff';
            const name = rowName || rowUsername || rowId || '員工';
            const finalUsername = rowUsername || rowId || name;

            const payload = { userId, username: finalUsername, name, role, dId };
            const token = generateToken(payload);
            writeSystemLog("SYSTEM_LOGIN_SUCCESS", "Users表登入", JSON.stringify({ userId, username: finalUsername, role, name, deviceId: dId }));
            return { success: true, token, user: payload, role, name, userId };
          }
        }
      }
    }
  }

  // 2. 取得資料庫密碼進行驗證 (相容既有 PIN / SuperAdmin)
  const sheet = getConfigSheet();
  let dbPassword = sheet.getRange("B1").getDisplayValue().trim() || "8888";

  // 檢查是否為員工 PIN 碼
  let matchedUser = null;
  const accountsSheet = SS.getSheetByName("ACCOUNTS");
  if (accountsSheet) {
    const accounts = getSheetData(accountsSheet);
    matchedUser = accounts.find(a => String(a.PIN) === inputPassword && String(a.IsActive).toUpperCase() === "TRUE");
  }

  const isSuperAdmin = (inputPassword === dbPassword);
  const isCorrect = (matchedUser !== null && matchedUser !== undefined) || isSuperAdmin;

  // ==========================================
  // 核心原則 1：手持正確密碼者，永遠 100% 立即放行！
  // ==========================================
  if (isCorrect) {
    const failKey = "LOGIN_FAIL_" + encodeURIComponent(dId.slice(0, 60));
    cache.remove(failKey); // 驗證成功，清除該裝置的失敗紀錄

    if (matchedUser) {
      const role = matchedUser.Role || "staff";
      const name = matchedUser.Name || "員工";
      const userId = matchedUser.ID || matchedUser.id || ('U_' + name);
      const payload = { userId, username: name, name, role, dId };
      const token = generateToken(payload);
      writeSystemLog("SYSTEM_LOGIN_SUCCESS", "員工登入", JSON.stringify({ name: name, role: role, deviceId: dId, userAgent: uAgent }));
      return { success: true, token: token, user: payload, role: role, name: name, userId };
    } else {
      const payload = { userId: "admin", username: "admin", name: "系統管理員", role: "admin", dId };
      const token = generateToken(payload);
      writeSystemLog("SYSTEM_LOGIN_SUCCESS", "系統管理員登入", JSON.stringify({ deviceId: dId, userAgent: uAgent }));
      return { success: true, token: token, user: payload, role: "admin", name: "系統管理員", userId: "admin" };
    }
  }

  // ==========================================
  // 核心原則 2：若密碼錯誤，啟動焦油坑延遲與單機限流
  // ==========================================
  const failKey = "LOGIN_FAIL_" + encodeURIComponent(dId.slice(0, 60));
  const failCount = Number(cache.get(failKey)) || 0;
  const newFailCount = failCount + 1;
  cache.put(failKey, String(newFailCount), 900); // 鎖定/保留 15 分鐘
  Utilities.sleep(2500);

  const remaining = Math.max(0, 5 - newFailCount);
  writeSystemLog("SYSTEM_LOGIN_FAILED", "系統登入失敗", JSON.stringify({ 
    deviceId: dId, 
    userAgent: uAgent, 
    failCount: newFailCount,
    remainingAttempts: remaining
  }));

  const errorMsg = remaining > 0 
    ? `無效的帳號密碼或 PIN 碼 (剩餘嘗試次數: ${remaining})`
    : "密碼錯誤次數過多，該裝置已暫時鎖定 15 分鐘，請稍後再試。";
  return { success: false, error: errorMsg };
}

/**
 * 透過 LINE 官方驗簽 API 驗證 LIFF 傳來的 idToken 或 accessToken，取得真實 LINE User ID
 */
function verifyLineLiffIdentity(data) {
  const payloadData = data || {};
  const idToken = String(payloadData.idToken || payloadData.id_token || '').trim();
  const accessToken = String(payloadData.accessToken || payloadData.access_token || '').trim();
  let liffId = String(payloadData.liffId || payloadData.liff_id || '').trim();
  let clientId = String(payloadData.clientId || payloadData.client_id || '').trim();

  if (!clientId || !liffId) {
    try {
      const settingsStr = getSystemConfig(getConfigSheet(), "AppSettings");
      if (settingsStr) {
        const settings = JSON.parse(settingsStr) || {};
        if (!liffId && settings.lineLiffId) liffId = String(settings.lineLiffId).trim();
        if (!clientId && settings.lineLoginChannelId) clientId = String(settings.lineLoginChannelId).trim();
      }
    } catch (e) {}
  }
  if (!clientId && liffId && liffId.indexOf('-') !== -1) {
    clientId = liffId.split('-')[0].trim();
  }

  // 1. 優先以 OIDC id_token + LINE Login Channel ID 驗簽
  if (idToken && clientId) {
    try {
      const verifyRes = UrlFetchApp.fetch("https://api.line.me/oauth2/v2.1/verify", {
        method: "post",
        payload: {
          id_token: idToken,
          client_id: clientId
        },
        muteHttpExceptions: true
      });
      if (verifyRes.getResponseCode() === 200) {
        const verified = JSON.parse(verifyRes.getContentText() || "{}");
        if (verified.sub) {
          return {
            success: true,
            lineUserId: String(verified.sub).trim(),
            displayName: String(verified.name || '').trim()
          };
        }
      }
    } catch (e) {
      console.warn("LIFF id_token verify failed:", e);
    }
  }

  // 2. 備援：以 accessToken 呼叫 LINE Profile API（即使未勾選 openid scope 也能驗證身分）
  if (accessToken) {
    try {
      const profileRes = UrlFetchApp.fetch("https://api.line.me/v2/profile", {
        method: "get",
        headers: { "Authorization": "Bearer " + accessToken },
        muteHttpExceptions: true
      });
      if (profileRes.getResponseCode() === 200) {
        const prof = JSON.parse(profileRes.getContentText() || "{}");
        if (prof.userId) {
          return {
            success: true,
            lineUserId: String(prof.userId).trim(),
            displayName: String(prof.displayName || '').trim()
          };
        }
      }
    } catch (e) {
      console.warn("LIFF profile verify failed:", e);
    }
  }

  return { success: false, error: "LINE 憑證無效或已過期，請重新由 LINE 聊天室開啟" };
}

/**
 * LIFF 免密換票登入：依已綁定之 LINE User ID 簽發正式系統 JWT Token 與權限角色
 */
function liffLogin(data) {
  const verified = verifyLineLiffIdentity(data);
  if (!verified.success || !verified.lineUserId) {
    return { success: false, error: verified.error || "LINE 身分驗證失敗" };
  }

  const lineUser = getUserByLineId(verified.lineUserId);
  if (!lineUser) {
    return {
      success: false,
      errorCode: "LINE_NOT_BOUND",
      lineUserId: verified.lineUserId,
      lineDisplayName: verified.displayName || '',
      error: "此 LINE 帳號尚未綁定系統人員，請輸入系統帳號或 PIN 碼完成一次綁定"
    };
  }

  const dId = String((data && data.deviceId) || "LIFF_WEBVIEW").trim();
  const payload = {
    userId: lineUser.userId,
    username: lineUser.username || lineUser.userId,
    name: lineUser.name || verified.displayName || lineUser.userId,
    role: lineUser.role || 'staff',
    dId: dId
  };
  const token = generateToken(payload);
  writeSystemLog("SYSTEM_LIFF_LOGIN", "LIFF 自動登入", JSON.stringify({
    userId: payload.userId,
    name: payload.name,
    role: payload.role,
    lineUserId: verified.lineUserId
  }));
  return {
    success: true,
    token: token,
    user: payload,
    role: payload.role,
    name: payload.name,
    userId: payload.userId
  };
}

/**
 * 已登入使用者從 LIFF 頁面一鍵綁定目前 LINE 帳號
 */
function handleBindLiffAccount(data, tokenPayload) {
  if (!tokenPayload || !tokenPayload.userId) {
    return { success: false, error: "UNAUTHORIZED" };
  }
  const verified = verifyLineLiffIdentity(data);
  if (!verified.success || !verified.lineUserId) {
    return { success: false, error: verified.error || "無法驗證 LINE 身分" };
  }
  const bindRes = handleLineSelfBind(verified.lineUserId, tokenPayload.userId);
  if (bindRes && bindRes.success) {
    writeSystemLog("LINE_SELF_BIND_LIFF", tokenPayload.name || tokenPayload.userId, JSON.stringify({
      userId: tokenPayload.userId,
      lineUserId: verified.lineUserId
    }));
  }
  return bindRes;
}

/**
 * 管理員應急重置登入鎖定 (可在 Apps Script 編輯器手動執行)
 */
function resetLoginLockout(deviceId) {
  const cache = CacheService.getScriptCache();
  if (deviceId) {
    cache.remove("LOGIN_FAIL_" + encodeURIComponent(deviceId.slice(0, 60)));
  }
  cache.remove("GLOBAL_LOGIN_FAIL_COUNT");
  cache.remove("GLOBAL_LOGIN_LOCKED_UNTIL");
  console.log("✅ 登入鎖定快取已清除");
}

function changePassword(data) {
  const sheet = getConfigSheet();
  
  // Get current DB password
  let dbOld = sheet.getRange("B1").getDisplayValue().trim();
  
  // If empty, treat as 8888
  if (!dbOld) {
    dbOld = "8888";
  }
  
  const inputOld = String(data.oldPassword).trim();
  
  // Verify old password
  if (inputOld !== dbOld) {
    return false; // Mismatch
  }
  
  // Write new password as explicit text
  const newPwd = String(data.newPassword).trim();
  sheet.getRange("B1").setNumberFormat("@").setValue(newPwd);
  
  // 👉 核心修改：寫入高層級安全日誌
  writeSystemLog(
    "UPDATE_SECURITY_PASSWORD", 
    "核心安全設定", 
    JSON.stringify({ 
      deviceId: data.deviceId || "未知裝置", 
      userAgent: data.userAgent || "未知瀏覽器" 
    })
  );
  
  return true;
}

// 提取 getSheetData 以便共用，避免不必要的跨表全讀取導致逾時
function getSheetData(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return []; // Only header or empty
  
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values[0].map(h => String(h || '').trim());
  const data = [];
  for (let i = 1; i < values.length; i++) {
    let obj = {};
    for (let j = 0; j < headers.length; j++) {
      if (headers[j]) {
        obj[headers[j]] = values[i][j];
      }
    }
    data.push(obj);
  }
  return data;
}

// 新增這個局部讀取函式
function getRecentSheetData(sheet, limit) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  
  if (lastRow <= 1) return []; // 只有標題或空表
  
  // 計算要從哪一行開始讀 (起點至少是 2，因為第 1 行是標題)
  const startRow = limit && lastRow > limit + 1 ? lastRow - limit + 1 : 2;
  const numRows = lastRow - startRow + 1;
  
  // 分別取出 標題行 與 局部資料區塊，這大幅降低了讀取體積
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const dataValues = sheet.getRange(startRow, 1, numRows, lastColumn).getValues();
  
  const result = [];
  for (let i = 0; i < dataValues.length; i++) {
    const row = dataValues[i];
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      if (headers[j]) {
        obj[headers[j]] = row[j]; // 拋棄 formatCellValue，大幅節省運算成本
      }
    }
    result.push(obj);
  }
  return result;
}

function parseLastUpdated(val) {
  if (!val) return 0;
  var num = Number(val);
  if (!isNaN(num) && num > 100000000) return num;
  var d = new Date(val).getTime();
  return isNaN(d) ? 0 : d;
}

function getData(startDateStr, since = 0, currentUser = null) {
  const sheets = getSheets();
  const cache = CacheService.getScriptCache();
  const CACHE_KEY = "APP_CACHE_CPT";
  
  let customers = null;
  let products = null;
  let trips = null;
  
  const cachedData = cache.get(CACHE_KEY);
  if (cachedData) {
    try {
      const parsed = JSON.parse(cachedData);
      customers = parsed.customers;
      products = parsed.products;
      trips = parsed.trips;
    } catch (e) {}
  }
  
  if (!customers || !products || !trips) {
    try {
      if (typeof Sheets !== 'undefined') {
        const spreadsheetId = SS.getId();
        const ranges = [
          sheets.CUSTOMERS.getName() + "!A:Z",
          sheets.PRODUCTS.getName() + "!A:Z",
          sheets.TRIPS.getName() + "!A:Z"
        ];
        const res = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, { ranges: ranges, valueRenderOption: 'FORMATTED_VALUE' });
        
        const parseBatch = (valRange, mapper) => {
          const values = valRange.values || [];
          if (values.length <= 1) return [];
          const headers = values[0];
          const data = [];
          
          for (let i = 1; i < values.length; i++) {
            const row = values[i];

            // ✨ 1. 防禦性檢查：保證 row 不是 undefined 或空陣列（防禦 API 例外回傳）
            if (!row || row.length === 0) continue;
            
            // ✨ 2. 空白列檢查：確認是否整列都被清空了 (連純空白的字串也一起抓出來濾掉)
            const isEmptyRow = row.every(cell => 
              cell === '' || cell === null || cell === undefined || (typeof cell === 'string' && cell.trim() === '')
            );
            if (isEmptyRow) continue; 
            
            let obj = {};
            for (let j = 0; j < headers.length; j++) {
              obj[headers[j]] = row[j];
            }
            data.push(mapper(obj));
          }
          return data;
        };

        customers = parseBatch(res.valueRanges[0], c => ({
          id: c.ID || c.id,
          name: c.Name || c.name || c.客戶名稱,
          phone: c.Phone || c.phone || c.電話,
          address: c.Address || c.address || c.地址 || '',
          coordinates: c.Coordinates || c.coordinates || c.座標位置 || c.GoogleMapUrl || c.googleMapUrl || c.GoogleMap網址 || '',
          deliveryTime: formatDeliveryTimeString(c.DeliveryTime || c.deliveryTime || c.配送時間),
          defaultItems: c.DefaultItems || c.defaultItems || c.預設品項JSON || c.預設品項, 
          priceList: c.PriceList || c.priceList || c.價目表JSON || c.價目表 || c.專屬價目表 || c.專屬價格 || c.客製化價格JSON || c.客製化價格 || c.自訂價格 || c.客戶價目表,
          offDays: c.OffDays || c.offDays || c.公休日週期JSON || c.公休日週期,
          holidayDates: c.HolidayDates || c.holidayDates || c.特定公休日JSON || c.特定公休日,
          deliveryMethod: c.DeliveryMethod || c.deliveryMethod || c.配送方式,
          paymentTerm: c.PaymentTerm || c.paymentTerm || c.付款週期,
          defaultTrip: c.DefaultTrip || c.defaultTrip || c.預設趟數,
          autoOrderEnabled: String(c.自動建單開關).trim().toLowerCase() === 'true' || c.自動建單開關 === true,
          isWatchlist: String(c.易漏盯哨 || c.isWatchlist || '').trim().toLowerCase() === 'true' || c.易漏盯哨 === true || c.isWatchlist === true,
          isPaused: String(c.暫停供貨 || c.isPaused).trim().toLowerCase() === 'true' || c.暫停供貨 === true,
          isArchived: String(c.封存 || c.isArchived).trim().toLowerCase() === 'true' || c.封存 === true,
          lastUpdated: parseLastUpdated(c.LastUpdated)
        }));

        products = parseBatch(res.valueRanges[1], p => ({
          id: p.ID || p.id,
          name: p.Name || p.name || p.品項,
          unit: p.Unit || p.unit || p.單位,
          price: p.Price || p.price || p.單價,
          category: p.Category || p.category || p.分類,
          lastUpdated: parseLastUpdated(p.LastUpdated)
        }));

        const values = res.valueRanges[2].values || [];
        trips = [];
        for (let i = 1; i < values.length; i++) {
          if (values[i][0]) trips.push(String(values[i][0]).trim());
        }
      } else {
        throw new Error("No Sheets API");
      }
    } catch(e) {
      customers = getSheetData(sheets.CUSTOMERS).map(c => ({
        id: c.ID || c.id,
        name: c.Name || c.name || c.客戶名稱,
        phone: c.Phone || c.phone || c.電話,
        address: c.Address || c.address || c.地址 || '',
        coordinates: c.Coordinates || c.coordinates || c.座標位置 || c.GoogleMapUrl || c.googleMapUrl || c.GoogleMap網址 || '',
        deliveryTime: formatDeliveryTimeString(c.DeliveryTime || c.deliveryTime || c.配送時間),
        defaultItems: c.DefaultItems || c.defaultItems || c.預設品項JSON || c.預設品項, 
        priceList: c.PriceList || c.priceList || c.價目表JSON || c.價目表 || c.專屬價目表 || c.專屬價格 || c.客製化價格JSON || c.客製化價格 || c.自訂價格 || c.客戶價目表,
        offDays: c.OffDays || c.offDays || c.公休日週期JSON || c.公休日週期,
        holidayDates: c.HolidayDates || c.holidayDates || c.特定公休日JSON || c.特定公休日,
        deliveryMethod: c.DeliveryMethod || c.deliveryMethod || c.配送方式,
        paymentTerm: c.PaymentTerm || c.paymentTerm || c.付款週期,
        defaultTrip: c.DefaultTrip || c.defaultTrip || c.預設趟數,
        autoOrderEnabled: String(c.自動建單開關).trim().toLowerCase() === 'true' || c.自動建單開關 === true,
        isWatchlist: String(c.易漏盯哨 || c.isWatchlist || '').trim().toLowerCase() === 'true' || c.易漏盯哨 === true || c.isWatchlist === true,
        isPaused: String(c.暫停供貨 || c.isPaused).trim().toLowerCase() === 'true' || c.暫停供貨 === true,
        isArchived: String(c.封存 || c.isArchived).trim().toLowerCase() === 'true' || c.封存 === true,
        lastUpdated: parseLastUpdated(c.LastUpdated)
      }));

      products = getSheetData(sheets.PRODUCTS).map(p => ({
        id: p.ID || p.id,
        name: p.Name || p.name || p.品項,
        unit: p.Unit || p.unit || p.單位,
        price: p.Price || p.price || p.單價,
        category: p.Category || p.category || p.分類,
        lastUpdated: parseLastUpdated(p.LastUpdated)
      }));

      const getTripsData = (sheet) => {
        if (!sheet) return [];
        const lastRow = sheet.getLastRow();
        if (lastRow <= 1) return [];
        const values = sheet.getDataRange().getValues();
        const tr = [];
        for (let i = 1; i < values.length; i++) {
          if (values[i][0]) tr.push(String(values[i][0]).trim());
        }
        return tr;
      };
      trips = getTripsData(sheets.TRIPS);
    }
    
    try {
      cache.put(CACHE_KEY, JSON.stringify({ customers, products, trips }), 1800);
    } catch(err) {}
  }

  // 改為：只抓取最新的 5000 筆資料 (確保涵蓋 90 天內的歷史訂單，以免被截斷)
  const ordersRaw = getRecentSheetData(sheets.ORDERS, 5000);
  if (!cachedTimeZone) cachedTimeZone = SS.getSpreadsheetTimeZone() || 'Asia/Taipei';
  
  let orders = ordersRaw.map(o => {
    let rawDate = o.DeliveryDate || o.deliveryDate || o.配送日期;
    let finalDateStr = '';
    
    if (rawDate instanceof Date) {
      finalDateStr = Utilities.formatDate(rawDate, cachedTimeZone, "yyyy-MM-dd");
    } else if (rawDate) {
      finalDateStr = String(rawDate).replace(/\s+/g, '').split('T')[0];
      finalDateStr = finalDateStr
        .replace(/\//g, '-')
        .replace(/-0?/g, '-')
        .replace(/-(\d)(?!\d)/g, '-0$1'); // 確保 YYYY-MM-DD 格式
    }

    return {
      id: o.ID || o.id || o["Order ID"] || o.訂單ID,
      createdAt: o.CreatedAt || o.createdAt || o.建立時間,
      customerName: o.CustomerName || o.customerName || o.客戶名,
      deliveryDate: finalDateStr,
      deliveryTime: formatDeliveryTimeString(o.DeliveryTime || o.deliveryTime || o.配送時間),
      productName: o.ProductName || o.productName || o.品項,
      quantity: o.Quantity || o.quantity || o.數量,
      unit: o.Unit || o.unit || o.單位,
      note: o.Note || o.note || o.備註,
      status: String(o.Status || o.status || o.狀態 || '').trim(),
      deliveryMethod: o.DeliveryMethod || o.deliveryMethod || o.配送方式,
      source: o.Source || o.source || o.資料來源 || '',
      unitPrice: Number(o.UnitPrice || o.unitPrice || o.單價) || undefined,
      subtotal: Number(o.Subtotal || o.subtotal || o.小計) || undefined,
      lastUpdated: parseLastUpdated(o.LastUpdated),
      trip: o.Trip || o.trip || o.趟次 || '',
      assignedTo: o.assigned_to || o.AssignedTo || o.指派人員ID || o.指派人員 || '',
      assignedName: o.assigned_name || o.AssignedName || o.指派人員姓名 || '',
      dispatchStatus: o.dispatch_status || o.DispatchStatus || o.指派狀態 || ''
    };
  });

    // filter by start date
  if (startDateStr) {
    const startStr = startDateStr.replace(/-/g, '');
    orders = orders.filter(o => {
      let d = o.deliveryDate;
      if (d instanceof Date) {
        if (!cachedTimeZone) cachedTimeZone = SS.getSpreadsheetTimeZone() || 'Asia/Taipei';
        d = Utilities.formatDate(d, cachedTimeZone, 'yyyyMMdd');
      } else {
        d = String(d || '').trim().split(' ')[0];
        // replace dots with dashes
        d = d.replace(/\./g, '-');
        if (/^\d{1,2}[\/\-]\d{1,2}$/.test(d)) {
          let parts = d.split(/[\/\-]/);
          let currentYear = new Date().getFullYear();
          let m = parts[0].padStart(2, '0');
          let day = parts[1].padStart(2, '0');
          d = currentYear + m + day;
        } else {
          let parts = d.split(/[\/\-]/);
          if (parts.length === 3) {
            let y = parts[0];
            if (y.length === 2) y = "20" + y; // 26 -> 2026
            if (y.length === 3 && parseInt(y) < 1900) y = String(parseInt(y) + 1911); // 115 -> 2026
            d = y + parts[1].padStart(2, '0') + parts[2].padStart(2, '0');
          } else {
            d = d.replace(/[\/-]/g, '');
          }
        }
      }
      return d >= startStr;
    });
  }

  // 1. 先把標記為 DELETED 的訂單過濾掉，不再回傳給任何裝置
  orders = orders.filter(o => String(o.status).trim().toUpperCase() !== 'DELETED');

  // 2. 🛡️【核心安全要求】後端嚴格資料遮蔽 (Data Masking)
  // 若使用者不具備 canViewAllOrders 權限 (如 staff)，嚴格只回傳 assignedTo 指派給自己的訂單！
  if (currentUser) {
    const userRole = String(currentUser.role || 'staff').trim().toLowerCase();
    const canViewAll = hasPermission(userRole, "canViewAllOrders");
    if (!canViewAll) {
      const myId = String(currentUser.userId || currentUser.dId || '').trim();
      const myName = String(currentUser.name || '').trim();
      orders = orders.filter(o => {
        const aId = String(o.assignedTo || '').trim();
        const aName = String(o.assignedName || '').trim();
        return (myId && aId === myId) || (myName && (aName === myName || aId === myName));
      });
    }
  }

  // 3. 把目前試算表有效存活的訂單 ID 給提取出來 (只有增量同步需帶這包資料，作爲本地幽靈清掃的依據)
  const allActiveOrderIds = (since > 0) ? orders.map(o => String(o.id || "")).filter(id => id !== "") : [];

  if (since > 0) {
    orders = orders.filter(o => o.lastUpdated > since || o.lastUpdated === 0);
  }
  
  // Get settings
  const configSheet = getConfigSheet();
  const settingsDataStr = getSystemConfig(configSheet, "AppSettings");
  let settings = null;
  try {
    settings = JSON.parse(settingsDataStr || "{}");
  } catch(e) {}
  
  if (!settings) settings = {};
  settings.rules = getRemindRulesFromSheet();

  // 1. 取得通知日誌最新時間 (支援中文與英文工作表名稱)
  const traceSheet = SS.getSheetByName("執行日誌") || SS.getSheetByName("TraceLogs");
  const traceLastRow = traceSheet ? traceSheet.getLastRow() : 0;
  const latestNotifyLogTs = traceLastRow > 1 ? new Date(traceSheet.getRange(traceLastRow, 1).getValue()).getTime() : 0;

  // 2. 取得系統操作日誌最新時間 (支援中文與英文工作表名稱)
  const sysSheet = SS.getSheetByName("系統操作日誌") || SS.getSheetByName("SystemLogs");
  const sysLastRow = sysSheet ? sysSheet.getLastRow() : 0;
  const latestSystemLogTs = sysLastRow > 1 ? new Date(sysSheet.getRange(sysLastRow, 1).getValue()).getTime() : 0;

  return { customers, products, orders, trips, settings, allActiveOrderIds, serverGlobalTs: new Date().getTime(), latestNotifyLogTs, latestSystemLogTs };
}

function getRemindRulesSheet() {
  let sheet = SS.getSheetByName("RemindRules");
  if (!sheet) {
    sheet = SS.insertSheet("RemindRules");
    sheet.appendRow(["規則ID", "規則名稱", "檢查週期", "檢查訂單日期", "提醒時間", "是否啟用", "自訂提醒內容", "判斷條件(包含AND/OR等詳細設定)", "LastUpdated", "規則擴充設定JSON"]);
    sheet.getRange(1, 1, 1, 10).setFontWeight("bold");
    sheet.setFrozenRows(1);
  } else {
    // 確保有 LastUpdated 與 規則擴充設定JSON 欄位
    let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (!headers.includes("LastUpdated")) {
      sheet.getRange(1, headers.length + 1).setValue("LastUpdated").setFontWeight("bold");
      headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    }
    if (!headers.includes("規則擴充設定JSON")) {
      sheet.getRange(1, headers.length + 1).setValue("規則擴充設定JSON").setFontWeight("bold");
    }
  }
  return sheet;
}

function saveRemindRulesToSheet(rules) {
  const sheet = getRemindRulesSheet();
  
  // Clear existing content except header
  const lastRow = Math.max(1, sheet.getLastRow()); // ensure we don't crash
  const lastCol = Math.max(10, sheet.getLastColumn());
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  }
  
  if (!rules || rules.length === 0) return;
  
  const currentTs = new Date().getTime();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const lastUpdatedColIdx = headers.indexOf("LastUpdated");
  const extConfigColIdx = headers.indexOf("規則擴充設定JSON");
  const totalCols = Math.max(headers.length, 10);
  
  const dataToRows = rules.map(rule => {
    let row = new Array(totalCols).fill("");
    row[0] = rule.id || "";
    row[1] = rule.name || "";
    row[2] = Array.isArray(rule.schedule) ? rule.schedule.join(',') : (rule.schedule || "");
    row[3] = Array.isArray(rule.targetOrderDays) ? rule.targetOrderDays.join(',') : (rule.targetOrderDays || "");
    row[4] = rule.timeToNotify ? `'${String(rule.timeToNotify)}` : "";
    row[5] = rule.isActive === false ? false : true;
    row[6] = rule.customMessage || "";
    row[7] = JSON.stringify(rule.conditions || []);

    const extConfig = {
      targetDateMode: rule.targetDateMode || undefined,
      outputFormat: rule.outputFormat || 'SUMMARY_NAMES',
      includeItemTotals: rule.includeItemTotals !== undefined ? Boolean(rule.includeItemTotals) : true,
      recipientMode: rule.recipientMode || 'DEFAULT_ADMIN',
      targetStaffIds: Array.isArray(rule.targetStaffIds) ? rule.targetStaffIds : [],
      fallbackToAdminIfUnassigned: rule.fallbackToAdminIfUnassigned !== false,
      priorityCustomerIds: Array.isArray(rule.priorityCustomerIds) ? rule.priorityCustomerIds : []
    };

    if (lastUpdatedColIdx !== -1) row[lastUpdatedColIdx] = currentTs;
    if (extConfigColIdx !== -1) row[extConfigColIdx] = JSON.stringify(extConfig);
    return row;
  });
  
  safeSetValues(sheet, 2, 1, dataToRows);
  sheet.getRange(2, 5, dataToRows.length, 1).setNumberFormat("@");
  SpreadsheetApp.flush();
}

function getRemindRulesFromSheet() {
  const sheet = getRemindRulesSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  
  const colCount = Math.max(8, sheet.getLastColumn());
  const headers = sheet.getRange(1, 1, 1, colCount).getValues()[0];
  const extConfigColIdx = headers.indexOf("規則擴充設定JSON");

  const values = sheet.getRange(2, 1, lastRow - 1, colCount).getValues();
  const displayValues = sheet.getRange(2, 1, lastRow - 1, colCount).getDisplayValues();
  const rules = [];
  
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const displayRow = displayValues[i];
    const id = row[0];
    if (!id) continue;
    
    let conditions = [];
    try {
      conditions = row[7] ? JSON.parse(row[7]) : [];
    } catch (e) {}

    let extConfig = {};
    if (extConfigColIdx !== -1 && row[extConfigColIdx]) {
      try {
        extConfig = JSON.parse(row[extConfigColIdx]) || {};
      } catch (e) {}
    }

    const rawTargetDays = row[3] ? String(row[3]).split(',').filter(Boolean) : [];
    const defaultDateMode = extConfig.targetDateMode || (rawTargetDays.length > 0 ? 'WEEKDAYS' : 'TOMORROW');
    
    rules.push({
      id: String(id),
      name: String(row[1] || ""),
      schedule: row[2] ? String(row[2]).split(',').filter(Boolean) : [],
      targetDateMode: defaultDateMode,
      targetOrderDays: rawTargetDays,
      timeToNotify: String(displayRow[4] || "").replace(/^'/, ""), // Use display value for time to avoid Date object issues
      isActive: row[5] === "" ? true : Boolean(row[5]),
      customMessage: String(row[6] || ""),
      conditions: conditions,
      outputFormat: extConfig.outputFormat || 'SUMMARY_NAMES',
      includeItemTotals: extConfig.includeItemTotals !== undefined ? Boolean(extConfig.includeItemTotals) : true,
      recipientMode: extConfig.recipientMode || 'DEFAULT_ADMIN',
      targetStaffIds: Array.isArray(extConfig.targetStaffIds) ? extConfig.targetStaffIds : [],
      fallbackToAdminIfUnassigned: extConfig.fallbackToAdminIfUnassigned !== false,
      priorityCustomerIds: Array.isArray(extConfig.priorityCustomerIds) ? extConfig.priorityCustomerIds : []
    });
  }
  
  return rules;
}

function saveSettings(data) {
  const configSheet = getConfigSheet();
  const cleanData = Object.assign({}, data || {});
  
  // === 【資料分離邏輯說明】 =======================================
  // 目的：避免 Config 分頁的 AppSettings 儲存格因寫入不斷增加的「提醒規則」而導致資料過長或難以維護。
  // 作法：在此扮演「資料攔截」的角色。
  //      若前端傳來的 data 包含 rules 屬性，則將該屬性獨立抽離，
  //      轉交給 saveRemindRulesToSheet() 專屬函數寫入 "RemindRules" 表單。
  //      保存完畢後，使用 delete 刪除該屬性，使得後續寫入 AppSettings 
  //      的 JSON 設定中，只會留下輕量的一般參數 (例如 lineUserId、Token 等)。
  // =============================================================
  if (cleanData.rules !== undefined) {
    saveRemindRulesToSheet(cleanData.rules); 
    delete cleanData.rules; // 抽離：將 rules 從原物件中剔除
  }
  
  // 讀取既有 AppSettings 做淺合併，避免只傳部分設定時意外洗掉 dailyBriefing 或 LINE Token
  let existingSettings = {};
  try {
    const existingStr = getSystemConfig(configSheet, "AppSettings");
    if (existingStr) existingSettings = JSON.parse(existingStr) || {};
  } catch (e) {}
  const mergedSettings = Object.assign({}, existingSettings, cleanData);

  setSystemConfig(configSheet, "AppSettings", JSON.stringify(mergedSettings));
  SpreadsheetApp.flush();
  
  // === 強制清除快取 ===
  // 確保背景輪詢與 LINE Bot 不會抓到被快取的舊設定
  invalidateLineCaches({ config: true });
  
  return true;
}

function testLineMessage(data) {
  const payloadData = data || {};
  const channelToken = String(payloadData.lineChannelToken || getLineMessagingToken() || '').trim();
  const userIdStr = String(payloadData.lineUserId || payloadData.line_user_id || '').trim();
  
  if (!channelToken || !userIdStr) {
    throw new Error("Missing credentials for LINE API (請確認 Channel Token 與 User ID)");
  }

  const userIds = userIdStr.split(',').map(id => id.trim()).filter(id => id);
  if (userIds.length === 0) {
    throw new Error("Invalid User IDs format");
  }
  
  const endpoint = userIds.length === 1 
    ? "https://api.line.me/v2/bot/message/push" 
    : "https://api.line.me/v2/bot/message/multicast";
    
  const payloadTo = userIds.length === 1 ? userIds[0] : userIds;
  
  try {
    const res = UrlFetchApp.fetch(endpoint, {
      method: "post",
      contentType: "application/json",
      headers: { 
        "Authorization": "Bearer " + channelToken 
      },
      payload: JSON.stringify({
        to: payloadTo,
        messages: [{ type: "text", text: "✅ 這是來自智能訂單系統的測試發送！您的 LINE 串接已成功。" }]
      }),
      muteHttpExceptions: true
    });
    
    if (res.getResponseCode() !== 200) {
      throw new Error("HTTP " + res.getResponseCode() + ": " + res.getContentText());
    }
  } catch(err) {
    throw new Error("LINE Messaging API failed: " + err.message);
  }
  return true;
}

function saveTrips(data) {
  const sheet = getSheets().TRIPS;
  const trips = data.trips; // Array of strings
  
  sheet.clear();
  sheet.getRange("A1").setValue("TripName");
  
  if (trips && trips.length > 0) {
    const rows = trips.map(t => [t]);
    safeSetValues(sheet, 2, 1, rows);
  }
  
  return true;
}

// ✅ 核心輔助函數：一次搜集所有欄位 Index
function ensureHeadersBatch(sheet, requiredHeaders) {
  const lastCol = sheet.getLastColumn();
  
  // 邊界情況：如果是一張全空的新表
  if (lastCol === 0) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    return requiredHeaders.reduce((acc, current, i) => {
      acc[current] = i;
      return acc;
    }, {});
  }

  // 1. One-time Read I/O：一次把第一行全部拉進記憶體
  const existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const missingHeaders = [];
  const headerMap = {};

  // 2. Memory Build：建立現有標題的 Hash Map，查詢複雜度 O(1)
  existingHeaders.forEach((header, index) => {
    if (header) headerMap[String(header).trim()] = index;
  });

  // 3. Memory Check：過濾出需要補上的標題
  requiredHeaders.forEach(req => {
    if (headerMap[req] === undefined) {
      missingHeaders.push(req);
    }
  });

  // 4. One-time Write I/O (非必要不觸發)：只有當真的缺欄位時，才發送一次 API 寫回
  if (missingHeaders.length > 0) {
    const startCol = existingHeaders.length + 1;
    sheet.getRange(1, startCol, 1, missingHeaders.length).setValues([missingHeaders]);
    
    // 把剛建好的欄位 Index 補進 Hash Map 裡
    missingHeaders.forEach((h, i) => {
      headerMap[h] = (startCol - 1) + i; // 確保回傳 0-based index
    });
  }

  // 回傳這張表所有的 { "欄位名稱": Index }
  return headerMap;
}

/**
 * ==========================================
 * 試算表寫入安全防護層 (Spreadsheet Security & Formula Sanitization - CWE-1236)
 * ==========================================
 */

/**
 * 防禦試算表公式注入 (Formula / CSV Injection)
 * 若字串開頭是 =, +, -, @, \t, \r 則在前面加上單引號 '，強制 Google Sheets 視為純文字而非公式
 */
function sanitizeCellForSheet(val) {
  if (val === null || val === undefined) return val;
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  // 若開頭是 =, +, -, @, \t, \r 則在前面加上單引號 '，強制 Google Sheets 視為純文字而非公式
  if (/^[=\+\-@\t\r]/.test(trimmed)) {
    return "'" + val;
  }
  return val;
}

/**
 * 批次過濾單列資料（一維陣列）
 */
function sanitizeRowForSheet(rowArray) {
  if (!Array.isArray(rowArray)) return rowArray;
  return rowArray.map(cell => sanitizeCellForSheet(cell));
}

/**
 * 批次過濾多列資料（二維矩陣）
 */
function sanitizeMatrixForSheet(matrix) {
  if (!Array.isArray(matrix)) return matrix;
  return matrix.map(row => sanitizeRowForSheet(row));
}

/**
 * 安全地將單列資料附加到工作表最後，自動過濾公式注入字元。
 */
function safeAppendRow(sheet, rowDataArray) {
  return sheet.appendRow(sanitizeRowForSheet(rowDataArray));
}

/**
 * 安全地將資料寫入指定的 Row。
 * 自動判斷並補齊實體 Column，避免「RangeException」閃退，並自動過濾公式注入字元。
 */
function safeSetRowValues(sheet, rowIndex, rowDataArray) {
  const sanitizedArray = sanitizeRowForSheet(rowDataArray);
  const maxCols = sheet.getMaxColumns(); // 取得目前的實體欄位總數
  const targetCols = sanitizedArray.length; // 我們準備要寫入的資料長度

  // 若資料長度超過實體表格長度，手動為 Sheet 擴充欄位
  if (targetCols > maxCols) {
    sheet.insertColumnsAfter(maxCols, targetCols - maxCols);
  }

  // 擴充完畢後，就可以 100% 安全地執行寫入
  sheet.getRange(rowIndex, 1, 1, targetCols).setValues([sanitizedArray]);
}

/**
 * 安全地將多筆資料寫入，自動擴充欄位並過濾公式注入字元。
 */
function safeSetValues(sheet, startRow, startCol, dataArray) {
  if (!dataArray || dataArray.length === 0) return;
  const sanitizedMatrix = sanitizeMatrixForSheet(dataArray);
  const maxCols = sheet.getMaxColumns();
  const targetCols = startCol - 1 + sanitizedMatrix[0].length;
  
  if (targetCols > maxCols) {
    sheet.insertColumnsAfter(maxCols, targetCols - maxCols);
  }
  
  sheet.getRange(startRow, startCol, sanitizedMatrix.length, sanitizedMatrix[0].length).setValues(sanitizedMatrix);
}


// Helper to check version conflict for Orders (樂觀鎖)
function checkOrderVersionStrict(currentVersion, expectedVersion) {
  if (expectedVersion !== undefined && currentVersion !== "" && Number(currentVersion) !== Number(expectedVersion)) {
    throw new Error("ERR_VERSION_CONFLICT: Data has been modified by another user.");
  }
}

// Helper to check version conflict
function checkVersionConflict(currentLastUpdated, originalLastUpdated) {
  if (!currentLastUpdated) return; // No previous version, safe to write
  const currentTs = new Date(currentLastUpdated).getTime();
  // Allow a small buffer or strict check. Strict check:
  if (originalLastUpdated !== undefined && currentTs > originalLastUpdated) {
    throw new Error("ERR_VERSION_CONFLICT: Data has been modified by another user.");
  }
}

function createOrder(orderData) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const sheet = getSheets().ORDERS;
    
    // Ensure we have enough columns and headers
    const headerMap = ensureHeadersBatch(sheet, ["LastUpdated", "Trip", "資料來源", "Version", "單價", "小計"]);
    const lastUpdatedColIdx = headerMap["LastUpdated"];
    const tripColIdx = headerMap["Trip"];
    const sourceColIdx = headerMap["資料來源"];
    const versionColIdx = headerMap["Version"];
    const unitPriceColIdx = headerMap["單價"];
    const subtotalColIdx = headerMap["小計"];
    
    const maxCol = Math.max(lastUpdatedColIdx, tripColIdx, sourceColIdx, versionColIdx, unitPriceColIdx, subtotalColIdx) + 1;
    if (sheet.getMaxColumns() < maxCol) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), maxCol - sheet.getMaxColumns());
    }

    const timestamp = Utilities.formatDate(new Date(), SS.getSpreadsheetTimeZone(), "yyyy/MM/dd HH:mm:ss");
    const lastUpdatedTs = String(new Date().getTime()); // Unix timestamp for robust syncing
    
    const rows = orderData.items.map(item => {
      const row = new Array(maxCol).fill("");
      row[0] = timestamp;
      row[1] = orderData.id;
      row[2] = orderData.customerName;
      row[3] = orderData.deliveryDate;
      row[4] = orderData.deliveryTime;
      row[5] = item.productName || item.productId;
      row[6] = item.quantity;
      row[7] = orderData.note || "";
      row[8] = orderData.status || "PENDING";
      row[9] = orderData.deliveryMethod || "";
      row[10] = item.unit || "斤";
      row[lastUpdatedColIdx] = lastUpdatedTs;
      row[tripColIdx] = orderData.trip || "";
      row[sourceColIdx] = orderData.source || "";
      row[versionColIdx] = 1; // 首次建立 version 為 1
      row[unitPriceColIdx] = item.unitPrice !== undefined ? item.unitPrice : (orderData.unitPrice !== undefined ? orderData.unitPrice : "");
      row[subtotalColIdx] = item.subtotal !== undefined ? item.subtotal : (orderData.subtotal !== undefined ? orderData.subtotal : "");
      return row;
    });
    
    if (rows.length > 0) {
      const lastRow = sheet.getLastRow();
      safeSetValues(sheet, lastRow + 1, 1, rows);
    }
    invalidateLineCaches({ orders: true });
    return { lastUpdated: lastUpdatedTs, version: 1 };
  } finally {
    lock.releaseLock();
  }
}

function updateOrderContent(orderData) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    
    const sheet = getSheets().ORDERS;
    
    // 動態標題映射 (Dynamic Header Mapping)
    const headers = sheet.getRange(1, 1, 1, sheet.getMaxColumns()).getValues()[0];
    const headerMap = {};
    headers.forEach((h, i) => { if (h) headerMap[String(h).trim()] = i; });
    
    // 確保必備欄位存在
    const requiredHeaders = ["LastUpdated", "Trip", "資料來源", "Version"];
    let needsInsert = false;
    requiredHeaders.forEach(req => {
      if (headerMap[req] === undefined) {
         headerMap[req] = headers.length;
         headers.push(req);
         needsInsert = true;
      }
    });

    if (needsInsert) {
      if (sheet.getMaxColumns() < headers.length) {
         sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
      }
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    
    const lastUpdatedColIdx = headerMap["LastUpdated"];
    const versionColIdx = headerMap["Version"];
    const totalCols = headers.length;

    const lastRow = sheet.getLastRow();
    
    // 預設寫回全表變數
    let values = [];
    if (lastRow > 1) {
      values = sheet.getDataRange().getValues();
    }
    
    const targetId = String(orderData.id).trim();
    const newLastUpdatedTs = String(new Date().getTime());
    let currentVersion = 0;
    
    // PARTIAL UPDATE MODE (若前端只傳送 updateFields)
    if (orderData.updateFields && !orderData.items) {
      let updatedRowsCount = 0;
      for (let i = values.length - 1; i >= 1; i--) {
        if (String(values[i][1]).trim() === targetId) {
          const sheetVersion = values[i][versionColIdx];
          currentVersion = Number(sheetVersion || 0);
          
          if (!orderData.force) {
            checkOrderVersionStrict(sheetVersion, orderData.version);
          }
          
          // 在記憶體中進行屬性合併
          for (const [key, newValue] of Object.entries(orderData.updateFields)) {
            let colIndex = headerMap[key];
            // 嘗試容錯不同的預設名稱
            if (colIndex === undefined) {
               if (key === 'note') colIndex = headerMap['備註'];
               else if (key === 'trip') colIndex = headerMap['Trip'] || headerMap['趟次'];
               else if (key === 'status') colIndex = headerMap['Status'] || headerMap['狀態'];
               else if (key === 'deliveryDate') colIndex = headerMap['Date'] || headerMap['日期'];
               else if (key === 'unitPrice') colIndex = headerMap['單價'];
               else if (key === 'subtotal') colIndex = headerMap['小計'];
            }
            if (colIndex !== undefined) {
              values[i][colIndex] = newValue;
            }
          }
          
          values[i][lastUpdatedColIdx] = newLastUpdatedTs;
          values[i][versionColIdx] = currentVersion + 1;
          updatedRowsCount++;
        }
      }
      
      if (updatedRowsCount > 0) {
        safeSetValues(sheet, 2, 1, values.slice(1));
        invalidateLineCaches({ orders: true });
        return { lastUpdated: newLastUpdatedTs, version: currentVersion + 1 };
      }
      throw new Error("Order not found: " + targetId);
    }
    
    // FULL UPDATE MODE (包含 items 異動，需要重新產生 rows)
    let originalCreatedAt = "";
    let preservedAssignedTo = "";
    let preservedAssignedName = "";
    let preservedDispatchStatus = "";
    const existingItemPricing = {};
    if (lastRow > 1) {
      for (let i = values.length - 1; i >= 1; i--) {
        const sheetId = String(values[i][1]).trim();
        if (sheetId === targetId) {
          const sheetVersion = values[i][versionColIdx];
          currentVersion = Number(sheetVersion || 0);
          if (!orderData.force) {
            checkOrderVersionStrict(sheetVersion, orderData.version);
          }
          if (!originalCreatedAt) originalCreatedAt = values[i][0];
          if (!preservedAssignedTo && headerMap["assigned_to"] !== undefined) {
            preservedAssignedTo = values[i][headerMap["assigned_to"]] || "";
          }
          if (!preservedAssignedName && headerMap["assigned_name"] !== undefined) {
            preservedAssignedName = values[i][headerMap["assigned_name"]] || "";
          }
          if (!preservedDispatchStatus && headerMap["dispatch_status"] !== undefined) {
            preservedDispatchStatus = values[i][headerMap["dispatch_status"]] || "";
          }
          const prodKey = String(values[i][5] || "").trim();
          const upIdx = headerMap["單價"];
          if (prodKey && upIdx !== undefined && values[i][upIdx] !== "" && values[i][upIdx] !== undefined) {
            existingItemPricing[prodKey] = Number(values[i][upIdx]) || 0;
          }
        }
      }
    }

    let timestamp = originalCreatedAt;
    if (timestamp instanceof Date) {
      if (!cachedTimeZone) cachedTimeZone = SS.getSpreadsheetTimeZone() || "Asia/Taipei";
      timestamp = Utilities.formatDate(timestamp, cachedTimeZone, "yyyy/MM/dd HH:mm:ss");
    }
    if (!timestamp) {
      timestamp = Utilities.formatDate(new Date(), SS.getSpreadsheetTimeZone(), "yyyy/MM/dd HH:mm:ss");
    }

    // Filter out old rows (In-Memory Deletion)
    const newRows = [];
    if (lastRow > 1) {
      for (let i = 1; i < values.length; i++) {
        if (String(values[i][1]).trim() !== targetId) {
          const r = values[i].slice();
          while (r.length < totalCols) r.push("");
          newRows.push(r.slice(0, totalCols));
        }
      }
    }

    // Append new rows
    if (orderData.items && Array.isArray(orderData.items)) {
      orderData.items.forEach(item => {
        const row = new Array(totalCols).fill("");
        row[0] = timestamp;
        row[1] = orderData.id;
        row[2] = orderData.customerName;
        row[3] = orderData.deliveryDate;
        row[4] = orderData.deliveryTime || "";
        const itemProdName = item.productName || item.productId;
        const qtyNum = Number(item.quantity) || 0;
        row[5] = itemProdName;
        row[6] = qtyNum;
        row[7] = orderData.note || "";
        row[8] = orderData.status || "PENDING";
        row[9] = orderData.deliveryMethod || "";
        row[10] = item.unit || "斤";
        
        row[lastUpdatedColIdx] = newLastUpdatedTs;
        if (headerMap["Trip"] !== undefined) row[headerMap["Trip"]] = orderData.trip || "";
        if (headerMap["資料來源"] !== undefined) row[headerMap["資料來源"]] = orderData.source || "";
        if (headerMap["assigned_to"] !== undefined && preservedAssignedTo) row[headerMap["assigned_to"]] = preservedAssignedTo;
        if (headerMap["assigned_name"] !== undefined && preservedAssignedName) row[headerMap["assigned_name"]] = preservedAssignedName;
        if (headerMap["dispatch_status"] !== undefined && preservedDispatchStatus) row[headerMap["dispatch_status"]] = preservedDispatchStatus;
        const resolvedUnitPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : existingItemPricing[String(itemProdName).trim()];
        if (headerMap["單價"] !== undefined && resolvedUnitPrice !== undefined && !isNaN(resolvedUnitPrice)) {
          row[headerMap["單價"]] = resolvedUnitPrice;
          if (headerMap["小計"] !== undefined) {
            row[headerMap["小計"]] = item.subtotal !== undefined ? Number(item.subtotal) : resolvedUnitPrice * qtyNum;
          }
        }
        row[versionColIdx] = currentVersion + 1; 
        
        newRows.push(row);
      });
    }

    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, totalCols).clearContent();
    }
    
    if (newRows.length > 0) {
      safeSetValues(sheet, 2, 1, newRows);
    }
    invalidateLineCaches({ orders: true });
    
    return { lastUpdated: newLastUpdatedTs, version: currentVersion + 1 };
  } finally {
    lock.releaseLock();
  }
}

function updateOrderStatus(data, currentUser = null) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const sheet = getSheets().ORDERS;
    
    const headers = sheet.getRange(1, 1, 1, sheet.getMaxColumns()).getValues()[0];
    const headerMap = {};
    headers.forEach((h, i) => { if (h) headerMap[String(h).trim()] = i; });
    
    const requiredHeaders = ["LastUpdated", "Version"];
    let needsInsert = false;
    requiredHeaders.forEach(req => {
      if (headerMap[req] === undefined) {
         headerMap[req] = headers.length;
         headers.push(req);
         needsInsert = true;
      }
    });

    if (needsInsert) {
      if (sheet.getMaxColumns() < headers.length) {
         sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
      }
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }

    const lastUpdatedColIdx = headerMap["LastUpdated"];
    const versionColIdx = headerMap["Version"];
    const statusColIdx = headerMap["Status"] !== undefined ? headerMap["Status"] : (headerMap["狀態"] !== undefined ? headerMap["狀態"] : 8); 
    const assignColIdx = headerMap["assigned_to"] !== undefined ? headerMap["assigned_to"] : headerMap["指派人員ID"];
    const assignNameColIdx = headerMap["assigned_name"] !== undefined ? headerMap["assigned_name"] : headerMap["指派人員姓名"];
    
    const values = sheet.getDataRange().getValues();
    const targetId = String(data.id).trim();
    const newLastUpdatedTs = String(new Date().getTime());
    let newVersion = 0;

    // 🛡️ 權限檢驗：若非主管/管理員，驗證此單是否屬於當前員工
    if (currentUser) {
      const userRole = String(currentUser.role || 'staff').trim().toLowerCase();
      if (!hasPermission(userRole, "canUpdateAnyOrderStatus")) {
        const myId = String(currentUser.userId || currentUser.dId || '').trim();
        const myName = String(currentUser.name || '').trim();
        let isMine = false;
        for (let i = 1; i < values.length; i++) {
          if (String(values[i][1]).trim() === targetId) {
            const aId = assignColIdx !== undefined ? String(values[i][assignColIdx] || '').trim() : '';
            const aName = assignNameColIdx !== undefined ? String(values[i][assignNameColIdx] || '').trim() : '';
            if ((myId && aId === myId) || (myName && (aName === myName || aId === myName))) {
              isMine = true;
              break;
            }
          }
        }
        if (!isMine) {
          throw new Error("FORBIDDEN_ACTION: 權限不足，您無權修改非指派給您的訂單狀態");
        }
      }
    }
    
    let rowsToUpdate = [];
    let prevStatus = '';
    let customerName = '';
    let deliveryDate = '';

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][1]).trim() === targetId) {
        const currentVersion = values[i][versionColIdx];
        if (data.version !== undefined && !data.force) {
           checkOrderVersionStrict(currentVersion, data.version);
        }
        if (rowsToUpdate.length === 0) {
          prevStatus = String(values[i][statusColIdx] || '').trim();
          customerName = String(values[i][2] || '').trim();
          deliveryDate = normalizeDateStr(values[i][3]);
        }
        newVersion = Number(currentVersion || 0) + 1;
        values[i][statusColIdx] = data.status; 
        values[i][lastUpdatedColIdx] = newLastUpdatedTs;
        values[i][versionColIdx] = newVersion;
        rowsToUpdate.push(i + 1);
      }
    }
    
    if (rowsToUpdate.length > 0) {
      flushUpdatedRows_(sheet, values, rowsToUpdate);
      invalidateLineCaches({ orders: true });
    } else {
      throw new Error("Order not found: " + targetId);
    }
    
    return {
      lastUpdated: newLastUpdatedTs,
      version: newVersion,
      customerName: customerName,
      deliveryDate: deliveryDate,
      prevStatus: prevStatus,
      newStatus: data.status
    };
  } catch (err) {
    if (err.message && err.message.includes("Timeout")) {
      throw new Error("更新過於頻繁，請稍後重試");
    }
    throw err;
  } finally {
    lock.releaseLock();
  }
}

// 🛡️ 指派訂單 (主管/管理員) - Concurrency Lock & Versioning
function assignOrder(data, currentUser = null) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const sheet = getSheets().ORDERS;
    
    if (currentUser) {
      const userRole = String(currentUser.role || 'staff').trim().toLowerCase();
      if (!hasPermission(userRole, "canAssignOrders")) {
        throw new Error("FORBIDDEN_ACTION: 權限不足，您無權指派訂單");
      }
    }

    const headerMap = ensureHeadersBatch(sheet, ["LastUpdated", "assigned_to", "assigned_name", "dispatch_status", "Version"]);
    const lastUpdatedColIdx = headerMap["LastUpdated"];
    const assignColIdx = headerMap["assigned_to"];
    const nameColIdx = headerMap["assigned_name"];
    const statusColIdx = headerMap["dispatch_status"];
    const versionColIdx = headerMap["Version"];

    const values = sheet.getDataRange().getValues();
    const targetId = String(data.id || data.orderId).trim();
    const targetUserId = String(data.targetUserId || data.assignedTo || '').trim();
    const targetUserName = String(data.targetUserName || data.assignedName || '').trim();
    const newLastUpdatedTs = String(new Date().getTime());

    let modified = false;
    let newVersion = 1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][1]).trim() === targetId) {
        if (assignColIdx !== undefined) values[i][assignColIdx] = targetUserId;
        if (nameColIdx !== undefined) values[i][nameColIdx] = targetUserName;
        if (statusColIdx !== undefined) values[i][statusColIdx] = targetUserId ? "ASSIGNED" : "UNASSIGNED";
        if (lastUpdatedColIdx !== undefined) values[i][lastUpdatedColIdx] = newLastUpdatedTs;
        if (versionColIdx !== undefined) {
          newVersion = Number(values[i][versionColIdx] || 0) + 1;
          values[i][versionColIdx] = newVersion;
        }
        modified = true;
      }
    }

    if (modified) {
      safeSetValues(sheet, 2, 1, values.slice(1));
      invalidateLineCaches({ orders: true });
      return { success: true, lastUpdated: newLastUpdatedTs, version: newVersion };
    } else {
      throw new Error("找不到欲指派的訂單: " + targetId);
    }
  } finally {
    lock.releaseLock();
  }
}

function batchUpdateOrders(data, currentUser = null) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const sheet = getSheets().ORDERS;
    const headerMap = ensureHeadersBatch(sheet, ["LastUpdated", "Version"]);
    const lastUpdatedColIdx = headerMap["LastUpdated"];
    const versionColIdx = headerMap["Version"];
    const statusColIdx = headerMap["Status"] !== undefined ? headerMap["Status"] : (headerMap["狀態"] !== undefined ? headerMap["狀態"] : 8);
    const assignColIdx = headerMap["assigned_to"] !== undefined ? headerMap["assigned_to"] : headerMap["指派人員ID"];
    const assignNameColIdx = headerMap["assigned_name"] !== undefined ? headerMap["assigned_name"] : headerMap["指派人員姓名"];
    const values = sheet.getDataRange().getValues();
    const updates = Array.isArray(data && data.updates) ? data.updates : [];
    const newLastUpdatedTs = String(new Date().getTime());
    let updatedCount = 0;

    const canUpdateAny = !currentUser || hasPermission(String(currentUser.role || 'staff').trim().toLowerCase(), "canUpdateAnyOrderStatus");
    const myId = currentUser ? String(currentUser.userId || currentUser.dId || '').trim() : '';
    const myName = currentUser ? String(currentUser.name || '').trim() : '';

    // Create a map for fast lookup (保留每個 ID 最後一次更新)
    const updateMap = new Map();
    updates.forEach(u => {
      if (u && u.id) updateMap.set(String(u.id).trim(), u);
    });

    const rowsToUpdate = [];
    const summaryMap = new Map();
    const updatedIdSet = new Set();
    const versions = {};
    const conflictIds = [];
    const forbiddenIds = [];
    const matchedIds = new Set();

    for (let i = 1; i < values.length; i++) {
      const rowId = String(values[i][1]).trim();
      if (!updateMap.has(rowId)) continue;
      matchedIds.add(rowId);

      if (!canUpdateAny) {
        const aId = assignColIdx !== undefined ? String(values[i][assignColIdx] || '').trim() : '';
        const aName = assignNameColIdx !== undefined ? String(values[i][assignNameColIdx] || '').trim() : '';
        if (!((myId && aId === myId) || (myName && (aName === myName || aId === myName)))) {
          if (!forbiddenIds.includes(rowId)) forbiddenIds.push(rowId);
          continue;
        }
      }

      const updateData = updateMap.get(rowId);
      const currentVersion = values[i][versionColIdx];

      if (!updateData.force && updateData.version !== undefined && currentVersion !== "" && Number(currentVersion) !== Number(updateData.version)) {
        if (!conflictIds.includes(rowId)) conflictIds.push(rowId);
        continue;
      }

      if (!summaryMap.has(rowId)) {
        summaryMap.set(rowId, {
          id: rowId,
          customerName: String(values[i][2] || '').trim(),
          deliveryDate: normalizeDateStr(values[i][3]),
          originalStatus: updateData.originalStatus || String(values[i][statusColIdx] || '').trim(),
          status: updateData.status
        });
      }

      const newVersion = Number(currentVersion || 0) + 1;
      values[i][statusColIdx] = updateData.status;
      values[i][lastUpdatedColIdx] = newLastUpdatedTs;
      values[i][versionColIdx] = newVersion;
      rowsToUpdate.push(i + 1);
      updatedIdSet.add(rowId);
      versions[rowId] = newVersion;
      updatedCount++;
    }

    const notFoundIds = [];
    updateMap.forEach((_, reqId) => {
      if (!matchedIds.has(reqId)) notFoundIds.push(reqId);
    });

    if (rowsToUpdate.length > 0) {
      flushUpdatedRows_(sheet, values, rowsToUpdate);
      invalidateLineCaches({ orders: true });
    } else if (conflictIds.length > 0) {
      throw new Error("ERR_VERSION_CONFLICT: Data has been modified by another user.");
    } else if (forbiddenIds.length > 0) {
      throw new Error("FORBIDDEN_ACTION: 權限不足，您無權修改非指派給您的訂單狀態");
    }

    const failedItems = [];
    conflictIds.forEach(id => failedItems.push({ id, reason: 'VERSION_CONFLICT', message: '版本衝突，請重新同步' }));
    forbiddenIds.forEach(id => failedItems.push({ id, reason: 'FORBIDDEN_ACTION', message: '權限不足，無法修改未指派訂單' }));
    notFoundIds.forEach(id => failedItems.push({ id, reason: 'NOT_FOUND', message: '雲端找不到此筆訂單（可能已被刪除）' }));

    return {
      updatedCount,
      updatedIds: Array.from(updatedIdSet),
      versions,
      newLastUpdatedTs,
      failedItems,
      logSummaries: Array.from(summaryMap.values())
    };
  } catch (err) {
    if (err.message && err.message.includes("Timeout")) {
      throw new Error("更新過於頻繁，請稍後重試");
    }
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function batchUpdatePaymentStatus(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const sheet = getSheets().ORDERS;
    const headerMap = ensureHeadersBatch(sheet, ["LastUpdated", "Version"]);
    const lastUpdatedColIdx = headerMap["LastUpdated"];
    const versionColIdx = headerMap["Version"];
    const statusColIdx = headerMap["Status"] !== undefined ? headerMap["Status"] : (headerMap["狀態"] !== undefined ? headerMap["狀態"] : 8);
    const values = sheet.getDataRange().getValues();
    const orderIds = new Set((data.orderIds || []).map(id => String(id).trim()));
    const newLastUpdatedTs = String(new Date().getTime());

    const rowsToUpdate = [];
    const summaryMap = new Map();
    for (let i = 1; i < values.length; i++) {
      const id = String(values[i][1]).trim();
      if (orderIds.has(id)) {
        if (!summaryMap.has(id)) {
          summaryMap.set(id, {
            id: id,
            customerName: String(values[i][2] || '').trim(),
            deliveryDate: normalizeDateStr(values[i][3]),
            originalStatus: String(values[i][statusColIdx] || '').trim(),
            status: data.newStatus
          });
        }
        values[i][statusColIdx] = data.newStatus;
        values[i][lastUpdatedColIdx] = newLastUpdatedTs;
        if (versionColIdx !== undefined) {
          values[i][versionColIdx] = Number(values[i][versionColIdx] || 0) + 1;
        }
        rowsToUpdate.push(i + 1);
      }
    }

    if (rowsToUpdate.length > 0) {
      flushUpdatedRows_(sheet, values, rowsToUpdate);
      invalidateLineCaches({ orders: true });
    }
    return { success: true, logSummaries: Array.from(summaryMap.values()) };
  } catch (err) {
    if (err.message && err.message.includes("Timeout")) {
      throw new Error("更新過於頻繁，請稍後重試");
    }
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function deleteOrder(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const sheet = getSheets().ORDERS;
    const lastRow = sheet.getLastRow();
    
    if (lastRow <= 1) return false;

    const headerMap = ensureHeadersBatch(sheet, ["LastUpdated", "Version", "Status"]);
    const lastUpdatedColIdx = headerMap["LastUpdated"];
    const versionColIdx = headerMap["Version"];
    const statusColIdx = headerMap["Status"] !== undefined ? headerMap["Status"] : (headerMap["狀態"] !== undefined ? headerMap["狀態"] : 8);
    const productColIdx = headerMap["ProductName"] !== undefined ? headerMap["ProductName"] : (headerMap["品項"] !== undefined ? headerMap["品項"] : 5);
    const qtyColIdx = headerMap["Quantity"] !== undefined ? headerMap["Quantity"] : (headerMap["數量"] !== undefined ? headerMap["數量"] : 6);
    const unitColIdx = headerMap["Unit"] !== undefined ? headerMap["Unit"] : (headerMap["單位"] !== undefined ? headerMap["單位"] : 10);
    const values = sheet.getDataRange().getValues();
    const targetId = String(data.id || data.orderId || '').trim();

    let modified = false;
    let newVersion = 0;
    let deletedCustomerName = '';
    let deletedDeliveryDate = '';
    const deletedItems = [];
    const rowsToUpdate = [];

    // Conflict check first
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][1]).trim() === targetId) {
        if (!data.force && data.version !== undefined) {
           checkOrderVersionStrict(values[i][versionColIdx], data.version);
        }
      }
    }

    // Update rows & capture deleted order details
    for (let i = 1; i < values.length; i++) {
      // 匹配 ID 欄位 (通常在 Col 2，也就是 values[i][1])
      if (String(values[i][1]).trim() === targetId) {
        if (!modified) {
          newVersion = Number(values[i][versionColIdx] || 0) + 1;
          deletedCustomerName = String(values[i][2] || '').trim();
          deletedDeliveryDate = normalizeDateStr(values[i][3]);
          modified = true;
        }

        const itemName = String(values[i][productColIdx] || '').trim();
        const itemQty = values[i][qtyColIdx];
        const itemUnit = String(values[i][unitColIdx] || '斤').trim() || '斤';
        if (itemName) {
          deletedItems.push({
            productName: itemName,
            quantity: itemQty !== '' && itemQty !== undefined ? Number(itemQty) || itemQty : 0,
            unit: itemUnit
          });
        }
        
        // Update Status, LastUpdated, Version in memory
        // 注意：直接寫入第 9 欄 (index 8) 與 updateOrderStatus 一致，確保覆蓋 "狀態" 欄
        values[i][8] = 'DELETED';
        // 兼容性寫入，若動態取得的欄位跟 8 不同，也一併更新以防萬一
        if (statusColIdx !== 8 && statusColIdx !== undefined) {
           values[i][statusColIdx] = 'DELETED';
        }
        
        values[i][lastUpdatedColIdx] = String(new Date().getTime());
        values[i][versionColIdx] = newVersion;
        rowsToUpdate.push(i + 1);
      }
    }

    if (rowsToUpdate.length > 0) {
      flushUpdatedRows_(sheet, values, rowsToUpdate);
      invalidateLineCaches({ orders: true });
    }
    return {
      success: true,
      id: targetId,
      customerName: deletedCustomerName || data.customerName || '',
      deliveryDate: deletedDeliveryDate || data.deliveryDate || '',
      items: deletedItems.length > 0 ? deletedItems : (Array.isArray(data.items) ? data.items : [])
    };
  } finally {
    lock.releaseLock();
  }
}

function reorderProducts(orderedIds) {
  const sheet = getSheets().PRODUCTS;
  const headerMap = ensureHeadersBatch(sheet, ["LastUpdated"]);
  const lastUpdatedColIdx = headerMap["LastUpdated"];
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return true;

  const newLastUpdatedTs = String(new Date().getTime());

  const headers = values[0];
  const rows = values.slice(1);
  const map = new Map();
  rows.forEach(r => map.set(String(r[0]), r));
  const newRows = [];
  
  orderedIds.forEach(id => {
    if (map.has(String(id))) {
      const row = map.get(String(id));
      row[lastUpdatedColIdx] = newLastUpdatedTs; 
      newRows.push(row);
      map.delete(String(id));
    }
  });
  
  map.forEach(r => {
      r[lastUpdatedColIdx] = newLastUpdatedTs;
      newRows.push(r);
  });
  
  sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  safeSetValues(sheet, 2, 1, newRows);
  invalidateLineCaches({ products: true });
  return true;
}

function updateCustomer(data) {
  const sheet = getSheets().CUSTOMERS;
  
  // 動態抓取第一行的所有標題
  const lastCol = sheet.getLastColumn();
  const headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  
  // 幫忙找尋標題欄位位置的強大輔助函數 (找不到自動新增)
  function getColIndex(aliases, defaultName) {
    for (let i = 0; i < aliases.length; i++) {
      let idx = headers.indexOf(aliases[i]);
      if (idx !== -1) return idx;
    }
    // 如果都找不到，在最後面上一個新標題
    let newIdx = headers.length;
    headers.push(defaultName);
    
    // 檢查是否超出 Sheet 實體寬度，超出的話先擴展，避免 Range Exception 閃退
    const maxCols = sheet.getMaxColumns();
    if (newIdx + 1 > maxCols) {
      sheet.insertColumnAfter(maxCols);
    }
    
    sheet.getRange(1, newIdx + 1).setValue(defaultName);
    return newIdx;
  }

  // 自動對應你試算表現在的真實欄位位置 (相容英/中文標題)
  const colId = getColIndex(["ID", "id"], "ID");
  const colName = getColIndex(["Name", "name", "客戶名稱"], "Name");
  const colPhone = getColIndex(["Phone", "phone", "電話"], "Phone");
  const colAddress = getColIndex(["Address", "address", "地址"], "地址");
  const colCoords = getColIndex(["Coordinates", "coordinates", "座標位置", "GoogleMapUrl"], "座標位置");
  const colTime = getColIndex(["DeliveryTime", "deliveryTime", "配送時間"], "DeliveryTime");
  const colMethod = getColIndex(["DeliveryMethod", "deliveryMethod", "配送方式"], "DeliveryMethod");
  const colItems = getColIndex(["DefaultItems", "defaultItems", "預設品項JSON", "預設品項"], "DefaultItems");
  const colPrice = getColIndex(["PriceList", "priceList", "價目表JSON", "價目表"], "PriceList");
  const colOff = getColIndex(["OffDays", "offDays", "公休日週期JSON", "公休日週期"], "OffDays");
  const colHol = getColIndex(["HolidayDates", "holidayDates", "特定公休日JSON", "特定公休日"], "HolidayDates");
  const colTerm = getColIndex(["PaymentTerm", "paymentTerm", "付款週期"], "PaymentTerm");
  const colTrip = getColIndex(["DefaultTrip", "defaultTrip", "預設趟數"], "DefaultTrip");
  const colPaused = getColIndex(["isPaused", "暫停供貨", "Paused"], "暫停供貨");
  const colArchived = getColIndex(["isArchived", "封存", "Archived"], "封存");
  const colAuto = getColIndex(["自動建單開關", "autoOrderEnabled"], "自動建單開關");
  const colWatchlist = getColIndex(["isWatchlist", "易漏盯哨", "重點盯哨"], "易漏盯哨");
  const colLast = getColIndex(["LastUpdated"], "LastUpdated");

  const values = sheet.getDataRange().getValues();
  let rowIndex = -1;
  const targetId = String(data.id).trim();
  
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][colId]).trim() === targetId) {
      rowIndex = i + 1;
      if (!data.force) { // 對應了我們剛補上的 force 標籤
        checkVersionConflict(values[i][colLast], data.originalLastUpdated);
      }
      break;
    }
  }
  
  const newLastUpdatedTs = String(new Date().getTime());
  
  // 建立一筆與表格等寬的新資料集，預設先填充為空字串
  const newRow = new Array(headers.length).fill('');
  
  // 若是更新既有店家，先將原本底層的整行資料拷貝過來，避免覆蓋掉沒修改的自訂欄位
  if (rowIndex > 0) {
    const oldRow = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
    for (let i = 0; i < oldRow.length; i++) {
      newRow[i] = oldRow[i];
    }
  }

  // 根據標題的動態位置，精確塞入每一格的新資料
  newRow[colId] = data.id;
  newRow[colName] = data.name;
  newRow[colPhone] = data.phone;
  if(data.address !== undefined) newRow[colAddress] = data.address;
  if(data.coordinates !== undefined) newRow[colCoords] = data.coordinates;
  if(data.deliveryTime !== undefined) newRow[colTime] = data.deliveryTime;
  if(data.deliveryMethod !== undefined) newRow[colMethod] = data.deliveryMethod;
  if(data.defaultItems !== undefined) newRow[colItems] = JSON.stringify(data.defaultItems || []);
  if(data.priceList !== undefined) newRow[colPrice] = JSON.stringify(data.priceList || []);
  if(data.offDays !== undefined) newRow[colOff] = JSON.stringify(data.offDays || []);
  if(data.holidayDates !== undefined) newRow[colHol] = JSON.stringify(data.holidayDates || []);
  if(data.paymentTerm !== undefined) newRow[colTerm] = data.paymentTerm;
  if(data.defaultTrip !== undefined) newRow[colTrip] = data.defaultTrip || '';
  if(data.isPaused !== undefined) newRow[colPaused] = data.isPaused;
  if(data.isArchived !== undefined) newRow[colArchived] = data.isArchived;
  if(data.autoOrderEnabled !== undefined) newRow[colAuto] = data.autoOrderEnabled;
  if(data.isWatchlist !== undefined) newRow[colWatchlist] = data.isWatchlist;
  newRow[colLast] = newLastUpdatedTs;
  
  // 將動態組裝好的精確列寫入試算表
  if (rowIndex > 0) {
    safeSetRowValues(sheet, rowIndex, newRow);
  } else {
    safeAppendRow(sheet, newRow);
  }
  
  // 立即清除快取並強制落盤，防止後續立即發起同步時讀取到 Google Sheets API 尚未同步的舊快照
  invalidateLineCaches({ customers: true });
  SpreadsheetApp.flush();
  
  return { lastUpdated: newLastUpdatedTs };
}

function deleteCustomer(data) {
  const sheet = getSheets().CUSTOMERS;
  const headerMap = ensureHeadersBatch(sheet, ["LastUpdated"]);
  const lastUpdatedColIdx = headerMap["LastUpdated"];
  const values = sheet.getDataRange().getValues();
  const targetId = String(data.id).trim();
  
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === targetId) {
      if (data.originalLastUpdated !== undefined && !data.force) {
         checkVersionConflict(values[i][lastUpdatedColIdx], data.originalLastUpdated);
      }
      sheet.deleteRow(i + 1);
      invalidateLineCaches({ customers: true });
      return true;
    }
  }
  return false;
}

function updateProduct(data) {
  const sheet = getSheets().PRODUCTS;
  const headerMap = ensureHeadersBatch(sheet, ["LastUpdated"]);
  const lastUpdatedColIdx = headerMap["LastUpdated"];
  const values = sheet.getDataRange().getValues();
  let rowIndex = -1;
  const targetId = String(data.id).trim();
  
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === targetId) {
      rowIndex = i + 1;
      if (!data.force) {
        checkVersionConflict(values[i][lastUpdatedColIdx], data.originalLastUpdated);
      }
      break;
    }
  }
  
  const newLastUpdatedTs = String(new Date().getTime());

  const rowData = [
    data.id,
    data.name,
    data.unit,
    data.price,
    data.category,
    newLastUpdatedTs
  ];
  
  if (rowIndex > 0) {
    safeSetRowValues(sheet, rowIndex, rowData);
  } else {
    safeAppendRow(sheet, rowData);
  }
  invalidateLineCaches({ products: true });
  return { lastUpdated: newLastUpdatedTs };
}

function deleteProduct(data) {
  const sheet = getSheets().PRODUCTS;
  const headerMap = ensureHeadersBatch(sheet, ["LastUpdated"]);
  const lastUpdatedColIdx = headerMap["LastUpdated"];
  const values = sheet.getDataRange().getValues();
  const targetId = String(data.id).trim();
  
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === targetId) {
      if (data.originalLastUpdated !== undefined && !data.force) {
         checkVersionConflict(values[i][lastUpdatedColIdx], data.originalLastUpdated);
      }
      sheet.deleteRow(i + 1);
      invalidateLineCaches({ products: true });
      return true;
    }
  }
  return false;
}

function safeJsonArray(val) {
  if (!val) return [];
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch(e) { return []; }
  }
  return Array.isArray(val) ? val : [];
}

function generateTomorrowDefaultOrders(explicitDates) {
  const functionName = 'generateTomorrowDefaultOrders';
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(28000);
  } catch (err) {
    console.error("排程伺服器忙碌中，設定 15 分鐘後重試");
    // 動態建立一個單次觸發器，15分鐘後再試一次
    ScriptApp.newTrigger(functionName)
      .timeBased()
      .after(15 * 60 * 1000) 
      .create();
    return;
  }
  
  try {
    const sheets = getSheets();
    const orderSheet = sheets.ORDERS;
  
    const headerMap = ensureHeadersBatch(orderSheet, ["資料來源", "LastUpdated", "Trip", "Status", "狀態", "Version", "單價", "小計"]);
    const sourceColIdx = headerMap["資料來源"];
    const lastUpdatedColIdx = headerMap["LastUpdated"];
    const tripColIdx = headerMap["Trip"];
    const versionColIdx = headerMap["Version"];
    const unitPriceColIdx = headerMap["單價"];
    const subtotalColIdx = headerMap["小計"];
    
    // 取得狀態欄位位置 (自動適配英中文標題，預設降級為 Index 8)
    const statusColIdx = headerMap["Status"] !== undefined ? headerMap["Status"] : 
                         (headerMap["狀態"] !== undefined ? headerMap["狀態"] : 8);
    
    const timeZone = SS.getSpreadsheetTimeZone() || "Asia/Taipei";
    const now = new Date();
    
    // 取得在目標時區 (Asia/Taipei) 下的今天日期與星期幾
    const todayStr = Utilities.formatDate(now, timeZone, "yyyy-MM-dd");
    const todayParts = todayStr.split('-').map(Number);
    const todayDateObj = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
    const currentDayOfWeek = todayDateObj.getDay(); // 0:週日, 1:週一, ..., 6:週六

    // 計算目標建單日期列表：
    // 1. 一般平日（週日～週五）：建單「明天」
    // 2. 星期六（currentDayOfWeek === 6）：
    //    【關鍵業務邏輯】麵廠每週一固定休息，必須在週日凌晨將週日與週一的訂單都製作出來（工作小抄合併計算）。
    //    因此星期六執行自動建單時，必須連同「週日（明天）」與「週一（後天）」的訂單一併生成，避免週日凌晨缺漏生產！
    let targetDateConfigs = [];
    if (Array.isArray(explicitDates) && explicitDates.length > 0) {
      targetDateConfigs = explicitDates.map(ds => {
        const parts = String(ds).split('-').map(Number);
        const dObj = new Date(parts[0], parts[1] - 1, parts[2]);
        return {
          dateObj: dObj,
          dateStr: Utilities.formatDate(dObj, timeZone, "yyyy-MM-dd"),
          dayOfWeek: dObj.getDay()
        };
      });
    } else {
      // 明天 (週日或平日隔天)
      const tomorrowDateObj = new Date(todayDateObj);
      tomorrowDateObj.setDate(todayDateObj.getDate() + 1);
      targetDateConfigs.push({
        dateObj: tomorrowDateObj,
        dateStr: Utilities.formatDate(tomorrowDateObj, timeZone, "yyyy-MM-dd"),
        dayOfWeek: tomorrowDateObj.getDay()
      });

      // 星期六特別加碼：連同週一 (後天) 一起自動生成
      if (currentDayOfWeek === 6) {
        const mondayDateObj = new Date(todayDateObj);
        mondayDateObj.setDate(todayDateObj.getDate() + 2);
        targetDateConfigs.push({
          dateObj: mondayDateObj,
          dateStr: Utilities.formatDate(mondayDateObj, timeZone, "yyyy-MM-dd"),
          dayOfWeek: mondayDateObj.getDay()
        });
      }
    }

    // ==========================================
    // 建立防呆檢查名單 (含日期維度)
    // ==========================================
    const lastRow = orderSheet.getLastRow();
    // 只抓最後 2000 筆，避免歷史資料拖垮效能
    const checkRows = Math.max(0, Math.min(lastRow - 1, 2000)); 
    const existingOrders = checkRows > 0 
      ? orderSheet.getRange(lastRow - checkRows + 1, 1, checkRows, orderSheet.getMaxColumns()).getDisplayValues()
      : [];
    const alreadyGeneratedCustomers = new Set();
    
    // Helper function to normalize time to HH:mm
    const normalizeTimeStr = (t) => {
      if (!t) return "00:00";
      const s = String(t).trim();
      const parts = s.split(":");
      const h = parts[0] ? parts[0].padStart(2, "0") : "00";
      const m = parts[1] ? parts[1].padStart(2, "0") : "00";
      return `${h}:${m}`;
    };

    for (let i = 0; i < existingOrders.length; i++) {
      let rowDate = existingOrders[i][3]; // 第 4 欄 (Index 3) 是出貨日期
      const rowCustomer = String(existingOrders[i][2] || '').trim(); // 第 3 欄 (Index 2) 是客戶名稱
      
      let rowTime = existingOrders[i][4];
      if (rowTime instanceof Date) {
        rowTime = Utilities.formatDate(rowTime, timeZone, "HH:mm");
      } else {
        rowTime = normalizeTimeStr(rowTime);
      }
      
      const rowStatus = String(existingOrders[i][statusColIdx] || '').trim().toUpperCase();
      
      let rowDateStr = "";
      if (rowDate instanceof Date) {
        rowDateStr = Utilities.formatDate(rowDate, timeZone, "yyyy-MM-dd");
      } else {
        rowDateStr = String(rowDate || '').trim().replace(/\//g, "-");
        const dateParts = rowDateStr.split('-');
        if (dateParts.length === 3) {
          rowDateStr = `${dateParts[0]}-${dateParts[1].padStart(2, '0')}-${dateParts[2].padStart(2, '0')}`;
        }
      }
      
      // 將特定出貨日期、客戶名稱與時間記到名單，避免重覆建單
      if (rowDateStr && rowStatus !== 'DELETED') {
        alreadyGeneratedCustomers.add(`${rowDateStr}_${rowCustomer}_${rowTime}`); 
        alreadyGeneratedCustomers.add(`${rowDateStr}_${rowCustomer}_ANY`); 
      }
    }

    // 取代原先的 getData()，避免全表(包含ORDERS)都被載入解析而導致逾時
    const customers = getSheetData(sheets.CUSTOMERS).map(c => ({
      name: c.Name || c.name || c.客戶名稱 || c.客戶名 || '',
      defaultItems: c.DefaultItems || c.defaultItems || c.預設品項JSON || c.預設品項 || '', 
      offDays: c.OffDays || c.offDays || c.公休日週期JSON || c.公休日週期 || '',
      holidayDates: c.HolidayDates || c.holidayDates || c.特定公休日JSON || c.特定公休日 || '',
      deliveryMethod: c.DeliveryMethod || c.deliveryMethod || c.配送方式 || '',
      deliveryTime: c.DeliveryTime || c.deliveryTime || c.配送時間 || '',
      defaultTrip: c.DefaultTrip || c.defaultTrip || c.預設趟數 || c.趟次 || '',
      autoOrderEnabled: String(c.自動建單開關 || c.autoOrderEnabled || '').trim().toLowerCase() === 'true' || c.自動建單開關 === true,
      isPaused: String(c.暫停供貨 || c.isPaused || '').trim().toLowerCase() === 'true' || c.暫停供貨 === true,
      isArchived: String(c.封存 || c.isArchived || '').trim().toLowerCase() === 'true' || c.封存 === true,
      priceList: c.PriceList || c.priceList || c.價目表JSON || c.價目表 || c.專屬價目表 || c.專屬價格 || c.客製化價格JSON || c.客製化價格 || c.自訂價格 || c.客戶價目表 || ''
    }));

    const prodMap = buildGlobalProductMap(sheets);
    
    const newOrderRows = [];
    const timestamp = Utilities.formatDate(new Date(), timeZone, "yyyy/MM/dd HH:mm:ss");
    const lastUpdatedTs = String(new Date().getTime());

    const maxCol = Math.max(
      lastUpdatedColIdx, 
      tripColIdx, 
      sourceColIdx, 
      versionColIdx !== undefined ? versionColIdx : 0,
      unitPriceColIdx !== undefined ? unitPriceColIdx : 0,
      subtotalColIdx !== undefined ? subtotalColIdx : 0
    ) + 1;
    if (orderSheet.getMaxColumns() < maxCol) {
      orderSheet.insertColumnsAfter(orderSheet.getMaxColumns(), maxCol - orderSheet.getMaxColumns());
    }

    // 依序針對每個目標日期建立訂單 (週六時會依序建立週日與週一)
    targetDateConfigs.forEach(targetConfig => {
      const targetDateStr = targetConfig.dateStr;
      const targetDayOfWeek = targetConfig.dayOfWeek;
      const targetDateObj = targetConfig.dateObj;

      customers.forEach(c => {
        // 檢查是否已封存 (永久停業) 或暫停供貨，若是則不建立訂單
        if (c.isArchived || c.isPaused) return;

        const isAutoEnabled = c.autoOrderEnabled;
        if (!isAutoEnabled) return; 

        const defaultItems = typeof c.defaultItems === 'string' ? safeJsonArray(c.defaultItems) : (c.defaultItems || []);
        if (!defaultItems || defaultItems.length === 0) return;
        
        const offDays = typeof c.offDays === 'string' ? safeJsonArray(c.offDays) : (c.offDays || []);
        // 嚴謹比對固定公休：支援數字 0~6、字串 "0"~"6"、或中文如 "一"、"日"
        const isOffDay = offDays.some(h => {
          const str = String(h).trim();
          return str === String(targetDayOfWeek) ||
                 Number(str) === targetDayOfWeek ||
                 (targetDayOfWeek === 0 && (str === '7' || str === '日' || str === '天')) ||
                 (targetDayOfWeek === 1 && (str === '一' || str.includes('一')));
        });
        if (isOffDay) return;
        
        const holidayDates = typeof c.holidayDates === 'string' ? safeJsonArray(c.holidayDates) : (c.holidayDates || []);
        if (holidayDates.includes(targetDateStr)) return;

        // 將預設品項按時間與車趟分群
        const itemsByTimeAndTrip = {};
        defaultItems.forEach(item => {
          const timeKey = item.deliveryTime || c.deliveryTime || "08:00";
          const tripKey = item.trip || c.defaultTrip || "";
          const groupKey = timeKey + "||" + tripKey;
          
          if (!itemsByTimeAndTrip[groupKey]) {
            itemsByTimeAndTrip[groupKey] = [];
          }
          itemsByTimeAndTrip[groupKey].push({
            ...item,
            _time: timeKey,
            _trip: tripKey,
            _hasIndependentTime: !!item.deliveryTime
          });
        });

        Object.keys(itemsByTimeAndTrip).forEach(groupKey => {
          const groupItems = itemsByTimeAndTrip[groupKey];
          const timeKey = normalizeTimeStr(groupItems[0]._time);
          const tripKey = groupItems[0]._trip;
          const cName = String(c.name || '').trim();
          
          // 檢查這個群組內是否含有明確指定「獨立時間」的品項
          const hasIndependentTime = groupItems.some(i => i._hasIndependentTime);
          
          if (!hasIndependentTime) {
            // 情境 A：沒有設定獨立時間 (依靠預設時間)
            // 只要目標日期已有該客戶的「任何一筆訂單」，就不重複建單
            if (alreadyGeneratedCustomers.has(`${targetDateStr}_${cName}_ANY`)) {
              return;
            }
          } else {
            // 情境 B：有設定獨立時間 (例如早班、晚班拆單)
            // 精準比對該目標日期之「獨立時段」是否已有訂單
            if (alreadyGeneratedCustomers.has(`${targetDateStr}_${cName}_${timeKey}`)) {
              return;
            }
          }
          
          const orderId = "AUTO-" + Utilities.formatDate(targetDateObj, timeZone, "MMdd") + "-" + Math.floor(Math.random() * 10000);

          groupItems.forEach(item => {
            let productName = item.productName || item.productId; // Fallback
            
            // O(1) 從全域商品字典抓預設資料
            const globalProduct = prodMap.get(String(item.productId || '').toLowerCase()) || prodMap.get(String(item.productName || '').toLowerCase());
            if (globalProduct) {
              productName = globalProduct.name;
            }

            const qty = Number(item.quantity) || 1;
            const unit = item.unit || "斤";

            // ✨ 自動計算「單價」與「小計」：優先匹配客戶專屬價目表，若無則降級套用商品預設單價
            let custPriceList = c.priceList;
            if (typeof custPriceList === 'string') {
              try { 
                custPriceList = JSON.parse(custPriceList); 
                if (typeof custPriceList === 'string') {
                  try { custPriceList = JSON.parse(custPriceList); } catch (e) {}
                }
              } catch (e) { custPriceList = null; }
            }
            const custInfo = { ...c, priceList: custPriceList };
            const unitPrice = resolveItemPriceForCustomer(custInfo, item, prodMap, productName);

            let subtotal = "";
            if (unit === '元') {
              subtotal = qty;
            } else if (unitPrice !== "" && typeof unitPrice === 'number') {
              subtotal = Math.round(unitPrice * qty * 100) / 100;
            }

            const row = new Array(maxCol).fill("");
            row[0] = timestamp;
            row[1] = orderId;
            row[2] = c.name;
            row[3] = targetDateStr;
            row[4] = timeKey;
            row[5] = productName;
            row[6] = qty;
            row[7] = ""; // 備註先留空
            row[8] = "PENDING";
            row[9] = c.deliveryMethod || "";
            row[10] = unit;
            row[lastUpdatedColIdx] = lastUpdatedTs;
            if (tripColIdx !== undefined) row[tripColIdx] = tripKey;
            if (sourceColIdx !== undefined) row[sourceColIdx] = "🤖 自動建單";
            if (versionColIdx !== undefined) row[versionColIdx] = 1;
            if (unitPriceColIdx !== undefined) row[unitPriceColIdx] = unitPrice;
            if (subtotalColIdx !== undefined) row[subtotalColIdx] = subtotal;
            
            newOrderRows.push(row);
          });

          // 當前批次建好後，立即加入已建單防呆名單
          alreadyGeneratedCustomers.add(`${targetDateStr}_${cName}_ANY`);
          alreadyGeneratedCustomers.add(`${targetDateStr}_${cName}_${timeKey}`);
        });
      });
    });

    if (newOrderRows.length > 0) {
      const lastRow = orderSheet.getLastRow();
      safeSetValues(orderSheet, lastRow + 1, 1, newOrderRows);
    }

    return {
      success: true,
      createdRows: newOrderRows.length,
      targetDates: targetDateConfigs.map(t => t.dateStr)
    };
    
  } finally {
    SpreadsheetApp.flush(); // 強制將快取變更寫入 Sheets，確保後續 Lock 拿到最新資料
    lock.releaseLock();
    
    // ▼ ▼ ▼ 建單完成後通知所有前端拉取最新資料 ▼ ▼ ▼
    notifyFirebase(); 
  }
}

// 🏠 門鈴發送器：負責發送 PATCH 請求到 Firebase，並視設定同步 Edge 輕量鏡像
function notifyFirebase(opts) {
  const props = PropertiesService.getScriptProperties();
  const baseUrl = String(props.getProperty("EDGE_FIREBASE_DB_URL") || "https://orderapp-sync-default-rtdb.asia-southeast1.firebasedatabase.app").replace(/\/+$/, "");
  const fbAuth = String(props.getProperty("EDGE_FIREBASE_DB_AUTH") || "").trim();
  const authQuery = fbAuth ? ("?auth=" + encodeURIComponent(fbAuth)) : "";

  const firebaseUrl = baseUrl + "/sync.json" + authQuery;
  const payload = {
    lastUpdateTime: new Date().getTime()
  };
  const options = {
    method: "patch",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  try {
    UrlFetchApp.fetch(firebaseUrl, options);
  } catch (e) {
    console.error("按門鈴失敗", e);
  }

  // 若已啟用 Edge 鏡像同步，根據異動類型做輕量範圍更新
  try {
    const mirrorEnabled = props.getProperty("EDGE_MIRROR_ENABLED") === "1" || Boolean(props.getProperty("EDGE_SHARED_SECRET"));
    if (mirrorEnabled) {
      const act = opts && opts.action ? String(opts.action) : '';
      const syncUsers = !act || act === 'saveUser' || act === 'bindLiffAccount';
      const syncCustomers = !act || act === 'updateCustomer' || act === 'deleteCustomer';
      const syncOrders = !act || !['saveUser', 'bindLiffAccount', 'updateCustomer', 'deleteCustomer', 'saveSettings', 'updateProduct', 'deleteProduct', 'reorderProducts', 'saveTrips'].includes(act);
      if (syncUsers || syncCustomers || syncOrders) {
        syncEdgeMirrorToFirebase({
          force: true,
          users: syncUsers,
          customers: syncCustomers,
          orders: syncOrders
        });
      }
    }
  } catch (mirrorErr) {
    console.warn("Edge mirror background sync warning:", mirrorErr);
  }
}

// 監聽手動編輯事件：將會綁定到觸發器上
function onSpreadsheetEdit(e) {
  try {
    // 確保有事件物件 e 以及範圍 range
    if (e && e.range) {
      const sheet = e.range.getSheet();
      const sheetName = sheet.getName();
      
      // 只有當編輯這三個會被同步的表單時，才去更新 LastUpdated
      if (["ORDERS", "CUSTOMERS", "PRODUCTS"].includes(sheetName)) {
        // 抓取第一列的標題，來找出 LastUpdated 在第幾個直行
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const lastUpdatedColIdx = headers.indexOf("LastUpdated");
        
        // 如果有成功找到這個欄位
        if (lastUpdatedColIdx !== -1) {
          const startRow = e.range.getRow();
          const numRows = e.range.getNumRows();
          const modifiedCol = e.range.getColumn();
          
          // 確保您改的不是標題列 (startRow > 1)
          // 確保修改的不是 LastUpdated 欄位自己 (避免無限迴圈)
          if (startRow > 1 && modifiedCol !== (lastUpdatedColIdx + 1)) {
            const currentTs = new Date().getTime();
            // 自動把被編輯的那一列的 LastUpdated 更新為當下的時間戳記！
            sheet.getRange(startRow, lastUpdatedColIdx + 1, numRows, 1).setValue(currentTs).setNumberFormat('0');
          }
        }
      }
    }
  } catch (err) {
    console.error("自動更新 LastUpdated 發生錯誤:", err);
  }

  // 清除對應快取確保 LINE / 前端讀取最新資料
  invalidateLineCaches({ orders: true, customers: true, products: true });

  // 做完時間戳記更新後，如同往常一樣按門鈴發送推播通知給前端
  notifyFirebase();
}

// 🔔 專門處理 API 或 LINE 機器人自動寫入的「變更」事件
function onSpreadsheetChange(e) {
  try {
    const sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
    const currentTs = new Date().getTime();
    let isUpdated = false;

    // 建立客戶預設配送時間查詢表 (Customer Time Map)
    let customerTimeMap = {};
    const custSheet = sheets.find(s => ["CUSTOMERS", "Customers"].includes(s.getName()));
    if (custSheet && custSheet.getLastRow() > 1 && custSheet.getLastColumn() > 0) {
      const cHeaders = custSheet.getRange(1, 1, 1, custSheet.getLastColumn()).getValues()[0];
      const cNameIdx = cHeaders.findIndex(h => ["Name", "name", "客戶名", "客戶名稱"].includes(String(h).trim()));
      const cTimeIdx = cHeaders.findIndex(h => ["DeliveryTime", "deliveryTime", "配送時間"].includes(String(h).trim()));
      if (cNameIdx !== -1 && cTimeIdx !== -1) {
        const custData = custSheet.getRange(2, 1, custSheet.getLastRow() - 1, custSheet.getLastColumn()).getValues();
        custData.forEach(row => {
          const cName = String(row[cNameIdx] || '').trim();
          const cTime = String(row[cTimeIdx] || '').trim();
          if (cName && cTime) {
            customerTimeMap[cName] = cTime;
          }
        });
      }
    }

    // 巡視這三個需要同步的表單
    ["ORDERS", "CUSTOMERS", "PRODUCTS"].forEach(sheetName => {
      const sheet = sheets.find(s => s.getName() === sheetName);
      if (!sheet) return;
      
      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      if (lastRow <= 1 || lastCol === 0) return;

      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      const lastUpdatedColIdx = headers.indexOf("LastUpdated");
      
      // 若為 ORDERS 表，檢查是否有空缺配送時間或空缺單價/小計 (例如由 LINE 搬入或外部 API 寫入)
      if (sheetName === "ORDERS") {
        const custColIdx = headers.findIndex(h => ["客戶名", "customerName", "CustomerName", "客戶名稱"].includes(String(h).trim()));
        const timeColIdx = headers.findIndex(h => ["配送時間", "deliveryTime", "DeliveryTime"].includes(String(h).trim()));
        const prodColIdx = headers.findIndex(h => ["品項", "品項名稱", "ProductName", "productName"].includes(String(h).trim()));
        const qtyColIdx = headers.findIndex(h => ["數量", "Quantity", "quantity"].includes(String(h).trim()));
        const unitColIdx = headers.findIndex(h => ["單位", "Unit", "unit"].includes(String(h).trim()));
        const priceColIdx = headers.findIndex(h => ["單價", "UnitPrice", "unitPrice"].includes(String(h).trim()));
        const subtotalColIdx = headers.findIndex(h => ["小計", "Subtotal", "subtotal"].includes(String(h).trim()));
        
        if (custColIdx !== -1 && (timeColIdx !== -1 || priceColIdx !== -1)) {
          const orderValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
          let orderModified = false;
          let prodMap = null;
          let fullCustMap = null;

          orderValues.forEach((row) => {
            const rowCust = String(row[custColIdx] || '').trim();
            // 補配送時間
            if (timeColIdx !== -1) {
              const rowTime = String(row[timeColIdx] || '').trim();
              if (!rowTime && customerTimeMap[rowCust]) {
                row[timeColIdx] = customerTimeMap[rowCust];
                orderModified = true;
              }
            }

            // 補單價與小計
            if (priceColIdx !== -1 && subtotalColIdx !== -1 && prodColIdx !== -1 && qtyColIdx !== -1) {
              const currentPrice = row[priceColIdx];
              const currentSubtotal = row[subtotalColIdx];
              const rowProd = String(row[prodColIdx] || '').trim();
              const rowQty = Number(row[qtyColIdx]) || 1;
              const rowUnit = unitColIdx !== -1 ? String(row[unitColIdx] || '').trim() : '斤';

              if ((currentPrice === "" || currentPrice === null || currentPrice === undefined) && rowProd && rowCust) {
                if (!prodMap) {
                  prodMap = buildGlobalProductMap(sheets);
                  fullCustMap = buildFullCustomerMap(sheets);
                }
                const cInfo = fullCustMap[rowCust.toLowerCase()] || fullCustMap[rowCust] || null;
                const price = resolveItemPriceForCustomer(cInfo, rowProd, prodMap);
                if (price !== "" && typeof price === 'number') {
                  row[priceColIdx] = price;
                  row[subtotalColIdx] = (rowUnit === '元') ? rowQty : Math.round(price * rowQty * 100) / 100;
                  orderModified = true;
                }
              } else if ((currentSubtotal === "" || currentSubtotal === null || currentSubtotal === undefined) && currentPrice !== "" && !isNaN(Number(currentPrice))) {
                row[subtotalColIdx] = (rowUnit === '元') ? rowQty : Math.round(Number(currentPrice) * rowQty * 100) / 100;
                orderModified = true;
              }
            }
          });

          if (orderModified) {
            sheet.getRange(2, 1, orderValues.length, lastCol).setValues(orderValues);
            isUpdated = true;
          }
        }
      }

      if (lastUpdatedColIdx !== -1) {
        // 抓取整個 LastUpdated 欄道的值
        const lastUpdatedValues = sheet.getRange(2, lastUpdatedColIdx + 1, lastRow - 1, 1).getValues();
        let modified = false;
        const newColValues = lastUpdatedValues.map(row => {
          if (!row[0]) {
            modified = true;
            return [currentTs]; // 補上新的時間戳
          }
          return [row[0]]; // 保留舊的時間戳
        });

        if (modified) {
          // [效能最佳化 / 避免 Quota 耗盡]
          // 捨棄迴圈中多次調用 setValue() 的舊做法，改將整個直行的資料讀入記憶體修改後，
          // 使用 setValues()「一發入魂寫回」 (In-Memory Bulk Write)，將時間降至 1 秒內。
          sheet.getRange(2, lastUpdatedColIdx + 1, newColValues.length, 1).setValues(newColValues).setNumberFormat('0');
          isUpdated = true;
        }
      }
    });

    // 如果有幫任何一行補上時間戳記，或確實有新增資料的動作，就去按門鈴
    if (isUpdated || (e && e.changeType === 'INSERT_ROW')) {
      notifyFirebase();
    }
  } catch (err) {
    console.error("自動檢查空白 LastUpdated 發生錯誤:", err);
  }
}

/**
 * 輔助函式：建立商品字典查詢表 (支援以 Product ID 或 Product Name 查詢)
 */
function buildGlobalProductMap(sheets) {
  const prodMap = new Map();
  const prodSheet = (Array.isArray(sheets) ? sheets.find(s => ["PRODUCTS", "Products"].includes(s.getName())) : sheets.PRODUCTS) ||
                    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("PRODUCTS") ||
                    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Products");
  
  if (prodSheet && prodSheet.getLastRow() > 1 && prodSheet.getLastColumn() > 0) {
    const pHeaders = prodSheet.getRange(1, 1, 1, prodSheet.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
    const pIdIdx = pHeaders.findIndex(h => ["ID", "id", "商品ID", "產品ID"].includes(h));
    const pNameIdx = pHeaders.findIndex(h => ["Name", "name", "品項", "商品名稱", "產品名"].includes(h));
    const pPriceIdx = pHeaders.findIndex(h => ["Price", "price", "單價", "預設單價"].includes(h));
    const pUnitIdx = pHeaders.findIndex(h => ["Unit", "unit", "單位"].includes(h));
    
    const pRows = prodSheet.getRange(2, 1, prodSheet.getLastRow() - 1, prodSheet.getLastColumn()).getValues();
    pRows.forEach(r => {
      const id = pIdIdx !== -1 ? String(r[pIdIdx] || '').trim() : '';
      const name = pNameIdx !== -1 ? String(r[pNameIdx] || '').trim() : '';
      const price = pPriceIdx !== -1 ? (Number(r[pPriceIdx]) || 0) : 0;
      const unit = pUnitIdx !== -1 ? String(r[pUnitIdx] || '').trim() : '斤';
      const item = { id, name, price, unit };
      if (id) prodMap.set(id.toLowerCase(), item);
      if (name) prodMap.set(name.toLowerCase(), item);
    });
  }
  return prodMap;
}

/**
 * 輔助函式：建立完整客戶字典查詢表 (含配送時間、方式、趟次、客製價目表)
 */
function buildFullCustomerMap(sheets) {
  const custMap = {};
  const custSheet = (Array.isArray(sheets) ? sheets.find(s => ["CUSTOMERS", "Customers"].includes(s.getName())) : sheets.CUSTOMERS) ||
                    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CUSTOMERS") ||
                    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Customers");
  
  if (custSheet && custSheet.getLastRow() > 1 && custSheet.getLastColumn() > 0) {
    const cHeaders = custSheet.getRange(1, 1, 1, custSheet.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
    const cNameIdx = cHeaders.findIndex(h => ["Name", "name", "客戶名", "客戶名稱"].includes(h));
    const cTimeIdx = cHeaders.findIndex(h => ["DeliveryTime", "deliveryTime", "配送時間"].includes(h));
    const cMethodIdx = cHeaders.findIndex(h => ["DeliveryMethod", "deliveryMethod", "配送方式"].includes(h));
    const cTripIdx = cHeaders.findIndex(h => ["DefaultTrip", "defaultTrip", "預設趟數", "趟次"].includes(h));
    const cPriceIdx = cHeaders.findIndex(h => ["PriceList", "priceList", "價目表JSON", "價目表", "專屬價目表", "專屬價格", "客製化價格JSON", "客製化價格", "自訂價格", "客戶價目表"].includes(h));
    
    const cRows = custSheet.getRange(2, 1, custSheet.getLastRow() - 1, custSheet.getLastColumn()).getValues();
    cRows.forEach(r => {
      const name = cNameIdx !== -1 ? String(r[cNameIdx] || '').trim() : '';
      if (name) {
        let priceList = null;
        if (cPriceIdx !== -1 && r[cPriceIdx]) {
          try {
            priceList = typeof r[cPriceIdx] === 'string' ? JSON.parse(r[cPriceIdx]) : r[cPriceIdx];
            if (typeof priceList === 'string') {
              try { priceList = JSON.parse(priceList); } catch (e) {}
            }
          } catch (e) {
            priceList = null;
          }
        }
        custMap[name.toLowerCase()] = {
          name: name,
          deliveryTime: cTimeIdx !== -1 ? String(r[cTimeIdx] || '').trim() : '',
          deliveryMethod: cMethodIdx !== -1 ? String(r[cMethodIdx] || '').trim() : '',
          defaultTrip: cTripIdx !== -1 ? String(r[cTripIdx] || '').trim() : '',
          priceList: priceList
        };
      }
    });
  }
  return custMap;
}

/**
 * 輔助函式：根據客戶與品項查詢最適單價
 * 1. 優先查客戶專屬價目表 (priceList / 專屬價格)
 * 2. 次查預設品項自訂單價 (item.price)
 * 3. 最後查商品表預設單價 (PRODUCTS 零售價格)
 */
function resolveItemPriceForCustomer(custInfo, prodItemOrKey, prodMap, fallbackName) {
  let cleanKey = "";
  let itemDefaultPrice = null;

  if (typeof prodItemOrKey === 'object' && prodItemOrKey !== null) {
    cleanKey = String(prodItemOrKey.productId || prodItemOrKey.id || prodItemOrKey.productName || prodItemOrKey.name || fallbackName || '').trim();
    if (prodItemOrKey.price !== undefined && prodItemOrKey.price !== null && prodItemOrKey.price !== '' && !isNaN(Number(prodItemOrKey.price)) && Number(prodItemOrKey.price) > 0) {
      itemDefaultPrice = Number(prodItemOrKey.price);
    } else if (prodItemOrKey.unitPrice !== undefined && prodItemOrKey.unitPrice !== null && prodItemOrKey.unitPrice !== '' && !isNaN(Number(prodItemOrKey.unitPrice)) && Number(prodItemOrKey.unitPrice) > 0) {
      itemDefaultPrice = Number(prodItemOrKey.unitPrice);
    }
  } else {
    cleanKey = String(prodItemOrKey || fallbackName || '').trim();
  }

  if (!cleanKey) return "";

  const cleanKeyLower = cleanKey.toLowerCase();
  const matchedProd = prodMap ? (prodMap.get(cleanKeyLower) || (fallbackName ? prodMap.get(String(fallbackName).trim().toLowerCase()) : null)) : null;
  const prodId = matchedProd ? matchedProd.id.toLowerCase() : cleanKeyLower;
  const prodName = matchedProd ? matchedProd.name.toLowerCase() : (fallbackName ? String(fallbackName).trim().toLowerCase() : cleanKeyLower);

  let unitPrice = null;

  // 1. 優先查客戶專屬價目表 (priceList)
  if (custInfo) {
    let pl = custInfo.priceList;
    if (typeof pl === 'string') {
      try {
        pl = JSON.parse(pl);
        if (typeof pl === 'string') {
          try { pl = JSON.parse(pl); } catch (e) {}
        }
      } catch (e) {
        pl = null;
      }
    }

    if (Array.isArray(pl) && pl.length > 0) {
      const found = pl.find(p => {
        if (!p) return false;
        const candidates = [
          String(p.productId || ''),
          String(p.id || ''),
          String(p.productName || ''),
          String(p.name || ''),
          String(p.品項 || ''),
          String(p.商品名稱 || '')
        ].map(s => s.trim().toLowerCase()).filter(Boolean);

        const targets = [prodId, prodName, cleanKeyLower];
        if (fallbackName) targets.push(String(fallbackName).trim().toLowerCase());
        
        return candidates.some(c => targets.includes(c));
      });

      if (found) {
        const rawP = found.price !== undefined ? found.price : (found.unitPrice !== undefined ? found.unitPrice : (found.單價 !== undefined ? found.單價 : found.專屬價格));
        if (rawP !== undefined && rawP !== null && rawP !== '' && !isNaN(Number(rawP))) {
          unitPrice = Number(rawP);
        }
      }
    } else if (typeof pl === 'object' && pl !== null) {
      const keysToCheck = [prodId, cleanKeyLower, prodName];
      if (fallbackName) keysToCheck.push(String(fallbackName).trim().toLowerCase());
      for (const k of keysToCheck) {
        if (k && pl[k] !== undefined && pl[k] !== null && pl[k] !== '' && !isNaN(Number(pl[k]))) {
          unitPrice = Number(pl[k]);
          break;
        }
      }
    }
  }

  // 2. 若專屬價目表未設定，但預設品項有自訂價格 (item.price)
  if ((unitPrice === null || isNaN(unitPrice)) && itemDefaultPrice !== null) {
    unitPrice = itemDefaultPrice;
  }

  // 3. 次查商品表預設單價 (PRODUCTS 零售價格)
  if ((unitPrice === null || isNaN(unitPrice)) && matchedProd && matchedProd.price !== undefined && matchedProd.price !== null && matchedProd.price !== '') {
    unitPrice = Number(matchedProd.price);
  }

  return (unitPrice !== null && !isNaN(unitPrice) && unitPrice >= 0) ? unitPrice : "";
}

/**
 * 搬移並同步 LINE 訂單至主訂單表 (ORDERS)
 * 智能判定配送時間：
 * 情況 A: LINE 訂單有指定時間 -> 保留指定時間
 * 情況 B: LINE 訂單無時間，但該店家有預設時間 -> 自動帶入店家預設時間 (如 08:00)
 * 情況 C: 皆無時間 -> 保留空白
 * 
 * ✨ 核心強化：自動根據客戶專屬價目表或商品預設單價，為 LINE 訂單自動添加「單價」以及「小計」！
 */
function syncLineOrders() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lineSheet = ss.getSheetByName("LINE_ORDERS") || ss.getSheetByName("LineOrders");
    if (!lineSheet || lineSheet.getLastRow() <= 1) {
      return { success: true, count: 0, message: "無待處理的 LINE 訂單" };
    }

    const orderSheet = ss.getSheetByName("ORDERS") || ss.getSheetByName("Orders");
    const sheets = ss.getSheets();

    // 1. 建立商品與客戶字典
    const prodMap = buildGlobalProductMap(sheets);
    const custMap = buildFullCustomerMap(sheets);

    // 2. 讀取 LINE 訂單資料
    const lineHeaders = lineSheet.getRange(1, 1, 1, lineSheet.getLastColumn()).getValues()[0];
    const getLCol = (names, fallback = -1) => {
      const idx = lineHeaders.findIndex(h => names.includes(String(h).trim()));
      return idx !== -1 ? idx : fallback;
    };

    const lCustIdx = getLCol(["客戶名", "客戶名稱", "customerName", "CustomerName"]);
    const lDateIdx = getLCol(["配送日期", "deliveryDate", "DeliveryDate"]);
    const lTimeIdx = getLCol(["配送時間", "deliveryTime", "DeliveryTime"]);
    const lProdIdx = getLCol(["品項", "產品名", "productName", "ProductName"]);
    const lQtyIdx = getLCol(["數量", "quantity", "Quantity"]);
    const lUnitIdx = getLCol(["單位", "unit", "Unit"]);
    const lNoteIdx = getLCol(["備註", "note", "Note"]);

    const lineRows = lineSheet.getRange(2, 1, lineSheet.getLastRow() - 1, lineSheet.getLastColumn()).getValues();
    if (lineRows.length === 0) return { success: true, count: 0 };

    const headerMap = ensureHeadersBatch(orderSheet, ["LastUpdated", "Trip", "資料來源", "Version", "單價", "小計"]);
    const maxCol = Math.max(...Object.values(headerMap)) + 1;
    const currentTs = String(Date.now());
    const timestamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy/MM/dd HH:mm:ss");

    const newOrderRows = [];
    lineRows.forEach(lRow => {
      const custName = String(lRow[lCustIdx] || '').trim();
      if (!custName) return;

      const rawDate = lDateIdx !== -1 ? lRow[lDateIdx] : '';
      let deliveryDate = rawDate;
      if (rawDate instanceof Date) {
        deliveryDate = Utilities.formatDate(rawDate, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");
      }

      const custInfo = custMap[custName.toLowerCase()] || custMap[custName] || null;

      // 智能判定配送時間：優先使用 LINE 指定時間，若無則套用店家預設時間
      let lineDeliveryTime = lTimeIdx !== -1 ? String(lRow[lTimeIdx] || '').trim() : '';
      if (!lineDeliveryTime && custInfo?.deliveryTime) {
        lineDeliveryTime = custInfo.deliveryTime;
      }

      const prodName = lProdIdx !== -1 ? String(lRow[lProdIdx] || '').trim() : '';
      const qty = lQtyIdx !== -1 ? Number(lRow[lQtyIdx]) || 1 : 1;
      const unit = lUnitIdx !== -1 ? (String(lRow[lUnitIdx] || '').trim() || "斤") : "斤";

      // ✨ 計算單價與小計
      const unitPrice = resolveItemPriceForCustomer(custInfo, prodName, prodMap);
      let subtotal = "";
      if (unit === '元') {
        subtotal = qty;
      } else if (unitPrice !== "" && typeof unitPrice === 'number') {
        subtotal = Math.round(unitPrice * qty * 100) / 100;
      }

      const row = new Array(maxCol).fill("");
      row[0] = timestamp;
      row[1] = "LINE-" + Utilities.getUuid().slice(0, 8);
      row[2] = custName;
      row[3] = deliveryDate;
      row[4] = lineDeliveryTime;
      row[5] = prodName;
      row[6] = qty;
      row[7] = lNoteIdx !== -1 ? String(lRow[lNoteIdx] || '').trim() : '';
      row[8] = "PENDING";
      row[9] = custInfo?.deliveryMethod || "";
      row[10] = unit;
      row[headerMap["LastUpdated"]] = currentTs;
      if (headerMap["Trip"] !== undefined) {
        row[headerMap["Trip"]] = custInfo?.defaultTrip || "";
      }
      row[headerMap["資料來源"]] = "💬 LINE 訂單";
      row[headerMap["Version"]] = 1;
      if (headerMap["單價"] !== undefined) {
        row[headerMap["單價"]] = unitPrice;
      }
      if (headerMap["小計"] !== undefined) {
        row[headerMap["小計"]] = subtotal;
      }

      newOrderRows.push(row);
    });

    if (newOrderRows.length > 0) {
      safeSetValues(orderSheet, orderSheet.getLastRow() + 1, 1, newOrderRows);
      // 清空已搬移的 LINE_ORDERS
      lineSheet.deleteRows(2, lineRows.length);
      notifyFirebase();
    }

    return { success: true, count: newOrderRows.length };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 🛠️ 歷史訂單「單價」與「小計」一鍵批次補齊函式：
 * 針對 Orders 試算表中所有單價或小計為空的歷史訂單（包含先前進來的 LINE 訂單），
 * 自動根據客戶專屬價目表與商品表預設單價，一次性批次補齊並寫入試算表！
 * 
 * 使用方式：在 Apps Script 頂部函式選單選取「backfillMissingOrderPrices」並點擊「執行」即可。
 */
function backfillMissingOrderPrices() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const orderSheet = ss.getSheetByName("Orders") || ss.getSheetByName("ORDERS");
  if (!orderSheet || orderSheet.getLastRow() <= 1) {
    console.log("Orders 表無資料。");
    return { success: true, updatedCount: 0 };
  }

  const headerMap = ensureHeadersBatch(orderSheet, ["LastUpdated", "Trip", "資料來源", "Version", "單價", "小計"]);
  const lastRow = orderSheet.getLastRow();
  const lastCol = orderSheet.getLastColumn();
  const values = orderSheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0].map(h => String(h || '').trim());

  const custColIdx = headers.findIndex(h => ["客戶名", "customerName", "CustomerName", "客戶名稱"].includes(h));
  const prodColIdx = headers.findIndex(h => ["品項", "品項名稱", "ProductName", "productName"].includes(h));
  const qtyColIdx = headers.findIndex(h => ["數量", "Quantity", "quantity"].includes(h));
  const unitColIdx = headers.findIndex(h => ["單位", "Unit", "unit"].includes(h));
  const priceColIdx = headerMap["單價"];
  const subtotalColIdx = headerMap["小計"];

  const sheets = ss.getSheets();
  const prodMap = buildGlobalProductMap(sheets);
  const custMap = buildFullCustomerMap(sheets);

  let updatedCount = 0;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const custName = custColIdx !== -1 ? String(row[custColIdx] || '').trim() : '';
    const prodName = prodColIdx !== -1 ? String(row[prodColIdx] || '').trim() : '';
    const qty = qtyColIdx !== -1 ? Number(row[qtyColIdx]) || 1 : 1;
    const unit = unitColIdx !== -1 ? String(row[unitColIdx] || '').trim() : '斤';
    const currentPrice = row[priceColIdx];
    const currentSubtotal = row[subtotalColIdx];

    if ((currentPrice === "" || currentPrice === null || currentPrice === undefined) && custName && prodName) {
      const cInfo = custMap[custName.toLowerCase()] || custMap[custName] || null;
      const price = resolveItemPriceForCustomer(cInfo, prodName, prodMap);
      if (price !== "" && typeof price === 'number') {
        row[priceColIdx] = price;
        row[subtotalColIdx] = (unit === '元') ? qty : Math.round(price * qty * 100) / 100;
        updatedCount++;
      }
    } else if ((currentSubtotal === "" || currentSubtotal === null || currentSubtotal === undefined) && currentPrice !== "" && !isNaN(Number(currentPrice))) {
      row[subtotalColIdx] = (unit === '元') ? qty : Math.round(Number(currentPrice) * qty * 100) / 100;
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    safeSetValues(orderSheet, 2, 1, values.slice(1));
    SpreadsheetApp.flush();
    try { CacheService.getScriptCache().remove("APP_CACHE_CPT"); } catch(e) {}
    console.log(`✅ 已成功為 ${updatedCount} 列訂單補齊單價與小計！`);
  } else {
    console.log("所有訂單皆已有單價與小計，無需補齊。");
  }

  return { success: true, updatedCount };
}

function isCancelledOrderStatus(status) {
  const s = String(status || '').trim().toUpperCase();
  return s === 'CANCELLED' || s === '已取消' || s === '作廢';
}

function isCompletedOrderStatus(status) {
  const s = String(status || '').trim().toUpperCase();
  return s === 'COMPLETED' || s === 'PAID' || s === '已送達' || s === '已結清' || s === '已完成';
}

function isPositiveOrderCondition(status) {
  return status === 'ACTIVE_ORDERS' || status === 'READY_OR_PENDING' || status === 'UNASSIGNED' || status === 'HAS_PRODUCT';
}

function getStaffInfoMap() {
  const map = {};
  try {
    const res = handleGetStaffList({ role: 'admin' });
    const list = (res && res.staff) ? res.staff : [];
    list.forEach(s => {
      if (s.userId) map[String(s.userId).trim().toLowerCase()] = s;
      if (s.username) map[String(s.username).trim().toLowerCase()] = s;
    });
  } catch (e) {}
  return map;
}

function splitLineMessageChunks(text, maxLen) {
  const limit = maxLen || 3800;
  if (!text || text.length <= limit) return [text];
  const sections = text.split('\n──────────\n');
  const chunks = [];
  let current = '';

  sections.forEach((sec, idx) => {
    const piece = idx === 0 ? sec : '\n──────────\n' + sec;
    if ((current + piece).length > limit && current.length > 0) {
      chunks.push(current);
      current = sec;
    } else {
      current += piece;
    }
  });
  if (current) chunks.push(current);

  if (chunks.length > 1) {
    return chunks.map((c, i) => `(${i + 1}/${chunks.length})\n` + c);
  }
  return chunks;
}

function buildDeliveryManifestText(rule, ordersList, customerByNameMap, targetDatesText, formattedTimeStr, recipientSubHeader) {
  const priorityIds = new Set((rule.priorityCustomerIds || []).map(String));
  const groupedMap = {};

  ordersList.forEach(o => {
    const cName = String(o.customerName || '未命名店家').trim();
    const cust = customerByNameMap[cName];
    const custId = cust ? String(cust.id || '') : '';
    const isPriority = priorityIds.has(custId);
    const key = `${o.deliveryDate || ''}__${cName}`;

    if (!groupedMap[key]) {
      groupedMap[key] = {
        customerName: cName,
        customerId: custId,
        isPriority: isPriority,
        deliveryDate: o.deliveryDate || '',
        deliveryTime: o.deliveryTime || (cust ? cust.deliveryTime : '') || '',
        trip: o.trip || (cust ? cust.defaultTrip : '') || '',
        deliveryMethod: o.deliveryMethod || (cust ? cust.deliveryMethod : '') || '',
        items: [],
        notes: []
      };
    }

    const pName = o.productName || (o.product && o.product.name) || '未命名品項';
    const qty = Number(o.quantity) || 0;
    const unit = o.unit || '';
    groupedMap[key].items.push({ productName: pName, quantity: qty, unit: unit });

    const noteStr = String(o.note || '').trim();
    if (noteStr && !groupedMap[key].notes.includes(noteStr)) {
      groupedMap[key].notes.push(noteStr);
    }
  });

  const customerBlocks = Object.values(groupedMap).sort((a, b) => {
    if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
    const tripCompare = String(a.trip || 'zzz').localeCompare(String(b.trip || 'zzz'), 'zh-Hant');
    if (tripCompare !== 0) return tripCompare;
    const timeCompare = String(a.deliveryTime || '99:99').localeCompare(String(b.deliveryTime || '99:99'));
    if (timeCompare !== 0) return timeCompare;
    return a.customerName.localeCompare(b.customerName, 'zh-Hant');
  });

  const itemTotalsMap = {};
  const lines = [];

  customerBlocks.forEach(block => {
    const prefix = block.isPriority ? '🚨【重點必送】' : '▸ ';
    const metaParts = [];
    if (block.trip) metaParts.push(block.trip);
    if (block.deliveryTime) metaParts.push(block.deliveryTime);
    if (block.deliveryMethod && block.deliveryMethod !== '外送') metaParts.push(block.deliveryMethod);
    const metaStr = metaParts.length > 0 ? ` (${metaParts.join(' ')})` : '';

    // 合併同店家相同品項
    const mergedItems = {};
    block.items.forEach(it => {
      const iKey = `${it.productName}__${it.unit}`;
      if (!mergedItems[iKey]) {
        mergedItems[iKey] = { productName: it.productName, quantity: 0, unit: it.unit };
      }
      mergedItems[iKey].quantity += it.quantity;

      if (!itemTotalsMap[iKey]) {
        itemTotalsMap[iKey] = { productName: it.productName, quantity: 0, unit: it.unit };
      }
      itemTotalsMap[iKey].quantity += it.quantity;
    });

    let blockText = `${prefix}${block.customerName}${metaStr}`;
    Object.values(mergedItems).forEach(it => {
      blockText += `\n  • ${it.productName} × ${it.quantity}${it.unit}`;
    });
    if (block.notes.length > 0) {
      blockText += `\n  📝 備註：${block.notes.join(' / ')}`;
    }
    lines.push(blockText);
  });

  let header = `【${rule.name}】\n`;
  header += `📅 配送日：${targetDatesText}（共 ${customerBlocks.length} 家 / ${ordersList.length} 筆明細）\n`;
  if (recipientSubHeader) {
    header += `${recipientSubHeader}\n`;
  }
  header += `🕒 通知時間：${formattedTimeStr}\n`;
  header += `━━━━━━━━━━━━━━\n`;

  let body = lines.join('\n──────────\n');

  let footer = '';
  if (rule.includeItemTotals !== false) {
    const totalsArr = Object.values(itemTotalsMap).map(it => `${it.productName} ${it.quantity}${it.unit}`);
    if (totalsArr.length > 0) {
      footer += `\n━━━━━━━━━━━━━━\n📦 總備貨小計：\n${totalsArr.join('、')}`;
    }
  }

  if (rule.customMessage) {
    let msg = rule.customMessage
      .replace(/{日期}/g, targetDatesText)
      .replace(/{{日期}}/g, targetDatesText)
      .replace(/{總店數}/g, String(customerBlocks.length))
      .replace(/{總單數}/g, String(ordersList.length));
    footer += `\n\n${msg}`;
  }

  return header + body + footer;
}

// 🔔 Notification Center Check (Intended for Time-Driven Trigger)
// Runs periodically (e.g. hourly) to evaluate rules and send notifications
function checkReminders(forceRuleIdOrEvent = null, isDryRun = false) {
  // 1. 設置碼表 (GAS 極限是 360 秒，我們設 280 秒也就是 4.6 分鐘就準備收尾)
  const START_TIME = Date.now();
  const TIME_LIMIT = 280000; 

  let forceRuleId = forceRuleIdOrEvent;
  let triggerSource = "MANUAL_TEST";

  if (forceRuleId !== null && typeof forceRuleId === 'object') {
    // 如果傳進來的是一個物件，代表它是被時間觸發器喚醒的
    triggerSource = "SYSTEM_CRON";
    forceRuleId = null;
  } else if (forceRuleId === null) {
    triggerSource = "SYSTEM_CRON"; // Without explicit ruleId, standard time trigger or background job
  }
  
  let dryRunResults = [];
  let batchLogs = []; // 把原本每一圈都在寫的日誌，全部存在記憶體

  const configSheet = getConfigSheet();
  const settingsDataStr = getSystemConfig(configSheet, "AppSettings");
  if (!settingsDataStr) return [];
  
  let settings = null;
  try {
    settings = JSON.parse(settingsDataStr);
  } catch (e) {
    return [];
  }
  
  const rules = getRemindRulesFromSheet();
  const channelToken = String(settings.lineChannelToken || '').trim();
  const adminUserIdStr = String(settings.lineUserId || '').trim();
  const adminUserIds = adminUserIdStr.split(',').map(id => id.trim()).filter(Boolean);
  if (!rules.length || !channelToken) return [];

  const now = new Date();
  const timeZone = SS.getSpreadsheetTimeZone() || "Asia/Taipei";
  const year = Utilities.formatDate(now, timeZone, "yyyy");
  const month = Utilities.formatDate(now, timeZone, "MM");
  const dateStr = Utilities.formatDate(now, timeZone, "dd");
  
  const currentDayNum = parseInt(Utilities.formatDate(now, timeZone, "u"), 10) % 7; 
  const shortDays = ['日', '一', '二', '三', '四', '五', '六'];
  const dayName = shortDays[currentDayNum];
  
  const currentHour = Utilities.formatDate(now, timeZone, "HH");
  const m = Utilities.formatDate(now, timeZone, "mm");
  const currentDayStr = String(currentDayNum);
  
  let h = parseInt(currentHour, 10);
  let period = '凌晨';
  if (h >= 6 && h < 12) period = '上午';
  else if (h === 12) period = '中午';
  else if (h > 12 && h < 18) period = '下午';
  else if (h >= 18) period = '晚上';
  let displayHour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  
  // 組合出格式如：2026-05-17(日)晚上7:00
  const formattedTimeStr = `${year}-${month}-${dateStr}(${dayName})${period}${displayHour}:${m}`;
  
  // 以昨天作為起點，避免遺漏
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const startFetchDateStr = Utilities.formatDate(yesterday, timeZone, "yyyy-MM-dd");
  
  const data = getData(startFetchDateStr, 0); 
  const customers = data.customers || [];
  const customerByNameMap = {};
  customers.forEach(c => {
    if (c.name) customerByNameMap[String(c.name).trim()] = c;
  });

  const staffMap = getStaffInfoMap();
  const scriptCache = CacheService.getScriptCache();
  
  // 打擊範圍縮圈 (Data Bounding)：涵蓋 TODAY / TOMORROW / WEEKDAYS (+1~+7天) 加上跨時區緩衝，保留 8 天內訂單
  if (data.orders && Array.isArray(data.orders)) {
    data.orders = data.orders.filter(order => {
      let dStr = order.deliveryDate;
      if (!dStr) return false;
      let d = (dStr instanceof Date) ? dStr : new Date(String(dStr).split(' ')[0].replace(/\//g, '-'));
      if (isNaN(d.getTime())) return true;
      const diffDays = Math.abs((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= 8;
    });
  }

  const normalizeGasDate = (dStr) => {
    if (!dStr) return "";
    if (dStr instanceof Date) {
      return Utilities.formatDate(dStr, timeZone, "yyyy-MM-dd");
    }
    const cleaned = String(dStr).trim().split(/[ T]/)[0].replace(/\//g, '-');
    const parts = cleaned.split('-');
    if (parts.length === 3) {
      return `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`;
    }
    return cleaned;
  };

  const parseGasJsonArraySafe = (raw) => {
    if (Array.isArray(raw)) return raw;
    if (!raw) return [];
    const str = String(raw).trim();
    if (!str) return [];
    if (str.startsWith('[')) {
      try {
        const parsed = JSON.parse(str);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {}
    }
    return str.split(',').map(s => s.trim()).filter(Boolean);
  };

  const productIdToName = {};
  (data.products || []).forEach(p => {
    const pId = String(p.id || '').trim();
    const pName = String(p.name || '').trim();
    if (pId && pName) productIdToName[pId] = pName;
  });

  customers.forEach(c => {
    c._offDaysNum = parseGasJsonArraySafe(c.offDays).map(x => Number(x)).filter(n => !isNaN(n));
    c._holidayDatesNorm = parseGasJsonArraySafe(c.holidayDates).map(d => normalizeGasDate(d)).filter(Boolean);
    c._defaultItemsArr = parseGasJsonArraySafe(c.defaultItems);
  });

  let ruleDeliveries = [];
  
  for (let r = 0; r < rules.length; r++) {
    if (Date.now() - START_TIME > TIME_LIMIT) {
      console.warn("即將超時，主動中斷規則檢查以確保寫入 Log！");
      break; 
    }

    const rule = rules[r];
    let trace = {
      step: "INIT",
      message: "開始評估",
      customersEvaluated: 0,
      customersMatched: 0,
      ordersMatched: 0,
      driverPushCount: 0,
      previewSamples: []
    };

    const logAndReturn = (status, details) => {
      if (!isDryRun) {
        const currentTs = Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd HH:mm:ss");
        const safeDetails = details ? JSON.stringify(details) : "{}";
        batchLogs.push([currentTs, triggerSource, rule.id, rule.name, status, safeDetails]);
      }
      if (isDryRun) dryRunResults.push({ ruleId: rule.id, ruleName: rule.name, status, details });
    };

    if (forceRuleId && rule.id !== forceRuleId) continue;

    if (!rule.isActive && rule.id !== forceRuleId) {
      logAndReturn("SKIPPED", { reason: "規則已停用" });
      continue;
    }

    // Check Date & Time match
    let isTimeMatched = false;
    if (forceRuleId === rule.id) {
      isTimeMatched = true;
    } else if (Array.isArray(rule.schedule)) {
      isTimeMatched = (rule.schedule.includes(currentDayStr) || rule.schedule.includes('每天')) && String(rule.timeToNotify || '').startsWith(currentHour);
    } else {
      if (rule.schedule === '每天') {
        isTimeMatched = String(rule.timeToNotify || '').startsWith(currentHour);
      } else {
        isTimeMatched = (rule.schedule === currentDayStr) && String(rule.timeToNotify || '').startsWith(currentHour);
      }
    }
    
    if (!isTimeMatched) {
      if (forceRuleId === rule.id) {
        logAndReturn("SKIPPED", { reason: "非排程時間" });
      }
      continue;
    }

    // 防止同小時內重複執行 CRON 造成洗版
    const cacheLockKey = `RULE_SENT_${rule.id}_${year}${month}${dateStr}_${currentHour}`;
    if (triggerSource === "SYSTEM_CRON" && !isDryRun) {
      if (scriptCache.get(cacheLockKey)) {
        continue;
      }
    }
    
    // === 計算目標配送日 (支援 TODAY i=0 / TOMORROW i=1 / WEEKDAYS i=1..7) ===
    let targetDatesInfo = [];
    const shortDaysArr = ['日', '一', '二', '三', '四', '五', '六'];
    const dateMode = rule.targetDateMode || ((rule.targetOrderDays && rule.targetOrderDays.length > 0) ? 'WEEKDAYS' : 'TOMORROW');

    if (dateMode === 'TODAY') {
      targetDatesInfo.push(now);
    } else if (dateMode === 'TOMORROW') {
      targetDatesInfo.push(new Date(now.getTime() + 24 * 60 * 60 * 1000));
    } else if (rule.targetOrderDays && rule.targetOrderDays.length > 0) {
      for (let i = 1; i <= 7; i++) {
        let checkDay = (currentDayNum + i) % 7;
        if (rule.targetOrderDays.includes(String(checkDay))) {
          targetDatesInfo.push(new Date(now.getTime() + i * 24 * 60 * 60 * 1000));
        }
      }
    } else {
      targetDatesInfo.push(new Date(now.getTime() + 24 * 60 * 60 * 1000));
    }

    const targetDateStrings = targetDatesInfo.map(d => Utilities.formatDate(d, timeZone, "yyyy-MM-dd"));
    const targetShortStrings = targetDatesInfo.map(d => {
      const md = Utilities.formatDate(d, timeZone, "M-d");
      const dNum = parseInt(Utilities.formatDate(d, timeZone, "u"), 10) % 7;
      return `${md}(${shortDaysArr[dNum]})`;
    });
    const targetDatesText = targetShortStrings.join('、');
    
    // 取得目標日期內所有「非取消」訂單，並依客戶名及日期+客戶分組
    const targetOrdersAll = (data.orders || []).filter(o => targetDateStrings.includes(normalizeGasDate(o.deliveryDate)));
    const targetActiveOrders = targetOrdersAll.filter(o => !isCancelledOrderStatus(o.status));
    
    const ordersByCustomer = {};
    const ordersByDateAndCustomer = {};
    for (let i = 0; i < targetActiveOrders.length; i++) {
      const order = targetActiveOrders[i];
      const cName = String(order.customerName || '').trim();
      const dKey = normalizeGasDate(order.deliveryDate);
      if (!ordersByCustomer[cName]) ordersByCustomer[cName] = [];
      ordersByCustomer[cName].push(order);

      if (!ordersByDateAndCustomer[dKey]) ordersByDateAndCustomer[dKey] = {};
      if (!ordersByDateAndCustomer[dKey][cName]) ordersByDateAndCustomer[dKey][cName] = [];
      ordersByDateAndCustomer[dKey][cName].push(order);
    }

    const ruleHasPositiveCondition = (rule.conditions || []).some(c => isPositiveOrderCondition(c.status));
    const ruleHasUnorderedCondition = (rule.conditions || []).some(c => c.status === 'UNORDERED');
    
    // 若為正向出貨檢查，只要客戶當天有有效單（即使當天是公休日）也不可漏掉！
    // 若為未訂購/待處理警戒，才過濾掉封存、暫停或休假客戶
    const customerByIdMap = {};
    customers.forEach(c => {
      if (c.id !== undefined && c.id !== null) customerByIdMap[String(c.id).trim()] = c;
    });

    const diagStats = {
      archivedCount: 0,
      pausedCount: 0,
      offDayCount: 0,
      regularRejectedIds: new Set(),
      evaluatedExplicitIds: new Set()
    };

    const activeCustomers = customers.filter(c => {
      const cName = String(c.name || '').trim();
      const hasOrderToday = (ordersByCustomer[cName] || []).length > 0;
      const workingDates = targetDatesInfo.filter(d => {
        const dStr = Utilities.formatDate(d, timeZone, "yyyy-MM-dd");
        const dayNum = parseInt(Utilities.formatDate(d, timeZone, "u"), 10) % 7;
        const offDays = Array.isArray(c._offDaysNum) ? c._offDaysNum : [];
        const holidayDates = Array.isArray(c._holidayDatesNorm) ? c._holidayDatesNorm : [];
        const isOff = offDays.includes(dayNum) || holidayDates.includes(dStr);
        return !isOff;
      });
      c._workingDateStrs = workingDates.map(d => Utilities.formatDate(d, timeZone, "yyyy-MM-dd"));

      if (ruleHasPositiveCondition && hasOrderToday && !c.isArchived) {
        return true;
      }
      if (c.isArchived) {
        diagStats.archivedCount++;
        return false;
      }
      if (c.isPaused) {
        diagStats.pausedCount++;
        return false;
      }
      if (workingDates.length === 0) {
        diagStats.offDayCount++;
        return false;
      }
      return true;
    });

    // 若訂單裡的客戶不在 customers 主檔裡（例如臨時散客）且規則未指定特定店家且含正向條件，也一併納入
    if (ruleHasPositiveCondition) {
      Object.keys(ordersByCustomer).forEach(cName => {
        if (!customerByNameMap[cName]) {
          activeCustomers.push({
            id: `ADHOC_${cName}`,
            name: cName,
            offDays: [],
            holidayDates: [],
            _offDaysNum: [],
            _holidayDatesNorm: [],
            _defaultItemsArr: [],
            _workingDateStrs: targetDateStrings
          });
        }
      });
    }

    trace.customersEvaluated = activeCustomers.length;

    const explicitTargetIdSet = new Set();
    (rule.conditions || []).forEach(cond => {
      if (Array.isArray(cond.customers)) {
        cond.customers.forEach(cid => {
          const cleanId = String(cid || '').trim();
          if (cleanId) explicitTargetIdSet.add(cleanId);
        });
      }
    });

    if (activeCustomers.length === 0) {
      const explicitNotes = Array.from(explicitTargetIdSet).slice(0, 5).map(cid => {
        const cust = customerByIdMap[cid];
        if (!cust) return `找不到客戶 ID(${cid})`;
        if (cust.isArchived) return `「${cust.name}」已封存`;
        if (cust.isPaused) return `「${cust.name}」暫停供貨`;
        return `「${cust.name}」於 ${targetDatesText} 為公休／特休`;
      });
      const detailReason = explicitNotes.length > 0
        ? `今日無符合檢查對象：${explicitNotes.join('；')}`
        : `今日無符合檢查對象（休假 ${diagStats.offDayCount} 家、暫停 ${diagStats.pausedCount} 家、封存 ${diagStats.archivedCount} 家）`;
      logAndReturn("SKIPPED", {
        reason: detailReason,
        targetDatesText,
        currentHour: h,
        customersEvaluated: 0,
        customersMatched: 0,
        diagnosticBreakdown: explicitNotes
      });
      continue;
    }

    const matchedOrdersCollected = [];
    const matchedOrderIdSet = new Set();
    const missingItemsByCustomerId = {};

    const triggeredCustomers = activeCustomers.filter(customer => {
      let isRuleMatched = null;
      const candidateOrdersForCustomer = [];
      const custIdStr = String(customer.id || '').trim();
      const custNameKey = String(customer.name || '').trim();
      const custWorkingDates = Array.isArray(customer._workingDateStrs) && customer._workingDateStrs.length > 0
        ? customer._workingDateStrs
        : targetDatesInfo
            .filter(d => {
              const dStr = Utilities.formatDate(d, timeZone, "yyyy-MM-dd");
              const dayNum = parseInt(Utilities.formatDate(d, timeZone, "u"), 10) % 7;
              const offDays = Array.isArray(customer._offDaysNum) ? customer._offDaysNum : [];
              const holidayDates = Array.isArray(customer._holidayDatesNorm) ? customer._holidayDatesNorm : [];
              return !offDays.includes(dayNum) && !holidayDates.includes(dStr);
            })
            .map(d => Utilities.formatDate(d, timeZone, "yyyy-MM-dd"));

      (rule.conditions || []).forEach(cond => {
        const hasProductFilter = Array.isArray(cond.products) && cond.products.length > 0;
        const normalizedTargetProducts = hasProductFilter
          ? cond.products.map(p => String(p || '').trim()).filter(Boolean)
          : (data.products || []).map(p => String(p.name || '').trim()).filter(Boolean);
        const targetProductNamesLower = new Set(normalizedTargetProducts.map(n => n.toLowerCase()));

        let condAppliesToCustomer = true;
        if (cond.customers && cond.customers.length > 0) {
          const allowedIdSet = new Set(cond.customers.map(id => String(id || '').trim()));
          if (!allowedIdSet.has(custIdStr)) {
            condAppliesToCustomer = false;
          } else {
            diagStats.evaluatedExplicitIds.add(custIdStr);
          }
        }

        // 若勾選「僅檢查常訂上述品項的店家」，依客戶主檔 defaultItems 比對是否常買
        if (condAppliesToCustomer && cond.onlyRegularBuyers && hasProductFilter) {
          const defItems = Array.isArray(customer._defaultItemsArr) ? customer._defaultItemsArr : [];
          const buysAnyTarget = defItems.some(di => {
            const pid = String(di.productId || '').trim();
            const resolvedName = String(di.productName || (pid && productIdToName[pid]) || '').trim().toLowerCase();
            return (resolvedName && targetProductNamesLower.has(resolvedName)) || (pid && targetProductNamesLower.has(pid.toLowerCase()));
          });
          if (!buysAnyTarget) {
            condAppliesToCustomer = false;
            diagStats.regularRejectedIds.add(custIdStr);
          }
        }

        let condMatched = false;
        if (condAppliesToCustomer) {
          const customerOrders = ordersByCustomer[custNameKey] || [];
          const orderMatchesProducts = (o, nameLowerSet) => {
            const oProdName = String(o.productName || (o.product && o.product.name) || '').trim().toLowerCase();
            return oProdName && nameLowerSet.has(oProdName);
          };
          const relevantOrders = hasProductFilter
            ? customerOrders.filter(o => orderMatchesProducts(o, targetProductNamesLower))
            : customerOrders;

          if (cond.status === 'UNORDERED') {
            if (custWorkingDates.length === 0) {
              condMatched = false;
            } else if (cond.productMatchMode === 'ANY_MISSING' && hasProductFilter) {
              const missingSet = new Set();
              normalizedTargetProducts.forEach(pName => {
                const pLower = pName.toLowerCase();
                const missedOnWorkingDay = custWorkingDates.some(dKey => {
                  const dayOrders = (ordersByDateAndCustomer[dKey] && ordersByDateAndCustomer[dKey][custNameKey]) || [];
                  return !dayOrders.some(o => String(o.productName || (o.product && o.product.name) || '').trim().toLowerCase() === pLower);
                });
                if (missedOnWorkingDay) missingSet.add(pName);
              });
              condMatched = missingSet.size > 0;
              if (condMatched) {
                missingItemsByCustomerId[String(customer.id)] = Array.from(missingSet);
              }
            } else {
              const missedAllOnWorkingDay = custWorkingDates.some(dKey => {
                const dayOrders = (ordersByDateAndCustomer[dKey] && ordersByDateAndCustomer[dKey][custNameKey]) || [];
                const dayMatched = hasProductFilter
                  ? dayOrders.filter(o => orderMatchesProducts(o, targetProductNamesLower))
                  : dayOrders;
                return dayMatched.length === 0;
              });
              condMatched = missedAllOnWorkingDay;
              if (condMatched && hasProductFilter) {
                missingItemsByCustomerId[String(customer.id)] = normalizedTargetProducts;
              }
            }
          } else if (cond.status === 'PENDING') {
            const matched = relevantOrders.filter(o => o.status === 'PENDING' || o.status === '待處理');
            condMatched = matched.length > 0;
            if (condMatched) candidateOrdersForCustomer.push(...matched);
          } else if (cond.status === 'ACTIVE_ORDERS' || cond.status === 'HAS_PRODUCT') {
            condMatched = relevantOrders.length > 0;
            if (condMatched) candidateOrdersForCustomer.push(...relevantOrders);
          } else if (cond.status === 'READY_OR_PENDING') {
            const matched = relevantOrders.filter(o => !isCompletedOrderStatus(o.status));
            condMatched = matched.length > 0;
            if (condMatched) candidateOrdersForCustomer.push(...matched);
          } else if (cond.status === 'UNASSIGNED') {
            const matched = relevantOrders.filter(o => !String(o.assignedTo || '').trim());
            condMatched = matched.length > 0;
            if (condMatched) candidateOrdersForCustomer.push(...matched);
          }
        }
        
        if (isRuleMatched === null) {
          isRuleMatched = condMatched;
        } else if (cond.operator === 'AND') {
          isRuleMatched = isRuleMatched && condMatched;
        } else {
          isRuleMatched = isRuleMatched || condMatched;
        }
      });

      if (isRuleMatched) {
        candidateOrdersForCustomer.forEach((o, idx) => {
          const uniqKey = o.id ? String(o.id) : `${o.customerName}_${o.deliveryDate}_${o.productName}_${idx}`;
          if (!matchedOrderIdSet.has(uniqKey)) {
            matchedOrderIdSet.add(uniqKey);
            matchedOrdersCollected.push(o);
          }
        });
      }

      return Boolean(isRuleMatched);
    });

    trace.step = "CONDITION_EVALUATED";
    trace.customersMatched = triggeredCustomers.length;
    trace.ordersMatched = matchedOrdersCollected.length;

    if (triggeredCustomers.length === 0) {
      const targetProdsLabel = Array.from(new Set(
        (rule.conditions || []).reduce((acc, c) => acc.concat(c.products || []), [])
      )).filter(Boolean).join('、') || '指定品項';
      const diagnosticBreakdown = [];

      if (explicitTargetIdSet.size > 0) {
        Array.from(explicitTargetIdSet).slice(0, 5).forEach(cid => {
          const cust = customerByIdMap[cid];
          if (!cust) {
            diagnosticBreakdown.push(`找不到客戶 ID(${cid})（可能曾刪除重建，請重新挑選店家）`);
            return;
          }
          const cName = String(cust.name || '').trim();
          if (cust.isArchived) {
            diagnosticBreakdown.push(`「${cName}」已封存`);
          } else if (cust.isPaused) {
            diagnosticBreakdown.push(`「${cName}」目前設定為暫停供貨`);
          } else if (!Array.isArray(cust._workingDateStrs) || cust._workingDateStrs.length === 0) {
            diagnosticBreakdown.push(`「${cName}」於 ${targetDatesText} 為公休／特定休假日`);
          } else if (diagStats.regularRejectedIds.has(cid)) {
            diagnosticBreakdown.push(`「${cName}」預設常規品項未包含「${targetProdsLabel}」，已被「僅檢查常訂品項店家」排除`);
          } else if (ruleHasUnorderedCondition) {
            const custOrders = ordersByCustomer[cName] || [];
            const prodsOrdered = Array.from(new Set(custOrders.map(o => String(o.productName || '').trim()).filter(Boolean)));
            if (prodsOrdered.length > 0) {
              diagnosticBreakdown.push(`「${cName}」於 ${targetDatesText} 已有有效訂單（${prodsOrdered.join('、')}）`);
            } else {
              diagnosticBreakdown.push(`「${cName}」未滿足規則條件組合`);
            }
          } else {
            diagnosticBreakdown.push(`「${cName}」目前無符合條件之訂單`);
          }
        });
      } else {
        if (diagStats.regularRejectedIds.size > 0) {
          diagnosticBreakdown.push(`有 ${diagStats.regularRejectedIds.size} 家營業中店家因預設常規品項不含「${targetProdsLabel}」被排除`);
        }
        if (diagStats.offDayCount + diagStats.pausedCount > 0) {
          diagnosticBreakdown.push(`另有 ${diagStats.offDayCount} 家當日公休、${diagStats.pausedCount} 家暫停供貨`);
        }
        diagnosticBreakdown.push(`其餘 ${Math.max(0, activeCustomers.length - diagStats.regularRejectedIds.size)} 家可檢店家中皆未觸發條件`);
      }

      const detailReason = diagnosticBreakdown.length > 0
        ? `條件未達成：${diagnosticBreakdown.join('；')}`
        : "條件未達成，無需發送提醒";

      logAndReturn("SKIPPED", {
        reason: detailReason,
        targetDatesText,
        currentHour: h,
        customersEvaluated: activeCustomers.length,
        customersMatched: 0,
        diagnosticBreakdown
      });
      continue;
    }

    // 組裝發送封包（依 recipientMode 分流）
    const outputFormat = rule.outputFormat || 'SUMMARY_NAMES';
    const recipientMode = rule.recipientMode || 'DEFAULT_ADMIN';
    const outboundMessages = []; // { targetLineIds, recipientName, text }

    const statusLabelMap = {
      'UNORDERED': '未訂購',
      'PENDING': '狀態為待處理',
      'ACTIVE_ORDERS': '今日有效配送單',
      'READY_OR_PENDING': '尚待出貨/處理中',
      'UNASSIGNED': '尚未指派司機',
      'HAS_PRODUCT': '包含指定品項'
    };

    const allTargetProductsLabel = Array.from(new Set(
      (rule.conditions || []).reduce((acc, cond) => acc.concat(cond.products || []), [])
    )).filter(Boolean).join('、') || '指定品項';

    const buildSummaryText = (custList, subHeader) => {
      const prioritySet = new Set((rule.priorityCustomerIds || []).map(String));
      const sortedCusts = [...custList].sort((a, b) => {
        const aPri = prioritySet.has(String(a.id)) ? 1 : 0;
        const bPri = prioritySet.has(String(b.id)) ? 1 : 0;
        return bPri - aPri;
      });
      const isPureUnordered = ruleHasUnorderedCondition && !ruleHasPositiveCondition;

      let message = `【${rule.name}】\n`;
      if (subHeader) message += `${subHeader}\n`;
      message += `📅 檢查日期：${targetDatesText}\n`;
      message += `🕒 通知時間：${formattedTimeStr}\n`;

      if (isPureUnordered) {
        message += `⚠️ 以下共 ${sortedCusts.length} 家尚未訂購【${allTargetProductsLabel}】：\n`;
        sortedCusts.forEach(c => {
          const priPrefix = prioritySet.has(String(c.id)) ? '🚨 ' : '';
          const missingArr = missingItemsByCustomerId[String(c.id)];
          const missingHint = (missingArr && missingArr.length > 0) ? `（缺：${missingArr.join('、')}）` : '';
          message += `• ${priPrefix}${c.name}${missingHint}\n`;
        });
        message = message.trim();
      } else {
        const names = sortedCusts.map(c => prioritySet.has(String(c.id)) ? `🚨${c.name}` : c.name).join('、');
        const conditionTexts = (rule.conditions || []).map(cond => {
          const targetProducts = (cond.products && cond.products.length) ? cond.products.join('、') : '任何品項';
          const statusStr = statusLabelMap[cond.status] || cond.status;
          return `${statusStr} ${targetDatesText} ${targetProducts}`;
        });
        message += `${names} ${conditionTexts.join(' / ')}`;
      }

      if (rule.customMessage) {
        let msg = rule.customMessage
          .replace(/{日期}/g, targetDatesText)
          .replace(/{{日期}}/g, targetDatesText)
          .replace(/{總店數}/g, String(custList.length))
          .replace(/{總單數}/g, String(matchedOrdersCollected.length))
          .replace(/{品項}/g, allTargetProductsLabel);
        message += `\n\n${msg}`;
      }
      return message;
    };

    if (recipientMode === 'ASSIGNED_DRIVER' && matchedOrdersCollected.length > 0) {
      const driverGroups = {};
      const unassignedOrUnboundOrders = [];

      matchedOrdersCollected.forEach(o => {
        const aId = String(o.assignedTo || '').trim();
        const staffLineId = aId ? getStaffLineId(aId) : null;
        if (aId && staffLineId) {
          if (!driverGroups[aId]) {
            const staffObj = staffMap[aId.toLowerCase()];
            driverGroups[aId] = {
              staffId: aId,
              staffName: o.assignedName || (staffObj ? staffObj.name : aId),
              lineId: staffLineId,
              orders: []
            };
          }
          driverGroups[aId].orders.push(o);
        } else {
          unassignedOrUnboundOrders.push(o);
        }
      });

      Object.values(driverGroups).forEach(group => {
        const subHeader = `👤 負責司機：${group.staffName}`;
        const rawText = outputFormat === 'DELIVERY_MANIFEST'
          ? buildDeliveryManifestText(rule, group.orders, customerByNameMap, targetDatesText, formattedTimeStr, subHeader)
          : buildSummaryText(
              Array.from(new Set(group.orders.map(o => o.customerName))).map(n => customerByNameMap[n] || { id: n, name: n }),
              subHeader
            );
        splitLineMessageChunks(rawText).forEach(chunk => {
          outboundMessages.push({
            targetLineIds: [group.lineId],
            recipientName: `${group.staffName} (司機)`,
            text: chunk
          });
        });
      });

      if (unassignedOrUnboundOrders.length > 0 && rule.fallbackToAdminIfUnassigned !== false && adminUserIds.length > 0) {
        const subHeader = `⚠️ 以下訂單尚未指派司機或司機尚未綁定 LINE（共 ${unassignedOrUnboundOrders.length} 筆）`;
        const rawText = outputFormat === 'DELIVERY_MANIFEST'
          ? buildDeliveryManifestText(rule, unassignedOrUnboundOrders, customerByNameMap, targetDatesText, formattedTimeStr, subHeader)
          : buildSummaryText(
              Array.from(new Set(unassignedOrUnboundOrders.map(o => o.customerName))).map(n => customerByNameMap[n] || { id: n, name: n }),
              subHeader
            );
        splitLineMessageChunks(rawText).forEach(chunk => {
          outboundMessages.push({
            targetLineIds: adminUserIds,
            recipientName: "管理員 (未指派單補送)",
            text: chunk
          });
        });
      }

      // 若混合條件同時包含「未訂購 (無訂單)」客戶，不能因無訂單被吃掉，補推管理員
      const orderedNamesSet = new Set(matchedOrdersCollected.map(o => String(o.customerName || '').trim()));
      const noOrderMatchedCusts = triggeredCustomers.filter(c => !orderedNamesSet.has(String(c.name || '').trim()));
      if (noOrderMatchedCusts.length > 0 && rule.fallbackToAdminIfUnassigned !== false && adminUserIds.length > 0) {
        const rawText = buildSummaryText(noOrderMatchedCusts, '⚠️ 以下店家未訂購或無對應訂單（無法依司機拆發，改轉管理員）');
        splitLineMessageChunks(rawText).forEach(chunk => {
          outboundMessages.push({
            targetLineIds: adminUserIds,
            recipientName: "預設管理員 (未訂購補送)",
            text: chunk
          });
        });
      }
    } else if (recipientMode === 'SPECIFIC_STAFF') {
      const staffIds = rule.targetStaffIds || [];
      const resolvedLineIds = [];
      const resolvedNames = [];
      staffIds.forEach(sId => {
        const lid = getStaffLineId(sId);
        if (lid && !resolvedLineIds.includes(lid)) {
          resolvedLineIds.push(lid);
          const staffObj = staffMap[String(sId).trim().toLowerCase()];
          resolvedNames.push(staffObj ? staffObj.name : sId);
        }
      });

      if (resolvedLineIds.length > 0) {
        const rawText = (outputFormat === 'DELIVERY_MANIFEST' && matchedOrdersCollected.length > 0)
          ? buildDeliveryManifestText(rule, matchedOrdersCollected, customerByNameMap, targetDatesText, formattedTimeStr, '')
          : buildSummaryText(triggeredCustomers, '');
        splitLineMessageChunks(rawText).forEach(chunk => {
          outboundMessages.push({
            targetLineIds: resolvedLineIds,
            recipientName: resolvedNames.join('、'),
            text: chunk
          });
        });
      }
    } else {
      // DEFAULT_ADMIN（含無訂單時 ASSIGNED_DRIVER 的安全退路）
      if (adminUserIds.length > 0) {
        const rawText = (outputFormat === 'DELIVERY_MANIFEST' && matchedOrdersCollected.length > 0)
          ? buildDeliveryManifestText(rule, matchedOrdersCollected, customerByNameMap, targetDatesText, formattedTimeStr, '')
          : buildSummaryText(triggeredCustomers, '');
        splitLineMessageChunks(rawText).forEach(chunk => {
          outboundMessages.push({
            targetLineIds: adminUserIds,
            recipientName: "預設管理員",
            text: chunk
          });
        });
      }
    }

    if (outboundMessages.length === 0) {
      logAndReturn("SKIPPED", {
        reason: recipientMode === 'DEFAULT_ADMIN'
          ? "未設定預設 LINE User ID"
          : "找不到任何已綁定 LINE 的對應司機／接收同仁",
        targetDatesText,
        customersEvaluated: trace.customersEvaluated,
        customersMatched: trace.customersMatched,
        ordersMatched: trace.ordersMatched
      });
      continue;
    }

    trace.step = "SENT";
    const uniqueRecipientNames = Array.from(new Set(outboundMessages.map(m => m.recipientName)));
    trace.recipients = uniqueRecipientNames.join('、');
    trace.driverPushCount = uniqueRecipientNames.length;
    trace.previewSamples = outboundMessages.slice(0, 5).map(m => ({
      recipientName: m.recipientName,
      previewText: m.text
    }));

    ruleDeliveries.push({
      rule,
      cacheLockKey,
      outboundMessages,
      logSuccess: () => logAndReturn("SUCCESS", trace),
      logError: (err) => logAndReturn("ERROR", { ...trace, Error: err.message || err.toString() })
    });
  }
  
  // 統一發射所有 HTTP 請求
  if (ruleDeliveries.length > 0) {
    if (!isDryRun) {
      const flatRequests = [];
      const requestMeta = [];

      ruleDeliveries.forEach((delivery, dIdx) => {
        delivery.outboundMessages.forEach(msg => {
          const ids = msg.targetLineIds;
          const endpoint = ids.length === 1
            ? "https://api.line.me/v2/bot/message/push"
            : "https://api.line.me/v2/bot/message/multicast";
          const payloadTo = ids.length === 1 ? ids[0] : ids;

          flatRequests.push({
            url: endpoint,
            method: "post",
            contentType: "application/json",
            headers: { "Authorization": "Bearer " + channelToken },
            payload: JSON.stringify({
              to: payloadTo,
              messages: [{ type: "text", text: msg.text }]
            }),
            muteHttpExceptions: true
          });
          requestMeta.push(dIdx);
        });
      });

      const deliverySuccessFlags = ruleDeliveries.map(() => true);
      const deliveryErrors = ruleDeliveries.map(() => []);

      try {
        const responses = UrlFetchApp.fetchAll(flatRequests);
        responses.forEach((res, idx) => {
          const dIdx = requestMeta[idx];
          if (res.getResponseCode() !== 200) {
            deliverySuccessFlags[dIdx] = false;
            deliveryErrors[dIdx].push(`HTTP ${res.getResponseCode()}: ${res.getContentText()}`);
          }
        });

        ruleDeliveries.forEach((delivery, dIdx) => {
          if (deliverySuccessFlags[dIdx]) {
            if (triggerSource === "SYSTEM_CRON") {
              try { scriptCache.put(delivery.cacheLockKey, "1", 3600); } catch (e) {}
            }
            delivery.logSuccess();
          } else {
            delivery.logError(new Error(deliveryErrors[dIdx].join(' | ')));
          }
        });
      } catch (err) {
        console.log("LINE Messaging API fetchAll failed: " + err.message);
        ruleDeliveries.forEach(d => d.logError(err));
      }
    } else {
      ruleDeliveries.forEach(d => d.logSuccess());
    }
  }

  // 寫入 Log
  if (batchLogs.length > 0) {
    try {
      const logSheet = getNotificationLogSheet();
      const lastRow = logSheet.getLastRow();
      let startRow = lastRow > 0 ? lastRow + 1 : 2;
      safeSetValues(logSheet, startRow, 1, batchLogs);
      
      const afterLastRow = logSheet.getLastRow();
      const MAX_LOGS = 1000;
      const DELETE_COUNT = 200;
      if (afterLastRow > MAX_LOGS) {
        logSheet.deleteRows(2, DELETE_COUNT);
      }
    } catch (e) {
      console.log("Failed to write batch logs: " + e.toString());
    }
  }

  // 每日出車簡報排程檢查（共用同一個 Cron Trigger，免額外設定觸發器）
  if (triggerSource === "SYSTEM_CRON" && !isDryRun && !forceRuleId) {
    try {
      runDailyBriefingCheck(false, false, null);
    } catch (briefErr) {
      console.warn("runDailyBriefingCheck error: " + briefErr.toString());
    }
  }

  return dryRunResults;
}

/**
 * 組裝「三段式」每日出車簡報文案
 */
function buildThreeSectionBriefingText(options) {
  const titleDate = options.titleDate || '';
  const subHeader = options.subHeader || '';
  const orders = options.orders || [];
  const customerByNameMap = options.customerByNameMap || {};
  const groupBy = options.groupBy || 'BY_DRIVER';
  const includeItemTotals = options.includeItemTotals !== false;
  const includeTripInfo = options.includeTripInfo === true;
  const includeDeliveryTime = options.includeDeliveryTime === true;
  const missingWatchlistCustomers = options.missingWatchlistCustomers || [];
  const unscheduledNotice = options.unscheduledNotice || '';

  const custOrderMap = {};
  const itemTotalsMap = {};

  orders.forEach(o => {
    const cName = String(o.customerName || '未命名店家').trim();
    const cust = customerByNameMap[cName];
    const isWatchlist = Boolean(cust && cust.isWatchlist);
    if (!custOrderMap[cName]) {
      custOrderMap[cName] = {
        customerName: cName,
        isWatchlist: isWatchlist,
        trip: o.trip || (cust ? cust.defaultTrip : '') || '未分配',
        deliveryTime: o.deliveryTime || (cust ? cust.deliveryTime : '') || '',
        deliveryMethod: o.deliveryMethod || (cust ? cust.deliveryMethod : '') || '',
        items: [],
        notes: []
      };
    }

    const pName = o.productName || (o.product && o.product.name) || '未命名品項';
    const qty = Number(o.quantity) || 0;
    const unit = o.unit || '';
    custOrderMap[cName].items.push({ productName: pName, quantity: qty, unit: unit });

    const iKey = `${pName}__${unit}`;
    if (!itemTotalsMap[iKey]) {
      itemTotalsMap[iKey] = { productName: pName, quantity: 0, unit: unit };
    }
    itemTotalsMap[iKey].quantity += qty;

    const noteStr = String(o.note || '').trim();
    if (noteStr && !custOrderMap[cName].notes.includes(noteStr)) {
      custOrderMap[cName].notes.push(noteStr);
    }
  });

  const formatCustomerBlock = (block, isPrioritySection) => {
    // 合併同店家相同品項
    const merged = {};
    block.items.forEach(it => {
      const k = `${it.productName}__${it.unit}`;
      if (!merged[k]) merged[k] = { productName: it.productName, quantity: 0, unit: it.unit };
      merged[k].quantity += it.quantity;
    });
    const metaParts = [];
    if (includeTripInfo && block.trip && block.trip !== '未分配') metaParts.push(block.trip);
    if (includeDeliveryTime && block.deliveryTime) metaParts.push(block.deliveryTime);
    if (block.deliveryMethod && block.deliveryMethod !== '外送') metaParts.push(block.deliveryMethod);
    const metaStr = metaParts.length > 0 ? ` (${metaParts.join(' ')})` : '';

    let text = `${isPrioritySection ? '🚨 ' : '▸ '}${block.customerName}${metaStr}`;
    Object.values(merged).forEach(it => {
      text += `\n  • ${it.productName} × ${it.quantity}${it.unit}`;
    });
    if (block.notes.length > 0) {
      text += `\n  📝 備註：${block.notes.join(' / ')}`;
    }
    return text;
  };

  const sortBlocks = (arr) => arr.sort((a, b) => {
    const tripCmp = String(a.trip || 'zzz').localeCompare(String(b.trip || 'zzz'), 'zh-Hant');
    if (tripCmp !== 0) return tripCmp;
    const timeCmp = String(a.deliveryTime || '99:99').localeCompare(String(b.deliveryTime || '99:99'));
    if (timeCmp !== 0) return timeCmp;
    return a.customerName.localeCompare(b.customerName, 'zh-Hant');
  });

  const allBlocks = Object.values(custOrderMap);
  const watchlistBlocks = sortBlocks(allBlocks.filter(b => b.isWatchlist));
  const normalBlocks = sortBlocks(allBlocks.filter(b => !b.isWatchlist));

  let msg = `【每日出車簡報｜${titleDate}】\n`;
  if (subHeader) msg += `${subHeader}\n`;
  msg += `總計：${allBlocks.length} 家（${orders.length} 筆品項明細）\n`;
  if (unscheduledNotice) msg += `${unscheduledNotice}\n`;

  // 第一段：🚨 易漏重點必送
  if (watchlistBlocks.length > 0) {
    msg += `━━━━━━━━━━━━━━\n`;
    msg += `🚨【第一段｜易漏重點必送】(${watchlistBlocks.length} 家)\n`;
    msg += watchlistBlocks.map(b => formatCustomerBlock(b, true)).join('\n──────────\n');
    msg += '\n';
  }

  // 第二段：🚚 今日一般配送
  if (normalBlocks.length > 0) {
    msg += `━━━━━━━━━━━━━━\n`;
    msg += `🚚【第二段｜今日一般配送】(${normalBlocks.length} 家)\n`;
    if (groupBy === 'BY_TRIP') {
      const byTrip = {};
      normalBlocks.forEach(b => {
        const t = b.trip || '未分配';
        if (!byTrip[t]) byTrip[t] = [];
        byTrip[t].push(b);
      });
      const tripSections = Object.keys(byTrip).sort((a, b) => a.localeCompare(b, 'zh-Hant')).map(t => {
        return `【${t}】\n` + byTrip[t].map(b => formatCustomerBlock(b, false)).join('\n──────────\n');
      });
      msg += tripSections.join('\n\n');
    } else {
      msg += normalBlocks.map(b => formatCustomerBlock(b, false)).join('\n──────────\n');
    }
    msg += '\n';
  }

  // 總備貨量小計
  if (includeItemTotals && orders.length > 0) {
    const totalsArr = Object.values(itemTotalsMap).map(it => `${it.productName} ${it.quantity}${it.unit}`);
    if (totalsArr.length > 0) {
      msg += `━━━━━━━━━━━━━━\n📦 總備貨小計：\n${totalsArr.join('、')}\n`;
    }
  }

  // 第三段：❓ 盯哨店家今日無單確認（僅管理員/總表附帶）
  if (missingWatchlistCustomers.length > 0) {
    msg += `━━━━━━━━━━━━━━\n`;
    msg += `❓【第三段｜盯哨店家今日無單確認】(${missingWatchlistCustomers.length} 家)\n`;
    msg += `以下重點店家今日非公休但 0 筆訂單，請確認是否漏打單：\n`;
    msg += missingWatchlistCustomers.map(c => `• ${c.name}`).join('\n');
  }

  return msg.trim();
}

/**
 * 方案 B 核心：依白名單店家標籤與客製化模板渲染 LINE 出車簡報
 */
function renderCustomBriefingTemplate(options) {
  const template = String(options.template || '');
  if (!template.trim()) return '';

  const titleDate = options.titleDate || '';
  const ordersSlice = options.orders || [];
  const customerByIdMap = options.customerByIdMap || {};
  const customerByNameMap = options.customerByNameMap || {};
  const emptyStoreBehavior = options.emptyStoreBehavior || 'HIDE_LINE';
  const appendItemTotals = options.appendItemTotals === true;
  const includeTripInfo = options.includeTripInfo === true;
  const includeDeliveryTime = options.includeDeliveryTime === true;
  const missingCustomers = options.missingCustomers || [];

  const custOrderMap = {};
  const itemTotalsMap = {};

  ordersSlice.forEach(o => {
    const cName = String(o.customerName || '').trim();
    if (!cName) return;
    const cust = customerByNameMap[cName];
    if (!custOrderMap[cName]) {
      custOrderMap[cName] = {
        customerName: cName,
        isWatchlist: Boolean(cust && cust.isWatchlist),
        trip: o.trip || (cust ? cust.defaultTrip : '') || '未分配',
        deliveryTime: o.deliveryTime || (cust ? cust.deliveryTime : '') || '',
        deliveryMethod: o.deliveryMethod || (cust ? cust.deliveryMethod : '') || '',
        items: [],
        notes: []
      };
    }

    const pName = o.productName || (o.product && o.product.name) || '未命名品項';
    const qty = Number(o.quantity) || 0;
    const unit = o.unit || '';
    custOrderMap[cName].items.push({ productName: pName, quantity: qty, unit: unit });

    const iKey = `${pName}__${unit}`;
    if (!itemTotalsMap[iKey]) {
      itemTotalsMap[iKey] = { productName: pName, quantity: 0, unit: unit };
    }
    itemTotalsMap[iKey].quantity += qty;

    const noteStr = String(o.note || '').trim();
    if (noteStr && !custOrderMap[cName].notes.includes(noteStr)) {
      custOrderMap[cName].notes.push(noteStr);
    }
  });

  const formatCustomerTokenBlock = (cName, block) => {
    const merged = {};
    block.items.forEach(it => {
      const k = `${it.productName}__${it.unit}`;
      if (!merged[k]) merged[k] = { productName: it.productName, quantity: 0, unit: it.unit };
      merged[k].quantity += it.quantity;
    });
    const metaParts = [];
    if (includeTripInfo && block.trip && block.trip !== '未分配') metaParts.push(block.trip);
    if (includeDeliveryTime && block.deliveryTime) metaParts.push(block.deliveryTime);
    if (block.deliveryMethod && block.deliveryMethod !== '外送') metaParts.push(block.deliveryMethod);
    const metaStr = metaParts.length > 0 ? ` (${metaParts.join(' ')})` : '';

    let text = `${block.isWatchlist ? '🚨 ' : '▸ '}${cName}${metaStr}`;
    Object.values(merged).forEach(it => {
      text += `\n  • ${it.productName} × ${it.quantity}${it.unit}`;
    });
    if (block.notes.length > 0) {
      text += `\n  📝 備註：${block.notes.join(' / ')}`;
    }
    return text;
  };

  const totalsArr = Object.values(itemTotalsMap).map(it => `${it.productName} ${it.quantity}${it.unit}`);
  const subtotalText = totalsArr.length > 0
    ? `📦 總備貨小計：\n${totalsArr.join('、')}`
    : (emptyStoreBehavior === 'SHOW_NO_ORDER' ? '📦 總備貨小計：\n（無出貨品項）' : '__REMOVE_LINE__');

  const missingText = missingCustomers.length > 0
    ? `❓ 以下標籤店家今日非公休但 0 筆訂單：\n${missingCustomers.map(c => `• ${c.name}`).join('\n')}`
    : '__REMOVE_LINE__';

  const hasManualTotalsToken = template.indexOf('{{總備貨小計}}') !== -1;

  let rendered = template
    .replace(/\{\{今日日期\}\}/g, titleDate)
    .replace(/\{\{總備貨小計\}\}/g, subtotalText)
    .replace(/\{\{無單確認名單\}\}/g, missingText)
    .replace(/\{\{店家:([^|}]+)(?:\|([^}]+))?\}\}/g, (_, rawName, rawId) => {
      const custObj = (rawId && customerByIdMap[String(rawId).trim()]) || customerByNameMap[String(rawName).trim()];
      const targetName = custObj ? String(custObj.name).trim() : String(rawName).trim();
      const block = custOrderMap[targetName];
      if (!block) {
        return emptyStoreBehavior === 'SHOW_NO_ORDER'
          ? `▸ ${targetName}（⭕ 今日無單）`
          : '__REMOVE_LINE__';
      }
      return formatCustomerTokenBlock(targetName, block);
    });

  rendered = rendered
    .split('\n')
    .filter(line => line.trim() !== '__REMOVE_LINE__')
    .map(line => line.replace(/__REMOVE_LINE__/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (appendItemTotals && !hasManualTotalsToken && totalsArr.length > 0) {
    rendered += `\n━━━━━━━━━━━━━━\n📦 總備貨小計：\n${totalsArr.join('、')}`;
  }

  return rendered.trim();
}

/**
 * 方案二核心：每日出車簡報排程與手動推演/發送
 */
function runDailyBriefingCheck(isDryRun = false, forceRun = false, overrideConfig = null) {
  const configSheet = getConfigSheet();
  const settingsStr = getSystemConfig(configSheet, "AppSettings");
  let settings = {};
  if (settingsStr) {
    try { settings = JSON.parse(settingsStr) || {}; } catch (e) {}
  }

  const channelToken = String(settings.lineChannelToken || '').trim();
  const adminUserIds = String(settings.lineUserId || '').split(',').map(s => s.trim()).filter(Boolean);

  let briefingList = [];
  if (overrideConfig) {
    briefingList = [overrideConfig];
  } else if (Array.isArray(settings.dailyBriefings)) {
    briefingList = settings.dailyBriefings;
  } else if (settings.dailyBriefing) {
    briefingList = [settings.dailyBriefing];
  }

  if (briefingList.length === 0) {
    return [];
  }

  const now = new Date();
  const timeZone = SS.getSpreadsheetTimeZone() || "Asia/Taipei";
  const year = Utilities.formatDate(now, timeZone, "yyyy");
  const month = Utilities.formatDate(now, timeZone, "MM");
  const dateNumStr = Utilities.formatDate(now, timeZone, "dd");
  const todayStr = `${year}-${month}-${dateNumStr}`;
  const currentHour = Utilities.formatDate(now, timeZone, "HH");
  const currentDayNum = parseInt(Utilities.formatDate(now, timeZone, "u"), 10) % 7;
  const shortDays = ['日', '一', '二', '三', '四', '五', '六'];
  const titleDate = `${Number(month)}/${Number(dateNumStr)}(${shortDays[currentDayNum]})`;
  const scriptCache = CacheService.getScriptCache();

  // 先檢查是否有任何需要執行的簡報（避免全部未啟用／非排程時段卻重複讀取工作表）
  const activeCandidates = [];
  for (let bIdx = 0; bIdx < briefingList.length; bIdx++) {
    const b = briefingList[bIdx];
    if (!b) continue;
    const bId = String(b.id || (bIdx === 0 ? 'DAILY_BRIEFING' : `BRIEFING_${bIdx}`));
    const bName = String(b.name || '每日出車簡報');

    if (!channelToken) {
      if (forceRun) {
        const details = { reason: "未設定 LINE Channel Access Token" };
        if (!isDryRun) {
          try {
            const ts = Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd HH:mm:ss");
            getNotificationLogSheet().appendRow([ts, "MANUAL_TEST", bId, bName, "SKIPPED", JSON.stringify(details)]);
          } catch (e) {}
        }
        return [{ ruleId: bId, ruleName: bName, status: "SKIPPED", details }];
      }
      continue;
    }

    if (!b.enabled && !forceRun) {
      continue;
    }

    const scheduleArr = Array.isArray(b.schedule) ? b.schedule.map(String) : ['1', '2', '3', '4', '5', '6'];
    const timeStr = String(b.timeToNotify || '06:00');
    const safeBid = bId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cacheKey = `BRIEFING_SENT_${safeBid}_${year}${month}${dateNumStr}_${currentHour}`;

    if (!forceRun) {
      if (!scheduleArr.includes(String(currentDayNum)) || !timeStr.startsWith(currentHour)) {
        continue;
      }
      if (!isDryRun && scriptCache.get(cacheKey)) {
        continue;
      }
    }

    activeCandidates.push({ briefing: b, bId, bName, cacheKey });
  }

  if (activeCandidates.length === 0) {
    if (forceRun && briefingList[0]) {
      const b0 = briefingList[0];
      const b0Id = String(b0.id || 'DAILY_BRIEFING');
      const b0Name = String(b0.name || '每日出車簡報');
      const details = { reason: "每日出車簡報尚未啟用" };
      if (!isDryRun) {
        try {
          const ts = Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd HH:mm:ss");
          getNotificationLogSheet().appendRow([ts, "MANUAL_TEST", b0Id, b0Name, "SKIPPED", JSON.stringify(details)]);
        } catch (e) {}
      }
      return [{ ruleId: b0Id, ruleName: b0Name, status: "SKIPPED", details }];
    }
    return [];
  }

  const data = getData(todayStr, 0);
  const customers = data.customers || [];
  const customerByNameMap = {};
  const customerByIdMap = {};
  customers.forEach(c => {
    if (c.name) customerByNameMap[String(c.name).trim()] = c;
    if (c.id) customerByIdMap[String(c.id).trim()] = c;
  });

  const normalizeGasDate = (dStr) => {
    if (!dStr) return "";
    if (dStr instanceof Date) return Utilities.formatDate(dStr, timeZone, "yyyy-MM-dd");
    return String(dStr).split(' ')[0].replace(/\//g, '-');
  };

  const todayOrders = (data.orders || []).filter(o =>
    normalizeGasDate(o.deliveryDate) === todayStr && !isCancelledOrderStatus(o.status)
  );

  const orderedCustNamesSet = new Set(todayOrders.map(o => String(o.customerName || '').trim()));
  const staffMap = getStaffInfoMap();
  const allResults = [];

  for (let cIdx = 0; cIdx < activeCandidates.length; cIdx++) {
    const { briefing, bId, bName, cacheKey } = activeCandidates[cIdx];

    const returnSkip = (reason, extra) => {
      const details = Object.assign({ reason }, extra || {});
      if (!isDryRun) {
        try {
          const ts = Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd HH:mm:ss");
          getNotificationLogSheet().appendRow([ts, forceRun ? "MANUAL_TEST" : "SYSTEM_CRON", bId, bName, "SKIPPED", JSON.stringify(details)]);
        } catch (e) {}
      }
      return { ruleId: bId, ruleName: bName, status: "SKIPPED", details };
    };

    const outboundMessages = [];
    const groupBy = briefing.groupBy || 'BY_DRIVER';

    let statsEvaluated = customers.length;
    let statsMatchedCust = orderedCustNamesSet.size;
    let statsMatchedOrders = todayOrders.length;

  if (briefing.briefingMode === 'CUSTOM_TEMPLATE') {
    const includedIds = Array.isArray(briefing.includedCustomerIds) ? briefing.includedCustomerIds.map(id => String(id).trim()).filter(Boolean) : [];
    const allowedNameSet = new Set();
    includedIds.forEach(id => {
      const custObj = customerByIdMap[id];
      if (custObj && !custObj.isArchived && custObj.name) {
        allowedNameSet.add(String(custObj.name).trim());
      }
    });

    const scopedOrders = todayOrders.filter(o => allowedNameSet.has(String(o.customerName || '').trim()));
    const missingIncluded = includedIds
      .map(id => customerByIdMap[id])
      .filter(c => {
        if (!c || c.isArchived || c.isPaused) return false;
        const isOff = (Array.isArray(c.offDays) && c.offDays.includes(currentDayNum)) ||
                      (Array.isArray(c.holidayDates) && c.holidayDates.includes(todayStr));
        return !isOff && !orderedCustNamesSet.has(String(c.name || '').trim());
      });

    statsEvaluated = includedIds.length;
    statsMatchedCust = new Set(scopedOrders.map(o => String(o.customerName || '').trim())).size;
    statsMatchedOrders = scopedOrders.length;

    if (scopedOrders.length === 0 && missingIncluded.length === 0 && briefing.emptyStoreBehavior !== 'SHOW_NO_ORDER') {
      allResults.push(returnSkip("今日白名單標籤店家尚無有效配送訂單", {
        customersEvaluated: statsEvaluated,
        customersMatched: 0,
        ordersMatched: 0
      }));
      continue;
    }

    const renderOptsBase = {
      template: briefing.customTemplate || '',
      titleDate,
      customerByIdMap,
      customerByNameMap,
      emptyStoreBehavior: briefing.emptyStoreBehavior || 'HIDE_LINE',
      appendItemTotals: briefing.customIncludeItemTotals === true,
      includeTripInfo: briefing.includeTripInfo === true,
      includeDeliveryTime: briefing.includeDeliveryTime === true
    };

    if (groupBy === 'BY_DRIVER') {
      const driverGroups = {};
      const unassignedOrders = [];

      scopedOrders.forEach(o => {
        const aId = String(o.assignedTo || '').trim();
        const staffObj = aId ? staffMap[aId.toLowerCase()] : null;
        const lineId = staffObj?.line_user_id || (aId ? getStaffLineId(aId) : null);
        if (aId && lineId) {
          if (!driverGroups[aId]) {
            driverGroups[aId] = {
              staffName: o.assignedName || staffObj?.name || aId,
              lineId: lineId,
              orders: []
            };
          }
          driverGroups[aId].orders.push(o);
        } else {
          unassignedOrders.push(o);
        }
      });

      Object.values(driverGroups).forEach(g => {
        const text = renderCustomBriefingTemplate(Object.assign({}, renderOptsBase, {
          orders: g.orders,
          missingCustomers: []
        }));
        if (text) {
          splitLineMessageChunks(text).forEach(chunk => {
            outboundMessages.push({
              targetLineIds: [g.lineId],
              recipientName: `${g.staffName} (司機)`,
              text: chunk
            });
          });
        }
      });

      const shouldSendAdminMonitor =
        adminUserIds.length > 0 &&
        ((unassignedOrders.length > 0 && briefing.fallbackToAdminIfUnassigned !== false) ||
          (scopedOrders.length === 0 && briefing.emptyStoreBehavior === 'SHOW_NO_ORDER') ||
          missingIncluded.length > 0);

      if (shouldSendAdminMonitor) {
        const adminOrders = briefing.fallbackToAdminIfUnassigned !== false ? unassignedOrders : [];
        const adminText = renderCustomBriefingTemplate(Object.assign({}, renderOptsBase, {
          orders: adminOrders,
          missingCustomers: missingIncluded
        }));
        if (adminText) {
          splitLineMessageChunks(adminText).forEach(chunk => {
            outboundMessages.push({
              targetLineIds: adminUserIds,
              recipientName: "管理員 (監控／未指派補送)",
              text: chunk
            });
          });
        }
      }
    } else if (groupBy === 'SPECIFIC_STAFF') {
      const staffIds = Array.isArray(briefing.targetStaffIds) ? briefing.targetStaffIds : [];
      const resolvedLineIds = [];
      const resolvedNames = [];
      staffIds.forEach(sId => {
        const staffObj = staffMap[String(sId).trim().toLowerCase()];
        const lid = (staffObj && staffObj.line_user_id) || getStaffLineId(sId);
        if (lid) {
          if (!resolvedLineIds.includes(lid)) resolvedLineIds.push(lid);
          resolvedNames.push(staffObj ? staffObj.name : sId);
        }
      });

      if (resolvedLineIds.length > 0) {
        const text = renderCustomBriefingTemplate(Object.assign({}, renderOptsBase, {
          orders: scopedOrders,
          missingCustomers: missingIncluded
        }));
        if (text) {
          splitLineMessageChunks(text).forEach(chunk => {
            outboundMessages.push({
              targetLineIds: resolvedLineIds,
              recipientName: `指定用戶：${resolvedNames.join('、')}`,
              text: chunk
            });
          });
        }
      }
    } else {
      if (adminUserIds.length > 0) {
        const text = renderCustomBriefingTemplate(Object.assign({}, renderOptsBase, {
          orders: scopedOrders,
          missingCustomers: missingIncluded
        }));
        if (text) {
          splitLineMessageChunks(text).forEach(chunk => {
            outboundMessages.push({
              targetLineIds: adminUserIds,
              recipientName: "預設管理員 (客製化標籤模板)",
              text: chunk
            });
          });
        }
      }
    }
  } else {
    // 標準三段式簡報
    let missingWatchlistCustomers = [];
    if (briefing.includeWatchlistMissingCheck !== false) {
      missingWatchlistCustomers = customers.filter(c => {
        if (!c.isWatchlist || c.isArchived || c.isPaused) return false;
        if (briefing.watchlistMissingOnlyRegular !== false) {
          const term = String(c.paymentTerm || 'regular').toLowerCase();
          if (term === 'occasional' || term === 'adhoc') return false;
        }
        const isOff = (Array.isArray(c.offDays) && c.offDays.includes(currentDayNum)) ||
                      (Array.isArray(c.holidayDates) && c.holidayDates.includes(todayStr));
        if (isOff) return false;
        return !orderedCustNamesSet.has(String(c.name || '').trim());
      });
    }

    if (todayOrders.length === 0 && missingWatchlistCustomers.length === 0) {
      allResults.push(returnSkip("今日尚無有效配送訂單，且無漏單盯哨異常", { customersEvaluated: customers.length, customersMatched: 0, ordersMatched: 0 }));
      continue;
    }

    if (groupBy === 'BY_DRIVER') {
      const driverGroups = {};
      const unassignedOrders = [];

      todayOrders.forEach(o => {
        const aId = String(o.assignedTo || '').trim();
        const staffObj = aId ? staffMap[aId.toLowerCase()] : null;
        const lineId = staffObj?.line_user_id || (aId ? getStaffLineId(aId) : null);
        if (aId && lineId) {
          if (!driverGroups[aId]) {
            driverGroups[aId] = {
              staffName: o.assignedName || staffObj?.name || aId,
              lineId: lineId,
              orders: []
            };
          }
          driverGroups[aId].orders.push(o);
        } else {
          unassignedOrders.push(o);
        }
      });

      Object.values(driverGroups).forEach(g => {
        const text = buildThreeSectionBriefingText({
          titleDate,
          subHeader: `👤 負責司機：${g.staffName}`,
          orders: g.orders,
          customerByNameMap,
          groupBy: 'BY_DRIVER',
          includeItemTotals: briefing.includeItemTotals !== false,
          includeTripInfo: briefing.includeTripInfo === true,
          includeDeliveryTime: briefing.includeDeliveryTime === true,
          missingWatchlistCustomers: [] // 司機只看自己要送的貨，無單檢查統一給內勤/管理員
        });
        splitLineMessageChunks(text).forEach(chunk => {
          outboundMessages.push({
            targetLineIds: [g.lineId],
            recipientName: `${g.staffName} (司機)`,
            text: chunk
          });
        });
      });

      const shouldSendAdminMonitor =
        adminUserIds.length > 0 &&
        ((unassignedOrders.length > 0 && briefing.fallbackToAdminIfUnassigned !== false) || missingWatchlistCustomers.length > 0);

      if (shouldSendAdminMonitor) {
        const text = buildThreeSectionBriefingText({
          titleDate,
          subHeader: '🛡️ 內勤／管理員監控摘要',
          orders: briefing.fallbackToAdminIfUnassigned !== false ? unassignedOrders : [],
          customerByNameMap,
          groupBy: 'BY_TRIP',
          includeItemTotals: briefing.includeItemTotals !== false,
          includeTripInfo: briefing.includeTripInfo === true,
          includeDeliveryTime: briefing.includeDeliveryTime === true,
          missingWatchlistCustomers,
          unscheduledNotice: unassignedOrders.length > 0 && briefing.fallbackToAdminIfUnassigned !== false
            ? `⚠️ 以下 ${unassignedOrders.length} 筆訂單尚未指派司機或司機未綁定 LINE：`
            : ''
        });
        splitLineMessageChunks(text).forEach(chunk => {
          outboundMessages.push({
            targetLineIds: adminUserIds,
            recipientName: "管理員 (監控／未指派補送)",
            text: chunk
          });
        });
      }
    } else if (groupBy === 'SPECIFIC_STAFF') {
      const staffIds = Array.isArray(briefing.targetStaffIds) ? briefing.targetStaffIds : [];
      const resolvedLineIds = [];
      const resolvedNames = [];
      staffIds.forEach(sId => {
        const staffObj = staffMap[String(sId).trim().toLowerCase()];
        const lid = (staffObj && staffObj.line_user_id) || getStaffLineId(sId);
        if (lid) {
          if (!resolvedLineIds.includes(lid)) resolvedLineIds.push(lid);
          resolvedNames.push(staffObj ? staffObj.name : sId);
        }
      });

      if (resolvedLineIds.length > 0) {
        const text = buildThreeSectionBriefingText({
          titleDate,
          subHeader: `👥 指定接收：${resolvedNames.join('、')}`,
          orders: todayOrders,
          customerByNameMap,
          groupBy: 'BY_TRIP',
          includeItemTotals: briefing.includeItemTotals !== false,
          includeTripInfo: briefing.includeTripInfo === true,
          includeDeliveryTime: briefing.includeDeliveryTime === true,
          missingWatchlistCustomers
        });
        splitLineMessageChunks(text).forEach(chunk => {
          outboundMessages.push({
            targetLineIds: resolvedLineIds,
            recipientName: `指定用戶：${resolvedNames.join('、')}`,
            text: chunk
          });
        });
      }
    } else {
      // BY_TRIP：依車趟彙整發送給預設管理員/群組
      if (adminUserIds.length > 0) {
        const text = buildThreeSectionBriefingText({
          titleDate,
          subHeader: '🚚 全廠依車趟出車總表',
          orders: todayOrders,
          customerByNameMap,
          groupBy: 'BY_TRIP',
          includeItemTotals: briefing.includeItemTotals !== false,
          includeTripInfo: briefing.includeTripInfo === true,
          includeDeliveryTime: briefing.includeDeliveryTime === true,
          missingWatchlistCustomers
        });
        splitLineMessageChunks(text).forEach(chunk => {
          outboundMessages.push({
            targetLineIds: adminUserIds,
            recipientName: "預設管理員 (全車趟總表)",
            text: chunk
          });
        });
      }
    }
  }

  if (outboundMessages.length === 0) {
    allResults.push(returnSkip("無可用的 LINE 接收對象或模板替換後為空（請確認管理員 User ID、司機 LINE 綁定與模板內容）", {
      customersEvaluated: statsEvaluated,
      customersMatched: statsMatchedCust,
      ordersMatched: statsMatchedOrders
    }));
    continue;
  }

  const uniqueRecipientNames = Array.from(new Set(outboundMessages.map(m => m.recipientName)));
  const trace = {
    step: "SENT",
    customersEvaluated: statsEvaluated,
    customersMatched: statsMatchedCust,
    ordersMatched: statsMatchedOrders,
    driverPushCount: uniqueRecipientNames.length,
    recipients: uniqueRecipientNames.join('、'),
    previewSamples: outboundMessages.slice(0, 5).map(m => ({
      recipientName: m.recipientName,
      previewText: m.text
    }))
  };

  if (!isDryRun) {
    const requests = outboundMessages.map(msg => {
      const ids = msg.targetLineIds;
      const endpoint = ids.length === 1
        ? "https://api.line.me/v2/bot/message/push"
        : "https://api.line.me/v2/bot/message/multicast";
      return {
        url: endpoint,
        method: "post",
        contentType: "application/json",
        headers: { "Authorization": "Bearer " + channelToken },
        payload: JSON.stringify({
          to: ids.length === 1 ? ids[0] : ids,
          messages: [{ type: "text", text: msg.text }]
        }),
        muteHttpExceptions: true
      };
    });

    try {
      const responses = UrlFetchApp.fetchAll(requests);
      const errors = [];
      responses.forEach(res => {
        if (res.getResponseCode() !== 200) {
          errors.push(`HTTP ${res.getResponseCode()}: ${res.getContentText()}`);
        }
      });

      const ts = Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd HH:mm:ss");
      if (errors.length === 0) {
        if (!forceRun) {
          try { scriptCache.put(cacheKey, "1", 3600); } catch (e) {}
        }
        try {
          getNotificationLogSheet().appendRow([ts, forceRun ? "MANUAL_TEST" : "SYSTEM_CRON", bId, bName, "SUCCESS", JSON.stringify(trace)]);
        } catch (e) {}
        allResults.push({ ruleId: bId, ruleName: bName, status: "SUCCESS", details: trace });
      } else {
        const errTrace = Object.assign({}, trace, { Error: errors.join(' | ') });
        try {
          getNotificationLogSheet().appendRow([ts, forceRun ? "MANUAL_TEST" : "SYSTEM_CRON", bId, bName, "ERROR", JSON.stringify(errTrace)]);
        } catch (e) {}
        allResults.push({ ruleId: bId, ruleName: bName, status: "ERROR", details: errTrace });
      }
    } catch (err) {
      allResults.push({ ruleId: bId, ruleName: bName, status: "ERROR", details: Object.assign({}, trace, { Error: err.toString() }) });
    }
  } else {
    allResults.push({ ruleId: bId, ruleName: bName, status: "SUCCESS", details: trace });
  }
  } // end activeCandidates loop

  return allResults;
}

/**
 * 取得常駐於輸入框上方的 Quick Reply 控制快捷按鈕列
 */
function getDefaultControlQuickReply() {
  return {
    items: [
      {
        type: "action",
        action: { type: "postback", label: "🎛️ 控制選單", data: "cmd=SHOW_MENU", displayText: "選單" }
      },
      {
        type: "action",
        action: { type: "postback", label: "✏️ 改單", data: "cmd=W_START&op=U&day=T&p=0", displayText: "✏️ 我要改單" }
      },
      {
        type: "action",
        action: { type: "postback", label: "📊 改狀態", data: "cmd=W_START&op=S&day=T&p=0", displayText: "📊 更改訂單狀態" }
      },
      {
        type: "action",
        action: { type: "postback", label: "🏖️ 設公休", data: "cmd=W_START&op=H&p=0", displayText: "🏖️ 設定店家公休" }
      },
      {
        type: "action",
        action: { type: "postback", label: "🗑️ 刪單", data: "cmd=W_START&op=D&day=T&p=0", displayText: "🗑️ 刪除訂單" }
      },
      {
        type: "action",
        action: { type: "postback", label: "📋 今日訂單", data: "cmd=W_TODAY", displayText: "📋 查看今日訂單" }
      }
    ]
  };
}

function sendLineReply(replyToken, channelToken, messagesOrText, skipDefaultQuickReply) {
  if (!replyToken || !channelToken || !messagesOrText) return;
  let messages = [];
  if (typeof messagesOrText === 'string') {
    messages = [{ type: "text", text: messagesOrText }];
  } else if (Array.isArray(messagesOrText)) {
    messages = messagesOrText.map(m => typeof m === 'string' ? { type: "text", text: m } : m);
  } else if (typeof messagesOrText === 'object') {
    messages = [messagesOrText];
  }
  if (messages.length === 0) return;

  const trimmedMsgs = messages.slice(0, 5);
  if (!skipDefaultQuickReply) {
    const lastIdx = trimmedMsgs.length - 1;
    if (trimmedMsgs[lastIdx] && !trimmedMsgs[lastIdx].quickReply) {
      trimmedMsgs[lastIdx] = Object.assign({}, trimmedMsgs[lastIdx], {
        quickReply: getDefaultControlQuickReply()
      });
    }
  }

  try {
    UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
      method: "post",
      contentType: "application/json",
      headers: {
        "Authorization": "Bearer " + channelToken
      },
      payload: JSON.stringify({
        replyToken: replyToken,
        messages: trimmedMsgs
      }),
      muteHttpExceptions: true
    });
  } catch (err) {
    console.error("LINE reply error: " + err.toString());
  }
}

/**
 * 建置「🎛️ ERP 系統控制主面板」Flex Message（4 大操作按鈕＋今日訂單）
 */
function buildLineControlMenuMessage(lineUser) {
  const userStatusLine = lineUser
    ? `👤 已綁定：${lineUser.name} (${String(lineUser.role || 'staff').toUpperCase()})`
    : `⚠️ 尚未綁定帳號（請先輸入：#綁定 工號）`;

  return {
    type: "flex",
    altText: "🎛️ ERP 快速控制面板（改單 / 狀態 / 公休 / 刪單）",
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0F172A",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: "🎛️ 系統快速控制面板",
            weight: "bold",
            size: "lg",
            color: "#FFFFFF"
          },
          {
            type: "text",
            text: userStatusLine,
            size: "xs",
            color: "#94A3B8",
            margin: "xs",
            wrap: true
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        contents: [
          {
            type: "text",
            text: "直接點選下方按鈕操作，免背指令：",
            size: "xs",
            color: "#64748B",
            margin: "none"
          },
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            margin: "sm",
            contents: [
              {
                type: "button",
                style: "primary",
                color: "#2563EB",
                height: "sm",
                flex: 1,
                action: {
                  type: "postback",
                  label: "✏️ 修改訂單",
                  data: "cmd=W_START&op=U&day=T&p=0",
                  displayText: "✏️ 修改訂單"
                }
              },
              {
                type: "button",
                style: "primary",
                color: "#059669",
                height: "sm",
                flex: 1,
                action: {
                  type: "postback",
                  label: "📊 更改狀態",
                  data: "cmd=W_START&op=S&day=T&p=0",
                  displayText: "📊 更改訂單狀態"
                }
              }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            margin: "sm",
            contents: [
              {
                type: "button",
                style: "primary",
                color: "#D97706",
                height: "sm",
                flex: 1,
                action: {
                  type: "postback",
                  label: "🏖️ 設定公休",
                  data: "cmd=W_START&op=H&p=0",
                  displayText: "🏖️ 設定店家公休"
                }
              },
              {
                type: "button",
                style: "primary",
                color: "#DC2626",
                height: "sm",
                flex: 1,
                action: {
                  type: "postback",
                  label: "🗑️ 刪除訂單",
                  data: "cmd=W_START&op=D&day=T&p=0",
                  displayText: "🗑️ 刪除訂單"
                }
              }
            ]
          },
          {
            type: "button",
            style: "secondary",
            height: "sm",
            margin: "sm",
            action: {
              type: "postback",
              label: "📋 查看今日訂單一覽",
              data: "cmd=W_TODAY",
              displayText: "📋 查看今日訂單"
            }
          }
        ]
      }
    }
  };
}

/**
 * 清除 LINE Bot 與前台共享的短期快取
 */
function invalidateLineCaches(opts) {
  try {
    const cache = CacheService.getScriptCache();
    if (!cache) return;
    const keys = [];
    if (!opts || opts.orders) keys.push("LINE_ORDERS_IDX_V1");
    if (!opts || opts.customers) keys.push("LINE_CUSTOMERS_IDX_V1", "APP_CACHE_CPT");
    if (!opts || opts.products) keys.push("LINE_PRODUCTS_IDX_V1", "APP_CACHE_CPT");
    if (!opts || opts.users) keys.push("LINE_USER_MAP_V1");
    if (!opts || opts.config) keys.push("LINE_CHANNEL_TOKEN_V1", "LINE_GEMINI_KEY_V1", "APP_CACHE_CPT");
    if (keys.length > 0) {
      if (typeof cache.removeAll === 'function') {
        cache.removeAll(keys);
      } else {
        keys.forEach(function(k) { cache.remove(k); });
      }
    }
  } catch (e) {}
}

/**
 * 將試算表內的訂單日期值標準化為 YYYY-MM-DD 字串
 */
function normalizeOrderDateString(rawDate, timeZone, currentYear) {
  if (!rawDate) return '';
  const tz = timeZone || "Asia/Taipei";
  if (rawDate instanceof Date) {
    return Utilities.formatDate(rawDate, tz, "yyyy-MM-dd");
  }
  let s = String(rawDate).trim().split('T')[0].split(/\s+/)[0];
  if (!s) return '';
  s = s.replace(/\./g, '-').replace(/\//g, '-');
  const mFull = s.match(/^(\d{2,4})-(\d{1,2})-(\d{1,2})$/);
  if (mFull) {
    let y = mFull[1];
    if (y.length === 2) y = "20" + y;
    else if (y.length === 3 && parseInt(y, 10) < 1900) y = String(parseInt(y, 10) + 1911);
    return y + "-" + mFull[2].padStart(2, '0') + "-" + mFull[3].padStart(2, '0');
  }
  const mShort = s.match(/^(\d{1,2})-(\d{1,2})$/);
  if (mShort) {
    const yr = currentYear || Utilities.formatDate(new Date(), tz, "yyyy");
    return yr + "-" + mShort[1].padStart(2, '0') + "-" + mShort[2].padStart(2, '0');
  }
  return s;
}

/**
 * 使用 Google Sheets API (Values.get / Values.batchGet) 急速讀取工作表為物件陣列，並保留 SpreadsheetApp 降級相容
 */
function readSheetRowsFast(ss, sheet, maxRecentRows) {
  if (!sheet) return [];
  try {
    if (typeof Sheets !== 'undefined') {
      const spreadsheetId = ss.getId();
      const sheetName = sheet.getName();
      let headerRow = [];
      let dataRows = [];

      if (maxRecentRows && maxRecentRows > 0) {
        const lastRow = sheet.getLastRow();
        if (lastRow <= 1) return [];
        const startRow = Math.max(2, lastRow - maxRecentRows + 1);
        const res = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, {
          ranges: [sheetName + "!1:1", sheetName + "!A" + startRow + ":Z" + lastRow],
          valueRenderOption: 'FORMATTED_VALUE'
        });
        const vr0 = res.valueRanges && res.valueRanges[0] && res.valueRanges[0].values;
        const vr1 = res.valueRanges && res.valueRanges[1] && res.valueRanges[1].values;
        headerRow = (vr0 && vr0[0]) ? vr0[0] : [];
        dataRows = vr1 || [];
      } else {
        const res = Sheets.Spreadsheets.Values.get(spreadsheetId, sheetName + "!A:Z", {
          valueRenderOption: 'FORMATTED_VALUE'
        });
        const values = res.values || [];
        if (values.length <= 1) return [];
        headerRow = values[0] || [];
        dataRows = values.slice(1);
      }

      const headers = headerRow.map(h => String(h || '').trim());
      if (headers.length === 0 || dataRows.length === 0) return [];

      const out = [];
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (!row || row.length === 0) continue;
        let hasVal = false;
        const obj = {};
        for (let j = 0; j < headers.length; j++) {
          const h = headers[j];
          if (h) {
            const v = row[j] !== undefined ? row[j] : '';
            if (!hasVal && v !== '' && v !== null) hasVal = true;
            obj[h] = v;
          }
        }
        if (hasVal) out.push(obj);
      }
      return out;
    }
  } catch (e) {
    console.warn("readSheetRowsFast Sheets API fallback:", e);
  }
  return maxRecentRows && maxRecentRows > 0
    ? getRecentSheetData(sheet, maxRecentRows)
    : getSheetData(sheet);
}

/**
 * 快取 LINE Channel Access Token (TTL 300s)
 */
function getCachedLineChannelToken() {
  const cache = CacheService.getScriptCache();
  try {
    const cached = cache.get("LINE_CHANNEL_TOKEN_V1");
    if (cached) return cached;
  } catch (e) {}

  let token = "";
  try {
    const configSheet = getConfigSheet();
    const settingsStr = getSystemConfig(configSheet, "AppSettings");
    if (settingsStr) {
      const settings = JSON.parse(settingsStr);
      token = String(settings.lineChannelToken || '').trim();
    }
  } catch (e) {}
  if (!token) {
    token = String(getLineMessagingToken() || '').trim();
  }
  if (token) {
    try { cache.put("LINE_CHANNEL_TOKEN_V1", token, 300); } catch (e) {}
  }
  return token;
}

/**
 * 快取 Gemini API Key (TTL 300s)
 */
function getCachedGeminiApiKey() {
  const cache = CacheService.getScriptCache();
  try {
    const cached = cache.get("LINE_GEMINI_KEY_V1");
    if (cached === "__NONE__") return "";
    if (cached) return cached;
  } catch (e) {}

  let key = "";
  try {
    const configSheet = getConfigSheet();
    key = String(getSystemConfig(configSheet, "GeminiApiKey") || '').trim();
    if (!key) {
      const settingsStr = getSystemConfig(configSheet, "AppSettings");
      if (settingsStr) {
        const settings = JSON.parse(settingsStr);
        key = String(settings.geminiApiKey || '').trim();
      }
    }
  } catch (e) {}

  try {
    cache.put("LINE_GEMINI_KEY_V1", key || "__NONE__", key ? 300 : 60);
  } catch (e) {}
  return key;
}

/**
 * 輕量讀取最新 5000 筆訂單（跳過價目表與歷史單價計算），供跨視窗 fallback 使用
 */
function getRecentOrdersLight(ss) {
  const orderSheet = ss.getSheetByName("ORDERS") || ss.getSheetByName("Orders");
  if (!orderSheet || orderSheet.getLastRow() <= 1) return [];

  const timeZone = ss.getSpreadsheetTimeZone() || "Asia/Taipei";
  const currentYear = Utilities.formatDate(new Date(), timeZone, "yyyy");
  const raw = readSheetRowsFast(ss, orderSheet, 5000);
  const out = [];

  for (let i = 0; i < raw.length; i++) {
    const o = raw[i];
    const oid = String(o.ID || o.id || o["Order ID"] || o.訂單ID || '').trim();
    if (!oid) continue;
    const status = String(o.Status || o.status || o.狀態 || 'PENDING').trim();
    if (status.toUpperCase() === 'DELETED') continue;

    out.push({
      id: oid,
      customerName: String(o.CustomerName || o.customerName || o.客戶名 || '').trim(),
      deliveryDate: normalizeOrderDateString(o.DeliveryDate || o.deliveryDate || o.配送日期, timeZone, currentYear),
      deliveryTime: formatDeliveryTimeString(o.DeliveryTime || o.deliveryTime || o.配送時間 || '', timeZone),
      productName: String(o.ProductName || o.productName || o.品項 || '').trim(),
      quantity: Number(o.Quantity || o.quantity || o.數量) || 1,
      unit: String(o.Unit || o.unit || o.單位 || '斤').trim() || '斤',
      note: String(o.Note || o.note || o.備註 || ''),
      status: status,
      deliveryMethod: String(o.DeliveryMethod || o.deliveryMethod || o.配送方式 || ''),
      source: String(o.Source || o.source || o.資料來源 || ''),
      trip: String(o.Trip || o.trip || o.趟次 || ''),
      assignedTo: String(o.assigned_to || o.AssignedTo || o.指派人員ID || o.指派人員 || '').trim(),
      assignedName: String(o.assigned_name || o.AssignedName || o.指派人員姓名 || '').trim()
    });
  }
  return out;
}

/**
 * 取得活躍視窗（昨日～未來30日）輕量訂單索引並快取於 CacheService (TTL 60s)
 */
function getLineOrdersIndex(ss, forceFresh) {
  const CACHE_KEY = "LINE_ORDERS_IDX_V1";
  const cache = CacheService.getScriptCache();
  if (!forceFresh) {
    try {
      const cached = cache.get(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
  }

  const timeZone = ss.getSpreadsheetTimeZone() || "Asia/Taipei";
  const now = new Date();
  const todayStr = Utilities.formatDate(now, timeZone, "yyyy-MM-dd");
  const yObj = new Date(todayStr + 'T00:00:00'); yObj.setDate(yObj.getDate() - 1);
  const yesterdayStr = Utilities.formatDate(yObj, timeZone, "yyyy-MM-dd");
  const f30Obj = new Date(todayStr + 'T00:00:00'); f30Obj.setDate(f30Obj.getDate() + 30);
  const plus30Str = Utilities.formatDate(f30Obj, timeZone, "yyyy-MM-dd");

  const allLight = getRecentOrdersLight(ss);
  let activeWindow = allLight.filter(o => o.deliveryDate && o.deliveryDate >= yesterdayStr && o.deliveryDate <= plus30Str);

  // CacheService 單筆上限 100KB：自動縮減備援避免寫入失敗
  let jsonStr = JSON.stringify(activeWindow);
  if (jsonStr.length > 90000) {
    const f7Obj = new Date(todayStr + 'T00:00:00'); f7Obj.setDate(f7Obj.getDate() + 7);
    const plus7Str = Utilities.formatDate(f7Obj, timeZone, "yyyy-MM-dd");
    activeWindow = activeWindow.filter(o => o.deliveryDate <= plus7Str);
    jsonStr = JSON.stringify(activeWindow);
  }
  if (jsonStr.length <= 95000) {
    try { cache.put(CACHE_KEY, jsonStr, 60); } catch (e) {}
  }
  return activeWindow;
}

/**
 * 快速依 Order ID 查找訂單明細（先查快取活躍索引，未命中才降級讀近期輕量訂單）
 */
function findOrderRowsByIdFast(ss, orderId, preloadedOrders) {
  const oid = String(orderId || '').trim();
  if (!oid) return [];
  if (Array.isArray(preloadedOrders)) {
    return preloadedOrders.filter(o => String(o.id).trim() === oid);
  }
  const idx = getLineOrdersIndex(ss);
  const hit = idx.filter(o => String(o.id).trim() === oid);
  if (hit.length > 0) return hit;

  const fallbackAll = getRecentOrdersLight(ss);
  return fallbackAll.filter(o => String(o.id).trim() === oid);
}

/**
 * 快速取得指定日期的有效訂單（視窗內直接走快取索引）
 */
function getOrdersForTargetDateFast(ss, targetDate, preloadedOrders) {
  if (Array.isArray(preloadedOrders)) {
    return preloadedOrders.filter(o => o.deliveryDate === targetDate);
  }
  const timeZone = ss.getSpreadsheetTimeZone() || "Asia/Taipei";
  const todayStr = Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd");
  const yObj = new Date(todayStr + 'T00:00:00'); yObj.setDate(yObj.getDate() - 1);
  const yesterdayStr = Utilities.formatDate(yObj, timeZone, "yyyy-MM-dd");
  const f30Obj = new Date(todayStr + 'T00:00:00'); f30Obj.setDate(f30Obj.getDate() + 30);
  const plus30Str = Utilities.formatDate(f30Obj, timeZone, "yyyy-MM-dd");

  if (targetDate >= yesterdayStr && targetDate <= plus30Str) {
    return getLineOrdersIndex(ss).filter(o => o.deliveryDate === targetDate);
  }
  return getRecentOrdersLight(ss).filter(o => o.deliveryDate === targetDate);
}

/**
 * 取得輕量店家索引（移除龐大價目表與預設品項 JSON，TTL 180s）
 */
function getLineCustomersIndex(ss, forceFresh) {
  const CACHE_KEY = "LINE_CUSTOMERS_IDX_V1";
  const cache = CacheService.getScriptCache();
  if (!forceFresh) {
    try {
      const cached = cache.get(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
  }

  const custSheet = ss.getSheetByName("CUSTOMERS") || ss.getSheetByName("Customers");
  if (!custSheet || custSheet.getLastRow() <= 1) return [];

  const parseArr = function(val) {
    if (Array.isArray(val)) return val;
    if (!val) return [];
    try {
      const p = JSON.parse(String(val));
      return Array.isArray(p) ? p : [val];
    } catch (e) {
      return String(val).split(/[,、，\s]+/).filter(Boolean);
    }
  };

  const rows = readSheetRowsFast(ss, custSheet, 0);
  const list = rows.map(function(c) {
    const name = String(c.Name || c.name || c.客戶名稱 || '').trim();
    const id = String(c.ID || c.id || '').trim();
    const isArchived = String(c.封存 || c.isArchived || '').trim().toLowerCase() === 'true';
    return {
      id: id,
      name: name,
      phone: String(c.Phone || c.phone || c.電話 || '').trim(),
      address: String(c.Address || c.address || c.地址 || '').trim(),
      businessHours: String(c.BusinessHours || c.businessHours || c.營業時間 || '未設定').trim(),
      note: String(c.Note || c.note || c.備註 || '').trim(),
      offDays: parseArr(c.OffDays || c.offDays || c.公休日週期JSON || c.公休日週期 || c.Holidays || c.公休日)
        .map(x => parseChineseWeekdayNumber(x) !== null ? parseChineseWeekdayNumber(x) : Number(x))
        .filter(n => !isNaN(n) && n >= 0 && n <= 6),
      holidayDates: parseArr(c.HolidayDates || c.holidayDates || c.特定公休日JSON || c.特定公休日)
        .map(d => String(d).trim().replace(/\//g, '-'))
        .filter(Boolean),
      isArchived: isArchived
    };
  }).filter(c => c.name);

  try {
    const jsonStr = JSON.stringify(list);
    if (jsonStr.length <= 95000) cache.put(CACHE_KEY, jsonStr, 180);
  } catch (e) {}
  return list;
}

/**
 * 取得輕量商品索引 (TTL 300s)
 */
function getLineProductsIndex(ss, forceFresh) {
  const CACHE_KEY = "LINE_PRODUCTS_IDX_V1";
  const cache = CacheService.getScriptCache();
  if (!forceFresh) {
    try {
      const cached = cache.get(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
  }

  const prodSheet = ss.getSheetByName("PRODUCTS") || ss.getSheetByName("Products");
  if (!prodSheet || prodSheet.getLastRow() <= 1) return [];

  const rows = readSheetRowsFast(ss, prodSheet, 0);
  const list = rows.map(function(p) {
    return {
      id: String(p.ID || p.id || '').trim(),
      name: String(p.Name || p.name || p.品項 || '').trim(),
      unit: String(p.Unit || p.unit || p.單位 || '斤').trim() || '斤',
      price: Number(p.Price || p.price || p.單價) || undefined
    };
  }).filter(p => p.name);

  try {
    const jsonStr = JSON.stringify(list);
    if (jsonStr.length <= 95000) cache.put(CACHE_KEY, jsonStr, 300);
  } catch (e) {}
  return list;
}

/**
 * 依 LINE User ID 從 Users 工作表反查系統使用者帳號與權限角色 (帶 5 分鐘快取)
 */
function getUserByLineId(lineUserId) {
  const targetLineId = String(lineUserId || '').trim();
  if (!targetLineId) return null;

  const CACHE_KEY = "LINE_USER_MAP_V1";
  const cache = CacheService.getScriptCache();
  try {
    const cached = cache.get(CACHE_KEY);
    if (cached) {
      const map = JSON.parse(cached);
      return map[targetLineId] || null;
    }
  } catch (e) {}

  const sheet = SS.getSheetByName("Users") || SS.getSheetByName("USERS") || SS.getSheetByName("使用者");
  if (!sheet || sheet.getLastRow() <= 1) return null;

  const rows = readSheetRowsFast(SS, sheet, 0);
  if (rows.length === 0) return null;

  const headers = Object.keys(rows[0]);
  const idKey = headers.find(h => findHeaderIndex([h], ["user_id", "userid", "id", "使用者id", "工號", "編號", "代號"]) === 0);
  const userKey = headers.find(h => findHeaderIndex([h], ["username", "user", "帳號", "登入帳號", "使用者名稱"]) === 0);
  const nameKey = headers.find(h => findHeaderIndex([h], ["name", "display_name", "displayname", "姓名", "顯示姓名", "同仁姓名", "員工姓名"]) === 0);
  const roleKey = headers.find(h => findHeaderIndex([h], ["role", "職位", "角色", "職務", "職級", "職位角色"]) === 0);
  const statusKey = headers.find(h => findHeaderIndex([h], ["status", "狀態", "帳號狀態", "啟用狀態"]) === 0);
  const lineKey = headers.find(h => findHeaderIndex([h], ["line_user_id", "lineuserid", "line_id", "lineid", "line綁定id", "line"]) === 0);
  if (!lineKey) return null;

  const userMap = {};
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowLineId = String(row[lineKey] || '').trim();
    if (!rowLineId) continue;
    const rawId = idKey ? String(row[idKey] || '').trim() : '';
    const rawUser = userKey ? String(row[userKey] || '').trim() : '';
    const uId = rawId || rawUser;
    const uName = nameKey && String(row[nameKey] || '').trim()
      ? String(row[nameKey]).trim()
      : (rawUser || uId || '同仁');
    const role = roleKey && String(row[roleKey] || '').trim()
      ? String(row[roleKey]).trim().toLowerCase()
      : 'staff';
    const rawStatus = statusKey ? String(row[statusKey] || '').trim().toUpperCase() : 'ACTIVE';
    const isActive = (rawStatus !== 'DISABLED' && rawStatus !== 'FALSE');
    userMap[rowLineId] = {
      userId: uId,
      username: rawUser || uId,
      name: uName,
      role: role,
      status: isActive ? 'ACTIVE' : 'DISABLED',
      isActive: isActive,
      lineUserId: rowLineId
    };
  }

  try {
    const jsonStr = JSON.stringify(userMap);
    if (jsonStr.length <= 95000) cache.put(CACHE_KEY, jsonStr, 300);
  } catch (e) {}

  return userMap[targetLineId] || null;
}

function parseLinePostbackData(dataStr) {
  const result = {};
  if (!dataStr) return result;
  String(dataStr).split('&').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx > -1) {
      const k = decodeURIComponent(pair.substring(0, idx));
      const v = decodeURIComponent(pair.substring(idx + 1));
      result[k] = v;
    }
  });
  return result;
}

function getOrderStatusChineseLabel(status) {
  const s = String(status || '').trim().toUpperCase();
  const map = {
    'PENDING': '待出貨',
    'SHIPPED': '已出貨 / 已送達',
    'PAID': '已收款 / 已結清',
    'PAID_UNSHIPPED': '已收款 (未出貨)',
    'CANCELLED': '已取消',
    'DELETED': '已刪除'
  };
  return map[s] || s || '未知';
}

function normalizeLineOrderStatus(rawStatus) {
  const s = String(rawStatus || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return null;
  if (s === 'PENDING' || s === '待出貨' || s === '未出貨' || s === '待配送' || s === '未配送' || s === '恢復待出貨') return 'PENDING';
  if (s === 'SHIPPED' || s === '已出貨' || s === '已送達' || s === '送達' || s === '已配送' || s === '完成配送' || s === '配送完成') return 'SHIPPED';
  if (s === 'PAID_UNSHIPPED' || s === '已收款未出貨' || s === '已付款未出貨' || s === '先收款' || s === '預付') return 'PAID_UNSHIPPED';
  if (s === 'PAID' || s === '已收款' || s === '已付款' || s === '已結清' || s === '收款完成') return 'PAID';
  if (s === 'CANCELLED' || s === '已取消' || s === '取消訂單' || s === '取消') return 'CANCELLED';
  return null;
}

function parseRelativeOrCalendarDate(token, todayStr, timeZone) {
  const raw = String(token || '').trim();
  if (!raw) return null;
  const tz = timeZone || "Asia/Taipei";
  const now = new Date();
  const currentYear = Utilities.formatDate(now, tz, "yyyy");

  if (raw === '今天' || raw === '今日') return todayStr;
  if (raw === '明天' || raw === '明日') {
    const d = new Date(todayStr + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return Utilities.formatDate(d, tz, "yyyy-MM-dd");
  }
  if (raw === '後天' || raw === '後日') {
    const d = new Date(todayStr + 'T00:00:00');
    d.setDate(d.getDate() + 2);
    return Utilities.formatDate(d, tz, "yyyy-MM-dd");
  }
  if (raw === '昨天' || raw === '昨日') {
    const d = new Date(todayStr + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    return Utilities.formatDate(d, tz, "yyyy-MM-dd");
  }
  const fullMatch = raw.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (fullMatch) {
    return `${fullMatch[1]}-${fullMatch[2].padStart(2, '0')}-${fullMatch[3].padStart(2, '0')}`;
  }
  const mdMatch = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})(?:號|日)?$/);
  if (mdMatch) {
    const m = parseInt(mdMatch[1], 10);
    const d = parseInt(mdMatch[2], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${currentYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  const cnMdMatch = raw.match(/^(\d{1,2})月(\d{1,2})(?:號|日)?$/);
  if (cnMdMatch) {
    const m = parseInt(cnMdMatch[1], 10);
    const d = parseInt(cnMdMatch[2], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${currentYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return null;
}

function parseChineseWeekdayNumber(token) {
  const s = String(token || '').trim();
  const map = {
    '0': 0, '7': 0, '日': 0, '天': 0, '週日': 0, '周日': 0, '星期日': 0, '星期天': 0, '禮拜日': 0, '禮拜天': 0,
    '1': 1, '一': 1, '週一': 1, '周一': 1, '星期一': 1, '禮拜一': 1,
    '2': 2, '二': 2, '週二': 2, '周二': 2, '星期二': 2, '禮拜二': 2,
    '3': 3, '三': 3, '週三': 3, '周三': 3, '星期三': 3, '禮拜三': 3,
    '4': 4, '四': 4, '週四': 4, '周四': 4, '星期四': 4, '禮拜四': 4,
    '5': 5, '五': 5, '週五': 5, '周五': 5, '星期五': 5, '禮拜五': 5,
    '6': 6, '六': 6, '週六': 6, '周六': 6, '星期六': 6, '禮拜六': 6
  };
  return map[s] !== undefined ? map[s] : null;
}

function handleLineWebhook(payload) {
  const channelToken = getCachedLineChannelToken();

  if (!channelToken || !payload || !Array.isArray(payload.events)) {
    return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
  }

  const cache = CacheService.getScriptCache();

  payload.events.forEach(function(event) {
    // 1. Webhook 事件去重 (防止 LINE 網路重試造成重複執行)
    if (event.webhookEventId) {
      const dedupKey = "LINE_EVT_" + String(event.webhookEventId);
      if (cache.get(dedupKey)) {
        return;
      }
      cache.put(dedupKey, "1", 300);
    }

    // 2. 新加入好友事件：自動送出控制面板與綁定教學
    if (event.type === 'follow') {
      const uid = event.source ? event.source.userId : '';
      const lineUser = getUserByLineId(uid);
      sendLineReply(event.replyToken, channelToken, [
        buildLineControlMenuMessage(lineUser),
        {
          type: "text",
          text: "👋 歡迎使用製麵廠 ERP 智慧助理！\n您可以直接點選上方按鈕操作，或傳送「#綁定 您的工號」啟用操控與派工通知。"
        }
      ]);
      return;
    }

    // 3. Postback 按鈕事件處理 (例如「✅ 我已送達」、主面板與點選精靈)
    if (event.type === 'postback' && event.postback && event.postback.data) {
      handleLinePostbackEvent(event, channelToken);
      return;
    }

    // 4. 文字訊息事件處理
    if (event.type === 'message' && event.message && event.message.type === 'text') {
      const text = String(event.message.text || '').trim();
      const userId = event.source ? event.source.userId : '';
      const replyToken = event.replyToken;
      let replyPayload = "";

      // A. 查詢自己的 LINE User ID
      if (text === "查ID" || text === "我的ID" || text === "id" || text === "ID") {
        cache.remove("LINE_WIZARD_" + userId);
        replyPayload = "您的 LINE User ID 是：\n" + userId + "\n\n💡 若要綁定系統帳號，請輸入：\n#綁定 您的工號\n（例如：#綁定 staff3）";
      }
      // B. 司機/同仁自助綁定工號 (#綁定 工號 或 #bind 工號)
      else if (/^(?:#?綁定|#?bind)\s*([a-zA-Z0-9_\-]+)$/i.test(text)) {
        cache.remove("LINE_WIZARD_" + userId);
        const match = text.match(/^(?:#?綁定|#?bind)\s*([a-zA-Z0-9_\-]+)$/i);
        const targetStaffId = match ? match[1].trim() : '';
        const bindResult = handleLineSelfBind(userId, targetStaffId);
        if (bindResult.success) {
          const boundUser = getUserByLineId(userId);
          replyPayload = [
            {
              type: "text",
              text: `✅ 綁定成功！\n同仁【${bindResult.staffName} (${targetStaffId})】已成功綁定此 LINE 帳號。\n現在可直接點選下方按鈕或面板操作系統：`
            },
            buildLineControlMenuMessage(boundUser)
          ];
        } else {
          replyPayload = `❌ 綁定失敗：${bindResult.error || "查無此工號，請確認工號是否正確（例如：#綁定 staff3）"}`;
        }
      }
      // C. 喚醒控制主面板 (「選單 / menu / 控制 / 操作 / 面板 / 按鈕 / 0」)
      else if (/^(?:🎛️\s*)?(?:選單|主選單|控制|控制主選單|控制面板|操作|面板|按鈕|menu|0)$/i.test(text)) {
        cache.remove("LINE_WIZARD_" + userId);
        cache.remove("LINE_PENDING_" + userId);
        cache.remove("LINE_PICK_" + userId);
        const lineUser = getUserByLineId(userId);
        replyPayload = buildLineControlMenuMessage(lineUser);
      }
      // C2. 短文字快速喚起按鈕精靈（同時相容手打與 LINE 官方帳號管理員「文字類型」圖文選單）
      else if (/^(?:✏️\s*)?(?:改單|修改訂單)$/.test(text)) {
        handleLinePostbackEvent({ source: event.source, replyToken: replyToken, postback: { data: "cmd=W_START&op=U&day=T&p=0" } }, channelToken);
        return;
      }
      else if (/^(?:📊\s*)?(?:改狀態|更改狀態|更改訂單狀態)$/.test(text)) {
        handleLinePostbackEvent({ source: event.source, replyToken: replyToken, postback: { data: "cmd=W_START&op=S&day=T&p=0" } }, channelToken);
        return;
      }
      else if (/^(?:🏖️\s*)?(?:設公休|設定公休|設定店家公休|公休設定)$/.test(text)) {
        handleLinePostbackEvent({ source: event.source, replyToken: replyToken, postback: { data: "cmd=W_START&op=H&p=0" } }, channelToken);
        return;
      }
      else if (/^(?:🗑️\s*)?(?:刪單|刪除訂單)$/.test(text)) {
        handleLinePostbackEvent({ source: event.source, replyToken: replyToken, postback: { data: "cmd=W_START&op=D&day=T&p=0" } }, channelToken);
        return;
      }
      else if (/^(?:📋\s*)?(?:今日訂單|查看今日訂單)$/.test(text)) {
        handleLinePostbackEvent({ source: event.source, replyToken: replyToken, postback: { data: "cmd=W_TODAY" } }, channelToken);
        return;
      }
      // D. 說明選單 / 幫助 (同時送上按鈕面板＋指令範例)
      else if (text === "說明" || text === "幫助" || text === "help" || text === "功能" || text === "?") {
        cache.remove("LINE_WIZARD_" + userId);
        const lineUser = getUserByLineId(userId);
        const guideText =
          "🤖【系統 LINE 按鈕與指令說明】\n" +
          "━━━━━━━━━━━━━━\n" +
          "💡 免打字操作：輸入「選單」或直接點下方快捷列按鈕，即可用點選完成改單、改狀態、設公休、刪單！\n\n" +
          "⚡ 進階文字指令（#指令 與 口語皆可）：\n" +
          "• #改單 誠石 油麵 30（或 #改單 誠石 +油麵 5）\n" +
          "• #狀態 誠石 已送達（待出貨/已送達/已收款/已取消）\n" +
          "• #公休 鵝肉亭 5/20（或 週日 / 取消 5/20）\n" +
          "• #刪單 誠石 5/30\n" +
          "• 口語：「把誠石今天的油麵改成30斤」\n\n" +
          "🔍 查詢範例：「鵝肉亭今天有營業嗎？」、「誠石 5月貨款是多少？」";
        replyPayload = [buildLineControlMenuMessage(lineUser), { type: "text", text: guideText }];
      }
      // E. 檢查是否有待確認的異動暫存 (文字輸入「確認/取消」保底機制)
      else if (userId && cache.get("LINE_PENDING_" + userId) && /^(?:確認|確定|確認執行|好|是|y|yes|ok|取消|取消操作|不要|否|n|no)$/i.test(text)) {
        const pendingRaw = cache.get("LINE_PENDING_" + userId);
        if (/^(?:取消|取消操作|不要|否|n|no)$/i.test(text)) {
          cache.remove("LINE_PENDING_" + userId);
          cache.remove("LINE_PICK_" + userId);
          cache.remove("LINE_WIZARD_" + userId);
          replyPayload = "❌ 已取消本次操作，系統資料未變更。";
        } else {
          const lineUser = getUserByLineId(userId);
          if (!lineUser || !lineUser.isActive) {
            cache.remove("LINE_PENDING_" + userId);
            replyPayload = "🔒 您的系統帳號尚未綁定或已停用，無法執行寫入操作。";
          } else {
            try {
              const pending = JSON.parse(pendingRaw);
              cache.remove("LINE_PENDING_" + userId);
              replyPayload = executeLinePendingAction(pending, lineUser, { replyToken: replyToken, channelToken: channelToken });
            } catch (e) {
              cache.remove("LINE_PENDING_" + userId);
              replyPayload = "❌ 執行失敗：" + (e.message || String(e));
            }
          }
        }
      }
      // F. 檢查是否正在進行按鈕引導精靈輸入 (搜尋關鍵字 / 數量 / 備註 / 日期)
      else if (userId && cache.get("LINE_WIZARD_" + userId) && !text.startsWith('#')) {
        if (/^(?:取消|返回|退出|算了)$/i.test(text)) {
          cache.remove("LINE_WIZARD_" + userId);
          replyPayload = "❌ 已退出引導操作，您可點選下方按鈕重新選擇功能。";
        } else {
          replyPayload = handleLineWizardTextInput(text, userId);
        }
      }
      else {
        // G. 進入智慧指令與查詢雙解析處理器
        replyPayload = processLineCommandOrQuery(text, userId);
      }

      if (replyPayload !== null && replyPayload !== undefined && replyPayload !== "") {
        sendLineReply(replyToken, channelToken, replyPayload);
      }
    }
  });

  return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
}

/**
 * 將操作代碼轉為中文標題
 */
function getWizardOpMeta(op) {
  const map = {
    'U': { action: 'UPDATE_ORDER', label: '✏️ 修改訂單', verb: '修改明細' },
    'S': { action: 'UPDATE_ORDER_STATUS', label: '📊 更改訂單狀態', verb: '更改狀態' },
    'H': { action: 'SET_HOLIDAY', label: '🏖️ 設定店家公休', verb: '設定公休' },
    'D': { action: 'DELETE_ORDER', label: '🗑️ 刪除訂單', verb: '刪除訂單' }
  };
  return map[op] || map['S'];
}

/**
 * 載入分組後的有效訂單清單（供點選精靈與今日總覽使用）
 */
function getGroupedActiveOrdersForDate(ss, targetDate, lineUser, filterQuery, preloadedOrders) {
  const matchingRows = getOrdersForTargetDateFast(ss, targetDate, preloadedOrders);
  const groupMap = new Map();

  matchingRows.forEach(row => {
    const oid = String(row.id || '').trim();
    if (!oid) return;
    if (!groupMap.has(oid)) {
      groupMap.set(oid, {
        orderId: oid,
        customerName: row.customerName,
        deliveryDate: row.deliveryDate,
        deliveryTime: row.deliveryTime || '',
        status: row.status || 'PENDING',
        trip: row.trip || '',
        note: row.note || '',
        assignedTo: String(row.assignedTo || '').trim(),
        assignedName: String(row.assignedName || '').trim(),
        items: []
      });
    }
    groupMap.get(oid).items.push({
      productName: row.productName,
      quantity: Number(row.quantity) || 0,
      unit: row.unit || '斤',
      unitPrice: row.unitPrice
    });
  });

  let list = Array.from(groupMap.values());
  if (lineUser) {
    const role = String(lineUser.role || 'staff').trim().toLowerCase();
    if (!hasPermission(role, 'canViewAllOrders')) {
      const myId = String(lineUser.userId || '').trim();
      const myName = String(lineUser.name || '').trim();
      list = list.filter(o =>
        (myId && o.assignedTo === myId) || (myName && (o.assignedName === myName || o.assignedTo === myName))
      );
    }
  }
  if (filterQuery) {
    const q = String(filterQuery).trim().toLowerCase();
    list = list.filter(o => String(o.customerName || '').toLowerCase().includes(q));
  }
  return list;
}

/**
 * 建立「選擇訂單」訊息（含 Quick Reply 按鈕分頁＋今天/明天切換）
 */
function buildWizardOrderPickerMessage(ss, lineUser, op, dayFlag, pageIdx, filterQuery) {
  const tz = ss.getSpreadsheetTimeZone() || "Asia/Taipei";
  const now = new Date();
  const todayStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  const tomorrowObj = new Date(todayStr + 'T00:00:00');
  tomorrowObj.setDate(tomorrowObj.getDate() + 1);
  const tomorrowStr = Utilities.formatDate(tomorrowObj, tz, "yyyy-MM-dd");

  const useTomorrow = (dayFlag === 'N');
  const targetDate = useTomorrow ? tomorrowStr : todayStr;
  const dateLabel = useTomorrow ? `明天 (${tomorrowStr.substring(5)})` : `今天 (${todayStr.substring(5)})`;
  const opMeta = getWizardOpMeta(op);

  const orders = getGroupedActiveOrdersForDate(ss, targetDate, lineUser, filterQuery);
  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(orders.length / pageSize));
  const page = Math.max(0, Math.min(Number(pageIdx) || 0, totalPages - 1));
  const slice = orders.slice(page * pageSize, (page + 1) * pageSize);

  const cache = CacheService.getScriptCache();
  cache.put("LINE_WIZARD_" + lineUser.lineUserId, JSON.stringify({
    mode: 'SEARCH_ORDER',
    op: op,
    day: useTomorrow ? 'N' : 'T'
  }), 180);

  const quickItems = [];
  let text = `${opMeta.label}｜請點選要操作的訂單\n📅 目前顯示：${dateLabel}`;
  if (filterQuery) text += `（篩選：${filterQuery}）`;
  text += `\n━━━━━━━━━━━━━━\n`;

  if (slice.length === 0) {
    text += `⚪ ${dateLabel} 目前查無可操作的訂單。`;
  } else {
    text += slice.map((o, i) => {
      const num = page * pageSize + i + 1;
      const itemsShort = o.items.map(it => `${it.productName}×${it.quantity}`).join('、');
      return `${num}. 【${o.customerName}】${o.trip ? o.trip + ' ' : ''}| ${getOrderStatusChineseLabel(o.status)}\n   ${itemsShort}`;
    }).join('\n');

    slice.forEach((o, i) => {
      const totalQty = o.items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
      const shortName = String(o.customerName || '').substring(0, 10);
      const label = `${page * pageSize + i + 1}.${shortName}(${totalQty})`.substring(0, 20);
      quickItems.push({
        type: "action",
        action: {
          type: "postback",
          label: label,
          data: `cmd=W_PO&op=${op}&oid=${encodeURIComponent(o.orderId)}`,
          displayText: `選擇【${o.customerName}】`
        }
      });
    });
  }

  if (page + 1 < totalPages) {
    quickItems.push({
      type: "action",
      action: {
        type: "postback",
        label: `➡️ 下一頁 (${page + 2}/${totalPages})`,
        data: `cmd=W_START&op=${op}&day=${useTomorrow ? 'N' : 'T'}&p=${page + 1}`,
        displayText: "下一頁訂單"
      }
    });
  }

  quickItems.push({
    type: "action",
    action: {
      type: "postback",
      label: useTomorrow ? "📅 改看今天訂單" : "📅 改看明天訂單",
      data: `cmd=W_START&op=${op}&day=${useTomorrow ? 'T' : 'N'}&p=0`,
      displayText: useTomorrow ? "切換到今天訂單" : "切換到明天訂單"
    }
  });

  quickItems.push({
    type: "action",
    action: {
      type: "postback",
      label: "❌ 取消",
      data: "cmd=W_CANCEL",
      displayText: "❌ 取消"
    }
  });

  text += `\n━━━━━━━━━━━━━━\n💡 找不到可直接在輸入框打「店名關鍵字」搜尋！`;

  return {
    type: "text",
    text: text,
    quickReply: { items: quickItems.slice(0, 13) }
  };
}

/**
 * 建立「選擇店家」訊息（供設定公休使用）
 */
function buildWizardCustomerPickerMessage(ss, lineUser, pageIdx, filterQuery) {
  const allCusts = getLineCustomersIndex(ss);
  if (allCusts.length === 0) {
    return "⚠️ 系統中目前尚無客戶資料表。";
  }

  let customers = allCusts.filter(c => c.id && c.name && !c.isArchived);

  if (filterQuery) {
    const q = String(filterQuery).trim().toLowerCase();
    customers = customers.filter(c => c.name.toLowerCase().includes(q));
  }

  const pageSize = 9;
  const totalPages = Math.max(1, Math.ceil(customers.length / pageSize));
  const page = Math.max(0, Math.min(Number(pageIdx) || 0, totalPages - 1));
  const slice = customers.slice(page * pageSize, (page + 1) * pageSize);

  const cache = CacheService.getScriptCache();
  cache.put("LINE_WIZARD_" + lineUser.lineUserId, JSON.stringify({
    mode: 'SEARCH_CUST',
    op: 'H'
  }), 180);

  if (slice.length === 0) {
    return {
      type: "text",
      text: `⚪ 找不到符合「${filterQuery}」的店家。\n請重新輸入店名關鍵字，或點選取消。`,
      quickReply: {
        items: [
          { type: "action", action: { type: "postback", label: "📋 顯示全部店家", data: "cmd=W_START&op=H&p=0", displayText: "顯示全部店家" } },
          { type: "action", action: { type: "postback", label: "❌ 取消", data: "cmd=W_CANCEL", displayText: "❌ 取消" } }
        ]
      }
    };
  }

  const quickItems = slice.map(c => ({
    type: "action",
    action: {
      type: "postback",
      label: `🏪 ${c.name}`.substring(0, 20),
      data: `cmd=W_PC&cid=${encodeURIComponent(c.id)}`,
      displayText: `選擇店家：${c.name}`
    }
  }));

  if (page + 1 < totalPages) {
    quickItems.push({
      type: "action",
      action: {
        type: "postback",
        label: `➡️ 下一頁 (${page + 2}/${totalPages})`,
        data: `cmd=W_START&op=H&p=${page + 1}`,
        displayText: "下一頁店家"
      }
    });
  }
  quickItems.push({
    type: "action",
    action: { type: "postback", label: "❌ 取消", data: "cmd=W_CANCEL", displayText: "❌ 取消" }
  });

  const listStr = slice.map((c, i) => `${page * pageSize + i + 1}. ${c.name}`).join('\n');
  return {
    type: "text",
    text: `🏖️【設定店家公休】請點選目標店家（第 ${page + 1}/${totalPages} 頁）：\n━━━━━━━━━━━━━━\n${listStr}\n━━━━━━━━━━━━━━\n💡 也可直接打字輸入「店名關鍵字」快速篩選`,
    quickReply: { items: quickItems.slice(0, 13) }
  };
}

/**
 * 處理精靈模式下使用者直接輸入的文字（搜店名 / 輸入數量 / 輸入備註 / 輸入公休日）
 */
function handleLineWizardTextInput(text, userId) {
  const cache = CacheService.getScriptCache();
  const raw = cache.get("LINE_WIZARD_" + userId);
  if (!raw) return processLineCommandOrQuery(text, userId);

  const lineUser = getUserByLineId(userId);
  if (!lineUser || !lineUser.isActive) {
    cache.remove("LINE_WIZARD_" + userId);
    return "🔒 權限驗證失敗：您的 LINE 尚未綁定有效系統帳號。";
  }

  let state = null;
  try { state = JSON.parse(raw); } catch (e) {}
  if (!state || !state.mode) {
    cache.remove("LINE_WIZARD_" + userId);
    return processLineCommandOrQuery(text, userId);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone() || "Asia/Taipei";
  const todayStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");

  // 1. 搜尋訂單關鍵字
  if (state.mode === 'SEARCH_ORDER') {
    return buildWizardOrderPickerMessage(ss, lineUser, state.op, state.day || 'T', 0, text);
  }

  // 2. 搜尋店家關鍵字
  if (state.mode === 'SEARCH_CUST') {
    return buildWizardCustomerPickerMessage(ss, lineUser, 0, text);
  }

  // 3. 輸入修改數量 (支援 30, +5, -5, 30斤)
  if (state.mode === 'INPUT_QTY') {
    const qtyMatch = text.match(/^([+\-]?\d+(?:\.\d+)?)\s*(斤|包|箱|顆|袋|份|條|塊|罐|瓶|盒)?$/);
    if (qtyMatch) {
      const rawNum = qtyMatch[1];
      const mode = (rawNum.startsWith('+') || rawNum.startsWith('-')) ? 'ADD' : 'SET';
      const qty = Number(rawNum);
      cache.remove("LINE_WIZARD_" + userId);
      return prepareLineWriteAction({
        action: 'UPDATE_ORDER',
        customerName: state.customerName,
        targetDate: state.deliveryDate,
        forcedOrderId: state.orderId,
        items: [{ productName: state.productName, quantity: qty, unit: qtyMatch[2] || state.unit || '斤', mode }]
      }, lineUser, ss, todayStr, tz);
    }
    // 若使用者輸入的不是數字，清除精靈改交給一般智慧解析
    cache.remove("LINE_WIZARD_" + userId);
    return processLineCommandOrQuery(text, userId);
  }

  // 4. 輸入新備註
  if (state.mode === 'INPUT_NOTE') {
    const noteVal = (text === '清空' || text === '無') ? '' : text;
    cache.remove("LINE_WIZARD_" + userId);
    return prepareLineWriteAction({
      action: 'UPDATE_ORDER',
      customerName: state.customerName,
      targetDate: state.deliveryDate,
      forcedOrderId: state.orderId,
      items: [],
      note: noteVal
    }, lineUser, ss, todayStr, tz);
  }

  // 5. 輸入特定公休日期或星期 (支援「5/25」、「取消 5/25」、「週三」)
  if (state.mode === 'INPUT_HOLIDAY_DATE') {
    const isRemove = /^(?:取消|移除|刪除)/.test(text);
    const cleaned = text.replace(/^(?:取消|移除|刪除|設定|新增)\s*/, '').trim();
    const tokens = cleaned.split(/[\s,、，]+/).filter(Boolean);
    const dates = [];
    const wds = [];
    tokens.forEach(tok => {
      const d = parseRelativeOrCalendarDate(tok, todayStr, tz);
      if (d) dates.push(d);
      const wd = parseChineseWeekdayNumber(tok);
      if (wd !== null) wds.push(wd);
    });
    if (dates.length > 0 || wds.length > 0) {
      cache.remove("LINE_WIZARD_" + userId);
      return prepareLineWriteAction({
        action: 'SET_HOLIDAY',
        customerName: state.customerName,
        holidayAction: isRemove ? 'REMOVE' : 'ADD',
        holidayDates: dates,
        offDays: wds
      }, lineUser, ss, todayStr, tz);
    }
  }

  cache.remove("LINE_WIZARD_" + userId);
  return processLineCommandOrQuery(text, userId);
}

/**
 * 處理 LINE 按鈕 Postback 事件
 */
function handleLinePostbackEvent(event, channelToken) {
  const userId = event.source ? event.source.userId : '';
  const replyToken = event.replyToken;
  const params = parseLinePostbackData(event.postback ? event.postback.data : '');
  const cmd = String(params.cmd || '').trim();
  const cache = CacheService.getScriptCache();

  const lineUser = getUserByLineId(userId);

  // 免費免登入即可喚醒主面板查看綁定狀態與按鈕
  if (cmd === 'SHOW_MENU') {
    cache.remove("LINE_WIZARD_" + userId);
    cache.remove("LINE_PENDING_" + userId);
    cache.remove("LINE_PICK_" + userId);
    sendLineReply(replyToken, channelToken, buildLineControlMenuMessage(lineUser));
    return;
  }

  if (cmd === 'W_CANCEL') {
    cache.remove("LINE_WIZARD_" + userId);
    cache.remove("LINE_PENDING_" + userId);
    cache.remove("LINE_PICK_" + userId);
    sendLineReply(replyToken, channelToken, "❌ 已取消本次操作，您可點選下方按鈕進行其他操作。");
    return;
  }

  if (!lineUser) {
    sendLineReply(replyToken, channelToken, "🔒 權限驗證失敗：您的 LINE 尚未綁定系統工號。\n請先輸入「#綁定 您的工號」完成綁定（例如：#綁定 staff3）。");
    return;
  }
  if (!lineUser.isActive) {
    sendLineReply(replyToken, channelToken, `🔒 帳號【${lineUser.name}】目前已停用，無法執行此操作。`);
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone() || "Asia/Taipei";
  const todayStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  const role = String(lineUser.role || 'staff').trim().toLowerCase();

  // 0. 今日訂單一覽
  if (cmd === 'W_TODAY') {
    const orders = getGroupedActiveOrdersForDate(ss, todayStr, lineUser, '');
    if (orders.length === 0) {
      sendLineReply(replyToken, channelToken, `📋 今日 (${todayStr.substring(5)}) 目前尚無有效訂單。`);
      return;
    }
    const summary = orders.slice(0, 15).map((o, i) => {
      const itemsStr = o.items.map(it => `${it.productName}×${it.quantity}${it.unit}`).join('、');
      return `${i + 1}. 【${o.customerName}】${o.trip ? `(${o.trip}) ` : ''}[${getOrderStatusChineseLabel(o.status)}]\n   ${itemsStr}`;
    }).join('\n');
    const extra = orders.length > 15 ? `\n...尚有 ${orders.length - 15} 筆，請點擊按鈕分頁檢視。` : '';
    sendLineReply(replyToken, channelToken, `📋【今日訂單總覽】${todayStr}\n共 ${orders.length} 筆\n━━━━━━━━━━━━━━\n${summary}${extra}`);
    return;
  }

  // 0-B. 按鈕引導精靈起始 (W_START)
  if (cmd === 'W_START') {
    const op = String(params.op || 'S').trim();
    if (op === 'U' && !hasPermission(role, 'canEditOrderContent')) {
      sendLineReply(replyToken, channelToken, `🔒 權限不足：您的職位（${role}）無權修改訂單內容。`);
      return;
    }
    if (op === 'D' && !hasPermission(role, 'canDeleteOrders')) {
      sendLineReply(replyToken, channelToken, `🔒 權限不足：刪除訂單僅限最高管理員（admin）執行。`);
      return;
    }
    if (op === 'H' && role !== 'admin' && role !== 'manager') {
      sendLineReply(replyToken, channelToken, `🔒 權限不足：設定店家公休僅限管理員／領班執行。`);
      return;
    }
    if (op === 'H') {
      sendLineReply(replyToken, channelToken, buildWizardCustomerPickerMessage(ss, lineUser, Number(params.p) || 0, params.q || ''));
    } else {
      sendLineReply(replyToken, channelToken, buildWizardOrderPickerMessage(ss, lineUser, op, params.day || 'T', Number(params.p) || 0, params.q || ''));
    }
    return;
  }

  // 0-C. 精靈：已選定某張訂單 (W_PO)
  if (cmd === 'W_PO') {
    const op = String(params.op || 'S').trim();
    const orderId = String(params.oid || '').trim();
    const rows = findOrderRowsByIdFast(ss, orderId);
    if (rows.length === 0) {
      sendLineReply(replyToken, channelToken, `⚪ 找不到該筆訂單（編號：${orderId}），可能已被刪除。`);
      return;
    }
    const first = rows[0];

    // 刪單直接進確認卡片（傳入預載 rows，免重複讀表）
    if (op === 'D') {
      const stageReply = prepareLineWriteAction({
        action: 'DELETE_ORDER',
        customerName: first.customerName,
        targetDate: first.deliveryDate,
        forcedOrderId: orderId
      }, lineUser, ss, todayStr, tz, { orders: rows });
      sendLineReply(replyToken, channelToken, stageReply);
      return;
    }

    // 改狀態：顯示 5 顆狀態按鈕
    if (op === 'S') {
      const itemsStr = rows.map(r => `• ${r.productName} × ${r.quantity} ${r.unit || '斤'}`).join('\n');
      const statusMsg = {
        type: "text",
        text: `📊【更改訂單狀態】\n🏪 客戶：${first.customerName}\n📅 日期：${first.deliveryDate}\n📌 目前狀態：${getOrderStatusChineseLabel(first.status)}\n📦 品項：\n${itemsStr}\n━━━━━━━━━━━━━━\n請點選要變更的新狀態：`,
        quickReply: {
          items: [
            { type: "action", action: { type: "postback", label: "🚚 已送達 / 已出貨", data: `cmd=W_SS&oid=${encodeURIComponent(orderId)}&st=SHIPPED`, displayText: "改為：已送達 / 已出貨" } },
            { type: "action", action: { type: "postback", label: "💰 已收款 (結清)", data: `cmd=W_SS&oid=${encodeURIComponent(orderId)}&st=PAID`, displayText: "改為：已收款" } },
            { type: "action", action: { type: "postback", label: "⏳ 待出貨", data: `cmd=W_SS&oid=${encodeURIComponent(orderId)}&st=PENDING`, displayText: "改為：待出貨" } },
            { type: "action", action: { type: "postback", label: "💵 已收款未出貨", data: `cmd=W_SS&oid=${encodeURIComponent(orderId)}&st=PAID_UNSHIPPED`, displayText: "改為：已收款未出貨" } },
            { type: "action", action: { type: "postback", label: "🚫 已取消訂單", data: `cmd=W_SS&oid=${encodeURIComponent(orderId)}&st=CANCELLED`, displayText: "改為：已取消" } },
            { type: "action", action: { type: "postback", label: "❌ 取消操作", data: "cmd=W_CANCEL", displayText: "❌ 取消" } }
          ]
        }
      };
      sendLineReply(replyToken, channelToken, statusMsg);
      return;
    }

    // 改單：顯示該訂單目前品項按鈕 + 新增品項 + 改備註
    if (op === 'U') {
      const itemsStr = rows.map((r, i) => `${i + 1}. ${r.productName} × ${r.quantity} ${r.unit || '斤'}`).join('\n');
      const quickItems = rows.slice(0, 8).map((r, i) => ({
        type: "action",
        action: {
          type: "postback",
          label: `${r.productName}(${r.quantity}${r.unit || ''})`.substring(0, 20),
          data: `cmd=W_PI&oid=${encodeURIComponent(orderId)}&idx=${i}`,
          displayText: `修改品項：${r.productName}`
        }
      }));
      quickItems.push({
        type: "action",
        action: { type: "postback", label: "➕ 新增品項", data: `cmd=W_AI&oid=${encodeURIComponent(orderId)}&p=0`, displayText: "➕ 新增品項" }
      });
      quickItems.push({
        type: "action",
        action: { type: "postback", label: "📝 修改備註", data: `cmd=W_EN&oid=${encodeURIComponent(orderId)}`, displayText: "📝 修改備註" }
      });
      quickItems.push({
        type: "action",
        action: { type: "postback", label: "❌ 取消", data: "cmd=W_CANCEL", displayText: "❌ 取消" }
      });

      sendLineReply(replyToken, channelToken, {
        type: "text",
        text: `✏️【修改訂單】${first.customerName} (${first.deliveryDate})\n📝 目前備註：${first.note || '無'}\n📦 目前品項：\n${itemsStr}\n━━━━━━━━━━━━━━\n請點選要調整的品項或功能：`,
        quickReply: { items: quickItems.slice(0, 13) }
      });
      return;
    }
    return;
  }

  // 0-D. 精靈：已點選目標狀態 (W_SS) -> 步驟 5 優化：直接寫入＋立即回覆＋附帶一鍵「復原」按鈕
  if (cmd === 'W_SS') {
    const orderId = String(params.oid || '').trim();
    const newStatus = normalizeLineOrderStatus(params.st) || String(params.st || '').trim().toUpperCase();
    const rows = findOrderRowsByIdFast(ss, orderId);
    if (rows.length === 0) {
      sendLineReply(replyToken, channelToken, `⚪ 找不到該筆訂單（${orderId}）。`);
      return;
    }
    const first = rows[0];
    const prevStatus = String(first.status || 'PENDING').trim().toUpperCase();
    if (!newStatus) {
      sendLineReply(replyToken, channelToken, "❓ 無法辨識目標狀態，請重新點選。");
      return;
    }

    try {
      updateOrderStatus({ id: orderId, status: newStatus, force: true }, lineUser);
      updateGlobalTimestamp();
      SpreadsheetApp.flush();

      const undoLabel = `↩️ 復原(${getOrderStatusChineseLabel(prevStatus)})`.substring(0, 20);
      sendLineReply(replyToken, channelToken, {
        type: "text",
        text: `✅ 訂單狀態已更新！\n━━━━━━━━━━━━━━\n🏪 客戶：${first.customerName}\n📅 日期：${first.deliveryDate}\n📊 狀態：${getOrderStatusChineseLabel(prevStatus)} ➡️【${getOrderStatusChineseLabel(newStatus)}】\n👤 操作同仁：${lineUser.name}`,
        quickReply: {
          items: [
            {
              type: "action",
              action: {
                type: "postback",
                label: undoLabel,
                data: `cmd=W_UNDO_ST&oid=${encodeURIComponent(orderId)}&st=${encodeURIComponent(prevStatus)}`,
                displayText: `↩️ 復原為：${getOrderStatusChineseLabel(prevStatus)}`
              }
            },
            {
              type: "action",
              action: {
                type: "postback",
                label: "🎛️ 返回控制面板",
                data: "cmd=SHOW_MENU",
                displayText: "開啟控制主選單"
              }
            }
          ]
        }
      });

      notifyFirebase();
      writeSystemLog(
        "LINE_UPDATE_STATUS",
        `${first.customerName} (${orderId})`,
        JSON.stringify({ operator: lineUser.name, role: role, prevStatus: prevStatus, newStatus: newStatus })
      );
    } catch (err) {
      const msg = err.message || String(err);
      if (msg.includes("FORBIDDEN_ACTION")) {
        sendLineReply(replyToken, channelToken, "🔒 權限不足：您無權變更非指派給您的訂單狀態。");
      } else {
        sendLineReply(replyToken, channelToken, "❌ 狀態更新失敗：" + msg);
      }
    }
    return;
  }

  // 0-D2. 精靈：一鍵復原訂單狀態 (W_UNDO_ST)
  if (cmd === 'W_UNDO_ST') {
    const orderId = String(params.oid || '').trim();
    const restoreStatus = normalizeLineOrderStatus(params.st) || String(params.st || '').trim().toUpperCase();
    const rows = findOrderRowsByIdFast(ss, orderId);
    const custLabel = rows.length > 0 ? rows[0].customerName : orderId;
    if (!orderId || !restoreStatus) {
      sendLineReply(replyToken, channelToken, "❌ 復原參數無效，無法執行復原。");
      return;
    }
    try {
      updateOrderStatus({ id: orderId, status: restoreStatus, force: true }, lineUser);
      updateGlobalTimestamp();
      SpreadsheetApp.flush();

      sendLineReply(replyToken, channelToken, {
        type: "text",
        text: `↩️ 已復原訂單狀態！\n━━━━━━━━━━━━━━\n🏪 客戶：${custLabel}\n📊 恢復為：【${getOrderStatusChineseLabel(restoreStatus)}】\n👤 操作同仁：${lineUser.name}`,
        quickReply: {
          items: [
            {
              type: "action",
              action: { type: "postback", label: "🎛️ 返回控制面板", data: "cmd=SHOW_MENU", displayText: "開啟控制主選單" }
            }
          ]
        }
      });

      notifyFirebase();
      writeSystemLog(
        "LINE_UNDO_STATUS",
        `${custLabel} (${orderId})`,
        JSON.stringify({ operator: lineUser.name, role: role, restoredStatus: restoreStatus })
      );
    } catch (err) {
      sendLineReply(replyToken, channelToken, "❌ 復原失敗：" + (err.message || String(err)));
    }
    return;
  }

  // 0-E. 精靈：已選品項 (W_PI) 或已選目錄新品項 (W_AP) -> 顯示常用數量按鈕＋支援輸入數字
  if (cmd === 'W_PI' || cmd === 'W_AP') {
    const orderId = String(params.oid || '').trim();
    const rows = findOrderRowsByIdFast(ss, orderId);
    if (rows.length === 0) {
      sendLineReply(replyToken, channelToken, `⚪ 找不到該筆訂單（${orderId}）。`);
      return;
    }
    const first = rows[0];
    let prodName = '';
    let prodUnit = '斤';
    let currentQty = 0;

    if (cmd === 'W_PI') {
      const idx = Number(params.idx) || 0;
      const picked = rows[idx];
      if (!picked) {
        sendLineReply(replyToken, channelToken, "❌ 找不到該品項，請重新選擇。");
        return;
      }
      prodName = picked.productName;
      prodUnit = picked.unit || '斤';
      currentQty = Number(picked.quantity) || 0;
    } else {
      const prods = getLineProductsIndex(ss);
      const idx = Number(params.pidx) || 0;
      const pObj = prods[idx];
      if (!pObj) {
        sendLineReply(replyToken, channelToken, "❌ 找不到該商品，請重新選擇。");
        return;
      }
      prodName = pObj.name;
      prodUnit = pObj.unit || '斤';
      const existing = rows.find(r => r.productName === prodName);
      currentQty = existing ? (Number(existing.quantity) || 0) : 0;
    }

    cache.put("LINE_WIZARD_" + userId, JSON.stringify({
      mode: 'INPUT_QTY',
      orderId: orderId,
      customerName: first.customerName,
      deliveryDate: first.deliveryDate,
      productName: prodName,
      unit: prodUnit,
      currentQty: currentQty
    }), 180);

    const qtyItems = [
      { type: "action", action: { type: "postback", label: `+5 ${prodUnit}`, data: "cmd=W_SQ&m=A&v=5", displayText: `+5 ${prodUnit}` } },
      { type: "action", action: { type: "postback", label: `+10 ${prodUnit}`, data: "cmd=W_SQ&m=A&v=10", displayText: `+10 ${prodUnit}` } },
      { type: "action", action: { type: "postback", label: `-5 ${prodUnit}`, data: "cmd=W_SQ&m=A&v=-5", displayText: `-5 ${prodUnit}` } },
      { type: "action", action: { type: "postback", label: `改為 10 ${prodUnit}`, data: "cmd=W_SQ&m=S&v=10", displayText: `改為 10 ${prodUnit}` } },
      { type: "action", action: { type: "postback", label: `改為 15 ${prodUnit}`, data: "cmd=W_SQ&m=S&v=15", displayText: `改為 15 ${prodUnit}` } },
      { type: "action", action: { type: "postback", label: `改為 20 ${prodUnit}`, data: "cmd=W_SQ&m=S&v=20", displayText: `改為 20 ${prodUnit}` } },
      { type: "action", action: { type: "postback", label: `改為 25 ${prodUnit}`, data: "cmd=W_SQ&m=S&v=25", displayText: `改為 25 ${prodUnit}` } },
      { type: "action", action: { type: "postback", label: `改為 30 ${prodUnit}`, data: "cmd=W_SQ&m=S&v=30", displayText: `改為 30 ${prodUnit}` } },
      { type: "action", action: { type: "postback", label: `改為 40 ${prodUnit}`, data: "cmd=W_SQ&m=S&v=40", displayText: `改為 40 ${prodUnit}` } },
      { type: "action", action: { type: "postback", label: `改為 50 ${prodUnit}`, data: "cmd=W_SQ&m=S&v=50", displayText: `改為 50 ${prodUnit}` } }
    ];
    if (currentQty > 0) {
      qtyItems.push({ type: "action", action: { type: "postback", label: "🗑️ 刪除該品項", data: "cmd=W_SQ&m=S&v=0", displayText: "移除此品項" } });
    }
    qtyItems.push({ type: "action", action: { type: "postback", label: "❌ 取消", data: "cmd=W_CANCEL", displayText: "❌ 取消" } });

    sendLineReply(replyToken, channelToken, {
      type: "text",
      text: `📦【調整品項數量】\n🏪 客戶：${first.customerName}\n🍜 品項：${prodName}（目前：${currentQty} ${prodUnit}）\n━━━━━━━━━━━━━━\n請直接點選下方常用按鈕，或直接打字輸入數字（例如 35 或 +8）：`,
      quickReply: { items: qtyItems.slice(0, 13) }
    });
    return;
  }

  // 0-F. 精靈：新增品項列表 (W_AI)
  if (cmd === 'W_AI') {
    const orderId = String(params.oid || '').trim();
    const prods = getLineProductsIndex(ss);
    if (prods.length === 0) {
      sendLineReply(replyToken, channelToken, "⚠️ 系統尚無商品目錄資料。");
      return;
    }
    const pageSize = 10;
    const totalPages = Math.max(1, Math.ceil(prods.length / pageSize));
    const page = Math.max(0, Math.min(Number(params.p) || 0, totalPages - 1));
    const startIdx = page * pageSize;
    const slice = prods.slice(startIdx, startIdx + pageSize);

    const quickItems = slice.map((p, i) => ({
      type: "action",
      action: {
        type: "postback",
        label: `➕ ${p.name}`.substring(0, 20),
        data: `cmd=W_AP&oid=${encodeURIComponent(orderId)}&pidx=${startIdx + i}`,
        displayText: `選擇品項：${p.name}`
      }
    }));
    if (page + 1 < totalPages) {
      quickItems.push({
        type: "action",
        action: { type: "postback", label: "➡️ 下一頁商品", data: `cmd=W_AI&oid=${encodeURIComponent(orderId)}&p=${page + 1}`, displayText: "下一頁商品" }
      });
    }
    quickItems.push({ type: "action", action: { type: "postback", label: "❌ 取消", data: "cmd=W_CANCEL", displayText: "❌ 取消" } });

    sendLineReply(replyToken, channelToken, {
      type: "text",
      text: `➕【新增訂購品項】請點選要加入的商品（第 ${page + 1}/${totalPages} 頁）：`,
      quickReply: { items: quickItems.slice(0, 13) }
    });
    return;
  }

  // 0-G. 精靈：套用數量按鈕 (W_SQ)
  if (cmd === 'W_SQ') {
    const wizRaw = cache.get("LINE_WIZARD_" + userId);
    if (!wizRaw) {
      sendLineReply(replyToken, channelToken, "⏳ 操作已逾時，請重新點選「✏️ 改單」。");
      return;
    }
    try {
      const state = JSON.parse(wizRaw);
      const mode = params.m === 'A' ? 'ADD' : 'SET';
      const val = Number(params.v);
      cache.remove("LINE_WIZARD_" + userId);
      const stageReply = prepareLineWriteAction({
        action: 'UPDATE_ORDER',
        customerName: state.customerName,
        targetDate: state.deliveryDate,
        forcedOrderId: state.orderId,
        items: [{ productName: state.productName, quantity: val, unit: state.unit || '斤', mode }]
      }, lineUser, ss, todayStr, tz);
      sendLineReply(replyToken, channelToken, stageReply);
    } catch (e) {
      sendLineReply(replyToken, channelToken, "❌ 處理數量時發生錯誤：" + (e.message || String(e)));
    }
    return;
  }

  // 0-H. 精靈：修改備註 (W_EN / W_SN)
  if (cmd === 'W_EN') {
    const orderId = String(params.oid || '').trim();
    const rows = findOrderRowsByIdFast(ss, orderId);
    if (rows.length === 0) {
      sendLineReply(replyToken, channelToken, `⚪ 找不到該筆訂單（${orderId}）。`);
      return;
    }
    const first = rows[0];
    cache.put("LINE_WIZARD_" + userId, JSON.stringify({
      mode: 'INPUT_NOTE',
      orderId: orderId,
      customerName: first.customerName,
      deliveryDate: first.deliveryDate
    }), 180);

    sendLineReply(replyToken, channelToken, {
      type: "text",
      text: `📝【修改訂單備註】${first.customerName}\n目前備註：${first.note || '無'}\n請直接打字輸入新的備註內容，或點選常用備註：`,
      quickReply: {
        items: [
          { type: "action", action: { type: "postback", label: "🗑️ 清空備註", data: `cmd=W_SN&oid=${encodeURIComponent(orderId)}&n=`, displayText: "清空備註" } },
          { type: "action", action: { type: "postback", label: "分袋包裝", data: `cmd=W_SN&oid=${encodeURIComponent(orderId)}&n=${encodeURIComponent('分袋包裝')}`, displayText: "備註：分袋包裝" } },
          { type: "action", action: { type: "postback", label: "放門口即可", data: `cmd=W_SN&oid=${encodeURIComponent(orderId)}&n=${encodeURIComponent('放門口即可')}`, displayText: "備註：放門口即可" } },
          { type: "action", action: { type: "postback", label: "改上午配送", data: `cmd=W_SN&oid=${encodeURIComponent(orderId)}&n=${encodeURIComponent('改上午配送')}`, displayText: "備註：改上午配送" } },
          { type: "action", action: { type: "postback", label: "❌ 取消", data: "cmd=W_CANCEL", displayText: "❌ 取消" } }
        ]
      }
    });
    return;
  }

  if (cmd === 'W_SN') {
    const orderId = String(params.oid || '').trim();
    const newNote = String(params.n || '');
    const rows = findOrderRowsByIdFast(ss, orderId);
    if (rows.length === 0) {
      sendLineReply(replyToken, channelToken, `⚪ 找不到該筆訂單（${orderId}）。`);
      return;
    }
    const first = rows[0];
    cache.remove("LINE_WIZARD_" + userId);
    const stageReply = prepareLineWriteAction({
      action: 'UPDATE_ORDER',
      customerName: first.customerName,
      targetDate: first.deliveryDate,
      forcedOrderId: orderId,
      items: [],
      note: newNote
    }, lineUser, ss, todayStr, tz, { orders: rows });
    sendLineReply(replyToken, channelToken, stageReply);
    return;
  }

  // 0-I. 精靈：已選公休目標店家 (W_PC) -> 顯示今日/明日/後天/週日..週六/移除公休按鈕
  if (cmd === 'W_PC') {
    const custId = String(params.cid || '').trim();
    const allCusts = getLineCustomersIndex(ss);
    const custObj = allCusts.find(c => String(c.id).trim() === custId);
    if (!custObj) {
      sendLineReply(replyToken, channelToken, "⚪ 找不到該店家資料，請重新選擇。");
      return;
    }

    cache.put("LINE_WIZARD_" + userId, JSON.stringify({
      mode: 'INPUT_HOLIDAY_DATE',
      customerId: custObj.id,
      customerName: custObj.name
    }), 180);

    const d0 = todayStr;
    const d1Obj = new Date(todayStr + 'T00:00:00'); d1Obj.setDate(d1Obj.getDate() + 1);
    const d1 = Utilities.formatDate(d1Obj, tz, "yyyy-MM-dd");
    const d2Obj = new Date(todayStr + 'T00:00:00'); d2Obj.setDate(d2Obj.getDate() + 2);
    const d2 = Utilities.formatDate(d2Obj, tz, "yyyy-MM-dd");

    const hasDate = dt => (custObj.holidayDates || []).indexOf(dt) !== -1;
    const hasWd = wd => (custObj.offDays || []).indexOf(wd) !== -1;
    const cidShort = encodeURIComponent(custObj.id);

    const quickItems = [
      {
        type: "action",
        action: {
          type: "postback",
          label: hasDate(d0) ? `取消今休(${d0.substring(5)})` : `休今天(${d0.substring(5)})`,
          data: `cmd=W_SH&cid=${cidShort}&a=${hasDate(d0) ? 'R' : 'A'}&dt=${d0}`,
          displayText: hasDate(d0) ? `取消今日公休` : `設定今日公休`
        }
      },
      {
        type: "action",
        action: {
          type: "postback",
          label: hasDate(d1) ? `取消明休(${d1.substring(5)})` : `休明天(${d1.substring(5)})`,
          data: `cmd=W_SH&cid=${cidShort}&a=${hasDate(d1) ? 'R' : 'A'}&dt=${d1}`,
          displayText: hasDate(d1) ? `取消明日公休` : `設定明日公休`
        }
      },
      {
        type: "action",
        action: {
          type: "postback",
          label: hasDate(d2) ? `取消後休(${d2.substring(5)})` : `休後天(${d2.substring(5)})`,
          data: `cmd=W_SH&cid=${cidShort}&a=${hasDate(d2) ? 'R' : 'A'}&dt=${d2}`,
          displayText: hasDate(d2) ? `取消後天公休` : `設定後天公休`
        }
      }
    ];

    const wdNames = ['日', '一', '二', '三', '四', '五', '六'];
    for (let w = 0; w <= 6; w++) {
      const isOff = hasWd(w);
      quickItems.push({
        type: "action",
        action: {
          type: "postback",
          label: isOff ? `取消週${wdNames[w]}` : `固定休週${wdNames[w]}`,
          data: `cmd=W_SH&cid=${cidShort}&a=${isOff ? 'R' : 'A'}&wd=${w}`,
          displayText: isOff ? `取消固定休週${wdNames[w]}` : `設每週${wdNames[w]}公休`
        }
      });
    }

    const upcoming = (custObj.holidayDates || []).filter(d => d >= todayStr && d !== d0 && d !== d1 && d !== d2).slice(0, 2);
    upcoming.forEach(dt => {
      quickItems.push({
        type: "action",
        action: {
          type: "postback",
          label: `取消休 ${dt.substring(5)}`,
          data: `cmd=W_SH&cid=${cidShort}&a=R&dt=${dt}`,
          displayText: `取消公休 ${dt}`
        }
      });
    });

    quickItems.push({ type: "action", action: { type: "postback", label: "❌ 取消", data: "cmd=W_CANCEL", displayText: "❌ 取消" } });

    sendLineReply(replyToken, channelToken, {
      type: "text",
      text: `🏖️【設定店家公休】${custObj.name}\n🛌 目前固定公休：${formatOffDaysToChinese(custObj.offDays)}\n📌 目前特定公休：${(custObj.holidayDates || []).filter(d => d >= todayStr).join('、') || '無'}\n━━━━━━━━━━━━━━\n請直接點選下方按鈕切換公休，或直接輸入特定日期（例如 5/25）：`,
      quickReply: { items: quickItems.slice(0, 13) }
    });
    return;
  }

  // 0-J. 精靈：已點選公休日期或星期 (W_SH) -> 進入確認
  if (cmd === 'W_SH') {
    const custId = String(params.cid || '').trim();
    const allCusts = getLineCustomersIndex(ss);
    const custObj = allCusts.find(c => String(c.id).trim() === custId);
    if (!custObj) {
      sendLineReply(replyToken, channelToken, "⚪ 找不到該店家資料，請重新選擇。");
      return;
    }
    cache.remove("LINE_WIZARD_" + userId);

    const stageReply = prepareLineWriteAction({
      action: 'SET_HOLIDAY',
      customerName: custObj.name,
      holidayAction: params.a === 'R' ? 'REMOVE' : 'ADD',
      holidayDates: params.dt ? [params.dt] : [],
      offDays: params.wd !== undefined ? [Number(params.wd)] : []
    }, lineUser, ss, todayStr, tz, { customer: custObj });
    sendLineReply(replyToken, channelToken, stageReply);
    return;
  }

  // 1. 一鍵「✅ 我已送達」回報 (司機點擊派工卡片按鈕直接寫入 SHIPPED) -> 先回覆再非關鍵寫入
  if (cmd === 'DELIVERED') {
    const orderId = String(params.orderId || '').trim();
    if (!orderId) {
      sendLineReply(replyToken, channelToken, "❌ 按鈕缺少訂單編號，請聯繫管理員確認派工通知。");
      return;
    }

    try {
      const orderRows = findOrderRowsByIdFast(ss, orderId);

      if (orderRows.length === 0) {
        sendLineReply(replyToken, channelToken, `⚪ 找不到訂單（編號：${orderId}），可能已被刪除或尚無資料。`);
        return;
      }

      const first = orderRows[0];
      const currentStatus = String(first.status || '').trim().toUpperCase();
      if (currentStatus === 'SHIPPED' || currentStatus === 'PAID') {
        sendLineReply(
          replyToken,
          channelToken,
          `ℹ️【${first.customerName}】此筆訂單目前狀態已為「${getOrderStatusChineseLabel(currentStatus)}」，無需重複回報！`
        );
        return;
      }

      // updateOrderStatus 內部自帶 RBAC 檢驗與 LINE 快取清除
      updateOrderStatus({ id: orderId, status: 'SHIPPED', force: true }, lineUser);
      updateGlobalTimestamp();
      SpreadsheetApp.flush();

      const itemsSummary = orderRows.map(o => `• ${o.productName} × ${o.quantity} ${o.unit || '斤'}`).join('\n');
      sendLineReply(
        replyToken,
        channelToken,
        `✅ 送達回報成功！\n` +
        `━━━━━━━━━━━━━━\n` +
        `🏪 配送客戶：${first.customerName}\n` +
        `📅 配送日期：${first.deliveryDate}\n` +
        `📊 最新狀態：已出貨 / 已送達\n` +
        `👤 回報同仁：${lineUser.name}\n` +
        `📦 品項明細：\n${itemsSummary}`
      );

      // 先回傳給司機再做背景同步與日誌
      notifyFirebase();
      writeSystemLog(
        "LINE_ONE_CLICK_DELIVERED",
        `${first.customerName} (${orderId})`,
        JSON.stringify({
          operator: lineUser.name,
          userId: lineUser.userId,
          role: lineUser.role,
          deliveryDate: first.deliveryDate,
          newStatus: "SHIPPED"
        })
      );
    } catch (err) {
      const msg = err.message || String(err);
      if (msg.includes("FORBIDDEN_ACTION")) {
        sendLineReply(replyToken, channelToken, "🔒 權限不足：此筆訂單目前並未指派給您，無法代為回報送達。");
      } else {
        sendLineReply(replyToken, channelToken, "❌ 送達回報失敗：" + msg);
      }
    }
    return;
  }

  // 2. 多筆同名訂單消歧選擇
  if (cmd === 'PICK_ORDER') {
    const pickRaw = cache.get("LINE_PICK_" + userId);
    if (!pickRaw) {
      sendLineReply(replyToken, channelToken, "⏳ 此選擇清單已逾時失效，請重新輸入指令。");
      return;
    }
    try {
      const pickState = JSON.parse(pickRaw);
      if (params.token && pickState.token !== params.token) {
        sendLineReply(replyToken, channelToken, "⏳ 此選擇已過期，請依最新訊息操作。");
        return;
      }
      const chosenId = String(params.orderId || '').trim();
      const matchedCandidate = (pickState.candidates || []).find(c => String(c.orderId) === chosenId);
      if (!matchedCandidate) {
        sendLineReply(replyToken, channelToken, "❌ 找不到選擇的訂單項目，請重新輸入指令。");
        return;
      }
      cache.remove("LINE_PICK_" + userId);
      const intent = Object.assign({}, pickState.intent, { forcedOrderId: chosenId });
      const stageReply = prepareLineWriteAction(intent, lineUser, ss, todayStr, tz);
      sendLineReply(replyToken, channelToken, stageReply);
    } catch (e) {
      cache.remove("LINE_PICK_" + userId);
      sendLineReply(replyToken, channelToken, "❌ 處理選擇時發生錯誤：" + (e.message || String(e)));
    }
    return;
  }

  // 3. 確認執行異動（先寫入並立即回覆，再推播 Firebase 與寫 Log）
  if (cmd === 'CONFIRM_PENDING') {
    const pendingRaw = cache.get("LINE_PENDING_" + userId);
    if (!pendingRaw) {
      sendLineReply(replyToken, channelToken, "⏳ 此確認請求已逾時或已完成處理，請重新輸入指令。");
      return;
    }
    try {
      const pending = JSON.parse(pendingRaw);
      if (params.token && pending.token !== params.token) {
        sendLineReply(replyToken, channelToken, "⏳ 您點選的是舊的確認按鈕，請依最新訊息操作或重新輸入指令。");
        return;
      }
      cache.remove("LINE_PENDING_" + userId);
      cache.remove("LINE_WIZARD_" + userId);
      const execMsg = executeLinePendingAction(pending, lineUser, { replyToken: replyToken, channelToken: channelToken });
      if (execMsg !== null && execMsg !== undefined && execMsg !== "") {
        sendLineReply(replyToken, channelToken, execMsg);
      }
    } catch (e) {
      cache.remove("LINE_PENDING_" + userId);
      sendLineReply(replyToken, channelToken, "❌ 執行異動失敗：" + (e.message || String(e)));
    }
    return;
  }

  // 4. 取消操作
  if (cmd === 'CANCEL_PENDING') {
    cache.remove("LINE_PENDING_" + userId);
    cache.remove("LINE_PICK_" + userId);
    cache.remove("LINE_WIZARD_" + userId);
    sendLineReply(replyToken, channelToken, "❌ 已取消本次操作，系統資料未變更。");
    return;
  }
}

/**
 * 雙模式智慧處理器：優先解析結構化 # 指令，再透過 Gemini AI / 規則引擎解析口語寫入與查詢
 */
function processLineCommandOrQuery(rawText, lineUserId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const timeZone = ss.getSpreadsheetTimeZone() || "Asia/Taipei";
  const now = new Date();
  const currentYear = Utilities.formatDate(now, timeZone, "yyyy");
  const todayStr = Utilities.formatDate(now, timeZone, "yyyy-MM-dd");

  const cleanText = String(rawText || '').replace(/\s+/g, ' ').trim();
  const writeActions = ['UPDATE_ORDER', 'SET_HOLIDAY', 'DELETE_ORDER', 'UPDATE_ORDER_STATUS'];

  const handleWriteIntent = function(intentObj) {
    if (!lineUserId) {
      return "🔒 權限驗證失敗：無法識別您的 LINE 帳號。";
    }
    const lineUser = getUserByLineId(lineUserId);
    if (!lineUser) {
      return "🔒 權限驗證失敗：您的 LINE 尚未綁定系統帳號。\n請先輸入「#綁定 您的工號」完成綁定（例如：#綁定 staff3）。";
    }
    if (!lineUser.isActive) {
      return `🔒 帳號【${lineUser.name}】目前已停用，無法執行系統異動操作。`;
    }
    return prepareLineWriteAction(intentObj, lineUser, ss, todayStr, timeZone);
  };

  // 1. 結構化 # 指令解析 (零 AI 延遲、<5ms)
  if (/^#(?:改單|修改訂單|狀態|改狀態|訂單狀態|公休|設定公休|刪單|刪除訂單)(?:\s|$)/i.test(cleanText)) {
    const cmdIntent = parseStructuredLineCommand(cleanText, ss, todayStr, timeZone);
    if (cmdIntent && cmdIntent.error) {
      return cmdIntent.error;
    }
    if (cmdIntent && writeActions.indexOf(cmdIntent.action) !== -1) {
      return handleWriteIntent(cmdIntent);
    }
  }

  // 2. 本地自然語言寫入規則引擎 (優先於 Gemini AI，省下 1.5~4s)
  const fallbackWrite = parseNaturalLanguageWriteFallback(cleanText, ss, todayStr, timeZone);
  if (fallbackWrite && writeActions.indexOf(fallbackWrite.action) !== -1) {
    return handleWriteIntent(fallbackWrite);
  }

  // 3. 本地查詢規則引擎 (先跑正則，命中直接回傳；未命中回傳 null 才交給 Gemini AI)
  const regexQueryReply = processLineOrderQuery(cleanText, true, true);
  if (regexQueryReply !== null) {
    return regexQueryReply;
  }

  // 4. 以上都沒命中時，才呼叫 Gemini AI 進行深度語意理解 (支援查詢 + 寫入共 12 種意圖)
  const aiIntent = parseQueryIntentWithGemini(cleanText, todayStr);
  if (aiIntent && aiIntent.action) {
    if (writeActions.indexOf(aiIntent.action) !== -1) {
      return handleWriteIntent(aiIntent);
    }
    if (aiIntent.action === 'BUSINESS_STATUS' && aiIntent.customerName) {
      return queryCustomerBusinessStatus(ss, aiIntent.customerName, todayStr, timeZone);
    }
    if (aiIntent.action === 'HOLIDAY_INFO' && aiIntent.customerName) {
      return queryCustomerHolidayInfo(ss, aiIntent.customerName, todayStr, timeZone);
    }
    if (aiIntent.action === 'DELIVERY_STATUS' && aiIntent.customerName) {
      return queryDeliveryStatusOnly(ss, aiIntent.customerName, todayStr);
    }
    if (aiIntent.action === 'CUSTOMER_PROFILE' && aiIntent.customerName) {
      return queryCustomerProfileOverview(ss, aiIntent.customerName, todayStr, timeZone);
    }
    if (aiIntent.action === 'TODAY_STATUS' && aiIntent.customerName) {
      return queryTodayOrderStatus(ss, aiIntent.customerName, todayStr);
    }
    if (aiIntent.action === 'DATE_ORDER' && aiIntent.customerName) {
      const targetDate = aiIntent.targetDate || todayStr;
      const displayDate = targetDate.substring(5);
      return queryDateOrders(ss, aiIntent.customerName, targetDate, displayDate);
    }
    if (aiIntent.action === 'MONTHLY_BILL' && aiIntent.customerName) {
      const monthNum = aiIntent.month || parseInt(todayStr.split('-')[1], 10);
      const yearStr = aiIntent.year || currentYear;
      return queryMonthlyBill(ss, aiIntent.customerName, monthNum, yearStr);
    }
    if (aiIntent.action === 'GENERATE_PDF' && aiIntent.customerName) {
      const monthNum = aiIntent.month || parseInt(todayStr.split('-')[1], 10);
      const yearStr = aiIntent.year || currentYear;
      return generateMonthlyStatementPDF(ss, aiIntent.customerName, monthNum, yearStr);
    }
  }

  return "🤖 抱歉，未能完全理解您的指令或提問。\n\n" +
         "💡 系統控制指令範例：\n" +
         "• #改單 誠石 油麵 30\n" +
         "• #狀態 誠石 已送達\n" +
         "• #公休 鵝肉亭 5/20\n" +
         "• #刪單 誠石 5/30\n\n" +
         "💡 也可直接口語詢問或下達：\n" +
         "• 「把誠石今天的油麵改成30斤」\n" +
         "• 「鵝肉亭今天有營業嗎？」\n\n" +
         "輸入「選單」可開啟按鈕控制面板，「說明」可查看完整功能。";
}

/**
 * 相容舊有呼叫與測試函式 testLineBotQuery
 */
function processLineOrderQuery(rawText, skipAi, returnNullOnMiss) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const timeZone = ss.getSpreadsheetTimeZone() || "Asia/Taipei";
  const now = new Date();
  const currentYear = Utilities.formatDate(now, timeZone, "yyyy");
  const todayStr = Utilities.formatDate(now, timeZone, "yyyy-MM-dd");

  const cleanText = String(rawText || '').replace(/\s+/g, ' ').trim();

  if (!skipAi) {
    const aiIntent = parseQueryIntentWithGemini(cleanText, todayStr);
    if (aiIntent && aiIntent.action) {
      if (aiIntent.action === 'BUSINESS_STATUS' && aiIntent.customerName) {
        return queryCustomerBusinessStatus(ss, aiIntent.customerName, todayStr, timeZone);
      }
      if (aiIntent.action === 'HOLIDAY_INFO' && aiIntent.customerName) {
        return queryCustomerHolidayInfo(ss, aiIntent.customerName, todayStr, timeZone);
      }
      if (aiIntent.action === 'DELIVERY_STATUS' && aiIntent.customerName) {
        return queryDeliveryStatusOnly(ss, aiIntent.customerName, todayStr);
      }
      if (aiIntent.action === 'CUSTOMER_PROFILE' && aiIntent.customerName) {
        return queryCustomerProfileOverview(ss, aiIntent.customerName, todayStr, timeZone);
      }
      if (aiIntent.action === 'TODAY_STATUS' && aiIntent.customerName) {
        return queryTodayOrderStatus(ss, aiIntent.customerName, todayStr);
      }
      if (aiIntent.action === 'DATE_ORDER' && aiIntent.customerName) {
        const targetDate = aiIntent.targetDate || todayStr;
        const displayDate = targetDate.substring(5);
        return queryDateOrders(ss, aiIntent.customerName, targetDate, displayDate);
      }
      if (aiIntent.action === 'MONTHLY_BILL' && aiIntent.customerName) {
        const monthNum = aiIntent.month || parseInt(todayStr.split('-')[1], 10);
        const yearStr = aiIntent.year || currentYear;
        return queryMonthlyBill(ss, aiIntent.customerName, monthNum, yearStr);
      }
      if (aiIntent.action === 'GENERATE_PDF' && aiIntent.customerName) {
        const monthNum = aiIntent.month || parseInt(todayStr.split('-')[1], 10);
        const yearStr = aiIntent.year || currentYear;
        return generateMonthlyStatementPDF(ss, aiIntent.customerName, monthNum, yearStr);
      }
    }
  }

  // ----------------------------------------------------
  // 情境 A：公休日查詢 (例如：「誠石什麼時候公休」、「大埔哪天休息」、「阿石公休日」)
  // ----------------------------------------------------
  const holidayMatch = cleanText.match(/(.+?)(?:什麼時候公休|甚麼時候公休|哪天公休|哪天休息|公休是哪天|公休日是哪天|公休哪一天|公休哪天|公休日|公休|休哪天|哪天休|休息日)/);
  if (holidayMatch) {
    const custName = holidayMatch[1].replace(/^(?:幫我|請幫我|查|查詢|看)\s*/, '').trim();
    if (custName) {
      return queryCustomerHolidayInfo(ss, custName, todayStr, timeZone);
    }
  }

  // ----------------------------------------------------
  // 情境 B：今天有無營業 / 開門查詢 (例如：「誠石今天有營業嗎」、「大埔今天有開嗎」、「阿石今天休息嗎」)
  // ----------------------------------------------------
  const businessMatch = cleanText.match(/(.+?)(?:今天有營業嗎|今天有開嗎|今天有開門嗎|今天營業嗎|今天開嗎|今天有休息嗎|今天休息嗎|今天公休嗎|今天有公休嗎|有營業嗎|有開嗎|有開門嗎|休假嗎)/);
  if (businessMatch) {
    const custName = businessMatch[1].replace(/^(?:幫我|請幫我|查|查詢|看|今天|今日)\s*/, '').trim();
    if (custName) {
      return queryCustomerBusinessStatus(ss, custName, todayStr, timeZone);
    }
  }

  // ----------------------------------------------------
  // 情境 C：配送進度專屬查詢 (例如：「誠石今天有去嗎」、「送到了沒」、「去了沒」)
  // ----------------------------------------------------
  const deliveryProgressMatch = cleanText.match(/(.+?)(?:今天有去嗎|今天去了嗎|今天有送嗎|今天送了嗎|去了嗎|送了嗎|到了嗎|去了沒|送了沒|到了沒|有去嗎|有送嗎|送到了嗎)/);
  if (deliveryProgressMatch) {
    const custName = deliveryProgressMatch[1].replace(/^(?:今天|今日|幫我|請幫我|查|查詢)/, '').trim();
    if (custName) {
      return queryDeliveryStatusOnly(ss, custName, todayStr);
    }
  }

  // ----------------------------------------------------
  // 情境 4：產生/下載 PDF 報表
  // ----------------------------------------------------
  const pdfMatch = cleanText.match(/(?:印|產出|產生|下載|匯出)?\s*(.+?)\s*(\d{1,2})月\s*(?:報表|對帳單|PDF|pdf)/i);
  if (pdfMatch) {
    const custName = pdfMatch[1].replace(/^(?:幫我|請幫我|查|查詢)/, '').trim();
    const monthNum = parseInt(pdfMatch[2], 10);
    return generateMonthlyStatementPDF(ss, custName, monthNum, currentYear);
  }

  // ----------------------------------------------------
  // 情境 3：查詢月份貨款 / 帳單
  // ----------------------------------------------------
  const monthlyBillMatch = cleanText.match(/(?:查|查詢|看|算)?\s*(.+?)\s*(\d{1,2})月(?:份)?\s*(?:的)?(?:貨款|帳單|帳款|金額|總額|總計|是多少)/);
  if (monthlyBillMatch) {
    const custName = monthlyBillMatch[1].replace(/^(?:幫我|請幫我)/, '').trim();
    const monthNum = parseInt(monthlyBillMatch[2], 10);
    return queryMonthlyBill(ss, custName, monthNum, currentYear);
  }

  // ----------------------------------------------------
  // 情境 2：查詢指定日期訂單
  // ----------------------------------------------------
  const dateMatch = cleanText.match(/(.+?)\s*(\d{1,2})[\/\-\.](\d{1,2})(?:號|日)?(?:\s*(?:訂單|叫貨|貨|訂了多少|訂了什麼|有訂嗎))?/);
  if (dateMatch) {
    const custName = dateMatch[1].replace(/^(?:查|查詢|幫我|請幫我)/, '').trim();
    const monthStr = String(dateMatch[2]).padStart(2, '0');
    const dayStr = String(dateMatch[3]).padStart(2, '0');
    const targetDate = `${currentYear}-${monthStr}-${dayStr}`;
    return queryDateOrders(ss, custName, targetDate, `${monthStr}/${dayStr}`);
  }

  // ----------------------------------------------------
  // 情境 1：今日訂單明細與叫貨狀態
  // ----------------------------------------------------
  const todayOrderMatch = cleanText.match(/(.+?)(?:有叫麵|有叫貨|有訂貨|有叫嗎|有訂嗎|有訂貨嗎|有叫麵嗎|訂了沒|叫了沒|叫麵了嗎|叫貨了嗎|訂貨了嗎|今天有叫|今天有訂)/);
  if (todayOrderMatch) {
    let rawCust = (todayOrderMatch[1] || '').trim();
    const custName = rawCust
      .replace(/^(?:今天|今日|幫我|請幫我|查|查詢)/, '')
      .trim();
    if (custName) {
      return queryTodayOrderStatus(ss, custName, todayStr);
    }
  }

  // ----------------------------------------------------
  // 純店家名稱查詢：先檢查是否真的吻合某間店家（避免把自然語言整句當店名攔截，讓 Gemini 有機會處理）
  // ----------------------------------------------------
  if (cleanText.length >= 2 && cleanText.length <= 15 && !cleanText.includes("說明") && !cleanText.includes("http")) {
    const custName = cleanText.replace(/^(?:查|查詢|看)\s*/, '').trim();
    const custLower = custName.toLowerCase();
    const allCusts = getLineCustomersIndex(ss);
    const hasCustMatch = allCusts.some(c => {
      const n = String(c.name || '').toLowerCase();
      return n && (n === custLower || n.includes(custLower) || custLower.includes(n));
    });
    if (hasCustMatch || !returnNullOnMiss) {
      return queryCustomerProfileOverview(ss, custName, todayStr, timeZone);
    }
  }

  if (returnNullOnMiss) {
    return null;
  }

  return "🤖 抱歉，未能完全理解您的指令或提問。\n\n" +
         "💡 系統控制指令範例：\n" +
         "• #改單 誠石 油麵 30\n" +
         "• #狀態 誠石 已送達\n" +
         "• #公休 鵝肉亭 5/20\n" +
         "• #刪單 誠石 5/30\n\n" +
         "💡 也可直接口語詢問或下達：\n" +
         "• 「把誠石今天的油麵改成30斤」\n" +
         "• 「鵝肉亭今天有營業嗎？」\n\n" +
         "輸入「說明」可查看完整功能與範例。";
}

/**
 * 輔助：從 Customers 輕量快取索引中以最長前綴比對出顧客與剩餘參數字串
 */
function extractCustomerFromCommandArgs(ss, argsStr) {
  const cleanArgs = String(argsStr || '').trim();
  const allCusts = getLineCustomersIndex(ss);
  if (allCusts.length > 0) {
    const names = allCusts
      .map(c => String(c.name || '').trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    for (let i = 0; i < names.length; i++) {
      const fullName = names[i];
      if (cleanArgs.toLowerCase().startsWith(fullName.toLowerCase())) {
        const rest = cleanArgs.substring(fullName.length).trim();
        if (rest === '' || /^[\s,;，、]/.test(cleanArgs.substring(fullName.length))) {
          return { customerName: fullName, restArgs: rest };
        }
      }
    }
  }
  const firstSpace = cleanArgs.search(/\s+/);
  if (firstSpace === -1) {
    return { customerName: cleanArgs, restArgs: '' };
  }
  return {
    customerName: cleanArgs.substring(0, firstSpace).trim(),
    restArgs: cleanArgs.substring(firstSpace).trim()
  };
}

/**
 * 解析結構化 # 指令 (#改單 / #狀態 / #公休 / #刪單)
 */
function parseStructuredLineCommand(cleanText, ss, todayStr, timeZone) {
  const m = cleanText.match(/^(#\S+)(?:\s+(.*))?$/);
  if (!m) return null;
  const cmdWord = m[1].toLowerCase();
  const body = String(m[2] || '').trim();

  // 1. #刪單 / #刪除訂單
  if (cmdWord === '#刪單' || cmdWord === '#刪除訂單') {
    if (!body) {
      return { error: "❓ 格式提示：請輸入店家名稱\n範例：\n• #刪單 誠石\n• #刪單 誠石 5/30" };
    }
    const { customerName, restArgs } = extractCustomerFromCommandArgs(ss, body);
    let targetDate = todayStr;
    if (restArgs) {
      const tokens = restArgs.split(/\s+/).filter(Boolean);
      for (let i = 0; i < tokens.length; i++) {
        const parsedDate = parseRelativeOrCalendarDate(tokens[i], todayStr, timeZone);
        if (parsedDate) {
          targetDate = parsedDate;
          break;
        }
      }
    }
    return { action: 'DELETE_ORDER', customerName, targetDate };
  }

  // 2. #狀態 / #改狀態 / #訂單狀態
  if (cmdWord === '#狀態' || cmdWord === '#改狀態' || cmdWord === '#訂單狀態') {
    if (!body) {
      return { error: "❓ 格式提示：請提供店家名稱與目標狀態\n範例：\n• #狀態 誠石 已送達\n• #狀態 誠石 5/30 已收款\n可用狀態：待出貨、已送達(已出貨)、已收款、已收款未出貨、已取消" };
    }
    const { customerName, restArgs } = extractCustomerFromCommandArgs(ss, body);
    const tokens = restArgs.split(/\s+/).filter(Boolean);
    let targetDate = todayStr;
    let status = null;

    tokens.forEach(tok => {
      const d = parseRelativeOrCalendarDate(tok, todayStr, timeZone);
      if (d) {
        targetDate = d;
        return;
      }
      const st = normalizeLineOrderStatus(tok);
      if (st) {
        status = st;
      }
    });

    if (!customerName || !status) {
      return { error: "❓ 無法辨識目標狀態。\n範例：\n• #狀態 誠石 已送達\n• #狀態 誠石 5/30 已收款\n支援狀態：待出貨、已送達、已出貨、已收款、已收款未出貨、已取消" };
    }
    return { action: 'UPDATE_ORDER_STATUS', customerName, targetDate, status };
  }

  // 3. #公休 / #設定公休
  if (cmdWord === '#公休' || cmdWord === '#設定公休') {
    if (!body) {
      return { error: "❓ 格式提示：請提供店家名稱與公休日期或星期\n範例：\n• #公休 鵝肉亭 5/20\n• #公休 鵝肉亭 週日\n• #公休 鵝肉亭 取消 5/20" };
    }
    const { customerName, restArgs } = extractCustomerFromCommandArgs(ss, body);
    if (!restArgs) {
      return { error: "❓ 請填寫要設定或取消的公休日期或星期（例如：#公休 鵝肉亭 5/20 或 週日）" };
    }
    const tokens = restArgs.split(/[\s,、，]+/).filter(Boolean);
    let holidayAction = 'ADD';
    const holidayDates = [];
    const offDays = [];

    tokens.forEach(tok => {
      if (/^(?:取消|移除|刪除|解除|delete|remove|off)$/i.test(tok)) {
        holidayAction = 'REMOVE';
        return;
      }
      if (/^(?:新增|設定|加上|add)$/i.test(tok)) {
        holidayAction = 'ADD';
        return;
      }
      const d = parseRelativeOrCalendarDate(tok, todayStr, timeZone);
      if (d) {
        holidayDates.push(d);
        return;
      }
      const wd = parseChineseWeekdayNumber(tok);
      if (wd !== null) {
        offDays.push(wd);
      }
    });

    if (holidayDates.length === 0 && offDays.length === 0) {
      return { error: "❓ 找不到可辨識的公休日期或星期。\n範例：\n• #公休 鵝肉亭 5/20\n• #公休 鵝肉亭 週日\n• #公休 鵝肉亭 取消 5/20" };
    }
    return { action: 'SET_HOLIDAY', customerName, holidayAction, holidayDates, offDays };
  }

  // 4. #改單 / #修改訂單
  if (cmdWord === '#改單' || cmdWord === '#修改訂單') {
    if (!body) {
      return { error: "❓ 格式提示：請提供店家名稱與品項數量\n範例：\n• #改單 誠石 油麵 30\n• #改單 誠石 5/30 油麵 30斤 陽春麵 10斤\n• #改單 誠石 +油麵 5（原有數量加 5）\n• #改單 誠石 備註:早上送" };
    }
    const { customerName, restArgs } = extractCustomerFromCommandArgs(ss, body);
    if (!restArgs) {
      return { error: "❓ 請填寫要修改的品項數量或備註（例如：#改單 誠石 油麵 30）" };
    }

    let working = restArgs;
    let note = undefined;
    const noteMatch = working.match(/(?:備註[:：\s]+)([^\s].*)$/);
    if (noteMatch) {
      note = noteMatch[1].trim();
      working = working.substring(0, noteMatch.index).trim();
    }

    const tokens = working.split(/\s+/).filter(Boolean);
    let targetDate = todayStr;
    const leftoverTokens = [];
    let dateAssigned = false;

    tokens.forEach(tok => {
      if (!dateAssigned) {
        const d = parseRelativeOrCalendarDate(tok, todayStr, timeZone);
        if (d) {
          targetDate = d;
          dateAssigned = true;
          return;
        }
      }
      leftoverTokens.push(tok);
    });

    const items = [];
    let idx = 0;
    while (idx < leftoverTokens.length) {
      let tok = leftoverTokens[idx];
      // Case A: 連寫形式 e.g. 油麵30斤, +油麵5, 油麵×30, 油麵*30
      const inlineMatch = tok.match(/^([+\-]?)([^\d+\-×*]+?)(?:[×*]\s*)?([+\-]?\d+(?:\.\d+)?)(斤|包|箱|顆|袋|份|條|塊|罐|瓶|盒)?$/);
      if (inlineMatch) {
        const prefixSign = inlineMatch[1];
        const prod = inlineMatch[2].trim();
        const numStr = inlineMatch[3];
        const unit = inlineMatch[4] || '';
        const mode = (prefixSign === '+' || prefixSign === '-' || /^[+\-]/.test(numStr)) ? 'ADD' : 'SET';
        const val = (prefixSign === '-' && !numStr.startsWith('-')) ? -Number(numStr) : Number(numStr);
        items.push({ productName: prod, quantity: val, unit: unit || undefined, mode });
        idx += 1;
        continue;
      }

      // Case B: 空白分隔形式 e.g. 油麵 30 / +油麵 5斤 / 油麵 -5
      if (idx + 1 < leftoverTokens.length) {
        const nextTok = leftoverTokens[idx + 1];
        const qtyMatch = nextTok.match(/^([+\-]?\d+(?:\.\d+)?)(斤|包|箱|顆|袋|份|條|塊|罐|瓶|盒)?$/);
        if (qtyMatch) {
          const prefixSign = tok.startsWith('+') ? '+' : (tok.startsWith('-') ? '-' : '');
          const prod = prefixSign ? tok.substring(1).trim() : tok.trim();
          const numStr = qtyMatch[1];
          const unit = qtyMatch[2] || '';
          const mode = (prefixSign || numStr.startsWith('+') || numStr.startsWith('-')) ? 'ADD' : 'SET';
          const val = (prefixSign === '-' && !numStr.startsWith('-')) ? -Number(numStr) : Number(numStr);
          items.push({ productName: prod, quantity: val, unit: unit || undefined, mode });
          idx += 2;
          continue;
        }
      }

      idx += 1;
    }

    if (items.length === 0 && note === undefined) {
      return { error: "❓ 無法解析欲修改的品項數量。\n範例：\n• #改單 誠石 油麵 30\n• #改單 誠石 5/30 +油麵 5\n• #改單 誠石 備註:分兩袋" };
    }
    return { action: 'UPDATE_ORDER', customerName, targetDate, items, note };
  }

  return null;
}

/**
 * 規則引擎保底：無 Gemini Key 時亦可支援常見口語寫入指令
 */
function parseNaturalLanguageWriteFallback(cleanText, ss, todayStr, timeZone) {
  // 1. 口語刪除訂單
  const delMatch = cleanText.match(/^(?:幫我|請幫我|請)?(?:刪除|刪掉|移除)(.+?)(今天|今日|明天|明日|後天|\d{1,2}[\/\-\.]\d{1,2}|\d{1,2}月\d{1,2}[號日]?)?(?:的)?訂單$/);
  if (delMatch) {
    const cust = delMatch[1].replace(/的$/, '').trim();
    const dateToken = delMatch[2];
    const targetDate = dateToken ? (parseRelativeOrCalendarDate(dateToken, todayStr, timeZone) || todayStr) : todayStr;
    if (cust) return { action: 'DELETE_ORDER', customerName: cust, targetDate };
  }

  // 2. 口語設定/取消公休
  const holMatch = cleanText.match(/^(?:幫我|請幫我|請)?(設定|新增|取消|移除)?(.+?)(今天|今日|明天|明日|後天|\d{1,2}[\/\-\.]\d{1,2}|\d{1,2}月\d{1,2}[號日]?|(?:每)?(?:週|星期|禮拜)[日天一二三四五六])\s*(?:公休|休息)$/);
  if (holMatch) {
    const verb = holMatch[1] || '設定';
    const cust = holMatch[2].replace(/(?:固定|每週|每周|的)$/g, '').trim();
    const targetTok = holMatch[3].replace(/^每/, '').trim();
    const holidayAction = (verb === '取消' || verb === '移除') ? 'REMOVE' : 'ADD';
    const d = parseRelativeOrCalendarDate(targetTok, todayStr, timeZone);
    const wd = parseChineseWeekdayNumber(targetTok);
    if (cust && (d || wd !== null)) {
      return {
        action: 'SET_HOLIDAY',
        customerName: cust,
        holidayAction,
        holidayDates: d ? [d] : [],
        offDays: wd !== null ? [wd] : []
      };
    }
  }

  // 3. 口語更改訂單狀態
  const statusMatch = cleanText.match(/^(?:幫我|請幫我|請)?(?:把|將)?(.+?)(今天|今日|明天|明日|後天|\d{1,2}[\/\-\.]\d{1,2}|\d{1,2}月\d{1,2}[號日]?)?(?:的)?(?:訂單|單)?(?:改成|改為|標記為|設為|更新為|已|改)?\s*(待出貨|未出貨|已送達|已出貨|送達|已收款未出貨|已收款|已付款|已結清|已取消)$/);
  if (statusMatch) {
    const cust = statusMatch[1].replace(/(?:今天|今日|明天|明日|的)$/g, '').trim();
    const dateToken = statusMatch[2];
    const st = normalizeLineOrderStatus(statusMatch[3]);
    const targetDate = dateToken ? (parseRelativeOrCalendarDate(dateToken, todayStr, timeZone) || todayStr) : todayStr;
    if (cust && st) {
      return { action: 'UPDATE_ORDER_STATUS', customerName: cust, targetDate, status: st };
    }
  }

  // 4. 口語修改訂單品項數量（例如：「把誠石今天的油麵改成30斤」、「誠石明天油麵加10斤」、「誠石 油麵減5斤」）
  const qtySetMatch = cleanText.match(/^(?:幫我|請幫我|請)?(?:把|將)?(.+?)(今天|今日|明天|明日|後天|\d{1,2}[\/\-\.]\d{1,2}|\d{1,2}月\d{1,2}[號日]?)?(?:的)?([^\d\s]+?)\s*(?:數量)?(?:改成|改為|調成|改)\s*([+\-]?\d+(?:\.\d+)?)\s*(斤|包|箱|顆|袋|份|條|塊|罐|瓶|盒)?$/);
  if (qtySetMatch) {
    const cust = qtySetMatch[1].replace(/(?:今天|今日|明天|明日|後天|的)$/g, '').trim();
    const dateToken = qtySetMatch[2];
    const prod = qtySetMatch[3].trim();
    const qty = Number(qtySetMatch[4]);
    const unit = qtySetMatch[5] || undefined;
    const targetDate = dateToken ? (parseRelativeOrCalendarDate(dateToken, todayStr, timeZone) || todayStr) : todayStr;
    if (cust && prod && !isNaN(qty)) {
      return {
        action: 'UPDATE_ORDER',
        customerName: cust,
        targetDate,
        items: [{ productName: prod, quantity: qty, unit, mode: 'SET' }]
      };
    }
  }

  const qtyAddMatch = cleanText.match(/^(?:幫我|請幫我|請)?(?:把|將)?(.+?)(今天|今日|明天|明日|後天|\d{1,2}[\/\-\.]\d{1,2}|\d{1,2}月\d{1,2}[號日]?)?(?:的)?([^\d\s]+?)\s*(加|多叫|增加|減|少叫|減少)\s*(\d+(?:\.\d+)?)\s*(斤|包|箱|顆|袋|份|條|塊|罐|瓶|盒)?$/);
  if (qtyAddMatch) {
    const cust = qtyAddMatch[1].replace(/(?:今天|今日|明天|明日|後天|的)$/g, '').trim();
    const dateToken = qtyAddMatch[2];
    const prod = qtyAddMatch[3].trim();
    const verb = qtyAddMatch[4];
    const rawQty = Number(qtyAddMatch[5]);
    const unit = qtyAddMatch[6] || undefined;
    const targetDate = dateToken ? (parseRelativeOrCalendarDate(dateToken, todayStr, timeZone) || todayStr) : todayStr;
    if (cust && prod && !isNaN(rawQty)) {
      const signedQty = (verb === '減' || verb === '少叫' || verb === '減少') ? -rawQty : rawQty;
      return {
        action: 'UPDATE_ORDER',
        customerName: cust,
        targetDate,
        items: [{ productName: prod, quantity: signedQty, unit, mode: 'ADD' }]
      };
    }
  }

  return null;
}

/**
 * 在 Customers 輕量索引搜尋唯一/最精確的店家
 */
function findCustomerRecordForLine(ss, customerName) {
  const query = String(customerName || '').trim().toLowerCase();
  if (!query) return { error: "請提供店家名稱。" };

  const allCusts = getLineCustomersIndex(ss);
  if (allCusts.length === 0) {
    return { error: "⚠️ 系統中目前尚無客戶資料表。" };
  }

  const exact = allCusts.find(c => String(c.name || '').trim().toLowerCase() === query);
  if (exact) return { customer: exact };

  const partials = allCusts.filter(c => {
    const cName = String(c.name || '').trim().toLowerCase();
    return cName && (cName.includes(query) || query.includes(cName));
  });

  if (partials.length === 0) {
    return { error: `⚪ 找不到名稱包含「${customerName}」的店家資料，請確認店名是否正確。` };
  }
  if (partials.length > 1) {
    const candidateNames = partials.slice(0, 6).map(c => c.name).join('、');
    return { error: `🔍 名稱「${customerName}」符合多間店家：${candidateNames}\n請輸入更完整的店名後再試一次。` };
  }
  return { customer: partials[0] };
}

/**
 * 讀取商品輕量索引做模糊品名匹配
 */
function resolveProductForLine(ss, rawProductName, existingItems) {
  const q = String(rawProductName || '').trim();
  const qLower = q.toLowerCase();

  // 1. 先從此筆訂單既有品項比對 (最符合使用者改單直覺)
  if (Array.isArray(existingItems) && existingItems.length > 0) {
    const exactInOrder = existingItems.find(it => String(it.productName || '').trim().toLowerCase() === qLower);
    if (exactInOrder) return { productName: exactInOrder.productName, unit: exactInOrder.unit || '斤', unitPrice: exactInOrder.unitPrice };

    const partialInOrder = existingItems.find(it => {
      const n = String(it.productName || '').trim().toLowerCase();
      return n && (n.includes(qLower) || qLower.includes(n));
    });
    if (partialInOrder) return { productName: partialInOrder.productName, unit: partialInOrder.unit || '斤', unitPrice: partialInOrder.unitPrice };
  }

  // 2. 再從 Products 快取索引比對
  const prods = getLineProductsIndex(ss);
  if (prods.length > 0) {
    const exactProd = prods.find(p => String(p.name || '').trim().toLowerCase() === qLower);
    if (exactProd) {
      return {
        productName: exactProd.name,
        unit: exactProd.unit || '斤',
        unitPrice: exactProd.price
      };
    }
    const partialProd = prods.find(p => {
      const n = String(p.name || '').trim().toLowerCase();
      return n && (n.includes(qLower) || qLower.includes(n));
    });
    if (partialProd) {
      return {
        productName: partialProd.name,
        unit: partialProd.unit || '斤',
        unitPrice: partialProd.price
      };
    }
  }

  return { productName: q, unit: '斤', unitPrice: undefined };
}

/**
 * 第一階段 (Dry-Run)：權限檢核、目標搜尋、預覽差異與暫存確認按鈕
 */
function prepareLineWriteAction(intent, lineUser, ss, todayStr, timeZone, preloaded) {
  const role = String(lineUser.role || 'staff').trim().toLowerCase();
  const action = intent.action;
  const cache = CacheService.getScriptCache();

  // 1. RBAC 權限前置把關
  if (action === 'UPDATE_ORDER' && !hasPermission(role, 'canEditOrderContent')) {
    return `🔒 權限不足：您的職位（${role}）無權修改訂單內容，僅管理員／領班可執行改單。`;
  }
  if (action === 'DELETE_ORDER' && !hasPermission(role, 'canDeleteOrders')) {
    return `🔒 權限不足：刪除訂單僅限最高管理員（admin）執行。\n（若需標記取消，請改用「#狀態 店名 已取消」）`;
  }
  if (action === 'SET_HOLIDAY' && role !== 'admin' && role !== 'manager') {
    return `🔒 權限不足：設定店家公休僅限管理員／領班執行。`;
  }

  // 2. 搜尋目標店家（優先使用預載 customer）
  let customer = preloaded && preloaded.customer ? preloaded.customer : null;
  if (!customer) {
    const custLookup = findCustomerRecordForLine(ss, intent.customerName);
    if (custLookup.error) {
      return custLookup.error;
    }
    customer = custLookup.customer;
  }

  // 3. 若為「設定店家公休」
  if (action === 'SET_HOLIDAY') {
    const holidayAction = String(intent.holidayAction || 'ADD').toUpperCase() === 'REMOVE' ? 'REMOVE' : 'ADD';
    const incomingDates = Array.isArray(intent.holidayDates) ? intent.holidayDates.map(d => parseRelativeOrCalendarDate(d, todayStr, timeZone) || String(d).trim()).filter(Boolean) : [];
    const incomingOffDays = Array.isArray(intent.offDays) ? intent.offDays.map(x => parseChineseWeekdayNumber(x) !== null ? parseChineseWeekdayNumber(x) : Number(x)).filter(n => !isNaN(n) && n >= 0 && n <= 6) : [];

    if (incomingDates.length === 0 && incomingOffDays.length === 0) {
      return "❓ 未偵測到有效的公休日期或星期，請再說清楚一次（例如：#公休 鵝肉亭 5/20）。";
    }

    const oldOffDays = (customer.offDays || []).slice();
    const oldHolidayDates = (customer.holidayDates || []).slice();
    let newOffDays = oldOffDays.slice();
    let newHolidayDates = oldHolidayDates.slice();

    if (holidayAction === 'ADD') {
      incomingOffDays.forEach(d => { if (newOffDays.indexOf(d) === -1) newOffDays.push(d); });
      incomingDates.forEach(dt => { if (newHolidayDates.indexOf(dt) === -1) newHolidayDates.push(dt); });
    } else {
      newOffDays = newOffDays.filter(d => incomingOffDays.indexOf(d) === -1);
      newHolidayDates = newHolidayDates.filter(dt => incomingDates.indexOf(dt) === -1);
    }

    newOffDays.sort((a, b) => a - b);
    newHolidayDates.sort();

    const token = Utilities.getUuid().slice(0, 8);
    const pendingPayload = {
      token,
      action: 'SET_HOLIDAY',
      customerId: customer.id,
      customerName: customer.name,
      phone: customer.phone,
      offDays: newOffDays,
      holidayDates: newHolidayDates,
      summary: `${holidayAction === 'REMOVE' ? '移除' : '設定'}公休（週期：${formatOffDaysToChinese(newOffDays)}；特定日：${newHolidayDates.join('、') || '無'}）`
    };
    cache.put("LINE_PENDING_" + lineUser.lineUserId, JSON.stringify(pendingPayload), 180);

    const previewText =
      `⚠️【請確認店家公休變更】\n` +
      `━━━━━━━━━━━━━━\n` +
      `🏪 店家：${customer.name}\n` +
      `🔧 操作：${holidayAction === 'REMOVE' ? '移除公休' : '新增／設定公休'}\n` +
      `📅 變更前固定公休：${formatOffDaysToChinese(oldOffDays)}\n` +
      `📅 變更後固定公休：${formatOffDaysToChinese(newOffDays)}\n` +
      `📌 變更前特定公休：${oldHolidayDates.filter(d => d >= todayStr).join('、') || '無'}\n` +
      `📌 變更後特定公休：${newHolidayDates.filter(d => d >= todayStr).join('、') || '無'}\n` +
      `━━━━━━━━━━━━━━\n` +
      `請點擊下方按鈕確認執行（3 分鐘內有效）：`;

    return {
      type: "text",
      text: previewText,
      quickReply: {
        items: [
          {
            type: "action",
            action: {
              type: "postback",
              label: "✅ 確認執行",
              data: `cmd=CONFIRM_PENDING&token=${token}`,
              displayText: "✅ 確認更新公休設定"
            }
          },
          {
            type: "action",
            action: {
              type: "postback",
              label: "❌ 取消操作",
              data: `cmd=CANCEL_PENDING&token=${token}`,
              displayText: "❌ 取消"
            }
          }
        ]
      }
    };
  }

  // 4. 訂單操作 (UPDATE_ORDER / UPDATE_ORDER_STATUS / DELETE_ORDER)：先檢索該店家目標日期訂單（優先走預載 / 快取索引）
  const targetDate = intent.targetDate
    ? (parseRelativeOrCalendarDate(intent.targetDate, todayStr, timeZone) || intent.targetDate)
    : todayStr;

  const dateOrders = getOrdersForTargetDateFast(ss, targetDate, preloaded && preloaded.orders ? preloaded.orders : null);
  const matchingRows = dateOrders.filter(o =>
    o.deliveryDate === targetDate &&
    o.customerName &&
    (o.customerName.toLowerCase() === customer.name.toLowerCase() ||
     o.customerName.toLowerCase().includes(customer.name.toLowerCase()) ||
     customer.name.toLowerCase().includes(o.customerName.toLowerCase()))
  );

  if (matchingRows.length === 0) {
    return `⚪ 找不到【${customer.name}】在 ${targetDate} 的有效訂單。`;
  }

  // 依 order.id 分組
  const orderGroupsMap = new Map();
  matchingRows.forEach(row => {
    const oid = String(row.id || '').trim();
    if (!oid) return;
    if (!orderGroupsMap.has(oid)) {
      orderGroupsMap.set(oid, {
        orderId: oid,
        customerName: row.customerName,
        deliveryDate: row.deliveryDate,
        deliveryTime: row.deliveryTime || '',
        status: row.status || 'PENDING',
        trip: row.trip || '',
        note: row.note || '',
        deliveryMethod: row.deliveryMethod || '',
        source: row.source || '',
        assignedTo: String(row.assignedTo || '').trim(),
        assignedName: String(row.assignedName || '').trim(),
        items: []
      });
    }
    orderGroupsMap.get(oid).items.push({
      productName: row.productName,
      quantity: Number(row.quantity) || 0,
      unit: row.unit || '斤',
      unitPrice: row.unitPrice
    });
  });

  let candidates = Array.from(orderGroupsMap.values());

  // staff 在 UPDATE_ORDER_STATUS 時過濾並檢查是否為指派給自己的訂單
  if (action === 'UPDATE_ORDER_STATUS' && !hasPermission(role, 'canUpdateAnyOrderStatus')) {
    const myId = String(lineUser.userId || '').trim();
    const myName = String(lineUser.name || '').trim();
    const myOrders = candidates.filter(c =>
      (myId && c.assignedTo === myId) || (myName && (c.assignedName === myName || c.assignedTo === myName))
    );
    if (myOrders.length === 0) {
      return `🔒 權限不足：【${customer.name}】於 ${targetDate} 的訂單未指派給您（${lineUser.name}），您只能變更指派給自己的訂單狀態。`;
    }
    candidates = myOrders;
  }

  // 若指定了 forcedOrderId (從消歧按鈕選進來)
  if (intent.forcedOrderId) {
    const picked = candidates.find(c => c.orderId === intent.forcedOrderId);
    if (picked) candidates = [picked];
  }

  // 多筆同日訂單消歧
  if (candidates.length > 1) {
    const pickToken = Utilities.getUuid().slice(0, 8);
    cache.put("LINE_PICK_" + lineUser.lineUserId, JSON.stringify({
      token: pickToken,
      intent: intent,
      candidates: candidates.map(c => ({ orderId: c.orderId }))
    }), 180);

    const listText = candidates.map((c, i) => {
      const itemStr = c.items.map(it => `${it.productName}×${it.quantity}${it.unit}`).join('、');
      return `${i + 1}. ${c.trip || '未分趟'} ${c.deliveryTime ? `(${c.deliveryTime})` : ''}｜${getOrderStatusChineseLabel(c.status)}\n   ${itemStr}`;
    }).join('\n');

    const quickItems = candidates.slice(0, 10).map((c, i) => {
      const labelBase = `${i + 1}.${c.trip || c.deliveryTime || c.orderId.slice(-4)} (${c.items[0]?.productName || ''})`;
      return {
        type: "action",
        action: {
          type: "postback",
          label: labelBase.substring(0, 20),
          data: `cmd=PICK_ORDER&token=${pickToken}&orderId=${encodeURIComponent(c.orderId)}`,
          displayText: `選擇第 ${i + 1} 筆訂單`
        }
      };
    });
    quickItems.push({
      type: "action",
      action: {
        type: "postback",
        label: "❌ 取消操作",
        data: `cmd=CANCEL_PENDING&token=${pickToken}`,
        displayText: "❌ 取消"
      }
    });

    return {
      type: "text",
      text: `📋【${customer.name}】在 ${targetDate} 共有 ${candidates.length} 筆訂單，請點選要操作的那一筆：\n━━━━━━━━━━━━━━\n${listText}`,
      quickReply: { items: quickItems.slice(0, 13) }
    };
  }

  const targetOrder = candidates[0];
  const token = Utilities.getUuid().slice(0, 8);
  let pendingPayload = null;
  let previewText = "";

  if (action === 'UPDATE_ORDER_STATUS') {
    const newStatus = normalizeLineOrderStatus(intent.status);
    if (!newStatus) {
      return "❓ 無法辨識目標狀態，支援狀態：待出貨、已送達(已出貨)、已收款、已收款未出貨、已取消。";
    }
    pendingPayload = {
      token,
      action: 'UPDATE_ORDER_STATUS',
      orderId: targetOrder.orderId,
      customerName: targetOrder.customerName,
      deliveryDate: targetOrder.deliveryDate,
      newStatus: newStatus
    };
    const itemsStr = targetOrder.items.map(it => `• ${it.productName} × ${it.quantity} ${it.unit}`).join('\n');
    previewText =
      `⚠️【請確認變更訂單狀態】\n` +
      `━━━━━━━━━━━━━━\n` +
      `🏪 客戶：${targetOrder.customerName}\n` +
      `📅 日期：${targetOrder.deliveryDate}${targetOrder.trip ? ` (${targetOrder.trip})` : ''}\n` +
      `📊 狀態變更：${getOrderStatusChineseLabel(targetOrder.status)} ➡️【${getOrderStatusChineseLabel(newStatus)}】\n` +
      `📦 訂單品項：\n${itemsStr}\n` +
      `━━━━━━━━━━━━━━\n` +
      `請點擊下方按鈕確認執行（3 分鐘內有效）：`;
  } else if (action === 'DELETE_ORDER') {
    pendingPayload = {
      token,
      action: 'DELETE_ORDER',
      orderId: targetOrder.orderId,
      customerName: targetOrder.customerName,
      deliveryDate: targetOrder.deliveryDate,
      items: targetOrder.items
    };
    const itemsStr = targetOrder.items.map(it => `• ${it.productName} × ${it.quantity} ${it.unit}`).join('\n');
    previewText =
      `🗑️【請確認刪除訂單】\n` +
      `━━━━━━━━━━━━━━\n` +
      `🏪 客戶：${targetOrder.customerName}\n` +
      `📅 日期：${targetOrder.deliveryDate}${targetOrder.trip ? ` (${targetOrder.trip})` : ''}\n` +
      `📊 目前狀態：${getOrderStatusChineseLabel(targetOrder.status)}\n` +
      `📦 刪除品項：\n${itemsStr}\n` +
      `━━━━━━━━━━━━━━\n` +
      `⚠️ 刪除後訂單將自列表移除，請點擊下方按鈕確認：`;
  } else if (action === 'UPDATE_ORDER') {
    const oldItems = targetOrder.items.map(it => Object.assign({}, it));
    const newItems = targetOrder.items.map(it => Object.assign({}, it));
    const incomingItems = Array.isArray(intent.items) ? intent.items : [];

    incomingItems.forEach(chg => {
      if (!chg || !chg.productName) return;
      const resolved = resolveProductForLine(ss, chg.productName, newItems);
      const qtyVal = Number(chg.quantity);
      if (isNaN(qtyVal)) return;
      const mode = String(chg.mode || 'SET').toUpperCase();
      const existingIdx = newItems.findIndex(it => String(it.productName).trim().toLowerCase() === resolved.productName.toLowerCase());

      if (existingIdx !== -1) {
        const nextQty = mode === 'ADD' ? (Number(newItems[existingIdx].quantity) + qtyVal) : qtyVal;
        if (nextQty <= 0) {
          newItems.splice(existingIdx, 1);
        } else {
          newItems[existingIdx].quantity = nextQty;
          if (chg.unit) newItems[existingIdx].unit = chg.unit;
        }
      } else if (qtyVal > 0) {
        newItems.push({
          productName: resolved.productName,
          quantity: qtyVal,
          unit: chg.unit || resolved.unit || '斤',
          unitPrice: resolved.unitPrice
        });
      }
    });

    if (newItems.length === 0) {
      return "⚠️ 修改後訂單將無任何品項（數量皆為 0）。若要整筆移除，請使用「#刪單」或「#狀態 店名 已取消」。";
    }

    const newNote = intent.note !== undefined ? String(intent.note) : targetOrder.note;
    pendingPayload = {
      token,
      action: 'UPDATE_ORDER',
      orderData: {
        id: targetOrder.orderId,
        customerName: targetOrder.customerName,
        deliveryDate: targetOrder.deliveryDate,
        deliveryTime: targetOrder.deliveryTime,
        items: newItems,
        note: newNote,
        status: targetOrder.status,
        deliveryMethod: targetOrder.deliveryMethod,
        trip: targetOrder.trip,
        source: targetOrder.source || 'LINE_BOT',
        force: true
      }
    };

    const oldStr = oldItems.map(it => `• ${it.productName} × ${it.quantity} ${it.unit}`).join('\n');
    const newStr = newItems.map(it => `• ${it.productName} × ${it.quantity} ${it.unit}`).join('\n');
    previewText =
      `✏️【請確認修改訂單明細】\n` +
      `━━━━━━━━━━━━━━\n` +
      `🏪 客戶：${targetOrder.customerName}\n` +
      `📅 日期：${targetOrder.deliveryDate}${targetOrder.trip ? ` (${targetOrder.trip})` : ''}\n` +
      `📦 修改前：\n${oldStr}\n` +
      `📦 修改後：\n${newStr}\n` +
      (intent.note !== undefined ? `📝 備註：${targetOrder.note || '無'} ➡️ ${newNote || '無'}\n` : '') +
      `━━━━━━━━━━━━━━\n` +
      `請點擊下方按鈕確認寫入（3 分鐘內有效）：`;
  }

  if (!pendingPayload) {
    return "❓ 無法建立異動預覽，請檢查指令格式或輸入「說明」查看範例。";
  }

  cache.put("LINE_PENDING_" + lineUser.lineUserId, JSON.stringify(pendingPayload), 180);

  return {
    type: "text",
    text: previewText,
    quickReply: {
      items: [
        {
          type: "action",
          action: {
            type: "postback",
            label: "✅ 確認執行",
            data: `cmd=CONFIRM_PENDING&token=${token}`,
            displayText: "✅ 確認執行變更"
          }
        },
        {
          type: "action",
          action: {
            type: "postback",
            label: "❌ 取消操作",
            data: `cmd=CANCEL_PENDING&token=${token}`,
            displayText: "❌ 取消"
          }
        }
      ]
    }
  };
}

/**
 * 第二階段：確認後正式寫入 Google Sheets 並觸發全端即時同步
 */
function executeLinePendingAction(pending, lineUser, replyContext) {
  const role = String(lineUser.role || 'staff').trim().toLowerCase();
  const action = pending.action;
  const finishWithReplyFirst = function(msg, logType, logTarget, logDetailsObj) {
    if (replyContext && replyContext.replyToken && replyContext.channelToken) {
      sendLineReply(replyContext.replyToken, replyContext.channelToken, msg);
      notifyFirebase();
      writeSystemLog(logType, logTarget, JSON.stringify(logDetailsObj));
      return null;
    }
    notifyFirebase();
    writeSystemLog(logType, logTarget, JSON.stringify(logDetailsObj));
    return msg;
  };

  if (action === 'UPDATE_ORDER') {
    if (!hasPermission(role, 'canEditOrderContent')) {
      return "🔒 權限不足：無法修改訂單內容。";
    }
    updateOrderContent(pending.orderData);
    updateGlobalTimestamp();
    SpreadsheetApp.flush();
    const itemsStr = (pending.orderData.items || []).map(it => `• ${it.productName} × ${it.quantity} ${it.unit}`).join('\n');
    const msg = `✅ 訂單修改完成！\n━━━━━━━━━━━━━━\n🏪 客戶：${pending.orderData.customerName}\n📅 日期：${pending.orderData.deliveryDate}\n📦 最新明細：\n${itemsStr}\n👤 操作同仁：${lineUser.name}`;
    return finishWithReplyFirst(
      msg,
      "LINE_UPDATE_ORDER",
      `${pending.orderData.customerName} (${pending.orderData.id})`,
      { operator: lineUser.name, role: role, orderData: pending.orderData }
    );
  }

  if (action === 'UPDATE_ORDER_STATUS') {
    updateOrderStatus({ id: pending.orderId, status: pending.newStatus, force: true }, lineUser);
    updateGlobalTimestamp();
    SpreadsheetApp.flush();
    const msg = `✅ 訂單狀態已更新！\n━━━━━━━━━━━━━━\n🏪 客戶：${pending.customerName}\n📅 日期：${pending.deliveryDate}\n📊 最新狀態：【${getOrderStatusChineseLabel(pending.newStatus)}】\n👤 操作同仁：${lineUser.name}`;
    return finishWithReplyFirst(
      msg,
      "LINE_UPDATE_STATUS",
      `${pending.customerName} (${pending.orderId})`,
      { operator: lineUser.name, role: role, newStatus: pending.newStatus }
    );
  }

  if (action === 'DELETE_ORDER') {
    if (!hasPermission(role, 'canDeleteOrders')) {
      return "🔒 權限不足：僅限最高管理員可刪除訂單。";
    }
    const delResult = deleteOrder({ id: pending.orderId, force: true });
    updateGlobalTimestamp();
    SpreadsheetApp.flush();
    const msg = `✅ 訂單已刪除！\n━━━━━━━━━━━━━━\n🏪 客戶：${pending.customerName}\n📅 日期：${pending.deliveryDate}\n🆔 單號：${pending.orderId}\n👤 操作同仁：${lineUser.name}`;
    return finishWithReplyFirst(
      msg,
      "LINE_DELETE_ORDER",
      `${pending.customerName} (${pending.orderId})`,
      {
        operator: lineUser.name,
        role: role,
        deletedId: pending.orderId,
        deletedName: (delResult && delResult.customerName) || pending.customerName,
        deletedDate: (delResult && delResult.deliveryDate) || pending.deliveryDate,
        deletedItems: (delResult && Array.isArray(delResult.items) && delResult.items.length > 0) ? delResult.items : (pending.items || [])
      }
    );
  }

  if (action === 'SET_HOLIDAY') {
    if (role !== 'admin' && role !== 'manager') {
      return "🔒 權限不足：無法修改店家公休設定。";
    }
    updateCustomer({
      id: pending.customerId,
      name: pending.customerName,
      phone: pending.phone || '',
      offDays: pending.offDays,
      holidayDates: pending.holidayDates,
      force: true
    });
    updateGlobalTimestamp();
    SpreadsheetApp.flush();
    const msg = `✅ 店家公休設定已更新！\n━━━━━━━━━━━━━━\n🏪 店家：${pending.customerName}\n🛌 固定公休：${formatOffDaysToChinese(pending.offDays)}\n📌 特定公休：${(pending.holidayDates || []).join('、') || '無'}\n👤 操作同仁：${lineUser.name}`;
    return finishWithReplyFirst(
      msg,
      "LINE_SET_HOLIDAY",
      pending.customerName,
      { operator: lineUser.name, role: role, offDays: pending.offDays, holidayDates: pending.holidayDates }
    );
  }

  return "❓ 未知的操作類型，未寫入任何資料。";
}

/**
 * 透過 Google Gemini AI 進行自然語言意圖理解 (查詢 + 寫入共 12 種意圖)
 */
function parseQueryIntentWithGemini(userText, todayStr) {
  try {
    const geminiApiKey = getCachedGeminiApiKey();

    if (!geminiApiKey) {
      console.warn("⚠️ 系統尚未在 Config 設定 GeminiApiKey");
      return null;
    }

    const prompt = `你是一個專業製麵廠 ERP 系統的 AI 助理。請精準分析使用者這句訊息，將其分類為以下 12 種意圖之一，並提取對應結構化欄位：
使用者輸入："${userText}"
今天日期：${todayStr}

查詢類意圖 (Read)：
1. "BUSINESS_STATUS"：詢問某店家今天有沒有營業/休息。
2. "HOLIDAY_INFO"：詢問某店家什麼時候公休/哪天休息。
3. "DELIVERY_STATUS"：詢問司機今天送去了嗎/送到了沒。
4. "TODAY_STATUS"：詢問某店家今天有沒有叫麵/叫了什麼。
5. "CUSTOMER_PROFILE"：純店家名稱或查詢店家檔案。
6. "DATE_ORDER"：詢問特定日期訂單明細。
7. "MONTHLY_BILL"：詢問某店家月份貨款金額。
8. "GENERATE_PDF"：要求產出某店家月份對帳單 PDF。

操作類意圖 (Write)：
9. "UPDATE_ORDER"：要求修改某店家訂單的品項數量或備註。
   - 範例：「幫我把誠石今天的油麵改成30斤」、「誠石明天油麵加10斤」、「大埔 5/30 陽春麵改15斤」
   - items 陣列中：若說「改成/改為/調成 N」則 mode="SET", quantity=N；若說「加/多叫 N」則 mode="ADD", quantity=N；若說「減/少 N」則 mode="ADD", quantity=-N。
10. "SET_HOLIDAY"：設定或取消某店家的特定公休日或每週固定公休星期。
   - 範例：「設定鵝肉亭 5/20 公休」、「大埔改每週日公休」、「取消鵝肉亭 5/20 公休」
   - holidayAction 為 "ADD" 或 "REMOVE"；holidayDates 為 ["YYYY-MM-DD"]；offDays 為數字陣列 0(週日)~6(週六)。
11. "DELETE_ORDER"：要求刪除某店家的訂單（注意與更改狀態為已取消區分）。
   - 範例：「把誠石今天的訂單刪掉」、「刪除大埔 5/30 訂單」
12. "UPDATE_ORDER_STATUS"：要求將某店家的訂單狀態更改為 待出貨(PENDING)、已送達/已出貨(SHIPPED)、已收款(PAID)、已收款未出貨(PAID_UNSHIPPED)、已取消(CANCELLED)。
   - 範例：「把誠石今天的單改成已送達」、「鵝肉亭今天已經收款了」、「大埔 5/30 取消訂單」

請僅回傳純 JSON 物件（不要加任何 markdown 標記或反引號）：
{
  "action": "BUSINESS_STATUS" | "HOLIDAY_INFO" | "DELIVERY_STATUS" | "TODAY_STATUS" | "CUSTOMER_PROFILE" | "DATE_ORDER" | "MONTHLY_BILL" | "GENERATE_PDF" | "UPDATE_ORDER" | "SET_HOLIDAY" | "DELETE_ORDER" | "UPDATE_ORDER_STATUS" | "UNKNOWN",
  "customerName": "提取出的精確店家名稱",
  "targetDate": "YYYY-MM-DD (若有提到日期或今天/明天/後天，否則可為 null)",
  "month": 數字月份或null,
  "year": "YYYY 或 null",
  "status": "PENDING | SHIPPED | PAID | PAID_UNSHIPPED | CANCELLED (僅 UPDATE_ORDER_STATUS 時提供)",
  "items": [{"productName": "品項", "quantity": 數字, "unit": "斤或單位", "mode": "SET | ADD"}],
  "note": "新備註字串或null",
  "holidayAction": "ADD | REMOVE",
  "holidayDates": ["YYYY-MM-DD"],
  "offDays": [0]
}`;

    const modelsToTry = [
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + geminiApiKey,
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + geminiApiKey
    ];

    const payload = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    };

    let lastError = null;
    for (let i = 0; i < modelsToTry.length; i++) {
      const url = modelsToTry[i];
      try {
        const response = UrlFetchApp.fetch(url, {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });

        const statusCode = response.getResponseCode();
        const responseText = response.getContentText();

        if (statusCode === 200) {
          const resJson = JSON.parse(responseText);
          const rawOutput = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawOutput) {
            const cleanJson = rawOutput.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanJson);
            if (parsed.action && parsed.action !== 'UNKNOWN' && parsed.customerName) {
              return parsed;
            }
          }
        } else {
          lastError = `HTTP ${statusCode}: ${responseText}`;
          console.error(`Gemini model ${i + 1} 呼叫失敗: ${lastError}`);
        }
      } catch (callErr) {
        lastError = callErr.message || String(callErr);
      }
    }
  } catch (err) {
    console.error("Gemini AI intent parsing failed: " + err.toString());
  }
  return null;
}

/**
 * 格式化配送時間欄位（去除試算表把純時間自動解析成 1899年 Date 物件的干擾字串）
 */
function formatDeliveryTimeString(rawVal, timeZone) {
  if (!rawVal) return '';
  if (rawVal instanceof Date) {
    const tz = timeZone || "Asia/Taipei";
    return Utilities.formatDate(rawVal, tz, "HH:mm");
  }
  const str = String(rawVal).trim();
  // 若是 "Sat Dec 30 1899 09:40:00 GMT+0800..." 或包含 GMT / 1899 / 1900 等格式
  if (str.includes("1899") || str.includes("1900") || str.includes("GMT") || str.includes("台灣標準時") || str.includes("Taipei Standard Time")) {
    const match = str.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
    if (match) {
      const hh = match[1].padStart(2, '0');
      const mm = match[2];
      return `${hh}:${mm}`;
    }
  }
  return str;
}

/**
 * 將公休日陣列或字串 (例如 [0, 1] 或 "0, 1" 或 "1、2") 轉換為親切的中文星期格式 (例如 "週日、週一")
 */
function formatOffDaysToChinese(rawOffDays) {
  if (!rawOffDays && rawOffDays !== 0) return "無固定公休 (全年無休或依店家公告)";

  let list = [];
  if (typeof rawOffDays === 'string') {
    const trimmed = rawOffDays.trim();
    if (!trimmed || trimmed === '無' || trimmed === '[]') return "無固定公休 (全年無休或依店家公告)";
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) list = parsed;
      else list = [trimmed];
    } catch (e) {
      list = trimmed.split(/[,、，\s]+/).filter(Boolean);
    }
  } else if (Array.isArray(rawOffDays)) {
    list = rawOffDays;
  } else if (typeof rawOffDays === 'number') {
    list = [rawOffDays];
  }

  if (!list || list.length === 0) return "無固定公休 (全年無休或依店家公告)";

  const dayMap = {
    "0": "週日",
    "1": "週一",
    "2": "週二",
    "3": "週三",
    "4": "週四",
    "5": "週五",
    "6": "週六",
    "7": "週日",
    "日": "週日",
    "天": "週日",
    "一": "週一",
    "二": "週二",
    "三": "週三",
    "四": "週四",
    "五": "週五",
    "六": "週六",
    "週日": "週日", "星期日": "週日", "禮拜日": "週日", "禮拜天": "週日", "星期天": "週日",
    "週一": "週一", "星期一": "週一", "禮拜一": "週一",
    "週二": "週二", "星期二": "週二", "禮拜二": "週二",
    "週三": "週三", "星期三": "週三", "禮拜三": "週三",
    "週四": "週四", "星期四": "週四", "禮拜四": "週四",
    "週五": "週五", "星期五": "週五", "禮拜五": "週五",
    "週六": "週六", "星期六": "週六", "禮拜六": "週六"
  };

  const formatted = list.map(item => {
    const s = String(item).trim();
    return dayMap[s] || s;
  });

  const unique = [];
  for (let i = 0; i < formatted.length; i++) {
    if (formatted[i] && unique.indexOf(formatted[i]) === -1) {
      unique.push(formatted[i]);
    }
  }

  return unique.length > 0 ? unique.join('、') : "無固定公休 (全年無休或依店家公告)";
}

/**
 * A. 查詢店家「今天是否有營業 / 休息」
 */
function queryCustomerBusinessStatus(ss, customerName, todayStr, timeZone) {
  if (!customerName) return "請輸入要查詢的店家名稱（例如：誠石今天有營業嗎？）";

  const custData = getLineCustomersIndex(ss);
  if (!custData || custData.length === 0) {
    return `⚠️ 系統中目前尚無客戶資料表。`;
  }

  const qLower = customerName.toLowerCase();
  const matchedCust = custData.find(c =>
    c.name && (c.name.toLowerCase().includes(qLower) || qLower.includes(c.name.toLowerCase()))
  );

  if (!matchedCust) {
    return `⚪【查無店家】找不到名稱包含「${customerName}」的店家資料。`;
  }

  const cName = matchedCust.name;
  const businessHours = matchedCust.businessHours || '未設定';

  // 依試算表時區計算今天星期幾
  const tz = timeZone || ss.getSpreadsheetTimeZone() || "Asia/Taipei";
  const isoWeekday = parseInt(Utilities.formatDate(new Date(), tz, "u"), 10);
  const dayOfWeek = isoWeekday === 7 ? 0 : isoWeekday; // 0 = Sunday, 1 = Monday, ...
  const dayOfWeekMap = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  const todayWeekDayStr = dayOfWeekMap[dayOfWeek];

  const isMatchWeeklyHoliday = (matchedCust.offDays || []).indexOf(dayOfWeek) !== -1;
  const normalizedSpecificDates = matchedCust.holidayDates || [];
  const isMatchSpecificHoliday = normalizedSpecificDates.some(d => d === todayStr);
  const isHolidayToday = isMatchWeeklyHoliday || isMatchSpecificHoliday;

  // 未來（包含今天）特定公休日
  const upcomingSpecificHolidays = normalizedSpecificDates
    .filter(d => d >= todayStr)
    .sort();

  // 同時檢查今天是否有訂單（走快取輕量訂單索引，不重算歷史單價）
  const cLower = cName.toLowerCase();
  const todayOrders = getOrdersForTargetDateFast(ss, todayStr).filter(o =>
    o.customerName && (o.customerName.toLowerCase().includes(cLower) || cLower.includes(o.customerName.toLowerCase()))
  );

  let reply = `🏪【${cName} - 今日營業狀態】\n` +
              `📅 查詢日期：${todayStr} (${todayWeekDayStr})\n` +
              `━━━━━━━━━━━━━━\n`;

  if (isHolidayToday) {
    const formattedOffDays = formatOffDaysToChinese(matchedCust.offDays);
    const reason = isMatchSpecificHoliday ? `特定公休日 (${todayStr})` : `固定公休 (${formattedOffDays})`;
    reply += `🔴 今日狀態：【公休中】\n` +
             `🛌 公休原因：${reason}\n`;
  } else {
    reply += `🟢 今日狀態：【正常營業】\n` +
             `⏰ 營業時間：${businessHours}\n`;
  }

  if (upcomingSpecificHolidays.length > 0) {
    reply += `📌 近期特定公休：${upcomingSpecificHolidays.join('、')}\n`;
  }

  if (todayOrders.length > 0) {
    reply += `📦 今日叫貨：本日已有 ${todayOrders.length} 筆訂單配送中。\n`;
  } else {
    reply += `ℹ️ 今日叫貨：本日目前尚無叫貨紀錄。\n`;
  }

  return reply;
}

/**
 * B. 查詢店家「公休時間 / 休息日」（包含固定公休與未來特定公休日）
 */
function queryCustomerHolidayInfo(ss, customerName, todayStr, timeZone) {
  if (!customerName) return "請輸入要查詢的店家名稱（例如：誠石什麼時候公休？）";

  const custData = getLineCustomersIndex(ss);
  if (!custData || custData.length === 0) {
    return `⚠️ 系統中目前尚無客戶資料表。`;
  }

  const qLower = customerName.toLowerCase();
  const matchedCust = custData.find(c =>
    c.name && (c.name.toLowerCase().includes(qLower) || qLower.includes(c.name.toLowerCase()))
  );

  if (!matchedCust) {
    return `⚪【查無店家】找不到名稱包含「${customerName}」的店家資料。`;
  }

  const cName = matchedCust.name;
  const businessHours = matchedCust.businessHours || '未設定';
  const note = matchedCust.note || '';

  // 1. 固定公休 (轉換為中文如 "週日、週一")
  const holidayText = formatOffDaysToChinese(matchedCust.offDays);

  // 2. 特定公休日（過濾掉今天以前的歷史日期）
  const upcomingSpecificHolidays = (matchedCust.holidayDates || [])
    .filter(d => d && d >= todayStr)
    .sort();

  let reply = `🏖️【${cName} - 公休與營業時間】\n` +
              `━━━━━━━━━━━━━━\n` +
              `🛌 固定公休：${holidayText}\n`;

  if (upcomingSpecificHolidays.length > 0) {
    reply += `📌 特定公休：${upcomingSpecificHolidays.join('、')}\n`;
  }

  reply += `⏰ 營業時間：${businessHours}\n`;

  if (note) {
    reply += `📝 店家備註：${note}\n`;
  }

  return reply;
}

/**
 * C. 專門查詢司機「今天送去了嗎 / 配送進度」
 */
function queryDeliveryStatusOnly(ss, customerName, todayStr) {
  if (!customerName) return "請輸入要查詢的店家名稱（例如：誠石今天有去嗎？）";

  const qLower = customerName.toLowerCase();
  const matchedOrders = getOrdersForTargetDateFast(ss, todayStr).filter(o =>
    o.customerName && (o.customerName.toLowerCase().includes(qLower) || qLower.includes(o.customerName.toLowerCase()))
  );

  if (matchedOrders.length === 0) {
    return `⚪【${customerName}】\n📅 日期：${todayStr}\nℹ️ 本日無該店家的配送單，司機今天無排定配送行程。`;
  }

  const primaryCustomer = matchedOrders[0].customerName;
  const first = matchedOrders[0];
  const isAllShipped = matchedOrders.every(o => o.status === 'SHIPPED' || o.status === 'PAID');
  const isAnyShipped = matchedOrders.some(o => o.status === 'SHIPPED' || o.status === 'PAID');
  const isAllPaid = matchedOrders.every(o => o.status === 'PAID');

  let statusBadge = "🔴 尚未送達 (未配送)";
  if (isAllPaid) {
    statusBadge = "🟢 已送達並收款完成";
  } else if (isAllShipped) {
    statusBadge = "🟢 已送達 (待收款/月結)";
  } else if (isAnyShipped) {
    statusBadge = "🚚 配送中 / 部分已送達";
  }

  const tripInfo = first.trip ? `${first.trip}` : "未指定趟次";
  const cleanTime = formatDeliveryTimeString(first.deliveryTime);
  const timeInfo = cleanTime ? ` (${cleanTime})` : "";

  return `🚚【${primaryCustomer} - 配送進度回報】\n` +
         `📅 日期：${todayStr}\n` +
         `📊 目前進度：${statusBadge}\n` +
         `📍 配送趟次：${tripInfo}${timeInfo}\n` +
         `📦 今日件數：共 ${matchedOrders.length} 項品項`;
}

/**
 * D. 查詢「店家完整總覽資料」（純店名或查店家時觸發）
 */
function queryCustomerProfileOverview(ss, customerName, todayStr, timeZone) {
  if (!customerName) return "請輸入要查詢的店家名稱（例如：誠石）";

  const qLower = customerName.toLowerCase();
  const allCusts = getLineCustomersIndex(ss);
  const customerData = allCusts.find(c =>
    c.name && (c.name.toLowerCase().includes(qLower) || qLower.includes(c.name.toLowerCase()))
  );

  const todayOrders = getOrdersForTargetDateFast(ss, todayStr).filter(o =>
    o.customerName && (o.customerName.toLowerCase().includes(qLower) || qLower.includes(o.customerName.toLowerCase()))
  );

  const displayName = customerData ? customerData.name : customerName;

  let reply = `🏪【${displayName} - 店家基本與今日資料】\n` +
              `━━━━━━━━━━━━━━\n`;

  if (customerData) {
    const phone = customerData.phone || '無';
    const address = customerData.address || '無';
    const businessHours = customerData.businessHours || '無';
    const offDaysStr = formatOffDaysToChinese(customerData.offDays);
    const upcomingSpecific = (customerData.holidayDates || [])
      .filter(d => d && d >= todayStr)
      .sort();

    reply += `📞 電話：${phone}\n` +
             `📍 地址：${address}\n` +
             `⏰ 營業時間：${businessHours}\n` +
             `🏖️ 固定公休：${offDaysStr}\n`;

    if (upcomingSpecific.length > 0) {
      reply += `📌 特定公休：${upcomingSpecific.join('、')}\n`;
    }

    reply += `━━━━━━━━━━━━━━\n`;
  }

  if (todayOrders.length > 0) {
    const isAllShipped = todayOrders.every(o => o.status === 'SHIPPED' || o.status === 'PAID');
    const statusText = isAllShipped ? "🟢 今日已送達" : "🔴 今日未配送/待出貨";
    const itemsSummary = todayOrders.map(o => `• ${o.productName} × ${o.quantity} ${o.unit || '斤'}`).join('\n');

    reply += `📦 今日訂單狀態：${statusText}\n` +
             `🚚 配送趟次：${todayOrders[0].trip || '未排趟'}\n` +
             `📋 訂購品項：\n${itemsSummary}`;
  } else {
    reply += `📦 今日訂單：本日尚無叫貨紀錄。`;
  }

  return reply;
}

/**
 * 1. 查詢今日訂單與配送狀態
 */
function queryTodayOrderStatus(ss, customerName, todayStr) {
  if (!customerName) return "請輸入要查詢的店家名稱（例如：誠石去了嗎？）";
  
  const allOrders = getAllOrdersFromSheet(ss);
  const matchedOrders = allOrders.filter(o => 
    o.deliveryDate === todayStr && 
    (o.customerName.toLowerCase().includes(customerName.toLowerCase()) || customerName.toLowerCase().includes(o.customerName.toLowerCase()))
  );

  if (matchedOrders.length === 0) {
    return `⚪【${customerName} - 今日無訂單】\n\n` +
           `📅 查詢日期：${todayStr}\n` +
           `ℹ️ 系統中本日尚無該店家的叫貨紀錄。`;
  }

  const primaryCustomer = matchedOrders[0].customerName;
  const first = matchedOrders[0];
  
  // 統計配送狀態與付款狀態
  const isAllShipped = matchedOrders.every(o => o.status === 'SHIPPED' || o.status === 'PAID');
  const isAnyShipped = matchedOrders.some(o => o.status === 'SHIPPED' || o.status === 'PAID');
  const isAllPaid = matchedOrders.every(o => o.status === 'PAID');
  const isAnyPaid = matchedOrders.some(o => o.status === 'PAID');

  let statusText = "🔴 未配送";
  if (isAllPaid) {
    statusText = "🟢 已配送並收款完畢";
  } else if (isAllShipped) {
    statusText = isAnyPaid ? "🟡 已配送 (部分已收款)" : "🟡 已配送 (待收款)";
  } else if (isAnyShipped) {
    statusText = "🚚 部分已配送";
  } else if (isAnyPaid) {
    statusText = "🔵 未配送 (已先收款)";
  }

  // 彙整品項清單
  let itemsSummary = matchedOrders.map(o => `• ${o.productName} × ${o.quantity} ${o.unit || '斤'}`).join('\n');
  
  // 趟次與時間 (處理時間格式化)
  const tripInfo = first.trip ? `${first.trip}` : "未指定趟次";
  const cleanTime = formatDeliveryTimeString(first.deliveryTime);
  const timeInfo = cleanTime ? ` (${cleanTime})` : "";

  let totalAmount = 0;
  let hasPrice = false;
  matchedOrders.forEach(o => {
    if (typeof o.subtotal === 'number' && !isNaN(o.subtotal)) {
      totalAmount += o.subtotal;
      hasPrice = true;
    }
  });

  let text = `🏪【${primaryCustomer}】\n` +
             `📊 當前狀態：${statusText}\n` +
             `🚚 配送行程：${tripInfo}${timeInfo}\n` +
             `━━━━━━━━━━━━━━\n` +
             `📦 今日訂購品項：\n${itemsSummary}`;

  if (hasPrice && totalAmount > 0) {
    text += `\n━━━━━━━━━━━━━━\n💰 今日總金額：$${totalAmount.toLocaleString()} 元`;
  }

  return text;
}

/**
 * 2. 查詢指定日期的訂單明細與總量
 */
function queryDateOrders(ss, customerName, targetDateStr, displayDateStr) {
  if (!customerName) return "請提供店家名稱與日期（例如：誠石 5/30 訂了多少？）";

  const allOrders = getAllOrdersFromSheet(ss);
  const matchedOrders = allOrders.filter(o => 
    o.deliveryDate === targetDateStr && 
    (o.customerName.toLowerCase().includes(customerName.toLowerCase()) || customerName.toLowerCase().includes(o.customerName.toLowerCase()))
  );

  if (matchedOrders.length === 0) {
    return `⚪【${customerName}】在 ${displayDateStr} (${targetDateStr}) 無訂單紀錄。`;
  }

  const primaryCustomer = matchedOrders[0].customerName;
  const itemsSummary = matchedOrders.map(o => {
    const priceStr = (typeof o.subtotal === 'number' && o.subtotal > 0) ? ` ($${o.subtotal.toLocaleString()})` : '';
    return `• ${o.productName} × ${o.quantity} ${o.unit || '斤'}${priceStr}`;
  }).join('\n');

  let totalAmount = 0;
  let hasAmount = false;
  matchedOrders.forEach(o => {
    if (typeof o.subtotal === 'number' && !isNaN(o.subtotal)) {
      totalAmount += o.subtotal;
      hasAmount = true;
    }
  });

  const isCompleted = matchedOrders.every(o => o.status === 'PAID' || o.status === 'SHIPPED');
  const statusBadge = isCompleted ? "✅ 已出貨" : "⏳ 待出貨";

  let result = `📅 查詢日期：${displayDateStr} (${targetDateStr})\n` +
               `🏪 客戶名稱：${primaryCustomer}\n` +
               `📊 出貨狀態：${statusBadge}\n` +
               `━━━━━━━━━━━━━━\n` +
               `📦 訂購明細：\n${itemsSummary}`;

  if (hasAmount && totalAmount > 0) {
    result += `\n━━━━━━━━━━━━━━\n💰 當日總金額：$${totalAmount.toLocaleString()} 元`;
  }

  return result;
}

/**
 * 3. 查詢指定月份的累積貨款與出貨天數
 */
function queryMonthlyBill(ss, customerName, monthNum, yearStr) {
  if (!customerName) return "請輸入店家名稱（例如：誠石 5月貨款）";

  const monthPrefix = `${yearStr}-${String(monthNum).padStart(2, '0')}`;
  const allOrders = getAllOrdersFromSheet(ss);

  const matchedOrders = allOrders.filter(o => 
    o.deliveryDate && o.deliveryDate.startsWith(monthPrefix) &&
    (o.customerName.toLowerCase().includes(customerName.toLowerCase()) || customerName.toLowerCase().includes(o.customerName.toLowerCase()))
  );

  if (matchedOrders.length === 0) {
    return `📊【${customerName}】\n在 ${yearStr}年 ${monthNum}月份 尚無任何出貨訂單紀錄。`;
  }

  const primaryCustomer = matchedOrders[0].customerName;
  let totalAmount = 0;
  let totalQuantity = 0;
  const activeDays = new Set();
  let paidAmount = 0;

  matchedOrders.forEach(o => {
    activeDays.add(o.deliveryDate);
    totalQuantity += (Number(o.quantity) || 0);
    const subtotal = Number(o.subtotal) || 0;
    totalAmount += subtotal;
    if (o.status === 'PAID') {
      paidAmount += subtotal;
    }
  });

  const unpaidAmount = totalAmount - paidAmount;

  return `📊【${primaryCustomer}】${yearStr}年 ${monthNum}月貨款結算\n` +
         `━━━━━━━━━━━━━━\n` +
         `🚚 出貨天數：${activeDays.size} 天\n` +
         `📦 叫貨筆數：${matchedOrders.length} 筆\n` +
         `⚖️ 總出貨量：${totalQuantity.toLocaleString()} 斤\n` +
         `💵 應收總額：$${totalAmount.toLocaleString()} 元\n` +
         `✅ 已收金額：$${paidAmount.toLocaleString()} 元\n` +
         (unpaidAmount > 0 ? `⚠️ 未收餘額：$${unpaidAmount.toLocaleString()} 元\n` : `🎉 款項狀態：已全數結清\n`) +
         `━━━━━━━━━━━━━━\n` +
         `💡 如需明細報表，可傳送：「${primaryCustomer} ${monthNum}月PDF」`;
}

/**
 * 4. 產生月對帳單 PDF 並建立 Google Drive 下載連結
 */
function generateMonthlyStatementPDF(ss, customerName, monthNum, yearStr) {
  if (!customerName) return "請輸入店家名稱（例如：誠石 5月報表）";

  const monthPrefix = `${yearStr}-${String(monthNum).padStart(2, '0')}`;
  const allOrders = getAllOrdersFromSheet(ss);

  const matchedOrders = allOrders.filter(o => 
    o.deliveryDate && o.deliveryDate.startsWith(monthPrefix) &&
    (o.customerName.toLowerCase().includes(customerName.toLowerCase()) || customerName.toLowerCase().includes(o.customerName.toLowerCase()))
  );

  if (matchedOrders.length === 0) {
    return `⚠️【${customerName}】在 ${yearStr}年 ${monthNum}月查無訂單，無法產出對帳單 PDF。`;
  }

  const primaryCustomer = matchedOrders[0].customerName;

  // 依日期升冪排序
  matchedOrders.sort((a, b) => (a.deliveryDate > b.deliveryDate ? 1 : -1));

  let totalAmount = 0;
  let totalQty = 0;

  const rowsHtml = matchedOrders.map(o => {
    const sub = Number(o.subtotal) || 0;
    const up = Number(o.unitPrice) || 0;
    totalAmount += sub;
    totalQty += (Number(o.quantity) || 0);

    return `
      <tr>
        <td style="border:1px solid #cbd5e1;padding:8px 10px;text-align:center;font-size:13px;">${o.deliveryDate}</td>
        <td style="border:1px solid #cbd5e1;padding:8px 10px;font-size:13px;font-weight:bold;">${o.productName}</td>
        <td style="border:1px solid #cbd5e1;padding:8px 10px;text-align:center;font-size:13px;">${o.quantity} ${o.unit || '斤'}</td>
        <td style="border:1px solid #cbd5e1;padding:8px 10px;text-align:right;font-size:13px;">${up > 0 ? '$' + up : '-'}</td>
        <td style="border:1px solid #cbd5e1;padding:8px 10px;text-align:right;font-size:13px;font-weight:bold;">${sub > 0 ? '$' + sub.toLocaleString() : '-'}</td>
      </tr>
    `;
  }).join('');

  const printTime = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || "Asia/Taipei", "yyyy-MM-dd HH:mm");

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: "Microsoft JhengHei", "PingFang TC", sans-serif; color: #1e293b; padding: 24px; }
          .header { text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 12px; margin-bottom: 16px; }
          .title { font-size: 22px; font-weight: bold; margin: 0 0 6px 0; color: #0f172a; }
          .subtitle { font-size: 14px; color: #64748b; margin: 0; }
          .meta-box { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 14px; background: #f8fafc; padding: 10px 14px; border-radius: 6px; border: 1px solid #e2e8f0; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
          th { background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 10px; font-size: 13px; color: #334155; font-weight: bold; }
          .total-box { text-align: right; font-size: 16px; font-weight: bold; padding: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; color: #166534; }
          .footer { margin-top: 24px; display: flex; justify-content: space-between; font-size: 13px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">製麵廠客戶月份對帳單</h1>
          <p class="subtitle">結算月份：${yearStr} 年 ${monthNum} 月份</p>
        </div>

        <div class="meta-box">
          <div><b>客戶名稱：</b> ${primaryCustomer}</div>
          <div><b>列印時間：</b> ${printTime}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 22%;">配送日期</th>
              <th style="width: 30%;">品項名稱</th>
              <th style="width: 16%;">數量</th>
              <th style="width: 16%;">單價</th>
              <th style="width: 16%;">小計</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="total-box">
          總數量：${totalQty.toLocaleString()} 斤 &nbsp;&nbsp;|&nbsp;&nbsp; 總計應收金額：$${totalAmount.toLocaleString()} 元
        </div>

        <div class="footer">
          <div>客戶簽章：____________________</div>
          <div>經辦簽名：____________________</div>
        </div>
      </body>
    </html>
  `;

  try {
    const blob = Utilities.newBlob(htmlContent, 'text/html', `${primaryCustomer}_${yearStr}年${monthNum}月_對帳單.html`).getAs('application/pdf');
    blob.setName(`${primaryCustomer}_${yearStr}年${monthNum}月_對帳單.pdf`);
    
    // 儲存至 Drive 根目錄
    const pdfFile = DriveApp.createFile(blob);
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const pdfUrl = pdfFile.getUrl();

    return `📄【${primaryCustomer} ${monthNum}月份對帳單 PDF 已生成】\n\n` +
           `📅 結算月份：${yearStr}年 ${monthNum}月\n` +
           `📦 總出貨筆數：${matchedOrders.length} 筆 (${totalQty} 斤)\n` +
           `💰 應收總額：$${totalAmount.toLocaleString()} 元\n` +
           `━━━━━━━━━━━━━━\n` +
           `📥 點擊下方連結線上檢視或下載列印：\n${pdfUrl}`;
  } catch (err) {
    console.error("PDF generation failed: " + err.toString());
    return `❌ 產生 PDF 失敗：${err.message || String(err)}`;
  }
}

/**
 * 輔助函數：高效讀取所有歷史訂單（含智慧單價與小計自動補齊）
 */
function getAllOrdersFromSheet(ss) {
  const orderSheet = ss.getSheetByName("ORDERS") || ss.getSheetByName("Orders");
  if (!orderSheet || orderSheet.getLastRow() <= 1) return [];

  const raw = getRecentSheetData(orderSheet, 5000);
  const timeZone = ss.getSpreadsheetTimeZone() || "Asia/Taipei";

  // 預先建立商品預設價與客戶客製價快取，供舊單或未填單價時自動精準回填
  let productPriceMap = new Map();
  let productIdToNameMap = new Map();
  let customerPriceMap = new Map(); // key: customerName_productName -> price
  try {
    const prodSheet = ss.getSheetByName("PRODUCTS") || ss.getSheetByName("Products");
    if (prodSheet && prodSheet.getLastRow() > 1) {
      const prodData = getSheetData(prodSheet);
      prodData.forEach(p => {
        const pName = String(p.Name || p.name || p.品項 || '').trim();
        const pId = String(p.ID || p.id || '').trim();
        const pPrice = Number(p.Price || p.price || p.單價 || p.預設單價) || 0;
        if (pName) productPriceMap.set(pName, pPrice);
        if (pId) {
          productPriceMap.set(pId, pPrice);
          if (pName) productIdToNameMap.set(pId, pName);
        }
      });
    }

    const custSheet = ss.getSheetByName("CUSTOMERS") || ss.getSheetByName("Customers");
    if (custSheet && custSheet.getLastRow() > 1) {
      const custData = getSheetData(custSheet);
      custData.forEach(c => {
        const cName = String(c.Name || c.name || c.客戶名稱 || '').trim();
        
        // 1. 解析客製價目表 PriceList
        const rawPl = c.PriceList || c.priceList || c.價目表JSON || c.價目表 || c.客製化價格JSON || c.客製化價格;
        const pl = typeof rawPl === 'string' ? safeJsonArray(rawPl) : (rawPl || []);
        if (Array.isArray(pl)) {
          pl.forEach(item => {
            const pId = String(item.productId || '').trim();
            const pName = String(item.productName || '').trim();
            const resolvedName = pName || productIdToNameMap.get(pId) || pId;
            const price = Number(item.price);
            if (cName && !isNaN(price)) {
              if (resolvedName) customerPriceMap.set(`${cName}_${resolvedName}`, price);
              if (pId) customerPriceMap.set(`${cName}_${pId}`, price);
              if (pName) customerPriceMap.set(`${cName}_${pName}`, price);
            }
          });
        }

        // 2. 解析預設品項 DefaultItems 裡的自訂單價 (若有設定 price)
        const rawDef = c.DefaultItems || c.defaultItems || c.預設品項JSON || c.預設品項;
        const defItems = typeof rawDef === 'string' ? safeJsonArray(rawDef) : (rawDef || []);
        if (Array.isArray(defItems)) {
          defItems.forEach(item => {
            const pId = String(item.productId || '').trim();
            const pName = String(item.productName || '').trim();
            const resolvedName = pName || productIdToNameMap.get(pId) || pId;
            const price = Number(item.price);
            if (cName && !isNaN(price) && price > 0) {
              if (resolvedName && !customerPriceMap.has(`${cName}_${resolvedName}`)) {
                customerPriceMap.set(`${cName}_${resolvedName}`, price);
              }
            }
          });
        }
      });
    }
  } catch (e) {
    console.warn("getAllOrdersFromSheet price map init warning: " + e.toString());
  }

  return raw.map(o => {
    let rawDate = o.DeliveryDate || o.deliveryDate || o.配送日期;
    let finalDateStr = '';
    
    if (rawDate instanceof Date) {
      finalDateStr = Utilities.formatDate(rawDate, timeZone, "yyyy-MM-dd");
    } else if (rawDate) {
      finalDateStr = String(rawDate).replace(/\s+/g, '').split('T')[0]
        .replace(/\//g, '-')
        .replace(/-0?/g, '-')
        .replace(/-(\d)(?!\d)/g, '-0$1');
    }

    const cName = String(o.CustomerName || o.customerName || o.客戶名 || '').trim();
    const pName = String(o.ProductName || o.productName || o.品項 || '').trim();
    const qty = Number(o.Quantity || o.quantity || o.數量) || 1;

    // 依據使用者需求：價格一律即時從「客戶資料的專屬價目表」取得；若無則由商品預設單價取得
    let unitPrice = customerPriceMap.get(`${cName}_${pName}`);
    if (unitPrice === undefined) {
      // 嘗試比對客戶名稱包含與被包含 (防範簡寫或全名差異)
      for (const [key, p] of customerPriceMap.entries()) {
        const [cKey, prodKey] = key.split('_');
        if (prodKey === pName && (cKey.includes(cName) || cName.includes(cKey))) {
          unitPrice = p;
          break;
        }
      }
    }
    if (unitPrice === undefined) {
      unitPrice = productPriceMap.get(pName);
    }
    if (typeof unitPrice !== 'number' || isNaN(unitPrice)) {
      unitPrice = 0;
    }
    const subtotal = unitPrice * qty;

    return {
      id: o.ID || o.id || o["Order ID"] || o.訂單ID,
      customerName: cName,
      deliveryDate: finalDateStr,
      deliveryTime: formatDeliveryTimeString(o.DeliveryTime || o.deliveryTime || o.配送時間 || ''),
      productName: pName,
      quantity: qty,
      unit: o.Unit || o.unit || o.單位 || '斤',
      note: o.Note || o.note || o.備註 || '',
      status: String(o.Status || o.status || o.狀態 || 'PENDING').trim(),
      deliveryMethod: o.DeliveryMethod || o.deliveryMethod || o.配送方式 || '',
      source: o.Source || o.source || o.資料來源 || '',
      unitPrice: unitPrice > 0 ? unitPrice : undefined,
      subtotal: subtotal > 0 ? subtotal : undefined,
      trip: o.Trip || o.trip || o.趟次 || '',
      assignedTo: o.assigned_to || o.AssignedTo || o.指派人員ID || o.指派人員 || '',
      assignedName: o.assigned_name || o.AssignedName || o.指派人員姓名 || ''
    };
  }).filter(o => String(o.status || '').trim().toUpperCase() !== 'DELETED');
}

// 1. 初始化與獲取 Log 表單
function getNotificationLogSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("執行日誌");
  if (!sheet) {
    sheet = ss.insertSheet("執行日誌");
    // [時間, 觸發來源, 規則ID, 規則名稱, 執行狀態, 詳細過程(JSON)]
    sheet.appendRow(["時間", "觸發來源", "規則ID", "規則名稱", "執行狀態", "詳細內容"]);
    sheet.setFrozenRows(1);
    // sheet.hideSheet(); // 前端架構不依賴人員檢視，直接隱藏防呆 - 取消隱藏以便使用者查看
  }
  return sheet;
}

// 2. 寫入日誌與滾動清理機制 (Rolling Window)
function writeTraceLog(source, ruleId, ruleName, status, detailsObj) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); // 防禦並發寫入
    const sheet = getNotificationLogSheet();
    
    // 寫入當下軌跡
    const timestamp = Utilities.formatDate(new Date(), SS.getSpreadsheetTimeZone() || "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
    const safeDetails = detailsObj ? JSON.stringify(detailsObj) : "{}";
    safeAppendRow(sheet, [timestamp, source, ruleId, ruleName, status, safeDetails]);
    
    // 效能防禦：Rolling Window (保留最新 800 筆)
    const lastRow = sheet.getLastRow();
    const MAX_LOGS = 1000;
    const DELETE_COUNT = 200;
    
    if (lastRow > MAX_LOGS) {
      // 刪除最舊的 200 筆 (保留第 1 列的 Header，從第 2 列開始刪)
      sheet.deleteRows(2, DELETE_COUNT);
    }
  } catch (e) {
    console.error("Trace Log 寫入失敗", e);
  } finally {
    lock.releaseLock();
  }
}

// 實作該 Method (只抓最新 50 筆加速前端繪製)
function getNotificationLogs() {
  const sheet = getNotificationLogSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  
  const rawValues = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  // 將陣列反轉 (顯示最新的在最上面)，並限制回傳筆數以防 Payload 過大
  const logs = rawValues.reverse().slice(0, 50).map(row => ({
    timestamp: safeFormatDate(row[0]),
    source: row[1],
    ruleId: String(row[2]),
    ruleName: String(row[3]),
    status: row[4],
    details: row[5] // JSON String, 留給前端 Mapper 去 parse
  }));
  
  return logs;
}

// ==========================================
// 系統操作日誌 (System Logs) Functionality
// ==========================================

function getSystemLogSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("系統操作日誌");
  if (!sheet) {
    sheet = ss.insertSheet("系統操作日誌");
    sheet.appendRow(["時間", "操作類型", "目標對象", "詳細內容"]);
    sheet.setFrozenRows(1);
    sheet.hideSheet(); // 避免人員變更
  }
  return sheet;
}

function writeSystemLog(actionType, target, detailsStr) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getSystemLogSheet();
    const lastRow = sheet.getLastRow();
    
    // Rolling Window
    if (lastRow > 5000) {
       sheet.deleteRows(2, 1000);
    }
    
    const timestamp = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
    safeAppendRow(sheet, [timestamp, actionType, target, detailsStr]);
  } catch (e) {
    console.error("writeSystemLog error: ", e);
  } finally {
    lock.releaseLock();
  }
}

function formatSystemLogTimestamp(rawVal) {
  if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    return {
      timestampStr: Utilities.formatDate(rawVal, "Asia/Taipei", "yyyy-MM-dd HH:mm:ss"),
      timestamp: rawVal.getTime()
    };
  }
  const str = String(rawVal || "").trim();
  if (!str) return { timestampStr: "", timestamp: 0 };

  const bareMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (bareMatch) {
    const pad = (n) => String(n || "0").padStart(2, "0");
    const isoTaipei = `${bareMatch[1]}-${pad(bareMatch[2])}-${pad(bareMatch[3])}T${pad(bareMatch[4])}:${pad(bareMatch[5])}:${pad(bareMatch[6])}+08:00`;
    const parsedBare = new Date(isoTaipei);
    if (!isNaN(parsedBare.getTime())) {
      return {
        timestampStr: Utilities.formatDate(parsedBare, "Asia/Taipei", "yyyy-MM-dd HH:mm:ss"),
        timestamp: parsedBare.getTime()
      };
    }
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return {
      timestampStr: Utilities.formatDate(parsed, "Asia/Taipei", "yyyy-MM-dd HH:mm:ss"),
      timestamp: parsed.getTime()
    };
  }
  return { timestampStr: str, timestamp: 0 };
}

function getSystemLogs(limitOrOptions) {
  const isOpts = limitOrOptions && typeof limitOrOptions === 'object';
  const opts = isOpts ? limitOrOptions : { limit: limitOrOptions };
  const offset = Math.max(0, Number(opts.offset) || 0);
  const batchSize = Math.min(3000, Math.max(1, Number(opts.batchSize || opts.limit) || 200));
  const days = Math.max(0, Number(opts.days) || 0);
  const includeMeta = Boolean(opts.includeMeta);

  const sheet = getSystemLogSheet();
  const lastRow = sheet.getLastRow();
  const totalRows = Math.max(0, lastRow - 1);
  if (totalRows === 0) {
    return includeMeta ? { logs: [], totalRows: 0, hasMore: false, paged: true } : [];
  }

  const endRow = lastRow - offset;
  if (endRow < 2) {
    return includeMeta ? { logs: [], totalRows: totalRows, hasMore: false, paged: true } : [];
  }

  const startRow = Math.max(2, endRow - batchSize + 1);
  const numRows = endRow - startRow + 1;
  const rawValues = sheet.getRange(startRow, 1, numRows, 4).getValues();
  const cutoffTs = days > 0 ? (Date.now() - days * 24 * 60 * 60 * 1000) : 0;

  const logs = [];
  let reachedCutoff = false;
  const reversed = rawValues.reverse();
  for (let i = 0; i < reversed.length; i++) {
    const row = reversed[i];
    const tsInfo = formatSystemLogTimestamp(row[0]);
    if (cutoffTs > 0 && tsInfo.timestamp > 0 && tsInfo.timestamp < cutoffTs) {
      reachedCutoff = true;
      break;
    }
    logs.push({
      timestampStr: tsInfo.timestampStr,
      timestamp: tsInfo.timestamp,
      actionType: String(row[1]),
      target: String(row[2]),
      details: String(row[3])
    });
  }

  const hasMore = !reachedCutoff && startRow > 2;
  if (includeMeta) {
    return {
      logs: logs,
      totalRows: totalRows,
      hasMore: hasMore,
      paged: true
    };
  }
  return logs;
}

function cleanupOldLogs() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); // 允許等待較長時間
    const sheet = getSystemLogSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    
    // 設定刪除期限為 30 天前
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    const cutoffTs = cutoffDate.getTime();
    
    const maxProcess = 1000; // 一次最多檢查 1000 筆避免逾時
    const values = sheet.getRange(2, 1, Math.min(lastRow - 1, maxProcess), 1).getValues();
    
    let deleteCount = 0;
    for (let i = 0; i < values.length; i++) {
       const cellTimeStr = String(values[i][0]).replace(/-/g, '/');
       const cellDate = new Date(cellTimeStr);
       if (!isNaN(cellDate.getTime()) && cellDate.getTime() < cutoffTs) {
         deleteCount++;
       } else {
         break; // 因為是按時間寫入的，遇到第一個比較新的就可以停了
       }
    }
    
    if (deleteCount > 0) {
      sheet.deleteRows(2, deleteCount);
      console.log(`cleanupOldLogs: 刪除了 ${deleteCount} 筆超過 30 天的系統日誌`);
    }
  } catch(e) {
    console.error("cleanupOldLogs error", e);
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// 資安模組：高強度無狀態 Token 簽發與驗證 (HMAC-SHA256)
// ==========================================

/**
 * 取得伺服器端獨立高強度 JWT 簽章密鑰 (256-bit Entropy)
 * 儲存於 Google Apps Script 的 ScriptProperties，與試算表資料完全隔離，避免試算表被看見或密碼太弱導致偽造
 */
function getJwtSecret() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty("JWT_SECRET");
  if (!secret) {
    secret = Utilities.getUuid() + "-" + Utilities.getUuid();
    props.setProperty("JWT_SECRET", secret);
  }
  return secret;
}

/**
 * 輪替 JWT 密鑰（可立即強制使所有目前已簽發的 Token 失效登出）
 */
function rotateJwtSecret() {
  const props = PropertiesService.getScriptProperties();
  const newSecret = Utilities.getUuid() + "-" + Utilities.getUuid();
  props.setProperty("JWT_SECRET", newSecret);
  return newSecret;
}

function hashPassword(password, salt) {
  const raw = String(password) + ":" + String(salt);
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return digest.map(byte => (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, '0')).join('');
}

function generateToken(payloadOrDeviceId, arg2, arg3, arg4) {
  let payloadObj = {};
  if (typeof payloadOrDeviceId === 'object' && payloadOrDeviceId !== null) {
    payloadObj = {
      userId: String(payloadOrDeviceId.userId || payloadOrDeviceId.id || payloadOrDeviceId.dId || '').trim(),
      username: String(payloadOrDeviceId.username || '').trim(),
      name: String(payloadOrDeviceId.name || payloadOrDeviceId.displayName || '使用者').trim(),
      role: String(payloadOrDeviceId.role || 'staff').trim().toLowerCase(),
      dId: String(payloadOrDeviceId.dId || payloadOrDeviceId.deviceId || '').trim(),
      exp: payloadOrDeviceId.exp || (Date.now() + (7 * 24 * 60 * 60 * 1000))
    };
  } else {
    let deviceId = payloadOrDeviceId;
    let role = arg2;
    let name = arg3;
    if (arg4 !== undefined) {
      role = arg3;
      name = arg4;
    }
    payloadObj = {
      userId: deviceId || 'U_' + Utilities.getUuid().slice(0, 6),
      dId: deviceId,
      role: role || "staff",
      name: name || "使用者",
      exp: Date.now() + (30 * 24 * 60 * 60 * 1000)
    };
  }

  const header = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = Utilities.base64EncodeWebSafe(JSON.stringify(payloadObj));
  const secret = getJwtSecret();
  const signature = Utilities.computeHmacSha256Signature(header + "." + payload, secret);
  return header + "." + payload + "." + Utilities.base64EncodeWebSafe(signature);
}

function verifyToken(token) {
  return verifyTokenAndGetPayload(token);
}

function verifyTokenAndGetPayload(token, fallbackKey) {
  try {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    // 1. 使用伺服器獨立 256-bit 高強度密鑰驗證簽章
    const secret = getJwtSecret();
    const signature = Utilities.computeHmacSha256Signature(parts[0] + "." + parts[1], secret);
    let valid = (parts[2] === Utilities.base64EncodeWebSafe(signature));
    
    // 2. 平滑過渡相容：若新密鑰驗證未過，且有舊密鑰（或傳入 fallbackKey），嘗試驗證舊版以資料庫密碼簽發的 Token
    if (!valid) {
      const legacyKey = fallbackKey || (function() {
        try {
          const cfg = SS.getSheetByName("Config");
          return cfg ? String(cfg.getRange("B1").getDisplayValue()).trim() : null;
        } catch(e) { return null; }
      })();
      if (legacyKey) {
        const legacySig = Utilities.computeHmacSha256Signature(parts[0] + "." + parts[1], legacyKey);
        if (parts[2] === Utilities.base64EncodeWebSafe(legacySig)) {
          valid = true;
        }
      }
    }

    if (!valid) return null;
    
    // 3. 驗證是否過期
    const payloadBytes = Utilities.base64DecodeWebSafe(parts[1]);
    const payloadObj = JSON.parse(Utilities.newBlob(payloadBytes).getDataAsString());
    if (new Date().getTime() > payloadObj.exp) return null;
    
    return payloadObj;
  } catch(e) {
    return null;
  }
}

function checkUserStatus(userId) {
  const sheet = SS.getSheetByName("Users") || SS.getSheetByName("USERS") || SS.getSheetByName("使用者");
  if (!sheet || sheet.getLastRow() <= 1) return null;
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h || '').trim());
  const idIdx = headers.findIndex(h => ["user_id", "userId", "ID", "使用者ID", "編號"].includes(h));
  const statusIdx = headers.findIndex(h => ["status", "Status", "狀態", "帳號狀態"].includes(h));
  if (idIdx === -1 || statusIdx === -1) return null;

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idIdx]).trim() === String(userId).trim()) {
      return String(values[i][statusIdx]).trim().toUpperCase();
    }
  }
  return null;
}

function handleGetOrders(user) {
  const data = getData(null, 0, user);
  return { success: true, orders: data.orders };
}

function findHeaderIndex(headers, candidates) {
  const normCandidates = candidates.map(c => String(c).toLowerCase().replace(/[\s_\-]/g, ''));
  return headers.findIndex(h => normCandidates.includes(String(h || '').trim().toLowerCase().replace(/[\s_\-]/g, '')));
}

function handleGetStaffList(user) {
  const role = user ? String(user.role || '').toLowerCase() : '';
  if (role !== 'admin' && role !== 'manager') {
    return { success: false, error: "權限不足：無權取得員工名單" };
  }
  
  const staff = [];
  const seenUserIds = new Set();

  // 1. 優先從 Users 工作表讀取
  const sheet = SS.getSheetByName("Users") || SS.getSheetByName("USERS") || SS.getSheetByName("使用者");
  if (sheet && sheet.getLastRow() > 1) {
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const idIdx = findHeaderIndex(headers, ["user_id", "userid", "id", "使用者id", "工號", "編號", "代號"]);
    const userIdx = findHeaderIndex(headers, ["username", "user", "帳號", "登入帳號", "使用者名稱"]);
    const roleIdx = findHeaderIndex(headers, ["role", "職位", "角色", "職務", "職級", "職位角色"]);
    const statusIdx = findHeaderIndex(headers, ["status", "狀態", "帳號狀態", "啟用狀態"]);
    const nameIdx = findHeaderIndex(headers, ["name", "display_name", "displayname", "姓名", "顯示姓名", "同仁姓名", "員工姓名"]);
    const lineIdx = findHeaderIndex(headers, ["line_user_id", "lineuserid", "line_id", "lineid", "line綁定id", "line"]);

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const rawId = idIdx !== -1 ? String(row[idIdx] || '').trim() : '';
      const rawUser = userIdx !== -1 ? String(row[userIdx] || '').trim() : '';
      if (!rawId && !rawUser) continue; // 略過空白列

      const s = statusIdx !== -1 ? String(row[statusIdx] || '').trim().toUpperCase() : 'ACTIVE';
      if (s === 'ACTIVE' || s === 'TRUE' || s === '') {
        const uId = rawId || rawUser;
        const uName = nameIdx !== -1 && String(row[nameIdx] || '').trim() 
          ? String(row[nameIdx]).trim() 
          : (rawUser || `同仁${i}`);
        const lineId = lineIdx !== -1 ? String(row[lineIdx] || '').trim() : '';
        
        seenUserIds.add(uId);
        staff.push({
          userId: uId,
          username: rawUser || uId,
          name: uName,
          role: roleIdx !== -1 && String(row[roleIdx] || '').trim() ? String(row[roleIdx]).trim().toLowerCase() : 'staff',
          line_user_id: lineId
        });
      }
    }
  }

  // 2. 補充 ACCOUNTS 工作表相容帳號（若未曾被 Users 定義）
  const accSheet = SS.getSheetByName("ACCOUNTS");
  if (accSheet && accSheet.getLastRow() > 1) {
    const accs = getSheetData(accSheet);
    accs.forEach((a, idx) => {
      const aId = String(a.ID || a.id || a.Name || `A_${idx}`).trim();
      const isActive = String(a.IsActive || 'TRUE').trim().toUpperCase() === 'TRUE';
      if (isActive && !seenUserIds.has(aId)) {
        seenUserIds.add(aId);
        staff.push({
          userId: aId,
          username: String(a.Name || aId).trim(),
          name: String(a.Name || aId).trim(),
          role: String(a.Role || 'staff').trim().toLowerCase(),
          line_user_id: ''
        });
      }
    });
  }

  return { success: true, staff: staff, users: staff };
}

function handleGetAllUsers(user) {
  const role = user ? String(user.role || '').toLowerCase() : '';
  if (role !== 'admin' && role !== 'manager') {
    return { success: false, error: "FORBIDDEN: 僅最高管理員有權查閱完整使用者名單" };
  }

  const list = [];
  const seenUserIds = new Set();

  // 1. 優先從 Users 工作表讀取完整名單
  const sheet = SS.getSheetByName("Users") || SS.getSheetByName("USERS") || SS.getSheetByName("使用者");
  if (sheet && sheet.getLastRow() > 1) {
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const idIdx = findHeaderIndex(headers, ["user_id", "userid", "id", "使用者id", "工號", "編號", "代號"]);
    const userIdx = findHeaderIndex(headers, ["username", "user", "帳號", "登入帳號", "使用者名稱"]);
    const roleIdx = findHeaderIndex(headers, ["role", "職位", "角色", "職務", "職級", "職位角色"]);
    const statusIdx = findHeaderIndex(headers, ["status", "狀態", "帳號狀態", "啟用狀態"]);
    const nameIdx = findHeaderIndex(headers, ["name", "display_name", "displayname", "姓名", "顯示姓名", "同仁姓名", "員工姓名"]);
    const lineIdx = findHeaderIndex(headers, ["line_user_id", "lineuserid", "line_id", "lineid", "line綁定id", "line"]);

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const rawId = idIdx !== -1 ? String(row[idIdx] || '').trim() : '';
      const rawUser = userIdx !== -1 ? String(row[userIdx] || '').trim() : '';
      if (!rawId && !rawUser) continue; // 略過空白列

      const uId = rawId || rawUser;
      const rawStatus = statusIdx !== -1 ? String(row[statusIdx] || '').trim().toUpperCase() : 'ACTIVE';
      const status = (rawStatus === 'DISABLED' || rawStatus === 'FALSE') ? 'DISABLED' : 'ACTIVE';
      const uName = nameIdx !== -1 && String(row[nameIdx] || '').trim() 
        ? String(row[nameIdx]).trim() 
        : (rawUser || `同仁${i}`);
      const lineId = lineIdx !== -1 ? String(row[lineIdx] || '').trim() : '';

      seenUserIds.add(uId);
      list.push({
        userId: uId,
        username: rawUser || uId,
        name: uName,
        role: roleIdx !== -1 && String(row[roleIdx] || '').trim() ? String(row[roleIdx]).trim().toLowerCase() : 'staff',
        status: status,
        line_user_id: lineId
      });
    }
  }

  // 2. 補充 ACCOUNTS 既有人員
  const accSheet = SS.getSheetByName("ACCOUNTS");
  if (accSheet && accSheet.getLastRow() > 1) {
    const accs = getSheetData(accSheet);
    accs.forEach((a, idx) => {
      const aId = String(a.ID || a.id || a.Name || `A_${idx}`).trim();
      if (!seenUserIds.has(aId)) {
        seenUserIds.add(aId);
        const isActive = String(a.IsActive || 'TRUE').trim().toUpperCase() === 'TRUE';
        list.push({
          userId: aId,
          username: String(a.Name || aId).trim(),
          name: String(a.Name || aId).trim(),
          role: String(a.Role || 'staff').trim().toLowerCase(),
          status: isActive ? 'ACTIVE' : 'DISABLED',
          line_user_id: ''
        });
      }
    });
  }

  return { success: true, users: list, staff: list };
}

function handleSaveUser(data, currentUser) {
  const role = currentUser ? String(currentUser.role || '').toLowerCase() : '';
  if (role !== 'admin') {
    return { success: false, error: "FORBIDDEN: 僅最高管理員有權維護使用者帳號" };
  }

  let sheet = SS.getSheetByName("Users") || SS.getSheetByName("USERS") || SS.getSheetByName("使用者");
  if (!sheet) {
    sheet = SS.insertSheet("Users");
    sheet.appendRow(["user_id", "username", "name", "password_hash", "salt", "role", "status", "line_user_id"]);
    SpreadsheetApp.flush();
  }

  const values = sheet.getDataRange().getValues();
  let headers = values[0];

  // 欄位匹配 (不分大小寫與符號)
  let idIdx = findHeaderIndex(headers, ["user_id", "userid", "id", "使用者id", "工號", "編號", "代號"]);
  let userIdx = findHeaderIndex(headers, ["username", "user", "帳號", "登入帳號", "使用者名稱"]);
  let nameIdx = findHeaderIndex(headers, ["name", "display_name", "displayname", "姓名", "顯示姓名", "同仁姓名", "員工姓名"]);
  let hashIdx = findHeaderIndex(headers, ["password_hash", "hash", "password", "密碼雜湊", "密碼hash", "密碼"]);
  let saltIdx = findHeaderIndex(headers, ["salt", "鹽值", "鹽", "密鑰"]);
  let roleIdx = findHeaderIndex(headers, ["role", "職位", "角色", "職務", "職級", "職位角色"]);
  let statusIdx = findHeaderIndex(headers, ["status", "狀態", "帳號狀態", "啟用狀態"]);
  let lineIdx = findHeaderIndex(headers, ["line_user_id", "lineuserid", "line_id", "lineid", "line綁定id", "line"]);

  // 自動補齊 name 欄位標題（若舊表缺少）
  if (nameIdx === -1) {
    const nextCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, nextCol).setValue("name");
    SpreadsheetApp.flush();
    headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    nameIdx = nextCol - 1;
  }

  // 自動補齊 line_user_id 欄位標題（若舊表缺少）
  if (lineIdx === -1) {
    const nextCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, nextCol).setValue("line_user_id");
    SpreadsheetApp.flush();
    headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    lineIdx = nextCol - 1;
  }

  const targetId = String(data.userId || data.username || '').trim();
  let foundRow = -1;
  for (let i = 1; i < values.length; i++) {
    const rowId = idIdx !== -1 ? String(values[i][idIdx] || '').trim() : '';
    const rowUser = userIdx !== -1 ? String(values[i][userIdx] || '').trim() : '';
    if ((rowId && rowId === targetId) || (rowUser && rowUser === targetId)) {
      foundRow = i + 1;
      break;
    }
  }

  if (data.actionType === 'CREATE') {
    if (foundRow !== -1) {
      return { success: false, error: "該帳號或工號已存在，無法重複建立" };
    }
    const salt = Utilities.getUuid().substring(0, 8);
    const hash = hashPassword(data.password, salt);

    // 動態根據表頭欄位填值，避免欄位順序不同產生錯位
    const colCount = Math.max(headers.length, 8);
    const newRow = new Array(colCount).fill('');
    if (idIdx !== -1) newRow[idIdx] = targetId;
    if (userIdx !== -1) newRow[userIdx] = data.username || targetId;
    if (nameIdx !== -1) newRow[nameIdx] = data.name || targetId;
    if (hashIdx !== -1) newRow[hashIdx] = hash;
    if (saltIdx !== -1) newRow[saltIdx] = salt;
    if (roleIdx !== -1) newRow[roleIdx] = data.role || 'staff';
    if (statusIdx !== -1) newRow[statusIdx] = data.status || 'ACTIVE';
    if (lineIdx !== -1) newRow[lineIdx] = data.line_user_id || data.lineUserId || '';

    sheet.appendRow(newRow);
    SpreadsheetApp.flush();
    invalidateLineCaches({ users: true });
    return { success: true };
  }

  if (foundRow === -1) {
    return { success: false, error: "查無此使用者" };
  }

  if (data.actionType === 'UPDATE_ROLE' && roleIdx !== -1) {
    sheet.getRange(foundRow, roleIdx + 1).setValue(data.role);
  } else if (data.actionType === 'TOGGLE_STATUS' && statusIdx !== -1) {
    sheet.getRange(foundRow, statusIdx + 1).setValue(data.status);
  } else if (data.actionType === 'UPDATE_LINE_ID' && lineIdx !== -1) {
    const newLineId = String(data.line_user_id !== undefined ? data.line_user_id : (data.lineUserId || '')).trim();
    sheet.getRange(foundRow, lineIdx + 1).setValue(newLineId);
  } else if (data.actionType === 'RESET_PASSWORD' && hashIdx !== -1 && saltIdx !== -1) {
    const salt = Utilities.getUuid().substring(0, 8);
    const hash = hashPassword(data.newPassword, salt);
    sheet.getRange(foundRow, hashIdx + 1).setValue(hash);
    sheet.getRange(foundRow, saltIdx + 1).setValue(salt);
  }

  SpreadsheetApp.flush();
  invalidateLineCaches({ users: true });
  return { success: true };
}

/**
 * 司機/同仁自助綁定：將 LINE User ID 關聯至 Users 試算表對應工號
 */
function handleLineSelfBind(lineUserId, staffUserId) {
  if (!lineUserId || !staffUserId) {
    return { success: false, error: "缺少必要參數" };
  }

  const sheet = SS.getSheetByName("Users") || SS.getSheetByName("USERS") || SS.getSheetByName("使用者");
  if (!sheet || sheet.getLastRow() <= 1) {
    return { success: false, error: "系統尚未建立使用者名單資料表" };
  }

  let values = sheet.getDataRange().getValues();
  let headers = values[0];
  let idIdx = findHeaderIndex(headers, ["user_id", "userid", "id", "使用者id", "工號", "編號", "代號"]);
  let userIdx = findHeaderIndex(headers, ["username", "user", "帳號", "登入帳號", "使用者名稱"]);
  let nameIdx = findHeaderIndex(headers, ["name", "display_name", "displayname", "姓名", "同仁姓名"]);
  let lineIdx = findHeaderIndex(headers, ["line_user_id", "lineuserid", "line_id", "lineid", "line綁定id", "line"]);

  // 若尚無 line_user_id 欄位，自動擴充
  if (lineIdx === -1) {
    const nextCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, nextCol).setValue("line_user_id");
    SpreadsheetApp.flush();
    headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    lineIdx = nextCol - 1;
  }

  const targetNorm = String(staffUserId).trim().toLowerCase();
  let foundRow = -1;
  let staffName = '';

  for (let i = 1; i < values.length; i++) {
    const rowId = idIdx !== -1 ? String(values[i][idIdx] || '').trim().toLowerCase() : '';
    const rowUser = userIdx !== -1 ? String(values[i][userIdx] || '').trim().toLowerCase() : '';
    const rowName = nameIdx !== -1 ? String(values[i][nameIdx] || '').trim().toLowerCase() : '';

    if (rowId === targetNorm || rowUser === targetNorm || rowName === targetNorm) {
      foundRow = i + 1;
      staffName = nameIdx !== -1 ? String(values[i][nameIdx] || '').trim() : String(values[i][idIdx] || '');
      break;
    }
  }

  if (foundRow === -1) {
    return { success: false, error: "查無此工號或帳號：" + staffUserId };
  }

  sheet.getRange(foundRow, lineIdx + 1).setValue(String(lineUserId).trim());
  SpreadsheetApp.flush();
  invalidateLineCaches({ users: true });
  return { success: true, staffName: staffName || staffUserId };
}

/**
 * 取得指定同仁的 LINE User ID
 */
function getStaffLineId(staffUserId) {
  if (!staffUserId) return null;
  const sheet = SS.getSheetByName("Users") || SS.getSheetByName("USERS") || SS.getSheetByName("使用者");
  if (!sheet || sheet.getLastRow() <= 1) return null;

  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idIdx = findHeaderIndex(headers, ["user_id", "userid", "id", "使用者id", "工號", "編號", "代號"]);
  const userIdx = findHeaderIndex(headers, ["username", "user", "帳號", "登入帳號", "使用者名稱"]);
  const lineIdx = findHeaderIndex(headers, ["line_user_id", "lineuserid", "line_id", "lineid", "line綁定id", "line"]);
  if (lineIdx === -1) return null;

  const targetNorm = String(staffUserId).trim().toLowerCase();
  for (let i = 1; i < values.length; i++) {
    const rowId = idIdx !== -1 ? String(values[i][idIdx] || '').trim().toLowerCase() : '';
    const rowUser = userIdx !== -1 ? String(values[i][userIdx] || '').trim().toLowerCase() : '';
    if (rowId === targetNorm || rowUser === targetNorm) {
      const lid = String(values[i][lineIdx] || '').trim();
      return lid || null;
    }
  }
  return null;
}

/**
 * 取得 LINE Channel Access Token
 */
function getLineMessagingToken() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty("LINE_CHANNEL_ACCESS_TOKEN") || props.getProperty("lineChannelToken") || "";
  if (!token) {
    const settingsStr = props.getProperty("LINE_SETTINGS");
    if (settingsStr) {
      try {
        const s = JSON.parse(settingsStr);
        token = s.lineChannelToken || "";
      } catch (e) {}
    }
  }
  if (!token) {
    try {
      const configSheet = getConfigSheet();
      if (configSheet) {
        const appSettingsStr = getSystemConfig(configSheet, "AppSettings");
        if (appSettingsStr) {
          try {
            const appSettings = JSON.parse(appSettingsStr);
            token = appSettings.lineChannelToken || "";
          } catch (e) {}
        }
        if (!token) {
          token = getSystemConfig(configSheet, "LineChannelToken") || getSystemConfig(configSheet, "LINE_CHANNEL_ACCESS_TOKEN") || "";
        }
      }
    } catch (e) {}
  }
  return token;
}

/**
 * 一鍵建立並部署 LINE 聊天室底部固定圖文選單 (Rich Menu 2500x1686，滿版莫蘭迪 5 格大按鈕)
 */
function handleSetupLineRichMenu(data, currentUser) {
  const role = currentUser ? String(currentUser.role || '').toLowerCase() : '';
  if (role !== 'admin' && role !== 'manager') {
    return { success: false, error: "FORBIDDEN: 僅管理員或領班可設定 LINE 底部圖文選單" };
  }

  const token = String((data && data.lineChannelToken) || getLineMessagingToken() || '').trim();
  if (!token) {
    return { success: false, error: "系統尚未設定 LINE Channel Access Token，請先於上方欄位填入並儲存" };
  }

  let liffId = data && data.liffId !== undefined ? String(data.liffId || '').trim() : '';
  if (data && data.liffId !== undefined) {
    try {
      saveSettings({ lineLiffId: liffId });
    } catch (e) {}
  } else {
    try {
      const settingsStr = getSystemConfig(getConfigSheet(), "AppSettings");
      if (settingsStr) {
        const settings = JSON.parse(settingsStr) || {};
        liffId = String(settings.lineLiffId || '').trim();
      }
    } catch (e) {}
  }

  let base64Raw = String((data && data.imageBase64) || '').trim();
  if (!base64Raw) {
    return { success: false, error: "缺少圖文選單圖片資料 (imageBase64)" };
  }
  base64Raw = base64Raw.replace(/^data:image\/\w+;base64,/, '');

  try {
    // 1. 清理先前由本系統建立的舊 Rich Menu，避免帳號上限堆積
    const listRes = UrlFetchApp.fetch("https://api.line.me/v2/bot/richmenu/list", {
      method: "get",
      headers: { "Authorization": "Bearer " + token },
      muteHttpExceptions: true
    });
    if (listRes.getResponseCode() === 200) {
      const listJson = JSON.parse(listRes.getContentText() || "{}");
      const oldMenus = Array.isArray(listJson.richmenus) ? listJson.richmenus : [];
      oldMenus.forEach(m => {
        if (m && m.richMenuId && m.name === "ERP_CONTROL_PANEL_V1") {
          UrlFetchApp.fetch(`https://api.line.me/v2/bot/richmenu/${m.richMenuId}`, {
            method: "delete",
            headers: { "Authorization": "Bearer " + token },
            muteHttpExceptions: true
          });
        }
      });
    }

    const useLiffHybrid = !!liffId;
    const buildLiffUri = (quickKey, actionKey) =>
      `https://liff.line.me/${encodeURIComponent(liffId)}?quick=${quickKey}&action=${actionKey}&liffId=${encodeURIComponent(liffId)}`;

    // 2. 建立新 Rich Menu 結構 (2500 x 1686 滿版大尺寸：上排 2 大格 + 下排 3 格共 5 個按鈕)
    // 高頻「新增訂單、更改狀態」放上排寬版；修改、公休、刪除放下一排
    const menuDef = {
      size: { width: 2500, height: 1686 },
      selected: true,
      name: "ERP_CONTROL_PANEL_V1",
      chatBarText: useLiffHybrid ? "⚡ 快速操作面板" : "🎛️ 系統快捷操作選單",
      areas: [
        {
          bounds: { x: 0, y: 0, width: 1250, height: 843 },
          action: useLiffHybrid
            ? { type: "uri", label: "新增訂單", uri: buildLiffUri("orders", "create") }
            : { type: "postback", label: "今日訂單", data: "cmd=W_TODAY", displayText: "📋 查看今日訂單" }
        },
        {
          bounds: { x: 1250, y: 0, width: 1250, height: 843 },
          action: useLiffHybrid
            ? { type: "uri", label: "更改狀態", uri: buildLiffUri("orders", "status") }
            : { type: "postback", label: "更改狀態", data: "cmd=W_START&op=S&day=T&p=0", displayText: "📊 更改訂單狀態" }
        },
        {
          bounds: { x: 0, y: 843, width: 833, height: 843 },
          action: useLiffHybrid
            ? { type: "uri", label: "修改訂單", uri: buildLiffUri("orders", "edit") }
            : { type: "postback", label: "修改訂單", data: "cmd=W_START&op=U&day=T&p=0", displayText: "✏️ 修改訂單" }
        },
        {
          bounds: { x: 833, y: 843, width: 834, height: 843 },
          action: useLiffHybrid
            ? { type: "uri", label: "設定公休", uri: buildLiffUri("holiday", "holiday") }
            : { type: "postback", label: "設定公休", data: "cmd=W_START&op=H&p=0", displayText: "🏖️ 設定店家公休" }
        },
        {
          bounds: { x: 1667, y: 843, width: 833, height: 843 },
          action: useLiffHybrid
            ? { type: "uri", label: "刪除訂單", uri: buildLiffUri("orders", "delete") }
            : { type: "postback", label: "刪除訂單", data: "cmd=W_START&op=D&day=T&p=0", displayText: "🗑️ 刪除訂單" }
        }
      ]
    };

    const createRes = UrlFetchApp.fetch("https://api.line.me/v2/bot/richmenu", {
      method: "post",
      contentType: "application/json",
      headers: { "Authorization": "Bearer " + token },
      payload: JSON.stringify(menuDef),
      muteHttpExceptions: true
    });
    if (createRes.getResponseCode() !== 200) {
      return { success: false, error: `建立 Rich Menu 失敗 (${createRes.getResponseCode()}): ${createRes.getContentText()}` };
    }
    const richMenuId = JSON.parse(createRes.getContentText()).richMenuId;

    // 3. 上傳 PNG 圖片至 LINE Data API
    const imgBytes = Utilities.base64Decode(base64Raw);
    const imgBlob = Utilities.newBlob(imgBytes, "image/png", "richmenu.png");
    const uploadRes = UrlFetchApp.fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
      method: "post",
      contentType: "image/png",
      headers: { "Authorization": "Bearer " + token },
      payload: imgBlob,
      muteHttpExceptions: true
    });
    if (uploadRes.getResponseCode() !== 200) {
      return { success: false, error: `上傳圖文選單圖片失敗 (${uploadRes.getResponseCode()}): ${uploadRes.getContentText()}` };
    }

    // 4. 設為所有聊天室預設圖文選單
    const defaultRes = UrlFetchApp.fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
      method: "post",
      headers: { "Authorization": "Bearer " + token },
      muteHttpExceptions: true
    });
    if (defaultRes.getResponseCode() !== 200) {
      return { success: false, error: `啟用預設選單失敗 (${defaultRes.getResponseCode()}): ${defaultRes.getContentText()}` };
    }

    return {
      success: true,
      richMenuId: richMenuId,
      mode: useLiffHybrid ? "liff_hybrid" : "postback",
      message: useLiffHybrid
        ? "LINE 5 格 LIFF 極速大按鈕選單（上 2 大格 ＋ 下 3 格）部署成功！請重開 LINE 聊天室生效。"
        : "LINE 聊天室底部圖文選單（5 格純對話指令版）已成功部署並對全員啟用！請重新開啟 LINE 聊天室即可看到快捷按鈕。"
    };
  } catch (err) {
    return { success: false, error: "部署 Rich Menu 發生異常: " + (err.message || String(err)) };
  }
}

/**
 * 測試發送 LINE 訊息給特定同仁
 */
function handleTestLineMessage(data, currentUser) {
  const lineUserId = String(data.lineUserId || data.line_user_id || '').trim();
  if (!lineUserId) {
    return { success: false, error: "未提供 LINE User ID" };
  }

  const token = getLineMessagingToken();
  if (!token) {
    return { success: false, error: "系統未設定 LINE Channel Access Token，請先在 LINE 設定頁配置金鑰" };
  }

  const endpoint = "https://api.line.me/v2/bot/message/push";
  const payload = {
    to: lineUserId,
    messages: [{
      type: "text",
      text: "🔔【麵廠職人：LINE 派工通知測試】\n連線成功！您的帳號已順利與系統綁定，日後訂單配送明細將由此專屬頻道即時發送給您。"
    }]
  };

  try {
    const res = UrlFetchApp.fetch(endpoint, {
      method: "post",
      contentType: "application/json",
      headers: { "Authorization": "Bearer " + token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      return { success: true, message: "測試訊息已成功送達同仁 LINE！" };
    } else {
      return { success: false, error: `LINE API 回傳錯誤 (${res.getResponseCode()}): ${res.getContentText()}` };
    }
  } catch (err) {
    return { success: false, error: "連線至 LINE 失敗: " + err.toString() };
  }
}

/**
 * 建置司機派工 Flex Bubble 卡片（內含「✅ 我已送達」一鍵按鈕）
 */
function buildDispatchFlexBubble(info) {
  const staffName = String(info.staffName || '司機同仁');
  const customerName = String(info.customerName || '未註記店家');
  const deliveryDate = String(info.deliveryDate || '今日');
  const deliveryTime = info.deliveryTime ? ` (${info.deliveryTime})` : '';
  const itemSummary = String(info.itemSummary || '依出貨單據');
  const note = info.note ? String(info.note) : '';
  const orderId = String(info.orderId || '').trim();

  const bodyContents = [
    {
      type: "box",
      layout: "baseline",
      spacing: "sm",
      contents: [
        { type: "text", text: "配送客戶", color: "#64748B", size: "sm", flex: 2 },
        { type: "text", text: customerName, weight: "bold", color: "#0F172A", size: "md", flex: 5, wrap: true }
      ]
    },
    {
      type: "box",
      layout: "baseline",
      spacing: "sm",
      margin: "sm",
      contents: [
        { type: "text", text: "負責同仁", color: "#64748B", size: "sm", flex: 2 },
        { type: "text", text: staffName, color: "#334155", size: "sm", flex: 5, wrap: true }
      ]
    },
    {
      type: "box",
      layout: "baseline",
      spacing: "sm",
      margin: "sm",
      contents: [
        { type: "text", text: "配送時段", color: "#64748B", size: "sm", flex: 2 },
        { type: "text", text: `${deliveryDate}${deliveryTime}`, color: "#334155", size: "sm", flex: 5, wrap: true }
      ]
    },
    { type: "separator", margin: "md" },
    { type: "text", text: "品項內容", color: "#64748B", size: "xs", margin: "md" },
    { type: "text", text: itemSummary, color: "#1E293B", size: "sm", margin: "xs", wrap: true }
  ];

  if (note) {
    bodyContents.push(
      { type: "text", text: "備註提醒", color: "#B45309", size: "xs", margin: "md" },
      { type: "text", text: note, color: "#92400E", size: "sm", margin: "xs", wrap: true }
    );
  }

  const bubble = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#1E293B",
      paddingAll: "14px",
      contents: [
        {
          type: "text",
          text: "🚚 麵廠訂單派工通知",
          weight: "bold",
          color: "#FFFFFF",
          size: "md"
        }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "16px",
      contents: bodyContents
    }
  };

  if (orderId) {
    bubble.footer = {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "12px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#10B981",
          height: "sm",
          action: {
            type: "postback",
            label: "✅ 我已送達",
            data: `cmd=DELIVERED&orderId=${encodeURIComponent(orderId)}`,
            displayText: `✅ 我已送達：${customerName}`
          }
        }
      ]
    };
  }

  return bubble;
}

/**
 * 針對特定同仁推播訂單配送明細（支援單筆 Flex 卡片或批次 Carousel，附「✅ 我已送達」一鍵按鈕）
 */
function handleSendStaffDispatchNotification(data, currentUser) {
  const staffUserId = String(data.staffUserId || data.targetUserId || '').trim();
  if (!staffUserId) {
    return { success: false, error: "未指定指派人員" };
  }

  const lineUserId = getStaffLineId(staffUserId);
  if (!lineUserId) {
    return { success: false, reason: "NOT_BOUND", error: `同仁（${staffUserId}）尚未綁定 LINE ID，未發送推播` };
  }

  const token = getLineMessagingToken();
  if (!token) {
    return { success: false, error: "系統未設定 LINE Channel Token" };
  }

  const staffName = data.staffName || staffUserId;
  const singleOrderId = String(data.orderId || data.id || '').trim();
  const ordersList = Array.isArray(data.orders) ? data.orders.filter(o => o && o.orderId) : [];

  let messagesToSend = [];

  if (ordersList.length > 1) {
    // 批次彙整：拆分為每組最多 10 張 Bubble 的 Flex Carousel，每家客戶各自帶「✅ 我已送達」按鈕
    for (let i = 0; i < ordersList.length && messagesToSend.length < 5; i += 10) {
      const chunk = ordersList.slice(i, i + 10);
      const bubbles = chunk.map(o => buildDispatchFlexBubble({
        orderId: o.orderId,
        staffName: staffName,
        customerName: o.customerName,
        deliveryDate: o.deliveryDate || data.deliveryDate || '今日',
        deliveryTime: o.deliveryTime || '',
        itemSummary: o.itemSummary || '依出貨單據',
        note: o.note || ''
      }));
      messagesToSend.push({
        type: "flex",
        altText: `🚚 麵廠派工通知（共 ${ordersList.length} 筆）`,
        contents: {
          type: "carousel",
          contents: bubbles
        }
      });
    }
  } else if (singleOrderId || (ordersList.length === 1 && ordersList[0].orderId)) {
    const targetInfo = ordersList.length === 1 ? ordersList[0] : data;
    const bubble = buildDispatchFlexBubble({
      orderId: singleOrderId || targetInfo.orderId,
      staffName: staffName,
      customerName: targetInfo.customerName || data.customerName || '未註記店家',
      deliveryDate: targetInfo.deliveryDate || data.deliveryDate || '今日',
      deliveryTime: targetInfo.deliveryTime || data.deliveryTime || '',
      itemSummary: targetInfo.itemSummary || data.itemSummary || data.itemsText || '依出貨單據',
      note: targetInfo.note !== undefined ? targetInfo.note : (data.note || '')
    });
    messagesToSend.push({
      type: "flex",
      altText: `🚚 派工通知：${targetInfo.customerName || data.customerName || '配送訂單'}`,
      contents: bubble
    });
  } else {
    // 若呼叫端未傳入 orderId，維持純文字相容格式
    const customerName = data.customerName || '未註記店家';
    const deliveryDate = data.deliveryDate || '今日';
    const deliveryTime = data.deliveryTime ? ` (${data.deliveryTime})` : '';
    const itemSummary = data.itemSummary || data.itemsText || '依出貨單據';
    const note = data.note ? `\n備註：${data.note}` : '';

    const msgText = `🚚【麵廠訂單派工通知】\n` +
                    `━━━━━━━━━━━━━━\n` +
                    `負責同仁：${staffName}\n` +
                    `配送客戶：${customerName}\n` +
                    `配送時段：${deliveryDate}${deliveryTime}\n` +
                    `品項內容：\n${itemSummary}${note}\n` +
                    `━━━━━━━━━━━━━━\n` +
                    `請同仁確認出貨車次與準時送達，感謝辛勞！`;
    messagesToSend.push({ type: "text", text: msgText });
  }

  try {
    const res = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
      method: "post",
      contentType: "application/json",
      headers: { "Authorization": "Bearer " + token },
      payload: JSON.stringify({
        to: lineUserId,
        messages: messagesToSend
      }),
      muteHttpExceptions: true
    });

    if (res.getResponseCode() === 200) {
      return { success: true, message: `已成功將配送明細推播至 ${staffName} 的 LINE` };
    } else {
      return { success: false, error: `推播失敗 (${res.getResponseCode()}): ${res.getContentText()}` };
    }
  } catch (err) {
    return { success: false, error: "推播連線異常: " + err.toString() };
  }
}

function handleSavePermissionMatrix(data, currentUser) {
  const role = currentUser ? String(currentUser.role || '').toLowerCase() : '';
  if (role !== 'admin') {
    return { success: false, error: "FORBIDDEN: 僅管理員可變更權限矩陣" };
  }
  const props = PropertiesService.getScriptProperties();
  props.setProperty("APP_ROLE_PERMISSIONS", JSON.stringify(data.matrix || {}));
  return { success: true };
}

// ==========================================
// 系統排程設定
// ==========================================
function setupDailyTriggers() {
  const functionName = 'generateTomorrowDefaultOrders';
  
  // 1. 清除所有舊的自動建單觸發器，確保不會重複觸發 (也一併清掉因為重試產生的 after 觸發器)
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // 2. 寫死冷門時段：設定每天凌晨 03:00 左右執行
  ScriptApp.newTrigger(functionName)
    .timeBased()
    .everyDays(1)
    .inTimezone(SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Asia/Taipei")
    .atHour(3) // 代表 03:00 ~ 04:00 之間
    .create();

  console.log("✅ 觸發器已更新：每天凌晨 03:00 - 04:00 執行");
}

function setupNotificationTrigger() {
  const functionName = 'checkReminders';
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(functionName)
    .timeBased()
    .everyHours(1)
    .create();

  console.log("✅ 提醒排程觸發器已建立：每小時自動執行一次 checkReminders（檢查提醒規則與出車簡報）");
}

// ==========================================
// 🛠️ 測試專區：測試 Gemini AI 與 LINE 查詢功能
// ==========================================

/**
 * 🧪 測試 1：測試 Gemini API 連線與意圖解析 (含詳細診斷)
 * 請在 Apps Script 頂部選取此函式「testGeminiConnection」並點擊「執行」
 */
function testGeminiConnection() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = getConfigSheet();
  const rawKey = getSystemConfig(configSheet, "GeminiApiKey");
  const todayStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd");
  
  console.log("🔍 [診斷 1] 讀取 Config 工作表：", configSheet.getName());
  console.log("🔍 [診斷 2] 讀取到的 GeminiApiKey 長度：", rawKey ? rawKey.length : 0);
  if (rawKey) {
    console.log("🔍 [診斷 3] 金鑰開頭與結尾：", rawKey.substring(0, 6) + "..." + rawKey.substring(rawKey.length - 4));
  } else {
    console.error("❌ 錯誤：Config 工作表找不到 GeminiApiKey！請確認 A 欄拼字完全為 'GeminiApiKey'，B 欄填入金鑰。");
    return;
  }

  const testSentences = [
    "誠石送到了嗎？",
    "幫我查一下大埔 5/30 訂了多少",
    "三民店上個月貨款是多少錢",
    "幫我產出誠石5月份的報表PDF"
  ];
  
  console.log("\n🚀 開始向 Google Gemini API 發送請求測試...");
  
  testSentences.forEach((sentence, idx) => {
    console.log(`\n--- 測試 [${idx + 1}]: "${sentence}" ---`);
    const result = parseQueryIntentWithGemini(sentence, todayStr);
    if (result) {
      console.log("✅ Gemini AI 解析成功！", JSON.stringify(result));
    } else {
      console.error("❌ Gemini AI 解析失敗。請看上方記錄中的 HTTP 錯誤代碼或回傳訊息。");
    }
  });
}

/**
 * 🧪 測試 2：直接模擬 LINE 收到訊息後的完整回答
 * 請在 Apps Script 頂部選取此函式「testLineBotQuery」並點擊「執行」
 */
function testLineBotQuery() {
  const testInput = "誠石去了嗎？"; // 您可以更換成您試算表裡真實存在的店家名稱測試
  console.log(`\n💬 模擬 LINE 使用者傳送：「${testInput}」`);
  
  const reply = processLineOrderQuery(testInput);
  console.log("🤖 系統回覆內容如下：\n" + reply);
}

/**
 * 🔑 授權啟用函式：點擊執行此函式以彈出 Google 雲端硬碟權限授權視窗
 * （只需執行一次即可永久授權 DriveApp 存取權限）
 */
function authorizeDriveAppPermission() {
  console.log("正在驗證 Google Drive 存取權限...");
  const root = DriveApp.getRootFolder();
  console.log("✅ Google Drive 權限已成功授權！根目錄名稱：" + root.getName());
}

/**
 * 🛠️ Orders 欄位結構自動整理函式：
 * 1. 刪除重複的「狀態」欄（位於 S 欄，保留原本 I 欄的狀態）
 * 2. 移除多餘的第 16 欄（P 欄空欄或舊欄位）
 * 3. 確保「單價」落在 P1（第 16 欄），「小計」落在 Q1（第 17 欄）
 * 4. 自動清空快取避免舊結構影響
 * 
 * 使用方式：在 Apps Script 頂部函式選單選取「cleanupOrdersColumns」並點擊「執行」即可。
 */
function cleanupOrdersColumns() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Orders") || ss.getSheetByName("ORDERS");
  if (!sheet) {
    throw new Error("找不到 Orders 工作表！");
  }

  const lastCol = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  if (lastCol === 0 || lastRow === 0) {
    console.log("工作表為空，無需整理。");
    return;
  }

  console.log("--- 開始執行 Orders 欄位整理 ---");
  const initialHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || "").trim());
  console.log("整理前欄位標題:", JSON.stringify(initialHeaders));

  // 步驟 1：由右往左檢查並刪除重複的「狀態」欄位（確保保留第 9 欄/I 欄的原始狀態）
  let statusCount = 0;
  for (let i = 0; i < initialHeaders.length; i++) {
    const h = initialHeaders[i];
    if (h === "狀態" || h.toLowerCase() === "status") {
      statusCount++;
    }
  }

  if (statusCount > 1) {
    // 從最後一欄往前找多出來的狀態欄進行刪除
    for (let c = sheet.getLastColumn(); c >= 10; c--) {
      const headerVal = String(sheet.getRange(1, c).getValue() || "").trim();
      if (headerVal === "狀態" || headerVal.toLowerCase() === "status") {
        console.log(`發現重複狀態欄位位於第 ${c} 欄，正在刪除...`);
        sheet.deleteColumn(c);
        break; // 刪除最後一個重複的狀態欄
      }
    }
  }

  // 步驟 2：檢查第 16 欄 (P 欄)
  // 重新取得表頭
  const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h || "").trim());
  const col16Val = currentHeaders[15] || ""; // 0-based 15 = 第 16 欄 (P 欄)
  
  if (col16Val !== "單價" && col16Val !== "UnitPrice") {
    console.log(`第 16 欄 (P 欄) 目前為「${col16Val}」，並非「單價」，正在刪除第 16 欄以讓後續欄位左移...`);
    sheet.deleteColumn(16);
  }

  // 步驟 3：確保表頭標籤正確寫入「單價」與「小計」
  sheet.getRange(1, 16).setValue("單價");
  sheet.getRange(1, 17).setValue("小計");

  SpreadsheetApp.flush();

  const finalHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h || "").trim());
  console.log("整理後欄位標題:", JSON.stringify(finalHeaders));

  // 步驟 4：清除暫存快取
  try {
    CacheService.getScriptCache().remove("APP_CACHE_CPT");
    console.log("快取已清除。");
  } catch (e) {
    console.warn("快取清除提示:", e);
  }

  console.log("🎉 Orders 工作表整理成功！P1 = 單價，Q1 = 小計，多餘狀態欄已移除。");
}

function handleBatchDeleteOrders(data, user) {
  // 1. RBAC 權限防護：僅允許 admin 或 manager 執行批次清理
  const role = user ? String(user.role || '').toLowerCase() : '';
  if (role !== 'admin' && role !== 'manager') {
    return { success: false, error: "FORBIDDEN: 僅管理員具備批次清理訂單權限" };
  }

  const orderIds = Array.isArray(data.orderIds) 
    ? data.orderIds.map(id => String(id).trim()).filter(Boolean)
    : [];

  if (orderIds.length === 0) {
    return { success: false, error: "未提供欲刪除之訂單 ID 列表" };
  }

  const targetIdSet = new Set(orderIds);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    const sheet = getSheets().ORDERS;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return { success: true, deletedCount: 0, message: "無訂單資料可供清理" };
    }

    const headerMap = ensureHeadersBatch(sheet, ["LastUpdated", "Version", "Status"]);
    const statusColIdx = headerMap["Status"] !== undefined ? headerMap["Status"] : (headerMap["狀態"] !== undefined ? headerMap["狀態"] : 8);
    const lastUpdatedColIdx = headerMap["LastUpdated"];
    const versionColIdx = headerMap["Version"];
    const values = sheet.getDataRange().getValues();

    const headers = values[0];
    const dataRows = values.slice(1);
    const idIdx = 1; // Col 2 (B欄) 通常為 Order ID

    const deletedOrdersBackup = [];
    let updatedCount = 0;
    const nowTs = String(new Date().getTime());

    // 軟刪除：將符合條件的訂單標記為 DELETED，更新版本號與時間戳
    for (let i = 0; i < dataRows.length; i++) {
      const rowId = String(dataRows[i][idIdx] || '').trim();
      if (targetIdSet.has(rowId)) {
        deletedOrdersBackup.push({
          id: rowId,
          customer: dataRows[i][2] || '未知客戶',
          date: dataRows[i][0] || '',
          prevStatus: dataRows[i][statusColIdx] || ''
        });

        // 標記狀態為 DELETED
        dataRows[i][8] = 'DELETED';
        if (statusColIdx !== 8 && statusColIdx !== undefined) {
          dataRows[i][statusColIdx] = 'DELETED';
        }
        if (lastUpdatedColIdx !== undefined) {
          dataRows[i][lastUpdatedColIdx] = nowTs;
        }
        if (versionColIdx !== undefined) {
          dataRows[i][versionColIdx] = Number(dataRows[i][versionColIdx] || 0) + 1;
        }
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      safeSetValues(sheet, 2, 1, dataRows);
      invalidateLineCaches({ orders: true });

      // 寫入系統日誌 Audit Log，留下備份以供緊急救回
      writeSystemLog(
        "BATCH_DELETE_ORDERS",
        `批次清理 ${updatedCount} 筆訂單 (執行者: ${user ? (user.name || user.username) : '管理員'})`,
        JSON.stringify({
          operator: user ? (user.name || user.username) : 'admin',
          operatorRole: role,
          deletedCount: updatedCount,
          targetIds: orderIds,
          deletedDetails: deletedOrdersBackup.slice(0, 50) // 保留前 50 筆摘要
        })
      );
    }

    return { 
      success: true, 
      deletedCount: updatedCount,
      message: `已成功批次清理 ${updatedCount} 筆訂單` 
    };
  } catch (err) {
    console.error("Batch delete error:", err);
    return { success: false, error: err.message || "批次刪除失敗" };
  } finally {
    lock.releaseLock();
  }
}

function encodeFirebaseKey(rawKey) {
  return encodeURIComponent(String(rawKey || '').trim()).replace(/\./g, '%2E');
}

function buildUsersByLineIdMirror() {
  const sheet = SS.getSheetByName("Users") || SS.getSheetByName("USERS") || SS.getSheetByName("使用者");
  if (!sheet || sheet.getLastRow() <= 1) return {};
  const rows = readSheetRowsFast(SS, sheet, 0);
  if (!rows || rows.length === 0) return {};

  const headers = Object.keys(rows[0]);
  const idKey = headers.find(h => findHeaderIndex([h], ["user_id", "userid", "id", "使用者id", "工號", "編號", "代號"]) === 0);
  const userKey = headers.find(h => findHeaderIndex([h], ["username", "user", "帳號", "登入帳號", "使用者名稱"]) === 0);
  const nameKey = headers.find(h => findHeaderIndex([h], ["name", "display_name", "displayname", "姓名", "顯示姓名", "同仁姓名", "員工姓名"]) === 0);
  const roleKey = headers.find(h => findHeaderIndex([h], ["role", "職位", "角色", "職務", "職級", "職位角色"]) === 0);
  const statusKey = headers.find(h => findHeaderIndex([h], ["status", "狀態", "帳號狀態", "啟用狀態"]) === 0);
  const lineKey = headers.find(h => findHeaderIndex([h], ["line_user_id", "lineuserid", "line_id", "lineid", "line綁定id", "line"]) === 0);
  if (!lineKey) return {};

  const map = {};
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowLineId = String(row[lineKey] || '').trim();
    if (!rowLineId) continue;
    const rawId = idKey ? String(row[idKey] || '').trim() : '';
    const rawUser = userKey ? String(row[userKey] || '').trim() : '';
    const uId = rawId || rawUser;
    const uName = nameKey && String(row[nameKey] || '').trim()
      ? String(row[nameKey]).trim()
      : (rawUser || uId || '同仁');
    const role = roleKey && String(row[roleKey] || '').trim()
      ? String(row[roleKey]).trim().toLowerCase()
      : 'staff';
    const rawStatus = statusKey ? String(row[statusKey] || '').trim().toUpperCase() : 'ACTIVE';
    const isActive = (rawStatus !== 'DISABLED' && rawStatus !== 'FALSE');
    map[encodeFirebaseKey(rowLineId)] = {
      userId: uId,
      username: rawUser || uId,
      name: uName,
      role: role,
      isActive: isActive
    };
  }
  return map;
}

/**
 * 同步 Edge Webhook 所需的輕量即時鏡像到 Firebase RTDB (/edgeMirror)
 * 可綁定 5 分鐘時間觸發器，或於異動後自動呼叫
 */
function syncEdgeMirrorToFirebase(opts) {
  const props = PropertiesService.getScriptProperties();
  const baseUrl = String(props.getProperty("EDGE_FIREBASE_DB_URL") || "https://orderapp-sync-default-rtdb.asia-southeast1.firebasedatabase.app").replace(/\/+$/, "");
  const fbAuth = String(props.getProperty("EDGE_FIREBASE_DB_AUTH") || "").trim();
  const authQuery = fbAuth ? ("?auth=" + encodeURIComponent(fbAuth)) : "";

  const includeUsers = !opts || opts.users !== false;
  const includeCustomers = !opts || opts.customers !== false;
  const includeOrders = !opts || opts.orders !== false;
  const forceFresh = !opts || opts.force !== false;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone() || "Asia/Taipei";
  const todayStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  const yObj = new Date(todayStr + 'T00:00:00'); yObj.setDate(yObj.getDate() - 1);
  const yesterdayStr = Utilities.formatDate(yObj, tz, "yyyy-MM-dd");
  const f7Obj = new Date(todayStr + 'T00:00:00'); f7Obj.setDate(f7Obj.getDate() + 7);
  const plus7Str = Utilities.formatDate(f7Obj, tz, "yyyy-MM-dd");

  const patchBody = {
    updatedAt: new Date().getTime()
  };
  let userCount = 0;
  let customerCount = 0;
  let orderCount = 0;

  if (includeUsers) {
    const usersMap = buildUsersByLineIdMirror();
    userCount = Object.keys(usersMap).length;
    patchBody.usersByLineId = usersMap;
  }

  if (includeCustomers) {
    const custList = getLineCustomersIndex(ss, forceFresh) || [];
    const custMap = {};
    custList.forEach(c => {
      const key = encodeFirebaseKey(c.id || c.name);
      if (!key) return;
      custMap[key] = {
        id: c.id || c.name,
        name: c.name,
        regularOffDays: c.regularOffDays || [],
        offDays: c.offDays || [],
        trip: c.trip || '',
        deliveryTime: c.deliveryTime || '',
        isPaused: !!c.isPaused
      };
    });
    customerCount = Object.keys(custMap).length;
    patchBody.customers = custMap;
  }

  if (includeOrders) {
    const rawIdx = getLineOrdersIndex(ss, forceFresh) || [];
    const groupedOrders = {};
    rawIdx.forEach(r => {
      if (!r || !r.id || !r.deliveryDate) return;
      if (r.deliveryDate < yesterdayStr || r.deliveryDate > plus7Str) return;
      const safeId = encodeFirebaseKey(r.id);
      if (!groupedOrders[safeId]) {
        groupedOrders[safeId] = {
          id: r.id,
          customerName: r.customerName,
          deliveryDate: r.deliveryDate,
          deliveryTime: r.deliveryTime || '',
          status: r.status || 'PENDING',
          trip: r.trip || '',
          assignedTo: r.assignedTo || '',
          assignedName: r.assignedName || '',
          items: []
        };
      }
      groupedOrders[safeId].items.push({
        productName: r.productName,
        quantity: Number(r.quantity) || 0,
        unit: r.unit || '斤'
      });
    });
    orderCount = Object.keys(groupedOrders).length;
    patchBody.activeOrders = groupedOrders;
  }

  const res = UrlFetchApp.fetch(baseUrl + "/edgeMirror.json" + authQuery, {
    method: "patch",
    contentType: "application/json",
    payload: JSON.stringify(patchBody),
    muteHttpExceptions: true
  });

  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error("Firebase edgeMirror 寫入失敗 (HTTP " + res.getResponseCode() + "): " + res.getContentText());
  }

  return {
    success: true,
    updatedAt: patchBody.updatedAt,
    counts: { users: userCount, customers: customerCount, activeOrders: orderCount }
  };
}

// 供 GAS 時間觸發器直接選用的無參數函式
function syncEdgeMirror() {
  return syncEdgeMirrorToFirebase({ force: true });
}

function handleGetEdgeConfigStatus(currentUser) {
  const role = currentUser ? String(currentUser.role || '').toLowerCase() : '';
  if (role !== 'admin' && role !== 'manager') {
    return { success: false, error: "FORBIDDEN: 僅管理員或領班可檢視 Edge Webhook 設定" };
  }
  const props = PropertiesService.getScriptProperties();
  return {
    success: true,
    configured: Boolean(props.getProperty("EDGE_SHARED_SECRET")),
    mirrorEnabled: props.getProperty("EDGE_MIRROR_ENABLED") === "1",
    hasFirebaseAuth: Boolean(props.getProperty("EDGE_FIREBASE_DB_AUTH")),
    firebaseDbUrl: props.getProperty("EDGE_FIREBASE_DB_URL") || "https://orderapp-sync-default-rtdb.asia-southeast1.firebasedatabase.app"
  };
}

function handleSaveEdgeConfig(data, currentUser) {
  const role = currentUser ? String(currentUser.role || '').toLowerCase() : '';
  if (role !== 'admin') {
    return { success: false, error: "FORBIDDEN: 僅最高管理員可修改 Edge Webhook 安全密鑰" };
  }
  const props = PropertiesService.getScriptProperties();
  const secret = String((data && data.edgeSecret) || '').trim();
  const fbAuth = data && data.firebaseDbAuth !== undefined ? String(data.firebaseDbAuth || '').trim() : null;
  const fbUrl = data && data.firebaseDbUrl !== undefined ? String(data.firebaseDbUrl || '').trim() : '';

  if (secret) {
    if (secret.length < 16) {
      return { success: false, error: "Edge Shared Secret 長度建議至少 16 字元" };
    }
    props.setProperty("EDGE_SHARED_SECRET", secret);
  }
  if (fbAuth !== null) {
    if (fbAuth) props.setProperty("EDGE_FIREBASE_DB_AUTH", fbAuth);
    else props.deleteProperty("EDGE_FIREBASE_DB_AUTH");
  }
  if (fbUrl) {
    props.setProperty("EDGE_FIREBASE_DB_URL", fbUrl.replace(/\/+$/, ""));
  }
  props.setProperty("EDGE_MIRROR_ENABLED", "1");

  const mirrorRes = syncEdgeMirrorToFirebase({ force: true });
  writeSystemLog("SAVE_EDGE_CONFIG", "更新 Cloudflare Worker Edge 設定與 Firebase 鏡像", JSON.stringify({
    operator: currentUser ? currentUser.name : 'admin',
    counts: mirrorRes.counts
  }));

  return {
    success: true,
    configured: Boolean(props.getProperty("EDGE_SHARED_SECRET")),
    mirrorEnabled: true,
    counts: mirrorRes.counts,
    message: "Edge Webhook 密鑰已儲存，並已同步 Firebase 即時鏡像資料！"
  };
}

function handleSyncEdgeMirrorAction(currentUser) {
  const role = currentUser ? String(currentUser.role || '').toLowerCase() : '';
  if (role !== 'admin' && role !== 'manager') {
    return { success: false, error: "FORBIDDEN: 僅管理員或領班可手動同步 Edge 鏡像" };
  }
  const props = PropertiesService.getScriptProperties();
  props.setProperty("EDGE_MIRROR_ENABLED", "1");
  const mirrorRes = syncEdgeMirrorToFirebase({ force: true });
  return {
    success: true,
    counts: mirrorRes.counts,
    updatedAt: mirrorRes.updatedAt,
    message: `已同步 Firebase 鏡像（同仁 ${mirrorRes.counts.users} 人、店家 ${mirrorRes.counts.customers} 間、活躍訂單 ${mirrorRes.counts.activeOrders} 筆）`
  };
}

/**
 * 接收來自 Cloudflare Worker Edge Server 的已驗簽內部請求
 */
function handleEdgeWebhookDispatch(params) {
  const props = PropertiesService.getScriptProperties();
  const expectedSecret = String(props.getProperty("EDGE_SHARED_SECRET") || '').trim();
  const providedSecret = String((params && params.edgeSecret) || (params && params.data && params.data.edgeSecret) || '').trim();

  if (!expectedSecret) {
    return { success: false, error: "EDGE_SECRET_NOT_CONFIGURED" };
  }
  if (!providedSecret || providedSecret !== expectedSecret) {
    writeSystemLog("SYSTEM_UNAUTHORIZED_EDGE", "Edge Webhook 密鑰驗證失敗", JSON.stringify({ providedLen: providedSecret.length }));
    return { success: false, error: "UNAUTHORIZED_EDGE" };
  }

  const data = (params && params.data) || {};
  const op = String(data.op || '').trim().toUpperCase();

  if (op === 'REFRESH_MIRROR') {
    return syncEdgeMirrorToFirebase({ force: true });
  }

  if (op === 'CLEAR_WIZARD') {
    const uid = String(data.lineUserId || '').trim();
    if (uid) {
      const cache = CacheService.getScriptCache();
      cache.remove("LINE_WIZARD_" + uid);
      cache.remove("LINE_PENDING_" + uid);
      cache.remove("LINE_PICK_" + uid);
    }
    return { success: true };
  }

  if (op === 'UPDATE_ORDER_STATUS') {
    const lineUid = String(data.lineUserId || '').trim();
    const orderId = String(data.orderId || '').trim();
    const newStatus = normalizeLineOrderStatus(data.newStatus) || String(data.newStatus || '').trim().toUpperCase();
    const lineUser = getUserByLineId(lineUid);
    if (!lineUser || !lineUser.isActive) {
      return { success: false, error: "帳號未綁定或已停用" };
    }
    const statusRes = updateOrderStatus({ id: orderId, status: newStatus, force: true }, lineUser);
    updateGlobalTimestamp();
    SpreadsheetApp.flush();
    notifyFirebase({ action: 'updateOrderStatus' });
    writeSystemLog(
      data.isUndo ? "LINE_EDGE_UNDO_STATUS" : "LINE_EDGE_UPDATE_STATUS",
      `${(statusRes && statusRes.customerName) || '訂單'} (${orderId})`,
      JSON.stringify({
        operator: lineUser.name,
        role: lineUser.role,
        deliveryDate: statusRes && statusRes.deliveryDate,
        prevStatus: statusRes && statusRes.prevStatus,
        newStatus: newStatus
      })
    );
    return { success: true, orderId: orderId, status: newStatus };
  }

  if (op === 'PROXY_EVENT' && data.event) {
    handleLineWebhook({ events: [data.event] });
    try {
      const text = data.event && data.event.message && data.event.message.text ? String(data.event.message.text).trim() : '';
      if (/^(?:#?綁定|#?bind)\s+/i.test(text)) {
        invalidateLineCaches({ users: true });
        syncEdgeMirrorToFirebase({ force: true, users: true, customers: false, orders: false });
      }
    } catch (e) {}
    return { success: true };
  }

  return { success: false, error: "Unknown edgeWebhookDispatch op: " + op };
}



