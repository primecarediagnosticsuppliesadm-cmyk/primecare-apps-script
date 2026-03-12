/************************************************************
 * 08_Sandbox_And_Regression.gs
 ************************************************************/

function pcaiSetupSandboxSimulationEngine() {
  pcaiCloneSheetForSandbox_(PCAI_SHEETS.ORDERS, PCAI_SHEETS.TEST_ORDERS);
  pcaiCloneSheetForSandbox_(PCAI_SHEETS.AR, PCAI_SHEETS.TEST_AR);
  pcaiCloneSheetForSandbox_(PCAI_SHEETS.INVENTORY, PCAI_SHEETS.TEST_INVENTORY);
  pcaiCreateOrResetTestDashboardChecks_();
  pcaiLogAction_("SETUP_SANDBOX", "Created sandbox simulation sheets");
  return "Sandbox simulation engine ready.";
}

function pcaiCloneSheetForSandbox_(sourceName, targetName) {
  const ss = pcaiGetSS_();
  const source = ss.getSheetByName(sourceName);
  if (!source) throw new Error("Missing source sheet: " + sourceName);

  const existing = ss.getSheetByName(targetName);
  if (existing) ss.deleteSheet(existing);

  const clone = source.copyTo(ss).setName(targetName);
  ss.setActiveSheet(clone);
  ss.moveActiveSheet(ss.getNumSheets());
  return clone;
}

function pcaiCreateOrResetTestDashboardChecks_() {
  const sh = pcaiDeleteAndRecreateSheet_(PCAI_SHEETS.TEST_DASHBOARD);
  sh.getRange("A1").setValue("Sandbox Dashboard Verification").setFontWeight("bold").setFontSize(16);
  sh.getRange("A3:E3").setValues([["Check_Name", "Expected_Value", "Actual_Value", "Result", "Notes"]]);
  sh.autoResizeColumns(1, 5);
}

function pcaiResetSandbox_() {
  [PCAI_SHEETS.TEST_ORDERS, PCAI_SHEETS.TEST_AR, PCAI_SHEETS.TEST_INVENTORY].forEach(name => {
    const sh = pcaiGetSS_().getSheetByName(name);
    if (!sh) return;
    const lastRow = sh.getLastRow();
    if (lastRow > 1) {
      sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).clearContent();
    }
  });
}

function pcaiRunSandboxScenarioByName(scenarioName) {
  const name = String(scenarioName || "").trim().toLowerCase();
  pcaiSetupSandboxSimulationEngine();
  pcaiResetSandbox_();

  if (name === "high overdue labs") pcaiSimulateHighOverdueLabs_();
  else if (name === "stock out stress") pcaiSimulateStockOutStress_();
  else if (name === "month end load") pcaiSimulateMonthEndLoad_();
  else if (name === "combined stress scenario") pcaiSimulateCombinedStressScenario_();
  else throw new Error("Unknown scenario: " + scenarioName);

  SpreadsheetApp.flush();
  pcaiVerifySandboxDashboard_(name);
  pcaiLogAction_("RUN_SANDBOX_SCENARIO", name);
  return "Sandbox scenario completed: " + scenarioName;
}

function pcaiSimulateHighOverdueLabs_() {
  const ar = pcaiGetSheetRequired_(PCAI_SHEETS.TEST_AR);
  const orders = pcaiGetSheetRequired_(PCAI_SHEETS.TEST_ORDERS);

  [
    { Lab_ID: "LAB_RISK_001", Total_Delivered: 120000, Total_Paid: 10000, Outstanding: 110000, Credit_Limit: 50000, Days_Overdue: 45, Allowed_Overdue_Days: 15, Credit_Hold: "HOLD" },
    { Lab_ID: "LAB_RISK_002", Total_Delivered: 80000, Total_Paid: 20000, Outstanding: 60000, Credit_Limit: 40000, Days_Overdue: 28, Allowed_Overdue_Days: 15, Credit_Hold: "HOLD" },
    { Lab_ID: "LAB_OK_001", Total_Delivered: 25000, Total_Paid: 22000, Outstanding: 3000, Credit_Limit: 50000, Days_Overdue: 5, Allowed_Overdue_Days: 15, Credit_Hold: "OK" }
  ].forEach(r => pcaiUpsertRowByKey_(ar, "Lab_ID", r.Lab_ID, r));

  [
    { Order_ID: "SIM_OD_1001", Order_Date: new Date(), Lab_ID: "LAB_RISK_001", Product_ID: "PROD_001", Quantity: 20, Unit_Selling_Price: 500, Discount: 0, Total_Amount: 10000, Order_Status: "Delivered", Invoice_ID: "SIM_INV_1001", Invoice_Status: "Sent", Payment_Status: "Overdue" },
    { Order_ID: "SIM_OD_1002", Order_Date: new Date(), Lab_ID: "LAB_RISK_002", Product_ID: "PROD_002", Quantity: 50, Unit_Selling_Price: 40, Discount: 0, Total_Amount: 2000, Order_Status: "Delivered", Invoice_ID: "SIM_INV_1002", Invoice_Status: "Sent", Payment_Status: "Overdue" }
  ].forEach(r => pcaiAppendMappedRow_(orders, r));
}

