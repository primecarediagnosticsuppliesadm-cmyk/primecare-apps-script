/************************************************************
 * 11_AI_Summary_Builders.gs
 ************************************************************/

function pcaiBuildCollectionsRiskSummary() {
 const sh = pcaiGetOrCreateSheet_(PCAI_SHEETS.COLLECTIONS_RISK);
pcaiResetSheetContents_(sh);

  sh.getRange("A1")
    .setValue("AI Collections Risk")
    .setFontWeight("bold")
    .setFontSize(16);

  sh.getRange("A3:F3").setValues([[
    "Lab_ID",
    "Outstanding",
    "Credit_Limit",
    "Days_Overdue",
    "Credit_Hold",
    "Risk_Score"
  ]]);

  if (!pcaiSheetExists_(PCAI_SHEETS.AR)) {
    sh.getRange("A4").setValue("AR_Credit_Control sheet not found");
    return;
  }

  const rows = pcaiGetRowsAsObjects_(pcaiGetSheetRequired_(PCAI_SHEETS.AR), "Lab_ID");
  const output = [];

  rows.forEach(r => {
    const labId = String(r.Lab_ID || "").trim();
    if (!labId) return;

    const outstanding = pcaiNum_(r.Outstanding);
    const limit = pcaiNum_(r.Credit_Limit);
    const overdue = pcaiNum_(r.Days_Overdue);
    const hold = String(r.Credit_Hold || "").trim().toUpperCase();

    let score = 0;

    if (limit > 0) {
      const util = outstanding / limit;
      if (util >= 1) score += 5;
      else if (util >= 0.8) score += 3;
      else if (util >= 0.6) score += 1;
    }

    if (overdue > 30) score += 5;
    else if (overdue > 15) score += 3;
    else if (overdue > 7) score += 1;

    if (hold === "HOLD") score += 3;

    if (score > 0) {
      output.push([labId, outstanding, limit, overdue, hold, score]);
    }
  });

  output.sort((a, b) => b[5] - a[5]);

  if (output.length) {
    sh.getRange(4, 1, output.length, 6).setValues(output);
  } else {
    sh.getRange("A4").setValue("No collections risks found");
  }

  sh.setFrozenRows(3);
  sh.autoResizeColumns(1, 6);
}