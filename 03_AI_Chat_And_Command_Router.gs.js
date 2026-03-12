/************************************************************
 * 03_AI_Chat_And_Command_Router.gs
 ************************************************************/

function pcaiAskPrimeCareAI(question) {
  const commandResult = pcaiHandlePrimeCareCommand_(question);
  if (commandResult) return commandResult;

  const ss = pcaiGetSS_();
  const availableSheets = ss.getSheets().map(s => s.getName());
  const selectedSheets = pcaiPickRelevantSheets_(question, availableSheets);
  const snapshot = pcaiBuildSnapshotSelectedSheets_(selectedSheets);

  const systemMsg = pcaiBuildSystemPrompt_();
  const userMsg =
    "BUSINESS GOAL:\n" + PCAI_CONFIG.COMPANY_GOAL +
    "\n\nAVAILABLE TABS:\n" + availableSheets.join(", ") +
    "\n\nSELECTED TABS:\n" + selectedSheets.join(", ") +
    "\n\nSNAPSHOT(JSON):\n" + snapshot +
    "\n\nQUESTION:\n" + question;

  return pcaiCallOpenAI_(systemMsg, userMsg);
}

function pcaiBuildSystemPrompt_() {
  return `
You are PrimeCare AI, an elite operations copilot for a diagnostics consumables distribution business.

Your role:
- Think like a COO, systems architect, finance controller, inventory planner, receivables controller, and business scaler.
- Help the business run cleanly, avoid errors, improve controls, and scale toward ₹1Cr/month.
- Give sharp, direct, commercially useful answers.

Rules:
- The spreadsheet snapshot is the data source.
- Do not give generic filler.
- Focus on reliability, cash, stock, receivables, alerts, controls, and scale.

When relevant, include:
- risks
- missing controls
- validations
- automation opportunities
- dashboard recommendations
- data-quality issues
- business actions

Format:
- direct answer first
- compact tables only if useful
- short action list at the end
`;
}

function pcaiPickRelevantSheets_(question, availableSheets) {
  const q = String(question || "").toLowerCase();
  const picks = [];

  if (pcaiContainsAny_(q, ["credit", "limit", "outstanding", "receivable", "overdue", "hold"])) {
    picks.push(PCAI_SHEETS.AR, PCAI_SHEETS.ORDERS);
  }
  if (pcaiContainsAny_(q, ["reorder", "stock", "inventory", "min stock", "shortage"])) {
    picks.push(PCAI_SHEETS.INVENTORY, PCAI_SHEETS.PRODUCT_MASTER, PCAI_SHEETS.ORDERS);
  }
  if (pcaiContainsAny_(q, ["profit", "revenue", "sales", "margin", "top labs", "top products"])) {
    picks.push(PCAI_SHEETS.ORDERS, PCAI_SHEETS.AR, PCAI_SHEETS.PRODUCT_MASTER);
  }
  if (pcaiContainsAny_(q, ["audit", "issue", "risk", "validation", "improve", "dashboard", "ops"])) {
    return availableSheets;
  }

  const filtered = pcaiUnique_(picks).filter(name => availableSheets.indexOf(name) !== -1);
  return filtered.length ? filtered : availableSheets;
}

function pcaiBuildSnapshotSelectedSheets_(sheetNames) {
  const ss = pcaiGetSS_();
  const out = { sheets: {} };

  sheetNames.forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) return;

    const values = sh.getDataRange().getValues();
    const limited = values.slice(0, Math.min(values.length, PCAI_CONFIG.MAX_ROWS_PER_SHEET));
    const headers = limited.length ? limited[0].map(v => String(v || "").trim()) : [];
    const data = [];

    for (let r = 1; r < limited.length; r++) {
      const row = limited[r];
      const obj = {};
      let hasValue = false;

      for (let c = 0; c < headers.length; c++) {
        const key = headers[c] || ("COL_" + (c + 1));
        const val = pcaiNormalizeCell_(row[c]);
        obj[key] = val;
        if (val !== "" && val !== null) hasValue = true;
      }

      if (hasValue) data.push(obj);
    }

    out.sheets[name] = {
      rows_total: values.length,
      columns: headers,
      data: data
    };
  });

  let str = JSON.stringify(out);
  if (str.length > PCAI_CONFIG.MAX_CHARS) {
    const trimmed = { sheets: {} };
    Object.keys(out.sheets).forEach(name => {
      trimmed.sheets[name] = {
        rows_total: out.sheets[name].rows_total,
        columns: out.sheets[name].columns,
        data: out.sheets[name].data.slice(0, 200)
      };
    });
    str = JSON.stringify(trimmed);
  }

  return str;
}