function pcaiSimulateStockOutStress_() {
  const inventory = pcaiGetSheetRequired_(PCAI_SHEETS.TEST_INVENTORY);
  const orders = pcaiGetSheetRequired_(PCAI_SHEETS.TEST_ORDERS);
  const ar = pcaiGetSheetRequired_(PCAI_SHEETS.TEST_AR);

  [
    { Product_ID: "PROD_001", Current_Stock: 5, Min_Stock: 20, Reorder_Qty: 100, Reorder_Status: "REORDER", Opening_Stock: 100, Stock_In: 0, Stock_Out: 95, Last_Updated: new Date(), Avg_Daily_Sales_30D: 8, Lead_Time_Days: 7, Safety_Days: 5 },
    { Product_ID: "PROD_002", Current_Stock: 2, Min_Stock: 15, Reorder_Qty: 80, Reorder_Status: "REORDER", Opening_Stock: 75, Stock_In: 0, Stock_Out: 73, Last_Updated: new Date(), Avg_Daily_Sales_30D: 4, Lead_Time_Days: 10, Safety_Days: 4 },
    { Product_ID: "PROD_003", Current_Stock: 120, Min_Stock: 20, Reorder_Qty: 0, Reorder_Status: "OK", Opening_Stock: 150, Stock_In: 0, Stock_Out: 30, Last_Updated: new Date(), Avg_Daily_Sales_30D: 1, Lead_Time_Days: 5, Safety_Days: 3 }
  ].forEach(r => pcaiUpsertRowByKey_(inventory, "Product_ID", r.Product_ID, r));

  [
    { Order_ID: "SIM_OD_2001", Order_Date: new Date(), Lab_ID: "LAB_2001", Product_ID: "PROD_001", Quantity: 30, Unit_Selling_Price: 500, Discount: 0, Total_Amount: 15000, Order_Status: "Confirmed", Invoice_ID: "SIM_INV_2001", Invoice_Status: "Draft", Payment_Status: "Pending" },
    { Order_ID: "SIM_OD_2002", Order_Date: new Date(), Lab_ID: "LAB_2002", Product_ID: "PROD_002", Quantity: 20, Unit_Selling_Price: 40, Discount: 0, Total_Amount: 800, Order_Status: "Confirmed", Invoice_ID: "SIM_INV_2002", Invoice_Status: "Draft", Payment_Status: "Pending" }
  ].forEach(r => pcaiAppendMappedRow_(orders, r));

  [
    { Lab_ID: "LAB_2001", Total_Delivered: 25000, Total_Paid: 5000, Outstanding: 20000, Credit_Hold: "HOLD", Days_Overdue: 18, Credit_Limit: 10000, Allowed_Overdue_Days: 15 },
    { Lab_ID: "LAB_2002", Total_Delivered: 12000, Total_Paid: 9000, Outstanding: 3000, Credit_Hold: "OK", Days_Overdue: 4, Credit_Limit: 20000, Allowed_Overdue_Days: 15 }
  ].forEach(r => pcaiUpsertRowByKey_(ar, "Lab_ID", r.Lab_ID, r));
}

