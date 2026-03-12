/************************************************************
 * 50_AI.gs
 * AI workbook sheet setup
 ************************************************************/

function pcCreateAISheets() {
  const ss = pcGetAISS_();

  for (let i = 0; i < PRIMECARE_MULTI.AI_SHEETS.length; i++) {
    const sh = pcEnsureSheet_(ss, PRIMECARE_MULTI.AI_SHEETS[i]);
    sh.setFrozenRows(1);
  }

  SpreadsheetApp.getUi().alert("AI sheets created.");
}