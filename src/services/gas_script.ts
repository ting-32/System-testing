
// @ts-nocheck

const SS = SpreadsheetApp.getActiveSpreadsheet();

let cachedTimeZone = null;

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
  const startDateStr = e.parameter.startDate;
  const since = Number(e.parameter.since) || 0;
  const data = getData(startDateStr, since);
  return ContentService.createTextOutput(JSON.stringify({ success: true, data: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    
    if (params.events && Array.isArray(params.events)) {
      return handleLineWebhook(params);
    }
    
    const action = params.action;
    
    // 取得最新密碼以供驗證
    const sheet = getConfigSheet();
    const currentDbPassword = String(sheet.getRange("B1").getDisplayValue()).trim() || "8888";

    // 【核心防護】除了 login 以外的所有操作，全部要驗證 Token
    if (action !== "login") {
      const tokenPayload = verifyTokenAndGetPayload(params.token, currentDbPassword);
      if (!tokenPayload) {
        writeSystemLog("SYSTEM_UNAUTHORIZED_ACCESS", "未授權的 API 調用", JSON.stringify({ action: action, tokenProvided: !!params.token }));
        return ContentService.createTextOutput(JSON.stringify({ 
          success: false, 
          error: "UNAUTHORIZED_OR_EXPIRED" 
        })).setMimeType(ContentService.MimeType.JSON);
      }
      
      const userRole = tokenPayload.role;
      const adminOnlyActions = ["saveSettings", "deleteOrder", "deleteCustomer", "getSystemLogs"];

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
      "updateProduct", "deleteProduct", "saveTrips", "saveSettings"
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
  const sheet = getConfigSheet();
  
  // Use getDisplayValue() to force string representation, safer than getValue()
  let dbPassword = sheet.getRange("B1").getDisplayValue().trim();
  
  // Empty cell default
  if (!dbPassword) {
    dbPassword = "8888";
  }
  
  const inputPassword = String(data.password).trim();
  
  const dId = data.deviceId || "未知裝置";
  const uAgent = data.userAgent || "未知環境";

  // Try parsing ACCOUNTS sheet first
  const accountsSheet = SS.getSheetByName("ACCOUNTS");
  if (accountsSheet) {
    const accounts = getSheetData(accountsSheet);
    const user = accounts.find(a => String(a.PIN) === inputPassword && String(a.IsActive).toUpperCase() === "TRUE");
    if (user) {
      const role = user.Role || "staff";
      const name = user.Name || "員工";
      const token = generateToken(dId, dbPassword, role, name);
      writeSystemLog("SYSTEM_LOGIN_SUCCESS", "員工登入", JSON.stringify({ name: name, role: role, deviceId: dId, userAgent: uAgent }));
      return { success: true, token: token, role: role, name: name };
    }
  }

  // Fallback / Super Admin
  if (inputPassword === dbPassword) {
    const token = generateToken(dId, dbPassword, "admin", "系統管理員");
    writeSystemLog("SYSTEM_LOGIN_SUCCESS", "系統管理員登入", JSON.stringify({ deviceId: dId, userAgent: uAgent }));
    return { success: true, token: token, role: "admin", name: "系統管理員" };
  } else {
    writeSystemLog("SYSTEM_LOGIN_FAILED", "系統登入異常", JSON.stringify({ deviceId: dId, userAgent: uAgent, attemptPwd: inputPassword }));
    return { success: false, error: "無效的密碼或 PIN 碼" };
  }
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
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const dataValues = sheet.getRange(startRow, 1, numRows, lastColumn).getDisplayValues();
  
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
          deliveryTime: c.DeliveryTime || c.deliveryTime || c.配送時間,
          defaultItems: c.DefaultItems || c.defaultItems || c.預設品項JSON || c.預設品項, 
          priceList: c.PriceList || c.priceList || c.價目表JSON || c.價目表,
          offDays: c.OffDays || c.offDays || c.公休日週期JSON || c.公休日週期,
          holidayDates: c.HolidayDates || c.holidayDates || c.特定公休日JSON || c.特定公休日,
          deliveryMethod: c.DeliveryMethod || c.deliveryMethod || c.配送方式,
          paymentTerm: c.PaymentTerm || c.paymentTerm || c.付款週期,
          defaultTrip: c.DefaultTrip || c.defaultTrip || c.預設趟數,
          autoOrderEnabled: String(c.自動建單開關).trim().toLowerCase() === 'true' || c.自動建單開關 === true,
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
        deliveryTime: c.DeliveryTime || c.deliveryTime || c.配送時間,
        defaultItems: c.DefaultItems || c.defaultItems || c.預設品項JSON || c.預設品項, 
        priceList: c.PriceList || c.priceList || c.價目表JSON || c.價目表,
        offDays: c.OffDays || c.offDays || c.公休日週期JSON || c.公休日週期,
        holidayDates: c.HolidayDates || c.holidayDates || c.特定公休日JSON || c.特定公休日,
        deliveryMethod: c.DeliveryMethod || c.deliveryMethod || c.配送方式,
        paymentTerm: c.PaymentTerm || c.paymentTerm || c.付款週期,
        defaultTrip: c.DefaultTrip || c.defaultTrip || c.預設趟數,
        autoOrderEnabled: String(c.自動建單開關).trim().toLowerCase() === 'true' || c.自動建單開關 === true,
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
      finalDateStr = String(rawDate).trim().split(' ')[0]; // 取日期部分
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
      deliveryTime: o.DeliveryTime || o.deliveryTime || o.配送時間,
      productName: o.ProductName || o.productName || o.品項,
      quantity: o.Quantity || o.quantity || o.數量,
      unit: o.Unit || o.unit || o.單位,
      note: o.Note || o.note || o.備註,
      status: String(o.Status || o.status || o.狀態 || '').trim(),
      deliveryMethod: o.DeliveryMethod || o.deliveryMethod || o.配送方式,
      source: o.Source || o.source || o.資料來源 || '',
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

  // 1. 取得通知日誌最新時間
  const traceSheet = SS.getSheetByName("TraceLogs");
  const traceLastRow = traceSheet ? traceSheet.getLastRow() : 0;
  const latestNotifyLogTs = traceLastRow > 1 ? new Date(traceSheet.getRange(traceLastRow, 1).getValue()).getTime() : 0;

  // 2. 取得系統系統日誌最新時間
  const sysSheet = SS.getSheetByName("SystemLogs");
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
  
  sheet.getRange(2, 1, dataToRows.length, dataToRows[0].length).setValues(dataToRows);
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
  const channelToken = data.lineChannelToken;
  const userIdStr = data.lineUserId;
  
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
      headers: { 
        "Content-Type": "application/json",
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
    headerMap[header] = index;
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
 * 安全地將資料寫入指定的 Row。
 * 自動判斷並補齊實體 Column，避免「RangeException」閃退。
 */
function safeSetRowValues(sheet, rowIndex, rowDataArray) {
  const maxCols = sheet.getMaxColumns(); // 取得目前的實體欄位總數
  const targetCols = rowDataArray.length; // 我們準備要寫入的資料長度

  // 若資料長度超過實體表格長度，手動為 Sheet 擴充欄位
  if (targetCols > maxCols) {
    sheet.insertColumnsAfter(maxCols, targetCols - maxCols);
  }

  // 擴充完畢後，就可以 100% 安全地執行寫入
  sheet.getRange(rowIndex, 1, 1, targetCols).setValues([rowDataArray]);
}

/**
 * 安全地將多筆資料寫入。
 */
function safeSetValues(sheet, startRow, startCol, dataArray) {
  if (!dataArray || dataArray.length === 0) return;
  const maxCols = sheet.getMaxColumns();
  const targetCols = startCol - 1 + dataArray[0].length;
  
  if (targetCols > maxCols) {
    sheet.insertColumnsAfter(maxCols, targetCols - maxCols);
  }
  
  sheet.getRange(startRow, startCol, dataArray.length, dataArray[0].length).setValues(dataArray);
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
    const headerMap = ensureHeadersBatch(sheet, ["LastUpdated", "Trip", "資料來源", "Version"]);
    const lastUpdatedColIdx = headerMap["LastUpdated"];
    const tripColIdx = headerMap["Trip"];
    const sourceColIdx = headerMap["資料來源"];
    const versionColIdx = headerMap["Version"];
    
    const maxCol = Math.max(lastUpdatedColIdx, tripColIdx, sourceColIdx, versionColIdx) + 1;
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
    const statusColIdx = headerMap["Status"] || headerMap["狀態"] || 8; 
    
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
        values[i][8] = updateData.status; // Status column (index 8 is col 9)
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
  const values = sheet.getDataRange().getValues();
  const orderIds = new Set(data.orderIds.map(id => String(id).trim()));
  const newLastUpdatedTs = String(new Date().getTime());
  
  let modified = false;
  for (let i = 1; i < values.length; i++) {
    const id = String(values[i][1]).trim();
    if (orderIds.has(id)) {
      values[i][8] = data.newStatus; // Status column (index 8 is col 9)
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
    const statusColIdx = headerMap["Status"];
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
  if(data.autoOrderEnabled !== undefined) newRow[colAuto] = data.autoOrderEnabled;
  newRow[colLast] = newLastUpdatedTs;
  
  // 將動態組裝好的精確列寫入試算表
  if (rowIndex > 0) {
    safeSetRowValues(sheet, rowIndex, newRow);
  } else {
    sheet.appendRow(newRow);
  }
  
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
    sheet.appendRow(rowData);
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

function generateTomorrowDefaultOrders() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(28000);
  } catch (err) {
    console.error("排程伺服器忙碌中，放棄執行自動建單");
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
  const today = new Date();
  
  // 將目標日期改為「明天」
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const targetDateStr = Utilities.formatDate(tomorrow, timeZone, "yyyy-MM-dd");
  const targetDayOfWeek = tomorrow.getDay(); 

  // ==========================================
  // 👇 新增的第 1 段：建立防呆檢查名單 👇
  // ==========================================
  const existingOrders = orderSheet.getDataRange().getValues();
  const alreadyGeneratedCustomers = new Set();
  
  // 從第 2 列開始迴圈 (跳過標題列)
  for (let i = 1; i < existingOrders.length; i++) {
    let rowDate = existingOrders[i][3]; // 第 4 欄 (Index 3) 是出貨日期
    const rowCustomer = existingOrders[i][2]; // 第 3 欄 (Index 2) 是客戶名稱
    
    // 👇 新增這行：抓取該筆訂單的狀態
    const rowStatus = String(existingOrders[i][statusColIdx] || '').trim().toUpperCase();
    
    // 【修改 1：統一型別】避免 Google Sheets 欄位為純 Date 物件，導致嚴格等於(===)比對失敗
    if (rowDate instanceof Date) {
      rowDate = Utilities.formatDate(rowDate, timeZone, "yyyy-MM-dd");
    }
    
    // 【修改 2：邏輯加強】只要明天 (targetDateStr) 已經有該客戶的訂單 (不論是手動建好的還是自動的)，
    // 而且該訂單的狀態不是 DELETED，就將他記到「已建單名單」，接下來就不會再幫這間店新增訂單了。
    if (rowDate === targetDateStr && rowStatus !== 'DELETED') {
      alreadyGeneratedCustomers.add(rowCustomer); 
    }
  }
  // ==========================================
  // 👆 第 1 段結束 👆
  // ==========================================

  // 取代原先的 getData()，避免全表(包含ORDERS)都被載入解析而導致逾時
  const customers = getSheetData(sheets.CUSTOMERS).map(c => ({
    name: c.Name || c.name || c.客戶名稱,
    defaultItems: c.DefaultItems || c.defaultItems || c.預設品項JSON || c.預設品項, 
    offDays: c.OffDays || c.offDays || c.公休日週期JSON || c.公休日週期,
    holidayDates: c.HolidayDates || c.holidayDates || c.特定公休日JSON || c.特定公休日,
    deliveryMethod: c.DeliveryMethod || c.deliveryMethod || c.配送方式,
    deliveryTime: c.DeliveryTime || c.deliveryTime || c.配送時間,
    defaultTrip: c.DefaultTrip || c.defaultTrip || c.預設趟數,
    autoOrderEnabled: String(c.自動建單開關).trim().toLowerCase() === 'true' || c.自動建單開關 === true
  }));

  const products = getSheetData(sheets.PRODUCTS).map(p => ({
    id: p.ID || p.id,
    name: p.Name || p.name || p.品項
  }));
  
  const productMap = {};
  products.forEach(p => {
    productMap[p.id] = p.name;
  });
  const newOrderRows = [];
  const timestamp = Utilities.formatDate(new Date(), timeZone, "yyyy/MM/dd HH:mm:ss");
  const lastUpdatedTs = String(new Date().getTime());

  const maxCol = Math.max(lastUpdatedColIdx, tripColIdx, sourceColIdx) + 1;
  if (orderSheet.getMaxColumns() < maxCol) {
    orderSheet.insertColumnsAfter(orderSheet.getMaxColumns(), maxCol - orderSheet.getMaxColumns());
  }

  customers.forEach(c => {
    const isAutoEnabled = c.autoOrderEnabled;
    if (!isAutoEnabled) return; 

    // ==========================================
    // 👇 新增的第 2 段：攔截重複建單 👇
    // ==========================================
    if (alreadyGeneratedCustomers.has(c.name)) {
      return; // 如果這間店今天已經有自動訂單了，就直接跳過，不往下執行
    }
    // ==========================================
    // 👆 第 2 段結束 👆
    // ==========================================

    const defaultItems = typeof c.defaultItems === 'string' ? safeJsonArray(c.defaultItems) : (c.defaultItems || []);
    if (!defaultItems || defaultItems.length === 0) return;
    
    const offDays = typeof c.offDays === 'string' ? safeJsonArray(c.offDays) : (c.offDays || []);
    if (offDays.includes(targetDayOfWeek)) return;
    
    const holidayDates = typeof c.holidayDates === 'string' ? safeJsonArray(c.holidayDates) : (c.holidayDates || []);
    if (holidayDates.includes(targetDateStr)) return;

    const orderId = "AUTO-" + Utilities.formatDate(tomorrow, timeZone, "MMdd") + "-" + Math.floor(Math.random() * 10000);

    defaultItems.forEach(item => {
      const row = new Array(maxCol).fill("");
      row[0] = timestamp;
      row[1] = orderId;
      row[2] = c.name;
      row[3] = targetDateStr;
      row[4] = c.deliveryTime || "08:00";
      row[5] = productMap[item.productId] || item.productName || item.productId;
      row[6] = item.quantity || 1;
      row[7] = ""; // 備註先留空
      row[8] = "PENDING";
      row[9] = c.deliveryMethod || "";
      row[10] = item.unit || "斤";
      row[lastUpdatedColIdx] = lastUpdatedTs;
      row[tripColIdx] = c.defaultTrip || "";
      row[sourceColIdx] = "🤖 自動建單";
      
      newOrderRows.push(row);
    });
  });

  if (newOrderRows.length > 0) {
    const lastRow = orderSheet.getLastRow();
    orderSheet.getRange(lastRow + 1, 1, newOrderRows.length, maxCol).setValues(newOrderRows);
  }
  
  } finally {
    SpreadsheetApp.flush(); // 強制將快取變更寫入 Sheets，確保後續 Lock 拿到最新資料
    lock.releaseLock();
    
    // ▼ ▼ ▼ 補上這一行，建單完成後通知所有前端拉取資料 ▼ ▼ ▼
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

    // 巡視這三個需要同步的表單
    ["ORDERS", "CUSTOMERS", "PRODUCTS"].forEach(sheetName => {
      const sheet = sheets.find(s => s.getName() === sheetName);
      if (!sheet) return;
      
      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      if (lastRow <= 1 || lastCol === 0) return;

      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      const lastUpdatedColIdx = headers.indexOf("LastUpdated");
      
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
  const channelToken = settings.lineChannelToken;
  const userId = settings.lineUserId;
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
      isTimeMatched = rule.schedule.includes(currentDayStr) && rule.timeToNotify.startsWith(currentHour);
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
    
    // 過濾客戶 (如果客戶在"所有"勾選的目標日期都是休息或特休，才略過他)
    const activeCustomers = customers.filter(c => {
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
             headers: { 
               "Content-Type": "application/json",
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
      logSheet.getRange(startRow, 1, batchLogs.length, batchLogs[0].length).setValues(batchLogs);
      
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
      channelToken = settings.lineChannelToken;
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
      if (text === "查ID" || text === "我的ID") {
        replyText = "您的 User ID 是：\n" + userId;
      } else {
        replyText = "您可以輸入「查ID」來獲取您的 User ID。";
      }

      try {
        UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
          method: "post",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": "Bearer " + channelToken
          },
          payload: JSON.stringify({
            replyToken: replyToken,
            messages: [{ type: "text", text: replyText }]
          }),
          muteHttpExceptions: true
        });
      } catch (err) {
        // Ignore reply errors
      }
    }
  });
  
  return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
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
    sheet.appendRow([timestamp, source, ruleId, ruleName, status, safeDetails]);
    
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
    timestamp: row[0],
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
    sheet.appendRow([timestamp, actionType, target, detailsStr]);
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
// 資安模組：無狀態 Token 簽發與驗證
// ==========================================
function generateToken(deviceId, dbPassword, role, name) {
  const header = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: "HS256" }));
  const payload = Utilities.base64EncodeWebSafe(JSON.stringify({
    dId: deviceId,
    role: role,
    name: name,
    exp: new Date().getTime() + (30 * 24 * 60 * 60 * 1000) // 30天後過期
  }));
  // 使用「當前系統密碼」作為 HMAC 簽章金鑰
  const signature = Utilities.computeHmacSha256Signature(header + "." + payload, dbPassword);
  return header + "." + payload + "." + Utilities.base64EncodeWebSafe(signature);
}

function verifyTokenAndGetPayload(token, dbPassword) {
  try {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    // 確實驗證簽章 (如果密碼被改了，這裡算出來的 signature 會不一樣，直接擋掉)
    const signature = Utilities.computeHmacSha256Signature(parts[0] + "." + parts[1], dbPassword);
    if (parts[2] !== Utilities.base64EncodeWebSafe(signature)) return null;
    
    // 驗證是否過期
    const payloadBytes = Utilities.base64DecodeWebSafe(parts[1]);
    const payloadObj = JSON.parse(Utilities.newBlob(payloadBytes).getDataAsString());
    if (new Date().getTime() > payloadObj.exp) return null;
    
    return payloadObj;
  } catch(e) {
    return null;
  }
}

// ==========================================
// 系統維護模組：資料庫瘦身與效能優化
// ==========================================
// 定期封存舊訂單的專用腳本
function archiveOldOrders() {
  const lock = LockService.getScriptLock();
  try {
    // 允許等比較久，因為這是大範圍的背景資料轉移
    lock.waitLock(30000); 
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const orderSheet = ss.getSheetByName("ORDERS") || ss.getSheetByName("Orders");
    
    // 【修正 1】正確對應 History_Orders 分頁，若不存在則自動幫你建一個
    let archiveSheet = ss.getSheetByName("History_Orders"); 
    if (!archiveSheet) {
      archiveSheet = ss.insertSheet("History_Orders");
    }
    
    if (!orderSheet) return;
    
    // 這裡我們用 getValues 來保留原始 Date 型別，因為後續我們需要做精準日期轉換
    const values = orderSheet.getDataRange().getValues();
    if (values.length <= 1) return; // 只有標題列
    
    const headers = values[0];
    
    // 【修正 2】加上中英文與大小寫的容錯尋找機制，確保能精準捕捉到欄位
    const getColIdx = (aliases) => {
       for (let i = 0; i < headers.length; i++) {
           if (aliases.includes(String(headers[i]).trim())) return i;
       }
       return -1;
    };

    const statusColIdx = getColIdx(["Status", "狀態", "status"]);
    const dateColIdx = getColIdx(["DeliveryDate", "deliveryDate", "配送日期", "日期"]);
    
    if (statusColIdx === -1 || dateColIdx === -1) {
       console.error("無法封存：找不到 狀態 或 配送日期 表頭");
       return;
    }

    // 計算 90 天前的時間截點 (精準算到午夜 00:00:00)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoffDate = new Date(today.getTime() - (90 * 24 * 60 * 60 * 1000));
    
    const timeZone = ss.getSpreadsheetTimeZone() || "Asia/Taipei";
    const cutoffString = Utilities.formatDate(cutoffDate, timeZone, "yyyy-MM-dd");

    const activeOrders = [headers]; // 準備存回大表的資料
    const ordersToArchive = [];     // 準備搬去封存表的資料
    
    // 同步封存表的表頭
    if (archiveSheet.getLastRow() === 0 || archiveSheet.getDataRange().getValues()[0].length === 0) {
      archiveSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    
    // 從第 2 行開始掃描
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      // 確保將狀態轉大寫並去除空白，防止手動編輯時打錯如 " deleted "
      const status = String(row[statusColIdx] || '').trim().toUpperCase(); 
      let deliveryDate = row[dateColIdx]; 
      
      // 【修正 3】嚴格將日期轉化為標準的 "YYYY-MM-DD" 格式進行字串比對，杜絕格式導致的誤判
      let isOver90Days = false;
      if (deliveryDate) {
         let orderDate;
         if (deliveryDate instanceof Date) {
            orderDate = deliveryDate;
         } else {
            // 將所有格式轉換為安全的 V8 Date 物件解析，杜絕未補零的字串雷區
            const safeDateStr = String(deliveryDate).replace(/-/g, '/').substring(0, 10);
            orderDate = new Date(safeDateStr);
         }
         
         if (!isNaN(orderDate.getTime())) {
            // 直接以毫秒級的數值進行絕對大小比對，完全沒有誤差
            isOver90Days = orderDate.getTime() < cutoffDate.getTime();
         }
      }
      
      // 【關鍵決策點】：這裡目前還是嚴格要求 status === 'PAID' (已結清) 才搬移。
      // 若你希望「只要超過 90 天，無論是否結清一律強制歸檔」，請將下面這行改為：
      // if (status === 'DELETED' || isOver90Days) {
      
      if (status === 'DELETED' || (isOver90Days && status === 'PAID')) {
        // ★ 在推進陣列前，對這一列的所有儲存格進行「防禦性清洗」
        const cleanRow = row.map(cell => {
           if (cell instanceof Date) {
              // 捕捉 Google 專屬的時間地雷 (純時間都會被判定為 1899 年)
              if (cell.getFullYear() <= 1900) {
                 return Utilities.formatDate(cell, timeZone, "HH:mm");
              }
              // 如果是正常的出貨日期，則轉為乾淨的 YYYY-MM-DD
              return Utilities.formatDate(cell, timeZone, "yyyy-MM-dd");
           }
           return cell;
        });

        // 寫入清洗後的乾淨資料
        ordersToArchive.push(cleanRow);
      } else {
        // 同理，寫回 Orders 大表的活躍訂單也要保持乾淨
        const cleanRow = row.map(cell => {
           if (cell instanceof Date) {
              if (cell.getFullYear() <= 1900) return Utilities.formatDate(cell, timeZone, "HH:mm");
              return Utilities.formatDate(cell, timeZone, "yyyy-MM-dd");
           }
           return cell;
        });
        
        activeOrders.push(cleanRow);
      }
    }
    
    // 如果沒有資料需要封存，提早結束
    if (ordersToArchive.length === 0) return;
    
    // 1. 將過期與刪除的資料寫入 History_Orders 封存表 (Append，加在最後面)
    const archiveLastRow = Math.max(1, archiveSheet.getLastRow());
    safeSetValues(archiveSheet, archiveLastRow + 1, 1, ordersToArchive);
    
    // 2. 清除原始訂單大表，並將保留下來的活躍訂單回寫
    orderSheet.clearContents();
    safeSetValues(orderSheet, 1, 1, activeOrders);
    
  } catch (err) {
    console.error("封存腳本發生錯誤: " + err.toString());
  } finally {
    lock.releaseLock();
  }
}
