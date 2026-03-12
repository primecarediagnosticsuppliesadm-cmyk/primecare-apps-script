/************************************************************
 * 06_Risk_Alerts_Recommendations_Forecast.gs
 ************************************************************/

function pcaiUpdateRiskPredictionEngine() {
  const sh = pcaiResetSheetContents_(pcaiGetOrCreateSheetSafe_(PCAI_SHEETS.RISK));

  sh.getRange("A1")
    .setValue("PrimeCare Risk Predictions")
    .setFontWeight("bold")
    .setFontSize(16);

  const orders = pcaiSheetExistsSafe_(PCAI_SHEETS.ORDERS)
    ? pcaiGetRowsAsObjects_(pcaiGetSheetRequiredSafe_(PCAI_SHEETS.ORDERS), "Order_ID")
    : [];

  const inventory = pcaiSheetExistsSafe_(PCAI_SHEETS.INVENTORY)
    ? pcaiGetRowsAsObjects_(pcaiGetSheetRequiredSafe_(PCAI_SHEETS.INVENTORY), "Product_ID")
    : [];

  const credit = pcaiSheetExistsSafe_(PCAI_SHEETS.AR)
    ? pcaiGetRowsAsObjects_(pcaiGetSheetRequiredSafe_(PCAI_SHEETS.AR), "Lab_ID")
    : [];

  const riskyLabs = [];
  const stockRisks = [];
  const labRevenue = {};

  credit.forEach(r => {
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
      riskyLabs.push([labId, outstanding, limit, overdue, hold, score]);
    }
  });

  orders.forEach(r => {
    const lab = String(r.Lab_ID || "").trim();
    const amt = pcaiNum_(r.Order_Total || r.Total_Amount || 0);
    if (!lab) return;
    labRevenue[lab] = (labRevenue[lab] || 0) + amt;
  });

  inventory.forEach(r => {
    const productId = String(r.Product_ID || "").trim();
    if (!productId) return;

    const currentStock = pcaiNum_(r.Current_Stock);
    const minStock = pcaiNum_(r.Min_Stock);
    const reorderQty = pcaiNum_(r.Reorder_Qty);
    const reorderStatus = String(r.Reorder_Status || "").trim().toUpperCase();
    const avgDaily = pcaiNum_(r.Avg_Daily_Sales_30D);
    const leadTime = pcaiNum_(r.Lead_Time_Days);
    const daysLeft = avgDaily > 0 ? Math.floor(currentStock / avgDaily) : "";

    let score = 0;

    if (currentStock <= 0) score += 5;
    else if (currentStock < minStock) score += 4;

    if (reorderStatus === "REORDER") score += 2;

    if (avgDaily > 0 && leadTime > 0 && daysLeft !== "" && daysLeft < leadTime) {
      score += 3;
    }

    if (score > 0) {
      stockRisks.push([
        productId,
        currentStock,
        minStock,
        reorderQty,
        reorderStatus,
        avgDaily,
        leadTime,
        daysLeft,
        score
      ]);
    }
  });

  const revenueRows = Object.keys(labRevenue)
    .map(lab => [lab, labRevenue[lab]])
    .sort((a, b) => b[1] - a[1]);

  riskyLabs.sort((a, b) => b[5] - a[5]);
  stockRisks.sort((a, b) => b[8] - a[8]);

  sh.getRange("A3").setValue("Credit Risk Labs").setFontWeight("bold");
  sh.getRange("A4:F4").setValues([[
    "Lab_ID",
    "Outstanding",
    "Credit_Limit",
    "Days_Overdue",
    "Credit_Hold",
    "Risk_Score"
  ]]);

  if (riskyLabs.length) {
    sh.getRange(5, 1, riskyLabs.length, 6).setValues(riskyLabs);
  }

  sh.getRange("H3").setValue("Stock Risk SKUs").setFontWeight("bold");
  sh.getRange("H4:P4").setValues([[
    "Product_ID",
    "Current_Stock",
    "Min_Stock",
    "Reorder_Qty",
    "Reorder_Status",
    "Avg_Daily_Sales_30D",
    "Lead_Time_Days",
    "Days_Left",
    "Risk_Score"
  ]]);

  if (stockRisks.length) {
    sh.getRange(5, 8, stockRisks.length, 9).setValues(stockRisks);
  }

  sh.getRange("R3").setValue("Revenue Concentration").setFontWeight("bold");
  sh.getRange("R4:S4").setValues([["Lab_ID", "Revenue"]]);

  if (revenueRows.length) {
    sh.getRange(5, 18, revenueRows.length, 2).setValues(revenueRows);
  }

  sh.setFrozenRows(4);
  sh.autoResizeColumns(1, 20);
}

