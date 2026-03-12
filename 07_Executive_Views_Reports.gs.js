/************************************************************
 * 07_Executive_Views_Reports.gs
 ************************************************************/

function pcaiUpdateExecutiveCommandDashboard() {
  const dash = pcaiDeleteAndRecreateSheet_(PCAI_SHEETS.EXEC_DASHBOARD);
  const status = pcaiSheetExists_(PCAI_SHEETS.SYSTEM_STATUS) ? pcaiGetSheetRequired_(PCAI_SHEETS.SYSTEM_STATUS) : null;
  const ops = pcaiSheetExists_(PCAI_SHEETS.OPERATIONS_DASHBOARD) ? pcaiGetSheetRequired_(PCAI_SHEETS.OPERATIONS_DASHBOARD) : null;
  const alerts = pcaiSheetExists_(PCAI_SHEETS.ALERTS) ? pcaiGetSheetRequired_(PCAI_SHEETS.ALERTS) : null;
  const recs = pcaiSheetExists_(PCAI_SHEETS.RECOMMENDATIONS) ? pcaiGetSheetRequired_(PCAI_SHEETS.RECOMMENDATIONS) : null;
  const risks = pcaiSheetExists_(PCAI_SHEETS.RISK_PREDICTIONS) ? pcaiGetSheetRequired_(PCAI_SHEETS.RISK_PREDICTIONS) : null;

  dash.getRange("A1").setValue("PrimeCare Executive Command Dashboard").setFontWeight("bold").setFontSize(18);
  dash.getRange("A4").setValue("System Status").setFontWeight("bold");
  dash.getRange("A5:B10").setValues([
    ["System Health", status ? status.getRange("B3").getValue() : ""],
    ["Critical Risks", status ? status.getRange("B4").getValue() : ""],
    ["Data Quality Issues", status ? status.getRange("B5").getValue() : ""],
    ["Scenario Tests", status ? status.getRange("B6").getValue() : ""],
    ["Last Health Scan", status ? status.getRange("B7").getValue() : ""],
    ["Last Remediation", status ? status.getRange("B8").getValue() : ""]
  ]);

  dash.getRange("D4").setValue("Operations Snapshot").setFontWeight("bold");
  dash.getRange("D5:E10").setValues([
    ["Total Revenue", ops ? ops.getRange("B3").getValue() : ""],
    ["Total Orders", ops ? ops.getRange("B4").getValue() : ""],
    ["Unpaid Orders", ops ? ops.getRange("B5").getValue() : ""],
    ["Labs On Hold", ops ? ops.getRange("B6").getValue() : ""],
    ["Items On Reorder", ops ? ops.getRange("B7").getValue() : ""],
    ["Top Revenue Lab", ops ? ops.getRange("B8").getValue() : ""]
  ]);

  dash.getRange("A13").setValue("Top Alerts").setFontWeight("bold");
  pcaiWriteTopRowsToDashboard_(alerts, dash, 14, 1, 5, 6);

  dash.getRange("H13").setValue("Top Recommendations").setFontWeight("bold");
  pcaiWriteTopRowsToDashboard_(recs, dash, 14, 8, 5, 5);

  dash.getRange("A22").setValue("Top Credit Risks").setFontWeight("bold");
  pcaiWriteRiskBlock_(risks, dash, 23, 1, "A4:F9");

  dash.getRange("H22").setValue("Top Stock Risks").setFontWeight("bold");
  pcaiWriteRiskBlock_(risks, dash, 23, 8, "H4:P9");
   pcaiWriteTop5IssuesCard_(dash, 32, 1);
   pcaiWriteTop5ActionsCard_(dash, 40, 1);

  dash.autoResizeColumns(1, 16);
 
}

