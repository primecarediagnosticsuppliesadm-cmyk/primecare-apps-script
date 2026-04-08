/************************************************************
 * PRIMECARE PHASE 1 + PHASE 2
 * Custom HTML/JS frontend + Apps Script backend
 ************************************************************/

const PC = {
  RAW_SHEET: "Form_Responses_Raw",
  ORDERS_SHEET: "Orders",
  ORDER_LINES_SHEET: "Order_Lines",
  INVOICE_REGISTER_SHEET: "Invoice_Register",
  PRODUCT_MASTER_SHEET: "Product_Master",
  SETTINGS_SHEET: "Settings",
  ERP_EXPORT_SHEET: "ERP_Export",
  SF_EXPORT_SHEET: "Salesforce_Export"
};

/* =========================================================
 * MENU
 * =======================================================*/
/*function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("PrimeCare App")
    .addItem("Open Order Form", "openOrderForm")
    .addItem("Setup / Repair Structure", "runPrimeCareSetup")
    .addToUi();
}*/

function openOrderForm() {
  const url = ScriptApp.getService().getUrl();
  SpreadsheetApp.getUi().alert("Open this app URL in browser:\n\n" + url);
}

/* =========================================================
 * WEB APP
 * =======================================================*/
/*function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) ? e.parameter.page : "form";

  if (page === "history") {
    return HtmlService.createHtmlOutputFromFile("OrderForm")
      .setTitle("PrimeCare Diagnostics Supplies - Lab Ordering Portal")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return HtmlService.createHtmlOutputFromFile("OrderForm")
    .setTitle("PrimeCare Diagnostics Supplies - Lab Ordering Portal")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}*/

/* =========================================================
 * PUBLIC APP FUNCTIONS FOR HTML
 * =======================================================*/
function pcGetAppBootstrapData() {
  return {
    products: pcGetProducts_(),
    ownerEmail: pcGetSettingValue_("Owner_Email", ""),
    companyName: pcGetSettingValue_("Business_Name",
                 pcGetSettingValue_("Company_Name", "PrimeCare Diagnostics Supplies"))
  };
}

function pcSubmitOrder(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    pcValidatePayload_(payload);
    pcCheckLabCreditAllowed_(payload.labId);

    const submissionToken = pcEnsureSubmissionToken_(payload);
    const existing = pcFindExistingSubmissionByToken_(submissionToken);

    if (existing && existing.processingStatus === "PROCESSED" && existing.orderId) {
      return pcBuildDuplicateResponse_(existing);
    }

    const ids = pcGenerateOrderAndInvoiceIds_();
    const pricedLines = pcBuildPricedOrderLines_(payload, ids);
    const orderSummary = pcBuildOrderSummary_(payload, ids, pricedLines);

    pcWriteRawSubmission_(payload, ids);
    pcWriteOrderHeader_(orderSummary);
    pcWriteOrderLines_(pricedLines);
    pcWriteExportRows_(orderSummary, pricedLines);

    const invoiceHtml = pcRenderInvoiceHtml_(orderSummary, pricedLines);
    const pdfMeta = pcGenerateInvoicePdf_(orderSummary, invoiceHtml);
    const whatsappLink = pcBuildWhatsAppLink_(orderSummary);

    pcWriteInvoiceRegister_(orderSummary, {
      invoiceHtml: invoiceHtml,
      fileId: pdfMeta.fileId,
      fileUrl: pdfMeta.fileUrl
    });

    pcSendEmails_(orderSummary, invoiceHtml, pdfMeta.blob);

    pcUpdateInvoiceRegisterDelivery_(orderSummary.invoiceId, {
      emailSentToLab: "Yes",
      emailSentToOwner: pcGetSettingValue_("Owner_Email", "") ? "Yes" : "No",
      whatsappLink: whatsappLink,
      fileId: pdfMeta.fileId,
      fileUrl: pdfMeta.fileUrl
    });

    return {
      success: true,
      duplicate: false,
      orderId: orderSummary.orderId,
      invoiceId: orderSummary.invoiceId,
      orderTotal: orderSummary.orderTotal,
      whatsappLink: whatsappLink,
      invoicePdfLink: pdfMeta.fileUrl
    };
  } catch (err) {
    throw new Error(err.message || err);
  } finally {
    lock.releaseLock();
  }
}

function pcGetOrderHistoryByLab(labId) {
  const cleanLabId = String(labId || "").trim();
  if (!cleanLabId) return [];

  const sh = pcGetRequiredSheet_(PC.ORDERS_SHEET);
  const rows = pcGetRowsAsObjects_(sh, "Order_ID");

  return rows
    .filter(r => String(r.Lab_ID || "").trim() === cleanLabId)
    .map(r => ({
      orderId: r.Order_ID || "",
      orderDate: r.Order_Date || "",
      invoiceId: r.Invoice_ID || "",
      invoiceStatus: r.Invoice_Status || "",
      paymentStatus: r.Payment_Status || "",
      totalAmount: r.Total_Amount || r.Order_Total || ""
    }))
    .sort((a, b) => String(b.orderDate).localeCompare(String(a.orderDate)));
}

