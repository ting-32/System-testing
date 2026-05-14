
// @ts-nocheck

const SS = SpreadsheetApp.getActiveSpreadsheet();

// 👇 新增這個輔助函數：用來將試算表的 Date 物件格式化為乾淨的字串
function formatCellValue(val) {
  if (val instanceof Date) {
    // Google Sheets 將純時間儲存為 1899 年的日期
    if (val.getFullYear() <= 1900) {
      return Utilities.formatDate(val, SS.getSpreadsheetTimeZone(), "HH:mm");
    } else {
      return Utilities.formatDate(val, SS.getSpreadsheetTimeZone(), "yyyy/MM/dd HH:mm:ss");
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
    // 如果是新建的，預設密碼 8888 (字串格式)
    sheet.getRange("B1").setNumberFormat("@").setValue("8888"); 
  }
  return sheet;
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
        break;
      case "updateOrderContent":
        result = updateOrderContent(params.data);
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
        break;
      case "reorderProducts":
        result = reorderProducts(params.data);
        break;
      case "updateCustomer":
        result = updateCustomer(params.data);
        break;
      case "deleteCustomer":
        result = deleteCustomer(params.data);
        break;
      case "updateProduct":
        result = updateProduct(params.data);
        break;
      case "deleteProduct":
        result = deleteProduct(params.data);
        break;
      case "checkUpdates":
        result = checkUpdates();
        break;
      case "getOrder":
        result = getOrder(params.data);
        break;
      case "saveTrips":
        result = saveTrips(params.data);
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
    // 如果是版本衝突，回傳特定的 errorCode
    const isConflict = error.toString().includes("ERR_VERSION_CONFLICT");
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      error: error.toString(),
      errorCode: isConflict ? "ERR_VERSION_CONFLICT" : "UNKNOWN_ERROR"
    }))
      .setMimeType(ContentService.MimeType.JSON);
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
    status: o.Status || o.status || o.狀態,
    deliveryMethod: o.DeliveryMethod || o.deliveryMethod || o.配送方式,
    source: o.Source || o.source || o.資料來源 || '',
    lastUpdated: o.LastUpdated ? new Date(o.LastUpdated).getTime() : 0,
    trip: o.Trip || o.trip || o.趟次 || ''
  }));

  if (startDateStr) {
    const start = new Date(startDateStr);
    orders = orders.filter(o => new Date(o.deliveryDate) >= start);
  }

  if (since > 0) {
    orders = orders.filter(o => o.lastUpdated > since);
  }

  return { customers, products, orders, trips, serverGlobalTs: new Date().getTime() };
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
  
  const maxCol = Math.max(lastUpdatedColIdx, tripColIdx, sourceColIdx) + 1;
  if (sheet.getMaxColumns() < maxCol) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), maxCol - sheet.getMaxColumns());
  }

  const timestamp = Utilities.formatDate(new Date(), SS.getSpreadsheetTimeZone(), "yyyy/MM/dd HH:mm:ss");
  const lastUpdatedTs = new Date().getTime(); // Unix timestamp for robust syncing
  
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
    return row;
  });
  
  if (rows.length > 0) {
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, rows.length, maxCol).setValues(rows);
  }
  return { lastUpdated: lastUpdatedTs };
}

