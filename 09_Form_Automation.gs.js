/************************************************************
 * 09_Form_Automation.gs
 * PrimeCare Form Automation
 ************************************************************/

function runPrimeCareRepair() {
  pcformSetupPrimeCareMissingStructure();
  return "PrimeCare repair completed.";
}

function runRepairOrdersSheetHeaders() {
  pcformRepairOrdersSheetHeaders_();
  return "Orders sheet repaired.";
}

function runRepairRawResponseSheet() {
  pcformRepairRawResponseSheet_();
  return "Raw response sheet repaired.";
}

function runSeedSettings() {
  pcformSeedSettingsIfMissing_();
  return "Settings seeded.";
}

function runFillMissingOrderDefaults() {
  pcformFillMissingOrderDefaults_();
  return "Missing order defaults filled.";
}

function handleOrderFormSubmit(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    if (!e || !e.range) {
      throw new Error("Form submit event object missing range.");
    }

    const rawSheet = e.range.getSheet();
    const rowNumber = e.range.getRow();

    if (rawSheet.getName() !== PCFORM.RAW_SHEET) {
      Logger.log("Skipping submit from non-raw sheet: " + rawSheet.getName());
      return;
    }

    pcformEnsureRawResponseStatusColumns_(rawSheet);
    const map = pcformGetHeaderIndexMap_(rawSheet);

    const existingStatus = map["Processing_Status"]
      ? String(rawSheet.getRange(rowNumber, map["Processing_Status"]).getValue() || "").trim()
      : "";

    const existingOrderId = map["Order_ID"]
      ? String(rawSheet.getRange(rowNumber, map["Order_ID"]).getValue() || "").trim()
      : "";

    const existingInvoiceId = map["Invoice_ID"]
      ? String(rawSheet.getRange(rowNumber, map["Invoice_ID"]).getValue() || "").trim()
      : "";

    if (existingStatus === "PROCESSED" || existingOrderId || existingInvoiceId) {
      Logger.log("Skipping already processed row: " + rowNumber);
      return;
    }

    if (map["Processing_Status"]) {
      rawSheet.getRange(rowNumber, map["Processing_Status"]).setValue("PROCESSING");
    }
    if (map["Processing_Message"]) {
      rawSheet.getRange(rowNumber, map["Processing_Message"]).setValue("In progress");
    }
    if (map["Processed_At"]) {
      rawSheet.getRange(rowNumber, map["Processed_At"]).setValue(new Date());
    }

    const payload = pcformParseFormSubmission_(e);
    pcformValidateFormPayload_(payload);

    const ids = pcformGenerateOrderAndInvoiceIds_();
    const pricedLines = pcformBuildPricedOrderLines_(payload, ids);
    const orderSummary = pcformBuildOrderSummary_(payload, ids, pricedLines);

    pcformWriteOrderHeader_(orderSummary);
    pcformWriteOrderLines_(pricedLines);
    pcformWriteInvoiceRegister_(orderSummary);
    pcformWriteExportRows_(orderSummary, pricedLines);
    pcformMarkRawResponseProcessed_(payload, ids);

    Logger.log("PrimeCare form processed successfully: " + ids.orderId);
  } catch (err) {
    pcformHandleFormProcessingError_(e, err);
    Logger.log("PrimeCare form processing failed: " + (err && err.message ? err.message : err));
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function pcformParseFormSubmission_(e) {
  if (!e || !e.range) {
    throw new Error("Form submit event object missing range.");
  }

  const sheet = e.range.getSheet();
  const rowNumber = e.range.getRow();
  const lastCol = sheet.getLastColumn();

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || "").trim());
  const values = sheet.getRange(rowNumber, 1, 1, lastCol).getValues()[0];

  const rowObj = {};
  headers.forEach((h, i) => {
    rowObj[h] = values[i];
  });

  let items = [];

  for (let i = 1; i <= 5; i++) {
    const productName = pcformGetFirstNonBlank_(rowObj, ["Product_" + i]);
    const quantityRaw = pcformGetFirstNonBlank_(rowObj, ["Qty_" + i]);

    if (String(productName || "").trim() !== "") {
      items.push({
        productName: String(productName || "").trim(),
        quantity: Number(quantityRaw || 0)
      });
    }
  }

  if (!items.length) {
    const productName = pcformGetFirstNonBlank_(rowObj, ["Product_Name", "Product Name"]);
    const quantityRaw = pcformGetFirstNonBlank_(rowObj, ["Quantity", "Qty"]);

    if (String(productName || "").trim() !== "") {
      items.push({
        productName: String(productName || "").trim(),
        quantity: Number(quantityRaw || 0)
      });
    }
  }

  if (!items.length) {
    const itemsJsonRaw = pcformGetFirstNonBlank_(rowObj, ["Items_JSON", "Items Json", "Items JSON"]);
    if (String(itemsJsonRaw || "").trim() !== "") {
      try {
        const parsed = JSON.parse(String(itemsJsonRaw).trim());
        if (Array.isArray(parsed)) {
          items = parsed
            .map(item => ({
              productName: String(
                item.productName ||
                item.Product_Name ||
                item.product ||
                item.name ||
                ""
              ).trim(),
              quantity: Number(
                item.quantity ||
                item.Quantity ||
                item.qty ||
                item.Qty ||
                0
              )
            }))
            .filter(item => item.productName && item.quantity > 0);
        }
      } catch (err) {
        throw new Error("Invalid Items_JSON format: " + err.message);
      }
    }
  }

  return {
    sourceSheetName: sheet.getName(),
    sourceRowNumber: rowNumber,
    responseTimestamp: pcformGetFirstNonBlank_(rowObj, ["Timestamp", "Response_Timestamp", "Response Timestamp", "Created_At"]) || new Date(),
    labId: String(pcformGetFirstNonBlank_(rowObj, ["Lab_ID", "Lab ID"]) || "").trim(),
    labName: String(pcformGetFirstNonBlank_(rowObj, ["Lab_Name", "Lab Name", "Lab_Name_Normalized"]) || "").trim(),
    contactPerson: String(pcformGetFirstNonBlank_(rowObj, ["Contact_Person", "Contact Name"]) || "").trim(),
    mobileNumber: String(pcformGetFirstNonBlank_(rowObj, ["Mobile_Number", "Phone"]) || "").trim(),
    emailAddress: String(pcformGetFirstNonBlank_(rowObj, ["Email_Address", "Email"]) || "").trim(),
    deliveryAddress: String(pcformGetFirstNonBlank_(rowObj, ["Delivery_Address", "Address"]) || "").trim(),
    notes: String(pcformGetFirstNonBlank_(rowObj, ["Notes"]) || "").trim(),
    items: items
  };
}

