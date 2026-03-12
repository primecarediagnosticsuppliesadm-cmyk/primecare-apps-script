/************************************************************
 * 16_Tab_Organizer.gs
 * Organize and color tabs safely without renaming
 ************************************************************/

function pcOrganizeAndColorTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const groups = [
    {
      color: "#1d4ed8", // strong blue
      sheets: [
        "Form_Responses_Raw",
        "Orders",
        "Order_Lines",
        "Invoice_Register",
        "Inventory",
        "AR_Credit_Control",
        "Product_Master",
        "Settings",
        "ERP_Export",
        "Salesforce_Export"
      ]
    },
    {
      color: "#16a34a", // strong green
      sheets: [
        "Dashboard",
        "AI_System_Health",
        "System_Status",
        "Operations_Dashboard",
        "AI_Alerts",
        "AI_Recommendations",
        "AI_Risk_Predictions",
        "AI_Executive_Command_Dashboard",
        "AI_Daily_Summary",
        "AI_Weekly_Business_Review",
        "AI_Forecasts"
      ]
    },
    {
      color: "#ca8a04", // strong yellow/gold
      sheets: [
        "TEST_Orders",
        "TEST_Inventory",
        "TEST_AR_Credit_Control",
        "AI_Test_Cases",
        "AI_Test_Results",
        "AI_Regression_Summary",
        "AI_Scenario_Benchmarks"
      ]
    }
  ];

  let pos = 1;

  groups.forEach(group => {
    group.sheets.forEach(name => {
      const sh = ss.getSheetByName(name);
      if (!sh) return;

      ss.setActiveSheet(sh);
      ss.moveActiveSheet(pos);
      sh.setTabColor(group.color);
      pos++;
    });
  });

  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert("Tabs organized and colored successfully.");
}