function updateOrderContent(orderData) {
  const sheet = getSheets().ORDERS;
  const lastUpdatedColIdx = ensureHeader(sheet, "LastUpdated"); // 0-based index
  const tripColIdx = ensureHeader(sheet, "Trip");
  const sourceColIdx = ensureHeader(sheet, "資料來源");
  const values = sheet.getDataRange().getValues();
  
  const maxCol = Math.max(lastUpdatedColIdx, tripColIdx, sourceColIdx) + 1;
  if (sheet.getMaxColumns() < maxCol) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), maxCol - sheet.getMaxColumns());
  }

  const targetId = String(orderData.id).trim();
  let originalCreatedAt = "";
  
  // 1. Conflict Detection Phase
  // Find ALL rows related to this order first to check timestamps
  // Since an order splits into multiple rows (items), checking one valid row is enough.
  for (let i = values.length - 1; i >= 1; i--) {
    const sheetId = String(values[i][1]).trim();
    if (sheetId === targetId) {
      const currentLastUpdated = values[i][lastUpdatedColIdx];
      // Only check conflict if force is not true
      if (!orderData.force) {
        checkVersionConflict(currentLastUpdated, orderData.originalLastUpdated);
      }
      // If we are here, no conflict for this row.
      // Capture creation time to preserve it
      if (!originalCreatedAt) originalCreatedAt = values[i][0];
    }
  }

  // 2. Deletion Phase (Safe to delete now)
  for (let i = values.length - 1; i >= 1; i--) {
    const sheetId = String(values[i][1]).trim();
    if (sheetId === targetId) {
      sheet.deleteRow(i + 1);
    }
  }

  let timestamp = formatCellValue(originalCreatedAt);
  if (!timestamp) {
    timestamp = Utilities.formatDate(new Date(), SS.getSpreadsheetTimeZone(), "yyyy/MM/dd HH:mm:ss");
  }
  const newLastUpdatedTs = new Date().getTime();

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
    row[lastUpdatedColIdx] = newLastUpdatedTs;
    row[tripColIdx] = orderData.trip || "";
    row[sourceColIdx] = orderData.source || "";
    return row;
  });

  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, maxCol).setValues(rows);
  }
  return { lastUpdated: newLastUpdatedTs };
}

function updateOrderStatus(data) {
  const sheet = getSheets().ORDERS;
  const lastUpdatedColIdx = ensureHeader(sheet, "LastUpdated");
  const values = sheet.getDataRange().getValues();
  let updated = false;
  const targetId = String(data.id).trim();
  const newLastUpdatedTs = new Date().getTime();
  
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][1]).trim() === targetId) {
      // Conflict check if provided and not forced
      if (data.originalLastUpdated !== undefined && !data.force) {
         checkVersionConflict(values[i][lastUpdatedColIdx], data.originalLastUpdated);
      }
      
      sheet.getRange(i + 1, 9).setValue(data.status); // Status column
      sheet.getRange(i + 1, lastUpdatedColIdx + 1).setValue(newLastUpdatedTs); // Update timestamp
      updated = true;
    }
  }
  
  if (!updated) throw new Error("Order not found: " + targetId);
  return { lastUpdated: newLastUpdatedTs };
}

function batchUpdateOrders(data) {
  const sheet = getSheets().ORDERS;
  const lastUpdatedColIdx = ensureHeader(sheet, "LastUpdated");
  const values = sheet.getDataRange().getValues();
  const updates = data.updates; // Array of { id: string, status: string, originalLastUpdated: number }
  const newLastUpdatedTs = new Date().getTime();
  let updatedCount = 0;
  
  // Create a map for fast lookup
  const updateMap = new Map();
  updates.forEach(u => updateMap.set(String(u.id).trim(), u));

  for (let i = 1; i < values.length; i++) {
    const rowId = String(values[i][1]).trim();
    if (updateMap.has(rowId)) {
      const updateData = updateMap.get(rowId);
      
      // Conflict check if provided and not forced
      if (!updateData.force && updateData.originalLastUpdated !== undefined) {
         checkVersionConflict(values[i][lastUpdatedColIdx], updateData.originalLastUpdated);
      }
      
      sheet.getRange(i + 1, 9).setValue(updateData.status); // Status column
      sheet.getRange(i + 1, lastUpdatedColIdx + 1).setValue(newLastUpdatedTs);
      updatedCount++;
    }
  }
  
  return { updatedCount, newLastUpdatedTs };
}

function batchUpdatePaymentStatus(data) {
  const sheet = getSheets().ORDERS;
  const lastUpdatedColIdx = ensureHeader(sheet, "LastUpdated");
  const values = sheet.getDataRange().getValues();
  const orderIds = new Set(data.orderIds.map(id => String(id).trim()));
  const newLastUpdatedTs = new Date().getTime();
  
  for (let i = 1; i < values.length; i++) {
    const id = String(values[i][1]).trim();
    if (orderIds.has(id)) {
      sheet.getRange(i + 1, 9).setValue(data.newStatus);
      sheet.getRange(i + 1, lastUpdatedColIdx + 1).setValue(newLastUpdatedTs);
    }
  }
  return true;
}