function pcaiWriteTopRowsToDashboard_(sourceSheet, targetSheet, targetRow, targetCol, maxRows, maxCols) {
  if (!sourceSheet) return;
  const values = sourceSheet.getDataRange().getValues();
  if (values.length < 4) return;

  const headers = values[2];
  const rows = values.slice(3).filter(r => r.some(v => String(v || "").trim() !== ""));
  if (!rows.length) return;

  const output = [headers.slice(0, maxCols)];
  for (let i = 0; i < Math.min(maxRows, rows.length); i++) {
    output.push(rows[i].slice(0, maxCols));
  }
  targetSheet.getRange(targetRow, targetCol, output.length, output[0].length).setValues(output);
}

function pcaiWriteRiskBlock_(riskSheet, targetSheet, targetRow, targetCol, sourceRangeA1) {
  if (!riskSheet) return;
  const values = riskSheet.getRange(sourceRangeA1).getValues();
  const cleaned = values.filter(r => r.some(v => String(v || "").trim() !== ""));
  if (!cleaned.length) return;
  targetSheet.getRange(targetRow, targetCol, cleaned.length, cleaned[0].length).setValues(cleaned);
}

function pcaiExportDailySummary() {
  const sh = pcaiDeleteAndRecreateSheet_(PCAI_SHEETS.DAILY_SUMMARY);
  const status = pcaiSheetExists_(PCAI_SHEETS.SYSTEM_STATUS) ? pcaiGetSheetRequired_(PCAI_SHEETS.SYSTEM_STATUS) : null;
  const ops = pcaiSheetExists_(PCAI_SHEETS.OPERATIONS_DASHBOARD) ? pcaiGetSheetRequired_(PCAI_SHEETS.OPERATIONS_DASHBOARD) : null;
  const alerts = pcaiSheetExists_(PCAI_SHEETS.ALERTS) ? pcaiGetSheetRequired_(PCAI_SHEETS.ALERTS) : null;
  const recs = pcaiSheetExists_(PCAI_SHEETS.RECOMMENDATIONS) ? pcaiGetSheetRequired_(PCAI_SHEETS.RECOMMENDATIONS) : null;

  sh.getRange("A1").setValue("PrimeCare Daily Summary").setFontWeight("bold").setFontSize(16);
  sh.getRange("A2").setValue("Generated: " + new Date());

  sh.getRange("A4").setValue("System Status").setFontWeight("bold");
  sh.getRange("A5:B10").setValues([
    ["System Health", status ? status.getRange("B3").getValue() : ""],
    ["Critical Risks", status ? status.getRange("B4").getValue() : ""],
    ["Data Quality Issues", status ? status.getRange("B5").getValue() : ""],
    ["Scenario Tests", status ? status.getRange("B6").getValue() : ""],
    ["Last Health Scan", status ? status.getRange("B7").getValue() : ""],
    ["Last Remediation", status ? status.getRange("B8").getValue() : ""]
  ]);

  sh.getRange("D4").setValue("Operations").setFontWeight("bold");
  sh.getRange("D5:E10").setValues([
    ["Total Revenue", ops ? ops.getRange("B3").getValue() : ""],
    ["Total Orders", ops ? ops.getRange("B4").getValue() : ""],
    ["Unpaid Orders", ops ? ops.getRange("B5").getValue() : ""],
    ["Labs On Credit Hold", ops ? ops.getRange("B6").getValue() : ""],
    ["Items On Reorder", ops ? ops.getRange("B7").getValue() : ""],
    ["Top Revenue Lab", ops ? ops.getRange("B8").getValue() : ""]
  ]);

  if (recs) {
    const vals = recs.getDataRange().getValues();
    const rows = vals.slice(3).filter(r => String(r[0] || "").trim() !== "").slice(0, 5);
    sh.getRange("A13").setValue("Top 5 Recommendations").setFontWeight("bold");
    if (rows.length) {
      sh.getRange(14, 1, 1, 5).setValues([["Category", "Priority", "Object_Name", "Recommendation", "Reason"]]);
      sh.getRange(15, 1, rows.length, 5).setValues(rows);
    }
  }

  if (alerts) {
    const vals = alerts.getDataRange().getValues();
    const rows = vals.slice(3).filter(r => String(r[0] || "").trim() !== "").slice(0, 5);
    sh.getRange("H13").setValue("Top Alerts").setFontWeight("bold");
    if (rows.length) {
      sh.getRange(14, 8, 1, 6).setValues([["Timestamp", "Alert_Type", "Object_Name", "Severity", "Status", "Notes"]]);
      sh.getRange(15, 8, rows.length, 6).setValues(rows);
    }
  }

  sh.autoResizeColumns(1, 14);
}