function pcaiUpdateAlertsEngine() {
  const sh = pcaiResetSheetContents_(pcaiGetOrCreateSheetSafe_(PCAI_SHEETS.ALERTS));

  sh.getRange("A1")
    .setValue("PrimeCare Alerts")
    .setFontWeight("bold")
    .setFontSize(16);

  sh.getRange("A3:F3").setValues([[
    "Timestamp",
    "Alert_Type",
    "Object_Name",
    "Severity",
    "Status",
    "Notes"
  ]]);

  const alerts = [];

  const credit = pcaiSheetExistsSafe_(PCAI_SHEETS.AR)
    ? pcaiGetRowsAsObjects_(pcaiGetSheetRequiredSafe_(PCAI_SHEETS.AR), "Lab_ID")
    : [];

  const inventory = pcaiSheetExistsSafe_(PCAI_SHEETS.INVENTORY)
    ? pcaiGetRowsAsObjects_(pcaiGetSheetRequiredSafe_(PCAI_SHEETS.INVENTORY), "Product_ID")
    : [];

  credit.forEach(r => {
    const labId = String(r.Lab_ID || "").trim();
    if (!labId) return;

    const outstanding = pcaiNum_(r.Outstanding);
    const limit = pcaiNum_(r.Credit_Limit);
    const hold = String(r.Credit_Hold || "").trim().toUpperCase();

    if (limit > 0) {
      const util = outstanding / limit;

      if (util >= 1) {
        alerts.push([
          new Date(),
          "CREDIT_LIMIT_BREACH",
          labId,
          "CRITICAL",
          "OPEN",
          "Outstanding exceeds credit limit"
        ]);
      } else if (util >= 0.8) {
        alerts.push([
          new Date(),
          "CREDIT_LIMIT_WARNING",
          labId,
          "HIGH",
          "OPEN",
          "Outstanding above 80% of limit"
        ]);
      }
    }

    if (hold === "HOLD") {
      alerts.push([
        new Date(),
        "LAB_ON_HOLD",
        labId,
        "HIGH",
        "OPEN",
        "Lab is on credit hold"
      ]);
    }
  });

  inventory.forEach(r => {
    const productId = String(r.Product_ID || "").trim();
    if (!productId) return;

    const currentStock = pcaiNum_(r.Current_Stock);
    const minStock = pcaiNum_(r.Min_Stock);
    const reorderStatus = String(r.Reorder_Status || "").trim().toUpperCase();

    if (currentStock <= 0) {
      alerts.push([
        new Date(),
        "STOCKOUT",
        productId,
        "CRITICAL",
        "OPEN",
        "Current stock is zero"
      ]);
    } else if (currentStock < minStock) {
      alerts.push([
        new Date(),
        "LOW_STOCK",
        productId,
        "HIGH",
        "OPEN",
        "Current stock below minimum"
      ]);
    }

    if (reorderStatus === "REORDER") {
      alerts.push([
        new Date(),
        "REORDER_REQUIRED",
        productId,
        "MEDIUM",
        "OPEN",
        "Product marked for reorder"
      ]);
    }
  });

  if (alerts.length) {
    sh.getRange(4, 1, alerts.length, 6).setValues(alerts);
  } else {
    sh.getRange("A4").setValue("No active alerts");
  }

  sh.setFrozenRows(3);
  sh.autoResizeColumns(1, 6);
}