function pcformGetFirstNonBlank_(rowObj, keys) {
  for (let i = 0; i < keys.length; i++) {
    const v = rowObj[keys[i]];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return v;
    }
  }
  return "";
}

function pcformValidateFormPayload_(payload) {
  if (!payload.labId) throw new Error("Lab_ID is required.");
  if (!payload.labName) throw new Error("Lab_Name is required.");
  if (!payload.contactPerson) throw new Error("Contact_Person is required.");
  if (!payload.mobileNumber) throw new Error("Mobile_Number is required.");
  if (!payload.emailAddress) throw new Error("Email_Address is required.");
  if (!payload.items || !payload.items.length) throw new Error("At least one product must be submitted.");

  payload.items.forEach((item, idx) => {
    if (!item.productName) {
      throw new Error("Missing product name in item row " + (idx + 1));
    }
    if (!item.quantity || item.quantity <= 0) {
      throw new Error("Quantity must be greater than zero for product " + item.productName);
    }
  });

  const productMap = pcformGetProductMasterMap_();
  payload.items.forEach(item => {
    if (!productMap[item.productName]) {
      throw new Error("Product not found in Product_Master: " + item.productName);
    }
  });
}

function pcformGenerateOrderAndInvoiceIds_() {
  const orderPrefix = pcformGetSettingValueSafe_("Order_Prefix", "ORD");
  const invoicePrefix = pcformGetSettingValueSafe_("Invoice_Prefix", "INV");

  const now = new Date();
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd");
  const seq = pcformGetNextSequenceForToday_();

  return {
    orderId: orderPrefix + "-" + dateStr + "-" + pcformPadNumberLocal_(seq, 4),
    invoiceId: invoicePrefix + "-" + dateStr + "-" + pcformPadNumberLocal_(seq, 4)
  };
}

