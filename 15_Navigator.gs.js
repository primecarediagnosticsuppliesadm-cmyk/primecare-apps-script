/************************************************************
 * 15_Navigator.gs
 * Workbook navigation
 ************************************************************/

function pcSetLegacyWorkbookId() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty(PC_NAV_KEYS.LEGACY_ID, ss.getId());
  SpreadsheetApp.getUi().alert("Legacy workbook ID saved for:\n" + ss.getName());
}

function pcSaveCurrentWorkbookAsProduction() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty(PC_NAV_KEYS.PRODUCTION_ID, ss.getId());
  SpreadsheetApp.getUi().alert("Production workbook ID saved for:\n" + ss.getName());
}

function pcSaveCurrentWorkbookAsAI() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty(PC_NAV_KEYS.AI_ID, ss.getId());
  SpreadsheetApp.getUi().alert("AI workbook ID saved for:\n" + ss.getName());
}

function pcSaveCurrentWorkbookAsSandbox() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty(PC_NAV_KEYS.SANDBOX_ID, ss.getId());
  SpreadsheetApp.getUi().alert("Sandbox workbook ID saved for:\n" + ss.getName());
}

function pcGetWorkbookNavLinks_() {
  const props = PropertiesService.getScriptProperties();

  const items = [
    { key: PC_NAV_KEYS.LEGACY_ID, label: PC_NAV_LABELS.LEGACY },
    { key: PC_NAV_KEYS.PRODUCTION_ID, label: PC_NAV_LABELS.PRODUCTION },
    { key: PC_NAV_KEYS.AI_ID, label: PC_NAV_LABELS.AI },
    { key: PC_NAV_KEYS.SANDBOX_ID, label: PC_NAV_LABELS.SANDBOX }
  ];

  return items.map(item => {
    const id = props.getProperty(item.key);
    const url = id ? ("https://docs.google.com/spreadsheets/d/" + id + "/edit") : "";
    return {
      label: item.label,
      id: id,
      url: url
    };
  });
}

function pcShowWorkbookNavigator() {
  const current = SpreadsheetApp.getActiveSpreadsheet();
  const currentId = current.getId();
  const currentName = current.getName();

  const links = pcGetWorkbookNavLinks_().filter(x => x.id && x.id !== currentId);

  let html = `
    <html>
      <body style="font-family:Arial,sans-serif;padding:16px;">
        <h2 style="margin-top:0;">PrimeCare Navigator</h2>
        <div style="margin-bottom:12px;color:#555;">
          Current workbook: <strong>${pcEscapeHtml_(currentName)}</strong>
        </div>
  `;

  if (!links.length) {
    html += `<div>No workbook links saved yet.</div>`;
  } else {
    html += `<ul style="padding-left:18px;">`;
    links.forEach(link => {
      html += `
        <li style="margin-bottom:10px;">
          <a href="${link.url}" target="_blank" style="text-decoration:none;font-weight:600;">
            ${pcEscapeHtml_(link.label)}
          </a>
        </li>
      `;
    });
    html += `</ul>`;
  }

  html += `
      </body>
    </html>
  `;

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(420).setHeight(300),
    "PrimeCare Navigator"
  );
}

function pcEscapeHtml_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}