function pcaiGenerateWeeklyBusinessReview() {
  const sh = pcaiDeleteAndRecreateSheet_(PCAI_SHEETS.WEEKLY_REVIEW);
  const status = pcaiSheetExists_(PCAI_SHEETS.SYSTEM_STATUS) ? pcaiGetSheetRequired_(PCAI_SHEETS.SYSTEM_STATUS) : null;
  const ops = pcaiSheetExists_(PCAI_SHEETS.OPERATIONS_DASHBOARD) ? pcaiGetSheetRequired_(PCAI_SHEETS.OPERATIONS_DASHBOARD) : null;
  const alerts = pcaiSheetExists_(PCAI_SHEETS.ALERTS) ? pcaiGetSheetRequired_(PCAI_SHEETS.ALERTS) : null;
  const recs = pcaiSheetExists_(PCAI_SHEETS.RECOMMENDATIONS) ? pcaiGetSheetRequired_(PCAI_SHEETS.RECOMMENDATIONS) : null;
  const risks = pcaiSheetExists_(PCAI_SHEETS.RISK_PREDICTIONS) ? pcaiGetSheetRequired_(PCAI_SHEETS.RISK_PREDICTIONS) : null;

  sh.getRange("A1").setValue("PrimeCare Weekly Business Review").setFontWeight("bold").setFontSize(18);
  sh.getRange("A2").setValue("Generated: " + new Date());

  sh.getRange("A4").setValue("Executive Summary").setFontWeight("bold");
  sh.getRange("A5:B10").setValues([
    ["System Health", status ? status.getRange("B3").getValue() : ""],
    ["Critical Risks", status ? status.getRange("B4").getValue() : ""],
    ["Data Quality Issues", status ? status.getRange("B5").getValue() : ""],
    ["Scenario Tests", status ? status.getRange("B6").getValue() : ""],
    ["Total Revenue", ops ? ops.getRange("B3").getValue() : ""],
    ["Total Orders", ops ? ops.getRange("B4").getValue() : ""]
  ]);

  sh.getRange("D4").setValue("Operations Snapshot").setFontWeight("bold");
  sh.getRange("D5:E10").setValues([
    ["Unpaid Orders", ops ? ops.getRange("B5").getValue() : ""],
    ["Labs On Hold", ops ? ops.getRange("B6").getValue() : ""],
    ["Items On Reorder", ops ? ops.getRange("B7").getValue() : ""],
    ["Top Revenue Lab", ops ? ops.getRange("B8").getValue() : ""],
    ["Top Credit Risk Lab", risks ? risks.getRange("A5").getValue() : ""],
    ["Top Stock Risk SKU", risks ? risks.getRange("H5").getValue() : ""]
  ]);

  if (alerts) {
    const vals = alerts.getDataRange().getValues();
    const rows = vals.slice(3).filter(r => String(r[0] || "").trim() !== "").slice(0, 5);
    sh.getRange("A13").setValue("Top Alerts").setFontWeight("bold");
    if (rows.length) {
      sh.getRange(14, 1, 1, 6).setValues([["Timestamp", "Alert_Type", "Object_Name", "Severity", "Status", "Notes"]]);
      sh.getRange(15, 1, rows.length, 6).setValues(rows);
    }
  }

  if (recs) {
    const vals = recs.getDataRange().getValues();
    const rows = vals.slice(3).filter(r => String(r[0] || "").trim() !== "").slice(0, 5);
    sh.getRange("H13").setValue("Top Recommendations").setFontWeight("bold");
    if (rows.length) {
      sh.getRange(14, 8, 1, 5).setValues([["Category", "Priority", "Object_Name", "Recommendation", "Reason"]]);
      sh.getRange(15, 8, rows.length, 5).setValues(rows);
    }
  }

  sh.autoResizeColumns(1, 13);
}