/* =========================================================
 * SETUP
 * =======================================================*/
function runPrimeCareSetup() {
   pcCreateOrRepairSheet_(PC.RAW_SHEET, [
    "Created_At",
    "Submission_Token",
    "Lab_ID",
    "Lab_Name",
    "Contact_Person",
    "Mobile_Number",
    "Email_Address",
    "Delivery_Address",
    "Notes",
    "Items_JSON",
    "Order_ID",
    "Invoice_ID",
    "Processing_Status",
    "Processing_Message",
    "Processed_At"
  ]);

  pcCreateOrRepairSheet_(PC.ORDERS_SHEET, [
    "Order_ID",
    "Order_Date",
    "Lab_ID",
    "Lab_Name",
    "Contact_Person",
    "Mobile_Number",
    "Email_Address",
    "Delivery_Address",
    "Notes",
    "Invoice_ID",
    "Invoice_Status",
    "Payment_Status",
    "Order_Total",
    "Created_At"
  ]);

    pcCreateOrRepairSheet_("Lab_Pricing_Contracts", [
    "Lab_ID",
    "Product_ID",
    "Product_Name",
    "Contract_Unit_Price",
    "Effective_From",
    "Effective_To",
    "Active_Flag",
    "Notes"
  ]);

  pcCreateOrRepairSheet_(PC.ORDER_LINES_SHEET, [
    "Order_Line_ID",
    "Order_ID",
    "Invoice_ID",
    "Order_Date",
    "Lab_ID",
    "Product_ID",
    "Product_Name",
    "Quantity",
    "Unit_Selling_Price",
    "Line_Total",
    "Tax_Rate",
    "Tax_Amount",
    "Net_Line_Total",
    "Created_At"
  ]);

  pcCreateOrRepairSheet_(PC.INVOICE_REGISTER_SHEET, [
  "Invoice_ID",
  "Invoice_Date",
  "Order_ID",
  "Lab_ID",
  "Lab_Name",
  "Email_Address",
  "Mobile_Number",
  "Invoice_Total",
  "Invoice_HTML",
  "Invoice_PDF_File_ID",
  "Invoice_PDF_Link",
  "WhatsApp_Link",
  "Email_Sent_To_Lab",
  "Email_Sent_To_Owner",
  "ERP_Export_Status",
  "Salesforce_Export_Status",
  "Created_At"
]);

  pcCreateOrRepairSheet_(PC.ERP_EXPORT_SHEET, [
    "Invoice_ID",
    "Invoice_Date",
    "Order_ID",
    "Lab_ID",
    "Lab_Name",
    "Product_ID",
    "Product_Name",
    "Quantity",
    "Unit_Selling_Price",
    "Tax_Rate",
    "Tax_Amount",
    "Line_Total",
    "Net_Line_Total",
    "Payment_Status",
    "Exported_At"
  ]);

  pcCreateOrRepairSheet_(PC.SF_EXPORT_SHEET, [
    "External_Order_ID",
    "External_Invoice_ID",
    "Account_External_ID",
    "Account_Name",
    "Contact_Email",
    "Contact_Mobile",
    "Product_External_ID",
    "Quantity",
    "Unit_Price",
    "Invoice_Total",
    "Order_Date",
    "Invoice_Date",
    "Exported_At"
  ]);

  pcCreateOrRepairSheet_(PC.SETTINGS_SHEET, [
    "Key",
    "Value"
  ]);

   pcCreateOrRepairSheet_(PC.PRODUCT_MASTER_SHEET, [
    "Product_ID",
    "Product_Name",
    "Unit_Selling_Price",
    "Tax_Rate",
    "Unit_Cost",
    "Active_Flag"
  ]);

  pcSeedSettings_();
  return "PrimeCare setup completed.";
}

function pcSeedSettings_() {
  const sh = pcGetRequiredSheet_(PC.SETTINGS_SHEET);
  const existing = new Set();

  if (sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().flat().forEach(v => {
      const key = String(v || "").trim();
      if (key) existing.add(key);
    });
  }

  const defaults = [
    ["Owner_Email", ""],
    ["Order_Prefix", "ORD"],
    ["Invoice_Prefix", "INV"],
    ["Default_Tax_Rate", 0],
    ["Company_Name", "PrimeCare Diagnostics Supplies"],
    ["Invoice_PDF_Folder_Id", ""]
  ];

  const rowsToAdd = defaults.filter(r => !existing.has(r[0]));
  if (rowsToAdd.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rowsToAdd.length, 2).setValues(rowsToAdd);
  }
}

/* =========================================================
 * PRODUCTS
 * =======================================================*/
