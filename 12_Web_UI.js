/************************************************************
 * 12_Web_UI.gs
 * PrimeCare web UI backend
 ************************************************************/

/************************************************************
 * Sidebar launchers
 ************************************************************/
function openStockDashboard() {
  const html = HtmlService
    .createHtmlOutputFromFile("PrimeCare_Stock_Dashboard")
    .setTitle("PrimeCare Stock Dashboard");
  SpreadsheetApp.getUi().showSidebar(html);
}

function openAgentUpdatesPage() {
  const html = HtmlService
    .createHtmlOutputFromFile("PrimeCare_Agent_Updates")
    .setTitle("PrimeCare Agent Updates");
  SpreadsheetApp.getUi().showSidebar(html);
}

/************************************************************
 * Web app entry points
 ************************************************************/
function doGet(e) {
  const action = getParam_(e, "action");
  const page = getParam_(e, "page");

  // JSON API routes
  if (action) {
    return handleApiGet_(e);
  }

  // Legacy HTML page routing
  if (page === "stock") {
    return HtmlService
      .createHtmlOutputFromFile("PrimeCare_Stock_Dashboard")
      .setTitle("PrimeCare Stock Dashboard")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (page === "agent" || !page) {
    return HtmlService
      .createHtmlOutputFromFile("PrimeCare_Agent_Updates")
      .setTitle("PrimeCare Agent Updates")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return jsonOutput_({
    success: false,
    error: "Invalid request"
  });
}

function doPost(e) {
  return handleApiPost_(e);
}

/************************************************************
 * API handlers
 ************************************************************/
function handleApiGet_(e) {
  try {
    const action = getParam_(e, "action");
    const labId = getParam_(e, "labId");

    if (action === "getStock") {
      return jsonOutput_({
        success: true,
        data: pcwebGetStockDashboardData()
      });
    }
   
if (action === "getPurchaseOrders") {
  return jsonOutput_(pcwebGetPurchaseOrders_());
}
if (action === "getSmartReorder") {
  return jsonOutput_(pcwebGetSmartReorder_());
}

if (action === "getReorderCandidates") {
  return jsonOutput_(pcwebGetReorderCandidates_());
}

if (action === "getCollectionDetails") {
  return jsonOutput_(pcwebGetCollectionDetails_(getParam_(e, "labId")));
}

if (action === "getCollectionHistory") {
  return jsonOutput_(pcwebGetCollectionHistory_(getParam_(e, "labId")));
}
    if (action === "getReorderForecast") {
      return jsonOutput_({
        success: true,
        data: pcwebGetReorderForecast_()
      });
    }
    
    if (action === "getOrders") {
  return jsonOutput_(pcwebGetOrders_(
    getParam_(e, "labId"),
    getParam_(e, "status")
  ));
}
 

 
if (action === "getOrderDetails") {
  return jsonOutput_(pcwebGetOrderDetails_(getParam_(e, "orderId")));
}

    if (action === "getAIInsights") {
      return jsonOutput_({
        success: true,
        data: pcwebGetAIInsights_()
      });
    }

    if (action === "getLabs") {
      return jsonOutput_({
        success: true,
        data: pcwebGetAgentVisitSeedData()
      });
    }

    if (action === "getDashboard") {
      return jsonOutput_({
        success: true,
        data: pcwebGetDashboardSummary_()
      });
    }

    if (action === "getExecutiveSnapshot") {
      return jsonOutput_({
        success: true,
        data: pcwebGetExecutiveSnapshot_()
      });
    }

    if (action === "getCurrentUser") {
      return jsonOutput_({
        success: true,
        data: pcwebGetCurrentUser_()
      });
    }

    if (action === "getRecentVisits") {
      return jsonOutput_({
        success: true,
        data: pcwebGetRecentVisits_()
      });
    }

    if (action === "getCollections") {
      return jsonOutput_({
        success: true,
        data: pcwebGetCollections_()
      });
    }

    if (action === "getLabCatalog") {
      return jsonOutput_(pcwebGetLabCatalog_(labId));
    }

    if (action === "getLabRecentOrders") {
      return jsonOutput_(pcwebGetLabRecentOrders_(labId));
    }

    return jsonOutput_({
      success: false,
      error: "Unknown GET action: " + action
    });
  } catch (err) {
    return jsonOutput_({
      success: false,
      error: err.message
    });
  }
}

function handleApiPost_(e) {
  try {
    const body = parseJsonBody_(e);
    const action =
      getParam_(e, "action") ||
      String((body && body.action) || "").trim();

    if (action === "saveAgentVisit") {
      const payload = body && body.payload ? body.payload : body;
      const result = pcwebSaveAgentVisit(payload || {});
      return jsonOutput_({
        success: true,
        data: result
      });
    }
    if (action === "updateOrderStatus") {
  const payload = body && body.payload ? body.payload : {};
  return jsonOutput_(pcwebUpdateOrderStatus_(payload));
}
if (action === "updateCollection") {
  const payload = body && body.payload ? body.payload : {};
  return jsonOutput_(pcwebUpdateCollection_(payload));
}
if (action === "createPurchaseOrder") {
  const payload = body && body.payload ? body.payload : {};
  return jsonOutput_(pcwebCreatePurchaseOrder_(payload));
}
if (action === "receivePurchaseOrder") {
  const payload = body && body.payload ? body.payload : {};
  return jsonOutput_(pcwebReceivePurchaseOrder_(payload));
}

    if (action === "submitLabOrder") {
      const payload = body && body.payload ? body.payload : {};
      return jsonOutput_(pcwebSubmitLabOrder_(payload));
    }

    

    return jsonOutput_({
      success: false,
      error: "Unknown POST action: " + action
    });
  } catch (err) {
    return jsonOutput_({
      success: false,
      error: err.message
    });
  }
}

/************************************************************
 * Generic helpers
 ************************************************************/
function getParam_(e, key) {
  return e && e.parameter && e.parameter[key]
    ? String(e.parameter[key]).trim()
    : "";
}

function parseJsonBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    throw new Error("Invalid JSON body");
  }
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/************************************************************
 * Temporary current user for testing
 * IMPORTANT: replace LAB-001 with a real Lab_ID from Lab_Master
 ************************************************************/
 function pcwebGetCurrentUser_() {
  return {
    name: "Pradeep",
    role: "ADMIN",
    email: "pradeep27101991@gmail.com",
    labId: "",
    labName: "",
    agentName: "",
    outstanding: 0
  };
}
/*function pcwebGetCurrentUser_() {
  const email =
    (Session.getActiveUser && Session.getActiveUser().getEmail
      ? Session.getActiveUser().getEmail()
      : "") || "";

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("User_Master");

  // Fallback if Apps Script web context does not return email
  if (!email) {
    return {
      name: "Fallback Admin",
      role: "ADMIN",
      email: "",
      labId: "",
      labName: "",
      agentName: "",
      outstanding: 0
    };
  }

  if (!sh || sh.getLastRow() < 2) {
    return {
      name: email,
      role: "ADMIN",
      email: email,
      labId: "",
      labName: "",
      agentName: "",
      outstanding: 0
    };
  }

  const rows = pcwebReadSheetObjects_(sh);

  const user = rows.find(function(row) {
    const rowEmail = String(row.User_ID || "").trim().toLowerCase();
    const activeVal = String(row.Active || "Yes").trim().toLowerCase();

    return (
      rowEmail === email.trim().toLowerCase() &&
      activeVal !== "no" &&
      activeVal !== "false"
    );
  });

  if (!user) {
    return {
      name: email,
      role: "ADMIN",
      email: email,
      labId: "",
      labName: "",
      agentName: "",
      outstanding: 0
    };
  }

  const role = String(user.Role || "ADMIN").trim().toUpperCase();
  const labId = String(user.Lab_ID || "").trim();
  const agentName = String(user.Agent_Name || "").trim();

  let labName = "";
  if (labId) {
    const labMap = pcwebGetLabMasterMapById_();
    const lab = labMap[labId];
    labName = lab ? String(lab.Lab_Name || "").trim() : "";
  }

  return {
    name: String(user.User_Name || email).trim(),
    role: role,
    email: email,
    labId: labId,
    labName: labName,
    agentName: agentName,
    outstanding: labId ? pcwebGetOutstandingByLabId_(labId) : 0
  };
}*/

/************************************************************
 * Stock dashboard
 ************************************************************/
function pcwebGetStockDashboardData() {
  const inventory = pcaiSheetExists_(PCAI_SHEETS.INVENTORY)
    ? pcaiGetRowsAsObjects_(pcaiGetSheetRequired_(PCAI_SHEETS.INVENTORY), "Product_ID")
    : [];

  const collectionsRisk = pcaiSheetExists_(PCAI_SHEETS.COLLECTIONS_RISK)
    ? pcaiGetRowsAsObjects_(pcaiGetSheetRequired_(PCAI_SHEETS.COLLECTIONS_RISK), "Lab_ID")
    : [];

  const reorderItems = inventory
    .map(function(r) {
      const current = pcaiNum_(r.Current_Stock);
      const min = pcaiNum_(r.Min_Stock);
      const reorderQty = pcaiNum_(r.Reorder_Qty);
      const status = String(r.Reorder_Status || "").trim().toUpperCase();

      let stockHealth = "Healthy";
      if (current <= 0) {
        stockHealth = "Critical";
      } else if (current < min) {
        stockHealth = "Reorder";
      }

      return {
        productId: String(r.Product_ID || "").trim(),
        productName: String(r.Product_Name || "").trim(),
        category: String(r.Category || "").trim(),
        currentStock: current,
        minStock: min,
        reorderQty: reorderQty,
        reorderStatus: status,
        avgDailySales: pcaiNum_(r.Avg_Daily_Sales_30D),
        leadTimeDays: pcaiNum_(r.Lead_Time_Days),
        stockHealth: stockHealth
      };
    })
    .filter(function(x) {
      return x.productId;
    });

  const stats = {
    totalSkus: reorderItems.length,
    criticalItems: reorderItems.filter(function(x) { return x.stockHealth === "Critical"; }).length,
    reorderItems: reorderItems.filter(function(x) { return x.stockHealth === "Reorder"; }).length,
    healthyItems: reorderItems.filter(function(x) { return x.stockHealth === "Healthy"; }).length,
    totalSuggestedOrderQty: reorderItems.reduce(function(sum, x) {
      return sum + (x.stockHealth !== "Healthy" ? x.reorderQty : 0);
    }, 0),
    labsAtCollectionsRisk: collectionsRisk.length
  };

  return {
    stats: stats,
    inventory: reorderItems
      .sort(function(a, b) {
        const rank = { Critical: 1, Reorder: 2, Healthy: 3 };
        return (rank[a.stockHealth] || 99) - (rank[b.stockHealth] || 99);
      })
      .slice(0, 200)
  };
}

/************************************************************
 * Labs seed for agent screens
 ************************************************************/
function pcwebGetAgentVisitSeedData() {
  const labs = pcaiSheetExists_(PCAI_SHEETS.AR)
    ? pcaiGetRowsAsObjects_(pcaiGetSheetRequired_(PCAI_SHEETS.AR), "Lab_ID")
    : [];

  return {
    labs: labs
      .map(function(r) {
        return {
          labId: String(r.Lab_ID || "").trim(),
          labName: String(r.Lab_Name || "").trim() || String(r.Lab_ID || "").trim()
        };
      })
      .filter(function(x) {
        return x.labId;
      })
  };
}

/************************************************************
 * Agent visit save
 ************************************************************/
function pcwebSaveAgentVisit(formData) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Agent_Visit_Log");
  if (!sh) throw new Error("Missing required sheet: Agent_Visit_Log");

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function(h) {
    return String(h || "").trim();
  });

  const requiredHeaders = [
    "Visit_ID",
    "Visit_Date",
    "Agent_Name",
    "Lab_ID",
    "Lab_Name",
    "Area",
    "Visit_Type",
    "Samples_Given",
    "Demo_Given",
    "Lab_Response",
    "Sold_Value",
    "Stock_Available",
    "Needs_New_Stock",
    "Next_Action",
    "Notes",
    "Created_At"
  ];

  const missing = requiredHeaders.filter(function(h) {
    return headers.indexOf(h) === -1;
  });

  if (missing.length) {
    throw new Error("Agent_Visit_Log is missing headers: " + missing.join(", "));
  }

  if (!formData.agentName) throw new Error("Agent name is required");
  if (!formData.labName) throw new Error("Lab name is required");
  if (!formData.area) throw new Error("Area is required");

  const visitId = "VIS-" + Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyyMMdd-HHmmss"
  );

  const rowObj = {
    Visit_ID: visitId,
    Visit_Date: formData.visitDate || Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd"
    ),
    Agent_Name: String(formData.agentName || "").trim(),
    Lab_ID: String(formData.labId || "").trim(),
    Lab_Name: String(formData.labName || "").trim(),
    Area: String(formData.area || "").trim(),
    Visit_Type: String(formData.visitType || "").trim(),
    Samples_Given: Number(formData.samplesGiven || 0),
    Demo_Given: String(formData.demoGiven || "No").trim(),
    Lab_Response: String(formData.labResponse || "").trim(),
    Sold_Value: Number(formData.soldValue || 0),
    Stock_Available: String(formData.stockAvailable || "").trim(),
    Needs_New_Stock: String(formData.needsNewStock || "").trim(),
    Next_Action: String(formData.nextAction || "").trim(),
    Notes: String(formData.notes || "").trim(),
    Created_At: new Date()
  };

  const row = headers.map(function(h) {
    return rowObj[h] !== undefined ? rowObj[h] : "";
  });

  sh.appendRow(row);

  return {
    visitId: visitId,
    message: "Agent visit saved successfully"
  };
}

