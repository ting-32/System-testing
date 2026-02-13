
// @ts-nocheck

const SS = SpreadsheetApp.getActiveSpreadsheet();

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
    CONFIG: getConfigSheet() // Use the helper
  };
}

function doGet(e) {
  const startDateStr = e.parameter.startDate;
  const data = getData(startDateStr);
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
      default:
        throw new Error("Unknown action: " + action);
    }
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

function getData(startDateStr) {
  const sheets = getSheets();
  
  // Helpers to get data as array of objects
  const getSheetData = (sheet) => {
    if (!sheet) return [];
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return []; // Only header or empty
    
    const values = sheet.getDataRange().getValues();
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
  };

  const customers = getSheetData(sheets.CUSTOMERS).map(c => ({
    id: c.ID || c.id,
    name: c.Name || c.name || c.客戶名稱,
    phone: c.Phone || c.phone || c.電話,
    deliveryTime: c.DeliveryTime || c.deliveryTime || c.配送時間,
    defaultItems: c.DefaultItems || c.defaultItems || c.預設品項JSON || c.預設品項, 
    priceList: c.PriceList || c.priceList || c.價目表JSON || c.價目表,
    offDays: c.OffDays || c.offDays || c.公休日週期JSON || c.公休日週期,
    holidayDates: c.HolidayDates || c.holidayDates || c.特定公休日JSON || c.特定公休日,
    deliveryMethod: c.DeliveryMethod || c.deliveryMethod || c.配送方式,
    paymentTerm: c.PaymentTerm || c.paymentTerm || c.付款週期,
    lastUpdated: c.LastUpdated ? new Date(c.LastUpdated).getTime() : 0
  }));

  const products = getSheetData(sheets.PRODUCTS).map(p => ({
    id: p.ID || p.id,
    name: p.Name || p.name || p.品項,
    unit: p.Unit || p.unit || p.單位,
    price: p.Price || p.price || p.單價,
    category: p.Category || p.category || p.分類,
    lastUpdated: p.LastUpdated ? new Date(p.LastUpdated).getTime() : 0
  }));

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
    lastUpdated: o.LastUpdated ? new Date(o.LastUpdated).getTime() : 0
  }));

  if (startDateStr) {
    const start = new Date(startDateStr);
    orders = orders.filter(o => new Date(o.deliveryDate) >= start);
  }

  return { customers, products, orders };
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
  
  // Ensure we have enough columns and LastUpdated header
  ensureHeader(sheet, "LastUpdated");
  
  // 檢查是否需要擴充欄位 (基本11欄 + LastUpdated 1欄 = 12)
  if (sheet.getMaxColumns() < 12) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 12 - sheet.getMaxColumns());
  }

  const timestamp = Utilities.formatDate(new Date(), SS.getSpreadsheetTimeZone(), "yyyy/MM/dd HH:mm:ss");
  const lastUpdatedTs = new Date().getTime(); // Unix timestamp for robust syncing
  
  const rows = orderData.items.map(item => [
    timestamp,
    orderData.id,
    orderData.customerName,
    orderData.deliveryDate,
    orderData.deliveryTime,
    item.productName || item.productId,
    item.quantity,
    orderData.note || "",
    orderData.status || "PENDING",
    orderData.deliveryMethod || "",
    item.unit || "斤",
    lastUpdatedTs // New Field
  ]);
  
  if (rows.length > 0) {
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, rows.length, 12).setValues(rows);
  }
  return true;
}

function updateOrderContent(orderData) {
  const sheet = getSheets().ORDERS;
  const lastUpdatedColIdx = ensureHeader(sheet, "LastUpdated"); // 0-based index
  const values = sheet.getDataRange().getValues();
  
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

  const timestamp = originalCreatedAt || Utilities.formatDate(new Date(), SS.getSpreadsheetTimeZone(), "yyyy/MM/dd HH:mm:ss");
  const newLastUpdatedTs = new Date().getTime();

  const rows = orderData.items.map(item => [
    timestamp,
    orderData.id,
    orderData.customerName,
    orderData.deliveryDate,
    orderData.deliveryTime,
    item.productName || item.productId,
    item.quantity,
    orderData.note || "",
    orderData.status || "PENDING",
    orderData.deliveryMethod || "",
    item.unit || "斤",
    newLastUpdatedTs
  ]);

  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 12).setValues(rows);
  }
  return true;
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
  return true;
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
       if (data.originalLastUpdated !== undefined && !data.force) {
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
    data.phone,
    data.deliveryTime,
    JSON.stringify(data.defaultItems),
    JSON.stringify(data.offDays),
    JSON.stringify(data.holidayDates),
    JSON.stringify(data.priceList),
    data.deliveryMethod,
    data.paymentTerm,
    newLastUpdatedTs
  ];
  
  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
  return true;
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
  return true;
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