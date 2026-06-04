import { supabase } from "@/api/supabaseClient.js";
import { fireNotificationEvent } from "@/notifications/fireNotificationEvent.js";
import { appendOperationalEvent } from "@/operations/operationalEventBridge.js";
import { recordEvidenceEvent } from "@/operations/evidencePredator.js";
import { labIdKey } from "@/utils/labId.js";
import { ROLES } from "@/config/roles.js";

export const EVIDENCE_BUCKET = "operational-evidence";
export const EVIDENCE_MAX_BYTES = 8 * 1024 * 1024;
export const EVIDENCE_SIGNED_URL_TTL_SEC = 3600;
const INDEX_PREFIX = "primecare_operational_evidence:";
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function str(v) {
  return String(v ?? "").trim();
}

function indexKey(tenantId) {
  return `${INDEX_PREFIX}${tenantId || "default"}`;
}

function readLocalIndex(tenantId) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(indexKey(tenantId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Read-only local evidence index for tenant isolation checks. */
export function readOperationalEvidenceIndex(tenantId) {
  return readLocalIndex(tenantId);
}

function writeLocalIndex(tenantId, rows) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(indexKey(tenantId), JSON.stringify(rows.slice(0, 200)));
  } catch (err) {
    console.warn("[operationalEvidence] local index write failed", err);
  }
}

function appendLocalIndexRecord(tenantId, record) {
  const rows = readLocalIndex(tenantId);
  rows.unshift(record);
  writeLocalIndex(tenantId, rows);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateEvidenceFile(file) {
  if (!file) return { ok: false, error: "No file selected." };
  if (!String(file.type || "").toLowerCase().startsWith("image/")) {
    return { ok: false, error: "Only image files are allowed (JPEG, PNG, WebP)." };
  }
  const mime = String(file.type || "").toLowerCase();
  if (mime && !ALLOWED_MIME.has(mime)) {
    return { ok: false, error: `Image type not allowed: ${mime}` };
  }
  if (file.size > EVIDENCE_MAX_BYTES) {
    return { ok: false, error: "Image must be under 8MB." };
  }
  return { ok: true, error: null };
}

/**
 * @param {object} params
 */
export function buildEvidenceStoragePath(params) {
  const tenantId = str(params.tenantId) || "unknown";
  const evidenceType = str(params.evidenceType || params.kind) || "visit_photo";
  const recordId =
    str(params.recordId) ||
    str(params.visitId) ||
    str(params.paymentId) ||
    `EVD-${Date.now()}`;
  const evidenceId = str(params.evidenceId) || `EVD-${Date.now()}`;
  const baseName = String(params.fileName || "proof.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileName = baseName.includes(".") ? baseName : `${baseName}.jpg`;
  const storagePath = `${tenantId}/${evidenceType}/${recordId}/${evidenceId}-${fileName}`;
  return { storagePath, recordId, fileName, evidenceId };
}

function normalizeDbEvidenceRow(row) {
  if (!row) return null;
  return {
    evidenceId: row.evidence_id,
    tenantId: row.tenant_id,
    labId: row.lab_id,
    kind: row.evidence_type,
    visitId: row.visit_id || "",
    paymentId: row.payment_id || "",
    recordId: row.record_id,
    storagePath: row.storage_path,
    storageBackend: row.storage_backend || "supabase",
    uploadedAt: row.created_at,
    uploadedBy: row.uploaded_by,
    uploadedByUserId: row.uploaded_by_user_id,
    uploadedByRole: row.uploaded_by_role,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    remarks: row.remarks,
    gps: row.gps_json,
    previewUrl: null,
  };
}

function applyRoleFilter(rows, currentUser) {
  const role = str(currentUser?.role).toLowerCase();
  if (role === ROLES.LAB) return [];
  if (role !== ROLES.AGENT) return rows;

  const userId = str(currentUser?.id || currentUser?.userId);
  const ownerKeys = new Set(
    [userId, str(currentUser?.name), str(currentUser?.agentName), str(currentUser?.agentId)].filter(
      Boolean
    )
  );
  return rows.filter(
    (r) =>
      ownerKeys.has(str(r.uploadedBy)) ||
      (r.uploadedByUserId && str(r.uploadedByUserId) === userId)
  );
}

function applyListFilters(rows, filters = {}) {
  let out = rows;
  if (filters.labId) {
    out = out.filter((r) => labIdKey(r.labId) === labIdKey(filters.labId));
  }
  if (filters.visitId) {
    out = out.filter((r) => str(r.visitId) === str(filters.visitId));
  }
  if (filters.paymentId) {
    out = out.filter((r) => str(r.paymentId) === str(filters.paymentId));
  }
  if (filters.kind) {
    out = out.filter((r) => str(r.kind) === str(filters.kind));
  }
  return out.slice(0, filters.limit ?? 50);
}

function mergeEvidenceLists(primary, secondary) {
  const seen = new Set(primary.map((r) => r.evidenceId));
  const merged = [...primary];
  for (const row of secondary) {
    if (!row?.evidenceId || seen.has(row.evidenceId)) continue;
    seen.add(row.evidenceId);
    merged.push(row);
  }
  merged.sort((a, b) => {
    const tb = Date.parse(b.uploadedAt || "") || 0;
    const ta = Date.parse(a.uploadedAt || "") || 0;
    return tb - ta;
  });
  return merged;
}

async function tryGpsCapture() {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          capturedAt: new Date().toISOString(),
        }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  });
}