/************************************************************
 * Purchase order sheet tools
 ************************************************************/
function pcFixPurchaseOrdersSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName("Purchase_Orders");

  if (!sh) {
    sh = ss.insertSheet("Purchase_Orders");
  }

  const headers = [
    "PO_ID",
    "PO_Date",
    "Product_ID",
    "Product_Name",
    "Quantity",
    "Unit_Cost",
    "Total_Cost",
    "Supplier",
    "Status",
    "Created_At"
  ];

  sh.clearContents();
  sh.clearFormats();

  sh.getRange(1, 1, 1, headers.length).setValues([headers]);

  sh.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#dbeafe")
    .setBorder(true, true, true, true, true, true);

  sh.setFrozenRows(1);

  const widths = [140, 120, 130, 220, 100, 110, 120, 180, 120, 180];
  widths.forEach(function(w, i) {
    sh.setColumnWidth(i + 1, w);
  });

  const maxRows = Math.max(sh.getMaxRows(), 200);
  if (sh.getMaxRows() < maxRows) {
    sh.insertRowsAfter(sh.getMaxRows(), maxRows - sh.getMaxRows());
  }

  sh.getRange("B:B").setNumberFormat("yyyy-mm-dd");
  sh.getRange("E:G").setNumberFormat("0.00");
  sh.getRange("J:J").setNumberFormat("yyyy-mm-dd hh:mm:ss");

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Draft", "Ordered", "Received", "Cancelled"], true)
    .setAllowInvalid(false)
    .build();

  sh.getRange(2, 9, sh.getMaxRows() - 1, 1).setDataValidation(statusRule);

  SpreadsheetApp.getUi().alert("Purchase_Orders sheet fixed successfully.");
}

function pcCreatePurchaseOrder(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("Purchase_Orders");
  if (!sh) throw new Error("Purchase_Orders sheet not found. Run pcFixPurchaseOrdersSheet() first.");

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const rowObj = {};

  const poId = "PO-" + Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyyMMdd-HHmmss"
  );

  rowObj["PO_ID"] = poId;
  rowObj["PO_Date"] = data.poDate || Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd"
  );
  rowObj["Product_ID"] = String(data.productId || "").trim();
  rowObj["Product_Name"] = String(data.productName || "").trim();
  rowObj["Quantity"] = Number(data.quantity || 0);
  rowObj["Unit_Cost"] = Number(data.unitCost || 0);
  rowObj["Total_Cost"] = rowObj["Quantity"] * rowObj["Unit_Cost"];
  rowObj["Supplier"] = String(data.supplier || "").trim();
  rowObj["Status"] = String(data.status || "Draft").trim();
  rowObj["Created_At"] = new Date();

  const row = headers.map(function(h) {
    return rowObj[h] !== undefined ? rowObj[h] : "";
  });
  sh.appendRow(row);

  return {
    success: true,
    poId: poId,
    message: "Purchase order created successfully"
  };
}

function pcTestCreatePurchaseOrder() {
  const result = pcCreatePurchaseOrder({
    productId: "P001",
    productName: "Vacutainer Tube",
    quantity: 100,
    unitCost: 12.5,
    supplier: "Sri Balaji Surgicals",
    status: "Draft"
  });

  Logger.log(result);
}

function pcShowCurrentWebRoutes() {
  Logger.log("PrimeCare active routes:");
  Logger.log("?page=agent -> PrimeCare_Agent_Updates");
  Logger.log("?page=stock -> PrimeCare_Stock_Dashboard");
  Logger.log("Only one active doGet(e) should exist in project.");
}

/************************************************************
 * Dashboard summary
 ************************************************************/
function pcwebGetDashboardSummary_() {
  const stock = pcwebGetStockDashboardData();
  const visitsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Agent_Visit_Log");

  let recentVisits = 0;
  let totalSoldValue = 0;

  if (visitsSheet && visitsSheet.getLastRow() > 1) {
    const values = visitsSheet.getDataRange().getValues();
    const headers = values[0].map(function(h) { return String(h).trim(); });
    const rows = values.slice(1);

    const soldIdx = headers.indexOf("Sold_Value");

    recentVisits = rows.filter(function(r) {
      return r.some(function(c) { return c !== ""; });
    }).length;

    if (soldIdx !== -1) {
      totalSoldValue = rows.reduce(function(sum, r) {
        return sum + Number(r[soldIdx] || 0);
      }, 0);
    }
  }

  return {
    stockStats: stock.stats || {},
    recentVisits: recentVisits,
    totalSoldValue: totalSoldValue
  };
}

/************************************************************
 * Recent visits
 ************************************************************/
