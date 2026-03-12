/************************************************************
 * 17_Cleanup_And_Validations.gs
 * Cleanup AI/Sandbox noise + apply validations
 ************************************************************/

/* =========================================================
 * CLEANUP
 * =======================================================*/

function pcHardResetAIWorkbookOutputs() {
  const ss = pcGetAISS_();

  const sheetsToReset = [
    "AI_System_Health",
    "AI_Alerts",
    "AI_Recommendations",
    "AI_Risk_Predictions",
    "AI_Executive_Command_Dashboard",
    "AI_Daily_Summary",
    "AI_Weekly_Business_Review",
    "AI_Forecasts"
  ];

  sheetsToReset.forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) return;

    const maxRows = sh.getMaxRows();
    const maxCols = sh.getMaxColumns();

    if (maxRows > 0 && maxCols > 0) {
      sh.getRange(1, 1, maxRows, maxCols).clearContent();
    }
  });

  SpreadsheetApp.getUi().alert("AI workbook output sheets fully cleared.");
}

function pcHardResetSandboxWorkbookOutputs() {
  const ss = pcGetSandboxSS_();

  const sheetsToReset = [
    "TEST_Orders",
    "TEST_Inventory",
    "TEST_AR_Credit_Control",
    "AI_Test_Cases",
    "AI_Test_Results",
    "AI_Regression_Summary",
    "AI_Scenario_Benchmarks"
  ];

  sheetsToReset.forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) return;

    const maxRows = sh.getMaxRows();
    const maxCols = sh.getMaxColumns();

    if (maxRows > 0 && maxCols > 0) {
      sh.getRange(1, 1, maxRows, maxCols).clearContent();
    }
  });

  SpreadsheetApp.getUi().alert("Sandbox workbook fully cleared.");
}

function pcClearAllAISandboxNoise() {
  pcClearAIWorkbookNoise();
  pcClearSandboxWorkbookNoise();
  SpreadsheetApp.getUi().alert("AI + Sandbox noise cleared successfully.");
}

function pcClearDataBelowHeaderInWorkbook_(ss, sheetNames) {
  sheetNames.forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) return;

    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();

    if (lastRow > 1 && lastCol > 0) {
      sh.getRange(2, 1, lastRow - 1, lastCol).clearContent();
    }
  });
}

/* =========================================================
 * VALIDATIONS / PICKLISTS
 * =======================================================*/

function pcApplyOperationalValidations() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  pcApplyOrdersValidations_(ss);
  pcApplyInventoryValidations_(ss);
  pcApplyARValidations_(ss);
  pcApplyProductMasterValidations_(ss);
    pcApplyLabPricingContractValidations_(ss);

  SpreadsheetApp.getUi().alert("Operational validations applied successfully.");
}

function pcApplyOrdersValidations_(ss) {
  const sh = ss.getSheetByName("Orders");
  if (!sh) return;

  const map = pcGetHeaderMap_(sh);
  const maxRows = Math.max(sh.getMaxRows() - 1, 1);

  if (map["Invoice_Status"]) {
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(["Draft", "Sent", "Cancelled", "Paid"], true)
      .setAllowInvalid(false)
      .build();

    sh.getRange(2, map["Invoice_Status"], maxRows, 1).setDataValidation(rule);
  }

  if (map["Payment_Status"]) {
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(["Pending", "Partial", "Received", "Overdue"], true)
      .setAllowInvalid(false)
      .build();

    sh.getRange(2, map["Payment_Status"], maxRows, 1).setDataValidation(rule);
  }

  if (map["Order_Status"]) {
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(["Draft", "Confirmed", "Packed", "Delivered", "Cancelled"], true)
      .setAllowInvalid(false)
      .build();

    sh.getRange(2, map["Order_Status"], maxRows, 1).setDataValidation(rule);
  }
}

function pcApplyInventoryValidations_(ss) {
  const sh = ss.getSheetByName("Inventory");
  if (!sh) return;

  const map = pcGetHeaderMap_(sh);
  const maxRows = Math.max(sh.getMaxRows() - 1, 1);

  if (map["Reorder_Status"]) {
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(["OK", "REORDER"], true)
      .setAllowInvalid(false)
      .build();

    sh.getRange(2, map["Reorder_Status"], maxRows, 1).setDataValidation(rule);
  }

  ["Current_Stock", "Min_Stock", "Reorder_Qty", "Opening_Stock", "Stock_In", "Stock_Out", "Avg_Daily_Sales_30D", "Lead_Time_Days", "Safety_Days", "Unit_Cost"]
    .forEach(header => {
      if (!map[header]) return;

      const rule = SpreadsheetApp.newDataValidation()
        .requireNumberGreaterThanOrEqualTo(0)
        .setAllowInvalid(false)
        .build();

      sh.getRange(2, map[header], maxRows, 1).setDataValidation(rule);
    });
}

function pcApplyARValidations_(ss) {
  const sh = ss.getSheetByName("AR_Credit_Control");
  if (!sh) return;

  const map = pcGetHeaderMap_(sh);
  const maxRows = Math.max(sh.getMaxRows() - 1, 1);

  if (map["Credit_Hold"]) {
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(["OK", "HOLD"], true)
      .setAllowInvalid(false)
      .build();

    sh.getRange(2, map["Credit_Hold"], maxRows, 1).setDataValidation(rule);
  }

  ["Total_Delivered", "Total_Paid", "Outstanding", "Credit_Limit", "Days_Overdue", "Allowed_Overdue_Days"]
    .forEach(header => {
      if (!map[header]) return;

      const rule = SpreadsheetApp.newDataValidation()
        .requireNumberGreaterThanOrEqualTo(0)
        .setAllowInvalid(false)
        .build();

      sh.getRange(2, map[header], maxRows, 1).setDataValidation(rule);
    });
}

function pcApplyProductMasterValidations_(ss) {
  const sh = ss.getSheetByName("Product_Master");
  if (!sh) return;

  const map = pcGetHeaderMap_(sh);
  const maxRows = Math.max(sh.getMaxRows() - 1, 1);

  if (map["Active_Flag"]) {
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(["Y", "N", "TRUE", "FALSE"], true)
      .setAllowInvalid(false)
      .build();

    sh.getRange(2, map["Active_Flag"], maxRows, 1).setDataValidation(rule);
  }

  ["Unit_Selling_Price", "Tax_Rate", "Unit_Cost"]
    .forEach(header => {
      if (!map[header]) return;

      const rule = SpreadsheetApp.newDataValidation()
        .requireNumberGreaterThanOrEqualTo(0)
        .setAllowInvalid(false)
        .build();

      sh.getRange(2, map[header], maxRows, 1).setDataValidation(rule);
    });
}

function pcApplyLabPricingContractValidations_(ss) {
  const sh = ss.getSheetByName("Lab_Pricing_Contracts");
  if (!sh) return;

  const map = pcGetHeaderMap_(sh);
  const maxRows = Math.max(sh.getMaxRows() - 1, 1);

  if (map["Active_Flag"]) {
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(["Y", "N", "TRUE", "FALSE"], true)
      .setAllowInvalid(false)
      .build();

    sh.getRange(2, map["Active_Flag"], maxRows, 1).setDataValidation(rule);
  }

  if (map["Contract_Unit_Price"]) {
    const rule = SpreadsheetApp.newDataValidation()
      .requireNumberGreaterThanOrEqualTo(0)
      .setAllowInvalid(false)
      .build();

    sh.getRange(2, map["Contract_Unit_Price"], maxRows, 1).setDataValidation(rule);
  }
}