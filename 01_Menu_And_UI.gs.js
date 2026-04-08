/************************************************************
 * 01_Menu_And_UI.gs
 ************************************************************/

function onOpen() {
  pcBuildPrimeCareMenu_();
}

function pcBuildPrimeCareMenu_() {
  const ui = SpreadsheetApp.getUi();
  const menu = ui.createMenu("PrimeCare");

  menu
  .addItem("Stock Dashboard", "openStockDashboard")
.addItem("Agent Visit Updates", "openAgentUpdatesPage")
    .addItem("Open Order Form", "openOrderForm")
    .addItem("Open AI Sidebar", "pcaiOpenSidebar")
    .addItem("Open Stock Dashboard", "openStockDashboard")
.addItem("Open Agent Updates", "openAgentUpdatesPage")
    .addSeparator();

  menu
    .addItem("Setup / Repair Structure", "runPrimeCareSetup")
    .addItem("PrimeCare Repair", "runPrimeCareRepair")
    .addItem("Repair Orders Sheet", "runRepairOrdersSheetHeaders")
    .addItem("Repair Raw Response Sheet", "runRepairRawResponseSheet")
    .addItem("Seed Settings", "runSeedSettings")
    .addItem("Fill Missing Order Defaults", "runFillMissingOrderDefaults")
    .addSeparator();

  menu
    .addItem("Set / Update API Key", "pcaiSetOpenAIKey")
    .addSeparator();

  menu
    .addItem("Create / Refresh Dashboard", "pcaiCreateDashboardTab")
    .addItem("Run Business Audit", "pcaiRunBusinessAudit")
    .addItem("Write Improvement Advice", "pcaiWriteImprovementAdvice")
    .addItem("Apply Basic Validations", "pcaiApplyBasicValidations")
    .addSeparator();

  menu
    .addItem("Run System Health", "pcaiRunSystemHealthEngine")
    .addItem("Run System Remediation", "pcaiRunSystemRemediation")
    .addItem("Update System Status", "pcaiUpdateSystemStatusDashboard")
    .addItem("Update Operations Dashboard", "pcaiUpdateOperationsDashboard")
    .addItem("Update Risk Predictions", "pcaiUpdateRiskPredictionEngine")
    .addItem("Update Alerts", "pcaiUpdateAlertsEngine")
    .addItem("Update AI Recommendations", "pcaiUpdateAIRecommendations")
    .addItem("Update Executive Dashboard", "pcaiUpdateExecutiveCommandDashboard")
    .addItem("Update Forecasts", "pcaiUpdateForecastingLayer")
    .addItem("Update Growth Engine", "pcaiUpdateGrowthEngine")
    .addSeparator();

  menu
    .addItem("Export Daily Summary", "pcaiExportDailySummary")
    .addItem("Generate Weekly Business Review", "pcaiGenerateWeeklyBusinessReview")
    .addItem("Run Daily Monitoring Now", "pcaiRunDailyMonitoringLoop")
    .addSeparator();

  menu
    .addItem("Owner Briefing", "pcaiGetTodaysOwnerBriefing")
    .addItem("Top 3 Issues", "pcaiGetTop3IssuesRightNow")
    .addItem("Before Noon Priorities", "pcaiGetWhatShouldIChaseBeforeNoon")
    .addItem("Scale Blockers", "pcaiGetWhatIsBlockingScaleToday")
    .addSeparator();

  menu
    .addItem("Setup Sandbox Simulation", "pcaiSetupSandboxSimulationEngine")
    .addItem("Setup Scenario Benchmarks", "pcaiSetupScenarioBenchmarks")
    .addItem("Run: High Overdue Labs", "pcaiMenuRunHighOverdueLabs")
    .addItem("Run: Stock Out Stress", "pcaiMenuRunStockOutStress")
    .addItem("Run: Month End Load", "pcaiMenuRunMonthEndLoad")
    .addItem("Run: Combined Stress Scenario", "pcaiMenuRunCombinedStressScenario")
    .addItem("Mark Order Delivered", "pcPromptMarkOrderDelivered")
    .addItem("Run All Sandbox Scenarios", "pcaiRunAllSandboxScenarios")
    .addSeparator();

  menu
    .addItem("Reset All Data", "pcResetAllData")
    .addSeparator();

  menu
    .addItem("Open Navigator", "pcShowWorkbookNavigator")
    .addItem("Organize Tabs", "pcOrganizeMasterWorkbookTabs")
    .addItem("Save This as Legacy Workbook", "pcSetLegacyWorkbookId")
    .addItem("Organize + Color Tabs", "pcOrganizeAndColorTabs")
    .addSeparator();

  menu
    .addItem("Clear AI Workbook Noise", "pcClearAIWorkbookNoise")
    .addItem("Hard Reset AI Outputs", "pcHardResetAIWorkbookOutputs")
    .addItem("Hard Reset Sandbox Outputs", "pcHardResetSandboxWorkbookOutputs")
    .addItem("Apply Operational Validations", "pcApplyOperationalValidations")
  .addItem("Mark Unprocessed Rows NEW", "runMarkUnprocessedRowsNew")
.addItem("Requeue Error Rows", "runRequeueErrorRows")
.addItem("Process Form Queue", "runProcessFormQueue")
    .addToUi();
}