function pcaiUpdateAIRecommendations() {
  const sh = pcaiResetSheetContents_(pcaiGetOrCreateSheetSafe_(PCAI_SHEETS.RECOMMENDATIONS));

  sh.getRange("A1")
    .setValue("PrimeCare AI Recommendations")
    .setFontWeight("bold")
    .setFontSize(16);

  sh.getRange("A3:E3").setValues([[
    "Category",
    "Priority",
    "Object_Name",
    "Recommendation",
    "Reason"
  ]]);

  const recommendations = [];

  const credit = pcaiSheetExistsSafe_(PCAI_SHEETS.AR)
    ? pcaiGetRowsAsObjects_(pcaiGetSheetRequiredSafe_(PCAI_SHEETS.AR), "Lab_ID")
    : [];

  const inventory = pcaiSheetExistsSafe_(PCAI_SHEETS.INVENTORY)
    ? pcaiGetRowsAsObjects_(pcaiGetSheetRequiredSafe_(PCAI_SHEETS.INVENTORY), "Product_ID")
    : [];

  const orders = pcaiSheetExistsSafe_(PCAI_SHEETS.ORDERS)
    ? pcaiGetRowsAsObjects_(pcaiGetSheetRequiredSafe_(PCAI_SHEETS.ORDERS), "Order_ID")
    : [];

  const labRevenue = {};

  credit.forEach(r => {
    const labId = String(r.Lab_ID || "").trim();
    const outstanding = pcaiNum_(r.Outstanding);
    const limit = pcaiNum_(r.Credit_Limit);
    const hold = String(r.Credit_Hold || "").trim().toUpperCase();
    const overdue = pcaiNum_(r.Days_Overdue);

    if (!labId) return;

    if (hold === "HOLD") {
      recommendations.push([
        "Collections",
        "CRITICAL",
        labId,
        "Immediately follow up on payment and restrict further supply until reviewed.",
        "Lab on HOLD with outstanding " + outstanding + " against limit " + limit
      ]);
    } else if (limit > 0 && outstanding / limit >= 0.8) {
      recommendations.push([
        "Collections",
        "HIGH",
        labId,
        "Contact lab today and review payment timeline before new large orders.",
        "Outstanding above 80% of limit"
      ]);
    } else if (overdue > 15) {
      recommendations.push([
        "Collections",
        "HIGH",
        labId,
        "Escalate overdue follow-up and confirm payment commitment.",
        "Days overdue = " + overdue
      ]);
    }
  });

  inventory.forEach(r => {
    const productId = String(r.Product_ID || "").trim();
    const stock = pcaiNum_(r.Current_Stock);
    const min = pcaiNum_(r.Min_Stock);
    const reorderQty = pcaiNum_(r.Reorder_Qty);
    const reorder = String(r.Reorder_Status || "").trim().toUpperCase();
    const avg = pcaiNum_(r.Avg_Daily_Sales_30D);
    const lead = pcaiNum_(r.Lead_Time_Days);

    if (!productId) return;

    if (stock <= 0) {
      recommendations.push([
        "Inventory",
        "CRITICAL",
        productId,
        "Place urgent reorder immediately and review backorders.",
        "Stock is zero"
      ]);
    } else if (reorder === "REORDER") {
      recommendations.push([
        "Inventory",
        "HIGH",
        productId,
        "Raise purchase request for reorder quantity " + reorderQty + ".",
        "Current stock " + stock + " is below minimum " + min
      ]);
    } else if (avg > 0 && lead > 0 && stock / avg < lead) {
      recommendations.push([
        "Inventory",
        "MEDIUM",
        productId,
        "Review projected stock coverage and prepare reorder if demand continues.",
        "Days of stock left is below lead time"
      ]);
    }
  });

  orders.forEach(r => {
    const lab = String(r.Lab_ID || "").trim();
    const amt = pcaiNum_(r.Order_Total || r.Total_Amount || 0);
    if (!lab) return;
    labRevenue[lab] = (labRevenue[lab] || 0) + amt;
  });

  const revenueRows = Object.keys(labRevenue)
    .map(lab => ({ lab: lab, revenue: labRevenue[lab] }))
    .sort((a, b) => b.revenue - a.revenue);

  if (revenueRows.length) {
    recommendations.push([
      "Growth",
      "MEDIUM",
      revenueRows[0].lab,
      "Protect and grow this account, but monitor concentration risk.",
      "Top revenue lab"
    ]);

    const totalRevenue = revenueRows.reduce((sum, row) => sum + row.revenue, 0);
    const topShare = totalRevenue > 0 ? revenueRows[0].revenue / totalRevenue : 0;

    if (topShare >= 0.5) {
      recommendations.push([
        "Business Risk",
        "HIGH",
        revenueRows[0].lab,
        "Reduce dependency by growing other labs and diversifying revenue.",
        "Top lab contributes more than 50% of tracked revenue"
      ]);
    }
  }

  if (!recommendations.length) {
    recommendations.push([
      "General",
      "INFO",
      "System",
      "No urgent action needed today. Continue monitoring.",
      "No critical risks detected"
    ]);
  }

  recommendations.sort((a, b) => pcaiAlertPriority_(a[1]) - pcaiAlertPriority_(b[1]));

  sh.getRange(4, 1, recommendations.length, 5).setValues(recommendations);
  sh.setFrozenRows(3);
  sh.autoResizeColumns(1, 5);
}