function deleteOrder(data) {
  const sheet = getSheets().ORDERS;
  const lastUpdatedColIdx = ensureHeader(sheet, "LastUpdated");
  const values = sheet.getDataRange().getValues();
  const targetId = String(data.id).trim();
  
  // Check conflict first
  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][1]).trim() === targetId) {
       if (!data.force && data.originalLastUpdated !== undefined) {
         checkVersionConflict(values[i][lastUpdatedColIdx], data.originalLastUpdated);
       }
    }
  }

  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][1]).trim() === targetId) {
      sheet.deleteRow(i + 1);
    }
  }
  return true;
}

function reorderProducts(orderedIds) {
  const sheet = getSheets().PRODUCTS;
  const lastUpdatedColIdx = ensureHeader(sheet, "LastUpdated");
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return true;

  const newLastUpdatedTs = new Date().getTime();

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
  const lastUpdatedColIdx = ensureHeader(sheet, "LastUpdated");
  const addressColIdx = ensureHeader(sheet, "地址");
  const coordinatesColIdx = ensureHeader(sheet, "座標位置");
  const autoOrderColIdx = ensureHeader(sheet, "自動建單開關");
  
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
  
  const newLastUpdatedTs = new Date().getTime();

  const baseRowData = [
    data.id,
    data.name,
    data.phone,
    data.deliveryTime,
    data.deliveryMethod,
    JSON.stringify(data.defaultItems || []),
    JSON.stringify(data.priceList || []),
    JSON.stringify(data.offDays || []),
    JSON.stringify(data.holidayDates || []),
    data.paymentTerm,
    data.defaultTrip || '',
    newLastUpdatedTs
  ];
  
  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, baseRowData.length).setValues([baseRowData]);
    sheet.getRange(rowIndex, addressColIdx + 1).setValue(data.address || '');
    sheet.getRange(rowIndex, coordinatesColIdx + 1).setValue(data.coordinates || '');
    
    // 確保欄位存在，且前端有傳來這個變數
    if (data.autoOrderEnabled !== undefined) {
      sheet.getRange(rowIndex, autoOrderColIdx + 1).setValue(data.autoOrderEnabled);
    }
  } else {
    const maxCol = Math.max(baseRowData.length, addressColIdx + 1, coordinatesColIdx + 1, autoOrderColIdx + 1);
    const newRow = new Array(maxCol).fill('');
    for(let i=0; i<baseRowData.length; i++) newRow[i] = baseRowData[i];
    newRow[addressColIdx] = data.address || '';
    newRow[coordinatesColIdx] = data.coordinates || '';
    
    // 確保欄位存在，且前端有傳來這個變數
    if (data.autoOrderEnabled !== undefined) {
      newRow[autoOrderColIdx] = data.autoOrderEnabled;
    }
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
  
  const newLastUpdatedTs = new Date().getTime();

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
    const rowDate = existingOrders[i][3]; // 第 4 欄 (Index 3) 是出貨日期
    const rowCustomer = existingOrders[i][2]; // 第 3 欄 (Index 2) 是客戶名稱
    const rowNote = existingOrders[i][7]; // 第 8 欄 (Index 7) 是備註
    const rowSource = existingOrders[i][sourceColIdx]; // 資料來源
    
    // 如果日期是今天，且備註包含「🤖 系統自動生成」或「🤖 自動建單」 或 資料來源包含「系統自動生成」
    if (rowDate === targetDateStr && (String(rowNote).includes("🤖 系統自動生成") || String(rowNote).includes("🤖 自動建單") || String(rowSource).includes("系統自動生成") || String(rowSource).includes("自動建單"))) {
      alreadyGeneratedCustomers.add(rowCustomer); // 將客戶名稱加入已建單名單
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
  const lastUpdatedTs = new Date().getTime();

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
            sheet.getRange(startRow, lastUpdatedColIdx + 1, numRows, 1).setValue(currentTs);
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
