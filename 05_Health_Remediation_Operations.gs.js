/************************************************************
 * 05_Health_Remediation_Operations.gs
 ************************************************************/

function pcaiRunSystemHealthEngine() {
  const findings = [];

  findings.push(...pcaiCheckRequiredSheets_());
  findings.push(...pcaiCheckRequiredHeaders_());
  findings.push(...pcaiCheckInvalidStatuses_());
  findings.push(...pcaiCheckBlankCriticalFields_());
  findings.push(...pcaiCheckCreditRisk_());
  findings.push(...pcaiCheckStockRisk_());
  findings.push(...pcaiCheckLabsNearCreditLimit_());
  findings.push(...pcaiCheckProductsBelowMinStock_());
  findings.push(...pcaiCheckPendingPaymentAging_());

  pcaiWriteSystemHealthSheet_(findings);
  pcaiLogActionSafe_("RUN_SYSTEM_HEALTH_ENGINE", "Completed health checks");
  return "System health complete.";
}

function pcaiRunSystemRemediation() {
  const actions = [];

  actions.push(...pcaiFillMissingOutstanding_());
  actions.push(...pcaiFixCreditHoldLogic_());
  actions.push(...pcaiFixReorderLogic_());

  pcaiWriteRemediationReport_(actions);
  pcaiLogActionSafe_("RUN_SYSTEM_REMEDIATION", "Applied safe remediation rules");
  return "System remediation complete.";
}

function pcaiFixCreditHoldLogic() {
  const actions = pcaiFixCreditHoldLogic_();
  pcaiWriteRemediationReport_(actions);
  return "Credit hold remediation complete.";
}

function pcaiFixReorderLogic() {
  const actions = pcaiFixReorderLogic_();
  pcaiWriteRemediationReport_(actions);
  return "Reorder remediation complete.";
}

function pcaiFillMissingOutstanding() {
  const actions = pcaiFillMissingOutstanding_();
  pcaiWriteRemediationReport_(actions);
  return "Outstanding remediation complete.";
}

/* =========================================================
 * HEALTH CHECKS
 * =======================================================*/

function pcaiCheckRequiredSheets_() {
  const ss = pcaiGetSSSafe_();
  const existing = ss.getSheets().map(s => s.getName());

  return PCAI_HEALTH.REQUIRED_SHEETS.map(name => {
    const found = existing.includes(name);
    return pcaiBuildHealthFinding_(
      "STRUCTURE",
      "Required Sheet Exists",
      name,
      found ? "INFO" : "CRITICAL",
      found ? "PASS" : "FAIL",
      found ? "Sheet found" : "Missing required sheet"
    );
  });
}

function pcaiCheckRequiredHeaders_() {
  const findings = [];
  const ss = pcaiGetSSSafe_();

  Object.keys(PCAI_HEALTH.REQUIRED_HEADERS).forEach(sheetName => {
    const sh = ss.getSheetByName(sheetName);
    if (!sh) return;

    const headerMap = pcaiGetHeaderMapSafe_(sh);

    PCAI_HEALTH.REQUIRED_HEADERS[sheetName].forEach(header => {
      const ok = !!headerMap[header];
      findings.push(pcaiBuildHealthFinding_(
        "STRUCTURE",
        "Required Header Exists",
        sheetName + "." + header,
        ok ? "INFO" : "CRITICAL",
        ok ? "PASS" : "FAIL",
        ok ? "Header found" : "Missing required header"
      ));
    });
  });

  return findings;
}

