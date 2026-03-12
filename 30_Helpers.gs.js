/************************************************************
 * 30_Helpers.gs
 * Helper methods
 ************************************************************/

function pcEnsureSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  return sh;
}

function pcEnsureColumnCount_(sheet, neededCols) {
  const currentCols = sheet.getMaxColumns();
  if (currentCols < neededCols) {
    sheet.insertColumnsAfter(currentCols, neededCols - currentCols);
  }
}

function pcApplyHeaderStyle_(range) {
  range
    .setFontWeight("bold")
    .setBackground(PRIMECARE_MULTI.HEADER_BG)
    .setHorizontalAlignment("center");
}

function pcWriteHeaders_(sheet, headers) {
  const neededCols = headers.length;
  pcEnsureColumnCount_(sheet, neededCols);

  const headerRange = sheet.getRange(1, 1, 1, neededCols);
  headerRange.clearContent();
  headerRange.setValues([headers]);
  pcApplyHeaderStyle_(headerRange);

  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, neededCols, PRIMECARE_MULTI.DEFAULT_COLUMN_WIDTH);
}

function pcSetFormulaOnly_(sheet, formula) {
  sheet.getRange("A1").clearContent();
  sheet.getRange("A1").setFormula(formula);
  sheet.setFrozenRows(1);
}

function pcWriteTwoColumnKeyValue_(sheet, rows) {
  pcEnsureColumnCount_(sheet, 2);

  const totalRows = rows.length;
  sheet.getRange(1, 1, Math.max(totalRows, 1), 2).clearContent();
  sheet.getRange(1, 1, totalRows, 2).setValues(rows);

  const headerRange = sheet.getRange(1, 1, 1, 2);
  pcApplyHeaderStyle_(headerRange);

  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 2, 220);
}

function pcWriteTable_(sheet, rows) {
  if (!rows || !rows.length) return;

  const colCount = rows[0].length;
  const rowCount = rows.length;

  pcEnsureColumnCount_(sheet, colCount);
  sheet.getRange(1, 1, rowCount, colCount).clearContent();
  sheet.getRange(1, 1, rowCount, colCount).setValues(rows);

  const headerRange = sheet.getRange(1, 1, 1, colCount);
  pcApplyHeaderStyle_(headerRange);

  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, colCount, PRIMECARE_MULTI.DEFAULT_COLUMN_WIDTH);
}