function pcwebGetRecentVisits_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Agent_Visit_Log");
  if (!sh || sh.getLastRow() < 2) {
    return { visits: [] };
  }

  const values = sh.getDataRange().getValues();
  const headers = values[0].map(function(h) { return String(h || "").trim(); });
  const rows = values.slice(1);

  const idx = {};
  headers.forEach(function(h, i) {
    idx[h] = i;
  });

  const visits = rows
    .filter(function(r) {
      return r.some(function(c) { return c !== ""; });
    })
    .map(function(r) {
      return {
        id: r[idx["Visit_ID"]] || "",
        date: r[idx["Visit_Date"]] || "",
        agent: r[idx["Agent_Name"]] || "",
        labId: r[idx["Lab_ID"]] || "",
        labName: r[idx["Lab_Name"]] || "",
        area: r[idx["Area"]] || "",
        visitType: r[idx["Visit_Type"]] || "",
        samplesGiven: Number(r[idx["Samples_Given"]] || 0),
        demoGiven: r[idx["Demo_Given"]] || "",
        labResponse: r[idx["Lab_Response"]] || "",
        soldValue: Number(r[idx["Sold_Value"]] || 0),
        stockAvailable: r[idx["Stock_Available"]] || "",
        needsNewStock: r[idx["Needs_New_Stock"]] || "",
        nextAction: r[idx["Next_Action"]] || "",
        notes: r[idx["Notes"]] || "",
        createdAt: r[idx["Created_At"]] || ""
      };
    })
    .sort(function(a, b) {
      return new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0);
    })
    .slice(0, 10);

  return { visits: visits };
}

/************************************************************
 * Executive snapshot
 ************************************************************/
function pcwebGetExecutiveSnapshot_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const stockData = pcwebGetStockDashboardData();
  const arSheet = ss.getSheetByName("AR_Credit_Control");
  const orderSheet = ss.getSheetByName("Orders");

  let outstandingReceivables = 0;
  let labsAtCreditRisk = 0;
  let topLabsByRevenue = [];
  let todaysRevenue = 0;

  if (arSheet && arSheet.getLastRow() > 1) {
    const values = arSheet.getDataRange().getValues();
    const headers = values[0].map(function(h) { return String(h || "").trim(); });
    const rows = values.slice(1);

    const idx = {};
    headers.forEach(function(h, i) {
      idx[h] = i;
    });

    rows.forEach(function(r) {
      const outstanding =
        Number(r[idx["Outstanding_Amount"]] || 0) ||
        Number(r[idx["Balance_Amount"]] || 0) ||
        Number(r[idx["Amount_Due"]] || 0) ||
        Number(r[idx["Outstanding"]] || 0);

      outstandingReceivables += outstanding;

      const risk =
        String(r[idx["Risk_Status"]] || r[idx["Credit_Risk"]] || "").toLowerCase();

      if (risk.indexOf("risk") !== -1 || risk.indexOf("high") !== -1 || risk.indexOf("hold") !== -1) {
        labsAtCreditRisk += 1;
      }
    });
  }

  if (orderSheet && orderSheet.getLastRow() > 1) {
    const values = orderSheet.getDataRange().getValues();
    const headers = values[0].map(function(h) { return String(h || "").trim(); });
    const rows = values.slice(1);

    const idx = {};
    headers.forEach(function(h, i) {
      idx[h] = i;
    });

    const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    const revenueByLab = {};

    rows.forEach(function(r) {
      const orderDateRaw = r[idx["Order_Date"]] || r[idx["Created_At"]] || "";
      let orderDate = "";
      if (orderDateRaw) {
        try {
          orderDate = Utilities.formatDate(new Date(orderDateRaw), Session.getScriptTimeZone(), "yyyy-MM-dd");
        } catch (e) {
          orderDate = String(orderDateRaw).slice(0, 10);
        }
      }

      const amount =
        Number(r[idx["Order_Value"]] || 0) ||
        Number(r[idx["Total_Amount"]] || 0) ||
        Number(r[idx["Final_Amount"]] || 0) ||
        Number(r[idx["Order_Total"]] || 0);

      const labName = String(
        r[idx["Lab_Name"]] ||
        r[idx["Customer_Name"]] ||
        r[idx["Account_Name"]] ||
        "Unknown"
      );

      if (orderDate === todayStr) {
        todaysRevenue += amount;
      }

      if (!revenueByLab[labName]) {
        revenueByLab[labName] = 0;
      }
      revenueByLab[labName] += amount;
    });

    topLabsByRevenue = Object.keys(revenueByLab)
      .map(function(name) {
        return { labName: name, revenue: revenueByLab[name] };
      })
      .sort(function(a, b) {
        return b.revenue - a.revenue;
      })
      .slice(0, 5);
  }

  return {
    todaysRevenue: todaysRevenue,
    outstandingReceivables: outstandingReceivables,
    labsAtCreditRisk: labsAtCreditRisk || Number(stockData.stats && stockData.stats.labsAtCollectionsRisk || 0),
    productsNearStockout:
      Number(stockData.stats && stockData.stats.criticalItems || 0) +
      Number(stockData.stats && stockData.stats.reorderItems || 0),
    topLabsByRevenue: topLabsByRevenue
  };
}

/************************************************************
 * Collections
 ************************************************************/
function pcwebGetCollections_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("AR_Credit_Control");

  if (!sh || sh.getLastRow() < 2) {
    return {
      summary: {
        totalOutstanding: 0,
        overdueCount: 0,
        highRiskCount: 0,
        todayCollections: 0
      },
      collections: []
    };
  }

  const values = sh.getDataRange().getValues();
  const headers = values[0].map(function(h) {
    return String(h || "").trim();
  });
  const rows = values.slice(1);

  const idx = {};
  headers.forEach(function(h, i) {
    idx[h] = i;
  });

  const collections = rows
    .filter(function(r) {
      const labId = String(r[idx["Lab_ID"]] || "").trim();
      return labId !== "";
    })
    .map(function(r) {
      const outstanding = Number(r[idx["Outstanding"]] || 0);
      const daysOverdue = Number(r[idx["Days_Overdue"]] || 0);
      const creditHold = String(r[idx["Credit_Hold"]] || "").trim();
      const labId = String(r[idx["Lab_ID"]] || "").trim();
      const labName = String(r[idx["Lab_Name"]] || "").trim();

      let riskStatus = "Low";
      if (creditHold.toUpperCase() === "HOLD") {
        riskStatus = "High";
      } else if (daysOverdue > 0 || outstanding > 0) {
        riskStatus = "Medium";
      }

      let paymentStatus = "Pending";
      if (outstanding <= 0) {
        paymentStatus = "Paid";
      } else if (Number(r[idx["Total_Paid"]] || 0) > 0) {
        paymentStatus = "Partially Paid";
      }

      return {
        labId: labId,
        labName: labName,
        assignedAgent: "",
        outstandingAmount: outstanding,
        overdueDays: daysOverdue,
        riskStatus: riskStatus,
        lastFollowUp: idx["Last_Follow_Up_Date"] !== undefined
          ? pcwebFormatDateValue_(r[idx["Last_Follow_Up_Date"]])
          : "",
        nextAction: idx["Collections_Notes"] !== undefined
          ? String(r[idx["Collections_Notes"]] || "").trim()
          : "",
        paymentStatus: paymentStatus,
        area: ""
      };
    });

  const summary = {
    totalOutstanding: collections.reduce(function(sum, x) {
      return sum + Number(x.outstandingAmount || 0);
    }, 0),
    overdueCount: collections.filter(function(x) {
      return Number(x.overdueDays || 0) > 0;
    }).length,
    highRiskCount: collections.filter(function(x) {
      return String(x.riskStatus || "").toLowerCase() === "high";
    }).length,
    todayCollections: 0
  };

  return {
    summary: summary,
    collections: collections
  };
}

/************************************************************
 * AI insights
 ************************************************************/