function pcaiGetTodaysOwnerBriefing() {
  const lines = ["PrimeCare Owner Briefing", ""];

  if (pcaiSheetExists_(PCAI_SHEETS.SYSTEM_STATUS)) {
    const sh = pcaiGetSheetRequired_(PCAI_SHEETS.SYSTEM_STATUS);
    lines.push("System Health: " + sh.getRange("B3").getValue());
    lines.push("Critical Risks: " + sh.getRange("B4").getValue());
    lines.push("Data Quality Issues: " + sh.getRange("B5").getValue());
    lines.push("Scenario Tests: " + sh.getRange("B6").getValue());
    lines.push("");
  }

  if (pcaiSheetExists_(PCAI_SHEETS.OPERATIONS_DASHBOARD)) {
    const sh = pcaiGetSheetRequired_(PCAI_SHEETS.OPERATIONS_DASHBOARD);
    lines.push("Revenue: " + sh.getRange("B3").getValue());
    lines.push("Orders: " + sh.getRange("B4").getValue());
    lines.push("Unpaid Orders: " + sh.getRange("B5").getValue());
    lines.push("Labs On Hold: " + sh.getRange("B6").getValue());
    lines.push("Items On Reorder: " + sh.getRange("B7").getValue());
    lines.push("Top Revenue Lab: " + sh.getRange("B8").getValue());
    lines.push("");
  }

  if (pcaiSheetExists_(PCAI_SHEETS.ALERTS)) {
    const vals = pcaiGetSheetRequired_(PCAI_SHEETS.ALERTS).getDataRange().getValues();
    const rows = vals.slice(3).filter(r => String(r[0] || "").trim() !== "").slice(0, 3);
    if (rows.length) {
      lines.push("Top Alerts:");
      rows.forEach((r, i) => lines.push((i + 1) + ". " + r[1] + " | " + r[2] + " | " + r[3] + " | " + r[5]));
      lines.push("");
    }
  }

  if (pcaiSheetExists_(PCAI_SHEETS.RECOMMENDATIONS)) {
    const vals = pcaiGetSheetRequired_(PCAI_SHEETS.RECOMMENDATIONS).getDataRange().getValues();
    const rows = vals.slice(3).filter(r => String(r[0] || "").trim() !== "").slice(0, 3);
    if (rows.length) {
      lines.push("Top Recommended Actions:");
      rows.forEach((r, i) => lines.push((i + 1) + ". " + r[3] + " | Reason: " + r[4]));
    }
  }

  return lines.join("\n");
}

function pcaiGetTop3IssuesRightNow() {
  const issues = [];

  if (pcaiSheetExists_(PCAI_SHEETS.ALERTS)) {
    const vals = pcaiGetSheetRequired_(PCAI_SHEETS.ALERTS).getDataRange().getValues();
    vals.slice(3).filter(r => String(r[0] || "").trim() !== "").forEach(r => {
      issues.push({ priority: pcaiAlertPriority_(String(r[3] || "").trim()), text: r[1] + " | " + r[2] + " | " + r[5] });
    });
  }

  if (pcaiSheetExists_(PCAI_SHEETS.RECOMMENDATIONS)) {
    const vals = pcaiGetSheetRequired_(PCAI_SHEETS.RECOMMENDATIONS).getDataRange().getValues();
    vals.slice(3).filter(r => String(r[0] || "").trim() !== "").forEach(r => {
      issues.push({ priority: pcaiAlertPriority_(String(r[1] || "").trim()), text: r[0] + " | " + r[2] + " | " + r[3] });
    });
  }

  issues.sort((a, b) => a.priority - b.priority);
  if (!issues.length) return "Top 3 issues right now:\n\nNo major issues detected.";

  let out = "Top 3 issues right now:\n\n";
  issues.slice(0, 3).forEach((x, i) => out += (i + 1) + ". " + x.text + "\n");
  return out;
}