function pcaiSimulateMonthEndLoad_() {
  const orders = pcaiGetSheetRequired_(PCAI_SHEETS.TEST_ORDERS);
  const ar = pcaiGetSheetRequired_(PCAI_SHEETS.TEST_AR);
  const inventory = pcaiGetSheetRequired_(PCAI_SHEETS.TEST_INVENTORY);

  const productIds = ["PROD_001", "PROD_002", "PROD_003"];
  const revenueByLab = {};
  const stockOutByProduct = {};

  for (let i = 1; i <= 40; i++) {
    const labId = "LAB_ME_" + String((i % 10) + 1).padStart(3, "0");
    const productId = productIds[i % productIds.length];
    const qty = (i % 7) + 3;
    const price = productId === "PROD_001" ? 500 : (productId === "PROD_002" ? 40 : 120);
    const total = qty * price;
    const paymentStatus = (i % 4 === 0) ? "Pending" : "Received";

    pcaiAppendMappedRow_(orders, {
      Order_ID: "SIM_ME_" + String(i).padStart(4, "0"),
      Order_Date: new Date(),
      Lab_ID: labId,
      Product_ID: productId,
      Quantity: qty,
      Unit_Selling_Price: price,
      Discount: 0,
      Total_Amount: total,
      Order_Status: "Delivered",
      Invoice_ID: "SIM_ME_INV_" + String(i).padStart(4, "0"),
      Invoice_Status: paymentStatus === "Received" ? "Paid" : "Sent",
      Payment_Status: paymentStatus
    });

    revenueByLab[labId] = (revenueByLab[labId] || 0) + total;
    stockOutByProduct[productId] = (stockOutByProduct[productId] || 0) + qty;
  }

  Object.keys(revenueByLab).forEach((labId, idx) => {
    const outstanding = idx % 3 === 0 ? 25000 : 5000;
    const limit = idx % 3 === 0 ? 10000 : 50000;
    pcaiUpsertRowByKey_(ar, "Lab_ID", labId, {
      Lab_ID: labId,
      Total_Delivered: revenueByLab[labId],
      Total_Paid: revenueByLab[labId] - outstanding,
      Outstanding: outstanding,
      Credit_Limit: limit,
      Days_Overdue: idx % 3 === 0 ? 20 : 3,
      Allowed_Overdue_Days: 15,
      Credit_Hold: outstanding > limit ? "HOLD" : "OK"
    });
  });

  Object.keys(stockOutByProduct).forEach(productId => {
    const stockLeft = productId === "PROD_001" ? 8 : (productId === "PROD_002" ? 12 : 90);
    const minStock = productId === "PROD_003" ? 20 : 15;
    pcaiUpsertRowByKey_(inventory, "Product_ID", productId, {
      Product_ID: productId,
      Current_Stock: stockLeft,
      Min_Stock: minStock,
      Reorder_Qty: stockLeft < minStock ? 100 : 0,
      Reorder_Status: stockLeft < minStock ? "REORDER" : "OK",
      Opening_Stock: 200,
      Stock_In: 0,
      Stock_Out: stockOutByProduct[productId],
      Last_Updated: new Date(),
      Avg_Daily_Sales_30D: productId === "PROD_001" ? 10 : 5,
      Lead_Time_Days: 7,
      Safety_Days: 5
    });
  });
}

