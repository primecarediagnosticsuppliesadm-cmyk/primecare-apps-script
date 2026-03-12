/************************************************************
 * 02_OpenAI_And_Core_Utils.gs
 ************************************************************/

function pcaiSetOpenAIKey() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt("Set OpenAI API Key", "Paste your OpenAI API key:", ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const key = String(resp.getResponseText() || "").trim();
  if (!key.startsWith("sk-")) {
    ui.alert("Invalid API key format.");
    return;
  }

  PropertiesService.getScriptProperties().setProperty("OPENAI_API_KEY", key);
  ui.alert("API key saved.");
}

function pcaiGetApiKey_() {
  const key = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!key) throw new Error("API key not set. Use PrimeCare AI → Set / Update API Key.");
  return key;
}

function pcaiCallOpenAI_(systemMsg, userMsg) {
  const apiKey = pcaiGetApiKey_();

  const payload = {
    model: PCAI_CONFIG.MODEL,
    temperature: 0.2,
    messages: [
      { role: "system", content: systemMsg },
      { role: "user", content: userMsg }
    ]
  };

  const res = UrlFetchApp.fetch(PCAI_CONFIG.API_URL, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const text = res.getContentText();

  if (code >= 300) {
    throw new Error("OpenAI API error (" + code + "): " + text);
  }

  const json = JSON.parse(text);
  return (((json || {}).choices || [])[0] || {}).message
    ? String(json.choices[0].message.content || "").trim()
    : "(No response)";
}

function pcaiGetSS_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function pcaiGetOrCreateSheet_(name) {
  const ss = pcaiGetSS_();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function pcaiDeleteAndRecreateSheet_(name) {
  const ss = pcaiGetSS_();
  const existing = ss.getSheetByName(name);
  if (existing) ss.deleteSheet(existing);
  return ss.insertSheet(name);
}

function pcaiSheetExists_(name) {
  return !!pcaiGetSS_().getSheetByName(name);
}

function pcaiGetSheetRequired_(name) {
  const sh = pcaiGetSS_().getSheetByName(name);
  if (!sh) throw new Error("Missing sheet: " + name);
  return sh;
}

function pcaiNormalizeCell_(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  }
  if (typeof v === "number" || typeof v === "boolean") return v;
  return String(v).trim();
}

function pcaiNum_(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function pcaiUnique_(arr) {
  return [...new Set(arr)];
}

function pcaiContainsAny_(text, keywords) {
  return keywords.some(k => text.indexOf(k) !== -1);
}

function pcaiGetHeaderMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h, i) => {
    const key = String(h || "").trim();
    if (key) map[key] = i + 1;
  });
  return map;
}

function pcaiGetRowsAsObjects_(sheet, primaryKeyHeader) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => String(h || "").trim());
  const pkIndex = primaryKeyHeader ? headers.indexOf(primaryKeyHeader) : -1;
  const rows = [];

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (pkIndex >= 0) {
      const pk = row[pkIndex];
      if (pk === "" || pk === null || pk === undefined) continue;
    }

    const obj = {};
    let hasValue = false;

    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c];
      if (row[c] !== "" && row[c] !== null && row[c] !== undefined) hasValue = true;
    }

    if (hasValue) rows.push(obj);
  }
  return rows;
}

function pcaiGetRowsWithNumbers_(sheet, primaryKeyHeader) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => String(h || "").trim());
  const pkIndex = primaryKeyHeader ? headers.indexOf(primaryKeyHeader) : -1;
  const rows = [];

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (pkIndex >= 0) {
      const pk = row[pkIndex];
      if (pk === "" || pk === null || pk === undefined) continue;
    }

    const obj = { __rowNum: r + 1 };
    let hasValue = false;

    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c];
      if (row[c] !== "" && row[c] !== null && row[c] !== undefined) hasValue = true;
    }

    if (hasValue) rows.push(obj);
  }
  return rows;
}

function pcaiCompareValues_(actual, expected) {
  return String(actual).trim() === String(expected).trim();
}

function pcaiAlertPriority_(p) {
  const map = { CRITICAL: 1, HIGH: 2, MEDIUM: 3, INFO: 4 };
  return map[p] || 99;
}

function pcaiLogAction_(action, details) {
  const sh = pcaiGetOrCreateSheet_(PCAI_SHEETS.ACTION_LOG);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, 3).setValues([["Timestamp", "Action", "Details"]]);
  }
  sh.appendRow([new Date(), action, details]);
}

function pcaiSanitizeOrderStatuses_(rowObj) {
  if (rowObj.Invoice_Status && !PCAI_ENUMS.INVOICE_STATUS.includes(rowObj.Invoice_Status)) {
    rowObj.Invoice_Status = "Draft";
  }
  if (rowObj.Payment_Status && !PCAI_ENUMS.PAYMENT_STATUS.includes(rowObj.Payment_Status)) {
    rowObj.Payment_Status = "Pending";
  }
  if (rowObj.Order_Status && !PCAI_ENUMS.ORDER_STATUS.includes(rowObj.Order_Status)) {
    rowObj.Order_Status = "Pending";
  }
  return rowObj;
}

function pcaiAppendMappedRow_(sheet, inputObj) {
  inputObj = pcaiSanitizeOrderStatuses_(inputObj);
  const map = pcaiGetHeaderMap_(sheet);
  const row = new Array(sheet.getLastColumn()).fill("");

  Object.keys(inputObj).forEach(key => {
    if (map[key]) row[map[key] - 1] = inputObj[key];
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}

function pcaiUpsertRowByKey_(sheet, keyField, keyValue, inputObj) {
  const map = pcaiGetHeaderMap_(sheet);
  if (!map[keyField]) throw new Error("Missing key field " + keyField + " in " + sheet.getName());

  const keyCol = map[keyField];
  const lastRow = sheet.getLastRow();
  let foundRow = null;

  if (lastRow >= 2) {
    const values = sheet.getRange(2, keyCol, lastRow - 1, 1).getValues().flat();
    for (let i = 0; i < values.length; i++) {
      if (String(values[i]).trim() === String(keyValue).trim()) {
        foundRow = i + 2;
        break;
      }
    }
  }

  if (!foundRow) foundRow = lastRow + 1;

  const row = new Array(sheet.getLastColumn()).fill("");
  Object.keys(map).forEach(header => {
    if (inputObj[header] !== undefined) row[map[header] - 1] = inputObj[header];
  });

  sheet.getRange(foundRow, 1, 1, row.length).setValues([row]);
  return foundRow;
}