function pcaiGetWhatShouldIChaseBeforeNoon() {
  if (!pcaiSheetExists_(PCAI_SHEETS.RECOMMENDATIONS)) return "Update AI Recommendations first.";

  const vals = pcaiGetSheetRequired_(PCAI_SHEETS.RECOMMENDATIONS).getDataRange().getValues();
  const rows = vals.slice(3).filter(r => String(r[0] || "").trim() !== "");
  if (!rows.length) return "Nothing urgent to chase before noon.";

  const criticalOrHigh = rows.filter(r => ["CRITICAL", "HIGH"].includes(String(r[1] || "").trim()));
  const pick = criticalOrHigh.length ? criticalOrHigh.slice(0, 3) : rows.slice(0, 3);

  let out = "What you should chase before noon:\n\n";
  pick.forEach((r, i) => out += (i + 1) + ". " + r[3] + " | Object: " + r[2] + " | Reason: " + r[4] + "\n");
  return out;
}

function pcaiGetWhatIsBlockingScaleToday() {
  const blockers = [];

  if (pcaiSheetExists_(PCAI_SHEETS.OPERATIONS_DASHBOARD)) {
    const sh = pcaiGetSheetRequired_(PCAI_SHEETS.OPERATIONS_DASHBOARD);
    const holds = Number(sh.getRange("B6").getValue() || 0);
    const reorder = Number(sh.getRange("B7").getValue() || 0);
    const unpaid = Number(sh.getRange("B5").getValue() || 0);

    if (holds > 0) blockers.push("Labs on credit hold: " + holds);
    if (reorder > 0) blockers.push("Items needing reorder: " + reorder);
    if (unpaid > 0) blockers.push("Unpaid orders: " + unpaid);
  }

  if (pcaiSheetExists_(PCAI_SHEETS.ALERTS)) {
    const vals = pcaiGetSheetRequired_(PCAI_SHEETS.ALERTS).getDataRange().getValues();
    const critical = vals.slice(3).filter(r => String(r[3] || "").trim() === "CRITICAL").length;
    if (critical > 0) blockers.push("Critical alerts open: " + critical);
  }

  if (pcaiSheetExists_(PCAI_SHEETS.RISK_PREDICTIONS)) {
    const sh = pcaiGetSheetRequired_(PCAI_SHEETS.RISK_PREDICTIONS);
    const creditLab = sh.getRange("A5").getValue();
    const stockSku = sh.getRange("H5").getValue();
    if (creditLab) blockers.push("Top credit risk lab: " + creditLab);
    if (stockSku) blockers.push("Top stock risk SKU: " + stockSku);
  }

  if (!blockers.length) return "What is blocking scale today:\n\nNo major blocker detected right now.";
  let out = "What is blocking scale today:\n\n";
  blockers.forEach((b, i) => out += (i + 1) + ". " + b + "\n");
  return out;
}