function pcformGetNextSequenceForToday_() {
  const ordersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PCFORM.ORDERS_SHEET);
  if (!ordersSheet || ordersSheet.getLastRow() < 2) return 1;

  const headerMap = pcformGetHeaderIndexMap_(ordersSheet);
  if (!headerMap["Order_ID"]) return 1;

  const values = ordersSheet
    .getRange(2, headerMap["Order_ID"], ordersSheet.getLastRow() - 1, 1)
    .getValues()
    .flat();

  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");
  const todaysCount = values.filter(v => String(v || "").indexOf(today) !== -1).length;
  return todaysCount + 1;
}

function pcformBuildPricedOrderLines_(payload, ids) {
  const productMap = pcformGetProductMasterMap_();
  const now = new Date();

  return payload.items.map((item, idx) => {
    const product = productMap[item.productName];
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(product.unitSellingPrice || 0);
    const taxRate = Number(product.taxRate || pcformGetSettingValueSafe_("Default_Tax_Rate", 0) || 0);

    const lineTotal = quantity * unitPrice;
    const taxAmount = lineTotal * taxRate;
    const netLineTotal = lineTotal + taxAmount;

    return {
      orderLineId: ids.orderId + "-L" + pcformPadNumberLocal_(idx + 1, 3),
      orderId: ids.orderId,
      invoiceId: ids.invoiceId,
      orderDate: now,
      labId: payload.labId,
      productId: product.productId,
      productName: product.productName,
      quantity: quantity,
      unitSellingPrice: unitPrice,
      lineTotal: lineTotal,
      taxRate: taxRate,
      taxAmount: taxAmount,
      netLineTotal: netLineTotal,
      createdAt: now
    };
  });
}

function pcformGetProductMasterMap_() {
  const sh = pcformGetRequiredSheet_(PCFORM.PRODUCT_MASTER_SHEET);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) throw new Error("Product_Master has no data.");

  const headers = data[0].map(h => String(h || "").trim());
  const idx = {};
  headers.forEach((h, i) => {
    idx[h] = i;
  });

  ["Product_ID", "Product_Name", "Unit_Selling_Price"].forEach(req => {
    if (idx[req] === undefined) {
      throw new Error("Missing required Product_Master column: " + req);
    }
  });

  const map = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const productName = String(row[idx["Product_Name"]] || "").trim();
    if (!productName) continue;

    const activeFlag = idx["Active_Flag"] !== undefined ? String(row[idx["Active_Flag"]] || "").trim() : "Y";
    if (activeFlag && activeFlag.toUpperCase() === "N") continue;

    map[productName] = {
      productId: String(row[idx["Product_ID"]] || "").trim(),
      productName: productName,
      unitSellingPrice: Number(row[idx["Unit_Selling_Price"]] || 0),
      taxRate: idx["Tax_Rate"] !== undefined ? Number(row[idx["Tax_Rate"]] || 0) : 0
    };
  }

  return map;
}

function pcformBuildOrderSummary_(payload, ids, pricedLines) {
  const now = new Date();
  const total = pricedLines.reduce((sum, line) => sum + Number(line.netLineTotal || 0), 0);

  return {
    orderId: ids.orderId,
    orderDate: now,
    responseTimestamp: payload.responseTimestamp,
    labId: payload.labId,
    labName: payload.labName,
    contactPerson: payload.contactPerson,
    mobileNumber: payload.mobileNumber,
    emailAddress: payload.emailAddress,
    deliveryAddress: payload.deliveryAddress,
    notes: payload.notes,
    invoiceId: ids.invoiceId,
    orderTotal: total,
    invoiceStatus: "Draft",
    paymentStatus: "Pending",
    source: "Google Form",
    sourceRowNumber: payload.sourceRowNumber,
    createdAt: now
  };
}