/**
 * Probe bucket availability (list tenant prefix).
 */
export async function checkOperationalEvidenceBucket(tenantId) {
  if (!supabase) {
    return { ok: false, error: "Supabase not configured", bucket: EVIDENCE_BUCKET };
  }
  const prefix = str(tenantId) || "unknown";
  const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).list(prefix, {
    limit: 1,
  });
  if (error) {
    const msg = error.message || String(error);
    const missing =
      msg.toLowerCase().includes("bucket") && msg.toLowerCase().includes("not found");
    return { ok: false, error: msg, bucket: EVIDENCE_BUCKET, missing };
  }
  return { ok: true, error: null, bucket: EVIDENCE_BUCKET, sampleCount: data?.length ?? 0 };
}

async function createSignedPreviewUrl(storagePath) {
  if (!supabase || !storagePath) return null;
  const signed = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(storagePath, EVIDENCE_SIGNED_URL_TTL_SEC);
  if (signed.error) {
    recordEvidenceEvent("evidence.signed_url_fail", { error: signed.error.message });
    return null;
  }
  recordEvidenceEvent("evidence.signed_url_ok", { path: storagePath });
  return signed.data?.signedUrl || null;
}

async function uploadToStorageWithRetry(storagePath, file, onProgress) {
  const attempts = 3;
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    onProgress?.({ phase: "uploading", attempt: i + 1, attempts, pct: 10 + i * 25 });
    const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(storagePath, file, {
      cacheControl: String(EVIDENCE_SIGNED_URL_TTL_SEC),
      upsert: false,
      contentType: file.type || "image/jpeg",
    });
    if (!error) {
      onProgress?.({ phase: "uploading", attempt: i + 1, attempts, pct: 85 });
      return { success: true, error: null };
    }
    lastError = error.message || String(error);
    const retriable =
      lastError.toLowerCase().includes("timeout") ||
      lastError.toLowerCase().includes("network") ||
      lastError.toLowerCase().includes("502") ||
      lastError.toLowerCase().includes("503");
    if (!retriable && i === 0) break;
    await sleep(400 * (i + 1));
  }
  return { success: false, error: lastError };
}

async function insertEvidenceMetadataRow(row) {
  if (!supabase) return { success: false, error: "Supabase not configured" };
  const { error } = await supabase.from("operational_evidence").insert([row]);
  if (error) {
    console.warn("[operationalEvidence] metadata insert:", error.message);
    return { success: false, error: error.message };
  }
  return { success: true, error: null };
}

async function fetchEvidenceFromDatabase(tenantId, filters = {}) {
  if (!supabase || !tenantId) return [];
  let q = supabase
    .from("operational_evidence")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 80);

  if (filters.labId) q = q.eq("lab_id", labIdKey(filters.labId));
  if (filters.visitId) q = q.eq("visit_id", str(filters.visitId));
  if (filters.paymentId) q = q.eq("payment_id", str(filters.paymentId));
  if (filters.kind) q = q.eq("evidence_type", str(filters.kind));

  const { data, error } = await q;
  if (error) {
    console.warn("[operationalEvidence] list query:", error.message);
    return [];
  }
  return (data || []).map(normalizeDbEvidenceRow).filter(Boolean);
}

