
// @ts-nocheck

const SS = SpreadsheetApp.getActiveSpreadsheet();

let cachedTimeZone = null;

// 👇 新增這個輔助函數：用來將試算表的 Date 物件格式化為乾淨的字串
function formatCellValue(val) {
  if (val instanceof Date) {
    if (!cachedTimeZone) cachedTimeZone = SS.getSpreadsheetTimeZone() || "Asia/Taipei";
    // Google Sheets 將純時間儲存為 1899 年的日期
    if (val.getFullYear() <= 1900) {
      return Utilities.formatDate(val, cachedTimeZone, "HH:mm");
    } else {
      return Utilities.formatDate(val, cachedTimeZone, "yyyy/MM/dd HH:mm:ss");
    }
  }
  return val;
}

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
  const lock = LockService.getScriptLock();
  try {
    try {
      lock.waitLock(28000);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ 
        success: false, 
        error: "伺服器忙碌中，請稍後再試 (Lock Timeout)" 
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const params = JSON.parse(e.postData.contents);
    
    if (params.events && Array.isArray(params.events)) {
      return handleLineWebhook(params);
    }
    
    const action = params.action;
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
        writeSystemLog("UPDATE_ORDER", params.data.customerName || "未知", JSON.stringify({ id: params.data.id, customerName: params.data.customerName, _diff: params.data._diff || {} }));
        break;
      case "updateOrderStatus":
        result = updateOrderStatus(params.data);
        writeSystemLog("UPDATE_ORDER_STATUS", params.data.id ? `Order ID: ${params.data.id}` : "Batch", JSON.stringify({ status: params.data.status }));
        break;
      case "batchUpdateOrders":
        result = batchUpdateOrders(params.data);
        writeSystemLog("UPDATE_ORDER_BATCH", "多筆訂單", JSON.stringify({ updates: params.data.updates || params.data }));
        break;
      case "batchUpdatePaymentStatus":
        result = batchUpdatePaymentStatus(params.data);
        writeSystemLog("UPDATE_PAYMENT_BATCH", "多筆訂單", JSON.stringify({ count: (params.data.orderIds || []).length, paid: params.data.isPaid }));
        break;
      case "deleteOrder":
        result = deleteOrder(params.data);
        writeSystemLog("DELETE_ORDER", params.data.customerName || `Order ID: ${params.data.id || "未知"}`, JSON.stringify({ deletedId: params.data.id, customerName: params.data.customerName }));
        break;
      case "reorderProducts":
        result = reorderProducts(params.data);
        writeSystemLog("UPDATE_PRODUCT_ORDER", "商品列表", JSON.stringify({ updatedCount: (params.data.products || []).length }));
        break;
      case "updateCustomer":
        result = updateCustomer(params.data);
        writeSystemLog("UPDATE_CUSTOMER", params.data.name || "未知", JSON.stringify({ data: params.data }));
        break;
      case "deleteCustomer":
        result = deleteCustomer(params.data);
        writeSystemLog("DELETE_CUSTOMER", `Customer ID: ${params.data.id || "未知"}`, JSON.stringify({ deletedId: params.data.id }));
        break;
      case "updateProduct":
        result = updateProduct(params.data);
        writeSystemLog("UPDATE_PRODUCT", params.data.name || "未知", JSON.stringify({ data: params.data }));
        break;
      case "deleteProduct":
        result = deleteProduct(params.data);
        writeSystemLog("DELETE_PRODUCT", `Product ID: ${params.data.id || "未知"}`, JSON.stringify({ deletedId: params.data.id }));
        break;
      case "checkUpdates":
        result = checkUpdates();
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

    notifyFirebase();

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
    lock.releaseLock();
  }
}

// --- Logic Functions ---

function checkUpdates() {
  const sheets = getSheets();
  let maxTs = 0;
  
  ['ORDERS', 'CUSTOMERS', 'PRODUCTS'].forEach(sheetName => {
    const sheet = sheets[sheetName];
    if (!sheet) return;
    const lastCol = sheet.getLastColumn();
    if (lastCol === 0) return;
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const lastUpdatedColIdx = headers.indexOf("LastUpdated");
    if (lastUpdatedColIdx !== -1 && sheet.getLastRow() > 1) {
      const values = sheet.getRange(2, lastUpdatedColIdx + 1, sheet.getLastRow() - 1, 1).getValues();
      for (let i = 0; i < values.length; i++) {
        const ts = new Date(values[i][0]).getTime();
        if (ts && ts > maxTs) maxTs = ts;
      }
    }
  });
  
  return { globalLastUpdated: maxTs };
}