function pcwebGetAIInsights_() {
  const executive = pcwebGetExecutiveSnapshot_();
  const dashboard = pcwebGetDashboardSummary_();
  const collectionsData = pcwebGetCollections_();
  const stockData = pcwebGetStockDashboardData();
  const visitsData = pcwebGetRecentVisits_();

  const insights = [];
  const actions = [];

  const labsAtRisk = Number(executive.labsAtCreditRisk || 0);
  const productsNearStockout = Number(executive.productsNearStockout || 0);
  const outstanding = Number(executive.outstandingReceivables || 0);
  const todaysRevenue = Number(executive.todaysRevenue || 0);

  const visits = (visitsData && visitsData.visits) ? visitsData.visits : [];
  const collections = (collectionsData && collectionsData.collections) ? collectionsData.collections : [];
  const inventory = (stockData && stockData.inventory) ? stockData.inventory : [];
  const topLabs = (executive && executive.topLabsByRevenue) ? executive.topLabsByRevenue : [];

  if (productsNearStockout > 0) {
    insights.push({
      type: "stock_risk",
      severity: "high",
      title: "Low stock risk detected",
      message: productsNearStockout + " product(s) are near stockout or reorder level."
    });

    actions.push("Review reorder quantities immediately for all critical and reorder SKUs.");
  }

  if (labsAtRisk > 0) {
    insights.push({
      type: "credit_risk",
      severity: "high",
      title: "Credit risk rising",
      message: labsAtRisk + " lab(s) are currently flagged as credit risk."
    });

    actions.push("Prioritize collections follow-up for high-risk labs before extending more credit.");
  }

  if (outstanding > todaysRevenue && outstanding > 0) {
    insights.push({
      type: "cashflow_pressure",
      severity: "medium",
      title: "Receivables exceed today's revenue",
      message: "Outstanding receivables are higher than today's revenue, creating cash-flow pressure."
    });

    actions.push("Increase collection efficiency and tighten payment discipline for overdue labs.");
  }

  if (visits.length < 5) {
    insights.push({
      type: "field_activity",
      severity: "medium",
      title: "Field activity is light",
      message: "Recent field visit activity is lower than expected for growth execution."
    });

    actions.push("Increase field visit coverage and follow-up frequency in active territories.");
  }

  if (topLabs.length > 0) {
    insights.push({
      type: "revenue_concentration",
      severity: "medium",
      title: "Top labs driving revenue",
      message: "A small set of labs is contributing a large share of visible revenue."
    });

    actions.push("Protect top revenue labs with faster service, stock assurance, and proactive follow-up.");
  }

  const highRiskCollections = collections.filter(function(c) {
    return String(c.riskStatus || "").toLowerCase().indexOf("high") !== -1;
  });

  if (highRiskCollections.length >= 3) {
    insights.push({
      type: "collections_pressure",
      severity: "high",
      title: "Collections pressure detected",
      message: highRiskCollections.length + " collection record(s) are marked high risk."
    });

    actions.push("Escalate overdue high-risk labs and assign focused collection ownership.");
  }

  const lowStockItems = inventory.filter(function(item) {
    const health = String(item.stockHealth || item.status || "").toLowerCase();
    return health.indexOf("critical") !== -1 ||
      health.indexOf("reorder") !== -1 ||
      health.indexOf("low") !== -1;
  });

  if (lowStockItems.length >= 5) {
    insights.push({
      type: "supply_pressure",
      severity: "medium",
      title: "Supply pressure building",
      message: lowStockItems.length + " items require stock attention."
    });

    actions.push("Review supplier readiness and prioritize fast-moving SKUs first.");
  }

  if (insights.length === 0) {
    insights.push({
      type: "stable",
      severity: "low",
      title: "Operations stable",
      message: "No major risks detected from current visible metrics."
    });

    actions.push("Focus on growth, new lab acquisition, and stronger reorder discipline.");
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalInsights: insights.length,
      highSeverity: insights.filter(function(x) { return x.severity === "high"; }).length,
      mediumSeverity: insights.filter(function(x) { return x.severity === "medium"; }).length,
      lowSeverity: insights.filter(function(x) { return x.severity === "low"; }).length
    },
    insights: insights,
    recommendedActions: actions
  };
}

/************************************************************
 * Reorder forecast
 ************************************************************/
function pcwebGetReorderForecast_() {
  const stockData = pcwebGetStockDashboardData();
  const inventory = (stockData && stockData.inventory) ? stockData.inventory : [];

  const forecast = inventory.map(function(item) {
    const productId = item.productId || "";
    const productName = item.productName || "";
    const currentStock = Number(item.currentStock || 0);
    const monthlyDemand = Number(item.monthlyDemand || 0);
    const reorderQty = Number(item.reorderQty || 0);
    const status = item.stockHealth || item.status || "Healthy";

    const dailyDemand = monthlyDemand > 0 ? monthlyDemand / 30 : 0;
    const daysLeft = dailyDemand > 0 ? Math.floor(currentStock / dailyDemand) : 999;

    let urgency = "Low";
    if (daysLeft <= 7) urgency = "Critical";
    else if (daysLeft <= 15) urgency = "High";
    else if (daysLeft <= 30) urgency = "Medium";

    const suggestedOrderQty =
      reorderQty > 0
        ? reorderQty
        : monthlyDemand > 0
        ? Math.max(monthlyDemand - currentStock, 0)
        : 0;

    return {
      productId: productId,
      productName: productName,
      currentStock: currentStock,
      monthlyDemand: monthlyDemand,
      dailyDemand: Number(dailyDemand.toFixed(2)),
      daysLeft: daysLeft,
      urgency: urgency,
      stockHealth: status,
      suggestedOrderQty: suggestedOrderQty
    };
  });

  forecast.sort(function(a, b) {
    const rank = { Critical: 1, High: 2, Medium: 3, Low: 4 };
    return (rank[a.urgency] || 99) - (rank[b.urgency] || 99);
  });

  return {
    summary: {
      criticalItems: forecast.filter(function(x) { return x.urgency === "Critical"; }).length,
      highUrgencyItems: forecast.filter(function(x) { return x.urgency === "High"; }).length,
      mediumUrgencyItems: forecast.filter(function(x) { return x.urgency === "Medium"; }).length,
      totalSuggestedOrderQty: forecast.reduce(function(sum, x) {
        return sum + Number(x.suggestedOrderQty || 0);
      }, 0)
    },
    forecast: forecast
  };
}

/************************************************************
 * Step 17 / 17.5 - Lab ordering APIs
 ************************************************************/
function pcwebGetLabCatalog_(labId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const productSheet = ss.getSheetByName("Product_Master");
  const inventorySheet = ss.getSheetByName("Inventory");

  if (!productSheet || productSheet.getLastRow() < 2) {
    return {
      success: true,
      labId: labId || "",
      products: []
    };
  }

  const productRows = pcwebReadSheetObjects_(productSheet);
  const inventoryRows =
    inventorySheet && inventorySheet.getLastRow() >= 2
      ? pcwebReadSheetObjects_(inventorySheet)
      : [];

  const inventoryMap = {};
  inventoryRows.forEach(function(row) {
    const productId = String(row.Product_ID || "").trim();
    if (!productId) return;

    const currentStock = Number(row.Current_Stock || 0);
    const minStock = Number(row.Min_Stock || 0);
    const reorderQty = Number(row.Reorder_Qty || 0);
    const reorderStatus = String(row.Reorder_Status || "").trim();

    inventoryMap[productId] = {
      currentStock: currentStock,
      minStock: minStock,
      reorderQty: reorderQty,
      reorderStatus: reorderStatus,
      stockHealth:
        currentStock <= 0
          ? "OUT"
          : currentStock <= minStock
          ? "LOW"
          : "OK"
    };
  });

  const products = productRows
    .map(function(row) {
      const productId = String(row.Product_ID || "").trim();
      const productName = String(row.Product_Name || "").trim();
      const category = String(row.Category || "General").trim();
      const activeFlag = String(row.Active_Flag || "Y").trim().toUpperCase();
      const unitSellingPrice = Number(row.Unit_Selling_Price || 0);
      const inv = inventoryMap[productId] || {
        currentStock: 0,
        minStock: 0,
        reorderQty: 0,
        reorderStatus: "",
        stockHealth: "OK"
      };

      return {
        productId: productId,
        productName: productName,
        category: category,
        brand: String(row.Brand || "").trim(),
        unitSellingPrice: unitSellingPrice,
        unitCost: Number(row.Unit_Cost || 0),
        taxRate: Number(row.Tax_Rate || 0),
        activeFlag: activeFlag,
        currentStock: inv.currentStock,
        minStock: inv.minStock,
        reorderQty: inv.reorderQty,
        reorderStatus: inv.reorderStatus,
        stockHealth: inv.stockHealth,
        canOrder: activeFlag !== "N" && inv.stockHealth !== "OUT"
      };
    })
    .filter(function(item) {
      return item.productId && item.productName && item.activeFlag !== "N";
    })
    .sort(function(a, b) {
      if (a.stockHealth !== b.stockHealth) {
        const weight = { LOW: 0, OK: 1, OUT: 2 };
        return (weight[a.stockHealth] || 9) - (weight[b.stockHealth] || 9);
      }
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.productName.localeCompare(b.productName);
    })
    .map(function(item, index) {
      item.quickOrder = index < 8;
      item.isQuickOrder = index < 8;
      return item;
    });

  return {
    success: true,
    labId: labId || "",
    products: products
  };
}

function pcwebGetLabRecentOrders_(labId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const orderSheet = ss.getSheetByName("Orders");

  if (!orderSheet || orderSheet.getLastRow() < 2) {
    return {
      success: true,
      orders: []
    };
  }

  const rows = pcwebReadSheetObjects_(orderSheet);

  const orders = rows
    .filter(function(row) {
      if (!row.Order_ID) return false;
      if (!labId) return true;
      return String(row.Lab_ID || "").trim() === String(labId).trim();
    })
    .map(function(row) {
      return {
        orderId: String(row.Order_ID || "").trim(),
        orderDate: pcwebFormatDateValue_(row.Order_Date),
        labId: String(row.Lab_ID || "").trim(),
        labName: String(row.Lab_Name || "").trim(),
        invoiceId: String(row.Invoice_ID || "").trim(),
        invoiceStatus: String(row.Invoice_Status || "").trim(),
        paymentStatus: String(row.Payment_Status || "Pending").trim(),
        orderStatus: String(row.Order_Status || "Placed").trim(),
        orderTotal: Number(row.Order_Total || row.Total_Amount || 0),
        createdAt: pcwebFormatDateTimeValue_(row.Created_At)
      };
    })
    .sort(function(a, b) {
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    })
    .slice(0, 10);

  return {
    success: true,
    orders: orders
  };
}

