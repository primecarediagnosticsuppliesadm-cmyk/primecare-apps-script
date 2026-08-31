import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ActionErrorSummary,
  EmptyState,
  PageHeader,
  PageSkeleton,
  StatusBadge,
  enterpriseLayout,
  enterprisePageClass,
  usePortalToast,
} from "@/components/ux";
import {
  AGENT_RESOURCE_CATEGORIES,
  archiveAgentResourceWrite,
  audienceLabel,
  categoryLabel,
  createAgentResourceVersionWrite,
  createAgentResourceWrite,
  getAgentResourceDetailPublisherRead,
  getAgentResourceSignedUrl,
  listActiveTenantAgentsPublisherRead,
  listAgentResourcesPublisherRead,
  publishAgentResourceVersionWrite,
  replaceAgentResourceAudienceWrite,
  updateAgentResourceMetadataWrite,
} from "@/api/agentResourceSupabaseApi.js";

function formatWhen(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function versionStatusVariant(status) {
  if (status === "published") return "success";
  if (status === "archived") return "warning";
  return "neutral";
}

function FieldLabel({ children }) {
  return <label className={enterpriseLayout.fieldLabel}>{children}</label>;
}

function AgentPicker({ agents, selected, onChange, disabled }) {
  if (!agents.length) {
    return <p className="text-xs text-muted-foreground">No active agents in this workspace.</p>;
  }
  return (
    <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
      {agents.map((agent) => {
        const checked = selected.includes(agent.userId);
        return (
          <label key={agent.userId} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => {
                onChange(
                  checked ? selected.filter((id) => id !== agent.userId) : [...selected, agent.userId]
                );
              }}
            />
            <span>{agent.name}</span>
          </label>
        );
      })}
    </div>
  );
}

