/************************************************************
 * 04_Dashboard_Audit_Validation.gs
 ************************************************************/

function pcaiCreateDashboardTab() {
  const sh = pcaiDeleteAndRecreateSheet_(PCAI_SHEETS.DASHBOARD);
  sh.setFrozenRows(3);
  sh.getRange("A1").setValue("PrimeCare Command Dashboard").setFontSize(18).setFontWeight("bold");
  sh.getRange("A2").setValue("Operations • Receivables • Inventory • Revenue");

  sh.getRange("A4:B11").setValues([
    ["Metric", "Value"],
    ["Total Orders", ""],
    ["Total Revenue", ""],
    ["Paid Orders", ""],
    ["Unpaid Orders", ""],
    ["Unique Labs", ""],
    ["Products in Inventory", ""],
    ["Low Stock Items", ""],
    ["Credit Hold Count", ""]
  ]);

  pcaiUpdateDashboardMetrics_();
  sh.autoResizeColumns(1, 6);
  return "Dashboard created.";
}

function pcaiUpdateDashboardMetrics_() {
  const sh = pcaiGetOrCreateSheet_(PCAI_SHEETS.DASHBOARD);
  const orders = pcaiSheetExists_(PCAI_SHEETS.ORDERS) ? pcaiGetRowsAsObjects_(pcaiGetSheetRequired_(PCAI_SHEETS.ORDERS), "Order_ID") : [];
  const inventory = pcaiSheetExists_(PCAI_SHEETS.INVENTORY) ? pcaiGetRowsAsObjects_(pcaiGetSheetRequired_(PCAI_SHEETS.INVENTORY), "Product_ID") : [];
  const ar = pcaiSheetExists_(PCAI_SHEETS.AR) ? pcaiGetRowsAsObjects_(pcaiGetSheetRequired_(PCAI_SHEETS.AR), "Lab_ID") : [];

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((s, r) => s + pcaiNum_(r.Total_Amount), 0);
  const paidOrders = orders.filter(r => String(r.Payment_Status || "").trim() === "Received").length;
  const unpaidOrders = orders.filter(r => String(r.Payment_Status || "").trim() !== "Received").length;
  const uniqueLabs = pcaiUnique_(orders.map(r => String(r.Lab_ID || "").trim()).filter(Boolean)).length;
  const inventoryProducts = inventory.length;
  const lowStock = inventory.filter(r => String(r.Reorder_Status || "").trim() === "REORDER").length;
  const creditHold = ar.filter(r => String(r.Credit_Hold || "").trim() === "HOLD").length;

  sh.getRange("B5:B12").setValues([
    [totalOrders],
    [totalRevenue],
    [paidOrders],
    [unpaidOrders],
    [uniqueLabs],
    [inventoryProducts],
    [lowStock],
    [creditHold]
  ]);
}

function pcaiRunBusinessAudit() {
  const ss = pcaiGetSS_();
  const snapshot = pcaiBuildSnapshotSelectedSheets_(ss.getSheets().map(s => s.getName()));

  const systemMsg = `
You are PrimeCare AI performing a business system audit.

Output sections:
1. Executive Summary
2. Critical Risks
3. Data Quality Issues
4. Process / Control Gaps
5. Formula / Logic Gaps
6. Validation Recommendations
7. Dashboard Recommendations
8. Scale-to-₹1Cr Recommendations
9. Highest Priority Next 10 Actions
`;

  const userMsg = "BUSINESS GOAL:\n" + PCAI_CONFIG.COMPANY_GOAL + "\n\nSNAPSHOT(JSON):\n" + snapshot;
  const answer = pcaiCallOpenAI_(systemMsg, userMsg);

  pcaiWriteTextToSheet_(PCAI_SHEETS.AUDIT, "PrimeCare Business Audit", answer);
  return "Audit written to " + PCAI_SHEETS.AUDIT;
}