function pcwebSubmitLabOrder_(payload) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ordersSheet = ss.getSheetByName("Orders");
    const orderLinesSheet = ss.getSheetByName("Order_Lines");
    const productSheet = ss.getSheetByName("Product_Master");
    const labSheet = ss.getSheetByName("Lab_Master");

    if (!ordersSheet) throw new Error("Missing required sheet: Orders");
    if (!orderLinesSheet) throw new Error("Missing required sheet: Order_Lines");
    if (!productSheet) throw new Error("Missing required sheet: Product_Master");
    if (!labSheet) throw new Error("Missing required sheet: Lab_Master");

    const labId = String(payload.labId || "").trim();
    const notes = String(payload.notes || "").trim();
    const items = Array.isArray(payload.items) ? payload.items : [];

    if (!labId) throw new Error("Lab ID is required");
    if (!items.length) throw new Error("At least one item is required");

    const labMap = pcwebGetLabMasterMapById_();
    const productMap = pcwebGetProductMasterMapById_();
    const inventoryMap = pcwebGetInventoryMapByProductId_();

    const lab = labMap[labId];
    if (!lab) {
      throw new Error("Lab not found in Lab_Master for Lab_ID: " + labId);
    }

    const validatedItems = items.map(function(item) {
      const productId = String(item.productId || "").trim();
      const quantity = Number(item.quantity || 0);

      if (!productId) {
        throw new Error("Invalid product in cart");
      }

      if (!quantity || quantity <= 0) {
        throw new Error("Quantity must be greater than zero for " + productId);
      }

      const product = productMap[productId];
      if (!product) {
        throw new Error("Product not found in Product_Master: " + productId);
      }

      const activeFlag = String(product.Active_Flag || "Y").trim().toUpperCase();
      if (activeFlag === "N") {
        throw new Error("Inactive product cannot be ordered: " + productId);
      }

      const inventory = inventoryMap[productId] || {};
      const currentStock = Number(inventory.Current_Stock || 0);

      if (currentStock <= 0) {
        throw new Error("Product is currently out of stock: " + productId);
      }

      if (quantity > currentStock) {
        throw new Error(
          "Requested quantity exceeds available stock for " + productId
        );
      }

      const unitSellingPrice = Number(product.Unit_Selling_Price || 0);
      const taxRate = Number(product.Tax_Rate || 0);
      const lineTotal = quantity * unitSellingPrice;
      const taxAmount = lineTotal * (taxRate / 100);
      const netLineTotal = lineTotal + taxAmount;

      return {
        productId: productId,
        productName: String(product.Product_Name || "").trim(),
        quantity: quantity,
        unitSellingPrice: unitSellingPrice,
        taxRate: taxRate,
        lineTotal: lineTotal,
        taxAmount: taxAmount,
        netLineTotal: netLineTotal
      };
    });

    const now = new Date();
    const orderId = pcwebGenerateNextId_("ORD", ordersSheet, "Order_ID");
    const invoiceId = pcwebGenerateNextId_("INV", ordersSheet, "Invoice_ID");
    const orderDate = pcwebFormatDateOnly_(now);
    const createdAt = pcwebFormatDateTimeValue_(now);

    const orderTotal = validatedItems.reduce(function(sum, item) {
      return sum + Number(item.lineTotal || 0);
    }, 0);

    pcwebAppendObjectRow_(ordersSheet, {
      Order_ID: orderId,
      Order_Date: orderDate,
      Lab_ID: labId,
      Lab_Name: String(lab.Lab_Name || "").trim(),
      Contact_Person: String(lab.Owner_Name || "").trim(),
      Mobile_Number: String(lab.Phone || "").trim(),
      Email_Address: "",
      Delivery_Address: String(lab.Area || "").trim(),
      Notes: notes,
      Invoice_ID: invoiceId,
      Invoice_Status: "Draft",
      Payment_Status: "Pending",
      Order_Total: orderTotal,
      Created_At: createdAt,
      Order_Status: "Placed",
      Product_ID: "",
      Product_Name: "",
      Quantity: "",
      Unit_Selling_Price: "",
      Total_Amount: orderTotal
    });

    validatedItems.forEach(function(item, index) {
      const orderLineId = pcwebGenerateOrderLineId_(orderId, index + 1);

      pcwebAppendObjectRow_(orderLinesSheet, {
        Order_Line_ID: orderLineId,
        Order_ID: orderId,
        Invoice_ID: invoiceId,
        Order_Date: orderDate,
        Lab_ID: labId,
        Product_ID: item.productId,
        Product_Name: item.productName,
        Quantity: item.quantity,
        Unit_Selling_Price: item.unitSellingPrice,
        Line_Total: item.lineTotal,
        Tax_Rate: item.taxRate,
        Tax_Amount: item.taxAmount,
        Net_Line_Total: item.netLineTotal,
        Created_At: createdAt
      });
    });

    SpreadsheetApp.flush();

    return {
      success: true,
      message: "Order submitted successfully",
      orderId: orderId,
      invoiceId: invoiceId,
      orderTotal: orderTotal,
      itemCount: validatedItems.length
    };
  } finally {
    lock.releaseLock();
  }
}

/************************************************************
 * Lab ordering helpers
 ************************************************************/
function pcwebReadSheetObjects_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function(h) {
    return String(h || "").trim();
  });

  return values.slice(1)
    .filter(function(row) {
      return row.some(function(cell) {
        return cell !== "" && cell !== null;
      });
    })
    .map(function(row) {
      const obj = {};
      headers.forEach(function(header, index) {
        if (header) {
          obj[header] = row[index];
        }
      });
      return obj;
    });
}

function pcwebGetSheetHeaders_(sheet) {
  if (!sheet || sheet.getLastColumn() < 1) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(h) {
    return String(h || "").trim();
  });
}

function pcwebAppendObjectRow_(sheet, dataObj) {
  const headers = pcwebGetSheetHeaders_(sheet);
  const row = headers.map(function(header) {
    if (!header) return "";
    return Object.prototype.hasOwnProperty.call(dataObj, header)
      ? dataObj[header]
      : "";
  });

  sheet.appendRow(row);
}

function pcwebGetProductMasterMapById_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("Product_Master");
  const rows = sh && sh.getLastRow() >= 2 ? pcwebReadSheetObjects_(sh) : [];

  const map = {};
  rows.forEach(function(row) {
    const productId = String(row.Product_ID || "").trim();
    if (productId) {
      map[productId] = row;
    }
  });

  return map;
}

function pcwebGetLabMasterMapById_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("Lab_Master");
  const rows = sh && sh.getLastRow() >= 2 ? pcwebReadSheetObjects_(sh) : [];

  const map = {};
  rows.forEach(function(row) {
    const labId = String(row.Lab_ID || "").trim();
    if (labId) {
      map[labId] = row;
    }
  });

  return map;
}

function pcwebGetInventoryMapByProductId_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("Inventory");
  const rows = sh && sh.getLastRow() >= 2 ? pcwebReadSheetObjects_(sh) : [];

  const map = {};
  rows.forEach(function(row) {
    const productId = String(row.Product_ID || "").trim();
    if (productId) {
      map[productId] = row;
    }
  });

  return map;
}

function pcwebGenerateNextId_(prefix, sheet, headerName) {
  const rows = pcwebReadSheetObjects_(sheet);
  const tz = Session.getScriptTimeZone() || "Asia/Kolkata";
  const datePart = Utilities.formatDate(new Date(), tz, "yyyyMMdd");

  let maxSeq = 0;

  rows.forEach(function(row) {
    const value = String(row[headerName] || "").trim();
    const parts = value.split("-");
    if (parts.length !== 3) return;
    if (parts[0] !== prefix) return;
    if (parts[1] !== datePart) return;

    const seq = Number(parts[2] || 0);
    if (seq > maxSeq) {
      maxSeq = seq;
    }
  });

  const nextSeq = maxSeq + 1;
  return prefix + "-" + datePart + "-" + ("0000" + nextSeq).slice(-4);
}

function pcwebGenerateOrderLineId_(orderId, lineNumber) {
  return orderId + "-L" + ("00" + lineNumber).slice(-2);
}

function pcwebFormatDateOnly_(value) {
  const tz = Session.getScriptTimeZone() || "Asia/Kolkata";
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return "";
  return Utilities.formatDate(date, tz, "yyyy-MM-dd");
}

function pcwebFormatDateTimeValue_(value) {
  const tz = Session.getScriptTimeZone() || "Asia/Kolkata";
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return "";
  return Utilities.formatDate(date, tz, "yyyy-MM-dd HH:mm:ss");
}

function pcwebFormatDateValue_(value) {
  if (!value) return "";
  if (value instanceof Date) {
    return pcwebFormatDateOnly_(value);
  }
  return String(value);
}

function pcwebGetOrders_(labId, status) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const orderSheet = ss.getSheetByName("Orders");

  if (!orderSheet || orderSheet.getLastRow() < 2) {
    return {
      success: true,
      orders: []
    };
  }

  const rows = pcwebReadSheetObjects_(orderSheet);

  const orders = rows
    .filter(function(row) {
      const rowOrderId = String(row.Order_ID || "").trim();
      if (!rowOrderId) return false;

      const rowLabId = String(row.Lab_ID || "").trim();
      const rowStatus = String(row.Order_Status || "Placed").trim();

      if (labId && rowLabId !== String(labId).trim()) return false;
      if (status && rowStatus.toLowerCase() !== String(status).trim().toLowerCase()) return false;

      return true;
    })
    .map(function(row) {
      return {
        orderId: String(row.Order_ID || "").trim(),
        orderDate: pcwebFormatDateValue_(row.Order_Date),
        labId: String(row.Lab_ID || "").trim(),
        labName: String(row.Lab_Name || "").trim(),
        contactPerson: String(row.Contact_Person || "").trim(),
        invoiceId: String(row.Invoice_ID || "").trim(),
        invoiceStatus: String(row.Invoice_Status || "").trim(),
        paymentStatus: String(row.Payment_Status || "Pending").trim(),
        orderStatus: String(row.Order_Status || "Placed").trim(),
        orderTotal: Number(row.Order_Total || row.Total_Amount || 0),
        createdAt: pcwebFormatDateTimeValue_(row.Created_At),
        notes: String(row.Notes || "").trim()
      };
    })
    .sort(function(a, b) {
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });

  return {
    success: true,
    orders: orders
  };
}