function pcGetProducts_() {
  const sh = pcGetRequiredSheet_(PC.PRODUCT_MASTER_SHEET);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0].map(h => String(h || "").trim());
  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  return data.slice(1)
    .filter(row => String(row[idx["Product_Name"]] || "").trim() !== "")
    .filter(row => {
      const flag = idx["Active_Flag"] !== undefined ? String(row[idx["Active_Flag"]] || "Y").trim().toUpperCase() : "Y";
      return flag !== "N";
    })
    .map(row => ({
      productId: String(row[idx["Product_ID"]] || "").trim(),
      productName: String(row[idx["Product_Name"]] || "").trim(),
      unitSellingPrice: Number(row[idx["Unit_Selling_Price"]] || 0),
      taxRate: idx["Tax_Rate"] !== undefined ? Number(row[idx["Tax_Rate"]] || 0) : 0
    }));
}

function pcGetProductMasterMap_() {
  const products = pcGetProducts_();
  const map = {};
  products.forEach(p => {
    map[p.productName] = p;
  });
  return map;
}

/* =========================================================
 * VALIDATION
 * =======================================================*/
function pcValidatePayload_(payload) {
  if (!payload) throw new Error("Missing payload.");
  if (!String(payload.labId || "").trim()) throw new Error("Lab ID is required.");
  if (!String(payload.labName || "").trim()) throw new Error("Lab Name is required.");
  if (!String(payload.contactPerson || "").trim()) throw new Error("Contact Person is required.");
  if (!String(payload.mobileNumber || "").trim()) throw new Error("Mobile Number is required.");
  if (!String(payload.emailAddress || "").trim()) throw new Error("Email Address is required.");

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) throw new Error("At least one item is required.");

  const productMap = pcGetProductMasterMap_();

  items.forEach((item, idx) => {
    const productName = String(item.productName || "").trim();
    const qty = Number(item.quantity || 0);

    if (!productName) throw new Error("Missing product in item row " + (idx + 1));
    if (!productMap[productName]) throw new Error("Product not found in Product_Master: " + productName);
    if (qty <= 0) throw new Error("Quantity must be greater than zero for " + productName);
  });
}

/* =========================================================
 * ID GENERATION
 * =======================================================*/
function pcGenerateOrderAndInvoiceIds_() {
  const orderPrefix = pcGetSettingValue_("Order_Prefix", "ORD");
  const invoicePrefix = pcGetSettingValue_("Invoice_Prefix", "INV");
  const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");
  const seq = pcGetNextSequenceForToday_();

  return {
    orderId: orderPrefix + "-" + dateStr + "-" + pcPad_(seq, 4),
    invoiceId: invoicePrefix + "-" + dateStr + "-" + pcPad_(seq, 4)
  };
}

function pcGetNextSequenceForToday_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PC.ORDERS_SHEET);
  if (!sh || sh.getLastRow() < 2) return 1;

  const map = pcGetHeaderMap_(sh);
  if (!map["Order_ID"]) return 1;

  const values = sh.getRange(2, map["Order_ID"], sh.getLastRow() - 1, 1).getValues().flat();
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd");
  return values.filter(v => String(v || "").indexOf(today) !== -1).length + 1;
}

/* =========================================================
 * ORDER BUILD
 * =======================================================*/
function pcBuildPricedOrderLines_(payload, ids) {
  const productMap = pcGetProductMasterMap_();
  const contractMap = pcGetLabPricingContractMap_(payload.labId);
  const now = new Date();

  return payload.items.map((item, idx) => {
    const product = productMap[String(item.productName || "").trim()];
    const quantity = Number(item.quantity || 0);

    const baseUnitPrice = Number(product.unitSellingPrice || 0);
    const contractUnitPrice = contractMap[product.productId];
    const finalUnitPrice = contractUnitPrice !== undefined ? Number(contractUnitPrice) : baseUnitPrice;

    const taxRate = Number(product.taxRate || pcGetSettingValue_("Default_Tax_Rate", 0) || 0);
    const lineTotal = quantity * finalUnitPrice;
    const taxAmount = lineTotal * taxRate;
    const netLineTotal = lineTotal + taxAmount;

    return {
      orderLineId: ids.orderId + "-L" + pcPad_(idx + 1, 3),
      orderId: ids.orderId,
      invoiceId: ids.invoiceId,
      orderDate: now,
      labId: payload.labId,
      productId: product.productId,
      productName: product.productName,
      quantity: quantity,
      unitSellingPrice: finalUnitPrice,
      lineTotal: lineTotal,
      taxRate: taxRate,
      taxAmount: taxAmount,
      netLineTotal: netLineTotal,
      createdAt: now
    };
  });
}

function pcBuildOrderSummary_(payload, ids, pricedLines) {
  const now = new Date();
  const orderTotal = pricedLines.reduce((sum, x) => sum + Number(x.netLineTotal || 0), 0);

  return {
    orderId: ids.orderId,
    orderDate: now,
    labId: String(payload.labId || "").trim(),
    labName: String(payload.labName || "").trim(),
    contactPerson: String(payload.contactPerson || "").trim(),
    mobileNumber: String(payload.mobileNumber || "").trim(),
    emailAddress: String(payload.emailAddress || "").trim(),
    deliveryAddress: String(payload.deliveryAddress || "").trim(),
    notes: String(payload.notes || "").trim(),
    invoiceId: ids.invoiceId,
    invoiceStatus: "Draft",
    paymentStatus: "Pending",
    orderTotal: orderTotal,
    createdAt: now
  };
}

