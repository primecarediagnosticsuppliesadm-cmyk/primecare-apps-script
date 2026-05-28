import { supabase } from "@/api/supabaseClient.js";
import { fireNotificationEvent } from "@/notifications/fireNotificationEvent.js";
import { recordEvidenceEvent } from "@/operations/evidencePredator.js";
import { labIdKey } from "@/utils/labId.js";
import { ROLES } from "@/config/roles.js";

export const EVIDENCE_BUCKET = "operational-evidence";
const INDEX_PREFIX = "primecare_operational_evidence:";

function str(v) {
  return String(v ?? "").trim();
}

function indexKey(tenantId) {
  return `${INDEX_PREFIX}${tenantId || "default"}`;
}

function readIndex(tenantId) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(indexKey(tenantId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIndex(tenantId, rows) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(indexKey(tenantId), JSON.stringify(rows.slice(0, 200)));
  } catch (err) {
    console.warn("[operationalEvidence] index write failed", err);
  }
}

function appendIndexRecord(tenantId, record) {
  const rows = readIndex(tenantId);
  rows.unshift(record);
  writeIndex(tenantId, rows);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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
 * @param {object} params
 * @param {File} params.file
 * @param {string} params.tenantId
 * @param {string} params.labId
 * @param {'visit_photo'|'collection_receipt'|'collection_proof'} params.kind
 * @param {string} [params.visitId]
 * @param {string} [params.paymentId]
 * @param {string} params.uploadedBy
 * @param {string} params.uploadedByRole
 * @param {string} [params.remarks]
 * @param {boolean} [params.captureGps]
 */
export async function uploadOperationalEvidence(params) {
  const file = params.file;
  const tenantId = str(params.tenantId);
  const labId = labIdKey(params.labId);
  const kind = str(params.kind) || "visit_photo";
  const uploadedBy = str(params.uploadedBy);
  const uploadedByRole = str(params.uploadedByRole).toLowerCase();

  if (!file || !labId) {
    return { success: false, error: "File and lab are required." };
  }

  recordEvidenceEvent("evidence.upload_start", { kind, labId });

  const evidenceId = `EVD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const safeName = String(file.name || "proof.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${tenantId || "tenant"}/${labId}/${kind}/${evidenceId}-${safeName}`;

  let previewUrl = null;
  let storageBackend = "index";
  let uploadError = null;

  if (supabase) {
    const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg",
    });
    if (!error) {
      const signed = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(storagePath, 3600);
      previewUrl = signed.data?.signedUrl || null;
      storageBackend = "supabase";
    } else {
      uploadError = error.message;
    }
  } else {
    uploadError = "Supabase not configured";
  }

  if (!previewUrl && file.size <= 500_000) {
    try {
      previewUrl = await fileToDataUrl(file);
      storageBackend = "local_embedded";
    } catch {
      uploadError = uploadError || "Could not cache image locally";
    }
  }

  if (!previewUrl) {
    recordEvidenceEvent("evidence.upload_fail", { kind, error: uploadError });
    return {
      success: false,
      error:
        uploadError ||
        "Upload failed. Configure Supabase Storage bucket operational-evidence or use a smaller image (<500KB).",
    };
  }

  const gps = params.captureGps !== false ? await tryGpsCapture() : null;

  const record = {
    evidenceId,
    tenantId,
    labId,
    kind,
    visitId: str(params.visitId),
    paymentId: str(params.paymentId),
    storagePath,
    previewUrl,
    storageBackend,
    uploadedAt: new Date().toISOString(),
    uploadedBy,
    uploadedByRole,
    fileName: file.name,
    mimeType: file.type || "image/jpeg",
    sizeBytes: file.size,
    remarks: str(params.remarks),
    gps,
  };

  appendIndexRecord(tenantId, record);

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
      sourceId: record.visitId || record.paymentId || record.evidenceId,
      tenantId,
      targetLabId: labId,
      targetRole: "admin",
      actorUserId: uploadedBy,
      severity: "info",
      payload: {
        evidenceId: record.evidenceId,
        labId,
        visitId: record.visitId,
        paymentId: record.paymentId,
        kind,
      },
    },
    "uploadOperationalEvidence"
  );

  recordEvidenceEvent("evidence.upload_success", { kind, storageBackend });
  if (kind.startsWith("collection")) {
    recordEvidenceEvent("evidence.collection_attached", { paymentId: record.paymentId });
  }

  return { success: true, record };
}

/**
 * List evidence for tenant with role filtering.
 */
export function listOperationalEvidence(tenantId, currentUser, filters = {}) {
  const role = str(currentUser?.role).toLowerCase();
  const userId = str(currentUser?.id || currentUser?.userId || currentUser?.agentId);
  let rows = readIndex(tenantId);

  if (role === ROLES.AGENT) {
    const ownerKeys = new Set(
      [userId, str(currentUser?.name), str(currentUser?.agentName), str(currentUser?.agentId)].filter(
        Boolean
      )
    );
    rows = rows.filter((r) => ownerKeys.has(str(r.uploadedBy)));
  } else if (role === ROLES.LAB) {
    return [];
  }

  if (filters.labId) {
    rows = rows.filter((r) => labIdKey(r.labId) === labIdKey(filters.labId));
  }
  if (filters.visitId) {
    rows = rows.filter((r) => str(r.visitId) === str(filters.visitId));
  }
  if (filters.paymentId) {
    rows = rows.filter((r) => str(r.paymentId) === str(filters.paymentId));
  }
  if (filters.kind) {
    rows = rows.filter((r) => str(r.kind) === str(filters.kind));
  }

  return rows.slice(0, filters.limit ?? 50);
}

/**
 * Feed items for operations center (local index; merges with notification feed).
 */
export function buildEvidenceFeedItems(tenantId, currentUser, limit = 12) {
  const rows = listOperationalEvidence(tenantId, currentUser, { limit: 40 });
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
  const signed = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(record.storagePath, 3600);
  return signed.data?.signedUrl || record.previewUrl;
}
