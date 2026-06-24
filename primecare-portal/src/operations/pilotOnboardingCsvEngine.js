function str(v) {
  return String(v ?? "").trim();
}

function normalizeHeader(h) {
  return str(h)
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

/** Minimal RFC4180-ish CSV parse for pilot imports. */
export function parseCsvText(text = "") {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };

  const parseLine = (line) => {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const headers = parseLine(lines[0]).map(normalizeHeader);
  const rows = lines.slice(1).map((line, index) => {
    const cells = parseLine(line);
    const row = { __rowNum: index + 2 };
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

const LAB_ALIASES = {
  labname: "labName",
  labid: "labId",
  tenantid: "tenantId",
  distributorid: "tenantId",
  cityterritory: "cityTerritory",
  area: "cityTerritory",
  contactname: "contactName",
  ownername: "contactName",
  phone: "phone",
  email: "email",
  creditlimit: "creditLimit",
  paymentterms: "paymentTerms",
  primaryagentid: "primaryAgentId",
  agentid: "primaryAgentId",
};

const AGENT_ALIASES = {
  displayname: "displayName",
  name: "displayName",
  email: "email",
  username: "username",
  agentid: "agentId",
  phone: "phone",
  territory: "territory",
};

function mapRow(raw, aliases) {
  const mapped = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith("__")) continue;
    const field = aliases[normalizeHeader(key)];
    if (field) mapped[field] = str(value);
  }
  return mapped;
}

export function validateLabsCsvRows(rows = [], context = {}) {
  const defaultTenantId = str(context.defaultTenantId);
  const existingLabIds = new Set(
    (context.existingLabIds || []).map((id) => str(id).toLowerCase()).filter(Boolean)
  );
  const seenLabIds = new Set();
  const results = [];

  for (const raw of rows) {
    const row = mapRow(raw, LAB_ALIASES);
    const errors = [];
    const rowNum = raw.__rowNum;

    if (!str(row.labName)) errors.push("labName is required");
    if (!str(row.cityTerritory)) errors.push("cityTerritory is required");
    if (!str(row.contactName)) errors.push("contactName is required");
    if (!str(row.phone)) errors.push("phone is required");
    if (!str(row.email)) errors.push("email is required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(row.email))) errors.push("email is invalid");
    const creditLimit = Number(row.creditLimit);
    if (!Number.isFinite(creditLimit) || creditLimit < 0) errors.push("creditLimit is required");

    const tenantId = str(row.tenantId) || defaultTenantId;
    if (!tenantId) errors.push("tenantId is required");

    const labId = str(row.labId).toUpperCase();
    if (labId) {
      const key = labId.toLowerCase();
      if (seenLabIds.has(key)) errors.push(`duplicate labId in CSV: ${labId}`);
      if (existingLabIds.has(key)) errors.push(`labId already exists: ${labId}`);
      seenLabIds.add(key);
    }

    if (!str(row.paymentTerms)) row.paymentTerms = "Net 30";
    row.tenantId = tenantId;

    results.push({
      rowNum,
      row,
      errors,
      valid: errors.length === 0,
    });
  }

  return results;
}

export function validateAgentsCsvRows(rows = [], context = {}) {
  const existingEmails = new Set(
    (context.existingEmails || []).map((e) => str(e).toLowerCase()).filter(Boolean)
  );
  const existingAgentIds = new Set(
    (context.existingAgentIds || []).map((id) => str(id).toLowerCase()).filter(Boolean)
  );
  const seenEmails = new Set();
  const seenAgentIds = new Set();
  const results = [];

  for (const raw of rows) {
    const row = mapRow(raw, AGENT_ALIASES);
    const errors = [];
    const rowNum = raw.__rowNum;

    if (!str(row.displayName)) errors.push("displayName is required");
    if (!str(row.email)) errors.push("email is required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(row.email))) errors.push("email is invalid");
    if (!str(row.agentId)) errors.push("agentId is required");

    const emailKey = str(row.email).toLowerCase();
    const agentKey = str(row.agentId).toLowerCase();

    if (seenEmails.has(emailKey)) errors.push(`duplicate email in CSV: ${row.email}`);
    if (seenAgentIds.has(agentKey)) errors.push(`duplicate agentId in CSV: ${row.agentId}`);
    if (existingEmails.has(emailKey)) errors.push(`email already provisioned: ${row.email}`);
    if (existingAgentIds.has(agentKey)) errors.push(`agentId already in use: ${row.agentId}`);

    seenEmails.add(emailKey);
    seenAgentIds.add(agentKey);

    results.push({
      rowNum,
      row: { ...row, role: "agent", active: true },
      errors,
      valid: errors.length === 0,
    });
  }

  return results;
}

export const LABS_CSV_TEMPLATE = `labName,labId,tenantId,cityTerritory,contactName,phone,email,creditLimit,paymentTerms,primaryAgentId
Alpha Diagnostics,,,Hyderabad,Dr Rao,9876543210,alpha@lab.test,50000,Net 30,AGT-001`;

export const AGENTS_CSV_TEMPLATE = `displayName,email,username,agentId,phone,territory
Field Agent One,agent1@primecare.test,agent1,AGT-001,9876500001,Hyderabad`;