function getOrder(data) {
  const orderId = data.id;
  if (!orderId) throw new Error("Missing order ID");
  
  const sheets = getSheets();
  const sheet = sheets.ORDERS;
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  
  let orderRows = [];
  for (let i = 1; i < values.length; i++) {
    const rowId = String(values[i][1]).trim();
    if (rowId === String(orderId).trim()) {
      let obj = {};
      for (let j = 0; j < headers.length; j++) {
        obj[headers[j]] = formatCellValue(values[i][j]);
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
    lastUpdated: firstRow.LastUpdated ? new Date(firstRow.LastUpdated).getTime() : 0,
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
  return inputPassword === dbPassword;
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
  
  return true;
}

// 提取 getSheetData 以便共用，避免不必要的跨表全讀取導致逾時
function getSheetData(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return []; // Only header or empty
  
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const data = [];
  for (let i = 1; i < values.length; i++) {
    let obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = formatCellValue(values[i][j]);
    }
    data.push(obj);
  }
  return data;
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
        const res = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, { ranges: ranges });
        
        const parseBatch = (valRange, mapper) => {
          const values = valRange.values || [];
          if (values.length <= 1) return [];
          const headers = values[0];
          const data = [];
          for (let i = 1; i < values.length; i++) {
            let obj = {};
            for (let j = 0; j < headers.length; j++) obj[headers[j]] = formatCellValue(values[i][j]);
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
          lastUpdated: c.LastUpdated ? new Date(c.LastUpdated).getTime() : 0
        }));

        products = parseBatch(res.valueRanges[1], p => ({
          id: p.ID || p.id,
          name: p.Name || p.name || p.品項,
          unit: p.Unit || p.unit || p.單位,
          price: p.Price || p.price || p.單價,
          category: p.Category || p.category || p.分類,
          lastUpdated: p.LastUpdated ? new Date(p.LastUpdated).getTime() : 0
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
        lastUpdated: c.LastUpdated ? new Date(c.LastUpdated).getTime() : 0
      }));

      products = getSheetData(sheets.PRODUCTS).map(p => ({
        id: p.ID || p.id,
        name: p.Name || p.name || p.品項,
        unit: p.Unit || p.unit || p.單位,
        price: p.Price || p.price || p.單價,
        category: p.Category || p.category || p.分類,
        lastUpdated: p.LastUpdated ? new Date(p.LastUpdated).getTime() : 0
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

  const ordersRaw = getSheetData(sheets.ORDERS);
  let orders = ordersRaw.map(o => ({
    id: o.ID || o.id || o["Order ID"] || o.訂單ID,
    createdAt: o.CreatedAt || o.createdAt || o.建立時間,
    customerName: o.CustomerName || o.customerName || o.客戶名,
    deliveryDate: o.DeliveryDate || o.deliveryDate || o.配送日期,
    deliveryTime: o.DeliveryTime || o.deliveryTime || o.配送時間,
    productName: o.ProductName || o.productName || o.品項,
    quantity: o.Quantity || o.quantity || o.數量,
    unit: o.Unit || o.unit || o.單位,
    note: o.Note || o.note || o.備註,
    status: String(o.Status || o.status || o.狀態 || '').trim(),
    deliveryMethod: o.DeliveryMethod || o.deliveryMethod || o.配送方式,
    source: o.Source || o.source || o.資料來源 || '',
    lastUpdated: o.LastUpdated ? new Date(o.LastUpdated).getTime() : 0,
    trip: o.Trip || o.trip || o.趟次 || ''
  }));

  if (startDateStr) {
    const startStr = startDateStr.replace(/-/g, '');
    orders = orders.filter(o => {
      let d = o.deliveryDate;
      if (d instanceof Date) {
        if (!cachedTimeZone) cachedTimeZone = SS.getSpreadsheetTimeZone() || 'Asia/Taipei';
        d = Utilities.formatDate(d, cachedTimeZone, 'yyyyMMdd');
      } else {
        d = String(d || '').split(' ')[0].replace(/[\/-]/g, '');
      }
      return d >= startStr;
    });
  }

  if (since > 0) {
    orders = orders.filter(o => o.lastUpdated > since);
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

  return { customers, products, orders, trips, settings, serverGlobalTs: new Date().getTime() };
}

function getRemindRulesSheet() {
  let sheet = SS.getSheetByName("RemindRules");
  if (!sheet) {
    sheet = SS.insertSheet("RemindRules");
    sheet.appendRow(["規則ID", "規則名稱", "檢查週期", "檢查訂單日期", "提醒時間", "是否啟用", "自訂提醒內容", "判斷條件(包含AND/OR等詳細設定)"]);
    sheet.getRange(1, 1, 1, 8).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function saveRemindRulesToSheet(rules) {
  const sheet = getRemindRulesSheet();
  
  // Clear existing content except header
  const lastRow = Math.max(1, sheet.getLastRow()); // ensure we don't crash
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 8).clearContent();
  }
  
  if (!rules || rules.length === 0) return;
  
  const dataToRows = rules.map(rule => [
    rule.id || "",
    rule.name || "",
    Array.isArray(rule.schedule) ? rule.schedule.join(',') : (rule.schedule || ""),
    Array.isArray(rule.targetOrderDays) ? rule.targetOrderDays.join(',') : (rule.targetOrderDays || ""),
    rule.timeToNotify ? `'${String(rule.timeToNotify)}` : "",
    rule.isActive === false ? false : true,
    rule.customMessage || "",
    JSON.stringify(rule.conditions || [])
  ]);
  
  sheet.getRange(2, 1, dataToRows.length, 8).setValues(dataToRows);
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
    sheet.getRange(2, 1, rows.length, 1).setValues(rows);
  }
  
  return true;
}

// Helper to check for header and add if missing
function ensureHeader(sheet, headerName) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let index = headers.indexOf(headerName);
  if (index === -1) {
    index = headers.length;
    sheet.getRange(1, index + 1).setValue(headerName);
  }
  return index;
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
  const sheet = getSheets().ORDERS;
  
  // Ensure we have enough columns and headers
  const lastUpdatedColIdx = ensureHeader(sheet, "LastUpdated");
  const tripColIdx = ensureHeader(sheet, "Trip");
  const sourceColIdx = ensureHeader(sheet, "資料來源");
  const versionColIdx = ensureHeader(sheet, "Version");
  
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
    sheet.getRange(lastRow + 1, 1, rows.length, maxCol).setValues(rows);
  }
  return { lastUpdated: lastUpdatedTs, version: 1 };
}

function updateOrderContent(orderData) {
  const sheet = getSheets().ORDERS;
  const lastUpdatedColIdx = ensureHeader(sheet, "LastUpdated"); // 0-based index
  const tripColIdx = ensureHeader(sheet, "Trip");
  const sourceColIdx = ensureHeader(sheet, "資料來源");
  const versionColIdx = ensureHeader(sheet, "Version");
  
  const maxColReq = Math.max(lastUpdatedColIdx, tripColIdx, sourceColIdx, versionColIdx) + 1;
    if (sheet.getMaxColumns() < maxColReq) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), maxColReq - sheet.getMaxColumns());
    }

    const lastRow = sheet.getLastRow();
    const totalCols = sheet.getMaxColumns();

    let values = [];
    if (lastRow > 1) {
      values = sheet.getDataRange().getValues();
    }
    
    const targetId = String(orderData.id).trim();
    let originalCreatedAt = "";
    
    // 1. Conflict Detection Phase (In-Memory)
    let currentVersion = 0;
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

    let timestamp = formatCellValue(originalCreatedAt);
    if (!timestamp) {
      timestamp = Utilities.formatDate(new Date(), SS.getSpreadsheetTimeZone(), "yyyy/MM/dd HH:mm:ss");
    }
    const newLastUpdatedTs = String(new Date().getTime());

    // 2. Filter out old rows (In-Memory Deletion)
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

    // 3. Append new rows
    orderData.items.forEach(item => {
      const row = new Array(totalCols).fill("");
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
      row[lastUpdatedColIdx] = newLastUpdatedTs;
      row[tripColIdx] = orderData.trip || "";
      row[sourceColIdx] = orderData.source || "";
      row[versionColIdx] = currentVersion + 1; // 每次更新遞增 version
      newRows.push(row);
    });
    
    // 4. Batch Write Back
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, totalCols).clearContent();
    }
    
  if (newRows.length > 0) {
    sheet.getRange(2, 1, newRows.length, totalCols).setValues(newRows);
  }
  
  return { lastUpdated: newLastUpdatedTs, version: currentVersion + 1 };
}