function pcaiGetTopLabsToFollowUpToday() {
  if (!pcaiSheetExists_(PCAI_SHEETS.AR)) throw new Error("AR_Credit_Control sheet not found.");
  const rows = pcaiGetRowsAsObjects_(pcaiGetSheetRequired_(PCAI_SHEETS.AR), "Lab_ID");

  const ranked = rows.map(r => {
    const outstanding = pcaiNum_(r.Outstanding);
    const limit = pcaiNum_(r.Credit_Limit);
    const overdue = pcaiNum_(r.Days_Overdue);
    const hold = String(r.Credit_Hold || "").trim();
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

    return {
      Lab_ID: r.Lab_ID,
      Outstanding: outstanding,
      Credit_Limit: limit,
      Days_Overdue: overdue,
      Credit_Hold: hold,
      Score: score
    };
  }).filter(r => r.Score > 0).sort((a, b) => b.Score - a.Score).slice(0, 5);

  if (!ranked.length) return "No labs need urgent follow-up today.";

  let out = "Top 5 labs to follow up today:\n\n";
  ranked.forEach((r, i) => {
    out += (i + 1) + ". " + r.Lab_ID + " | Outstanding: " + r.Outstanding + " | Limit: " + r.Credit_Limit + " | Overdue: " + r.Days_Overdue + " | Hold: " + r.Credit_Hold + " | Score: " + r.Score + "\n";
  });
  return out;
}

function pcaiGetTopReorderProducts() {
  if (!pcaiSheetExists_(PCAI_SHEETS.INVENTORY)) throw new Error("Inventory sheet not found.");
  const rows = pcaiGetRowsAsObjects_(pcaiGetSheetRequired_(PCAI_SHEETS.INVENTORY), "Product_ID");

  const ranked = rows.map(r => {
    const stock = pcaiNum_(r.Current_Stock);
    const min = pcaiNum_(r.Min_Stock);
    const reorderQty = pcaiNum_(r.Reorder_Qty);
    const reorder = String(r.Reorder_Status || "").trim();
    const avg = pcaiNum_(r.Avg_Daily_Sales_30D);
    const lead = pcaiNum_(r.Lead_Time_Days);

    let score = 0;
    if (stock <= 0) score += 5;
    else if (stock < min) score += 4;
    if (reorder === "REORDER") score += 2;
    if (avg > 0 && lead > 0 && stock / avg < lead) score += 3;

    return {
      Product_ID: r.Product_ID,
      Current_Stock: stock,
      Min_Stock: min,
      Reorder_Qty: reorderQty,
      Reorder_Status: reorder,
      Score: score
    };
  }).filter(r => r.Score > 0).sort((a, b) => b.Score - a.Score).slice(0, 5);

  if (!ranked.length) return "No products need urgent reorder right now.";

  let out = "Top 5 reorder products:\n\n";
  ranked.forEach((r, i) => {
    out += (i + 1) + ". " + r.Product_ID + " | Stock: " + r.Current_Stock + " | Min: " + r.Min_Stock + " | Reorder Qty: " + r.Reorder_Qty + " | Status: " + r.Reorder_Status + " | Score: " + r.Score + "\n";
  });
  return out;
}

function pcaiGetBiggestRiskToday() {
  if (pcaiSheetExists_(PCAI_SHEETS.ALERTS)) {
    const vals = pcaiGetSheetRequired_(PCAI_SHEETS.ALERTS).getDataRange().getValues();
    const rows = vals.slice(3).filter(r => String(r[0] || "").trim() !== "");
    const critical = rows.find(r => String(r[3] || "").trim() === "CRITICAL");
    if (critical) return "Biggest risk today: " + critical[1] + " on " + critical[2] + " — " + critical[5];
  }

  if (pcaiSheetExists_(PCAI_SHEETS.RECOMMENDATIONS)) {
    const vals = pcaiGetSheetRequired_(PCAI_SHEETS.RECOMMENDATIONS).getDataRange().getValues();
    const rows = vals.slice(3).filter(r => String(r[0] || "").trim() !== "");
    if (rows.length) return "Biggest risk today: " + rows[0][0] + " | " + rows[0][2] + " — " + rows[0][3];
  }

  return "No major risk detected today.";
}