function pcaiUpdateForecastingLayer() {
  const sh = pcaiResetSheetContents_(pcaiGetOrCreateSheetSafe_(PCAI_SHEETS.FORECASTS));

  sh.getRange("A1")
    .setValue("PrimeCare Forecasts")
    .setFontWeight("bold")
    .setFontSize(18);

  sh.getRange("A3").setValue("Likely Stockouts").setFontWeight("bold");
  sh.getRange("A4:F4").setValues([[
    "Product_ID",
    "Current_Stock",
    "Avg_Daily_Sales_30D",
    "Lead_Time_Days",
    "Days_Left",
    "Forecast_Status"
  ]]);

  if (pcaiSheetExistsSafe_(PCAI_SHEETS.INVENTORY)) {
    const rows = pcaiGetRowsAsObjects_(pcaiGetSheetRequiredSafe_(PCAI_SHEETS.INVENTORY), "Product_ID");
    const output = [];

    rows.forEach(r => {
      const stock = pcaiNum_(r.Current_Stock);
      const avg = pcaiNum_(r.Avg_Daily_Sales_30D);
      const lead = pcaiNum_(r.Lead_Time_Days);

      if (avg > 0) {
        const daysLeft = Math.floor(stock / avg);
        const status = daysLeft < lead ? "AT RISK" : "OK";

        if (status === "AT RISK") {
          output.push([r.Product_ID, stock, avg, lead, daysLeft, status]);
        }
      }
    });

    if (output.length) {
      sh.getRange(5, 1, output.length, 6).setValues(output);
    }
  }

  sh.getRange("H3").setValue("Collections Pressure").setFontWeight("bold");
  sh.getRange("H4:M4").setValues([[
    "Lab_ID",
    "Outstanding",
    "Credit_Limit",
    "Days_Overdue",
    "Utilization",
    "Forecast_Status"
  ]]);

  if (pcaiSheetExistsSafe_(PCAI_SHEETS.AR)) {
    const rows = pcaiGetRowsAsObjects_(pcaiGetSheetRequiredSafe_(PCAI_SHEETS.AR), "Lab_ID");
    const output = [];

    rows.forEach(r => {
      const outstanding = pcaiNum_(r.Outstanding);
      const limit = pcaiNum_(r.Credit_Limit);
      const overdue = pcaiNum_(r.Days_Overdue);
      const util = limit > 0 ? outstanding / limit : 0;
      const status = (util >= 0.8 || overdue > 15) ? "AT RISK" : "OK";

      if (status === "AT RISK") {
        output.push([r.Lab_ID, outstanding, limit, overdue, util, status]);
      }
    });

    if (output.length) {
      sh.getRange(5, 8, output.length, 6).setValues(output);
    }
  }

  sh.getRange("O3").setValue("Revenue Concentration").setFontWeight("bold");
  sh.getRange("O4:Q4").setValues([["Lab_ID", "Revenue", "Share_of_Total"]]);

  if (pcaiSheetExistsSafe_(PCAI_SHEETS.ORDERS)) {
    const rows = pcaiGetRowsAsObjects_(pcaiGetSheetRequiredSafe_(PCAI_SHEETS.ORDERS), "Order_ID");
    const labRevenue = {};
    let total = 0;

    rows.forEach(r => {
      const lab = String(r.Lab_ID || "").trim();
      const amt = pcaiNum_(r.Order_Total || r.Total_Amount || 0);

      if (!lab) return;

      labRevenue[lab] = (labRevenue[lab] || 0) + amt;
      total += amt;
    });

    const output = Object.keys(labRevenue)
      .map(lab => [lab, labRevenue[lab], total > 0 ? labRevenue[lab] / total : 0])
      .sort((a, b) => b[1] - a[1]);

    if (output.length) {
      sh.getRange(5, 15, output.length, 3).setValues(output);
    }
  }

  sh.setFrozenRows(4);
  sh.autoResizeColumns(1, 17);
}