function pcwebGetOrderDetails_(orderId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const orderSheet = ss.getSheetByName("Orders");
  const orderLinesSheet = ss.getSheetByName("Order_Lines");

  if (!orderId) {
    throw new Error("Order ID is required");
  }

  if (!orderSheet || orderSheet.getLastRow() < 2) {
    throw new Error("Orders sheet is missing or empty");
  }

  if (!orderLinesSheet || orderLinesSheet.getLastRow() < 2) {
    throw new Error("Order_Lines sheet is missing or empty");
  }

  const orderRows = pcwebReadSheetObjects_(orderSheet);
  const lineRows = pcwebReadSheetObjects_(orderLinesSheet);

  const header = orderRows.find(function(row) {
    return String(row.Order_ID || "").trim() === String(orderId).trim();
  });

  if (!header) {
    throw new Error("Order not found: " + orderId);
  }

  const lines = lineRows
    .filter(function(row) {
      return String(row.Order_ID || "").trim() === String(orderId).trim();
    })
    .map(function(row) {
      return {
        orderLineId: String(row.Order_Line_ID || "").trim(),
        productId: String(row.Product_ID || "").trim(),
        productName: String(row.Product_Name || "").trim(),
        quantity: Number(row.Quantity || 0),
        unitSellingPrice: Number(row.Unit_Selling_Price || 0),
        lineTotal: Number(row.Line_Total || 0),
        taxRate: Number(row.Tax_Rate || 0),
        taxAmount: Number(row.Tax_Amount || 0),
        netLineTotal: Number(row.Net_Line_Total || 0)
      };
    });

  return {
    success: true,
    order: {
      orderId: String(header.Order_ID || "").trim(),
      orderDate: pcwebFormatDateValue_(header.Order_Date),
      labId: String(header.Lab_ID || "").trim(),
      labName: String(header.Lab_Name || "").trim(),
      contactPerson: String(header.Contact_Person || "").trim(),
      mobileNumber: String(header.Mobile_Number || "").trim(),
      deliveryAddress: String(header.Delivery_Address || "").trim(),
      invoiceId: String(header.Invoice_ID || "").trim(),
      invoiceStatus: String(header.Invoice_Status || "").trim(),
      paymentStatus: String(header.Payment_Status || "").trim(),
      orderStatus: String(header.Order_Status || "").trim(),
      orderTotal: Number(header.Order_Total || header.Total_Amount || 0),
      notes: String(header.Notes || "").trim(),
      createdAt: pcwebFormatDateTimeValue_(header.Created_At)
    },
    lines: lines
  };
} 
function pcwebUpdateOrderStatus_(payload) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const orderId = String(payload.orderId || "").trim();
    const nextStatus = String(payload.orderStatus || "").trim();
    const note = String(payload.note || "").trim();

    if (!orderId) {
      throw new Error("Order ID is required");
    }

    if (!nextStatus) {
      throw new Error("Order status is required");
    }

    const allowedStatuses = ["Placed", "Processing", "Fulfilled", "Cancelled"];
    if (allowedStatuses.indexOf(nextStatus) === -1) {
      throw new Error("Invalid order status: " + nextStatus);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName("Orders");

    if (!sh || sh.getLastRow() < 2) {
      throw new Error("Orders sheet is missing or empty");
    }

    const values = sh.getDataRange().getValues();
    const headers = values[0].map(function(h) {
      return String(h || "").trim();
    });

    const orderIdIdx = headers.indexOf("Order_ID");
    const statusIdx = headers.indexOf("Order_Status");
    const notesIdx = headers.indexOf("Notes");
    const inventoryUpdatedIdx = headers.indexOf("Inventory_Updated");

    if (orderIdIdx === -1) {
      throw new Error("Orders sheet missing Order_ID column");
    }
    if (statusIdx === -1) {
      throw new Error("Orders sheet missing Order_Status column");
    }

    let foundRow = -1;
    let previousStatus = "";
    let inventoryUpdated = "No";

    for (let i = 1; i < values.length; i++) {
      const rowOrderId = String(values[i][orderIdIdx] || "").trim();
      if (rowOrderId === orderId) {
        foundRow = i + 1;
        previousStatus = String(values[i][statusIdx] || "").trim();
        inventoryUpdated =
          inventoryUpdatedIdx !== -1
            ? String(values[i][inventoryUpdatedIdx] || "No").trim()
            : "No";
        break;
      }
    }

    if (foundRow === -1) {
      throw new Error("Order not found: " + orderId);
    }

    // If moving to Fulfilled, deduct inventory once
    if (nextStatus === "Fulfilled" && inventoryUpdated !== "Yes") {
      pcwebApplyInventoryForFulfilledOrder_(orderId);

      if (inventoryUpdatedIdx !== -1) {
        sh.getRange(foundRow, inventoryUpdatedIdx + 1).setValue("Yes");
      }
    }

    sh.getRange(foundRow, statusIdx + 1).setValue(nextStatus);

    if (notesIdx !== -1 && note) {
      const existingNotes = String(
        sh.getRange(foundRow, notesIdx + 1).getValue() || ""
      ).trim();
      const timestamp = Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone() || "Asia/Kolkata",
        "yyyy-MM-dd HH:mm:ss"
      );
      const appendedNote =
        existingNotes
          ? existingNotes + "\n[" + timestamp + "] Status changed to " + nextStatus + " - " + note
          : "[" + timestamp + "] Status changed to " + nextStatus + " - " + note;

      sh.getRange(foundRow, notesIdx + 1).setValue(appendedNote);
    }

    SpreadsheetApp.flush();

    return {
      success: true,
      orderId: orderId,
      previousStatus: previousStatus,
      orderStatus: nextStatus,
      inventoryUpdated: nextStatus === "Fulfilled" ? "Yes" : inventoryUpdated,
      message: "Order status updated successfully"
    };
  } finally {
    lock.releaseLock();
  }
}
function pcwebGetCollectionDetails_(labId) {
  if (!labId) {
    throw new Error("Lab ID is required");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("AR_Credit_Control");

  if (!sh || sh.getLastRow() < 2) {
    return {
      success: true,
      collection: null
    };
  }

  const rows = pcwebReadSheetObjects_(sh);

  const row = rows.find(function(r) {
    return String(r.Lab_ID || "").trim() === String(labId).trim();
  });

  if (!row) {
    return {
      success: true,
      collection: null
    };
  }

  return {
    success: true,
    collection: {
      labId: String(row.Lab_ID || "").trim(),
      labName: String(row.Lab_Name || "").trim(),
      outstandingAmount: Number(row.Outstanding || 0),
      totalDelivered: Number(row.Total_Delivered || 0),
      totalPaid: Number(row.Total_Paid || 0),
      creditLimit: Number(row.Credit_Limit || 0),
      overdueDays: Number(row.Days_Overdue || 0),
      allowedOverdueDays: Number(row.Allowed_Overdue_Days || 0),
      creditHold: String(row.Credit_Hold || "").trim(),
      lastFollowUp: pcwebFormatDateValue_(row.Last_Follow_Up_Date),
      collectionsNotes: String(row.Collections_Notes || "").trim()
    }
  };
}

function pcwebGetCollectionHistory_(labId) {
  if (!labId) {
    throw new Error("Lab ID is required");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("Payments");

  if (!sh || sh.getLastRow() < 2) {
    return {
      success: true,
      history: []
    };
  }

  const rows = pcwebReadSheetObjects_(sh);

  const history = rows
    .filter(function(row) {
      return String(row.Lab_ID || "").trim() === String(labId).trim();
    })
    .map(function(row) {
      return {
        paymentId: String(row.Payment_ID || "").trim(),
        orderId: String(row.Order_ID || "").trim(),
        labId: String(row.Lab_ID || "").trim(),
        amountCollected: Number(row.Amount_Received || 0),
        paymentDate: pcwebFormatDateValue_(row.Payment_Date),
        paymentMode: String(row["Mode (Cash / UPI / Bank)"] || "").trim(),
        outstandingBalance: Number(row.Outstanding_Balance || 0),
        createdAt: pcwebFormatDateTimeValue_(row.Payment_Date)
      };
    })
    .sort(function(a, b) {
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });

  return {
    success: true,
    history: history
  };
}

function pcwebUpdateCollection_(payload) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const labId = String(payload.labId || "").trim();
    const amountCollected = Number(payload.amountCollected || 0);
    const paymentMode = String(payload.paymentMode || "").trim();
    const note = String(payload.note || "").trim();

    if (!labId) {
      throw new Error("Lab ID is required");
    }

    if (!amountCollected || amountCollected <= 0) {
      throw new Error("Collected amount must be greater than zero");
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const arSheet = ss.getSheetByName("AR_Credit_Control");
    const paymentsSheet = ss.getSheetByName("Payments");

    if (!arSheet || arSheet.getLastRow() < 2) {
      throw new Error("AR_Credit_Control sheet is missing or empty");
    }

    if (!paymentsSheet) {
      throw new Error("Payments sheet is missing");
    }

    const arValues = arSheet.getDataRange().getValues();
    const arHeaders = arValues[0].map(function(h) {
      return String(h || "").trim();
    });

    const labIdIdx = arHeaders.indexOf("Lab_ID");
    const outstandingIdx = arHeaders.indexOf("Outstanding");
    const totalPaidIdx = arHeaders.indexOf("Total_Paid");
    const lastFollowUpIdx = arHeaders.indexOf("Last_Follow_Up_Date");
    const collectionsNotesIdx = arHeaders.indexOf("Collections_Notes");
    const creditHoldIdx = arHeaders.indexOf("Credit_Hold");
    const labNameIdx = arHeaders.indexOf("Lab_Name");

    if (labIdIdx === -1) throw new Error("AR_Credit_Control missing Lab_ID");
    if (outstandingIdx === -1) throw new Error("AR_Credit_Control missing Outstanding");

    let targetRow = -1;
    let currentOutstanding = 0;
    let currentPaid = 0;
    let labName = "";

    for (let i = 1; i < arValues.length; i++) {
      if (String(arValues[i][labIdIdx] || "").trim() === labId) {
        targetRow = i + 1;
        currentOutstanding = Number(arValues[i][outstandingIdx] || 0);
        currentPaid = totalPaidIdx !== -1 ? Number(arValues[i][totalPaidIdx] || 0) : 0;
        labName = labNameIdx !== -1 ? String(arValues[i][labNameIdx] || "").trim() : "";
        break;
      }
    }

    if (targetRow === -1) {
      throw new Error("Lab not found in AR_Credit_Control: " + labId);
    }

    if (amountCollected > currentOutstanding) {
      throw new Error("Collected amount exceeds outstanding amount");
    }

    const newOutstanding = Math.max(currentOutstanding - amountCollected, 0);
    const newTotalPaid = currentPaid + amountCollected;

    arSheet.getRange(targetRow, outstandingIdx + 1).setValue(newOutstanding);

    if (totalPaidIdx !== -1) {
      arSheet.getRange(targetRow, totalPaidIdx + 1).setValue(newTotalPaid);
    }

    if (lastFollowUpIdx !== -1) {
      arSheet.getRange(targetRow, lastFollowUpIdx + 1).setValue(new Date());
    }

    if (collectionsNotesIdx !== -1 && note) {
      const existingNotes = String(
        arSheet.getRange(targetRow, collectionsNotesIdx + 1).getValue() || ""
      ).trim();
      const timestamp = Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone() || "Asia/Kolkata",
        "yyyy-MM-dd HH:mm:ss"
      );
      const appended =
        existingNotes
          ? existingNotes + "\n[" + timestamp + "] " + note
          : "[" + timestamp + "] " + note;

      arSheet.getRange(targetRow, collectionsNotesIdx + 1).setValue(appended);
    }

    if (creditHoldIdx !== -1) {
  arSheet.getRange(targetRow, creditHoldIdx + 1).setValue(
    newOutstanding > 0 ? "OK" : "OK"
  );
}

    const paymentId = pcwebGenerateNextId_("PAY", paymentsSheet, "Payment_ID");
    const paymentDate = pcwebFormatDateOnly_(new Date());

    pcwebAppendObjectRow_(paymentsSheet, {
      Payment_ID: paymentId,
      Order_ID: String(payload.orderId || "").trim(),
      Lab_ID: labId,
      Amount_Received: amountCollected,
      Payment_Date: paymentDate,
      "Mode (Cash / UPI / Bank)": paymentMode,
      Outstanding_Balance: newOutstanding
    });

    SpreadsheetApp.flush();

    return {
      success: true,
      paymentId: paymentId,
      labId: labId,
      labName: labName,
      previousOutstanding: currentOutstanding,
      newOutstanding: newOutstanding,
      message: "Collection updated successfully"
    };
  } finally {
    lock.releaseLock();
  }
}
function pcwebGetOutstandingByLabId_(labId) {
  if (!labId) return 0;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("AR_Credit_Control");
  if (!sh || sh.getLastRow() < 2) return 0;

  const rows = pcwebReadSheetObjects_(sh);
  const row = rows.find(function(r) {
    return String(r.Lab_ID || "").trim() === String(labId).trim();
  });

  return row ? Number(row.Outstanding || 0) : 0;
}
function pcwebApplyInventoryForFulfilledOrder_(orderId) {
  if (!orderId) {
    throw new Error("Order ID is required for inventory update");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const orderLinesSheet = ss.getSheetByName("Order_Lines");
  const inventorySheet = ss.getSheetByName("Inventory");

  if (!orderLinesSheet || orderLinesSheet.getLastRow() < 2) {
    throw new Error("Order_Lines sheet is missing or empty");
  }

  if (!inventorySheet || inventorySheet.getLastRow() < 2) {
    throw new Error("Inventory sheet is missing or empty");
  }

  const lineRows = pcwebReadSheetObjects_(orderLinesSheet);
  const orderLines = lineRows.filter(function(row) {
    return String(row.Order_ID || "").trim() === String(orderId).trim();
  });

  if (!orderLines.length) {
    throw new Error("No order lines found for order: " + orderId);
  }

  const inventoryValues = inventorySheet.getDataRange().getValues();
  const headers = inventoryValues[0].map(function(h) {
    return String(h || "").trim();
  });

  const productIdIdx = headers.indexOf("Product_ID");
  const currentStockIdx = headers.indexOf("Current_Stock");

  if (productIdIdx === -1) {
    throw new Error("Inventory sheet missing Product_ID column");
  }
  if (currentStockIdx === -1) {
    throw new Error("Inventory sheet missing Current_Stock column");
  }

  const inventoryRowMap = {};
  for (let i = 1; i < inventoryValues.length; i++) {
    const productId = String(inventoryValues[i][productIdIdx] || "").trim();
    if (productId) {
      inventoryRowMap[productId] = {
        rowNumber: i + 1,
        currentStock: Number(inventoryValues[i][currentStockIdx] || 0)
      };
    }
  }

  // Validate first
  orderLines.forEach(function(line) {
    const productId = String(line.Product_ID || "").trim();
    const qty = Number(line.Quantity || 0);

    if (!productId) {
      throw new Error("Order line missing Product_ID");
    }

    if (!inventoryRowMap[productId]) {
      throw new Error("Inventory row not found for product: " + productId);
    }

    if (qty <= 0) {
      throw new Error("Invalid quantity for product: " + productId);
    }

    if (inventoryRowMap[productId].currentStock < qty) {
      throw new Error(
        "Insufficient inventory for product " +
          productId +
          ". Available: " +
          inventoryRowMap[productId].currentStock +
          ", Required: " +
          qty
      );
    }
  });

  // Apply deductions
  orderLines.forEach(function(line) {
    const productId = String(line.Product_ID || "").trim();
    const qty = Number(line.Quantity || 0);
    const target = inventoryRowMap[productId];
    const newStock = target.currentStock - qty;

    inventorySheet
      .getRange(target.rowNumber, currentStockIdx + 1)
      .setValue(newStock);

    target.currentStock = newStock;
  });

  SpreadsheetApp.flush();
}
function pcDebugOutstanding() {
  Logger.log(pcwebGetOutstandingByLabId_("LAB_001"));
}
function pcwebGetReorderCandidates_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("Inventory");

  if (!sh || sh.getLastRow() < 2) {
    return {
      success: true,
      candidates: []
    };
  }

  const rows = pcwebReadSheetObjects_(sh);

  const candidates = rows
    .map(function(row) {
      const currentStock = Number(row.Current_Stock || 0);
      const minStock = Number(row.Min_Stock || 0);
      const reorderQty = Number(row.Reorder_Qty || 0);
      const productId = String(row.Product_ID || "").trim();
      const productName = String(row.Product_Name || "").trim();
      const reorderStatus = String(row.Reorder_Status || "").trim();

      const stockHealth =
        currentStock <= 0 ? "Critical" :
        currentStock <= minStock ? "Reorder" :
        "Healthy";

      const suggestedQty =
        reorderQty > 0
          ? reorderQty
          : Math.max(minStock - currentStock, 0);

      return {
        productId: productId,
        productName: productName,
        currentStock: currentStock,
        minStock: minStock,
        reorderQty: reorderQty,
        reorderStatus: reorderStatus,
        stockHealth: stockHealth,
        suggestedQty: suggestedQty
      };
    })
    .filter(function(item) {
      return item.productId && item.stockHealth !== "Healthy";
    })
    .sort(function(a, b) {
      const rank = { Critical: 1, Reorder: 2, Healthy: 3 };
      return (rank[a.stockHealth] || 99) - (rank[b.stockHealth] || 99);
    });

  return {
    success: true,
    candidates: candidates
  };
}