function pcaiSimulateCombinedStressScenario_() {
  const inventory = pcaiGetSheetRequired_(PCAI_SHEETS.TEST_INVENTORY);
  const orders = pcaiGetSheetRequired_(PCAI_SHEETS.TEST_ORDERS);
  const ar = pcaiGetSheetRequired_(PCAI_SHEETS.TEST_AR);

  [
    { Product_ID: "PROD_001", Current_Stock: 4, Min_Stock: 20, Reorder_Qty: 120, Reorder_Status: "REORDER", Opening_Stock: 120, Stock_In: 0, Stock_Out: 116, Last_Updated: new Date(), Avg_Daily_Sales_30D: 10, Lead_Time_Days: 7, Safety_Days: 5 },
    { Product_ID: "PROD_002", Current_Stock: 3, Min_Stock: 15, Reorder_Qty: 90, Reorder_Status: "REORDER", Opening_Stock: 80, Stock_In: 0, Stock_Out: 77, Last_Updated: new Date(), Avg_Daily_Sales_30D: 6, Lead_Time_Days: 10, Safety_Days: 4 },
    { Product_ID: "PROD_003", Current_Stock: 8, Min_Stock: 12, Reorder_Qty: 60, Reorder_Status: "REORDER", Opening_Stock: 70, Stock_In: 0, Stock_Out: 62, Last_Updated: new Date(), Avg_Daily_Sales_30D: 5, Lead_Time_Days: 8, Safety_Days: 3 }
  ].forEach(r => pcaiUpsertRowByKey_(inventory, "Product_ID", r.Product_ID, r));

  [
    { Order_ID: "SIM_CS_0001", Order_Date: new Date(), Lab_ID: "LAB_BIG_001", Product_ID: "PROD_001", Quantity: 25, Unit_Selling_Price: 500, Discount: 0, Total_Amount: 12500, Order_Status: "Delivered", Invoice_ID: "SIM_CS_INV_0001", Invoice_Status: "Sent", Payment_Status: "Pending" },
    { Order_ID: "SIM_CS_0002", Order_Date: new Date(), Lab_ID: "LAB_BIG_001", Product_ID: "PROD_002", Quantity: 40, Unit_Selling_Price: 40, Discount: 0, Total_Amount: 1600, Order_Status: "Delivered", Invoice_ID: "SIM_CS_INV_0002", Invoice_Status: "Sent", Payment_Status: "Pending" },
    { Order_ID: "SIM_CS_0003", Order_Date: new Date(), Lab_ID: "LAB_BIG_002", Product_ID: "PROD_001", Quantity: 18, Unit_Selling_Price: 500, Discount: 0, Total_Amount: 9000, Order_Status: "Delivered", Invoice_ID: "SIM_CS_INV_0003", Invoice_Status: "Sent", Payment_Status: "Pending" },
    { Order_ID: "SIM_CS_0004", Order_Date: new Date(), Lab_ID: "LAB_BIG_003", Product_ID: "PROD_003", Quantity: 22, Unit_Selling_Price: 120, Discount: 0, Total_Amount: 2640, Order_Status: "Delivered", Invoice_ID: "SIM_CS_INV_0004", Invoice_Status: "Draft", Payment_Status: "Pending" },
    { Order_ID: "SIM_CS_0005", Order_Date: new Date(), Lab_ID: "LAB_BIG_002", Product_ID: "PROD_002", Quantity: 30, Unit_Selling_Price: 40, Discount: 0, Total_Amount: 1200, Order_Status: "Delivered", Invoice_ID: "SIM_CS_INV_0005", Invoice_Status: "Sent", Payment_Status: "Received" }
  ].forEach(r => pcaiAppendMappedRow_(orders, r));

  [
    { Lab_ID: "LAB_BIG_001", Total_Delivered: 50000, Total_Paid: 10000, Outstanding: 40000, Credit_Hold: "HOLD", Days_Overdue: 30, Credit_Limit: 15000, Allowed_Overdue_Days: 15 },
    { Lab_ID: "LAB_BIG_002", Total_Delivered: 30000, Total_Paid: 12000, Outstanding: 18000, Credit_Hold: "HOLD", Days_Overdue: 22, Credit_Limit: 10000, Allowed_Overdue_Days: 15 },
    { Lab_ID: "LAB_BIG_003", Total_Delivered: 12000, Total_Paid: 9000, Outstanding: 3000, Credit_Hold: "OK", Days_Overdue: 5, Credit_Limit: 20000, Allowed_Overdue_Days: 15 }
  ].forEach(r => pcaiUpsertRowByKey_(ar, "Lab_ID", r.Lab_ID, r));
}

function pcaiSetupScenarioBenchmarks() {
  const sh = pcaiDeleteAndRecreateSheet_(PCAI_SHEETS.SCENARIO_BENCHMARKS);
  sh.getRange(1, 1, 1, 7).setValues([[
    "Scenario_Name",
    "Expected_Revenue",
    "Expected_Unpaid_Count",
    "Expected_Reorder_Count",
    "Expected_Top_Lab",
    "Expected_Top_Lab_Revenue",
    "Expected_Credit_Holds"
  ]]);

  sh.getRange(2, 1, 4, 7).setValues([
    ["high overdue labs", 12000, 2, 0, "LAB_RISK_001", 10000, 2],
    ["stock out stress", 15800, 2, 2, "LAB_2001", 15000, 1],
    ["month end load", 46820, 10, 2, "LAB_ME_002", 2860, 4],
    ["combined stress scenario", 26940, 4, 3, "LAB_BIG_001", 14100, 2]
  ]);

  sh.autoResizeColumns(1, 7);
  return "Scenario benchmarks created.";
}