function pcformWriteOrderHeader_(orderSummary) {
  const sh = pcformGetRequiredSheet_(PCFORM.ORDERS_SHEET);
  const headers = pcformGetHeaderRow_(sh);

  const row = pcformBuildRowFromHeaders_(headers, {
    "Order_ID": orderSummary.orderId,
    "Order_Date": orderSummary.orderDate,
    "Lab_ID": orderSummary.labId,
    "Lab_Name": orderSummary.labName,
    "Invoice_ID": orderSummary.invoiceId,
    "Invoice_Status": "Draft",
    "Payment_Status": "Pending",
    "Contact_Person": orderSummary.contactPerson,
    "Mobile_Number": orderSummary.mobileNumber,
    "Email_Address": orderSummary.emailAddress,
    "Delivery_Address": orderSummary.deliveryAddress,
    "Notes": orderSummary.notes,
    "Created_At": orderSummary.createdAt,
    "Total_Amount": orderSummary.orderTotal,
    "Order_Total": orderSummary.orderTotal
  });

  sh.appendRow(row);
}

function pcformWriteOrderLines_(pricedLines) {
  const sh = pcformGetRequiredSheet_(PCFORM.ORDER_LINES_SHEET);
  const headers = pcformGetHeaderRow_(sh);

  const rows = pricedLines.map(line => pcformBuildRowFromHeaders_(headers, {
    "Order_Line_ID": line.orderLineId,
    "Order_ID": line.orderId,
    "Invoice_ID": line.invoiceId,
    "Order_Date": line.orderDate,
    "Lab_ID": line.labId,
    "Product_ID": line.productId,
    "Product_Name": line.productName,
    "Quantity": line.quantity,
    "Unit_Selling_Price": line.unitSellingPrice,
    "Line_Total": line.lineTotal,
    "Tax_Rate": line.taxRate,
    "Tax_Amount": line.taxAmount,
    "Net_Line_Total": line.netLineTotal,
    "Created_At": line.createdAt
  }));

  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function pcformWriteInvoiceRegister_(orderSummary) {
  const sh = pcformGetRequiredSheet_(PCFORM.INVOICE_REGISTER_SHEET);
  const headers = pcformGetHeaderRow_(sh);

  const row = pcformBuildRowFromHeaders_(headers, {
    "Invoice_ID": orderSummary.invoiceId,
    "Invoice_Date": orderSummary.orderDate,
    "Order_ID": orderSummary.orderId,
    "Lab_ID": orderSummary.labId,
    "Lab_Name": orderSummary.labName,
    "Email_Address": orderSummary.emailAddress,
    "Mobile_Number": orderSummary.mobileNumber,
    "Invoice_Total": orderSummary.orderTotal,
    "Invoice_HTML": "",
    "WhatsApp_Link": "",
    "Email_Sent_To_Lab": "No",
    "Email_Sent_To_Owner": "No",
    "ERP_Export_Status": "Pending",
    "Salesforce_Export_Status": "Pending",
    "Created_At": new Date()
  });

  sh.appendRow(row);
}

function pcformWriteExportRows_(orderSummary, pricedLines) {
  pcformWriteERPExportRows_(orderSummary, pricedLines);
  pcformWriteSalesforceExportRows_(orderSummary, pricedLines);
}

function pcformWriteERPExportRows_(orderSummary, pricedLines) {
  const sh = pcformGetRequiredSheet_(PCFORM.ERP_EXPORT_SHEET);
  const headers = pcformGetHeaderRow_(sh);

  const rows = pricedLines.map(line => pcformBuildRowFromHeaders_(headers, {
    "Invoice_ID": orderSummary.invoiceId,
    "Invoice_Date": orderSummary.orderDate,
    "Order_ID": orderSummary.orderId,
    "Lab_ID": orderSummary.labId,
    "Lab_Name": orderSummary.labName,
    "Product_ID": line.productId,
    "Product_Name": line.productName,
    "Quantity": line.quantity,
    "Unit_Selling_Price": line.unitSellingPrice,
    "Tax_Rate": line.taxRate,
    "Tax_Amount": line.taxAmount,
    "Line_Total": line.lineTotal,
    "Net_Line_Total": line.netLineTotal,
    "Payment_Status": orderSummary.paymentStatus,
    "Exported_At": new Date()
  }));

  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function pcformWriteSalesforceExportRows_(orderSummary, pricedLines) {
  const sh = pcformGetRequiredSheet_(PCFORM.SF_EXPORT_SHEET);
  const headers = pcformGetHeaderRow_(sh);

  const rows = pricedLines.map(line => pcformBuildRowFromHeaders_(headers, {
    "External_Order_ID": orderSummary.orderId,
    "External_Invoice_ID": orderSummary.invoiceId,
    "Account_External_ID": orderSummary.labId,
    "Account_Name": orderSummary.labName,
    "Contact_Email": orderSummary.emailAddress,
    "Contact_Mobile": orderSummary.mobileNumber,
    "Product_External_ID": line.productId,
    "Quantity": line.quantity,
    "Unit_Price": line.unitSellingPrice,
    "Invoice_Total": orderSummary.orderTotal,
    "Order_Date": orderSummary.orderDate,
    "Invoice_Date": orderSummary.orderDate,
    "PDF_Link": "",
    "Exported_At": new Date()
  }));

  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function pcformMarkRawResponseProcessed_(payload, ids) {
  const sh = pcformGetRequiredSheet_(PCFORM.RAW_SHEET);
  pcformEnsureRawResponseStatusColumns_(sh);

  const map = pcformGetHeaderIndexMap_(sh);
  const row = payload.sourceRowNumber;

  sh.getRange(row, map["Processing_Status"]).setValue("PROCESSED");
  sh.getRange(row, map["Processing_Message"]).setValue("Success");
  sh.getRange(row, map["Order_ID"]).setValue(ids.orderId);
  sh.getRange(row, map["Invoice_ID"]).setValue(ids.invoiceId);
  sh.getRange(row, map["Processed_At"]).setValue(new Date());
}

function pcformHandleFormProcessingError_(e, err) {
  try {
    if (!e || !e.range) return;

    const sh = e.range.getSheet();
    pcformEnsureRawResponseStatusColumns_(sh);
    const map = pcformGetHeaderIndexMap_(sh);
    const row = e.range.getRow();

    sh.getRange(row, map["Processing_Status"]).setValue("ERROR");
    sh.getRange(row, map["Processing_Message"]).setValue(String(err && err.message ? err.message : err));
    sh.getRange(row, map["Processed_At"]).setValue(new Date());
  } catch (innerErr) {
    Logger.log("Error while writing form processing error: " + innerErr.message);
  }
}

function pcformEnsureRawResponseStatusColumns_(sheet) {
  pcformCreateOrRepairSheet_(sheet.getName(), [
    "Processing_Status",
    "Processing_Message",
    "Order_ID",
    "Invoice_ID",
    "Processed_At"
  ]);
}

function pcformSetupPrimeCareMissingStructure() {
  pcformCreateOrRepairSheet_(PCFORM.ORDER_LINES_SHEET, [
    "Order_Line_ID", "Order_ID", "Invoice_ID", "Order_Date", "Lab_ID", "Product_ID",
    "Product_Name", "Quantity", "Unit_Selling_Price", "Line_Total", "Tax_Rate",
    "Tax_Amount", "Net_Line_Total", "Created_At"
  ]);

  pcformCreateOrRepairSheet_(PCFORM.INVOICE_REGISTER_SHEET, [
    "Invoice_ID", "Invoice_Date", "Order_ID", "Lab_ID", "Lab_Name", "Email_Address",
    "Mobile_Number", "Invoice_Total", "Invoice_HTML", "WhatsApp_Link",
    "Email_Sent_To_Lab", "Email_Sent_To_Owner",
    "ERP_Export_Status", "Salesforce_Export_Status", "Created_At"
  ]);

  pcformCreateOrRepairSheet_(PCFORM.SETTINGS_SHEET, ["Key", "Value"]);

  pcformCreateOrRepairSheet_(PCFORM.ERP_EXPORT_SHEET, [
    "Invoice_ID", "Invoice_Date", "Order_ID", "Lab_ID", "Lab_Name", "Product_ID",
    "Product_Name", "Quantity", "Unit_Selling_Price", "Tax_Rate", "Tax_Amount",
    "Line_Total", "Net_Line_Total", "Payment_Status", "Exported_At"
  ]);

  pcformCreateOrRepairSheet_(PCFORM.SF_EXPORT_SHEET, [
    "External_Order_ID", "External_Invoice_ID", "Account_External_ID", "Account_Name",
    "Contact_Email", "Contact_Mobile", "Product_External_ID", "Quantity", "Unit_Price",
    "Invoice_Total", "Order_Date", "Invoice_Date", "PDF_Link", "Exported_At"
  ]);

  pcformRepairOrdersSheetHeaders_();
  pcformRepairRawResponseSheet_();
  pcformSeedSettingsIfMissing_();
  pcformFillMissingOrderDefaults_();
}

function pcformRepairOrdersSheetHeaders_() {
  pcformCreateOrRepairSheet_(PCFORM.ORDERS_SHEET, [
    "Order_ID", "Order_Date", "Lab_ID", "Lab_Name", "Product_ID", "Product_Name",
    "Quantity", "Unit_Selling_Price", "Total_Amount", "Order_Total", "Invoice_ID", "Invoice_Status",
    "Payment_Status", "Contact_Person", "Mobile_Number", "Email_Address",
    "Delivery_Address", "Notes", "Created_At"
  ]);
}

function pcformRepairRawResponseSheet_() {
  const sh = pcformGetRequiredSheet_(PCFORM.RAW_SHEET);

  pcformCreateOrRepairSheet_(PCFORM.RAW_SHEET, [
    "Processing_Status", "Processing_Message", "Order_ID", "Invoice_ID", "Processed_At",
    "Email_Address", "Mobile_Number", "Contact_Person", "Lab_Name_Normalized"
  ]);

  const map = pcformGetHeaderIndexMap_(sh);
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return;

  const data = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();

  const emailSource = map["Email"] ? map["Email"] - 1 : (map["Email_Address"] ? map["Email_Address"] - 1 : -1);
  const phoneSource = map["Phone"] ? map["Phone"] - 1 : (map["Mobile_Number"] ? map["Mobile_Number"] - 1 : -1);
  const contactSource = map["Contact Name"] ? map["Contact Name"] - 1 : (map["Contact_Person"] ? map["Contact_Person"] - 1 : -1);
  const labNameSource = map["Lab Name"] ? map["Lab Name"] - 1 : (map["Lab_Name"] ? map["Lab_Name"] - 1 : -1);

  const emailTarget = map["Email_Address"] ? map["Email_Address"] - 1 : -1;
  const mobileTarget = map["Mobile_Number"] ? map["Mobile_Number"] - 1 : -1;
  const contactTarget = map["Contact_Person"] ? map["Contact_Person"] - 1 : -1;
  const labNameTarget = map["Lab_Name_Normalized"] ? map["Lab_Name_Normalized"] - 1 : -1;

  for (let i = 0; i < data.length; i++) {
    if (emailTarget >= 0 && emailSource >= 0 && !String(data[i][emailTarget] || "").trim()) data[i][emailTarget] = data[i][emailSource];
    if (mobileTarget >= 0 && phoneSource >= 0 && !String(data[i][mobileTarget] || "").trim()) data[i][mobileTarget] = data[i][phoneSource];
    if (contactTarget >= 0 && contactSource >= 0 && !String(data[i][contactTarget] || "").trim()) data[i][contactTarget] = data[i][contactSource];
    if (labNameTarget >= 0 && labNameSource >= 0 && !String(data[i][labNameTarget] || "").trim()) data[i][labNameTarget] = data[i][labNameSource];
  }

  sh.getRange(2, 1, data.length, lastCol).setValues(data);
}

function pcformSeedSettingsIfMissing_() {
  const sh = pcformGetRequiredSheet_(PCFORM.SETTINGS_SHEET);
  pcformCreateOrRepairSheet_(PCFORM.SETTINGS_SHEET, ["Key", "Value"]);

  const map = pcformGetHeaderIndexMap_(sh);
  const lastRow = sh.getLastRow();
  const existing = new Set();

  if (lastRow >= 2) {
    sh.getRange(2, map["Key"], lastRow - 1, 1).getValues().flat().forEach(v => {
      const key = String(v || "").trim();
      if (key) existing.add(key);
    });
  }

  const defaults = [
    ["Owner_Email", ""],
    ["Invoice_Prefix", "INV"],
    ["Order_Prefix", "ORD"],
    ["Default_Tax_Rate", 0]
  ];

  const rowsToAdd = defaults.filter(r => !existing.has(r[0]));
  if (rowsToAdd.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rowsToAdd.length, 2).setValues(rowsToAdd);
  }
}

function pcformFillMissingOrderDefaults_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PCFORM.ORDERS_SHEET);
  if (!sh || sh.getLastRow() < 2) return;

  const map = pcformGetHeaderIndexMap_(sh);
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  const data = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();

  const orderPrefix = pcformGetSettingValueSafe_("Order_Prefix", "ORD");
  const invoicePrefix = pcformGetSettingValueSafe_("Invoice_Prefix", "INV");
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");

  const orderIdCol = map["Order_ID"] ? map["Order_ID"] - 1 : -1;
  const invoiceIdCol = map["Invoice_ID"] ? map["Invoice_ID"] - 1 : -1;
  const invoiceStatusCol = map["Invoice_Status"] ? map["Invoice_Status"] - 1 : -1;
  const paymentStatusCol = map["Payment_Status"] ? map["Payment_Status"] - 1 : -1;
  const createdAtCol = map["Created_At"] ? map["Created_At"] - 1 : -1;
  const orderDateCol = map["Order_Date"] ? map["Order_Date"] - 1 : -1;

  let sequence = 1;
  const now = new Date();

  for (let i = 0; i < data.length; i++) {
    if (orderIdCol >= 0 && !String(data[i][orderIdCol] || "").trim()) {
      data[i][orderIdCol] = orderPrefix + "-" + today + "-" + pcformPadNumberLocal_(sequence, 4);
    }
    if (invoiceIdCol >= 0 && !String(data[i][invoiceIdCol] || "").trim()) {
      data[i][invoiceIdCol] = invoicePrefix + "-" + today + "-" + pcformPadNumberLocal_(sequence, 4);
    }
    if (invoiceStatusCol >= 0 && !String(data[i][invoiceStatusCol] || "").trim()) {
      data[i][invoiceStatusCol] = "Draft";
    }
    if (paymentStatusCol >= 0 && !String(data[i][paymentStatusCol] || "").trim()) {
      data[i][paymentStatusCol] = "Pending";
    }
    if (createdAtCol >= 0 && !data[i][createdAtCol]) {
      data[i][createdAtCol] = now;
    }
    if (orderDateCol >= 0 && !data[i][orderDateCol]) {
      data[i][orderDateCol] = now;
    }
    sequence++;
  }

  sh.getRange(2, 1, data.length, lastCol).setValues(data);
}

