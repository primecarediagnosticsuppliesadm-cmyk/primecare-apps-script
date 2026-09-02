import React, { useCallback, useMemo, useState } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ActionErrorSummary,
  EmptyState,
  PageHeader,
  PageSkeleton,
  StatusBadge,
  enterprisePageClass,
  usePortalToast,
} from "@/components/ux";
import {
  AGENT_RESOURCE_CATEGORIES,
  acknowledgeAgentResourceVersionWrite,
  agentResourceOpenLabel,
  getAgentResourceSignedUrl,
  isDocxMime,
  listAgentResourcesAgentRead,
} from "@/api/agentResourceSupabaseApi.js";

function formatPublished(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function AgentResourcesPage({ currentUser = null }) {
  const { showToast } = usePortalToast();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await listAgentResourcesAgentRead({ currentUser });
    if (!result.success) setError(result.error);
    else setRows(result.data || []);
    setLoading(false);
  }, [currentUser]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const unreadRequired = useMemo(
    () => rows.filter((row) => row.requiredReading && !row.acknowledged).length,
    [rows]
  );

  const grouped = useMemo(() => {
    const byCat = new Map();
    for (const row of rows) {
      const list = byCat.get(row.category) || [];
      list.push(row);
      byCat.set(row.category, list);
    }
    return AGENT_RESOURCE_CATEGORIES.map((cat) => ({
      id: cat.id,
      label: cat.label,
      items: byCat.get(cat.id) || [],
    })).filter((section) => section.items.length > 0);
  }, [rows]);

  async function onOpen(row) {
    setError("");
    const result = await getAgentResourceSignedUrl({ currentUser, versionId: row.versionId });
    if (!result.success) {
      setError("Unable to open this resource right now. Please try again.");
      return;
    }
    window.open(result.data.url, "_blank", "noopener,noreferrer");
  }

  async function onMarkRead(row) {
    setSavingId(row.id);
    setError("");
    const result = await acknowledgeAgentResourceVersionWrite({
      currentUser,
      resourceId: row.id,
      versionId: row.versionId,
    });
    setSavingId("");
    if (!result.success) {
      setError("Could not mark this resource as read. Please try again.");
      return;
    }
    setRows((prev) =>
      prev.map((item) =>
        item.id === row.id
          ? { ...item, acknowledged: true, acknowledgedAt: result.data.acknowledgedAt }
          : item
      )
    );
    showToast("success", "Marked as read.");
  }

  if (loading && !rows.length) return <PageSkeleton rows={6} />;

  return (
    <div className={`${enterprisePageClass(true)} max-w-lg mx-auto`}>
      <PageHeader
        title="Resources"
        subtitle="Approved field guides. Opening or downloading a file does not mark it as read."
        icon={BookOpen}
      />

      {unreadRequired > 0 ? (
        <p className="text-sm font-medium text-amber-800">
          {unreadRequired} required item{unreadRequired === 1 ? "" : "s"} unread
        </p>
      ) : null}

      {error ? (
        <ActionErrorSummary
          title="Could not complete that action"
          message={error}
          onDismiss={() => setError("")}
          actions={[{ id: "retry", label: "Retry" }]}
          onAction={() => void load()}
        />
      ) : null}

      {!rows.length ? (
        <EmptyState title="No resources have been published for you yet." />
      ) : (
        <div className="space-y-5">
          {grouped.map((section) => (
            <section key={section.id} className="space-y-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {section.label}
              </h2>
              <ul className="space-y-2">
                {section.items.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-xl border border-border bg-card p-3 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start gap-2">
                      <h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug break-words">
                        {row.title}
                      </h3>
                      <div className="flex shrink-0 flex-wrap gap-1">
                        {row.requiredReading ? <StatusBadge variant="warning">Required</StatusBadge> : null}
                        {row.acknowledged ? (
                          <StatusBadge variant="success">Read ✓</StatusBadge>
                        ) : (
                          <StatusBadge variant="neutral">Unread</StatusBadge>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Version {row.versionNumber}
                      {row.publishedAt ? ` · Published ${formatPublished(row.publishedAt)}` : ""}
                    </p>
                    {row.description ? (
                      <p className="mt-1 text-xs text-muted-foreground break-words">{row.description}</p>
                    ) : null}
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        className="h-10 min-h-10 w-full sm:w-auto"
                        variant="outline"
                        onClick={() => onOpen(row)}
                      >
                        {agentResourceOpenLabel(row.mimeType)}
                      </Button>
                      {isDocxMime(row.mimeType) ? (
                        <p className="w-full text-[11px] text-muted-foreground">
                          Downloads a Word file. Opens in Word or Files — not a browser preview.
                        </p>
                      ) : null}
                      {!row.acknowledged ? (
                        <Button
                          type="button"
                          className="h-10 min-h-10 w-full sm:w-auto"
                          disabled={savingId === row.id}
                          onClick={() => onMarkRead(row)}
                        >
                          {savingId === row.id ? "Saving…" : "Mark as Read"}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