function pcaiGetBenchmarkRow_(scenarioName) {
  const sh = pcaiGetSheetRequired_(PCAI_SHEETS.SCENARIO_BENCHMARKS);
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const map = {};
  headers.forEach((h, i) => map[h] = i);

  const rows = values.slice(1);
  const match = rows.find(r => String(r[map.Scenario_Name] || "").trim().toLowerCase() === String(scenarioName || "").trim().toLowerCase());
  if (!match) throw new Error("Benchmark not found for scenario: " + scenarioName);

  return {
    Scenario_Name: match[map.Scenario_Name],
    Expected_Revenue: match[map.Expected_Revenue],
    Expected_Unpaid_Count: match[map.Expected_Unpaid_Count],
    Expected_Reorder_Count: match[map.Expected_Reorder_Count],
    Expected_Top_Lab: match[map.Expected_Top_Lab],
    Expected_Top_Lab_Revenue: match[map.Expected_Top_Lab_Revenue],
    Expected_Credit_Holds: match[map.Expected_Credit_Holds]
  };
}

function pcaiVerifySandboxDashboard_(scenarioName) {
  const sh = pcaiGetSheetRequired_(PCAI_SHEETS.TEST_DASHBOARD);
  sh.getRange(4, 1, Math.max(sh.getMaxRows() - 3, 1), 5).clearContent();

  const benchmark = pcaiGetBenchmarkRow_(scenarioName);
  const orders = pcaiGetRowsAsObjects_(pcaiGetSheetRequired_(PCAI_SHEETS.TEST_ORDERS), "Order_ID");
  const ar = pcaiGetRowsAsObjects_(pcaiGetSheetRequired_(PCAI_SHEETS.TEST_AR), "Lab_ID");
  const inventory = pcaiGetRowsAsObjects_(pcaiGetSheetRequired_(PCAI_SHEETS.TEST_INVENTORY), "Product_ID");

  const totalRevenue = orders.reduce((s, r) => s + pcaiNum_(r.Total_Amount), 0);
  const unpaidCount = orders.filter(r => String(r.Payment_Status || "").trim() !== "Received").length;
  const reorderCount = inventory.filter(r => String(r.Reorder_Status || "").trim() === "REORDER").length;

  const revenueByLab = {};
  orders.forEach(r => {
    const lab = String(r.Lab_ID || "").trim();
    if (!lab) return;
    revenueByLab[lab] = (revenueByLab[lab] || 0) + pcaiNum_(r.Total_Amount);
  });

  const sortedLabs = Object.keys(revenueByLab).map(k => ({ lab: k, revenue: revenueByLab[k] })).sort((a, b) => b.revenue - a.revenue);
  const topLab = sortedLabs.length ? sortedLabs[0].lab : "";
  const topLabRevenue = sortedLabs.length ? sortedLabs[0].revenue : 0;
  const creditHoldCount = ar.filter(r => String(r.Credit_Hold || "").trim() === "HOLD").length;

  const checks = [
    ["Scenario", benchmark.Scenario_Name, scenarioName, pcaiCompareValues_(scenarioName, benchmark.Scenario_Name) ? "PASS" : "FAIL", "Scenario name recorded"],
    ["Total Revenue", benchmark.Expected_Revenue, totalRevenue, pcaiCompareValues_(totalRevenue, benchmark.Expected_Revenue) ? "PASS" : "FAIL", "Sum of TEST_Orders.Total_Amount"],
    ["Unpaid Count", benchmark.Expected_Unpaid_Count, unpaidCount, pcaiCompareValues_(unpaidCount, benchmark.Expected_Unpaid_Count) ? "PASS" : "FAIL", "Count of Payment_Status != Received"],
    ["Reorder Count", benchmark.Expected_Reorder_Count, reorderCount, pcaiCompareValues_(reorderCount, benchmark.Expected_Reorder_Count) ? "PASS" : "FAIL", "Count of TEST_Inventory.Reorder_Status = REORDER"],
    ["Top Lab", benchmark.Expected_Top_Lab, topLab, pcaiCompareValues_(topLab, benchmark.Expected_Top_Lab) ? "PASS" : "FAIL", "Highest revenue lab"],
    ["Top Lab Revenue", benchmark.Expected_Top_Lab_Revenue, topLabRevenue, pcaiCompareValues_(topLabRevenue, benchmark.Expected_Top_Lab_Revenue) ? "PASS" : "FAIL", "Revenue of highest revenue lab"],
    ["Credit Holds Present", benchmark.Expected_Credit_Holds, creditHoldCount, pcaiCompareValues_(creditHoldCount, benchmark.Expected_Credit_Holds) ? "PASS" : "FAIL", "Count HOLD in TEST_AR_Credit_Control"]
  ];

  sh.getRange(4, 1, checks.length, 5).setValues(checks);
  sh.autoResizeColumns(1, 5);
}