function pcaiWriteImprovementAdvice() {
  const ss = pcaiGetSS_();
  const snapshot = pcaiBuildSnapshotSelectedSheets_(ss.getSheets().map(s => s.getName()));

  const systemMsg = `
You are PrimeCare AI writing improvement advice for the owner.

Output sections:
1. What is strong
2. What is weak
3. What to automate next
4. What validations to add
5. What dashboards to build
6. What controls are needed for scale
7. What should be fixed before larger volume
8. What should change to support ₹1Cr/month
`;

  const userMsg = "BUSINESS GOAL:\n" + PCAI_CONFIG.COMPANY_GOAL + "\n\nSNAPSHOT(JSON):\n" + snapshot;
  const answer = pcaiCallOpenAI_(systemMsg, userMsg);

  pcaiWriteTextToSheet_(PCAI_SHEETS.ADVICE, "PrimeCare Improvement Advice", answer);
  return "Advice written to " + PCAI_SHEETS.ADVICE;
}

function pcaiWriteTextToSheet_(sheetName, title, content) {
  const sh = pcaiDeleteAndRecreateSheet_(sheetName);
  sh.getRange("A1").setValue(title).setFontSize(16).setFontWeight("bold");
  sh.getRange("A2").setValue("Generated on: " + new Date());
  sh.getRange("A4").setValue(content).setWrap(true);
  sh.setColumnWidth(1, 900);
}

function pcaiApplyBasicValidations() {
  const ss = pcaiGetSS_();
  const messages = [];

  const orders = ss.getSheetByName(PCAI_SHEETS.ORDERS);
  if (orders) {
    const map = pcaiGetHeaderMap_(orders);

    if (map.Order_Status) {
      pcaiApplyDropdownToColumn_(orders, map.Order_Status, PCAI_ENUMS.ORDER_STATUS);
      messages.push("Orders.Order_Status");
    }
    if (map.Invoice_Status) {
      pcaiApplyDropdownToColumn_(orders, map.Invoice_Status, PCAI_ENUMS.INVOICE_STATUS);
      messages.push("Orders.Invoice_Status");
    }
    if (map.Payment_Status) {
      pcaiApplyDropdownToColumn_(orders, map.Payment_Status, PCAI_ENUMS.PAYMENT_STATUS);
      messages.push("Orders.Payment_Status");
    }

    ["Quantity", "Unit_Selling_Price", "Discount", "Total_Amount"].forEach(col => {
      if (map[col]) {
        pcaiApplyNonNegativeNumberValidation_(orders, map[col]);
        messages.push("Orders." + col);
      }
    });
  }

  const inventory = ss.getSheetByName(PCAI_SHEETS.INVENTORY);
  if (inventory) {
    const map = pcaiGetHeaderMap_(inventory);

    if (map.Reorder_Status) {
      pcaiApplyDropdownToColumn_(inventory, map.Reorder_Status, PCAI_ENUMS.REORDER_STATUS);
      messages.push("Inventory.Reorder_Status");
    }

    ["Current_Stock", "Min_Stock", "Reorder_Qty", "Unit_Cost"].forEach(col => {
      if (map[col]) {
        pcaiApplyNonNegativeNumberValidation_(inventory, map[col]);
        messages.push("Inventory." + col);
      }
    });
  }

  const ar = ss.getSheetByName(PCAI_SHEETS.AR);
  if (ar) {
    const map = pcaiGetHeaderMap_(ar);

    if (map.Credit_Hold) {
      pcaiApplyDropdownToColumn_(ar, map.Credit_Hold, PCAI_ENUMS.CREDIT_HOLD);
      messages.push("AR_Credit_Control.Credit_Hold");
    }

    ["Total_Delivered", "Total_Paid", "Outstanding", "Credit_Limit", "Days_Overdue"].forEach(col => {
      if (map[col]) {
        pcaiApplyNonNegativeNumberValidation_(ar, map[col]);
        messages.push("AR_Credit_Control." + col);
      }
    });
  }

  return messages.length ? "Validations applied: " + messages.join(", ") : "No matching columns found.";
}

function pcaiApplyDropdownToColumn_(sheet, colIndex, values) {
  const lastRow = Math.max(sheet.getLastRow(), 2);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, colIndex, lastRow - 1, 1).setDataValidation(rule);
}

function pcaiApplyNonNegativeNumberValidation_(sheet, colIndex) {
  const lastRow = Math.max(sheet.getLastRow(), 2);
  const rule = SpreadsheetApp.newDataValidation()
    .requireNumberGreaterThanOrEqualTo(0)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, colIndex, lastRow - 1, 1).setDataValidation(rule);
}