function pcwebGetPurchaseOrders_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("Purchase_Orders");

  if (!sh || sh.getLastRow() < 2) {
    return {
      success: true,
      purchaseOrders: []
    };
  }

  const rows = pcwebReadSheetObjects_(sh);

  const purchaseOrders = rows
    .filter(function(row) {
      return String(row.PO_ID || "").trim() !== "";
    })
    .map(function(row) {
      return {
        poId: String(row.PO_ID || "").trim(),
        poDate: pcwebFormatDateValue_(row.PO_Date),
        productId: String(row.Product_ID || "").trim(),
        productName: String(row.Product_Name || "").trim(),
        quantity: Number(row.Quantity || 0),
        unitCost: Number(row.Unit_Cost || 0),
        totalCost: Number(row.Total_Cost || 0),
        supplier: String(row.Supplier || "").trim(),
        status: String(row.Status || "Draft").trim(),
        createdAt: pcwebFormatDateTimeValue_(row.Created_At)
      };
    })
    .sort(function(a, b) {
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });

  return {
    success: true,
    purchaseOrders: purchaseOrders
  };
}

function pcwebCreatePurchaseOrder_(payload) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const productId = String(payload.productId || "").trim();
    const productName = String(payload.productName || "").trim();
    const quantity = Number(payload.quantity || 0);
    const unitCost = Number(payload.unitCost || 0);
    const supplier = String(payload.supplier || "").trim();
    const status = String(payload.status || "Draft").trim();

    if (!productId) throw new Error("Product ID is required");
    if (!productName) throw new Error("Product name is required");
    if (!quantity || quantity <= 0) throw new Error("Quantity must be greater than zero");
    if (unitCost < 0) throw new Error("Unit cost cannot be negative");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName("Purchase_Orders");
    if (!sh) throw new Error("Purchase_Orders sheet not found");

    const poId = pcwebGenerateNextId_("PO", sh, "PO_ID");
    const poDate = pcwebFormatDateOnly_(new Date());
    const createdAt = pcwebFormatDateTimeValue_(new Date());
    const totalCost = quantity * unitCost;

    pcwebAppendObjectRow_(sh, {
      PO_ID: poId,
      PO_Date: poDate,
      Product_ID: productId,
      Product_Name: productName,
      Quantity: quantity,
      Unit_Cost: unitCost,
      Total_Cost: totalCost,
      Supplier: supplier,
      Status: status,
      Created_At: createdAt
    });

    SpreadsheetApp.flush();

    return {
      success: true,
      poId: poId,
      message: "Purchase order created successfully"
    };
  } finally {
    lock.releaseLock();
  }
}