function updateOrderStatus(data) {
  const sheet = getSheets().ORDERS;
  const lastUpdatedColIdx = ensureHeader(sheet, "LastUpdated");
  const versionColIdx = ensureHeader(sheet, "Version");
  const values = sheet.getDataRange().getValues();
  let updated = false;
  let newVersion = 0;
  const targetId = String(data.id).trim();
  const newLastUpdatedTs = String(new Date().getTime());
  
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][1]).trim() === targetId) {
      // Conflict check if provided and not forced
      const currentVersion = values[i][versionColIdx];
      if (data.version !== undefined && !data.force) {
         checkOrderVersionStrict(currentVersion, data.version);
      }
      
      newVersion = Number(currentVersion || 0) + 1;
      
      sheet.getRange(i + 1, 9).setValue(data.status); // Status column
      sheet.getRange(i + 1, lastUpdatedColIdx + 1).setValue(newLastUpdatedTs); // Update timestamp
      sheet.getRange(i + 1, versionColIdx + 1).setValue(newVersion); // bump version
      updated = true;
    }
  }
  
  if (!updated) throw new Error("Order not found: " + targetId);
  return { lastUpdated: newLastUpdatedTs, version: newVersion };
}

function batchUpdateOrders(data) {
  const sheet = getSheets().ORDERS;
  const lastUpdatedColIdx = ensureHeader(sheet, "LastUpdated");
  const versionColIdx = ensureHeader(sheet, "Version");
  const values = sheet.getDataRange().getValues();
  const updates = data.updates; // Array of { id: string, status: string, version: number }
  const newLastUpdatedTs = String(new Date().getTime());
  let updatedCount = 0;
  
  // Create a map for fast lookup
  const updateMap = new Map();
  updates.forEach(u => updateMap.set(String(u.id).trim(), u));

  let modified = false;
  for (let i = 1; i < values.length; i++) {
    const rowId = String(values[i][1]).trim();
    if (updateMap.has(rowId)) {
      const updateData = updateMap.get(rowId);
      const currentVersion = values[i][versionColIdx];
      
      // Conflict check if provided and not forced
      if (!updateData.force && updateData.version !== undefined) {
         checkOrderVersionStrict(currentVersion, updateData.version);
      }
      
      values[i][8] = updateData.status; // Status column (index 8 is col 9)
      values[i][lastUpdatedColIdx] = newLastUpdatedTs;
      values[i][versionColIdx] = Number(currentVersion || 0) + 1; // bump version
      updatedCount++;
      modified = true;
    }
  }
  
  if (modified && values.length > 1) {
    sheet.getRange(2, 1, values.length - 1, values[0].length).setValues(values.slice(1));
  }
  
  return { updatedCount, newLastUpdatedTs };
}

