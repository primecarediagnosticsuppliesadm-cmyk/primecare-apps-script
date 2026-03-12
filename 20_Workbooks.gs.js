/************************************************************
 * 20_Workbooks.gs
 * Workbook creation + getters
 ************************************************************/

function pcCreateProductionWorkbook() {
  const ss = SpreadsheetApp.create(PRIMECARE_MULTI.PRODUCTION_FILE_NAME);
  PropertiesService.getScriptProperties().setProperty(PC_MULTI_KEYS.PRODUCTION_ID, ss.getId());
  SpreadsheetApp.getUi().alert("Production workbook created:\n" + ss.getUrl());
}

function pcCreateAIWorkbook() {
  const ss = SpreadsheetApp.create(PRIMECARE_MULTI.AI_FILE_NAME);
  PropertiesService.getScriptProperties().setProperty(PC_MULTI_KEYS.AI_ID, ss.getId());
  SpreadsheetApp.getUi().alert("AI workbook created:\n" + ss.getUrl());
}

function pcCreateSandboxWorkbook() {
  const ss = SpreadsheetApp.create(PRIMECARE_MULTI.SANDBOX_FILE_NAME);
  PropertiesService.getScriptProperties().setProperty(PC_MULTI_KEYS.SANDBOX_ID, ss.getId());
  SpreadsheetApp.getUi().alert("Sandbox workbook created:\n" + ss.getUrl());
}

function pcGetProductionSS_() {
  const id = PropertiesService.getScriptProperties().getProperty(PC_MULTI_KEYS.PRODUCTION_ID);
  if (!id) throw new Error("Production workbook not created yet.");
  return SpreadsheetApp.openById(id);
}

function pcGetAISS_() {
  const id = PropertiesService.getScriptProperties().getProperty(PC_MULTI_KEYS.AI_ID);
  if (!id) throw new Error("AI workbook not created yet.");
  return SpreadsheetApp.openById(id);
}

function pcGetSandboxSS_() {
  const id = PropertiesService.getScriptProperties().getProperty(PC_MULTI_KEYS.SANDBOX_ID);
  if (!id) throw new Error("Sandbox workbook not created yet.");
  return SpreadsheetApp.openById(id);
}