/* =========================================================
 * WRITES
 * =======================================================*/
function pcWriteRawSubmission_(payload, ids) {
  const sh = pcGetRequiredSheet_(PC.RAW_SHEET);
  const headers = pcGetHeaderRow_(sh);

  const row = pcBuildRowFromHeaders_(headers, {
    "Created_At": new Date(),
    "Submission_Token": payload.submissionToken || "",
    "Lab_ID": payload.labId,
    "Lab_Name": payload.labName,
    "Contact_Person": payload.contactPerson,
    "Mobile_Number": payload.mobileNumber,
    "Email_Address": payload.emailAddress,
    "Delivery_Address": payload.deliveryAddress,
    "Notes": payload.notes,
    "Items_JSON": JSON.stringify(payload.items || []),
    "Order_ID": ids.orderId,
    "Invoice_ID": ids.invoiceId,
    "Processing_Status": "PROCESSED",
    "Processing_Message": "Success",
    "Processed_At": new Date()
  });

  sh.appendRow(row);
}

function pcWriteOrderHeader_(orderSummary) {
  const sh = pcGetRequiredSheet_(PC.ORDERS_SHEET);
  const headers = pcGetHeaderRow_(sh);

  const row = pcBuildRowFromHeaders_(headers, {
    "Order_ID": orderSummary.orderId,
    "Order_Date": orderSummary.orderDate,
    "Lab_ID": orderSummary.labId,
    "Lab_Name": orderSummary.labName,
    "Contact_Person": orderSummary.contactPerson,
    "Mobile_Number": orderSummary.mobileNumber,
    "Email_Address": orderSummary.emailAddress,
    "Delivery_Address": orderSummary.deliveryAddress,
    "Notes": orderSummary.notes,
    "Invoice_ID": orderSummary.invoiceId,
    "Invoice_Status": orderSummary.invoiceStatus,
    "Payment_Status": orderSummary.paymentStatus,
    "Order_Total": orderSummary.orderTotal,
    "Created_At": orderSummary.createdAt
  });

  sh.appendRow(row);
}