function batchUpdatePaymentStatus(data) {
  const sheet = getSheets().ORDERS;
  const lastUpdatedColIdx = ensureHeader(sheet, "LastUpdated");
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
    sheet.getRange(2, 1, values.length - 1, values[0].length).setValues(values.slice(1));
  }
  return true;
}

function deleteOrder(data) {
  const sheet = getSheets().ORDERS;
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) return false;

  const lastUpdatedColIdx = ensureHeader(sheet, "LastUpdated");
  const versionColIdx = ensureHeader(sheet, "Version");
  const statusColIdx = ensureHeader(sheet, "Status");
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
    if (String(values[i][1]).trim() === targetId) {
      if (!modified) {
        newVersion = Number(values[i][versionColIdx] || 0) + 1;
        modified = true;
      }
      
      // Update Status, LastUpdated, Version in memory
      values[i][statusColIdx] = 'DELETED';
      values[i][lastUpdatedColIdx] = tsString;
      values[i][versionColIdx] = newVersion;
    }
  }

  if (modified && values.length > 1) {
    sheet.getRange(2, 1, values.length - 1, values[0].length).setValues(values.slice(1));
  }
  return true;
}

function reorderProducts(orderedIds) {
  const sheet = getSheets().PRODUCTS;
  const lastUpdatedColIdx = ensureHeader(sheet, "LastUpdated");
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
  sheet.getRange(2, 1, newRows.length, newRows[0].length).setValues(newRows);
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
    sheet.getRange(rowIndex, 1, 1, newRow.length).setValues([newRow]);
  } else {
    sheet.appendRow(newRow);
  }
  
  return { lastUpdated: newLastUpdatedTs };
}

