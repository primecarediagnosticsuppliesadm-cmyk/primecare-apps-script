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