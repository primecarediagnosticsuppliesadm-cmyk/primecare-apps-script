/************************************************************
 * 11_Form_Queue_Processor.gs
 * PrimeCare raw form queue processor
 ************************************************************/

function pcformProcessQueuedRows() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sh = pcformGetRequiredSheet_(PCFORM.RAW_SHEET);
    pcformEnsureRawResponseStatusColumns_(sh);

    const map = pcformGetHeaderIndexMap_(sh);
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return "No raw rows found.";

    const data = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();

    let processed = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < data.length; i++) {
      const rowNumber = i + 2;

      const status = map["Processing_Status"]
        ? String(data[i][map["Processing_Status"] - 1] || "").trim().toUpperCase()
        : "";

      const orderId = map["Order_ID"]
        ? String(data[i][map["Order_ID"] - 1] || "").trim()
        : "";

      const invoiceId = map["Invoice_ID"]
        ? String(data[i][map["Invoice_ID"] - 1] || "").trim()
        : "";

      if (status === "PROCESSED" || orderId || invoiceId) {
        skipped++;
        continue;
      }

      if (status && status !== "NEW" && status !== "ERROR" && status !== "PROCESSING") {
        skipped++;
        continue;
      }

      try {
        if (map["Processing_Status"]) {
          sh.getRange(rowNumber, map["Processing_Status"]).setValue("PROCESSING");
        }
        if (map["Processing_Message"]) {
          sh.getRange(rowNumber, map["Processing_Message"]).setValue("Queue processing");
        }
        if (map["Processed_At"]) {
          sh.getRange(rowNumber, map["Processed_At"]).setValue(new Date());
        }

        const fakeEvent = {
          range: sh.getRange(rowNumber, 1)
        };

        const payload = pcformParseFormSubmission_(fakeEvent);
        pcformValidateFormPayload_(payload);

        const ids = pcformGenerateOrderAndInvoiceIds_();
        const pricedLines = pcformBuildPricedOrderLines_(payload, ids);
        const orderSummary = pcformBuildOrderSummary_(payload, ids, pricedLines);

        pcformWriteOrderHeader_(orderSummary);
        pcformWriteOrderLines_(pricedLines);
        pcformWriteInvoiceRegister_(orderSummary);
        pcformWriteExportRows_(orderSummary, pricedLines);
        pcformMarkRawResponseProcessed_(payload, ids);

        processed++;
      } catch (err) {
        if (map["Processing_Status"]) {
          sh.getRange(rowNumber, map["Processing_Status"]).setValue("ERROR");
        }
        if (map["Processing_Message"]) {
          sh.getRange(rowNumber, map["Processing_Message"]).setValue(String(err && err.message ? err.message : err));
        }
        if (map["Processed_At"]) {
          sh.getRange(rowNumber, map["Processed_At"]).setValue(new Date());
        }
        failed++;
      }
    }

    return "Queue run complete. Processed: " + processed + ", Skipped: " + skipped + ", Failed: " + failed;
  } finally {
    lock.releaseLock();
  }
}

function pcformMarkAllUnprocessedRowsNew() {
  const sh = pcformGetRequiredSheet_(PCFORM.RAW_SHEET);
  pcformEnsureRawResponseStatusColumns_(sh);

  const map = pcformGetHeaderIndexMap_(sh);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return "No raw rows found.";

  const statusCol = map["Processing_Status"];
  const messageCol = map["Processing_Message"];

  if (!statusCol) throw new Error("Processing_Status column missing.");

  let updated = 0;

  for (let row = 2; row <= lastRow; row++) {
    const status = String(sh.getRange(row, statusCol).getValue() || "").trim().toUpperCase();

    if (!status || status === "ERROR") {
      sh.getRange(row, statusCol).setValue("NEW");
      if (messageCol) sh.getRange(row, messageCol).setValue("Queued for processing");
      updated++;
    }
  }

  return "Marked " + updated + " rows as NEW.";
}

function pcformRequeueErrorRows() {
  const sh = pcformGetRequiredSheet_(PCFORM.RAW_SHEET);
  pcformEnsureRawResponseStatusColumns_(sh);

  const map = pcformGetHeaderIndexMap_(sh);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return "No raw rows found.";

  const statusCol = map["Processing_Status"];
  const messageCol = map["Processing_Message"];
  const orderIdCol = map["Order_ID"];
  const invoiceIdCol = map["Invoice_ID"];

  let updated = 0;

  for (let row = 2; row <= lastRow; row++) {
    const status = String(sh.getRange(row, statusCol).getValue() || "").trim().toUpperCase();

    if (status === "ERROR") {
      sh.getRange(row, statusCol).setValue("NEW");
      if (messageCol) sh.getRange(row, messageCol).setValue("Requeued from ERROR");
      if (orderIdCol) sh.getRange(row, orderIdCol).clearContent();
      if (invoiceIdCol) sh.getRange(row, invoiceIdCol).clearContent();
      updated++;
    }
  }

  return "Requeued " + updated + " error rows.";
}

/************************************************************
 * Menu wrappers
 ************************************************************/

function runProcessFormQueue() {
  const msg = pcformProcessQueuedRows();
  SpreadsheetApp.getUi().alert(msg);
  return msg;
}

function runMarkUnprocessedRowsNew() {
  const msg = pcformMarkAllUnprocessedRowsNew();
  SpreadsheetApp.getUi().alert(msg);
  return msg;
}

function runRequeueErrorRows() {
  const msg = pcformRequeueErrorRows();
  SpreadsheetApp.getUi().alert(msg);
  return msg;
}