function pcWriteOrderLines_(pricedLines) {
  const sh = pcGetRequiredSheet_(PC.ORDER_LINES_SHEET);
  const headers = pcGetHeaderRow_(sh);

  const rows = pricedLines.map(line => pcBuildRowFromHeaders_(headers, {
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

function pcWriteInvoiceRegister_(orderSummary, invoiceMeta) {
  const sh = pcGetRequiredSheet_(PC.INVOICE_REGISTER_SHEET);
  const headers = pcGetHeaderRow_(sh);

  const row = pcBuildRowFromHeaders_(headers, {
    "Invoice_ID": orderSummary.invoiceId,
    "Invoice_Date": orderSummary.orderDate,
    "Order_ID": orderSummary.orderId,
    "Lab_ID": orderSummary.labId,
    "Lab_Name": orderSummary.labName,
    "Email_Address": orderSummary.emailAddress,
    "Mobile_Number": orderSummary.mobileNumber,
    "Invoice_Total": orderSummary.orderTotal,
    "Invoice_HTML": invoiceMeta && invoiceMeta.invoiceHtml ? invoiceMeta.invoiceHtml : "",
    "Invoice_PDF_File_ID": invoiceMeta && invoiceMeta.fileId ? invoiceMeta.fileId : "",
    "Invoice_PDF_Link": invoiceMeta && invoiceMeta.fileUrl ? invoiceMeta.fileUrl : "",
    "WhatsApp_Link": "",
    "Email_Sent_To_Lab": "No",
    "Email_Sent_To_Owner": "No",
    "ERP_Export_Status": "Pending",
    "Salesforce_Export_Status": "Pending",
    "Created_At": new Date()
  });

  sh.appendRow(row);
}

function pcWriteExportRows_(orderSummary, pricedLines) {
  pcWriteERPExportRows_(orderSummary, pricedLines);
  pcWriteSalesforceExportRows_(orderSummary, pricedLines);
}

function pcWriteERPExportRows_(orderSummary, pricedLines) {
  const sh = pcGetRequiredSheet_(PC.ERP_EXPORT_SHEET);
  const headers = pcGetHeaderRow_(sh);

  const rows = pricedLines.map(line => pcBuildRowFromHeaders_(headers, {
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

function pcWriteSalesforceExportRows_(orderSummary, pricedLines) {
  const sh = pcGetRequiredSheet_(PC.SF_EXPORT_SHEET);
  const headers = pcGetHeaderRow_(sh);

  const rows = pricedLines.map(line => pcBuildRowFromHeaders_(headers, {
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
    "Exported_At": new Date()
  }));

  if (rows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

/* =========================================================
 * INVOICE / EMAIL / WHATSAPP
 * =======================================================*/
function pcRenderInvoiceHtml_(orderSummary, pricedLines) {
  const tpl = HtmlService.createTemplateFromFile("InvoiceTemplate");
  tpl.order = orderSummary;
  tpl.lines = pricedLines;
  tpl.companyName = pcGetSettingValue_("Company_Name", "PrimeCare Diagnostics Supplies");
  return tpl.evaluate().getContent();
}

function pcSendEmails_(orderSummary, invoiceHtml, invoicePdfBlob) {
  const subject = "PrimeCare Invoice " + orderSummary.invoiceId;
  const body =
    "Dear " + orderSummary.labName + ",\n\n" +
    "Your order has been received.\n" +
    "Invoice ID: " + orderSummary.invoiceId + "\n" +
    "Order ID: " + orderSummary.orderId + "\n" +
    "Amount: ₹" + orderSummary.orderTotal + "\n\n" +
    "Regards,\nPrimeCare Diagnostics Supplies";

  const mailOptions = {
    subject: subject,
    body: body,
    htmlBody: invoiceHtml,
    attachments: invoicePdfBlob ? [invoicePdfBlob] : []
  };

  MailApp.sendEmail({
    to: orderSummary.emailAddress,
    subject: mailOptions.subject,
    body: mailOptions.body,
    htmlBody: mailOptions.htmlBody,
    attachments: mailOptions.attachments
  });

  const ownerEmail = pcGetSettingValue_("Owner_Email", "");
  if (ownerEmail) {
    MailApp.sendEmail({
      to: ownerEmail,
      subject: "[Owner Copy] " + subject,
      body: body,
      htmlBody: invoiceHtml,
      attachments: invoicePdfBlob ? [invoicePdfBlob] : []
    });
  }
}

function pcBuildWhatsAppLink_(orderSummary) {
  const phone = String(orderSummary.mobileNumber || "").replace(/\D/g, "");
  if (!phone) return "";

  const msg =
    "Dear " + orderSummary.labName +
    ", your PrimeCare invoice " + orderSummary.invoiceId +
    " for ₹" + orderSummary.orderTotal +
    " has been generated. Thank you.";

  return "https://wa.me/" + phone + "?text=" + encodeURIComponent(msg);
}

function pcUpdateInvoiceRegisterDelivery_(invoiceId, meta) {
  const sh = pcGetRequiredSheet_(PC.INVOICE_REGISTER_SHEET);
  const map = pcGetHeaderMap_(sh);
  if (!map["Invoice_ID"]) return;

  const values = sh.getRange(2, map["Invoice_ID"], Math.max(sh.getLastRow() - 1, 0), 1).getValues().flat();
  let rowNumber = null;

  for (let i = 0; i < values.length; i++) {
    if (String(values[i] || "").trim() === String(invoiceId || "").trim()) {
      rowNumber = i + 2;
      break;
    }
  }

  if (!rowNumber) return;

  if (map["Email_Sent_To_Lab"] && meta.emailSentToLab !== undefined) {
    sh.getRange(rowNumber, map["Email_Sent_To_Lab"]).setValue(meta.emailSentToLab);
  }
  if (map["Email_Sent_To_Owner"] && meta.emailSentToOwner !== undefined) {
    sh.getRange(rowNumber, map["Email_Sent_To_Owner"]).setValue(meta.emailSentToOwner);
  }
  if (map["WhatsApp_Link"] && meta.whatsappLink !== undefined) {
    sh.getRange(rowNumber, map["WhatsApp_Link"]).setValue(meta.whatsappLink);
  }
  if (map["Invoice_PDF_File_ID"] && meta.fileId !== undefined) {
    sh.getRange(rowNumber, map["Invoice_PDF_File_ID"]).setValue(meta.fileId);
  }
  if (map["Invoice_PDF_Link"] && meta.fileUrl !== undefined) {
    sh.getRange(rowNumber, map["Invoice_PDF_Link"]).setValue(meta.fileUrl);
  }
}

/* =========================================================
 * HELPERS
 * =======================================================*/
function pcCreateOrRepairSheet_(sheetName, requiredHeaders) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(sheetName);

  if (!sh) {
    sh = ss.insertSheet(sheetName);
  }

  const needCols = Math.max(requiredHeaders.length, 20);
  if (sh.getMaxColumns() < needCols) {
    sh.insertColumnsAfter(sh.getMaxColumns(), needCols - sh.getMaxColumns());
  }

  const headerRange = sh.getRange(1, 1, 1, needCols);
  headerRange.clearDataValidations();
  headerRange.clearNote();

  sh.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);

  if (needCols > requiredHeaders.length) {
    sh.getRange(1, requiredHeaders.length + 1, 1, needCols - requiredHeaders.length).clearContent();
  }

  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, requiredHeaders.length);
}

function pcGetRequiredSheet_(sheetName) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sh) throw new Error("Missing required sheet: " + sheetName);
  return sh;
}

function pcGetHeaderMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  const map = {};
  headers.forEach((h, i) => {
    const key = String(h || "").trim();
    if (key) map[key] = i + 1;
  });
  return map;
}

function pcGetHeaderRow_(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h || "").trim());
}

function pcBuildRowFromHeaders_(headers, valuesObj) {
  return headers.map(h => valuesObj[h] !== undefined ? valuesObj[h] : "");
}

function pcGetRowsAsObjects_(sheet, primaryKeyHeader) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => String(h || "").trim());
  const pkIndex = primaryKeyHeader ? headers.indexOf(primaryKeyHeader) : -1;
  const out = [];

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (pkIndex >= 0 && !String(row[pkIndex] || "").trim()) continue;

    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    out.push(obj);
  }

  return out;
}