function pcformCreateOrRepairSheet_(sheetName, requiredHeaders) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(sheetName);

  if (!sh) {
    sh = ss.insertSheet(sheetName);
  }

  const existingLastCol = Math.max(sh.getLastColumn(), sh.getMaxColumns(), 1);
  const minCols = Math.max(existingLastCol, requiredHeaders.length, 20);
  const minRows = Math.max(sh.getMaxRows(), 100);

  if (sh.getMaxColumns() < minCols) {
    sh.insertColumnsAfter(sh.getMaxColumns(), minCols - sh.getMaxColumns());
  }

  if (sh.getMaxRows() < minRows) {
    sh.insertRowsAfter(sh.getMaxRows(), minRows - sh.getMaxRows());
  }

  const fullRange = sh.getRange(1, 1, minRows, minCols);
  fullRange.clearDataValidations();
  fullRange.clearNote();
  fullRange.breakApart();

  const existingHeaders = sh.getRange(1, 1, 1, minCols).getValues()[0].map(h => String(h || "").trim());
  const finalHeaders = existingHeaders.slice();

  requiredHeaders.forEach(header => {
    if (finalHeaders.indexOf(header) === -1) {
      const blankIdx = finalHeaders.findIndex(h => !h);
      if (blankIdx >= 0) {
        finalHeaders[blankIdx] = header;
      } else {
        finalHeaders.push(header);
      }
    }
  });

  while (finalHeaders.length < minCols) {
    finalHeaders.push(existingHeaders[finalHeaders.length] || "");
  }

  sh.getRange(1, 1, 1, finalHeaders.length).setValues([finalHeaders]);
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, Math.max(requiredHeaders.length, 1));
}

