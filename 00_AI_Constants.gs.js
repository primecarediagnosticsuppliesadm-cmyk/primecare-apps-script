/************************************************************
 * 00_AI_Constants.gs
 * PrimeCare AI constants
 ************************************************************/
 
const PCAI_SHEETS = Object.freeze({
  ORDERS: "Orders",
  ORDER_LINES: "Order_Lines",
  INVENTORY: "Inventory",
  AR: "AR_Credit_Control",
  PRODUCT_MASTER: "Product_Master",

  SYSTEM_HEALTH: "AI_System_Health",
  ALERTS: "AI_Alerts",
  RECOMMENDATIONS: "AI_Recommendations",
  RISK: "AI_Risk_Predictions",
  EXEC_DASHBOARD: "AI_Executive_Command_Dashboard",
  DAILY_SUMMARY: "AI_Daily_Summary",
  WEEKLY_BUSINESS_REVIEW: "AI_Weekly_Business_Review",
  FORECASTS: "AI_Forecasts",

  SYSTEM_STATUS: "AI_System_Status",
  OPERATIONS_DASHBOARD: "AI_Operations_Dashboard",
  REMEDIATION_REPORT: "AI_Remediation_Report",
  ACTION_LOG: "AI_Action_Log",
  GROWTH_ENGINE: "AI_Growth_Engine",

  COLLECTIONS_RISK: "AI_Collections_Risk",
REORDER_URGENCY: "AI_Reorder_Urgency",
TOP_LAB_RISK: "AI_Top_Lab_Risk",
STOCK_RISK: "AI_Stock_Risk",

  TEST_ORDERS: "TEST_Orders",
  TEST_INVENTORY: "TEST_Inventory",
  TEST_AR: "TEST_AR_Credit_Control",
  TEST_RESULTS: "AI_Test_Results",
  TEST_CASES: "AI_Test_Cases",
  TEST_DASHBOARD: "TEST_Dashboard_Checks",
  REGRESSION_SUMMARY: "AI_Regression_Summary",
  SCENARIO_BENCHMARKS: "AI_Scenario_Benchmarks"
});

const PCAI_ENUMS = Object.freeze({
  ORDER_STATUS: Object.freeze([
    "Draft",
    "Confirmed",
    "Packed",
    "Delivered",
    "Cancelled"
  ]),

  PAYMENT_STATUS: Object.freeze([
    "Pending",
    "Partial",
    "Received",
    "Overdue"
  ]),

  INVOICE_STATUS: Object.freeze([
    "Draft",
    "Sent",
    "Cancelled",
    "Paid"
  ]),

  REORDER_STATUS: Object.freeze([
    "OK",
    "REORDER"
  ])
});

const PCAI_HEALTH = Object.freeze({
  SHEET: PCAI_SHEETS.SYSTEM_HEALTH,

  REQUIRED_SHEETS: Object.freeze([
    PCAI_SHEETS.ORDERS,
    PCAI_SHEETS.ORDER_LINES,
    PCAI_SHEETS.INVENTORY,
    PCAI_SHEETS.AR,
    PCAI_SHEETS.PRODUCT_MASTER
  ]),

  REQUIRED_HEADERS: Object.freeze({
    Orders: Object.freeze([
      "Order_ID",
      "Order_Date",
      "Lab_ID",
      "Lab_Name",
      "Invoice_ID",
      "Invoice_Status",
      "Payment_Status",
      "Order_Total",
      "Created_At"
    ]),
    Order_Lines: Object.freeze([
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
    ]),
    Inventory: Object.freeze([
      "Product_ID",
      "Product_Name",
      "Current_Stock",
      "Min_Stock",
      "Reorder_Status"
    ]),
    AR_Credit_Control: Object.freeze([
      "Lab_ID",
      "Outstanding",
      "Credit_Limit",
      "Credit_Hold"
    ]),
    Product_Master: Object.freeze([
      "Product_ID",
      "Product_Name",
      "Unit_Selling_Price",
      "Tax_Rate",
      "Active_Flag"
    ])
  }),

  CRITICAL_FIELDS: Object.freeze({
    Orders: Object.freeze([
      "Order_ID",
      "Lab_ID",
      "Invoice_ID",
      "Order_Total"
    ]),
    Order_Lines: Object.freeze([
      "Order_Line_ID",
      "Order_ID",
      "Product_ID",
      "Quantity",
      "Unit_Selling_Price",
      "Net_Line_Total"
    ]),
    Inventory: Object.freeze([
      "Product_ID",
      "Current_Stock"
    ]),
    AR_Credit_Control: Object.freeze([
      "Lab_ID",
      "Credit_Hold"
    ]),
    Product_Master: Object.freeze([
      "Product_ID",
      "Product_Name",
      "Unit_Selling_Price"
    ])
  }),

  CREDIT_LIMIT_WARNING_RATIO: 0.8,
  PAYMENT_PENDING_WARNING_DAYS: 15
});

const PCAI_ALERTS = Object.freeze({
  SHEET: PCAI_SHEETS.ALERTS,
  CREDIT_RISK_THRESHOLD: 0.9,
  OVERDUE_DAYS_ALERT: 30,
  LOW_STOCK_THRESHOLD: 0.2
});

const PCAI_RECOMMENDATIONS = Object.freeze({
  SHEET: PCAI_SHEETS.RECOMMENDATIONS
});

const PCAI_RISK = Object.freeze({
  SHEET: PCAI_SHEETS.RISK
});

const PCAI_EXEC = Object.freeze({
  SHEET: PCAI_SHEETS.EXEC_DASHBOARD
});

const PCAI_DAILY = Object.freeze({
  SHEET: PCAI_SHEETS.DAILY_SUMMARY
});

const PCAI_WEEKLY = Object.freeze({
  SHEET: PCAI_SHEETS.WEEKLY_BUSINESS_REVIEW
});

const PCAI_FORECAST = Object.freeze({
  SHEET: PCAI_SHEETS.FORECASTS
});

const PCAI_CONFIG = Object.freeze({
  MODEL: "gpt-4o-mini",
  API_URL: "https://api.openai.com/v1/chat/completions",
  MAX_ROWS_PER_SHEET: 200,
  MAX_CHARS: 120000,
  COMPANY_GOAL: "Build a highly reliable, data-driven diagnostic consumables distribution business that scales cleanly toward ₹1Cr/month with strong controls on receivables, inventory, margin, and operations."
});