function pcGetSettingValue_(key, fallbackValue) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PC.SETTINGS_SHEET);
  if (!sh || sh.getLastRow() < 2) return fallbackValue;

  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0] || "").trim() === key) {
      return data[i][1] !== "" ? data[i][1] : fallbackValue;
    }
  }
  return fallbackValue;
}

function pcPad_(num, size) {
  let s = String(num);
  while (s.length < size) s = "0" + s;
  return s;
}

function pcCheckLabCreditAllowed_(labId) {
  const sh = pcGetRequiredSheet_("AR_Credit_Control");
  const map = pcGetHeaderMap_(sh);

  if (!map["Lab_ID"] || !map["Credit_Hold"]) return;

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;

  const values = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();

  for (let i = 0; i < values.length; i++) {
    const rowLabId = String(values[i][map["Lab_ID"] - 1] || "").trim();
    if (rowLabId !== String(labId || "").trim()) continue;

    const hold = String(values[i][map["Credit_Hold"] - 1] || "").trim().toUpperCase();
    if (hold === "HOLD") {
      throw new Error("This lab is on CREDIT HOLD. Order cannot be submitted until payment review is completed.");
    }
    return;
  }
}

/* =========================================================
 * INVENTORY DEDUCTION ON DELIVERY
 * =======================================================*/

function pcMarkOrderDelivered(orderId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const cleanOrderId = String(orderId || "").trim();
    if (!cleanOrderId) throw new Error("Order ID is required.");

    const ordersSh = pcGetRequiredSheet_(PC.ORDERS_SHEET);
    const orderLinesSh = pcGetRequiredSheet_(PC.ORDER_LINES_SHEET);
    const inventorySh = pcGetRequiredSheet_("Inventory");

    const ordersMap = pcGetHeaderMap_(ordersSh);
    const linesMap = pcGetHeaderMap_(orderLinesSh);
    const invMap = pcGetHeaderMap_(inventorySh);

    if (!ordersMap["Order_ID"]) throw new Error("Orders sheet missing Order_ID header.");
    if (!ordersMap["Invoice_Status"]) throw new Error("Orders sheet missing Invoice_Status header.");
    if (!linesMap["Order_ID"] || !linesMap["Product_ID"] || !linesMap["Quantity"]) {
      throw new Error("Order_Lines sheet missing one of: Order_ID, Product_ID, Quantity.");
    }
    if (!invMap["Product_ID"] || !invMap["Current_Stock"]) {
      throw new Error("Inventory sheet missing one of: Product_ID, Current_Stock.");
    }

    const orderRowNumber = pcFindRowByValue_(ordersSh, ordersMap["Order_ID"], cleanOrderId);
    if (!orderRowNumber) throw new Error("Order not found: " + cleanOrderId);

    const alreadyDelivered =
      ordersMap["Order_Status"]
        ? String(ordersSh.getRange(orderRowNumber, ordersMap["Order_Status"]).getValue() || "").trim().toUpperCase() === "DELIVERED"
        : false;

    if (alreadyDelivered) {
      return "Order already marked as Delivered. No additional inventory deduction applied.";
    }

    const lineRows = pcGetOrderLinesByOrderId_(orderLinesSh, cleanOrderId);
    if (!lineRows.length) throw new Error("No order lines found for Order ID: " + cleanOrderId);

    pcApplyInventoryDeductionFromLines_(inventorySh, lineRows);

    if (ordersMap["Order_Status"]) {
      ordersSh.getRange(orderRowNumber, ordersMap["Order_Status"]).setValue("Delivered");
    }
    if (ordersMap["Invoice_Status"]) {
      const currentInvoiceStatus = String(
        ordersSh.getRange(orderRowNumber, ordersMap["Invoice_Status"]).getValue() || ""
      ).trim();
      if (!currentInvoiceStatus) {
        ordersSh.getRange(orderRowNumber, ordersMap["Invoice_Status"]).setValue("Sent");
      }
    }

    return "Order marked as Delivered and inventory updated successfully for " + cleanOrderId;
  } finally {
    lock.releaseLock();
  }
}

function pcGetOrderLinesByOrderId_(orderLinesSh, orderId) {
  const values = orderLinesSh.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => String(h || "").trim());
  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  return values.slice(1)
    .filter(row => String(row[idx["Order_ID"]] || "").trim() === String(orderId || "").trim())
    .map(row => ({
      productId: String(row[idx["Product_ID"]] || "").trim(),
      quantity: Number(row[idx["Quantity"]] || 0)
    }))
    .filter(x => x.productId && x.quantity > 0);
}