export default function AgentResourcesPublisherPage({ currentUser = null }) {
  const { showToast } = usePortalToast();
  const [view, setView] = useState("list");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("");
  const [detail, setDetail] = useState(null);
  const [agents, setAgents] = useState([]);
  const [publishTarget, setPublishTarget] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(false);
  const [newVersionFile, setNewVersionFile] = useState(null);
  const [manageOpen, setManageOpen] = useState(false);

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "start_here",
    audienceType: "all_agents",
    requiredReading: false,
    namedIds: [],
    file: null,
  });

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    const [list, agentList] = await Promise.all([
      listAgentResourcesPublisherRead({ currentUser }),
      listActiveTenantAgentsPublisherRead({ currentUser }),
    ]);
    if (!list.success) setError(list.error);
    else setRows(list.data || []);
    if (agentList.success) setAgents(agentList.data || []);
    setLoading(false);
  }, [currentUser]);

  const loadDetail = useCallback(
    async (resourceId) => {
      setLoading(true);
      setError("");
      const result = await getAgentResourceDetailPublisherRead({ currentUser, resourceId });
      if (!result.success) {
        setError(result.error);
        setDetail(null);
      } else {
        setDetail(result.data);
        setForm((prev) => ({
          ...prev,
          title: result.data.resource.title,
          description: result.data.resource.description || "",
          category: result.data.resource.category,
          audienceType: result.data.resource.audienceType,
          requiredReading: result.data.resource.requiredReading,
          namedIds: (result.data.audience || []).map((row) => row.profileUserId),
          file: null,
        }));
      }
      setLoading(false);
    },
    [currentUser]
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const filteredRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.title.toLowerCase().includes(q) || categoryLabel(row.category).toLowerCase().includes(q)
    );
  }, [rows, filter]);

  async function openFile(versionId) {
    setError("");
    const result = await getAgentResourceSignedUrl({ currentUser, versionId });
    if (!result.success) {
      setError(result.error);
      return;
    }
    window.open(result.data.url, "_blank", "noopener,noreferrer");
  }

  async function onCreate(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const result = await createAgentResourceWrite({
      currentUser,
      title: form.title,
      description: form.description,
      category: form.category,
      audienceType: form.audienceType,
      requiredReading: form.requiredReading,
      namedProfileUserIds: form.namedIds,
      file: form.file,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    showToast("success", "Draft created. Publish when the file is ready.");
    setView("detail");
    await loadDetail(result.data.resource.id);
    await loadList();
  }

  async function onSaveMetadata() {
    if (!detail?.resource) return;
    setSaving(true);
    setError("");
    const meta = await updateAgentResourceMetadataWrite({
      currentUser,
      resourceId: detail.resource.id,
      title: form.title,
      description: form.description,
      category: form.category,
      requiredReading: form.requiredReading,
    });
    if (!meta.success) {
      setSaving(false);
      setError(meta.error);
      return;
    }
    const audience = await replaceAgentResourceAudienceWrite({
      currentUser,
      resourceId: detail.resource.id,
      audienceType: form.audienceType,
      namedProfileUserIds: form.namedIds,
    });
    setSaving(false);
    if (!audience.success) {
      setError(audience.error);
      return;
    }
    showToast("success", "Resource details updated.");
    setManageOpen(false);
    await loadDetail(detail.resource.id);
    await loadList();
  }

  async function onNewVersion(event) {
    event.preventDefault();
    if (!detail?.resource) return;
    setSaving(true);
    setError("");
    const result = await createAgentResourceVersionWrite({
      currentUser,
      resourceId: detail.resource.id,
      file: newVersionFile,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    showToast("success", `Version ${result.data.version.versionNumber} is a draft. Publish separately when ready.`);
    setNewVersionFile(null);
    await loadDetail(detail.resource.id);
    await loadList();
  }

  async function onPublish() {
    if (!publishTarget) return;
    setSaving(true);
    setError("");
    const result = await publishAgentResourceVersionWrite({
      currentUser,
      versionId: publishTarget.id,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    showToast("success", `Version ${publishTarget.versionNumber} is now published.`);
    setPublishTarget(null);
    await loadDetail(detail.resource.id);
    await loadList();
  }

  async function onArchive() {
    if (!detail?.resource) return;
    setSaving(true);
    setError("");
    const result = await archiveAgentResourceWrite({
      currentUser,
      resourceId: detail.resource.id,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    showToast("success", "Archived. Agents will no longer see this resource.");
    setArchiveTarget(false);
    await loadDetail(detail.resource.id);
    await loadList();
  }

  function startCreate() {
    setView("create");
    setDetail(null);
    setError("");
    setForm({
      title: "",
      description: "",
      category: "start_here",
      audienceType: "all_agents",
      requiredReading: false,
      namedIds: [],
      file: null,
    });
  }

  const resource = detail?.resource;

  if (loading && view === "list" && !rows.length) return <PageSkeleton rows={8} />;

  return (
    <div className={enterprisePageClass(true)}>
      <PageHeader
        title="Agent Resources"
        subtitle="Publish approved field guides. Drafts stay private until you publish."
        icon={BookOpen}
        actions={
          view === "list" ? (
            <Button type="button" size="sm" onClick={startCreate}>
              <Plus className="h-3.5 w-3.5" />
              New Resource
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setView("list");
                setDetail(null);
                setError("");
                void loadList();
              }}
            >
              Back to list
            </Button>
          )
        }
      />

      {error ? (
        <ActionErrorSummary title="Could not complete that action" message={error} onDismiss={() => setError("")} />
      ) : null}

      {view === "list" ? (
        <section className={enterpriseLayout.sectionDense}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              className="h-8 w-full max-w-xs rounded-md border border-border bg-background px-2 text-sm"
              placeholder="Filter by title or category"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          {!filteredRows.length ? (
            <EmptyState
              title="No resources yet"
              description="Create a draft, then publish when the file is ready for agents."
              action={
                <Button type="button" size="sm" onClick={startCreate}>
                  New Resource
                </Button>
              }
            />
          ) : (
            <div className={enterpriseLayout.tableWrap}>
              <table className="w-full min-w-[720px] text-left">
                <thead className={enterpriseLayout.tableHead}>
                  <tr>
                    <th className={enterpriseLayout.tableCellHead}>Title</th>
                    <th className={enterpriseLayout.tableCellHead}>Category</th>
                    <th className={enterpriseLayout.tableCellHead}>Published</th>
                    <th className={enterpriseLayout.tableCellHead}>Audience</th>
                    <th className={enterpriseLayout.tableCellHead}>Required</th>
                    <th className={enterpriseLayout.tableCellHead}>Read status</th>
                    <th className={enterpriseLayout.tableCellHead}>Updated</th>
                    <th className={enterpriseLayout.tableCellHead}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} className={enterpriseLayout.tableRow}>
                      <td className={enterpriseLayout.tableCell}>
                        <button
                          type="button"
                          className="text-left font-medium text-foreground hover:underline"
                          onClick={() => {
                            setView("detail");
                            void loadDetail(row.id);
                          }}
                        >
                          {row.title}
                        </button>
                        {row.archivedAt ? (
                          <div className="mt-1">
                            <StatusBadge variant="warning">Archived</StatusBadge>
                          </div>
                        ) : null}
                      </td>
                      <td className={enterpriseLayout.tableCell}>{categoryLabel(row.category)}</td>
                      <td className={enterpriseLayout.tableCell}>
                        {row.currentPublished ? `V${row.currentPublished.versionNumber}` : "Draft"}
                      </td>
                      <td className={enterpriseLayout.tableCell}>{audienceLabel(row.audienceType)}</td>
                      <td className={enterpriseLayout.tableCell}>{row.requiredReading ? "Yes" : "No"}</td>
                      <td className={enterpriseLayout.tableCell}>
                        {row.readStatus ? `${row.readStatus.read} / ${row.readStatus.total} read` : "—"}
                      </td>
                      <td className={enterpriseLayout.tableCell}>{formatWhen(row.updatedAt)}</td>
                      <td className={enterpriseLayout.tableCell}>
                        <div className="flex flex-wrap gap-1">
                          {row.currentPublished ? (
                            <Button type="button" size="xs" variant="outline" onClick={() => openFile(row.currentPublished.id)}>
                              Open
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => {
                              setView("detail");
                              void loadDetail(row.id);
                            }}
                          >
                            Manage
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {view === "create" ? (
        <form className={enterpriseLayout.sectionDense} onSubmit={onCreate}>
          <h2 className="mb-3 text-sm font-semibold">New resource</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <FieldLabel>Title *</FieldLabel>
              <input
                required
                className="h-8 w-full rounded-md border border-border px-2 text-sm"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <FieldLabel>Description</FieldLabel>
              <textarea
                className="min-h-[72px] w-full rounded-md border border-border px-2 py-1 text-sm"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <FieldLabel>Category *</FieldLabel>
              <select
                className="h-8 w-full rounded-md border border-border px-2 text-sm"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                {AGENT_RESOURCE_CATEGORIES.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <FieldLabel>Audience</FieldLabel>
              <select
                className="h-8 w-full rounded-md border border-border px-2 text-sm"
                value={form.audienceType}
                onChange={(e) => setForm((f) => ({ ...f, audienceType: e.target.value }))}
              >
                <option value="all_agents">All Agents</option>
                <option value="named_agents">Named Agents</option>
              </select>
            </div>
            {form.audienceType === "named_agents" ? (
              <div className="space-y-1 sm:col-span-2">
                <FieldLabel>Named agents</FieldLabel>
                <AgentPicker
                  agents={agents}
                  selected={form.namedIds}
                  onChange={(namedIds) => setForm((f) => ({ ...f, namedIds }))}
                />
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={form.requiredReading}
                onChange={(e) => setForm((f) => ({ ...f, requiredReading: e.target.checked }))}
              />
              Required reading
            </label>
            <div className="space-y-1 sm:col-span-2">
              <FieldLabel>File * (PDF, JPEG, or PNG · max 10 MB)</FieldLabel>
              <input
                required
                type="file"
                accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Uploading…" : "Create draft"}
            </Button>
          </div>
        </form>
      ) : null}

      {view === "detail" && resource ? (
        <div className="space-y-3">
          <section className={enterpriseLayout.sectionDense}>
            <div className={enterpriseLayout.sectionHeader}>
              <div>
                <h2 className="text-base font-semibold">{resource.title}</h2>
                <p className="text-xs text-muted-foreground">
                  Category: {categoryLabel(resource.category)} · Audience: {audienceLabel(resource.audienceType)} ·
                  Required reading: {resource.requiredReading ? "Yes" : "No"}
                  {detail.currentPublished ? ` · Current: Version ${detail.currentPublished.versionNumber}` : " · No published version"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setManageOpen((v) => !v)}>
                  Manage
                </Button>
                {!resource.archivedAt ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => setArchiveTarget(true)}>
                    Archive
                  </Button>
                ) : (
                  <StatusBadge variant="warning">Archived</StatusBadge>
                )}
              </div>
            </div>
            {resource.description ? <p className="text-sm text-muted-foreground">{resource.description}</p> : null}
          </section>

          {manageOpen ? (
            <section className={enterpriseLayout.sectionDense}>
              <h3 className="mb-2 text-sm font-semibold">Edit details</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <FieldLabel>Title</FieldLabel>
                  <input
                    className="h-8 w-full rounded-md border border-border px-2 text-sm"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <FieldLabel>Description</FieldLabel>
                  <textarea
                    className="min-h-[72px] w-full rounded-md border border-border px-2 py-1 text-sm"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel>Category</FieldLabel>
                  <select
                    className="h-8 w-full rounded-md border border-border px-2 text-sm"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  >
                    {AGENT_RESOURCE_CATEGORIES.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <FieldLabel>Audience</FieldLabel>
                  <select
                    className="h-8 w-full rounded-md border border-border px-2 text-sm"
                    value={form.audienceType}
                    onChange={(e) => setForm((f) => ({ ...f, audienceType: e.target.value }))}
                  >
                    <option value="all_agents">All Agents</option>
                    <option value="named_agents">Named Agents</option>
                  </select>
                </div>
                {form.audienceType === "named_agents" ? (
                  <div className="space-y-1 sm:col-span-2">
                    <FieldLabel>Named agents</FieldLabel>
                    <AgentPicker
                      agents={agents}
                      selected={form.namedIds}
                      onChange={(namedIds) => setForm((f) => ({ ...f, namedIds }))}
                    />
                  </div>
                ) : null}
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.requiredReading}
                    onChange={(e) => setForm((f) => ({ ...f, requiredReading: e.target.checked }))}
                  />
                  Required reading
                </label>
              </div>
              <Button type="button" size="sm" className="mt-3" disabled={saving} onClick={onSaveMetadata}>
                Save
              </Button>
            </section>
          ) : null}

          {detail.currentPublished ? (
            <section className={enterpriseLayout.sectionDense}>
              <h3 className="mb-2 text-sm font-semibold">Current published</h3>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>V{detail.currentPublished.versionNumber}</span>
                <StatusBadge variant="success">Published</StatusBadge>
                <span className="text-muted-foreground">{formatWhen(detail.currentPublished.publishedAt)}</span>
                <Button type="button" size="xs" variant="outline" onClick={() => openFile(detail.currentPublished.id)}>
                  Open
                </Button>
              </div>
            </section>
          ) : (
            <section className={enterpriseLayout.sectionDense}>
              <p className="text-sm text-muted-foreground">No published version yet. Publish a draft below.</p>
            </section>
          )}

          {!resource.archivedAt ? (
            <section className={enterpriseLayout.sectionDense}>
              <h3 className="mb-2 text-sm font-semibold">New version</h3>
              <form className="flex flex-wrap items-end gap-2" onSubmit={onNewVersion}>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setNewVersionFile(e.target.files?.[0] || null)}
                />
                <Button type="submit" size="sm" disabled={saving || !newVersionFile}>
                  Upload draft
                </Button>
              </form>
            </section>
          ) : null}

          <section className={enterpriseLayout.sectionDense}>
            <h3 className="mb-2 text-sm font-semibold">Drafts</h3>
            {!detail.drafts?.length ? (
              <p className="text-sm text-muted-foreground">No drafts.</p>
            ) : (
              <ul className="space-y-2">
                {detail.drafts.map((version) => (
                  <li key={version.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span>V{version.versionNumber}</span>
                    <StatusBadge variant="neutral">Draft</StatusBadge>
                    <span className="text-muted-foreground">{formatWhen(version.createdAt)}</span>
                    <Button type="button" size="xs" variant="outline" onClick={() => openFile(version.id)}>
                      Open
                    </Button>
                    {!resource.archivedAt ? (
                      <Button type="button" size="xs" onClick={() => setPublishTarget(version)}>
                        Publish
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {publishTarget ? (
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-semibold">Publish Version {publishTarget.versionNumber}?</p>
              <ul className="mt-2 list-disc pl-5">
                <li>Resource: {resource.title}</li>
                <li>Draft version: {publishTarget.versionNumber}</li>
                <li>Audience: {audienceLabel(resource.audienceType)}</li>
                <li>Required reading: {resource.requiredReading ? "Yes" : "No"}</li>
              </ul>
              <div className="mt-3 flex gap-2">
                <Button type="button" size="sm" disabled={saving} onClick={onPublish}>
                  Confirm publish
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setPublishTarget(null)}>
                  Cancel
                </Button>
              </div>
            </section>
          ) : null}

          {archiveTarget ? (
            <section className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-950">
              <p className="font-semibold">Archive {resource.title}?</p>
              <p className="mt-1">Agents will no longer see it. Version history and acknowledgements are kept.</p>
              <div className="mt-3 flex gap-2">
                <Button type="button" size="sm" variant="destructive" disabled={saving} onClick={onArchive}>
                  Confirm archive
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setArchiveTarget(false)}>
                  Cancel
                </Button>
              </div>
            </section>
          ) : null}

          <section className={enterpriseLayout.sectionDense}>
            <h3 className="mb-2 text-sm font-semibold">History</h3>
            {!detail.history?.length ? (
              <p className="text-sm text-muted-foreground">No published or archived versions yet.</p>
            ) : (
              <ul className="space-y-2">
                {detail.history.map((version) => (
                  <li key={version.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span>V{version.versionNumber}</span>
                    <StatusBadge variant={versionStatusVariant(version.status)}>{version.status}</StatusBadge>
                    <span className="text-muted-foreground">
                      {formatWhen(version.publishedAt || version.archivedAt || version.createdAt)}
                    </span>
                    <Button type="button" size="xs" variant="outline" onClick={() => openFile(version.id)}>
                      Open
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={enterpriseLayout.sectionDense}>
            <h3 className="mb-2 text-sm font-semibold">Acknowledgements</h3>
            {!detail.acknowledgements?.length ? (
              <p className="text-sm text-muted-foreground">No acknowledgements yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {detail.acknowledgements.map((row) => (
                  <li key={row.id}>
                    {row.name} — Read — {formatWhen(row.acknowledgedAt)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
