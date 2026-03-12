/************************************************************
 * 30_Helpers.gs
 * Shared helper methods
 ************************************************************/

function pcEnsureSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  return sh;
}

function pcSheetExists_(ss, name) {
  return !!ss.getSheetByName(name);
}

function pcGetSheetRequired_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) {
    throw new Error("Required sheet not found: " + name);
  }
  return sh;
}

function pcEnsureColumnCount_(sheet, neededCols) {
  const currentCols = sheet.getMaxColumns();
  if (currentCols < neededCols) {
    sheet.insertColumnsAfter(currentCols, neededCols - currentCols);
  }
}

function pcEnsureRowCount_(sheet, neededRows) {
  const currentRows = sheet.getMaxRows();
  if (currentRows < neededRows) {
    sheet.insertRowsAfter(currentRows, neededRows - currentRows);
  }
}

function pcClearDataKeepSheet_(sheet) {
  const maxRows = sheet.getMaxRows();
  const maxCols = sheet.getMaxColumns();

  if (maxRows > 0 && maxCols > 0) {
    sheet.getRange(1, 1, maxRows, maxCols).clearContent();
    sheet.getRange(1, 1, maxRows, maxCols).clearFormat();
  }
}

function pcResetSheetContents_(sheet) {
  pcClearDataKeepSheet_(sheet);
  sheet.setFrozenRows(0);
  sheet.setFrozenColumns(0);
  return sheet;
}

function pcResetNamedSheet_(ss, name) {
  const sh = pcEnsureSheet_(ss, name);
  return pcResetSheetContents_(sh);
}

function pcApplyHeaderStyle_(range) {
  range
    .setFontWeight("bold")
    .setBackground(PRIMECARE_MULTI.HEADER_BG)
    .setHorizontalAlignment("center");
}

function pcAutoResizeFromHeaders_(sheet, headers) {
  if (!headers || !headers.length) return;
  sheet.setColumnWidths(1, headers.length, PRIMECARE_MULTI.DEFAULT_COLUMN_WIDTH);
}

function pcWriteHeaders_(sheet, headers) {
  if (!headers || !headers.length) {
    throw new Error("pcWriteHeaders_: headers are required");
  }

  const neededCols = headers.length;
  pcEnsureColumnCount_(sheet, neededCols);

  const headerRange = sheet.getRange(1, 1, 1, neededCols);
  headerRange.clearContent();
  headerRange.setValues([headers]);
  pcApplyHeaderStyle_(headerRange);

  sheet.setFrozenRows(1);
  pcAutoResizeFromHeaders_(sheet, headers);
}

function pcSetFormulaOnly_(sheet, formula) {
  if (!formula) {
    throw new Error("pcSetFormulaOnly_: formula is required");
  }

  pcResetSheetContents_(sheet);
  sheet.getRange("A1").setFormula(formula);
  sheet.setFrozenRows(1);
}

function pcWriteTwoColumnKeyValue_(sheet, rows) {
  if (!rows || !rows.length) {
    pcResetSheetContents_(sheet);
    return;
  }

  pcEnsureColumnCount_(sheet, 2);
  pcEnsureRowCount_(sheet, rows.length);

  sheet.getRange(1, 1, sheet.getMaxRows(), 2).clearContent();
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);

  const headerRange = sheet.getRange(1, 1, 1, 2);
  pcApplyHeaderStyle_(headerRange);

  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 2, 220);
}

function pcWriteTable_(sheet, rows) {
  if (!rows || !rows.length) {
    pcResetSheetContents_(sheet);
    return;
  }

  const colCount = rows[0].length;
  const rowCount = rows.length;

  pcEnsureColumnCount_(sheet, colCount);
  pcEnsureRowCount_(sheet, rowCount);

  sheet.getRange(1, 1, sheet.getMaxRows(), colCount).clearContent();
  sheet.getRange(1, 1, rowCount, colCount).setValues(rows);

  const headerRange = sheet.getRange(1, 1, 1, colCount);
  pcApplyHeaderStyle_(headerRange);

  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, colCount, PRIMECARE_MULTI.DEFAULT_COLUMN_WIDTH);
}

function pcGetRowsAsObjects_(sheet, keyHeader) {
  const values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return [];

  const headers = values[0].map(h => String(h || "").trim());
  const output = [];

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const obj = {};
    let hasAnyValue = false;

    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c];
      if (row[c] !== "" && row[c] !== null) {
        hasAnyValue = true;
      }
    }

    if (!hasAnyValue) continue;

    if (keyHeader) {
      const keyVal = String(obj[keyHeader] || "").trim();
      if (!keyVal) continue;
    }

    output.push(obj);
  }

  return output;
}

function pcNum_(value) {
  if (value === null || value === "" || typeof value === "undefined") return 0;
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

function pcText_(value) {
  return String(value || "").trim();
}

function pcTodayKey_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function pcTimestamp_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
}

function pcSort2DDesc_(rows, valueIndex) {
  if (!rows || !rows.length) return [];
  return rows.slice().sort((a, b) => pcNum_(b[valueIndex]) - pcNum_(a[valueIndex]));
}

function pcSort2DAsc_(rows, valueIndex) {
  if (!rows || !rows.length) return [];
  return rows.slice().sort((a, b) => pcNum_(a[valueIndex]) - pcNum_(b[valueIndex]));
}

function pcTopN_(rows, n) {
  if (!rows || !rows.length) return [];
  return rows.slice(0, Math.max(0, n || 0));
}
/************************************************************
 * Backward-compatible wrappers for older PCAI naming
 ************************************************************/

function pcaiResetSheetContents_(sheet) {
  return pcResetSheetContents_(sheet);
}

function pcaiSheetExists_(name, ss) {
  const targetSs = ss || SpreadsheetApp.getActiveSpreadsheet();
  return pcSheetExists_(targetSs, name);
}

function pcaiGetSheetRequired_(name, ss) {
  const targetSs = ss || SpreadsheetApp.getActiveSpreadsheet();
  return pcGetSheetRequired_(targetSs, name);
}

function pcaiGetRowsAsObjects_(sheet, keyHeader) {
  return pcGetRowsAsObjects_(sheet, keyHeader);
}

function pcaiNum_(value) {
  return pcNum_(value);
}