/**
 * Durable list: Supabase metadata first, merged with local fallback rows.
 */
export async function listOperationalEvidence(tenantId, currentUser, filters = {}) {
  const role = str(currentUser?.role).toLowerCase();
  if (role === ROLES.LAB) return [];

  let dbRows = [];
  try {
    dbRows = await fetchEvidenceFromDatabase(tenantId, filters);
  } catch (err) {
    console.warn("[operationalEvidence] fetchEvidenceFromDatabase:", err);
  }

  const localRows = applyListFilters(readLocalIndex(tenantId), filters);
  const localOnly = localRows.filter(
    (r) => r.storageBackend !== "supabase" && !dbRows.some((d) => d.evidenceId === r.evidenceId)
  );

  const merged = mergeEvidenceLists(dbRows, localOnly);
  return applyRoleFilter(merged, currentUser);
}

/** Sync local cache only (Predator / offline diagnostics). */
export function listOperationalEvidenceLocal(tenantId, currentUser, filters = {}) {
  const rows = applyListFilters(readLocalIndex(tenantId), filters);
  return applyRoleFilter(rows, currentUser);
}

/**
 * @param {object} params
 * @param {File} params.file
 * @param {(progress: object) => void} [params.onProgress]
 */
export async function uploadOperationalEvidence(params) {
  const file = params.file;
  const tenantId = str(params.tenantId);
  const labId = labIdKey(params.labId);
  const kind = str(params.kind) || "visit_photo";
  const uploadedBy = str(params.uploadedBy);
  const uploadedByRole = str(params.uploadedByRole).toLowerCase();
  const onProgress = params.onProgress;

  const validation = validateEvidenceFile(file);
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }
  if (!labId) {
    return { success: false, error: "File and lab are required." };
  }

  recordEvidenceEvent("evidence.upload_start", { kind, labId });
  onProgress?.({ phase: "validating", pct: 5 });

  const visitId = str(params.visitId);
  const paymentId = str(params.paymentId);
  const recordId = visitId || paymentId || `EVD-${Date.now()}`;
  const { storagePath, evidenceId } = buildEvidenceStoragePath({
    tenantId,
    evidenceType: kind,
    recordId,
    visitId,
    paymentId,
    evidenceId: `EVD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fileName: file.name,
  });

  let previewUrl = null;
  let storageBackend = "local_pending";
  let uploadError = null;
  let durable = false;

  const gps = params.captureGps !== false ? await tryGpsCapture() : null;
  let uploadedByUserId = null;
  if (supabase) {
    const { data: authData } = await supabase.auth.getUser();
    uploadedByUserId = authData?.user?.id ?? null;
  }

  if (supabase) {
    onProgress?.({ phase: "uploading", pct: 15 });
    const bucketProbe = await checkOperationalEvidenceBucket(tenantId);
    if (!bucketProbe.ok && bucketProbe.missing) {
      uploadError = bucketProbe.error;
    } else {
      const uploadRes = await uploadToStorageWithRetry(storagePath, file, onProgress);
      if (uploadRes.success) {
        storageBackend = "supabase";
        durable = true;
      } else {
        uploadError = uploadRes.error;
      }
    }
  } else {
    uploadError = "Supabase not configured";
  }

  if (durable && supabase) {
    onProgress?.({ phase: "persisting", pct: 88 });
    const metaRes = await insertEvidenceMetadataRow({
      evidence_id: evidenceId,
      tenant_id: tenantId,
      lab_id: labId,
      evidence_type: kind,
      record_id: recordId,
      visit_id: visitId || null,
      payment_id: paymentId || null,
      storage_path: storagePath,
      storage_backend: "supabase",
      uploaded_by_user_id: uploadedByUserId,
      uploaded_by: uploadedBy,
      uploaded_by_role: uploadedByRole,
      file_name: file.name,
      mime_type: file.type || "image/jpeg",
      size_bytes: file.size,
      remarks: str(params.remarks) || null,
      gps_json: gps,
    });
    if (!metaRes.success) {
      recordEvidenceEvent("evidence.metadata_fail", { error: metaRes.error });
      durable = false;
      uploadError = uploadError || metaRes.error;
    } else {
      previewUrl = await createSignedPreviewUrl(storagePath);
    }
  }

  if (!previewUrl && durable) {
    previewUrl = await createSignedPreviewUrl(storagePath);
  }

  if (!previewUrl && file.size <= 500_000) {
    onProgress?.({ phase: "fallback", pct: 90 });
    try {
      previewUrl = await fileToDataUrl(file);
      storageBackend = "local_embedded";
    } catch {
      uploadError = uploadError || "Could not cache image locally";
    }
  }

  if (!previewUrl) {
    recordEvidenceEvent("evidence.upload_fail", { kind, error: uploadError });
    onProgress?.({ phase: "failed", pct: 100, error: uploadError });
    return {
      success: false,
      error:
        uploadError ||
        "Upload failed. Run operational_evidence_storage_migration.sql or use a smaller image (<500KB).",
      durable: false,
    };
  }

  const record = {
    evidenceId,
    tenantId,
    labId,
    kind,
    visitId,
    paymentId,
    recordId,
    storagePath,
    previewUrl,
    storageBackend,
    uploadedAt: new Date().toISOString(),
    uploadedBy,
    uploadedByUserId,
    uploadedByRole,
    fileName: file.name,
    mimeType: file.type || "image/jpeg",
    sizeBytes: file.size,
    remarks: str(params.remarks),
    gps,
  };

  if (durable) {
    record.storageBackend = "supabase";
  }

  appendLocalIndexRecord(tenantId, record);

  const eventType =
    kind === "visit_photo"
      ? "visit_proof_uploaded"
      : kind.startsWith("collection")
        ? "collection_proof_attached"
        : "payment_receipt_uploaded";

  fireNotificationEvent(
    {
      eventType,
      sourceModule: kind.includes("collection") ? "collections" : "agent_visits",
      sourceId: visitId || paymentId || evidenceId,
      tenantId,
      targetLabId: labId,
      targetRole: "admin",
      actorUserId: uploadedByUserId || uploadedBy,
      severity: "info",
      payload: {
        evidenceId,
        labId,
        visitId,
        paymentId,
        kind,
        storagePath,
        durable,
      },
    },
    "uploadOperationalEvidence"
  );

  recordEvidenceEvent("evidence.upload_success", { kind, storageBackend: record.storageBackend, durable });
  if (kind.startsWith("collection")) {
    recordEvidenceEvent("evidence.collection_attached", { paymentId });
  }

  void appendOperationalEvent({
    tenantId,
    eventType: "proof_uploaded",
    severity: "MONITORING",
    actor: uploadedBy,
    actorRole: uploadedByRole,
    linkedEntityType: "evidence",
    linkedEntityId: evidenceId,
    linkedLabId: labId,
    linkedAgentId: uploadedBy,
    correlationId: visitId ? `visit:${visitId}` : paymentId ? `payment:${paymentId}` : "",
    metadata: {
      fileName: record.fileName,
      kind,
      labName: params.labName,
      summary: `${record.fileName || "Proof"} uploaded`,
    },
    dedupeKey: `proof_uploaded:${evidenceId}`,
    sourceModule: "operational_evidence",
    actorUserId: uploadedByUserId,
  });

  onProgress?.({ phase: "done", pct: 100, durable });

  return { success: true, record, durable };
}

/**
 * Feed items for operations center.
 */
export async function buildEvidenceFeedItems(tenantId, currentUser, limit = 12) {
  const rows = await listOperationalEvidence(tenantId, currentUser, { limit: 40 });
  return rows.slice(0, limit).map((r) => ({
    id: `evidence-${r.evidenceId}`,
    kind: r.kind?.includes("collection") ? "payment" : "visit",
    title:
      r.kind === "visit_photo"
        ? "Visit proof uploaded"
        : r.kind === "collection_receipt"
          ? "Collection receipt uploaded"
          : "Collection proof attached",
    subtitle: r.remarks || r.fileName || r.labId,
    labName: "",
    labId: r.labId,
    createdAt: r.uploadedAt,
    severity: "info",
    evidenceId: r.evidenceId,
  }));
}

/**
 * Refresh signed URL for supabase-backed evidence.
 */
export async function resolveEvidencePreviewUrl(record) {
  if (!record) return null;
  if (record.storageBackend === "local_embedded") return record.previewUrl;
  if (!supabase || !record.storagePath) return record.previewUrl;
  const url = await createSignedPreviewUrl(record.storagePath);
  return url || record.previewUrl;
}
