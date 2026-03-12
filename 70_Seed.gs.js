/************************************************************
 * 70_Seed.gs
 * Seed/config/formula functions
 ************************************************************/

function pcSeedProductionSettings() {
  const sh = pcEnsureSheet_(pcGetProductionSS_(), "Settings");

  const rows = [
    ["Key","Value"],
    ["Owner_Email",""],
    ["Invoice_Prefix","INV"],
    ["Order_Prefix","ORD"],
    ["Default_Tax_Rate",0],
    ["Business_Name","PrimeCare Diagnostics Supplies"],
    ["Business_Mode","PRODUCTION"]
  ];

  pcWriteTwoColumnKeyValue_(sh, rows);
  SpreadsheetApp.getUi().alert("Production settings seeded.");
}

function pcSeedAIConfig() {
  const ai = pcGetAISS_();
  const prod = pcGetProductionSS_();
  const sh = pcEnsureSheet_(ai, "Config");

  const rows = [
    ["Key","Value"],
    ["Production_File_Name", prod.getName()],
    ["Production_File_Url", prod.getUrl()],
    ["Production_File_Id", prod.getId()],
    ["AI_File_Name", ai.getName()],
    ["AI_File_Url", ai.getUrl()],
    ["AI_File_Id", ai.getId()],
    ["Last_Sync", new Date()]
  ];

  pcWriteTwoColumnKeyValue_(sh, rows);
  SpreadsheetApp.getUi().alert("AI config seeded.");
}

function pcSeedAIImportFormulas() {
  const ai = pcGetAISS_();
  const prod = pcGetProductionSS_();
  const prodId = prod.getId();

  pcSetFormulaOnly_(
    pcEnsureSheet_(ai, "Imported_Orders"),
    `=IMPORTRANGE("${prodId}","Orders!A:Z")`
  );

  pcSetFormulaOnly_(
    pcEnsureSheet_(ai, "Imported_Inventory"),
    `=IMPORTRANGE("${prodId}","Inventory!A:Z")`
  );

  pcSetFormulaOnly_(
    pcEnsureSheet_(ai, "Imported_AR"),
    `=IMPORTRANGE("${prodId}","AR_Credit_Control!A:Z")`
  );

  pcSetFormulaOnly_(
    pcEnsureSheet_(ai, "Imported_Product_Master"),
    `=IMPORTRANGE("${prodId}","Product_Master!A:Z")`
  );

  SpreadsheetApp.getUi().alert(
    "AI import formulas seeded.\nOpen AI workbook and click Allow Access on #REF! cells."
  );
}

function pcSeedSandboxBenchmarks() {
  const sh = pcEnsureSheet_(pcGetSandboxSS_(), "AI_Scenario_Benchmarks");

  const rows = [
    ["Scenario_Name","Expected_Revenue","Expected_Unpaid_Count","Expected_Reorder_Count","Expected_Top_Lab","Expected_Top_Lab_Revenue","Expected_Credit_Holds"],
    ["high overdue labs", 12000, 2, 0, "LAB_RISK_001", 10000, 2],
    ["stock out stress", 15800, 2, 2, "LAB_2001", 15000, 1],
    ["month end load", 46820, 10, 2, "LAB_ME_002", 2860, 4],
    ["combined stress scenario", 26940, 4, 3, "LAB_BIG_001", 14100, 2]
  ];

  pcWriteTable_(sh, rows);
  SpreadsheetApp.getUi().alert("Sandbox benchmarks seeded.");
}