function pcaiGetDashboardChecks_() {
  const sh = pcaiGetSheetRequired_(PCAI_SHEETS.TEST_DASHBOARD);
  const lastRow = sh.getLastRow();
  if (lastRow < 4) return [];

  return sh.getRange(4, 1, lastRow - 3, 5).getValues()
    .filter(r => String(r[0] || "").trim() !== "")
    .map(r => ({
      Check_Name: r[0],
      Expected_Value: r[1],
      Actual_Value: r[2],
      Result: r[3],
      Notes: r[4]
    }));
}

function pcaiCreateRegressionSummarySheet_() {
  const sh = pcaiDeleteAndRecreateSheet_(PCAI_SHEETS.REGRESSION_SUMMARY);
  sh.getRange("A1").setValue("PrimeCare Regression Summary").setFontWeight("bold").setFontSize(16);
  sh.getRange("A3:H3").setValues([["Scenario", "Check_Name", "Expected_Value", "Actual_Value", "Result", "Notes", "Run_Timestamp", "Overall_Scenario_Result"]]);
  return sh;
}

function pcaiRunAllSandboxScenarios() {
  const scenarios = ["high overdue labs", "stock out stress", "month end load", "combined stress scenario"];
  const sh = pcaiCreateRegressionSummarySheet_();
  const out = [];

  scenarios.forEach(scenario => {
    pcaiRunSandboxScenarioByName(scenario);
    const checks = pcaiGetDashboardChecks_();
    const overall = checks.every(r => String(r.Result).trim() === "PASS") ? "PASS" : "FAIL";

    checks.forEach(r => {
      out.push([scenario, r.Check_Name, r.Expected_Value, r.Actual_Value, r.Result, r.Notes, new Date(), overall]);
    });
  });

  if (out.length) sh.getRange(4, 1, out.length, 8).setValues(out);
  sh.autoResizeColumns(1, 8);
  pcaiLogAction_("RUN_ALL_SANDBOX_SCENARIOS", "Completed full regression suite");
  return "All sandbox scenarios executed.";
}

function pcaiGetScenarioTestStatus_() {
  if (!pcaiSheetExists_(PCAI_SHEETS.REGRESSION_SUMMARY)) return "NOT RUN";
  const sh = pcaiGetSheetRequired_(PCAI_SHEETS.REGRESSION_SUMMARY);
  const values = sh.getDataRange().getValues();
  if (values.length < 4) return "NOT RUN";

  const headers = values[2];
  const idx = headers.indexOf("Overall_Scenario_Result");
  if (idx === -1) return "UNKNOWN";

  let hasFail = false;
  let hasPass = false;
  for (let i = 3; i < values.length; i++) {
    const val = String(values[i][idx] || "").trim();
    if (val === "FAIL") hasFail = true;
    if (val === "PASS") hasPass = true;
  }

  if (hasFail) return "FAIL";
  if (hasPass) return "PASS";
  return "NOT RUN";
}

function pcaiMenuRunHighOverdueLabs() {
  return pcaiRunSandboxScenarioByName("high overdue labs");
}

function pcaiMenuRunStockOutStress() {
  return pcaiRunSandboxScenarioByName("stock out stress");
}

function pcaiMenuRunMonthEndLoad() {
  return pcaiRunSandboxScenarioByName("month end load");
}

function pcaiMenuRunCombinedStressScenario() {
  return pcaiRunSandboxScenarioByName("combined stress scenario");
}