function pcaiCheckInvalidStatuses_() {
  const findings = [];
  if (!pcaiSheetExistsSafe_(PCAI_SHEETS.ORDERS)) return findings;

  const rows = pcaiGetRowsAsObjects_(pcaiGetSheetRequiredSafe_(PCAI_SHEETS.ORDERS), "Order_ID");

  rows.forEach((r, idx) => {
    const rowNum = idx + 2;

    if (
      r.Order_Status &&
      PCAI_ENUMS.ORDER_STATUS &&
      !PCAI_ENUMS.ORDER_STATUS.includes(String(r.Order_Status).trim())
    ) {
      findings.push(pcaiBuildHealthFinding_(
        "DATA_QUALITY",
        "Invalid Order_Status",
        "Orders row " + rowNum,
        "HIGH",
        "FAIL",
        "Invalid value: " + r.Order_Status
      ));
    }

    if (
      r.Invoice_Status &&
      PCAI_ENUMS.INVOICE_STATUS &&
      !PCAI_ENUMS.INVOICE_STATUS.includes(String(r.Invoice_Status).trim())
    ) {
      findings.push(pcaiBuildHealthFinding_(
        "DATA_QUALITY",
        "Invalid Invoice_Status",
        "Orders row " + rowNum,
        "HIGH",
        "FAIL",
        "Invalid value: " + r.Invoice_Status
      ));
    }

    if (
      r.Payment_Status &&
      PCAI_ENUMS.PAYMENT_STATUS &&
      !PCAI_ENUMS.PAYMENT_STATUS.includes(String(r.Payment_Status).trim())
    ) {
      findings.push(pcaiBuildHealthFinding_(
        "DATA_QUALITY",
        "Invalid Payment_Status",
        "Orders row " + rowNum,
        "HIGH",
        "FAIL",
        "Invalid value: " + r.Payment_Status
      ));
    }
  });

  if (!findings.length) {
    findings.push(pcaiBuildHealthFinding_(
      "DATA_QUALITY",
      "Status Scan",
      "Orders",
      "INFO",
      "PASS",
      "No invalid statuses found"
    ));
  }

  return findings;
}

function pcaiCheckBlankCriticalFields_() {
  const findings = [];
  const criticalMap = PCAI_HEALTH.CRITICAL_FIELDS;
  const ss = pcaiGetSSSafe_();

  Object.keys(criticalMap).forEach(sheetName => {
    const sh = ss.getSheetByName(sheetName);
    if (!sh) return;

    const pk =
      sheetName === "Orders" ? "Order_ID" :
      sheetName === "Order_Lines" ? "Order_Line_ID" :
      sheetName === "Inventory" ? "Product_ID" :
      sheetName === "AR_Credit_Control" ? "Lab_ID" :
      "Product_ID";

    const rows = pcaiGetRowsAsObjects_(sh, pk);

    rows.forEach((r, idx) => {
      const rowNum = idx + 2;

      criticalMap[sheetName].forEach(field => {
        if (r[field] === "" || r[field] === null || r[field] === undefined) {
          findings.push(pcaiBuildHealthFinding_(
            "DATA_QUALITY",
            "Blank Critical Field",
            sheetName + " row " + rowNum,
            "MEDIUM",
            "FAIL",
            "Blank field: " + field
          ));
        }
      });
    });
  });

  if (!findings.length) {
    findings.push(pcaiBuildHealthFinding_(
      "DATA_QUALITY",
      "Critical Field Scan",
      "Core sheets",
      "INFO",
      "PASS",
      "No blank critical fields"
    ));
  }

  return findings;
}

function pcaiCheckCreditRisk_() {
  const findings = [];
  if (!pcaiSheetExistsSafe_(PCAI_SHEETS.AR)) return findings;

  const rows = pcaiGetRowsAsObjects_(pcaiGetSheetRequiredSafe_(PCAI_SHEETS.AR), "Lab_ID");

  rows.forEach((r, idx) => {
    const rowNum = idx + 2;
    const outstanding = pcaiNum_(r.Outstanding);
    const limit = pcaiNum_(r.Credit_Limit);
    const days = pcaiNum_(r.Days_Overdue);
    const hold = String(r.Credit_Hold || "").trim().toUpperCase();

    if (limit > 0 && outstanding > limit && hold !== "HOLD") {
      findings.push(pcaiBuildHealthFinding_(
        "BUSINESS_RISK",
        "Credit Hold Logic Gap",
        "AR row " + rowNum,
        "CRITICAL",
        "FAIL",
        "Outstanding exceeds limit but not HOLD"
      ));
    }

    if (days > 30) {
      findings.push(pcaiBuildHealthFinding_(
        "BUSINESS_RISK",
        "Severe Overdue Lab",
        "AR row " + rowNum,
        "HIGH",
        "FAIL",
        "Days_Overdue = " + days
      ));
    }
  });

  if (!findings.length) {
    findings.push(pcaiBuildHealthFinding_(
      "BUSINESS_RISK",
      "Credit Risk Scan",
      "AR_Credit_Control",
      "INFO",
      "PASS",
      "No critical credit-risk exceptions"
    ));
  }

  return findings;
}