function pcaiOpenSidebar() {
  const html = HtmlService
    .createHtmlOutput(pcaiGetSidebarHtml_())
    .setTitle("PrimeCare AI");
  SpreadsheetApp.getUi().showSidebar(html);
}

function pcaiListTabsForUI() {
  const tabs = SpreadsheetApp.getActiveSpreadsheet()
    .getSheets()
    .map(s => s.getName());

  return "Available tabs:\n- " + tabs.join("\n- ");
}

function pcaiGetSidebarHtml_() {
  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    :root{
      --bg:#0b1220;
      --panel:#0f1a2e;
      --border:rgba(255,255,255,.10);
      --text:#eaf0ff;
      --muted:#9fb0d0;
      --accent:#66e3ff;
      --accent2:#a78bfa;
      --shadow:0 10px 30px rgba(0,0,0,.28);
    }

    *{ box-sizing:border-box; }

    html,body{
      height:100%;
      margin:0;
      padding:0;
      background:var(--bg);
      color:var(--text);
      font-family:ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    }

    body{ overflow:hidden; }

    .app{
      height:100vh;
      display:flex;
      flex-direction:column;
      gap:10px;
      padding:10px;
      background:
        radial-gradient(circle at top right, rgba(102,227,255,.08), transparent 28%),
        radial-gradient(circle at bottom left, rgba(167,139,250,.08), transparent 30%),
        var(--bg);
    }

    .header{
      border:1px solid var(--border);
      border-radius:16px;
      padding:12px;
      background:linear-gradient(135deg, rgba(102,227,255,.10), rgba(167,139,250,.10));
      box-shadow:var(--shadow);
    }

    .hrow{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
    }

    .brand{
      display:flex;
      align-items:center;
      gap:10px;
    }

    .logo{
      width:38px;
      height:38px;
      border-radius:12px;
      display:grid;
      place-items:center;
      background:linear-gradient(135deg, var(--accent), var(--accent2));
      color:#08101e;
      font-weight:900;
      font-size:14px;
    }

    .title{
      font-size:14px;
      font-weight:900;
    }

    .subtitle{
      margin-top:3px;
      font-size:11px;
      color:var(--muted);
    }

    .topbtns{
      display:flex;
      gap:6px;
    }

    .tbtn,.miniChip,.copy,.ghost{
      border:1px solid var(--border);
      background:rgba(255,255,255,.06);
      color:var(--text);
    }

    .tbtn,.miniChip,.copy{
      border-radius:10px;
      padding:8px 9px;
      font-size:11px;
      cursor:pointer;
    }

    .quickGrid{
      margin-top:10px;
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:8px;
    }

    .chip{
      border:1px solid var(--border);
      background:rgba(255,255,255,.06);
      color:var(--text);
      border-radius:12px;
      padding:10px 11px;
      font-size:12px;
      cursor:pointer;
      min-height:54px;
      display:flex;
      flex-direction:column;
      justify-content:center;
    }

    .chip b{ color:var(--accent); }

    .statusbar{
      margin-top:10px;
      display:flex;
      gap:8px;
      flex-wrap:wrap;
    }

    .pill{
      border:1px solid var(--border);
      background:rgba(255,255,255,.05);
      border-radius:999px;
      padding:6px 10px;
      font-size:10px;
      color:var(--muted);
    }

    .chatwrap{
      flex:1 1 auto;
      min-height:0;
      display:flex;
      flex-direction:column;
      border:1px solid var(--border);
      border-radius:16px;
      overflow:hidden;
      background:rgba(255,255,255,.03);
      box-shadow:var(--shadow);
    }

    .chat{
      flex:1 1 auto;
      min-height:0;
      overflow:auto;
      padding:12px;
      display:flex;
      flex-direction:column;
      gap:10px;
    }

    .msg{
      max-width:92%;
      border:1px solid var(--border);
      border-radius:14px;
      padding:10px 11px;
      font-size:12px;
      line-height:1.45;
      white-space:pre-wrap;
      word-break:break-word;
    }

    .user{
      align-self:flex-end;
      background:rgba(102,227,255,.10);
    }

    .ai{
      align-self:flex-start;
      background:rgba(15,26,46,.78);
    }

    .system{
      align-self:center;
      background:rgba(255,255,255,.05);
      color:var(--muted);
      font-size:11px;
      max-width:100%;
    }

    .meta{
      margin-top:7px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
      color:var(--muted);
      font-size:10px;
    }

    .chatwrap .composer{
      border-top:1px solid var(--border);
      background:rgba(11,18,32,.94);
      padding:10px;
      display:flex;
      flex-direction:column;
      gap:8px;
    }

    .textareaWrap{ position:relative; }

    textarea{
      width:100%;
      min-height:76px;
      max-height:180px;
      resize:none;
      border-radius:14px;
      border:1px solid var(--border);
      background:rgba(255,255,255,.04);
      color:var(--text);
      padding:12px 12px 32px 12px;
      font-size:12px;
      outline:none;
    }

    .kbd{
      position:absolute;
      right:10px;
      bottom:8px;
      font-size:10px;
      color:var(--muted);
      border:1px solid var(--border);
      border-radius:999px;
      padding:2px 6px;
      background:rgba(255,255,255,.04);
    }

    .row{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:8px;
    }

    .hint{
      font-size:10px;
      color:var(--muted);
      line-height:1.3;
      max-width:60%;
    }

    .btns{
      display:flex;
      gap:8px;
    }

    .btn{
      border:none;
      border-radius:12px;
      padding:9px 12px;
      font-weight:900;
      font-size:12px;
      cursor:pointer;
    }

    .send{
      color:#08101e;
      background:linear-gradient(135deg, var(--accent), var(--accent2));
    }

    .footerMini{
      display:flex;
      gap:6px;
      flex-wrap:wrap;
    }

    .miniChip{
      border-radius:999px;
      padding:5px 8px;
      font-size:10px;
    }

    .toast{
      position:fixed;
      left:50%;
      transform:translateX(-50%);
      bottom:14px;
      background:rgba(15,26,46,.96);
      border:1px solid var(--border);
      color:var(--text);
      border-radius:12px;
      padding:8px 10px;
      font-size:11px;
      display:none;
      max-width:92%;
    }
  </style>
</head>
<body>
  <div class="app">
    <div class="header">
      <div class="hrow">
        <div class="brand">
          <div class="logo">PC</div>
          <div>
            <div class="title">PrimeCare AI</div>
            <div class="subtitle">Ops Copilot • Audit • Risk • Forecast • Scale</div>
          </div>
        </div>
        <div class="topbtns">
          <div class="tbtn" onclick="listTabs()">Tabs</div>
          <div class="tbtn" onclick="createDashboard()">Dash</div>
        </div>
      </div>

      <div class="quickGrid">
        <div class="chip" onclick="quick('What are the top 3 issues right now')"><b>Top 3</b><span>Current issues</span></div>
        <div class="chip" onclick="quick('What should I chase before noon')"><b>Priorities</b><span>Before noon</span></div>
        <div class="chip" onclick="quick('What is blocking scale today')"><b>Scale</b><span>Blockers today</span></div>
        <div class="chip" onclick="quick('Give me today\\'s owner briefing')"><b>Owner</b><span>Briefing</span></div>
        <div class="chip" onclick="quick('Show top 5 labs to follow up today')"><b>Collections</b><span>Labs to chase</span></div>
        <div class="chip" onclick="quick('Show top 5 reorder products')"><b>Inventory</b><span>Reorder now</span></div>
      </div>

      <div class="statusbar">
        <div class="pill">Google Sheets copilot</div>
        <div class="pill">OpenAI connected</div>
        <div class="pill">Ctrl/Cmd + Enter to send</div>
      </div>
    </div>

    <div class="chatwrap">
      <div id="chat" class="chat">
        <div class="msg system">PrimeCare AI is ready.

Try:
• What are the top 3 issues right now
• What should I chase before noon
• What is blocking scale today
• Show top 5 reorder products</div>
      </div>

      <div class="composer">
        <div class="textareaWrap">
          <textarea id="q" placeholder="Ask PrimeCare AI…"></textarea>
          <div class="kbd">⌘/Ctrl + Enter</div>
        </div>

        <div class="row">
          <div class="hint">
            Ask for risks, recommendations, dashboard updates, owner briefing, collections priorities, reorder urgency, forecasts, and growth blockers.
          </div>
          <div class="btns">
            <button class="btn ghost" onclick="clearChat()">Clear</button>
            <button class="btn send" onclick="ask()">Send</button>
          </div>
        </div>

        <div class="footerMini">
          <div class="miniChip" onclick="quick('Update alerts')">Update alerts</div>
          <div class="miniChip" onclick="quick('Update risk predictions')">Update risks</div>
          <div class="miniChip" onclick="quick('Update recommendations')">Update recommendations</div>
          <div class="miniChip" onclick="quick('Update executive dashboard')">Update exec dashboard</div>
          <div class="miniChip" onclick="quick('Update forecasts')">Update forecasts</div>
          <div class="miniChip" onclick="quick('Update growth engine')">Update growth engine</div>
        </div>
      </div>
    </div>

    <div id="toast" class="toast"></div>
  </div>

  <script>
    const chat = document.getElementById('chat');
    const qEl = document.getElementById('q');
    const toast = document.getElementById('toast');

    function toastMsg(msg){
      toast.textContent = msg;
      toast.style.display = 'block';
      clearTimeout(window.__toastTimer);
      window.__toastTimer = setTimeout(() => {
        toast.style.display = 'none';
      }, 1600);
    }

    function scrollChat(){
      chat.scrollTop = chat.scrollHeight;
    }

    function addMsg(role, text){
      const el = document.createElement('div');
      el.className = 'msg ' + role;
      el.textContent = text;

      const meta = document.createElement('div');
      meta.className = 'meta';

      if (role === 'user') {
        meta.innerHTML = '<span>You</span><span>now</span>';
      } else {
        meta.innerHTML = '<span>PrimeCare AI</span><span>now</span>';
      }

      if (role !== 'user' && role !== 'system') {
        const btn = document.createElement('button');
        btn.className = 'copy';
        btn.textContent = 'Copy';
        btn.onclick = () => {
          navigator.clipboard.writeText(text);
          toastMsg('Copied');
        };
        meta.appendChild(btn);
      }

      if (role !== 'system') {
        el.appendChild(meta);
      }

      chat.appendChild(el);
      scrollChat();
      return el;
    }

    function addThinking(){
      const el = document.createElement('div');
      el.className = 'msg ai';
      el.textContent = 'Thinking...';

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = '<span>PrimeCare AI</span><span>thinking</span>';

      el.appendChild(meta);
      chat.appendChild(el);
      scrollChat();
      return el;
    }

    function updateThinking(el, text){
      el.innerHTML = '';
      el.appendChild(document.createTextNode(text));

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = '<span>PrimeCare AI</span><span>now</span>';

      const btn = document.createElement('button');
      btn.className = 'copy';
      btn.textContent = 'Copy';
      btn.onclick = () => {
        navigator.clipboard.writeText(text);
        toastMsg('Copied');
      };

      meta.appendChild(btn);
      el.appendChild(meta);
      scrollChat();
    }

    function clearChat(){
      chat.innerHTML = '';
      addMsg('system', 'Chat cleared. PrimeCare AI is ready.');
      toastMsg('Cleared');
    }

    function quick(text){
      qEl.value = text;
      ask();
    }

    function ask(){
      const q = (qEl.value || '').trim();
      if (!q) {
        toastMsg('Type a question');
        return;
      }

      addMsg('user', q);
      qEl.value = '';
      const thinkingEl = addThinking();

      google.script.run
        .withSuccessHandler((ans) => updateThinking(thinkingEl, ans || '(No response)'))
        .withFailureHandler((e) => updateThinking(thinkingEl, 'Error: ' + (e && e.message ? e.message : e)))
        .pcaiAskPrimeCareAI(q);
    }

    function listTabs(){
      addMsg('user', 'Show available tabs');
      const thinkingEl = addThinking();

      google.script.run
        .withSuccessHandler((ans) => updateThinking(thinkingEl, ans || 'No tabs found.'))
        .withFailureHandler((e) => updateThinking(thinkingEl, 'Error: ' + (e && e.message ? e.message : e)))
        .pcaiListTabsForUI();
    }

    function createDashboard(){
      toastMsg('Creating dashboard...');
      google.script.run
        .withSuccessHandler((msg) => toastMsg(msg || 'Dashboard created'))
        .withFailureHandler((e) => toastMsg('Error: ' + (e && e.message ? e.message : e)))
        .pcaiCreateDashboardTab();
    }

    qEl.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        ask();
      }
    });

    window.addEventListener('load', () => qEl.focus());
  </script>
</body>
</html>
`;
}