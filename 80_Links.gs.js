/************************************************************
 * 80_Links.gs
 * Show workbook links
 ************************************************************/

function pcShowWorkbookLinks() {
  const prod = pcGetProductionSS_();
  const ai = pcGetAISS_();
  const sandbox = pcGetSandboxSS_();

  SpreadsheetApp.getUi().alert(
    "PrimeCare Workbooks\n\n" +
    "Production:\n" + prod.getUrl() + "\n\n" +
    "AI:\n" + ai.getUrl() + "\n\n" +
    "Sandbox:\n" + sandbox.getUrl()
  );
}