function pcaiCheckStockRisk_() {
  const findings = [];
  if (!pcaiSheetExistsSafe_(PCAI_SHEETS.INVENTORY)) return findings;

  const rows = pcaiGetRowsAsObjects_(pcaiGetSheetRequiredSafe_(PCAI_SHEETS.INVENTORY), "Product_ID");

  rows.forEach((r, idx) => {
    const rowNum = idx + 2;
    const stock = pcaiNum_(r.Current_Stock);
    const min = pcaiNum_(r.Min_Stock);
    const reorder = String(r.Reorder_Status || "").trim().toUpperCase();

    if (stock < min && reorder !== "REORDER") {
      findings.push(pcaiBuildHealthFinding_(
        "BUSINESS_RISK",
        "Reorder Logic Gap",
        "Inventory row " + rowNum,
        "CRITICAL",
        "FAIL",
        "Stock below min but not REORDER"
      ));
    }

    if (stock === 0) {
      findings.push(pcaiBuildHealthFinding_(
        "BUSINESS_RISK",
        "Stockout",
        "Inventory row " + rowNum,
        "HIGH",
        "FAIL",
        "Current_Stock is zero"
      ));
    }
  });

  if (!findings.length) {
    findings.push(pcaiBuildHealthFinding_(
      "BUSINESS_RISK",
      "Stock Risk Scan",
      "Inventory",
      "INFO",
      "PASS",
      "No critical stock-risk exceptions"
    ));
  }

  return findings;
}

function pcaiCheckLabsNearCreditLimit_() {
  const findings = [];
  const sh = pcaiGetSSSafe_().getSheetByName(PCAI_SHEETS.AR);
  if (!sh) return findings;

  const rows = pcaiGetRowsAsObjects_(sh, "Lab_ID");

  rows.forEach((r, idx) => {
    const rowNum = idx + 2;
    const outstanding = pcaiNum_(r.Outstanding);
    const creditLimit = pcaiNum_(r.Credit_Limit);

    if (creditLimit <= 0) return;

    const ratio = outstanding / creditLimit;
    if (ratio >= PCAI_HEALTH.CREDIT_LIMIT_WARNING_RATIO && ratio < 1) {
      findings.push(pcaiBuildHealthFinding_(
        "CREDIT_CONTROL",
        "Lab Near Credit Limit",
        "AR_Credit_Control row " + rowNum,
        "HIGH",
        "FAIL",
        "Outstanding is " + Math.round(ratio * 100) + "% of credit limit for Lab_ID " + (r.Lab_ID || "")
      ));
    }
  });

  if (!findings.length) {
    findings.push(pcaiBuildHealthFinding_(
      "CREDIT_CONTROL",
      "Labs Near Credit Limit",
      "AR_Credit_Control",
      "INFO",
      "PASS",
      "No labs near credit limit"
    ));
  }

  return findings;
}

function pcaiCheckProductsBelowMinStock_() {
  const findings = [];
  const sh = pcaiGetSSSafe_().getSheetByName(PCAI_SHEETS.INVENTORY);
  if (!sh) return findings;

  const rows = pcaiGetRowsAsObjects_(sh, "Product_ID");

  rows.forEach((r, idx) => {
    const rowNum = idx + 2;
    const currentStock = pcaiNum_(r.Current_Stock);
    const minStock = pcaiNum_(r.Min_Stock);

    if (currentStock < minStock) {
      findings.push(pcaiBuildHealthFinding_(
        "INVENTORY",
        "Below Minimum Stock",
        "Inventory row " + rowNum,
        "HIGH",
        "FAIL",
        "Product_ID " + (r.Product_ID || "") + " is below min stock. Current: " + currentStock + ", Min: " + minStock
      ));
    }
  });

  if (!findings.length) {
    findings.push(pcaiBuildHealthFinding_(
      "INVENTORY",
      "Minimum Stock Check",
      "Inventory",
      "INFO",
      "PASS",
      "No products below minimum stock"
    ));
  }

  return findings;
}

