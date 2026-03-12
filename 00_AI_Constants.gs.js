/************************************************************
 * PRIMECARE AI CONSTANTS
 ************************************************************/

const PCAI_SHEETS = {

  /* ================================
     LIVE DATA SHEETS IN CURRENT WORKBOOK
     ================================ */

  ORDERS: "Orders",
  ORDER_LINES: "Order_Lines",
  INVENTORY: "Inventory",
  AR: "AR_Credit_Control",
  PRODUCT_MASTER: "Product_Master",
  REMEDIATION_REPORT: "Remediation_Report",

  /* ================================
     AI OUTPUT SHEETS
     ================================ */

  DASHBOARD: "Dashboard",
  SYSTEM_HEALTH: "AI_System_Health",
  ALERTS: "AI_Alerts",
  RECOMMENDATIONS: "AI_Recommendations",
  RISK: "AI_Risk_Predictions",
  EXEC_DASHBOARD: "AI_Executive_Command_Dashboard",
  DAILY_SUMMARY: "AI_Daily_Summary",
  WEEKLY_REVIEW: "AI_Weekly_Business_Review",
  FORECASTS: "AI_Forecasts",

  /* ================================
     SUPPORT SHEETS
     ================================ */

  SYSTEM_STATUS: "System_Status",
  OPERATIONS_DASHBOARD: "Operations_Dashboard",
  ACTION_LOG: "AI_Action_Log",
  GROWTH_ENGINE: "Growth_Engine",

  /* ================================
     SANDBOX
     ================================ */

  TEST_ORDERS: "TEST_Orders",
  TEST_INVENTORY: "TEST_Inventory",
  TEST_AR: "TEST_AR_Credit_Control",
  TEST_RESULTS: "AI_Test_Results",
  TEST_CASES: "AI_Test_Cases",
  REGRESSION_SUMMARY: "AI_Regression_Summary",
  TEST_DASHBOARD: "AI_Regression_Summary",
  SCENARIO_BENCHMARKS: "AI_Scenario_Benchmarks"
};


/************************************************************
 * ENUMS
 ************************************************************/

const PCAI_ENUMS = {
    ORDER_STATUS: [
    "Draft",
    "Confirmed",
    "Packed",
    "Delivered",
    "Cancelled"
  ],
  
  PAYMENT_STATUS: [
    "Pending",
    "Partial",
    "Received",
    "Overdue"
  ],

  INVOICE_STATUS: [
    "Draft",
    "Sent",
    "Cancelled",
    "Paid"
  ],

  REORDER_STATUS: [
    "OK",
    "REORDER"
  ]
};


/************************************************************
 * HEALTH ENGINE
 ************************************************************/

const PCAI_HEALTH = {
  SHEET: PCAI_SHEETS.SYSTEM_HEALTH,

  REQUIRED_SHEETS: [
    PCAI_SHEETS.ORDERS,
    PCAI_SHEETS.ORDER_LINES,
    PCAI_SHEETS.INVENTORY,
    PCAI_SHEETS.AR,
    PCAI_SHEETS.PRODUCT_MASTER
  ],

  REQUIRED_HEADERS: {
    Orders: [
      "Order_ID",
      "Order_Date",
      "Lab_ID",
      "Lab_Name",
      "Invoice_ID",
      "Invoice_Status",
      "Payment_Status",
      "Order_Total",
      "Created_At"
    ],
    Order_Lines: [
      "Order_Line_ID",
      "Order_ID",
      "Invoice_ID",
      "Product_ID",
      "Product_Name",
      "Quantity",
      "Unit_Selling_Price",
      "Line_Total",
      "Tax_Rate",
      "Tax_Amount",
      "Net_Line_Total",
      "Created_At"
    ],
    Inventory: [
      "Product_ID",
      "Product_Name",
      "Current_Stock",
      "Min_Stock",
      "Reorder_Status"
    ],
    AR_Credit_Control: [
      "Lab_ID",
      "Outstanding",
      "Credit_Limit",
      "Credit_Hold"
    ],
    Product_Master: [
      "Product_ID",
      "Product_Name",
      "Unit_Selling_Price",
      "Tax_Rate",
      "Active_Flag"
    ]
  },

  CRITICAL_FIELDS: {
    Orders: [
      "Order_ID",
      "Lab_ID",
      "Invoice_ID",
      "Order_Total"
    ],
    Order_Lines: [
      "Order_Line_ID",
      "Order_ID",
      "Product_ID",
      "Quantity",
      "Unit_Selling_Price",
      "Net_Line_Total"
    ],
    Inventory: [
      "Product_ID",
      "Current_Stock"
    ],
    AR_Credit_Control: [
      "Lab_ID",
      "Credit_Hold"
    ],
    Product_Master: [
      "Product_ID",
      "Product_Name",
      "Unit_Selling_Price"
    ]
  },

  CREDIT_LIMIT_WARNING_RATIO: 0.8,
  PAYMENT_PENDING_WARNING_DAYS: 15
};


/************************************************************
 * ALERT ENGINE
 ************************************************************/

const PCAI_ALERTS = {
  SHEET: PCAI_SHEETS.ALERTS,
  CREDIT_RISK_THRESHOLD: 0.9,
  OVERDUE_DAYS_ALERT: 30,
  LOW_STOCK_THRESHOLD: 0.2
};


/************************************************************
 * RECOMMENDATION ENGINE
 ************************************************************/

const PCAI_RECOMMENDATIONS = {
  SHEET: PCAI_SHEETS.RECOMMENDATIONS
};


/************************************************************
 * RISK ENGINE
 ************************************************************/

const PCAI_RISK = {
  SHEET: PCAI_SHEETS.RISK
};


/************************************************************
 * EXECUTIVE DASHBOARD
 ************************************************************/

const PCAI_EXEC = {
  SHEET: PCAI_SHEETS.EXEC_DASHBOARD
};


/************************************************************
 * DAILY SUMMARY
 ************************************************************/

const PCAI_DAILY = {
  SHEET: PCAI_SHEETS.DAILY_SUMMARY
};


/************************************************************
 * WEEKLY REVIEW
 ************************************************************/

const PCAI_WEEKLY = {
  SHEET: PCAI_SHEETS.WEEKLY_REVIEW
};


/************************************************************
 * FORECAST ENGINE
 ************************************************************/

const PCAI_FORECAST = {
  SHEET: PCAI_SHEETS.FORECASTS
};