function pcApplyInventoryDeductionFromLines_(inventorySh, lineRows) {
  const invData = inventorySh.getDataRange().getValues();
  if (invData.length < 2) throw new Error("Inventory sheet has no data.");

  const headers = invData[0].map(h => String(h || "").trim());
  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  const required = ["Product_ID", "Current_Stock"];
  required.forEach(h => {
    if (idx[h] === undefined) throw new Error("Inventory sheet missing header: " + h);
  });

  const inventoryByProductId = {};
  for (let r = 1; r < invData.length; r++) {
    const productId = String(invData[r][idx["Product_ID"]] || "").trim();
    if (productId) {
      inventoryByProductId[productId] = r + 1; // sheet row number
    }
  }

  const aggregatedQty = {};
  lineRows.forEach(line => {
    aggregatedQty[line.productId] = (aggregatedQty[line.productId] || 0) + Number(line.quantity || 0);
  });

  const now = new Date();

  Object.keys(aggregatedQty).forEach(productId => {
    const rowNumber = inventoryByProductId[productId];
    if (!rowNumber) {
      throw new Error("Product not found in Inventory: " + productId);
    }

    const qty = Number(aggregatedQty[productId] || 0);
    const currentStock = Number(inventorySh.getRange(rowNumber, idx["Current_Stock"] + 1).getValue() || 0);

    if (qty <= 0) return;
    if (currentStock < qty) {
      throw new Error(
        "Insufficient stock for Product_ID " + productId + ". Current stock: " + currentStock + ", required: " + qty
      );
    }

    const newStock = currentStock - qty;
    inventorySh.getRange(rowNumber, idx["Current_Stock"] + 1).setValue(newStock);

    if (idx["Stock_Out"] !== undefined) {
      const oldStockOut = Number(inventorySh.getRange(rowNumber, idx["Stock_Out"] + 1).getValue() || 0);
      inventorySh.getRange(rowNumber, idx["Stock_Out"] + 1).setValue(oldStockOut + qty);
    }

    if (idx["Last_Updated"] !== undefined) {
      inventorySh.getRange(rowNumber, idx["Last_Updated"] + 1).setValue(now);
    }

    pcRecalculateInventoryReorderFields_(inventorySh, rowNumber, idx);
  });
}

function pcRecalculateInventoryReorderFields_(inventorySh, rowNumber, idx) {
  const currentStock = idx["Current_Stock"] !== undefined
    ? Number(inventorySh.getRange(rowNumber, idx["Current_Stock"] + 1).getValue() || 0)
    : 0;

  const minStock = idx["Min_Stock"] !== undefined
    ? Number(inventorySh.getRange(rowNumber, idx["Min_Stock"] + 1).getValue() || 0)
    : 0;

  if (idx["Reorder_Status"] !== undefined) {
    inventorySh.getRange(rowNumber, idx["Reorder_Status"] + 1)
      .setValue(currentStock <= minStock ? "REORDER" : "OK");
  }

  if (idx["Reorder_Qty"] !== undefined) {
    const existingReorderQty = Number(
      inventorySh.getRange(rowNumber, idx["Reorder_Qty"] + 1).getValue() || 0
    );

    if (currentStock <= minStock && existingReorderQty <= 0) {
      const suggested = Math.max(minStock * 2 - currentStock, 0);
      inventorySh.getRange(rowNumber, idx["Reorder_Qty"] + 1).setValue(suggested);
    }

    if (currentStock > minStock && existingReorderQty < 0) {
      inventorySh.getRange(rowNumber, idx["Reorder_Qty"] + 1).setValue(0);
    }
  }
}

function pcFindRowByValue_(sheet, colIndex, valueToFind) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, colIndex, lastRow - 1, 1).getValues().flat();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i] || "").trim() === String(valueToFind || "").trim()) {
      return i + 2;
    }
  }
  return null;
}

function pcPromptMarkOrderDelivered() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt("Mark Order Delivered", "Enter Order_ID:", ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const orderId = String(resp.getResponseText() || "").trim();
  if (!orderId) {
    ui.alert("Order_ID is required.");
    return;
  }

  const result = pcMarkOrderDelivered(orderId);
  ui.alert(result);
}

function pcResetAllData() {

  const sheetsToClean = [
    "Form_Responses_Raw",
    "Orders",
    "Order_Lines",
    "Invoice_Register",
    "Inventory",
    "AR_Credit_Control",
    "ERP_Export",
    "Salesforce_Export"
  ];

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  sheetsToClean.forEach(name => {

    const sh = ss.getSheetByName(name);
    if (!sh) return;

    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();

    if (lastRow > 1) {
      sh.getRange(2,1,lastRow-1,lastCol).clearContent();
    }

  });

  SpreadsheetApp.getUi().alert("All PrimeCare operational data cleared. Structure preserved.");

}
/* =========================================================
 * PDF INVOICE GENERATION
 * =======================================================*/