function pcaiCheckPendingPaymentAging_() {
  const findings = [];
  const sh = pcaiGetSSSafe_().getSheetByName(PCAI_SHEETS.ORDERS);
  if (!sh) return findings;

  const rows = pcaiGetRowsAsObjects_(sh, "Order_ID");
  const now = new Date();

  rows.forEach((r, idx) => {
    const rowNum = idx + 2;
    const invoiceStatus = String(r.Invoice_Status || "").trim();
    const paymentStatus = String(r.Payment_Status || "").trim();
    const orderDate = r.Order_Date;

    if (invoiceStatus !== "Sent" || paymentStatus !== "Pending") return;
    if (!(orderDate instanceof Date)) return;

    const ageDays = Math.floor((now - orderDate) / (1000 * 60 * 60 * 24));

    if (ageDays > PCAI_HEALTH.PAYMENT_PENDING_WARNING_DAYS) {
      findings.push(pcaiBuildHealthFinding_(
        "COLLECTIONS",
        "Pending Payment Aging",
        "Orders row " + rowNum,
        "HIGH",
        "FAIL",
        "Order_ID " + (r.Order_ID || "") + " has been pending for " + ageDays + " days"
      ));
    }
  });

  if (!findings.length) {
    findings.push(pcaiBuildHealthFinding_(
      "COLLECTIONS",
      "Pending Payment Aging",
      "Orders",
      "INFO",
      "PASS",
      "No aged pending payments found"
    ));
  }

  return findings;
}

/* =========================================================
 * HEALTH OUTPUT
 * =======================================================*/

function pcaiBuildHealthFinding_(category, checkName, objectName, severity, result, notes) {
  return {
    Category: category,
    Check_Name: checkName,
    Object_Name: objectName,
    Severity: severity,
    Result: result,
    Notes: notes
  };
}

function pcaiWriteSystemHealthSheet_(findings) {
  const sh = pcaiResetSheetContents_(pcaiGetOrCreateSheetSafe_(PCAI_SHEETS.SYSTEM_HEALTH));

  sh.getRange("A1")
    .setValue("PrimeCare System Health")
    .setFontSize(16)
    .setFontWeight("bold");

  sh.getRange("A3:F3").setValues([[
    "Category",
    "Check_Name",
    "Object_Name",
    "Severity",
    "Result",
    "Notes"
  ]]);

  if (findings.length) {
    sh.getRange(4, 1, findings.length, 6).setValues(
      findings.map(f => [f.Category, f.Check_Name, f.Object_Name, f.Severity, f.Result, f.Notes])
    );
  }

  sh.setFrozenRows(3);
}

/* =========================================================
 * REMEDIATION
 * =======================================================*/

function pcaiFillMissingOutstanding_() {
  if (!pcaiSheetExistsSafe_(PCAI_SHEETS.AR)) {
    return [pcaiBuildRemediationAction_(PCAI_SHEETS.AR, 0, "FILL_OUTSTANDING", "SKIPPED", "Sheet not found")];
  }

  const sh = pcaiGetSheetRequiredSafe_(PCAI_SHEETS.AR);
  const map = pcaiGetHeaderMapSafe_(sh);
  const required = ["Total_Delivered", "Total_Paid", "Outstanding"];

  for (const field of required) {
    if (!map[field]) {
      return [pcaiBuildRemediationAction_(PCAI_SHEETS.AR, 0, "FILL_OUTSTANDING", "SKIPPED", "Missing header: " + field)];
    }
  }

  const rows = pcaiGetRowsWithNumbersSafe_(sh, "Lab_ID");
  const actions = [];

  rows.forEach(r => {
    const delivered = pcaiNum_(r.Total_Delivered);
    const paid = pcaiNum_(r.Total_Paid);
    const outstanding = String(r.Outstanding ?? "").trim();

    if (outstanding === "" && (delivered !== 0 || paid !== 0)) {
      const value = delivered - paid;
      sh.getRange(r.__rowNum, map.Outstanding).setValue(value);
      actions.push(pcaiBuildRemediationAction_(
        PCAI_SHEETS.AR,
        r.__rowNum,
        "FILL_OUTSTANDING",
        "UPDATED",
        "Set Outstanding = " + value
      ));
    }
  });

  if (!actions.length) {
    actions.push(pcaiBuildRemediationAction_(
      PCAI_SHEETS.AR,
      0,
      "FILL_OUTSTANDING",
      "NO_CHANGE",
      "No missing outstanding values"
    ));
  }

  return actions;
}