function pcaiHandlePrimeCareCommand_(question) {
  const q = String(question || "").trim();

  if (/^give me today's owner briefing$/i.test(q)) return pcaiGetTodaysOwnerBriefing();
  if (/^what are the top 3 issues right now$/i.test(q)) return pcaiGetTop3IssuesRightNow();
  if (/^what should i chase before noon$/i.test(q)) return pcaiGetWhatShouldIChaseBeforeNoon();
  if (/^what is blocking scale today$/i.test(q)) return pcaiGetWhatIsBlockingScaleToday();
  if (/^show top 5 labs to follow up today$/i.test(q)) return pcaiGetTopLabsToFollowUpToday();
  if (/^show top 5 reorder products$/i.test(q)) return pcaiGetTopReorderProducts();
  if (/^what is the biggest risk today$/i.test(q)) return pcaiGetBiggestRiskToday();
  if (/^what should i do first today$/i.test(q)) return pcaiGetWhatShouldIDoFirstToday();
  if (/^give me owner assistant view$/i.test(q)) return pcaiGetOwnerAssistantView();
  if (/^give me operations assistant view$/i.test(q)) return pcaiGetOperationsAssistantView();
  if (/^give me collections assistant view$/i.test(q)) return pcaiGetCollectionsAssistantView();
  if (/^give me inventory assistant view$/i.test(q)) return pcaiGetInventoryAssistantView();

  if (/^run system health$/i.test(q)) return pcaiRunSystemHealthEngine();
  if (/^run system remediation$/i.test(q)) return pcaiRunSystemRemediation();
  if (/^fix credit hold logic$/i.test(q)) return pcaiFixCreditHoldLogic();
  if (/^fix reorder logic$/i.test(q)) return pcaiFixReorderLogic();
  if (/^fill missing outstanding$/i.test(q)) return pcaiFillMissingOutstanding();

  if (/^update alerts$/i.test(q)) return pcaiUpdateAlertsEngine();
  if (/^update risk predictions$/i.test(q)) return pcaiUpdateRiskPredictionEngine();
  if (/^update recommendations$/i.test(q)) return pcaiUpdateAIRecommendations();
  if (/^update executive dashboard$/i.test(q)) return pcaiUpdateExecutiveCommandDashboard();
  if (/^update forecasts$/i.test(q)) return pcaiUpdateForecastingLayer();
  if (/^update growth engine$/i.test(q)) return pcaiUpdateGrowthEngine();

  if (/^setup sandbox$/i.test(q)) return pcaiSetupSandboxSimulationEngine();
  if (/^setup scenario benchmarks$/i.test(q)) return pcaiSetupScenarioBenchmarks();
  if (/^run all sandbox scenarios$/i.test(q)) return pcaiRunAllSandboxScenarios();
  if (/^run simulation high overdue labs$/i.test(q)) return pcaiRunSandboxScenarioByName("high overdue labs");
  if (/^run simulation stock out stress$/i.test(q)) return pcaiRunSandboxScenarioByName("stock out stress");
  if (/^run simulation month end load$/i.test(q)) return pcaiRunSandboxScenarioByName("month end load");
  if (/^run simulation combined stress scenario$/i.test(q)) return pcaiRunSandboxScenarioByName("combined stress scenario");

  return null;
}