function pcGenerateInvoicePdf_(orderSummary, invoiceHtml) {
  const fileName = "Invoice_" + orderSummary.invoiceId + ".pdf";
  const pdfBlob = HtmlService
    .createHtmlOutput(invoiceHtml)
    .getBlob()
    .getAs(MimeType.PDF)
    .setName(fileName);

  const folderId = String(pcGetSettingValue_("Invoice_PDF_Folder_Id", "") || "").trim();
  let file;

  if (folderId) {
    const folder = DriveApp.getFolderById(folderId);
    file = folder.createFile(pdfBlob);
  } else {
    file = DriveApp.createFile(pdfBlob);
  }

  return {
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    blob: file.getBlob().setName(fileName)
  };
}

/* =========================================================
 * MONTHLY INVOICE FOLDER HELPERS
 * =======================================================*/

function pcGetOrCreateMonthlyInvoiceFolder_(invoiceDate) {
  const rootFolderId = String(pcGetSettingValue_("Invoice_PDF_Folder_Id", "") || "").trim();

  if (!rootFolderId) {
    throw new Error("Missing Invoice_PDF_Folder_Id in Settings.");
  }

  const rootFolder = DriveApp.getFolderById(rootFolderId);
  const monthName = Utilities.formatDate(
    new Date(invoiceDate || new Date()),
    Session.getScriptTimeZone(),
    "yyyy-MM"
  );

  const existing = rootFolder.getFoldersByName(monthName);
  if (existing.hasNext()) {
    return existing.next();
  }

  return rootFolder.createFolder(monthName);
}

function pcGenerateInvoicePdf_(orderSummary, invoiceHtml) {
  const fileName = "Invoice_" + orderSummary.invoiceId + ".pdf";
  const pdfBlob = HtmlService
    .createHtmlOutput(invoiceHtml)
    .getBlob()
    .getAs(MimeType.PDF)
    .setName(fileName);

  const monthlyFolder = pcGetOrCreateMonthlyInvoiceFolder_(orderSummary.orderDate);
  const file = monthlyFolder.createFile(pdfBlob);

  return {
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    fileName: file.getName(),
    folderName: monthlyFolder.getName(),
    blob: file.getBlob().setName(fileName)
  };
}

/* =========================================================
 * LAB-SPECIFIC PRICING
 * =======================================================*/

function pcGetLabPricingContractMap_(labId) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Lab_Pricing_Contracts");
  if (!sh || sh.getLastRow() < 2) return {};

  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h || "").trim());
  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  const today = new Date();
  const out = {};
  const cleanLabId = String(labId || "").trim();

  data.slice(1).forEach(row => {
    const rowLabId = String(row[idx["Lab_ID"]] || "").trim();
    const productId = String(row[idx["Product_ID"]] || "").trim();
    const activeFlag = String(row[idx["Active_Flag"]] || "Y").trim().toUpperCase();

    if (!rowLabId || !productId) return;
    if (rowLabId !== cleanLabId) return;
    if (activeFlag === "N" || activeFlag === "FALSE") return;

    const effectiveFrom = idx["Effective_From"] !== undefined ? row[idx["Effective_From"]] : "";
    const effectiveTo = idx["Effective_To"] !== undefined ? row[idx["Effective_To"]] : "";

    if (effectiveFrom instanceof Date && today < effectiveFrom) return;
    if (effectiveTo instanceof Date && today > effectiveTo) return;

    const contractPrice = Number(row[idx["Contract_Unit_Price"]] || 0);
    if (contractPrice > 0) {
      out[productId] = contractPrice;
    }
  });

  return out;
}

/* =========================================================
 * IDEMPOTENCY / DUPLICATE PROTECTION
 * =======================================================*/

function pcEnsureSubmissionToken_(payload) {
  const token = String(payload && payload.submissionToken || "").trim();
  if (!token) {
    throw new Error("Missing submission token.");
  }
  return token;
}

function pcFindExistingSubmissionByToken_(submissionToken) {
  const sh = pcGetRequiredSheet_(PC.RAW_SHEET);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return null;

  const headers = data[0].map(h => String(h || "").trim());
  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  if (idx["Submission_Token"] === undefined) return null;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const token = String(row[idx["Submission_Token"]] || "").trim();

    if (token !== String(submissionToken || "").trim()) continue;

    return {
      rowNumber: i + 1,
      processingStatus: idx["Processing_Status"] !== undefined ? String(row[idx["Processing_Status"]] || "").trim() : "",
      orderId: idx["Order_ID"] !== undefined ? String(row[idx["Order_ID"]] || "").trim() : "",
      invoiceId: idx["Invoice_ID"] !== undefined ? String(row[idx["Invoice_ID"]] || "").trim() : ""
    };
  }

  return null;
}

function pcBuildDuplicateResponse_(existing) {
  return {
    success: true,
    duplicate: true,
    orderId: existing.orderId || "",
    invoiceId: existing.invoiceId || "",
    message: "Duplicate submission detected. Existing order returned."
  };
}