function pcaiFixCreditHoldLogic_() {
  if (!pcaiSheetExistsSafe_(PCAI_SHEETS.AR)) {
    return [pcaiBuildRemediationAction_(PCAI_SHEETS.AR, 0, "FIX_CREDIT_HOLD", "SKIPPED", "Sheet not found")];
  }

  const sh = pcaiGetSheetRequiredSafe_(PCAI_SHEETS.AR);
  const map = pcaiGetHeaderMapSafe_(sh);
  const required = ["Outstanding", "Credit_Limit", "Credit_Hold"];

  for (const field of required) {
    if (!map[field]) {
      return [pcaiBuildRemediationAction_(PCAI_SHEETS.AR, 0, "FIX_CREDIT_HOLD", "SKIPPED", "Missing header: " + field)];
    }
  }

  const rows = pcaiGetRowsWithNumbersSafe_(sh, "Lab_ID");
  const actions = [];

  rows.forEach(r => {
    const o = String(r.Outstanding ?? "").trim();
    const l = String(r.Credit_Limit ?? "").trim();
    if (o === "" || l === "") return;

    const expected = pcaiNum_(r.Outstanding) > pcaiNum_(r.Credit_Limit) ? "HOLD" : "OK";
    const actual = String(r.Credit_Hold || "").trim().toUpperCase();

    if (actual !== expected) {
      sh.getRange(r.__rowNum, map.Credit_Hold).setValue(expected);
      actions.push(pcaiBuildRemediationAction_(
        PCAI_SHEETS.AR,
        r.__rowNum,
        "FIX_CREDIT_HOLD",
        "UPDATED",
        "Set Credit_Hold = " + expected
      ));
    }
  });

  if (!actions.length) {
    actions.push(pcaiBuildRemediationAction_(
      PCAI_SHEETS.AR,
      0,
      "FIX_CREDIT_HOLD",
      "NO_CHANGE",
      "No credit hold issues found"
    ));
  }

  return actions;
}

function pcaiFixReorderLogic_() {
  if (!pcaiSheetExistsSafe_(PCAI_SHEETS.INVENTORY)) {
    return [pcaiBuildRemediationAction_(PCAI_SHEETS.INVENTORY, 0, "FIX_REORDER_STATUS", "SKIPPED", "Sheet not found")];
  }

  const sh = pcaiGetSheetRequiredSafe_(PCAI_SHEETS.INVENTORY);
  const map = pcaiGetHeaderMapSafe_(sh);
  const required = ["Current_Stock", "Min_Stock", "Reorder_Status"];

  for (const field of required) {
    if (!map[field]) {
      return [pcaiBuildRemediationAction_(PCAI_SHEETS.INVENTORY, 0, "FIX_REORDER_STATUS", "SKIPPED", "Missing header: " + field)];
    }
  }

  const rows = pcaiGetRowsWithNumbersSafe_(sh, "Product_ID");
  const actions = [];

  rows.forEach(r => {
    const s = String(r.Current_Stock ?? "").trim();
    const m = String(r.Min_Stock ?? "").trim();
    if (s === "" || m === "") return;

    const expected = pcaiNum_(r.Current_Stock) < pcaiNum_(r.Min_Stock) ? "REORDER" : "OK";
    const actual = String(r.Reorder_Status || "").trim().toUpperCase();

    if (actual !== expected) {
      sh.getRange(r.__rowNum, map.Reorder_Status).setValue(expected);
      actions.push(pcaiBuildRemediationAction_(
        PCAI_SHEETS.INVENTORY,
        r.__rowNum,
        "FIX_REORDER_STATUS",
        "UPDATED",
        "Set Reorder_Status = " + expected
      ));
    }
  });

  if (!actions.length) {
    actions.push(pcaiBuildRemediationAction_(
      PCAI_SHEETS.INVENTORY,
      0,
      "FIX_REORDER_STATUS",
      "NO_CHANGE",
      "No reorder issues found"
    ));
  }

  return actions;
}