function pcaiGetWhatShouldIDoFirstToday() {
  if (!pcaiSheetExists_(PCAI_SHEETS.RECOMMENDATIONS)) return "Update AI Recommendations first.";
  const vals = pcaiGetSheetRequired_(PCAI_SHEETS.RECOMMENDATIONS).getDataRange().getValues();
  const rows = vals.slice(3).filter(r => String(r[0] || "").trim() !== "");
  if (!rows.length) return "No action needed right now.";
  return "Do this first today: " + rows[0][3] + " | Reason: " + rows[0][4];
}

function pcaiGetOwnerAssistantView() {
  return pcaiGetTodaysOwnerBriefing() + "\n\n" + pcaiGetWhatIsBlockingScaleToday();
}

function pcaiGetOperationsAssistantView() {
  let out = "Operations Assistant View\n\n";
  if (pcaiSheetExists_(PCAI_SHEETS.OPERATIONS_DASHBOARD)) {
    const sh = pcaiGetSheetRequired_(PCAI_SHEETS.OPERATIONS_DASHBOARD);
    out += "Total Orders: " + sh.getRange("B4").getValue() + "\n";
    out += "Unpaid Orders: " + sh.getRange("B5").getValue() + "\n";
    out += "Items On Reorder: " + sh.getRange("B7").getValue() + "\n\n";
  }

  if (pcaiSheetExists_(PCAI_SHEETS.ALERTS)) {
    const vals = pcaiGetSheetRequired_(PCAI_SHEETS.ALERTS).getDataRange().getValues();
    const rows = vals.slice(3).filter(r => String(r[0] || "").trim() !== "").slice(0, 5);
    if (rows.length) {
      out += "Top operational alerts:\n";
      rows.forEach((r, i) => out += (i + 1) + ". " + r[1] + " | " + r[2] + " | " + r[5] + "\n");
    }
  }
  return out;
}

function pcaiGetCollectionsAssistantView() {
  return pcaiGetTopLabsToFollowUpToday();
}

function pcaiGetInventoryAssistantView() {
  return pcaiGetTopReorderProducts();
}

function pcaiRunDailyMonitoringLoop() {
  pcaiRunSystemHealthEngine();
  pcaiRunSystemRemediation();
  pcaiUpdateSystemStatusDashboard();
  pcaiUpdateOperationsDashboard();
  pcaiUpdateRiskPredictionEngine();
  pcaiUpdateAlertsEngine();
  pcaiUpdateAIRecommendations();
  pcaiUpdateExecutiveCommandDashboard();
  pcaiUpdateForecastingLayer();
  pcaiUpdateGrowthEngine();
  pcaiExportDailySummary();

  pcaiLogAction_("DAILY_MONITORING_LOOP", "Daily monitoring completed");
}

function pcaiGetTopHealthIssues_(maxItems) {
  const sh = pcaiGetSS_().getSheetByName(PCAI_SHEETS.SYSTEM_HEALTH);
  if (!sh || sh.getLastRow() < 2) return [];

  const values = sh.getDataRange().getValues();
  const headers = values[0].map(h => String(h || "").trim());
  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  const severityRank = {
    "CRITICAL": 1,
    "HIGH": 2,
    "MEDIUM": 3,
    "INFO": 4
  };

  return values.slice(1)
    .filter(row => String(row[idx["Result"]] || "").trim() === "FAIL")
    .map(row => ({
      category: String(row[idx["Category"]] || "").trim(),
      checkName: String(row[idx["Check_Name"]] || "").trim(),
      objectName: String(row[idx["Object_Name"]] || "").trim(),
      severity: String(row[idx["Severity"]] || "").trim().toUpperCase(),
      notes: String(row[idx["Notes"]] || "").trim()
    }))
    .sort((a, b) => {
      const sa = severityRank[a.severity] || 999;
      const sb = severityRank[b.severity] || 999;
      if (sa !== sb) return sa - sb;
      return a.checkName.localeCompare(b.checkName);
    })
    .slice(0, maxItems || 5);
}

