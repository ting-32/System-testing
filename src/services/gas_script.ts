
// @ts-nocheck

const SS = SpreadsheetApp.getActiveSpreadsheet();

let cachedTimeZone = null;

function safeFormatDate(sheetValue, format = "yyyy-MM-dd HH:mm:ss") {
  if (!sheetValue) return '';
  
  if (sheetValue instanceof Date) {
    const tz = (typeof SS !== 'undefined' && SS) ? SS.getSpreadsheetTimeZone() : "Asia/Taipei";
    return Utilities.formatDate(sheetValue, tz, format);
  }
  
  return String(sheetValue).trim();
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
      return;
    }
  }
  // If not found, append to end
  const lastRow = Math.max(sheet.getLastRow(), 1);
  sheet.getRange(lastRow + 1, 1).setValue(keyName);
  sheet.getRange(lastRow + 1, 2).setValue(value);
}

// Helper to get fresh references (avoiding top-level const caching issues)
function getSheets() {
  return {
    ORDERS: SS.getSheetByName("Orders") || SS.insertSheet("Orders"),
    CUSTOMERS: SS.getSheetByName("Customers") || SS.insertSheet("Customers"),
    PRODUCTS: SS.getSheetByName("Products") || SS.insertSheet("Products"),
    TRIPS: SS.getSheetByName("Trips") || SS.insertSheet("Trips"),
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
    const data = getData(startDateStr, since);
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
    
    // 【核心防護】除了 login 以外的所有操作，全部要驗證 Token (使用伺服器獨立 256-bit 高強度密鑰)
    if (action !== "login") {
      const tokenPayload = verifyTokenAndGetPayload(params.token);
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
      
      const userRole = tokenPayload.role;
      const adminOnlyActions = ["saveSettings", "deleteOrder", "deleteCustomer", "deleteProduct", "changePassword", "getSystemLogs"];

      // 【核心防護】如果是員工，且企圖執行老闆專屬功能
      if (userRole === "staff" && adminOnlyActions.includes(action)) {
        writeSystemLog("SYSTEM_FORBIDDEN", "越權操作阻擋", JSON.stringify({ action: action, employee: tokenPayload.name }));
        return ContentService.createTextOutput(JSON.stringify({ 
          success: false, 
          error: "FORBIDDEN_ACTION" 
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    let result = null;

    switch (action) {
      case "login":
        result = login(params.data);
        break;
      case "changePassword":
        result = changePassword(params.data);
        break;
      case "createOrder":
        result = createOrder(params.data);
        writeSystemLog("CREATE_ORDER", params.data.customerName || "未知", JSON.stringify({ items: params.data.items, payload: params.data }));
        break;
      case "updateOrderContent":
        result = updateOrderContent(params.data);
        writeSystemLog("UPDATE_ORDER", params.data.customerName || "未知", JSON.stringify({ diff: params.data }));
        break;
      case "updateOrderStatus":
        result = updateOrderStatus(params.data);
        break;
      case "batchUpdateOrders":
        result = batchUpdateOrders(params.data);
        break;
      case "batchUpdatePaymentStatus":
        result = batchUpdatePaymentStatus(params.data);
        break;
      case "deleteOrder":
        result = deleteOrder(params.data);
        writeSystemLog("DELETE_ORDER", `Order ID: ${params.data.id || "未知"}`, JSON.stringify({
          deletedId: params.data.id,
          deletedName: params.data.customerName || "未知店家",
          deletedDate: params.data.deliveryDate || ""
        }));
        break;
      case "reorderProducts":
        result = reorderProducts(params.data);
        writeSystemLog("UPDATE_PRODUCT_ORDER", "商品列表", JSON.stringify({ updatedCount: (params.data.products || []).length }));
        break;
      case "updateCustomer":
        result = updateCustomer(params.data);
        writeSystemLog("UPDATE_CUSTOMER", params.data.name || "未知", JSON.stringify({ data: params.data }));
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
        writeSystemLog("UPDATE_PRODUCT", params.data.name || "未知", JSON.stringify({ data: params.data }));
        break;
      case "deleteProduct":
        result = deleteProduct(params.data);
        writeSystemLog("DELETE_PRODUCT", `Product ID: ${params.data.id || "未知"}`, JSON.stringify({
          deletedId: params.data.id,
          deletedName: params.data.name || "未知商品"
        }));
        break;
      case "checkUpdates":
        result = checkUpdates(params.data);
        break;
      case "getOrder":
        result = getOrder(params.data);
        break;
      case "saveTrips":
        result = saveTrips(params.data);
        writeSystemLog("UPDATE_TRIPS", "車趟清單", JSON.stringify({ count: (params.data.trips || []).length }));
        break;
      case "saveSettings":
        result = saveSettings(params.data);
        writeSystemLog("UPDATE_SETTINGS", "APP 設定/提醒規則", JSON.stringify({ data: params.data }));
        break;
      case "testLineMessage":
        result = testLineMessage(params.data);
        writeSystemLog("SYSTEM_TEST_MSG", "LINE Notify", JSON.stringify({ msg: "Triggered test message" }));
        break;
      case "testRule":
        result = checkReminders(params.data.ruleId);
        writeSystemLog("SYSTEM_TEST_RULE", `Rule ID: ${params.data.ruleId}`, JSON.stringify({ action: "testRule" }));
        break;
      case "dryRunRule":
        result = checkReminders(params.data.ruleId, true);
        break;
      case "getNotificationLogs":
        result = getNotificationLogs();
        break;
      case "getSystemLogs":
        result = getSystemLogs(params.data?.limit || 200);
        break;
      case "triggerAutoOrders":
        result = generateTomorrowDefaultOrders(params.data?.dates);
        writeSystemLog("TRIGGER_AUTO_ORDERS", "觸發自動建單", JSON.stringify(result));
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
      "batchUpdateOrders", "batchUpdatePaymentStatus", "deleteOrder",
      "reorderProducts", "updateCustomer", "deleteCustomer", 
      "updateProduct", "deleteProduct", "saveTrips", "saveSettings",
      "triggerAutoOrders"
    ];
    if (mutationActions.includes(action)) {
      updateGlobalTimestamp();
    }

    const unneededNotifyActions = ["login", "checkUpdates", "getOrder", "testLineMessage", "dryRunRule", "getNotificationLogs", "getSystemLogs", "createOrder"];
    if (!unneededNotifyActions.includes(action)) {
      notifyFirebase();
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

function checkUpdates(data) {
  // 新增審計日誌攔截 (只有前端帶 auditObj 時才寫入)
  if (data && data.auditObj) {
    writeSystemLog("SYSTEM_DATA_ACCESS", "資料手動同步與檢視", JSON.stringify({
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
  const inputPassword = String(data.password || "").trim();
  const cache = CacheService.getScriptCache();

  // 1. 取得資料庫密碼進行驗證
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
  // (有心人士惡意輸錯 100 次也絕不會影響正常人上班，根除 DoS 威脅)
  // ==========================================
  if (isCorrect) {
    const failKey = "LOGIN_FAIL_" + encodeURIComponent(dId.slice(0, 60));
    cache.remove(failKey); // 驗證成功，清除該裝置的失敗紀錄

    if (matchedUser) {
      const role = matchedUser.Role || "staff";
      const name = matchedUser.Name || "員工";
      const token = generateToken(dId, role, name);
      writeSystemLog("SYSTEM_LOGIN_SUCCESS", "員工登入", JSON.stringify({ name: name, role: role, deviceId: dId, userAgent: uAgent }));
      return { success: true, token: token, role: role, name: name };
    } else {
      const token = generateToken(dId, "admin", "系統管理員");
      writeSystemLog("SYSTEM_LOGIN_SUCCESS", "系統管理員登入", JSON.stringify({ deviceId: dId, userAgent: uAgent }));
      return { success: true, token: token, role: "admin", name: "系統管理員" };
    }
  }

  // ==========================================
  // 核心原則 2：若密碼錯誤，啟動焦油坑延遲與單機限流
  // ==========================================

  // (A) 單機連續輸錯 5 次鎖定 15 分鐘（防止在別人電腦前亂猜）
  const failKey = "LOGIN_FAIL_" + encodeURIComponent(dId.slice(0, 60));
  const failCount = Number(cache.get(failKey)) || 0;
  const newFailCount = failCount + 1;
  cache.put(failKey, String(newFailCount), 900); // 鎖定/保留 15 分鐘

  // (B) 焦油坑延遲防禦 (Tarpit Delay)：
  // 只要密碼錯誤，強迫後端沉睡 2.5 秒才回應！
  // 徹底截斷自動化爆破腳本速度；若多線程狂發，GAS 並發槽位會在 1 秒內被吃滿，觸發 Google Edge 429 阻斷攻擊者
  Utilities.sleep(2500);

  const remaining = Math.max(0, 5 - newFailCount);
  writeSystemLog("SYSTEM_LOGIN_FAILED", "系統登入失敗", JSON.stringify({ 
    deviceId: dId, 
    userAgent: uAgent, 
    failCount: newFailCount,
    remainingAttempts: remaining
  }));

  const errorMsg = remaining > 0 
    ? `無效的密碼或 PIN 碼 (剩餘嘗試次數: ${remaining})`
    : "密碼錯誤次數過多，該裝置已暫時鎖定 15 分鐘，請稍後再試。";
  return { success: false, error: errorMsg };
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
  const headers = values[0];
  const data = [];
  for (let i = 1; i < values.length; i++) {
    let obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[i][j];
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

function getData(startDateStr, since = 0) {
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
          priceList: c.PriceList || c.priceList || c.價目表JSON || c.價目表,
          offDays: c.OffDays || c.offDays || c.公休日週期JSON || c.公休日週期,
          holidayDates: c.HolidayDates || c.holidayDates || c.特定公休日JSON || c.特定公休日,
          deliveryMethod: c.DeliveryMethod || c.deliveryMethod || c.配送方式,
          paymentTerm: c.PaymentTerm || c.paymentTerm || c.付款週期,
          defaultTrip: c.DefaultTrip || c.defaultTrip || c.預設趟數,
          autoOrderEnabled: String(c.自動建單開關).trim().toLowerCase() === 'true' || c.自動建單開關 === true,
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
        priceList: c.PriceList || c.priceList || c.價目表JSON || c.價目表,
        offDays: c.OffDays || c.offDays || c.公休日週期JSON || c.公休日週期,
        holidayDates: c.HolidayDates || c.holidayDates || c.特定公休日JSON || c.特定公休日,
        deliveryMethod: c.DeliveryMethod || c.deliveryMethod || c.配送方式,
        paymentTerm: c.PaymentTerm || c.paymentTerm || c.付款週期,
        defaultTrip: c.DefaultTrip || c.defaultTrip || c.預設趟數,
        autoOrderEnabled: String(c.自動建單開關).trim().toLowerCase() === 'true' || c.自動建單開關 === true,
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
      trip: o.Trip || o.trip || o.趟次 || ''
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

  // 2. 把目前試算表有效存活的訂單 ID 給提取出來 (只有增量同步需帶這包資料，作爲本地幽靈清掃的依據)
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
    sheet.appendRow(["規則ID", "規則名稱", "檢查週期", "檢查訂單日期", "提醒時間", "是否啟用", "自訂提醒內容", "判斷條件(包含AND/OR等詳細設定)", "LastUpdated"]);
    sheet.getRange(1, 1, 1, 9).setFontWeight("bold");
    sheet.setFrozenRows(1);
  } else {
    // 確保有 LastUpdated 欄位
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (!headers.includes("LastUpdated")) {
      sheet.getRange(1, headers.length + 1).setValue("LastUpdated").setFontWeight("bold");
    }
  }
  return sheet;
}

function saveRemindRulesToSheet(rules) {
  const sheet = getRemindRulesSheet();
  
  // Clear existing content except header
  const lastRow = Math.max(1, sheet.getLastRow()); // ensure we don't crash
  const lastCol = Math.max(9, sheet.getLastColumn());
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  }
  
  if (!rules || rules.length === 0) return;
  
  const currentTs = new Date().getTime();
  
  const dataToRows = rules.map(rule => {
    let row = [
      rule.id || "",
      rule.name || "",
      Array.isArray(rule.schedule) ? rule.schedule.join(',') : (rule.schedule || ""),
      Array.isArray(rule.targetOrderDays) ? rule.targetOrderDays.join(',') : (rule.targetOrderDays || ""),
      rule.timeToNotify ? `'${String(rule.timeToNotify)}` : "",
      rule.isActive === false ? false : true,
      rule.customMessage || "",
      JSON.stringify(rule.conditions || [])
    ];
    // Fill until LastUpdated column
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const lastUpdatedColIdx = headers.indexOf("LastUpdated");
    while (row.length < lastUpdatedColIdx) {
      row.push("");
    }
    row[lastUpdatedColIdx] = currentTs;
    return row;
  });
  
  safeSetValues(sheet, 2, 1, dataToRows);
  sheet.getRange(2, 5, dataToRows.length, 1).setNumberFormat("@");
}

function getRemindRulesFromSheet() {
  const sheet = getRemindRulesSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  
  const values = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  const displayValues = sheet.getRange(2, 1, lastRow - 1, 8).getDisplayValues();
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
    
    rules.push({
      id: String(id),
      name: String(row[1] || ""),
      schedule: row[2] ? String(row[2]).split(',') : [],
      targetOrderDays: row[3] ? String(row[3]).split(',') : [],
      timeToNotify: String(displayRow[4] || "").replace(/^'/, ""), // Use display value for time to avoid Date object issues
      isActive: row[5] === "" ? true : Boolean(row[5]),
      customMessage: String(row[6] || ""),
      conditions: conditions
    });
  }
  
  return rules;
}

function saveSettings(data) {
  const configSheet = getConfigSheet();
  
  // === 【資料分離邏輯說明】 =======================================
  // 目的：避免 Config 分頁的 AppSettings 儲存格因寫入不斷增加的「提醒規則」而導致資料過長或難以維護。
  // 作法：在此扮演「資料攔截」的角色。
  //      若前端傳來的 data 包含 rules 屬性，則將該屬性獨立抽離，
  //      轉交給 saveRemindRulesToSheet() 專屬函數寫入 "RemindRules" 表單。
  //      保存完畢後，使用 delete 刪除該屬性，使得後續寫入 AppSettings 
  //      的 JSON 設定中，只會留下輕量的一般參數 (例如 lineUserId、Token 等)。
  // =============================================================
  if (data.rules !== undefined) {
    saveRemindRulesToSheet(data.rules); 
    delete data.rules; // 抽離：將 rules 從原物件中剔除
  }
  
  // 將「已剔除 rules」的剩餘一般設定覆寫回 Config 分頁
  setSystemConfig(configSheet, "AppSettings", JSON.stringify(data));
  
  // === 強制清除快取 ===
  // 確保背景輪詢時，不會一直抓到被快取的舊設定
  const cache = CacheService.getScriptCache();
  if (cache) {
    cache.remove("APP_CACHE_CPT");
  }
  
  notifyFirebase();
  
  return true;
}

function testLineMessage(data) {
  const channelToken = String(data.lineChannelToken || '').trim();
  const userIdStr = String(data.lineUserId || '').trim();
  
  if (!channelToken || !userIdStr) {
    throw new Error("Missing credentials for LINE API");
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
        messages: [{ type: "text", text: "✅ 這是來自智能訂單系統的測試發送！您的 LINE (多群發送) 串接已成功。" }]
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
        return { lastUpdated: newLastUpdatedTs, version: currentVersion + 1 };
      }
      throw new Error("Order not found: " + targetId);
    }
    
    // FULL UPDATE MODE (包含 items 異動，需要重新產生 rows)
    let originalCreatedAt = "";
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
        row[5] = item.productName || item.productId;
        row[6] = item.quantity;
        row[7] = orderData.note || "";
        row[8] = orderData.status || "PENDING";
        row[9] = orderData.deliveryMethod || "";
        row[10] = item.unit || "斤";
        
        row[lastUpdatedColIdx] = newLastUpdatedTs;
        if (headerMap["Trip"]) row[headerMap["Trip"]] = orderData.trip || "";
        if (headerMap["資料來源"]) row[headerMap["資料來源"]] = orderData.source || "";
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
    
    return { lastUpdated: newLastUpdatedTs, version: currentVersion + 1 };
  } finally {
    lock.releaseLock();
  }
}

function updateOrderStatus(data) {
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
    
    const values = sheet.getDataRange().getValues();
    const targetId = String(data.id).trim();
    const newLastUpdatedTs = String(new Date().getTime());
    let newVersion = 0;
    
    let rowsToUpdate = [];

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][1]).trim() === targetId) {
        const currentVersion = values[i][versionColIdx];
        if (data.version !== undefined && !data.force) {
           checkOrderVersionStrict(currentVersion, data.version);
        }
        newVersion = Number(currentVersion || 0) + 1;
        values[i][statusColIdx] = data.status; 
        values[i][lastUpdatedColIdx] = newLastUpdatedTs;
        values[i][versionColIdx] = newVersion;
        rowsToUpdate.push(i + 1);
      }
    }
    
    if (rowsToUpdate.length > 0) {
      safeSetValues(sheet, 2, 1, values.slice(1));
    } else {
      throw new Error("Order not found: " + targetId);
    }
    
    return { lastUpdated: newLastUpdatedTs, version: newVersion };
  } catch (err) {
    if (err.message && err.message.includes("Timeout")) {
      throw new Error("更新過於頻繁，請稍後重試");
    }
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function batchUpdateOrders(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const sheet = getSheets().ORDERS;
    const headerMap = ensureHeadersBatch(sheet, ["LastUpdated", "Version"]);
    const lastUpdatedColIdx = headerMap["LastUpdated"];
    const versionColIdx = headerMap["Version"];
    const statusColIdx = headerMap["Status"] !== undefined ? headerMap["Status"] : (headerMap["狀態"] !== undefined ? headerMap["狀態"] : 8);
    const values = sheet.getDataRange().getValues();
    const updates = data.updates; // Array of { id: string, status: string, version: number }
    const newLastUpdatedTs = String(new Date().getTime());
    let updatedCount = 0;
    
    // Create a map for fast lookup
    const updateMap = new Map();
    updates.forEach(u => updateMap.set(String(u.id).trim(), u));

    let rowsToUpdate = [];

    for (let i = 1; i < values.length; i++) {
      const rowId = String(values[i][1]).trim();
      if (updateMap.has(rowId)) {
        const updateData = updateMap.get(rowId);
        const currentVersion = values[i][versionColIdx];
        
        if (!updateData.force && updateData.version !== undefined) {
           checkOrderVersionStrict(currentVersion, updateData.version);
        }
        
        const newVersion = Number(currentVersion || 0) + 1;
        values[i][statusColIdx] = updateData.status;
        values[i][lastUpdatedColIdx] = newLastUpdatedTs;
        values[i][versionColIdx] = newVersion;
        rowsToUpdate.push(i + 1);
        updatedCount++;
      }
    }
    
    if (rowsToUpdate.length > 0) {
      safeSetValues(sheet, 2, 1, values.slice(1));
    }
    
    return { updatedCount, newLastUpdatedTs };
  } finally {
    lock.releaseLock();
  }
}

function batchUpdatePaymentStatus(data) {
  const sheet = getSheets().ORDERS;
  const headerMap = ensureHeadersBatch(sheet, ["LastUpdated"]);
  const lastUpdatedColIdx = headerMap["LastUpdated"];
  const statusColIdx = headerMap["Status"] !== undefined ? headerMap["Status"] : (headerMap["狀態"] !== undefined ? headerMap["狀態"] : 8);
  const values = sheet.getDataRange().getValues();
  const orderIds = new Set(data.orderIds.map(id => String(id).trim()));
  const newLastUpdatedTs = String(new Date().getTime());
  
  let modified = false;
  for (let i = 1; i < values.length; i++) {
    const id = String(values[i][1]).trim();
    if (orderIds.has(id)) {
      values[i][statusColIdx] = data.newStatus;
      values[i][lastUpdatedColIdx] = newLastUpdatedTs;
      modified = true;
    }
  }

  if (modified && values.length > 1) {
    safeSetValues(sheet, 2, 1, values.slice(1));
  }
  return true;
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
    const totalCols = sheet.getMaxColumns();
    const values = sheet.getDataRange().getValues();
    const targetId = String(data.id).trim();

    let modified = false;
    let newVersion = 0;
    
    if (!cachedTimeZone) cachedTimeZone = SS.getSpreadsheetTimeZone() || "Asia/Taipei";
    const tsString = Utilities.formatDate(new Date(), cachedTimeZone, "yyyy/MM/dd HH:mm:ss");

    // Conflict check first
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][1]).trim() === targetId) {
        if (!data.force && data.version !== undefined) {
           checkOrderVersionStrict(values[i][versionColIdx], data.version);
        }
      }
    }

    // Update rows
    for (let i = 1; i < values.length; i++) {
      // 匹配 ID 欄位 (通常在 Col 2，也就是 values[i][1])
      if (String(values[i][1]).trim() === targetId) {
        if (!modified) {
          newVersion = Number(values[i][versionColIdx] || 0) + 1;
          modified = true;
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
      }
    }

    if (modified && values.length > 1) {
      safeSetValues(sheet, 2, 1, values.slice(1));
    }
    return true;
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
  newRow[colLast] = newLastUpdatedTs;
  
  // 將動態組裝好的精確列寫入試算表
  if (rowIndex > 0) {
    safeSetRowValues(sheet, rowIndex, newRow);
  } else {
    safeAppendRow(sheet, newRow);
  }
  
  // 立即清除快取並強制落盤，防止後續立即發起同步時讀取到 Google Sheets API 尚未同步的舊快照
  try { CacheService.getScriptCache().remove("APP_CACHE_CPT"); } catch (e) {}
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
  
    const headerMap = ensureHeadersBatch(orderSheet, ["資料來源", "LastUpdated", "Trip", "Status", "狀態"]);
    const sourceColIdx = headerMap["資料來源"];
    const lastUpdatedColIdx = headerMap["LastUpdated"];
    const tripColIdx = headerMap["Trip"];
    
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
      name: c.Name || c.name || c.客戶名稱,
      defaultItems: c.DefaultItems || c.defaultItems || c.預設品項JSON || c.預設品項, 
      offDays: c.OffDays || c.offDays || c.公休日週期JSON || c.公休日週期,
      holidayDates: c.HolidayDates || c.holidayDates || c.特定公休日JSON || c.特定公休日,
      deliveryMethod: c.DeliveryMethod || c.deliveryMethod || c.配送方式,
      deliveryTime: c.DeliveryTime || c.deliveryTime || c.配送時間,
      defaultTrip: c.DefaultTrip || c.defaultTrip || c.預設趟數,
      autoOrderEnabled: String(c.自動建單開關).trim().toLowerCase() === 'true' || c.自動建單開關 === true,
      isPaused: String(c.暫停供貨 || c.isPaused).trim().toLowerCase() === 'true' || c.暫停供貨 === true,
      isArchived: String(c.封存 || c.isArchived).trim().toLowerCase() === 'true' || c.封存 === true,
      priceList: c.PriceList || c.priceList || c.客製化價格JSON || c.客製化價格
    }));

    const products = getSheetData(sheets.PRODUCTS).map(p => ({
      id: p.ID || p.id,
      name: p.Name || p.name || p.品項,
      price: Number(p.Price || p.price || p.預設單價 || p.單價) || 0
    }));
    
    const globalProductMap = new Map();
    products.forEach(p => {
      globalProductMap.set(p.id, { name: p.name, price: p.price });
    });
    
    const newOrderRows = [];
    const timestamp = Utilities.formatDate(new Date(), timeZone, "yyyy/MM/dd HH:mm:ss");
    const lastUpdatedTs = String(new Date().getTime());

    const maxCol = Math.max(lastUpdatedColIdx, tripColIdx, sourceColIdx) + 1;
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
            const globalProduct = globalProductMap.get(item.productId);
            if (globalProduct) {
              productName = globalProduct.name;
            }

            const row = new Array(maxCol).fill("");
            row[0] = timestamp;
            row[1] = orderId;
            row[2] = c.name;
            row[3] = targetDateStr;
            row[4] = timeKey;
            row[5] = productName;
            row[6] = item.quantity || 1;
            row[7] = ""; // 備註先留空
            row[8] = "PENDING";
            row[9] = c.deliveryMethod || "";
            row[10] = item.unit || "斤";
            row[lastUpdatedColIdx] = lastUpdatedTs;
            row[tripColIdx] = tripKey;
            row[sourceColIdx] = "🤖 自動建單";
            
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

// 🏠 門鈴發送器：負責發送 PATCH 請求到 Firebase
function notifyFirebase() {
  const firebaseUrl = "https://orderapp-sync-default-rtdb.asia-southeast1.firebasedatabase.app/sync.json";
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
      
      // 若為 ORDERS 表，檢查是否有空缺配送時間 (例如由 LINE 搬入或外部 API 寫入)
      if (sheetName === "ORDERS") {
        const custColIdx = headers.findIndex(h => ["客戶名", "customerName", "CustomerName"].includes(String(h).trim()));
        const timeColIdx = headers.findIndex(h => ["配送時間", "deliveryTime", "DeliveryTime"].includes(String(h).trim()));
        
        if (custColIdx !== -1 && timeColIdx !== -1) {
          const timeValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
          let timeModified = false;
          timeValues.forEach((row, rIdx) => {
            const rowCust = String(row[custColIdx] || '').trim();
            const rowTime = String(row[timeColIdx] || '').trim();
            if (!rowTime && customerTimeMap[rowCust]) {
              row[timeColIdx] = customerTimeMap[rowCust];
              timeModified = true;
            }
          });
          if (timeModified) {
            sheet.getRange(2, 1, timeValues.length, lastCol).setValues(timeValues);
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
 * 搬移並同步 LINE 訂單至主訂單表 (ORDERS)
 * 智能判定配送時間：
 * 情況 A: LINE 訂單有指定時間 -> 保留指定時間
 * 情況 B: LINE 訂單無時間，但該店家有預設時間 -> 自動帶入店家預設時間 (如 08:00)
 * 情況 C: 皆無時間 -> 保留空白
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
    const custSheet = ss.getSheetByName("CUSTOMERS") || ss.getSheetByName("Customers");

    // 建立客戶預設配送時間與配送方式對照表
    const custMap = {};
    if (custSheet && custSheet.getLastRow() > 1) {
      const cHeaders = custSheet.getRange(1, 1, 1, custSheet.getLastColumn()).getValues()[0];
      const cNameIdx = cHeaders.findIndex(h => ["Name", "name", "客戶名", "客戶名稱"].includes(String(h).trim()));
      const cTimeIdx = cHeaders.findIndex(h => ["DeliveryTime", "deliveryTime", "配送時間"].includes(String(h).trim()));
      const cMethodIdx = cHeaders.findIndex(h => ["DeliveryMethod", "deliveryMethod", "配送方式"].includes(String(h).trim()));
      
      const cRows = custSheet.getRange(2, 1, custSheet.getLastRow() - 1, custSheet.getLastColumn()).getValues();
      cRows.forEach(r => {
        const name = String(r[cNameIdx] || '').trim();
        if (name) {
          custMap[name] = {
            deliveryTime: cTimeIdx !== -1 ? String(r[cTimeIdx] || '').trim() : '',
            deliveryMethod: cMethodIdx !== -1 ? String(r[cMethodIdx] || '').trim() : ''
          };
        }
      });
    }

    // 讀取 LINE 訂單資料
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

      // 智能判定配送時間：優先使用 LINE 指定時間，若無則套用店家預設時間
      let lineDeliveryTime = lTimeIdx !== -1 ? String(lRow[lTimeIdx] || '').trim() : '';
      if (!lineDeliveryTime && custMap[custName]?.deliveryTime) {
        lineDeliveryTime = custMap[custName].deliveryTime;
      }

      const row = new Array(maxCol).fill("");
      row[0] = timestamp;
      row[1] = "LINE-" + Utilities.getUuid().slice(0, 8);
      row[2] = custName;
      row[3] = deliveryDate;
      row[4] = lineDeliveryTime;
      row[5] = lProdIdx !== -1 ? String(lRow[lProdIdx] || '').trim() : '';
      row[6] = lQtyIdx !== -1 ? Number(lRow[lQtyIdx]) || 1 : 1;
      row[7] = lNoteIdx !== -1 ? String(lRow[lNoteIdx] || '').trim() : '';
      row[8] = "PENDING";
      row[9] = custMap[custName]?.deliveryMethod || "";
      row[10] = lUnitIdx !== -1 ? (String(lRow[lUnitIdx] || '').trim() || "斤") : "斤";
      row[headerMap["LastUpdated"]] = currentTs;
      row[headerMap["資料來源"]] = "💬 LINE 訂單";
      row[headerMap["Version"]] = 1;

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
  if (!settingsDataStr) return;
  
  let settings = null;
  try {
    settings = JSON.parse(settingsDataStr);
  } catch (e) {
    return;
  }
  
  const rules = getRemindRulesFromSheet();
  const channelToken = String(settings.lineChannelToken || '').trim();
  const userId = String(settings.lineUserId || '').trim();
  if (!rules.length || !channelToken || !userId) return;

  const now = new Date();
  
  const timeZone = SS.getSpreadsheetTimeZone() || "Asia/Taipei";
  // === 新增以下這段轉換時間的邏輯 ===
  const year = Utilities.formatDate(now, timeZone, "yyyy");
  const month = Utilities.formatDate(now, timeZone, "MM");
  const dateStr = Utilities.formatDate(now, timeZone, "dd");
  
  const currentDayNum = parseInt(Utilities.formatDate(now, timeZone, "u"), 10) % 7; 
  const shortDays = ['日', '一', '二', '三', '四', '五', '六'];
  const dayName = shortDays[currentDayNum]; // 短星期的字眼
  
  const currentHour = Utilities.formatDate(now, timeZone, "HH");
  const m = Utilities.formatDate(now, timeZone, "mm");
  const currentDayStr = String(currentDayNum);
  const currentTimeStr = `${currentHour}:00`; 
  
  let h = parseInt(currentHour, 10);
  let period = '凌晨';
  if (h >= 6 && h < 12) period = '上午';
  else if (h === 12) period = '中午';
  else if (h > 12 && h < 18) period = '下午';
  else if (h >= 18) period = '晚上';
  let displayHour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  
  // 組合出格式如：2026-05-17(日)晚上7:00
  const formattedTimeStr = `${year}-${month}-${dateStr}(${dayName})${period}${displayHour}:${m}`;
  // =================================
  
  // 以昨天作為起點，避免遺漏
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const startFetchDateStr = Utilities.formatDate(yesterday, timeZone, "yyyy-MM-dd");
  
  const data = getData(startFetchDateStr, 0); 
  const customers = data.customers || [];
  
  // =================================
  // 打擊範圍縮圈 (Data Bounding)
  // 解決配額提早耗盡 (Quota Drain)，只抓出貨日與今天相差 3 天內的訂單進迴圈
  // =================================
  if (data.orders && Array.isArray(data.orders)) {
    // 過濾前的數量，如果很大，這一步可以省下巨量運算時間
    data.orders = data.orders.filter(order => {
      let dStr = order.deliveryDate;
      if (!dStr) return false;
      let d = (dStr instanceof Date) ? dStr : new Date(String(dStr).split(' ')[0].replace(/\//g, '-'));
      if (isNaN(d.getTime())) return true;
      const diffDays = Math.abs((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays <= 3; // 取前後 3 天
    });
  }

  let notifications = [];
  
  for (let r = 0; r < rules.length; r++) {
    // 2. 迴圈每一圈都看錶，超過 4.6 分鐘直接停手
    if (Date.now() - START_TIME > TIME_LIMIT) {
      console.warn("即將超時，主動中斷規則檢查以確保寫入 Log！");
      break; 
    }

    const rule = rules[r];
    // 定義初始偵測包
    let trace = { step: "INIT", message: "開始評估", customersEvaluated: 0, customersMatched: 0 };

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
      isTimeMatched = true; // Bypass time check when forcing a test
    } else if (Array.isArray(rule.schedule)) {
      isTimeMatched = (rule.schedule.includes(currentDayStr) || rule.schedule.includes('每天')) && rule.timeToNotify.startsWith(currentHour);
    } else {
      if (rule.schedule === '每天') {
        isTimeMatched = rule.timeToNotify.startsWith(currentHour); // rough match
      } else {
        isTimeMatched = (rule.schedule === currentDayStr) && (rule.timeToNotify.startsWith(currentHour));
      }
    }
    
    if (!isTimeMatched) {
        // 時間未到或非指定星期，直接略過，不寫入試算表避免塞爆
        continue;
    }
    
    // === 支援多天檢查未來的訂單 ===
    let targetDatesInfo = [];
    const shortDaysArr = ['日', '一', '二', '三', '四', '五', '六'];
    
    if (rule.targetOrderDays && rule.targetOrderDays.length > 0) {
      for (let i = 1; i <= 7; i++) {
        let checkDay = (currentDayNum + i) % 7;
        if (rule.targetOrderDays.includes(String(checkDay))) {
          const tDate = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
          targetDatesInfo.push(tDate);
        }
      }
    } else {
      targetDatesInfo.push(new Date(now.getTime() + 24 * 60 * 60 * 1000)); // 預設檢查明天
    }

    // 將目標日期轉換成 YYYY-MM-DD 以便篩選訂單
    const targetDateStrings = targetDatesInfo.map(d => {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

    // 格式化所有的短日期 (用於推播訊息中的文字：例如 5-19(二))
    const targetShortStrings = targetDatesInfo.map(d => {
      const md = Utilities.formatDate(d, timeZone, "M-d");
      const dNum = parseInt(Utilities.formatDate(d, timeZone, "u"), 10) % 7;
      return `${md}(${shortDaysArr[dNum]})`;
    });
    const targetDatesText = targetShortStrings.join('、');
    
    // 取得「包含這些目標日期」的所有訂單
    // 新增一個清洗字串的小工具 (將 2026/05/23 00:00:00 強制轉換回 2026-05-23)
    const normalizeGasDate = (dStr) => {
      if (!dStr) return "";
      if (dStr instanceof Date) {
        return Utilities.formatDate(dStr, timeZone, "yyyy-MM-dd");
      }
      return String(dStr).split(' ')[0].replace(/\//g, '-');
    };

    const targetOrders = data.orders.filter(o => {
      return targetDateStrings.includes(normalizeGasDate(o.deliveryDate));
    });
    
    // ★ 新增：預先將訂單依照 customerName 進行分組 (O(N) 的一次性操作)
    const ordersByCustomer = {};
    for (let i = 0; i < targetOrders.length; i++) {
      const order = targetOrders[i];
      const cName = order.customerName;
      if (!ordersByCustomer[cName]) {
        ordersByCustomer[cName] = [];
      }
      ordersByCustomer[cName].push(order);
    }
    
    // 過濾客戶 (如果客戶已封存、暫停供貨，或在"所有"勾選的目標日期都是休息或特休，才略過他)
    const activeCustomers = customers.filter(c => {
      if (c.isArchived || c.isPaused) return false;
      const hasWorkingDay = targetDatesInfo.some(d => {
        const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const isOff = (c.offDays && c.offDays.includes(d.getDay())) || (c.holidayDates && c.holidayDates.includes(dStr));
        return !isOff; // 有任何一天不是休假，就把他加進檢查名單
      });
      return hasWorkingDay;
    });
    // =================================
    trace.customersEvaluated = activeCustomers.length;

    if (activeCustomers.length === 0) {
        logAndReturn("SKIPPED", { reason: "今日所有目標客戶皆為休假日", targetDatesText });
        continue;
    }

    const triggeredCustomers = activeCustomers.filter(customer => {
      let isRuleMatched = null;

      rule.conditions.forEach(cond => {
        let condAppliesToCustomer = true;
        if (cond.customers && cond.customers.length > 0 && !cond.customers.includes(customer.id)) {
          condAppliesToCustomer = false;
        }

        let condMatched = false;
        if (condAppliesToCustomer) {
          const targetProducts = (cond.products && cond.products.length) ? cond.products : data.products.map(p => p.name);
          
          // ★ 修改後：直接從剛剛建好的索引表中 O(1) 提取
          const customerOrders = ordersByCustomer[customer.name] || [];
          const relevantOrders = customerOrders.filter(o => 
            targetProducts.includes(o.productName || o.product?.name)
          );

          if (cond.status === 'UNORDERED') {
            condMatched = relevantOrders.length === 0;
          } else if (cond.status === 'PENDING') {
            condMatched = relevantOrders.some(o => o.status === 'PENDING' || o.status === '待處理');
          }
        }
        
        if (isRuleMatched === null) {
          isRuleMatched = condMatched;
        } else {
          if (cond.operator === 'AND') {
            isRuleMatched = isRuleMatched && condMatched;
          } else { // 'OR' or default
            isRuleMatched = isRuleMatched || condMatched;
          }
        }
      });

      return isRuleMatched;
    });

    trace.step = "CONDITION_EVALUATED";
    trace.customersMatched = triggeredCustomers.length;

    if (triggeredCustomers.length === 0) {
        logAndReturn("SKIPPED", { reason: "客戶有營業，但條件未達成 (例如客戶已下單)", targetDatesText });
        continue;
    }

    if (triggeredCustomers.length > 0) {
      // 將觸發提醒的客戶名稱串接
      const names = triggeredCustomers.map(c => c.name).join('、');
      
      trace.step = "SENT";
      trace.recipients = names;
      
      // 嘗試組合「發生+品項」的文字，因為條件可能有多個，我們需要簡潔表達
      // 您可以將所有條件的產品名稱與狀態彙整起來
      const conditionTexts = rule.conditions.map(cond => {
        const targetProducts = (cond.products && cond.products.length) ? cond.products.join('、') : '任何品項';
        let statusStr = cond.status === 'UNORDERED' ? '沒有訂購' : '狀態為待處理';
        
        // === 將 targetDatesText 組裝進來 ===
        return `${statusStr} ${targetDatesText} ${targetProducts}`;
      });
      
      const formattedCondition = conditionTexts.join(' / ');

      // === 修改這裡的組合順序 ===
      // 1. 【規則名稱】:
      let message = `【${rule.name}】:\n`;
      // 2. 當下時間
      message += `${formattedTimeStr}\n`;
      // 3. 對象+發生+品項
      message += `${names} ${formattedCondition}`;
      
      // 4. 提醒內容(純文字)
      if (rule.customMessage) {
        let msg = rule.customMessage.replace(/{日期}/g, targetDatesText).replace(/{{日期}}/g, targetDatesText);
        message += `\n\n${msg}`; // 加一個空行區隔會比較乾淨
      }
      
      notifications.push({
        message: message,
        logSuccess: () => logAndReturn("SUCCESS", trace),
        logError: (err) => logAndReturn("ERROR", { ...trace, Error: err.message || err.toString() })
      });
    }
  }
  
  // Actually send
  if (notifications.length > 0) {
    const userIds = userId.split(',').map(id => id.trim()).filter(id => id);
    
    if (userIds.length > 0) {
      const endpoint = userIds.length === 1 
        ? "https://api.line.me/v2/bot/message/push" 
        : "https://api.line.me/v2/bot/message/multicast";
        
      const payloadTo = userIds.length === 1 ? userIds[0] : userIds;
      
      if (!isDryRun) {
        // 【修改點】針對每一則通知獨立發動 API 請求，使其成為獨立對話泡泡
        // 準備一個發射清單，採用 UrlFetchApp.fetchAll (非同步併發) 解決網路等待延遲
        const requests = [];
        for (let j = 0; j < notifications.length; j++) {
           const n = notifications[j];
           requests.push({
             url: endpoint,
             method: "post",
             contentType: "application/json",
             headers: { 
               "Authorization": "Bearer " + channelToken 
             },
             payload: JSON.stringify({
               to: payloadTo,
               messages: [{ type: "text", text: n.message }]
             }),
             muteHttpExceptions: true
           });
        }
        
        try {
          // 全部一起發射！
          const responses = UrlFetchApp.fetchAll(requests);
          
          // 發射完再來統一整理 Log
          responses.forEach((res, index) => {
            const n = notifications[index];
            if (res.getResponseCode() === 200) {
              n.logSuccess();
            } else {
              n.logError(new Error(`API failed with ${res.getResponseCode()}: ${res.getContentText()}`));
            }
          });
        } catch (err) {
           console.log("LINE Messaging API fetchAll failed: " + err.message);
           notifications.forEach(n => n.logError(err));
        }
      } else {
         notifications.forEach(n => n.logSuccess());
      }
    } else {
        notifications.forEach(n => n.logError(new Error("未設定 LINE userId")));
    }
  }

  // 4. 安全下莊：統一一次性寫入 Log
  if (batchLogs.length > 0) {
    try {
      const logSheet = getNotificationLogSheet();
      const lastRow = logSheet.getLastRow();
      let startRow = lastRow > 0 ? lastRow + 1 : 2;
      safeSetValues(logSheet, startRow, 1, batchLogs);
      
      // 效能防禦：Rolling Window (保留最新 800 筆)
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

  return dryRunResults;
}

function handleLineWebhook(payload) {
  const configSheet = getConfigSheet();
  const settingsStr = getSystemConfig(configSheet, "AppSettings");
  let channelToken = "";
  if (settingsStr) {
    try {
      const settings = JSON.parse(settingsStr);
      channelToken = String(settings.lineChannelToken || '').trim();
    } catch (e) {}
  }
  
  if (!channelToken) {
    return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
  }
  
  payload.events.forEach(function(event) {
    if (event.type === 'message' && event.message.type === 'text') {
      const text = event.message.text.trim();
      const userId = event.source.userId;
      const replyToken = event.replyToken;
      
      let replyText = "";
      
      // 1. 查詢自己的 LINE User ID
      if (text === "查ID" || text === "我的ID" || text === "id" || text === "ID") {
        replyText = "您的 User ID 是：\n" + userId;
      } 
      // 2. 說明選單 / 幫助
      else if (text === "說明" || text === "幫助" || text === "help" || text === "功能" || text === "?") {
        replyText = "🤖【系統查詢指令說明】\n" +
                    "━━━━━━━━━━━━━━\n" +
                    "1️⃣ 店家營業與公休：\n" +
                    "👉「鵝肉亭今天有營業嗎？」\n" +
                    "👉「鵝肉亭什麼時候公休？」\n\n" +
                    "2️⃣ 配送進度與訂單：\n" +
                    "👉「鵝肉亭今天有去嗎？」\n" +
                    "👉「鵝肉亭有叫麵嗎？」\n" +
                    "👉「正宗民雄鵝肉亭」（看完整店家資料）\n\n" +
                    "3️⃣ 指定日期訂單：\n" +
                    "👉「誠石 5/30 訂了多少？」\n" +
                    "👉「大埔 5/30 叫了啥」\n\n" +
                    "4️⃣ 月份貨款統計：\n" +
                    "👉「誠石 5月貨款是多少？」\n" +
                    "👉「鵝肉亭五月要收多少」\n\n" +
                    "5️⃣ 生成對帳單 PDF：\n" +
                    "👉「誠石 5月報表」\n" +
                    "👉「鵝肉亭 5月PDF」";
      }
      else {
        // 進入智慧查詢處理器
        replyText = processLineOrderQuery(text);
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
            messages: [{ type: "text", text: replyText }]
          }),
          muteHttpExceptions: true
        });
      } catch (err) {
        console.error("LINE reply error: " + err.toString());
      }
    }
  });
  
  return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
}

/**
 * 智慧訂單與帳務自然語言解析器 (支援 Gemini AI 意圖理解與結構化查詢)
 */
function processLineOrderQuery(rawText) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const timeZone = ss.getSpreadsheetTimeZone() || "Asia/Taipei";
  const now = new Date();
  const currentYear = Utilities.formatDate(now, timeZone, "yyyy");
  const todayStr = Utilities.formatDate(now, timeZone, "yyyy-MM-dd");

  const cleanText = rawText.replace(/\s+/g, ' ').trim();

  // 1. 嘗試使用 Gemini AI 進行深度語意理解 (若有設定 GEMINI_API_KEY)
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

  // 2. Fallback：使用精確正規表達式 (規則引擎) 解析
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
  // 例：「C店家 5月報表」、「誠石5月PDF」、「印 誠石 5月對帳單」
  // ----------------------------------------------------
  const pdfMatch = cleanText.match(/(?:印|產出|產生|下載|匯出)?\s*(.+?)\s*(\d{1,2})月\s*(?:報表|對帳單|PDF|pdf)/i);
  if (pdfMatch) {
    const custName = pdfMatch[1].replace(/^(?:幫我|請幫我|查|查詢)/, '').trim();
    const monthNum = parseInt(pdfMatch[2], 10);
    return generateMonthlyStatementPDF(ss, custName, monthNum, currentYear);
  }

  // ----------------------------------------------------
  // 情境 3：查詢月份貨款 / 帳單
  // 例：「B店家 5月貨款是多少？」、「誠石5月帳單」、「大埔 5月份 金額」
  // ----------------------------------------------------
  const monthlyBillMatch = cleanText.match(/(?:查|查詢|看|算)?\s*(.+?)\s*(\d{1,2})月(?:份)?\s*(?:的)?(?:貨款|帳單|帳款|金額|總額|總計|是多少)/);
  if (monthlyBillMatch) {
    const custName = monthlyBillMatch[1].replace(/^(?:幫我|請幫我)/, '').trim();
    const monthNum = parseInt(monthlyBillMatch[2], 10);
    return queryMonthlyBill(ss, custName, monthNum, currentYear);
  }

  // ----------------------------------------------------
  // 情境 2：查詢指定日期訂單
  // 例：「A店家 5/30 訂了多少貨？」、「誠石 5/30 訂單」、「誠石 5-30」、「大埔 05/30」
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
  // 例：「鵝肉亭有叫麵?」、「鵝肉亭有訂貨?」、「有叫麵嗎」、「有訂貨嗎」
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
  // 純店家名稱查詢：提供完整的「店家總覽資料」（包含今日訂單、配送趟次、營業/公休時間、聯絡資訊）
  // ----------------------------------------------------
  if (cleanText.length >= 2 && cleanText.length <= 15 && !cleanText.includes("說明") && !cleanText.includes("http")) {
    const custName = cleanText.replace(/^(?:查|查詢|看)\s*/, '').trim();
    return queryCustomerProfileOverview(ss, custName, todayStr, timeZone);
  }

  // 模糊關鍵字 fallback
  return "🤖 抱歉，未能完全理解您的提問。\n\n" +
         "💡 您可以嘗試這樣問：\n" +
         "• 查營業狀態：「鵝肉亭今天有營業嗎？」\n" +
         "• 查公休時間：「鵝肉亭什麼時候公休？」\n" +
         "• 查配送進度：「鵝肉亭今天有去嗎？」、「送到了沒？」\n" +
         "• 查叫貨明細：「鵝肉亭有叫麵嗎？」\n" +
         "• 查店家檔案：「正宗民雄鵝肉亭」（輸入純店名）\n" +
         "• 查特定日期：「誠石 5/30 訂單」\n" +
         "• 查月份貨款：「誠石 5月貨款是多少？」\n" +
         "• 生成月報表：「誠石 5月報表」\n\n" +
         "輸入「說明」可查看所有指令範例。";
}

/**
 * 透過 Google Gemini AI 進行自然語言意圖理解
 */
function parseQueryIntentWithGemini(userText, todayStr) {
  try {
    const configSheet = getConfigSheet();
    let geminiApiKey = String(getSystemConfig(configSheet, "GeminiApiKey") || '').trim();
    if (!geminiApiKey) {
      const settingsStr = getSystemConfig(configSheet, "AppSettings");
      if (settingsStr) {
        try {
          const settings = JSON.parse(settingsStr);
          geminiApiKey = String(settings.geminiApiKey || '').trim();
        } catch (e) {}
      }
    }
    
    // 若未設定 Gemini Key 則回傳 null 走規則引擎
    if (!geminiApiKey) {
      console.warn("⚠️ 系統尚未在 Config 設定 GeminiApiKey");
      return null;
    }

    const prompt = `你是一個專業製麵廠 ERP 系統的 AI 助理。請精準分析使用者這句口語化的提問，將其精確分類為以下 8 種專屬意圖之一，並提取「店家名稱」：
使用者提問："${userText}"
今天日期：${todayStr}

意圖定義與分類準則：
1. "BUSINESS_STATUS"：詢問某店家「今天有沒有營業 / 有開嗎 / 有開門嗎 / 今天休息嗎 / 今天公休嗎」。
   - 範例：「誠石今天有營業嗎？」、「鵝肉亭今天有開嗎？」、「大埔今天有休息嗎？」
2. "HOLIDAY_INFO"：詢問某店家「什麼時候公休 / 哪天休息 / 公休日是哪天 / 特定公休日」。
   - 範例：「鵝肉亭什麼時候公休？」、「誠石休哪天？」、「大埔公休日是禮拜幾？」
3. "DELIVERY_STATUS"：詢問司機「今天送去了嗎 / 今天有去送嗎 / 送到了沒 / 去了沒 / 送了沒」（專注在司機配送進度）。
   - 範例：「誠石今天有去嗎？」、「鵝肉亭送到了沒？」、「阿石去了沒？」
4. "TODAY_STATUS"：詢問某店家「今天有沒有叫麵 / 有沒有叫貨 / 有沒有訂貨 / 今天叫了什麼」（專注在叫貨數量品項）。
   - 範例：「鵝肉亭有叫麵嗎？」、「誠石今天有訂貨嗎？」、「今天有叫貨嗎？」
5. "CUSTOMER_PROFILE"：使用者只輸入了「純店家名稱」或詢問店家基本檔案。
   - 範例：「鵝肉亭」、「正宗民雄鵝肉亭」、「查 誠石」
6. "DATE_ORDER"：詢問某店家在特定日期的叫貨量、品項或金額。
   - 範例：「大埔 5/30 叫了啥」、「誠石 8-15 訂單」
7. "MONTHLY_BILL"：詢問某店家特定月份的貨款、帳款、要收多少錢。
   - 範例：「誠石五月要收多少」、「大埔 5月 帳單」
8. "GENERATE_PDF"：要求產出、下載、列印某店家特定月份的對帳單/報表/PDF。
   - 範例：「幫我做一份大埔 5 月對帳單」、「誠石 5月 PDF」

請僅回傳 JSON 物件，格式如下（不要加任何 markdown 標記或反引號）：
{
  "action": "BUSINESS_STATUS" | "HOLIDAY_INFO" | "DELIVERY_STATUS" | "TODAY_STATUS" | "CUSTOMER_PROFILE" | "DATE_ORDER" | "MONTHLY_BILL" | "GENERATE_PDF" | "UNKNOWN",
  "customerName": "提取出的精確店家名稱（去掉今天、營業、公休、有去嗎、有叫麵、查、幫我等所有贅詞）",
  "targetDate": "YYYY-MM-DD (若為 DATE_ORDER 且有提到日期)",
  "month": 數字月份 (例如 5, 若為 MONTHLY_BILL 或 GENERATE_PDF),
  "year": "YYYY (年份，預設當前年份)"
}`;

    // 支援最新 gemini-2.5-flash 與 gemini-1.5-flash
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

  const custSheet = ss.getSheetByName("CUSTOMERS") || ss.getSheetByName("Customers");
  if (!custSheet || custSheet.getLastRow() <= 1) {
    return `⚠️ 系統中目前尚無客戶資料表。`;
  }

  const custData = getSheetData(custSheet);
  const matchedCust = custData.find(c => {
    const cName = String(c.Name || c.name || c.客戶名稱 || '').trim();
    return cName && (cName.toLowerCase().includes(customerName.toLowerCase()) || customerName.toLowerCase().includes(cName.toLowerCase()));
  });

  if (!matchedCust) {
    return `⚪【查無店家】找不到名稱包含「${customerName}」的店家資料。`;
  }

  const cName = String(matchedCust.Name || matchedCust.name || matchedCust.客戶名稱 || '').trim();
  const rawOffDays = matchedCust.OffDays || matchedCust.offDays || matchedCust.公休日週期JSON || matchedCust.公休日週期 || matchedCust.Holidays || matchedCust.公休日 || '';
  const rawHolidayDates = matchedCust.HolidayDates || matchedCust.holidayDates || matchedCust.特定公休日JSON || matchedCust.特定公休日 || '';
  const businessHours = String(matchedCust.BusinessHours || matchedCust.businessHours || matchedCust.營業時間 || '未設定').trim();

  // 計算今天星期幾
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ...
  const dayOfWeekMap = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  const todayWeekDayStr = dayOfWeekMap[dayOfWeek];

  // 1. 解析固定公休 (週期)
  let isHolidayToday = false;
  let holidaysList = [];
  if (typeof rawOffDays === 'string') {
    try {
      const parsed = JSON.parse(rawOffDays);
      if (Array.isArray(parsed)) holidaysList = parsed;
      else holidaysList = [rawOffDays];
    } catch (e) {
      holidaysList = rawOffDays.split(/[,、，\s]+/).filter(Boolean);
    }
  } else if (Array.isArray(rawOffDays)) {
    holidaysList = rawOffDays;
  } else if (typeof rawOffDays === 'number') {
    holidaysList = [rawOffDays];
  }

  const isMatchWeeklyHoliday = holidaysList.some(h => {
    const str = String(h).trim();
    return str === String(dayOfWeek) ||
           (dayOfWeek === 0 && (str === '7' || str === '日' || str === '天')) ||
           str.includes(todayWeekDayStr) || 
           str.includes(`星期${todayWeekDayStr.slice(1)}`) ||
           str.includes(`禮拜${todayWeekDayStr.slice(1)}`);
  });

  // 2. 解析特定公休日 (特定日期清單，如 ["2026-08-20", "2026-08-25"])
  let specificHolidays = [];
  if (typeof rawHolidayDates === 'string') {
    try {
      const parsed = JSON.parse(rawHolidayDates);
      if (Array.isArray(parsed)) specificHolidays = parsed;
      else specificHolidays = [rawHolidayDates];
    } catch (e) {
      specificHolidays = rawHolidayDates.split(/[,、，\s]+/).filter(Boolean);
    }
  } else if (Array.isArray(rawHolidayDates)) {
    specificHolidays = rawHolidayDates;
  }

  // 格式化特定公休日為標準 yyyy-MM-dd
  const normalizedSpecificDates = specificHolidays.map(d => {
    let str = String(d).trim().replace(/\//g, '-');
    return str;
  }).filter(Boolean);

  const isMatchSpecificHoliday = normalizedSpecificDates.some(d => d === todayStr);

  if (isMatchWeeklyHoliday || isMatchSpecificHoliday) {
    isHolidayToday = true;
  }

  // 未來（包含今天）特定公休日
  const upcomingSpecificHolidays = normalizedSpecificDates
    .filter(d => d >= todayStr)
    .sort();

  // 同時檢查今天是否有訂單
  const allOrders = getAllOrdersFromSheet(ss);
  const todayOrders = allOrders.filter(o => 
    o.deliveryDate === todayStr && 
    (o.customerName.toLowerCase().includes(cName.toLowerCase()) || cName.toLowerCase().includes(o.customerName.toLowerCase()))
  );

  let reply = `🏪【${cName} - 今日營業狀態】\n` +
              `📅 查詢日期：${todayStr} (${todayWeekDayStr})\n` +
              `━━━━━━━━━━━━━━\n`;

  if (isHolidayToday) {
    const formattedOffDays = formatOffDaysToChinese(rawOffDays);
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

  const custSheet = ss.getSheetByName("CUSTOMERS") || ss.getSheetByName("Customers");
  if (!custSheet || custSheet.getLastRow() <= 1) {
    return `⚠️ 系統中目前尚無客戶資料表。`;
  }

  const custData = getSheetData(custSheet);
  const matchedCust = custData.find(c => {
    const cName = String(c.Name || c.name || c.客戶名稱 || '').trim();
    return cName && (cName.toLowerCase().includes(customerName.toLowerCase()) || customerName.toLowerCase().includes(cName.toLowerCase()));
  });

  if (!matchedCust) {
    return `⚪【查無店家】找不到名稱包含「${customerName}」的店家資料。`;
  }

  const cName = String(matchedCust.Name || matchedCust.name || matchedCust.客戶名稱 || '').trim();
  const rawOffDays = matchedCust.OffDays || matchedCust.offDays || matchedCust.公休日週期JSON || matchedCust.公休日週期 || matchedCust.Holidays || matchedCust.公休日 || '';
  const rawHolidayDates = matchedCust.HolidayDates || matchedCust.holidayDates || matchedCust.特定公休日JSON || matchedCust.特定公休日 || '';
  const businessHours = String(matchedCust.BusinessHours || matchedCust.businessHours || matchedCust.營業時間 || '未設定').trim();
  const note = String(matchedCust.Note || matchedCust.note || matchedCust.備註 || '').trim();

  // 1. 固定公休 (轉換為中文如 "週日、週一")
  const holidayText = formatOffDaysToChinese(rawOffDays);

  // 2. 特定公休日（過濾掉今天以前的歷史日期）
  let specificHolidays = [];
  if (typeof rawHolidayDates === 'string') {
    try {
      const parsed = JSON.parse(rawHolidayDates);
      if (Array.isArray(parsed)) specificHolidays = parsed;
      else specificHolidays = [rawHolidayDates];
    } catch (e) {
      specificHolidays = rawHolidayDates.split(/[,、，\s]+/).filter(Boolean);
    }
  } else if (Array.isArray(rawHolidayDates)) {
    specificHolidays = rawHolidayDates;
  }

  const upcomingSpecificHolidays = specificHolidays
    .map(d => String(d).trim().replace(/\//g, '-'))
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

  const allOrders = getAllOrdersFromSheet(ss);
  const matchedOrders = allOrders.filter(o => 
    o.deliveryDate === todayStr && 
    (o.customerName.toLowerCase().includes(customerName.toLowerCase()) || customerName.toLowerCase().includes(o.customerName.toLowerCase()))
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

  const custSheet = ss.getSheetByName("CUSTOMERS") || ss.getSheetByName("Customers");
  let customerData = null;
  if (custSheet && custSheet.getLastRow() > 1) {
    const allCusts = getSheetData(custSheet);
    customerData = allCusts.find(c => {
      const cName = String(c.Name || c.name || c.客戶名稱 || '').trim();
      return cName && (cName.toLowerCase().includes(customerName.toLowerCase()) || customerName.toLowerCase().includes(cName.toLowerCase()));
    });
  }

  const allOrders = getAllOrdersFromSheet(ss);
  const todayOrders = allOrders.filter(o => 
    o.deliveryDate === todayStr && 
    (o.customerName.toLowerCase().includes(customerName.toLowerCase()) || customerName.toLowerCase().includes(o.customerName.toLowerCase()))
  );

  const displayName = customerData ? String(customerData.Name || customerData.name || customerData.客戶名稱).trim() : customerName;

  let reply = `🏪【${displayName} - 店家基本與今日資料】\n` +
              `━━━━━━━━━━━━━━\n`;

  if (customerData) {
    const phone = customerData.Phone || customerData.phone || customerData.電話 || '無';
    const address = customerData.Address || customerData.address || customerData.地址 || '無';
    const rawOffDays = customerData.OffDays || customerData.offDays || customerData.公休日週期JSON || customerData.公休日週期 || customerData.Holidays || customerData.公休日 || '無';
    const rawHolidayDates = customerData.HolidayDates || customerData.holidayDates || customerData.特定公休日JSON || customerData.特定公休日 || '';
    const businessHours = customerData.BusinessHours || customerData.businessHours || customerData.營業時間 || '無';
    
    // 解析固定公休 (轉換為中文如 "週日、週一")
    const offDaysStr = formatOffDaysToChinese(rawOffDays);

    // 解析未來特定公休日
    let upcomingSpecific = [];
    if (rawHolidayDates) {
      try {
        const parsed = typeof rawHolidayDates === 'string' ? JSON.parse(rawHolidayDates) : rawHolidayDates;
        const arr = Array.isArray(parsed) ? parsed : [rawHolidayDates];
        upcomingSpecific = arr.map(d => String(d).trim().replace(/\//g, '-')).filter(d => d && d >= todayStr).sort();
      } catch (e) {
        upcomingSpecific = String(rawHolidayDates).split(/[,、，\s]+/).filter(d => d && d >= todayStr).sort();
      }
    }
    
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
      status: String(o.Status || o.status || o.狀態 || 'PENDING').trim(),
      unitPrice: unitPrice > 0 ? unitPrice : undefined,
      subtotal: subtotal > 0 ? subtotal : undefined,
      trip: o.Trip || o.trip || o.趟次 || ''
    };
  });
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

function getSystemLogs(limit) {
  limit = limit || 100;
  const sheet = getSystemLogSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  
  const startRow = Math.max(2, lastRow - limit + 1);
  const numRows = lastRow - startRow + 1;
  const rawValues = sheet.getRange(startRow, 1, numRows, 4).getValues();
  
  return rawValues.reverse().map(row => ({
    timestampStr: String(row[0]),
    actionType: String(row[1]),
    target: String(row[2]),
    details: String(row[3])
  }));
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

function generateToken(deviceId, arg2, arg3, arg4) {
  let role = arg2;
  let name = arg3;
  // 兼容舊簽章參數格式: generateToken(deviceId, dbPassword, role, name)
  if (arg4 !== undefined) {
    role = arg3;
    name = arg4;
  }
  const header = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: "HS256" }));
  const payload = Utilities.base64EncodeWebSafe(JSON.stringify({
    dId: deviceId,
    role: role || "staff",
    name: name || "使用者",
    exp: new Date().getTime() + (30 * 24 * 60 * 60 * 1000) // 30天後過期
  }));
  // 使用 ScriptProperties 獨立 256-bit 高強度 Server Secret 作為 HMAC 簽章金鑰
  const secret = getJwtSecret();
  const signature = Utilities.computeHmacSha256Signature(header + "." + payload, secret);
  return header + "." + payload + "." + Utilities.base64EncodeWebSafe(signature);
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


