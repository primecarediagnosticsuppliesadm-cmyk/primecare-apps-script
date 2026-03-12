/************************************************************
 * 60_Sandbox.gs
 * Sandbox workbook sheet setup
 ************************************************************/

function pcCreateSandboxSheets() {
  const ss = pcGetSandboxSS_();

  pcWriteHeaders_(pcEnsureSheet_(ss, "TEST_Orders"), [
    "Order_ID","Order_Date","Lab_ID","Product_ID","Quantity","Unit_Selling_Price",
    "Total_Amount","Order_Status","Invoice_ID","Invoice_Status","Payment_Status"
  ]);

  pcWriteHeaders_(pcEnsureSheet_(ss, "TEST_Inventory"), [
    "Product_ID","Product_Name","Current_Stock","Min_Stock","Reorder_Qty",
    "Reorder_Status","Opening_Stock","Stock_In","Stock_Out","Last_Updated",
    "Avg_Daily_Sales_30D","Lead_Time_Days","Safety_Days"
  ]);

  pcWriteHeaders_(pcEnsureSheet_(ss, "TEST_AR_Credit_Control"), [
    "Lab_ID","Lab_Name","Total_Delivered","Total_Paid","Outstanding",
    "Credit_Limit","Days_Overdue","Allowed_Overdue_Days","Credit_Hold"
  ]);

  pcEnsureSheet_(ss, "AI_Test_Cases").setFrozenRows(1);
  pcEnsureSheet_(ss, "AI_Test_Results").setFrozenRows(1);
  pcEnsureSheet_(ss, "AI_Regression_Summary").setFrozenRows(1);

  pcWriteHeaders_(pcEnsureSheet_(ss, "AI_Scenario_Benchmarks"), [
    "Scenario_Name","Expected_Revenue","Expected_Unpaid_Count","Expected_Reorder_Count",
    "Expected_Top_Lab","Expected_Top_Lab_Revenue","Expected_Credit_Holds"
  ]);

  SpreadsheetApp.getUi().alert("Sandbox sheets created.");
}