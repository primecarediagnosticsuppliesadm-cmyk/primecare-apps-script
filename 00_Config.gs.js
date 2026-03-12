/************************************************************
 * 00_Config.gs
 * PrimeCare multi-workbook configuration
 ************************************************************/

const PRIMECARE_MULTI = Object.freeze({
  PRODUCTION_FILE_NAME: "PrimeCare_Operations",
  AI_FILE_NAME: "PrimeCare_AI_Control_Tower",
  SANDBOX_FILE_NAME: "PrimeCare_Sandbox",

  DEFAULT_COLUMN_WIDTH: 140,
  HEADER_BG: "#d9eaf7",

  AI_SHEETS: Object.freeze([
    "Config",
    "Imported_Orders",
    "Imported_Inventory",
    "Imported_AR",
    "Imported_Product_Master",
    "AI_System_Health",
    "AI_Alerts",
    "AI_Recommendations",
    "AI_Risk_Predictions",
    "AI_Executive_Command_Dashboard",
    "AI_Daily_Summary",
    "AI_Weekly_Business_Review",
    "AI_Forecasts"
  ])
});

const PC_MULTI_KEYS = Object.freeze({
  PRODUCTION_ID: "PC_PRODUCTION_ID",
  AI_ID: "PC_AI_ID",
  SANDBOX_ID: "PC_SANDBOX_ID"
});

const PC_NAV_KEYS = Object.freeze({
  LEGACY_ID: "PC_LEGACY_ID",
  PRODUCTION_ID: "PC_PRODUCTION_ID",
  AI_ID: "PC_AI_ID",
  SANDBOX_ID: "PC_SANDBOX_ID"
});

const PC_NAV_LABELS = Object.freeze({
  LEGACY: "AI PrimeCare Diagnostics Supplies",
  PRODUCTION: PRIMECARE_MULTI.PRODUCTION_FILE_NAME,
  AI: PRIMECARE_MULTI.AI_FILE_NAME,
  SANDBOX: PRIMECARE_MULTI.SANDBOX_FILE_NAME
});

/************************************************************
 * PrimeCare AI sheet registry
 * Central sheet-name map for AI engines / dashboards / reports
 ************************************************************/
const PCAI_SHEETS = Object.freeze({
  CONFIG: "Config",

  IMPORTED_ORDERS: "Imported_Orders",
  IMPORTED_INVENTORY: "Imported_Inventory",
  IMPORTED_AR: "Imported_AR",
  IMPORTED_PRODUCT_MASTER: "Imported_Product_Master",

  SYSTEM_HEALTH: "AI_System_Health",
  ALERTS: "AI_Alerts",
  RECOMMENDATIONS: "AI_Recommendations",
  RISK: "AI_Risk_Predictions",
  EXEC_DASHBOARD: "AI_Executive_Command_Dashboard",
  DAILY_SUMMARY: "AI_Daily_Summary",
  WEEKLY_BUSINESS_REVIEW: "AI_Weekly_Business_Review",
  FORECASTS: "AI_Forecasts",

  GROWTH_ENGINE: "Growth_Engine",
  DAILY_BUSINESS_REVIEW: "Daily_Business_Review",
  COLLECTIONS_REVIEW: "Collections_Review",
  INVENTORY_REVIEW: "Inventory_Review",
  REVENUE_REVIEW: "Revenue_Review",

  ORDERS: "Orders",
  ORDER_LINES: "Order_Lines",
  INVENTORY: "Inventory",
  AR: "AR_Credit_Control",
  PRODUCT_MASTER: "Product_Master"
});

/************************************************************
 * PrimeCare thresholds / control settings
 * Keep business logic thresholds centralized here
 ************************************************************/
const PCAI_LIMITS = Object.freeze({
  CREDIT_WARNING_UTILIZATION: 0.80,
  CREDIT_BREACH_UTILIZATION: 1.00,

  OVERDUE_WARNING_DAYS: 15,
  OVERDUE_CRITICAL_DAYS: 30,

  STOCKOUT_QTY: 0,
  TOP_N_DEFAULT: 5,
  TOP_N_EXTENDED: 10,

  TARGET_REVENUE_INR: 3000000
});

/************************************************************
 * PrimeCare UI labels / formatting
 ************************************************************/
const PCAI_UI = Object.freeze({
  DEFAULT_COLUMN_WIDTH: PRIMECARE_MULTI.DEFAULT_COLUMN_WIDTH,
  HEADER_BG: PRIMECARE_MULTI.HEADER_BG,

  DASHBOARD_TITLE: "PrimeCare AI Executive Command Dashboard",
  DAILY_REVIEW_TITLE: "PrimeCare Daily Business Review",
  COLLECTIONS_REVIEW_TITLE: "PrimeCare Collections Review",
  INVENTORY_REVIEW_TITLE: "PrimeCare Inventory Review",
  REVENUE_REVIEW_TITLE: "PrimeCare Revenue Review",
  RISK_TITLE: "PrimeCare Risk Predictions",
  ALERTS_TITLE: "PrimeCare Alerts",
  RECOMMENDATIONS_TITLE: "PrimeCare AI Recommendations",
  FORECASTS_TITLE: "PrimeCare Forecasts",
  GROWTH_ENGINE_TITLE: "PrimeCare Growth Engine"
});