function pcaiUpdateGrowthEngine() {
  const sh = pcaiResetSheetContents_(pcaiGetOrCreateSheetSafe_(PCAI_SHEETS.GROWTH_ENGINE));

  sh.getRange("A1")
    .setValue("PrimeCare Growth Engine")
    .setFontWeight("bold")
    .setFontSize(18);

  if (!pcaiSheetExistsSafe_(PCAI_SHEETS.ORDERS)) {
    sh.getRange("A3").setValue("Orders sheet not found");
    return;
  }

  const orders = pcaiGetRowsAsObjects_(pcaiGetSheetRequiredSafe_(PCAI_SHEETS.ORDERS), "Order_ID");
  const orderLines = pcaiSheetExistsSafe_(PCAI_SHEETS.ORDER_LINES)
    ? pcaiGetRowsAsObjects_(pcaiGetSheetRequiredSafe_(PCAI_SHEETS.ORDER_LINES), "Order_Line_ID")
    : [];

  let revenue = 0;
  const labs = {};
  const products = {};

  orders.forEach(r => {
    const lab = String(r.Lab_ID || "").trim();
    const amt = pcaiNum_(r.Order_Total || r.Total_Amount || 0);

    revenue += amt;
    if (lab) {
      labs[lab] = (labs[lab] || 0) + amt;
    }
  });

  orderLines.forEach(r => {
    const prod = String(r.Product_ID || "").trim();
    const qty = pcaiNum_(r.Quantity);

    if (prod) {
      products[prod] = (products[prod] || 0) + qty;
    }
  });

  const labCount = Object.keys(labs).length;
  const avgRevenuePerLab = labCount > 0 ? revenue / labCount : 0;
  const targetRevenue = 3000000;
  const labsNeeded = avgRevenuePerLab > 0 ? Math.ceil(targetRevenue / avgRevenuePerLab) : 0;

  sh.getRange("A4:B8").setValues([
    ["Current Revenue", revenue],
    ["Active Labs", labCount],
    ["Avg Revenue per Lab", avgRevenuePerLab],
    ["Target Revenue (₹)", targetRevenue],
    ["Labs Needed for Target", labsNeeded]
  ]);

  const labRows = Object.keys(labs)
    .map(k => [k, labs[k]])
    .sort((a, b) => b[1] - a[1]);

  sh.getRange("D4").setValue("Top Revenue Labs").setFontWeight("bold");

  if (labRows.length) {
    sh.getRange("D5:E5").setValues([["Lab_ID", "Revenue"]]);
    sh.getRange(6, 4, Math.min(10, labRows.length), 2).setValues(labRows.slice(0, 10));
  }

  const prodRows = Object.keys(products)
    .map(k => [k, products[k]])
    .sort((a, b) => b[1] - a[1]);

  sh.getRange("G4").setValue("Top Products Sold").setFontWeight("bold");

  if (prodRows.length) {
    sh.getRange("G5:H5").setValues([["Product_ID", "Units Sold"]]);
    sh.getRange(6, 7, Math.min(10, prodRows.length), 2).setValues(prodRows.slice(0, 10));
  }

  if (pcaiSheetExistsSafe_(PCAI_SHEETS.INVENTORY)) {
    const invRows = pcaiGetRowsAsObjects_(pcaiGetSheetRequiredSafe_(PCAI_SHEETS.INVENTORY), "Product_ID");
    const reorderCount = invRows.filter(r =>
      String(r.Reorder_Status || "").trim().toUpperCase() === "REORDER"
    ).length;

    sh.getRange("A10:B10").setValues([["Inventory Pressure", reorderCount]]);
  }

  sh.autoResizeColumns(1, 10);
}

function pcaiWriteRecommendationsFromHealth_() {
  const sh = pcaiResetSheetContents_(pcaiGetOrCreateSheetSafe_(PCAI_SHEETS.RECOMMENDATIONS));
  const actions = pcaiBuildTopActionsFromHealth_(20);

  const output = [[
    "Priority",
    "Action",
    "Object",
    "Owner",
    "Due",
    "Status"
  ]];

  if (!actions.length) {
    output.push(["INFO", "No urgent actions", "-", "Owner", "Today", "Open"]);
  } else {
    actions.forEach(a => {
      output.push([
        a.priority,
        a.action,
        a.objectName,
        a.owner,
        a.due,
        "Open"
      ]);
    });
  }

  sh.getRange(1, 1, output.length, output[0].length).setValues(output);
  sh.getRange(1, 1, 1, output[0].length)
    .setFontWeight("bold")
    .setBackground("#d9eaf7");

  if (output.length > 1 && typeof pcaiColorSeverityColumn_ === "function") {
    pcaiColorSeverityColumn_(sh, 2, 1, output.length - 1);
  }

  sh.setFrozenRows(1);
}