function pcaiBuildRemediationAction_(sheetName, rowNum, actionType, status, notes) {
  return {
    Timestamp: new Date(),
    Sheet_Name: sheetName,
    Row_Number: rowNum,
    Action_Type: actionType,
    Status: status,
    Notes: notes
  };
}

function pcaiWriteRemediationReport_(actions) {
  const sh = pcaiResetSheetContents_(pcaiGetOrCreateSheetSafe_(PCAI_SHEETS.REMEDIATION_REPORT));

  sh.getRange("A1")
    .setValue("PrimeCare Remediation Report")
    .setFontSize(16)
    .setFontWeight("bold");

  sh.getRange("A3:F3").setValues([[
    "Timestamp",
    "Sheet_Name",
    "Row_Number",
    "Action_Type",
    "Status",
    "Notes"
  ]]);

  if (actions.length) {
    sh.getRange(4, 1, actions.length, 6).setValues(
      actions.map(a => [a.Timestamp, a.Sheet_Name, a.Row_Number, a.Action_Type, a.Status, a.Notes])
    );
  }

  sh.setFrozenRows(3);
}

/* =========================================================
 * DASHBOARDS
 * =======================================================*/

function pcaiUpdateSystemStatusDashboard() {
  const health = pcaiSheetExistsSafe_(PCAI_SHEETS.SYSTEM_HEALTH)
    ? pcaiGetSheetRequiredSafe_(PCAI_SHEETS.SYSTEM_HEALTH)
    : null;

  const remediation = pcaiSheetExistsSafe_(PCAI_SHEETS.REMEDIATION_REPORT)
    ? pcaiGetSheetRequiredSafe_(PCAI_SHEETS.REMEDIATION_REPORT)
    : null;

  const sh = pcaiGetOrCreateSheetSafe_(PCAI_SHEETS.SYSTEM_STATUS);
  pcaiResetSheetContents_(sh);

  sh.getRange("A1")
    .setValue("PrimeCare System Status")
    .setFontWeight("bold")
    .setFontSize(16);

  sh.getRange("A3:B8").setValues([
    ["System Health", ""],
    ["Critical Risks", ""],
    ["Data Quality Issues", ""],
    ["Scenario Tests", ""],
    ["Last Health Scan", ""],
    ["Last Remediation", ""]
  ]);

  let critical = 0;
  let dataIssues = 0;
  let systemStatus = "NOT RUN";

  if (health && health.getLastRow() >= 4) {
    const values = health.getDataRange().getValues();
    const headers = values[2] || [];
    const map = {};

    headers.forEach((h, i) => {
      map[String(h || "").trim()] = i;
    });

    for (let i = 3; i < values.length; i++) {
      const row = values[i];
      if (String(row[map.Result] || "").trim() === "FAIL") {
        if (String(row[map.Severity] || "").trim() === "CRITICAL") critical++;
        if (String(row[map.Severity] || "").trim() === "MEDIUM") dataIssues++;
      }
    }

    systemStatus = critical > 0 ? "FAIL" : "PASS";
  }

  sh.getRange("B3").setValue(systemStatus);
  sh.getRange("B4").setValue(critical);
  sh.getRange("B5").setValue(dataIssues);
  sh.getRange("B6").setValue(pcaiGetScenarioTestStatusSafe_());
  sh.getRange("B7").setValue(new Date());
  sh.getRange("B8").setValue(remediation ? new Date() : "");
}