function deleteCustomer(data) {
  const sheet = getSheets().CUSTOMERS;
  const lastUpdatedColIdx = ensureHeader(sheet, "LastUpdated");
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
  const lastUpdatedColIdx = ensureHeader(sheet, "LastUpdated");
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
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
  return { lastUpdated: newLastUpdatedTs };
}

function deleteProduct(data) {
  const sheet = getSheets().PRODUCTS;
  const lastUpdatedColIdx = ensureHeader(sheet, "LastUpdated");
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
  
  const sourceColIdx = ensureHeader(orderSheet, "資料來源");
  const lastUpdatedColIdx = ensureHeader(orderSheet, "LastUpdated");
  const tripColIdx = ensureHeader(orderSheet, "Trip");
  
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
    
    // 【修改 1：統一型別】避免 Google Sheets 欄位為純 Date 物件，導致嚴格等於(===)比對失敗
    if (rowDate instanceof Date) {
      rowDate = Utilities.formatDate(rowDate, timeZone, "yyyy-MM-dd");
    }
    
    // 【修改 2：邏輯加強】只要明天 (targetDateStr) 已經有該客戶的訂單 (不論是手動建好的還是自動的)，
    // 就將他記到「已建單名單」，接下來就不會再幫這間店新增訂單了。
    if (rowDate === targetDateStr) {
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
        let rowsToUpdate = [];
        
        // 找出所有 LastUpdated 是空白的列
        for (let i = 0; i < lastUpdatedValues.length; i++) {
          if (!lastUpdatedValues[i][0]) {
            rowsToUpdate.push(i + 2); // 陣列索引從 0 開始，加上標題列與位移，剛好是 i + 2 列
          }
        }

        // 把這些空白的列補上當前的時間戳記
        rowsToUpdate.forEach(rowNum => {
          sheet.getRange(rowNum, lastUpdatedColIdx + 1).setValue(currentTs).setNumberFormat('0');
          isUpdated = true;
        });
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
  
  // Date format YYYY-MM-DD
  const todayStr = `${year}-${month}-${dateStr}`;
  
  const data = getData(todayStr, 0); // Only get orders from today onwards
  const customers = data.customers || [];
  
  let notifications = [];
  
  rules.forEach(rule => {
    // 定義初始偵測包
    let trace = { step: "INIT", message: "開始評估", customersEvaluated: 0, customersMatched: 0 };

    const logAndReturn = (status, details) => {
        if (!isDryRun) {
            writeTraceLog(triggerSource, rule.id, rule.name, status, details);
        }
        if (isDryRun) dryRunResults.push({ ruleId: rule.id, ruleName: rule.name, status, details });
    };

    if (forceRuleId && rule.id !== forceRuleId) return;

    if (!rule.isActive && rule.id !== forceRuleId) {
       logAndReturn("SKIPPED", { reason: "規則已停用" });
       return;
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
        return;
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
        return;
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
          const relevantOrders = targetOrders.filter(o => 
            o.customerName === customer.name && targetProducts.includes(o.productName || o.product?.name)
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
        return;
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
  });
  
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
        notifications.forEach(n => {
          try {
            UrlFetchApp.fetch(endpoint, {
              method: "post",
              headers: { 
                "Content-Type": "application/json",
                "Authorization": "Bearer " + channelToken 
              },
              payload: JSON.stringify({
                to: payloadTo,
                // 只放入當下的這則 message
                messages: [{ type: "text", text: n.message }]
              })
            });
            // 該則訊息發送成功，寫入成功 Log
            n.logSuccess();
          } catch(err) {
            console.log("LINE Messaging API failed: " + err.message);
            // 該則訊息發送失敗，寫入失敗 Log
            n.logError(err);
          }
        });
      } else {
         notifications.forEach(n => n.logSuccess());
      }
    } else {
        notifications.forEach(n => n.logError(new Error("未設定 LINE userId")));
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
