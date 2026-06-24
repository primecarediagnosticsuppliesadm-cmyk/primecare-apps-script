import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, FileSpreadsheet } from "lucide-react";
import { createLabWrite } from "@/api/primecareSupabaseApi.js";
import { assignPrimaryLabOwnerWrite } from "@/api/labOwnershipApi.js";
import { provisionPlatformUserWrite } from "@/api/userProvisioningApi.js";
import { ROLES } from "@/config/roles.js";
import { suggestAgentId } from "@/operations/userProvisioningEngine.js";
import {
  AGENTS_CSV_TEMPLATE,
  LABS_CSV_TEMPLATE,
  parseCsvText,
  validateAgentsCsvRows,
  validateLabsCsvRows,
} from "@/operations/pilotOnboardingCsvEngine.js";
import { cn } from "@/lib/utils";

function str(v) {
  return String(v ?? "").trim();
}

function downloadTemplate(filename, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ImportPreviewTable({ rows, type }) {
  if (!rows.length) return null;
  const validCount = rows.filter((r) => r.valid).length;
  const errorCount = rows.length - validCount;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 text-[11px]">
        <Badge variant="default">{validCount} ready</Badge>
        {errorCount ? <Badge variant="destructive">{errorCount} with errors</Badge> : null}
      </div>
      <div className="max-h-64 overflow-auto rounded-lg border">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="text-left text-slate-500">
              <th className="px-2 py-1.5">Row</th>
              {type === "labs" ? (
                <>
                  <th className="px-2 py-1.5">Lab</th>
                  <th className="px-2 py-1.5">Territory</th>
                  <th className="px-2 py-1.5">Email</th>
                  <th className="px-2 py-1.5">Owner agent</th>
                </>
              ) : (
                <>
                  <th className="px-2 py-1.5">Name</th>
                  <th className="px-2 py-1.5">Email</th>
                  <th className="px-2 py-1.5">Agent ID</th>
                </>
              )}
              <th className="px-2 py-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr
                key={entry.rowNum}
                className={cn("border-t", !entry.valid && "bg-red-50/60")}
              >
                <td className="px-2 py-1.5 tabular-nums">{entry.rowNum}</td>
                {type === "labs" ? (
                  <>
                    <td className="px-2 py-1.5">{entry.row.labName}</td>
                    <td className="px-2 py-1.5">{entry.row.cityTerritory}</td>
                    <td className="px-2 py-1.5">{entry.row.email}</td>
                    <td className="px-2 py-1.5">{entry.row.primaryAgentId || "—"}</td>
                  </>
                ) : (
                  <>
                    <td className="px-2 py-1.5">{entry.row.displayName}</td>
                    <td className="px-2 py-1.5">{entry.row.email}</td>
                    <td className="px-2 py-1.5">{entry.row.agentId}</td>
                  </>
                )}
                <td className="px-2 py-1.5">
                  {entry.valid ? (
                    <span className="text-emerald-700">OK</span>
                  ) : (
                    <ul className="list-inside list-disc text-red-700">
                      {entry.errors.map((err) => (
                        <li key={err}>{err}</li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImportSection({
  title,
  description,
  templateName,
  templateContent,
  type,
  previewRows,
  onFile,
  onImport,
  importing,
  importResults,
  defaultTenantId,
}) {
  const readyRows = previewRows.filter((r) => r.valid);
  const canImport = readyRows.length > 0 && !importing;

  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <FileSpreadsheet className="h-4 w-4 text-indigo-600" />
            {title}
          </h3>
          <p className="text-[11px] text-slate-600">{description}</p>
          {type === "labs" && defaultTenantId ? (
            <p className="mt-1 text-[10px] text-slate-500">
              Default tenantId: <span className="font-mono">{defaultTenantId}</span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[10px]"
            onClick={() => downloadTemplate(templateName, templateContent)}
          >
            <Download className="mr-1 h-3 w-3" />
            Template
          </Button>
          <label className="inline-flex cursor-pointer items-center">
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
                e.target.value = "";
              }}
            />
            <span className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2 text-[10px] font-medium hover:bg-slate-50">
              <Upload className="mr-1 h-3 w-3" />
              Upload CSV
            </span>
          </label>
        </div>
      </div>

      {previewRows.length ? <ImportPreviewTable rows={previewRows} type={type} /> : null}

      {previewRows.length ? (
        <div className="mt-3 flex justify-end">
          <Button type="button" size="sm" disabled={!canImport} onClick={() => void onImport()}>
            {importing
              ? "Importing…"
              : `Import ${readyRows.length} row${readyRows.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      ) : null}

      {importResults?.length ? (
        <div className="mt-3 max-h-40 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px]">
          {importResults.map((row) => (
            <p
              key={`${row.rowNum}-${row.label}`}
              className={row.ok ? "text-emerald-800" : "text-red-700"}
            >
              Row {row.rowNum}: {row.label} — {row.message}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function PilotOnboardingImportPanel({
  tenantId,
  bundle,
  defaultDistributorTenantId = "",
  agents = [],
  onReload,
  onStatus,
  onError,
}) {
  const [labsPreview, setLabsPreview] = useState([]);
  const [agentsPreview, setAgentsPreview] = useState([]);
  const [labsImporting, setLabsImporting] = useState(false);
  const [agentsImporting, setAgentsImporting] = useState(false);
  const [labsResults, setLabsResults] = useState([]);
  const [agentsResults, setAgentsResults] = useState([]);

  const existingLabIds = useMemo(
    () => (bundle?.labAssignments || []).map((l) => l.labId).filter(Boolean),
    [bundle?.labAssignments]
  );
  const existingEmails = useMemo(
    () =>
      (bundle?.directoryUsers || [])
        .map((u) => u.email || u.storedEmail)
        .filter(Boolean),
    [bundle?.directoryUsers]
  );
  const existingAgentIds = useMemo(
    () => (bundle?.agents || []).map((a) => a.agentId).filter(Boolean),
    [bundle?.agents]
  );

  const agentNameById = useMemo(() => {
    const map = new Map();
    for (const a of agents) {
      if (a.agentId) map.set(str(a.agentId).toLowerCase(), a.name || a.agentId);
    }
    return map;
  }, [agents]);

  async function handleLabsFile(file) {
    const text = await file.text();
    const { rows } = parseCsvText(text);
    const validated = validateLabsCsvRows(rows, {
      defaultTenantId: defaultDistributorTenantId || tenantId,
      existingLabIds,
    });
    setLabsPreview(validated);
    setLabsResults([]);
    onStatus?.(`Parsed ${validated.length} lab row(s)`);
  }

  async function handleAgentsFile(file) {
    const text = await file.text();
    const { rows } = parseCsvText(text);
    const validated = validateAgentsCsvRows(rows, { existingEmails, existingAgentIds });
    setAgentsPreview(validated);
    setAgentsResults([]);
    onStatus?.(`Parsed ${validated.length} agent row(s)`);
  }

  async function importLabs() {
    const ready = labsPreview.filter((r) => r.valid);
    if (!ready.length) return;
    setLabsImporting(true);
    setLabsResults([]);
    onError?.("");
    const results = [];
    let okCount = 0;

    for (const entry of ready) {
      const row = entry.row;
      try {
        const res = await createLabWrite({
          labName: row.labName,
          labId: row.labId || undefined,
          tenantId: row.tenantId,
          cityTerritory: row.cityTerritory,
          contactName: row.contactName,
          phone: row.phone,
          email: row.email,
          creditLimit: Number(row.creditLimit),
          paymentTerms: row.paymentTerms,
          homeTenantId: tenantId,
        });
        if (!res?.success) throw new Error(res?.error || "Create failed");

        const labId = res.data?.labId;
        const labTenantId = res.data?.tenantId || row.tenantId;

        if (row.primaryAgentId) {
          const agentName =
            agentNameById.get(str(row.primaryAgentId).toLowerCase()) || row.primaryAgentId;
          const ownRes = await assignPrimaryLabOwnerWrite({
            hqTenantId: tenantId,
            labTenantId,
            labId,
            primaryAgentId: row.primaryAgentId,
            agentName,
            labName: row.labName,
            reason: "csv_bulk_import",
          });
          if (!ownRes?.success) {
            results.push({
              rowNum: entry.rowNum,
              label: row.labName,
              ok: false,
              message: `Lab created but ownership failed: ${ownRes?.error}`,
            });
            continue;
          }
        }

        okCount += 1;
        results.push({
          rowNum: entry.rowNum,
          label: row.labName,
          ok: true,
          message: row.primaryAgentId ? "Created + owner assigned" : "Created",
        });
      } catch (err) {
        results.push({
          rowNum: entry.rowNum,
          label: row.labName,
          ok: false,
          message: err.message || "Import failed",
        });
      }
    }

    setLabsResults(results);
    setLabsImporting(false);
    onReload?.();
    onStatus?.(`Labs import: ${okCount}/${ready.length} succeeded`);
  }

  async function importAgents() {
    const ready = agentsPreview.filter((r) => r.valid);
    if (!ready.length) return;
    setAgentsImporting(true);
    setAgentsResults([]);
    onError?.("");
    const results = [];
    let okCount = 0;

    for (const entry of ready) {
      const row = entry.row;
      try {
        const res = await provisionPlatformUserWrite({
          tenantId,
          displayName: row.displayName,
          email: row.email,
          username: row.username || row.email.split("@")[0],
          phone: row.phone,
          role: ROLES.AGENT,
          active: true,
          agentId: row.agentId || suggestAgentId(row.displayName),
          territory: row.territory,
        });
        if (!res?.success) throw new Error(res?.error || "Provision failed");
        okCount += 1;
        results.push({
          rowNum: entry.rowNum,
          label: row.displayName,
          ok: true,
          message: "Provisioned",
        });
      } catch (err) {
        results.push({
          rowNum: entry.rowNum,
          label: row.displayName,
          ok: false,
          message: err.message || "Import failed",
        });
      }
    }

    setAgentsResults(results);
    setAgentsImporting(false);
    onReload?.();
    onStatus?.(`Agents import: ${okCount}/${ready.length} succeeded`);
  }

  return (
    <div className="space-y-4">
      <ImportSection
        title="Bulk import — Labs"
        description="Required: labName, cityTerritory, contactName, phone, email, creditLimit. Optional: labId, tenantId, primaryAgentId."
        templateName="pilot-labs-template.csv"
        templateContent={LABS_CSV_TEMPLATE}
        type="labs"
        previewRows={labsPreview}
        onFile={handleLabsFile}
        onImport={importLabs}
        importing={labsImporting}
        importResults={labsResults}
        defaultTenantId={defaultDistributorTenantId || tenantId}
      />
      <ImportSection
        title="Bulk import — Agents"
        description="Required: displayName, email, agentId. Uses existing provision-platform-user API."
        templateName="pilot-agents-template.csv"
        templateContent={AGENTS_CSV_TEMPLATE}
        type="agents"
        previewRows={agentsPreview}
        onFile={handleAgentsFile}
        onImport={importAgents}
        importing={agentsImporting}
        importResults={agentsResults}
      />
    </div>
  );
}