function pcaiWriteTop5IssuesCard_(dash, startRow, startCol) {
  const issues = pcaiGetTopHealthIssues_(5);

  dash.getRange(startRow, startCol).setValue("Top 5 Issues").setFontWeight("bold");

  const output = [["Severity", "Issue", "Object", "Notes"]];

  if (!issues.length) {
    output.push(["INFO", "No current failures", "-", "System health checks passed"]);
  } else {
    issues.forEach(i => {
      output.push([
        i.severity,
        i.checkName,
        i.objectName,
        i.notes
      ]);
    });
  }
    if (output.length > 1) {
    pcaiColorSeverityColumn_(dash, startRow + 2, startCol, output.length - 1);
  }

  dash.getRange(startRow + 1, startCol, output.length, output[0].length).setValues(output);
  dash.getRange(startRow + 1, startCol, 1, output[0].length)
    .setFontWeight("bold")
    .setBackground("#d9eaf7");
}

function pcaiColorSeverityColumn_(sheet, startRow, startCol, numRows) {
  const range = sheet.getRange(startRow, startCol, numRows, 1);
  const values = range.getValues();

  for (let i = 0; i < values.length; i++) {
    const severity = String(values[i][0] || "").trim().toUpperCase();
    let bg = "#ffffff";

    if (severity === "CRITICAL") bg = "#fecaca";
    else if (severity === "HIGH") bg = "#fde68a";
    else if (severity === "MEDIUM") bg = "#fef3c7";
    else if (severity === "INFO") bg = "#dcfce7";

    range.getCell(i + 1, 1).setBackground(bg);
  }
}

function pcaiBuildTopActionsFromHealth_(maxItems) {
  const issues = pcaiGetTopHealthIssues_(maxItems || 5);

  return issues.map(issue => {
    let action = "Review issue";
    let owner = "Owner";
    let due = "Today";

    const issueName = String(issue.checkName || "").toLowerCase();
    const notes = String(issue.notes || "");
    const objectName = String(issue.objectName || "");

    if (issueName.includes("credit limit")) {
      action = "Call lab and review credit exposure before new dispatch";
      owner = "Collections";
    } else if (issueName.includes("below minimum stock")) {
      action = "Raise reorder immediately for affected SKU";
      owner = "Inventory";
    } else if (issueName.includes("pending payment")) {
      action = "Follow up payment and escalate if needed";
      owner = "Collections";
    } else if (issueName.includes("missing required sheet") || issueName.includes("required header")) {
      action = "Fix structure issue in workbook";
      owner = "Admin";
    } else if (issueName.includes("blank critical field")) {
      action = "Fill missing field and validate source process";
      owner = "Operations";
    } else if (issueName.includes("invalid")) {
      action = "Correct invalid status/value";
      owner = "Operations";
    }

    return {
      priority: issue.severity,
      action: action,
      objectName: objectName,
      notes: notes,
      owner: owner,
      due: due
    };
  });
}

function pcaiWriteTop5ActionsCard_(dash, startRow, startCol) {
  const actions = pcaiBuildTopActionsFromHealth_(5);

  dash.getRange(startRow, startCol).setValue("Top 5 Actions for Today").setFontWeight("bold");

  const output = [["Priority", "Action", "Object", "Owner", "Due"]];

  if (!actions.length) {
    output.push(["INFO", "No urgent actions", "-", "Owner", "Today"]);
  } else {
    actions.forEach(a => {
      output.push([
        a.priority,
        a.action,
        a.objectName,
        a.owner,
        a.due
      ]);
    });
  }

  dash.getRange(startRow + 1, startCol, output.length, output[0].length).setValues(output);
  dash.getRange(startRow + 1, startCol, 1, output[0].length)
    .setFontWeight("bold")
    .setBackground("#d9eaf7");

  if (output.length > 1) {
    pcaiColorSeverityColumn_(dash, startRow + 2, startCol, output.length - 1);
  }
}