function pcformGetRequiredSheet_(sheetName) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh) throw new Error("Missing required sheet: " + sheetName);
  return sh;
}

function pcformGetHeaderIndexMap_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const map = {};
  headers.forEach((h, i) => {
    const key = String(h || "").trim();
    if (key) map[key] = i + 1;
  });
  return map;
}

function pcformGetHeaderRow_(sheet) {
  return sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1))
    .getValues()[0]
    .map(h => String(h || "").trim());
}

function pcformBuildRowFromHeaders_(headers, valuesObj) {
  return headers.map(h => valuesObj[h] !== undefined ? valuesObj[h] : "");
}

function pcformGetSettingValueSafe_(key, fallbackValue) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PCFORM.SETTINGS_SHEET);
  if (!sh || sh.getLastRow() < 2) return fallbackValue;

  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || "").trim() === key) {
      return values[i][1] !== "" ? values[i][1] : fallbackValue;
    }
  }
  return fallbackValue;
}

function pcformPadNumberLocal_(num, size) {
  let s = String(num);
  while (s.length < size) s = "0" + s;
  return s;
}

function pcformClearHeaderValidationsEverywhere_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheets().forEach(sh => {
    const cols = Math.max(sh.getMaxColumns(), 20);
    sh.getRange(1, 1, 1, cols).clearDataValidations().clearNote();
  });
}

function pcformNuclearClearForSettingsSheet_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Settings");
  if (!sh) return;

  const rows = Math.max(sh.getMaxRows(), 50);
  const cols = Math.max(sh.getMaxColumns(), 20);

  sh.getRange(1, 1, rows, cols)
    .clearDataValidations()
    .clearNote();
}

function runClearHeaderValidations() {
  pcformClearHeaderValidationsEverywhere_();
  return "Header validations cleared.";
}

function runNuclearClearSettingsSheet() {
  pcformNuclearClearForSettingsSheet_();
  return "Settings sheet validations/notes cleared.";
}

function runResetSettingsSheetCompletely() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const oldSheet = ss.getSheetByName("Settings");
  if (oldSheet) {
    ss.deleteSheet(oldSheet);
  }

  const sh = ss.insertSheet("Settings");
  sh.getRange(1, 1, 1, 2).setValues([["Key", "Value"]]);
  sh.setFrozenRows(1);

  sh.getRange(2, 1, 4, 2).setValues([
    ["Owner_Email", ""],
    ["Invoice_Prefix", "INV"],
    ["Order_Prefix", "ORD"],
    ["Default_Tax_Rate", 0]
  ]);

  return "Settings sheet fully reset.";
}