function pcaiUpdateOperationsDashboard() {
  const dash = pcaiGetOrCreateSheetSafe_(PCAI_SHEETS.OPERATIONS_DASHBOARD);
  pcaiResetSheetContents_(dash);

  const orders = pcaiSheetExistsSafe_(PCAI_SHEETS.ORDERS)
    ? pcaiGetRowsAsObjects_(pcaiGetSheetRequiredSafe_(PCAI_SHEETS.ORDERS), "Order_ID")
    : [];

  const inventory = pcaiSheetExistsSafe_(PCAI_SHEETS.INVENTORY)
    ? pcaiGetRowsAsObjects_(pcaiGetSheetRequiredSafe_(PCAI_SHEETS.INVENTORY), "Product_ID")
    : [];

  const credit = pcaiSheetExistsSafe_(PCAI_SHEETS.AR)
    ? pcaiGetRowsAsObjects_(pcaiGetSheetRequiredSafe_(PCAI_SHEETS.AR), "Lab_ID")
    : [];

  let revenue = 0;
  let ordersCount = 0;
  let unpaid = 0;
  let reorder = 0;
  let holds = 0;
  const labRevenue = {};

  orders.forEach(r => {
    const amount = pcaiNum_(r.Order_Total || r.Total_Amount || 0);
    const lab = String(r.Lab_ID || "").trim();
    const payment = String(r.Payment_Status || "").trim();

    revenue += amount;
    ordersCount++;

    if (payment !== "Received") unpaid++;
    if (lab) labRevenue[lab] = (labRevenue[lab] || 0) + amount;
  });

  inventory.forEach(r => {
    if (String(r.Reorder_Status || "").trim().toUpperCase() === "REORDER") {
      reorder++;
    }
  });

  credit.forEach(r => {
    if (String(r.Credit_Hold || "").trim().toUpperCase() === "HOLD") {
      holds++;
    }
  });

  let topLab = "";
  let topRevenue = 0;

  Object.keys(labRevenue).forEach(lab => {
    if (labRevenue[lab] > topRevenue) {
      topRevenue = labRevenue[lab];
      topLab = lab;
    }
  });

  dash.getRange("A1")
    .setValue("AI Operations Dashboard")
    .setFontWeight("bold")
    .setFontSize(16);

  dash.getRange("A3:B8").setValues([
    ["Total Revenue", revenue],
    ["Total Orders", ordersCount],
    ["Unpaid Orders", unpaid],
    ["Labs On Credit Hold", holds],
    ["Items On Reorder", reorder],
    ["Top Revenue Lab", topLab]
  ]);
}

/* =========================================================
 * SAFE WRAPPERS / FALLBACKS
 * =======================================================*/

function pcaiGetSSSafe_() {
  if (typeof pcaiGetSS_ === "function") return pcaiGetSS_();
  return SpreadsheetApp.getActiveSpreadsheet();
}

function pcaiGetOrCreateSheetSafe_(name) {
  if (typeof pcaiGetOrCreateSheet_ === "function") return pcaiGetOrCreateSheet_(name);

  const ss = pcaiGetSSSafe_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function pcaiSheetExistsSafe_(name) {
  if (typeof pcaiSheetExists_ === "function") return pcaiSheetExists_(name);
  return !!pcaiGetSSSafe_().getSheetByName(name);
}

function pcaiGetSheetRequiredSafe_(name) {
  if (typeof pcaiGetSheetRequired_ === "function") return pcaiGetSheetRequired_(name);

  const sh = pcaiGetSSSafe_().getSheetByName(name);
  if (!sh) throw new Error("Required sheet not found: " + name);
  return sh;
}

function pcaiGetHeaderMapSafe_(sheet) {
  if (typeof pcaiGetHeaderMap_ === "function") return pcaiGetHeaderMap_(sheet);

  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return {};

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const map = {};

  headers.forEach((h, i) => {
    const key = String(h || "").trim();
    if (key) map[key] = i + 1;
  });

  return map;
}

function pcaiGetRowsWithNumbersSafe_(sheet, keyHeader) {
  if (typeof pcaiGetRowsWithNumbers_ === "function") return pcaiGetRowsWithNumbers_(sheet, keyHeader);

  const values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return [];

  const headers = values[0].map(h => String(h || "").trim());
  const output = [];

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const obj = { __rowNum: r + 1 };
    let hasAnyValue = false;

    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c];
      if (row[c] !== "" && row[c] !== null) {
        hasAnyValue = true;
      }
    }

    if (!hasAnyValue) continue;

    if (keyHeader) {
      const keyVal = String(obj[keyHeader] || "").trim();
      if (!keyVal) continue;
    }

    output.push(obj);
  }

  return output;
}

function pcaiLogActionSafe_(action, notes) {
  if (typeof pcaiLogAction_ === "function") {
    return pcaiLogAction_(action, notes);
  }
}

function pcaiGetScenarioTestStatusSafe_() {
  if (typeof pcaiGetScenarioTestStatus_ === "function") {
    return pcaiGetScenarioTestStatus_();
  }
  return "UNKNOWN";
}