function pcwebReceivePurchaseOrder_(payload) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    const poId = String(payload.poId || "").trim();
    const receivedQty = Number(payload.receivedQty || 0);
    const grnNotes = String(payload.grnNotes || "").trim();

    if (!poId) {
      throw new Error("PO ID is required");
    }

    if (!receivedQty || receivedQty <= 0) {
      throw new Error("Received quantity must be greater than zero");
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const poSheet = ss.getSheetByName("Purchase_Orders");

    if (!poSheet || poSheet.getLastRow() < 2) {
      throw new Error("Purchase_Orders sheet is missing or empty");
    }

    const values = poSheet.getDataRange().getValues();
    const headers = values[0].map(function(h) {
      return String(h || "").trim();
    });

    const poIdIdx = headers.indexOf("PO_ID");
    const productIdIdx = headers.indexOf("Product_ID");
    const quantityIdx = headers.indexOf("Quantity");
    const statusIdx = headers.indexOf("Status");
    const receivedQtyIdx = headers.indexOf("Received_Qty");
    const receivedDateIdx = headers.indexOf("Received_Date");
    const grnNotesIdx = headers.indexOf("GRN_Notes");
    const inventoryUpdatedIdx = headers.indexOf("Inventory_Updated");

    if (poIdIdx === -1) throw new Error("Purchase_Orders missing PO_ID");
    if (productIdIdx === -1) throw new Error("Purchase_Orders missing Product_ID");
    if (quantityIdx === -1) throw new Error("Purchase_Orders missing Quantity");
    if (statusIdx === -1) throw new Error("Purchase_Orders missing Status");

    let foundRow = -1;
    let productId = "";
    let orderedQty = 0;
    let currentStatus = "";
    let inventoryUpdated = "No";

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][poIdIdx] || "").trim() === poId) {
        foundRow = i + 1;
        productId = String(values[i][productIdIdx] || "").trim();
        orderedQty = Number(values[i][quantityIdx] || 0);
        currentStatus = String(values[i][statusIdx] || "").trim();
        inventoryUpdated =
          inventoryUpdatedIdx !== -1
            ? String(values[i][inventoryUpdatedIdx] || "No").trim()
            : "No";
        break;
      }
    }

    if (foundRow === -1) {
      throw new Error("Purchase order not found: " + poId);
    }

    if (!productId) {
      throw new Error("Purchase order missing Product_ID");
    }

    if (inventoryUpdated === "Yes") {
      throw new Error("Inventory already updated for this purchase order");
    }

    if (receivedQty > orderedQty) {
      throw new Error("Received quantity cannot exceed ordered quantity");
    }

    pcwebApplyInventoryReceipt_(productId, receivedQty);

    poSheet.getRange(foundRow, statusIdx + 1).setValue("Received");

    if (receivedQtyIdx !== -1) {
      poSheet.getRange(foundRow, receivedQtyIdx + 1).setValue(receivedQty);
    }

    if (receivedDateIdx !== -1) {
      poSheet.getRange(foundRow, receivedDateIdx + 1).setValue(new Date());
    }

    if (grnNotesIdx !== -1 && grnNotes) {
      poSheet.getRange(foundRow, grnNotesIdx + 1).setValue(grnNotes);
    }

    if (inventoryUpdatedIdx !== -1) {
      poSheet.getRange(foundRow, inventoryUpdatedIdx + 1).setValue("Yes");
    }

    SpreadsheetApp.flush();

    return {
      success: true,
      poId: poId,
      productId: productId,
      receivedQty: receivedQty,
      previousStatus: currentStatus,
      status: "Received",
      message: "Purchase order received and inventory updated successfully"
    };
  } finally {
    lock.releaseLock();
  }
}
function pcwebApplyInventoryReceipt_(productId, receivedQty) {
  if (!productId) {
    throw new Error("Product ID is required for inventory receipt");
  }

  if (!receivedQty || receivedQty <= 0) {
    throw new Error("Received quantity must be greater than zero");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const inventorySheet = ss.getSheetByName("Inventory");

  if (!inventorySheet || inventorySheet.getLastRow() < 2) {
    throw new Error("Inventory sheet is missing or empty");
  }

  const values = inventorySheet.getDataRange().getValues();
  const headers = values[0].map(function(h) {
    return String(h || "").trim();
  });

  const productIdIdx = headers.indexOf("Product_ID");
  const currentStockIdx = headers.indexOf("Current_Stock");

  if (productIdIdx === -1) throw new Error("Inventory missing Product_ID");
  if (currentStockIdx === -1) throw new Error("Inventory missing Current_Stock");

  let foundRow = -1;
  let currentStock = 0;

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][productIdIdx] || "").trim() === String(productId).trim()) {
      foundRow = i + 1;
      currentStock = Number(values[i][currentStockIdx] || 0);
      break;
    }
  }

  if (foundRow === -1) {
    throw new Error("Inventory product not found: " + productId);
  }

  const newStock = currentStock + receivedQty;
  inventorySheet.getRange(foundRow, currentStockIdx + 1).setValue(newStock);

  SpreadsheetApp.flush();
}

function pcwebGetSmartReorder_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const inventorySheet = ss.getSheetByName("Inventory");
  const orderLinesSheet = ss.getSheetByName("Order_Lines");

  if (!inventorySheet || inventorySheet.getLastRow() < 2) {
    return {
      success: true,
      items: []
    };
  }

  const inventoryRows = pcwebReadSheetObjects_(inventorySheet);
  const orderLineRows =
    orderLinesSheet && orderLinesSheet.getLastRow() >= 2
      ? pcwebReadSheetObjects_(orderLinesSheet)
      : [];

  const salesByProduct = {};

  orderLineRows.forEach(function(row) {
    const productId = String(row.Product_ID || "").trim();
    const qty = Number(row.Quantity || 0);

    if (!productId) return;
    salesByProduct[productId] = (salesByProduct[productId] || 0) + qty;
  });

  const items = inventoryRows
    .map(function(row) {
      const productId = String(row.Product_ID || "").trim();
      const productName = String(row.Product_Name || "").trim();
      const currentStock = Number(row.Current_Stock || 0);
      const minStock = Number(row.Min_Stock || 0);
      const reorderQty = Number(row.Reorder_Qty || 0);

      const totalSoldLast30Days = Number(salesByProduct[productId] || 0);
      const dailyConsumption = totalSoldLast30Days / 30;
      const daysLeft =
        dailyConsumption > 0 ? currentStock / dailyConsumption : 999;

      let urgency = "SAFE";
      if (daysLeft < 5) urgency = "CRITICAL";
      else if (daysLeft < 10) urgency = "WARNING";

      const suggestedOrderQty =
        reorderQty > 0
          ? reorderQty
          : Math.max(Math.ceil(dailyConsumption * 15 - currentStock), 0);

      return {
        productId: productId,
        productName: productName,
        currentStock: currentStock,
        minStock: minStock,
        totalSoldLast30Days: totalSoldLast30Days,
        dailyConsumption: Number(dailyConsumption.toFixed(2)),
        daysLeft: Number(daysLeft.toFixed(1)),
        urgency: urgency,
        suggestedOrderQty: suggestedOrderQty
      };
    })
    .filter(function(item) {
      return item.productId;
    })
    .sort(function(a, b) {
      const rank = { CRITICAL: 1, WARNING: 2, SAFE: 3 };
      return (rank[a.urgency] || 99) - (rank[b.urgency] || 99);
    });

  return {
    success: true,
    items: items
  };
}