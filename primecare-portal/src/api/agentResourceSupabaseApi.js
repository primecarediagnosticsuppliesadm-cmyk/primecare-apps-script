/**
 * Agent Resources V1 publisher + agent consumer API (AR-1B / AR-1C).
 * Publish only via publish_agent_resource_version. Bucket agent-resources only.
 */
import { supabase } from "@/api/supabaseClient.js";
import {
  HQ_AGENT_RESOURCE_ACK_COLUMNS,
  HQ_AGENT_RESOURCE_AGENT_ACK_COLUMNS,
  HQ_AGENT_RESOURCE_AGENT_IDENTITY_COLUMNS,
  HQ_AGENT_RESOURCE_AGENT_LIST_COLUMNS,
  HQ_AGENT_RESOURCE_AGENT_VERSION_COLUMNS,
  HQ_AGENT_RESOURCE_AUDIENCE_COLUMNS,
  HQ_AGENT_RESOURCE_DETAIL_COLUMNS,
  HQ_AGENT_RESOURCE_LIST_COLUMNS,
  HQ_AGENT_RESOURCE_LIST_LIMIT,
  HQ_AGENT_RESOURCE_MAX_FILE_BYTES,
  HQ_AGENT_RESOURCE_SIGNED_URL_TTL_SEC,
  HQ_AGENT_RESOURCE_VERSION_COLUMNS,
  HQ_AGENT_RESOURCE_VERSION_OPEN_COLUMNS,
  clampLimit,
} from "@/api/hqReadBounds.js";
import {
  AGENT_RESOURCE_DOCX_MIME,
  AGENT_RESOURCE_FILE_ACCEPT,
  agentResourceOpenLabel,
  inspectAgentResourceFile as inspectAgentResourceFileBytes,
  isDocxMime,
  sanitizeAgentResourceDownloadName,
} from "@/api/agentResourceFileInspect.js";

export {
  AGENT_RESOURCE_DOCX_MIME,
  AGENT_RESOURCE_FILE_ACCEPT,
  agentResourceOpenLabel,
  isDocxMime,
};

export const AGENT_RESOURCES_BUCKET = "agent-resources";
export const AGENT_RESOURCE_CATEGORIES = [
  { id: "start_here", label: "Start Here" },
  { id: "products_services", label: "Products & Services" },
  { id: "field_sales", label: "Field Sales" },
  { id: "lab_os", label: "Lab OS" },
  { id: "sops", label: "SOPs" },
  { id: "policies", label: "Policies" },
  { id: "training", label: "Training" },
  { id: "other", label: "Other" },
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function str(v) {
  return String(v ?? "").trim();
}

function isUuid(v) {
  return UUID_RE.test(str(v));
}

function tenantFromUser(currentUser) {
  return str(currentUser?.tenantId || currentUser?.tenant_id);
}

function actorFromUser(currentUser) {
  return str(currentUser?.id || currentUser?.userId || currentUser?.user_id);
}

function ensureClient(client = supabase) {
  if (!client) throw new Error("Supabase is not configured");
  return client;
}

function fail(message) {
  return { success: false, error: message, data: null };
}

export function publicAgentResourceError(error, fallback = "Something went wrong. Try again.") {
  const raw = String(error?.message || error || "");
  const lower = raw.toLowerCase();
  if (/named_audience_empty/.test(lower)) {
    return "Add at least one agent before publishing a named-audience resource.";
  }
  if (/publish_not_draft/.test(lower)) return "Only a draft version can be published.";
  if (/publish_resource_archived/.test(lower)) return "Archived resources cannot be published.";
  if (/publish_forbidden|row-level security|42501|permission denied|not authorized/.test(lower)) {
    return "You do not have permission to do that.";
  }
  if (/23505|duplicate|unique/.test(lower)) return "That version already exists. Retry.";
  if (/413|too large|file_size|payload/.test(lower)) return "File is larger than 10 MB.";
  if (/mime|unsupported|docx|wordprocessingml|\.doc\b|zip/.test(lower)) {
    return "Use a PDF, JPEG, PNG, or Word (.docx) file.";
  }
  if (/failed to fetch|networkerror|network/.test(lower)) return "Network error. Check your connection and retry.";
  return fallback;
}

export function categoryLabel(id) {
  return AGENT_RESOURCE_CATEGORIES.find((row) => row.id === id)?.label || id || "—";
}

export function audienceLabel(type) {
  return type === "named_agents" ? "Named Agents" : "All Agents";
}

function randomObjectKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function inspectAgentResourceFile(file) {
  return inspectAgentResourceFileBytes(file, HQ_AGENT_RESOURCE_MAX_FILE_BYTES);
}

async function nextVersionNumber(db, resourceId) {
  const { data, error } = await db
    .from("agent_resource_versions")
    .select("version_number")
    .eq("resource_id", resourceId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.version_number || 0) + 1;
}

async function insertDraftVersion(db, { tenantId, resourceId, actorId, fileMeta, file }) {
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const versionId = crypto.randomUUID();
    const versionNumber = await nextVersionNumber(db, resourceId);
    const storagePath = `${tenantId}/${resourceId}/${versionId}/${randomObjectKey()}`;
    const insert = await db
      .from("agent_resource_versions")
      .insert({
        id: versionId,
        resource_id: resourceId,
        tenant_id: tenantId,
        version_number: versionNumber,
        storage_path: storagePath,
        original_filename: fileMeta.filename,
        mime_type: fileMeta.mime,
        file_size: fileMeta.size,
        status: "draft",
        created_by: actorId || null,
      })
      .select(HQ_AGENT_RESOURCE_VERSION_COLUMNS)
      .single();
      if (!insert.error) {
      const upload = await db.storage.from(AGENT_RESOURCES_BUCKET).upload(storagePath, file, {
        contentType: fileMeta.mime,
        upsert: false,
      });
      if (upload.error) {
        return {
          success: false,
          error: publicAgentResourceError(upload.error, "File upload failed. The draft was not published."),
          data: { version: mapVersion(insert.data), uploadFailed: true },
        };
      }
      return { success: true, error: null, data: { version: mapVersion(insert.data) } };
    }
    lastError = insert.error;
    if (insert.error.code !== "23505" && !/duplicate|unique/i.test(insert.error.message || "")) {
      break;
    }
  }
  return {
    success: false,
    error: publicAgentResourceError(lastError, "Could not create a draft version. Retry."),
    data: null,
  };
}

function mapResource(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    title: row.title,
    description: row.description || "",
    category: row.category,
    requiredReading: Boolean(row.required_reading),
    audienceType: row.audience_type,
    currentPublishedVersionId: row.current_published_version_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at || null,
  };
}

function mapVersion(row) {
  if (!row) return null;
  return {
    id: row.id,
    resourceId: row.resource_id,
    tenantId: row.tenant_id,
    versionNumber: row.version_number,
    originalFilename: row.original_filename || "",
    mimeType: row.mime_type,
    fileSize: row.file_size,
    status: row.status,
    createdAt: row.created_at,
    publishedBy: row.published_by || null,
    publishedAt: row.published_at || null,
    archivedAt: row.archived_at || null,
  };
}

function displayName(profile) {
  return (
    str(profile?.display_name) ||
    str(profile?.agent_name) ||
    str(profile?.username) ||
    "Agent"
  );
}

export async function listActiveTenantAgentsPublisherRead({ currentUser, client = supabase } = {}) {
  try {
    const db = ensureClient(client);
    const tenantId = tenantFromUser(currentUser);
    if (!tenantId) return fail("Sign in again to continue.");
    const { data, error } = await db
      .from("profiles")
      .select(HQ_AGENT_RESOURCE_AGENT_IDENTITY_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("role", "agent")
      .eq("active", true)
      .order("display_name", { ascending: true })
      .limit(500);
    if (error) return fail(publicAgentResourceError(error, "Could not load agents."));
    return {
      success: true,
      error: null,
      data: (data || []).map((row) => ({
        userId: row.user_id,
        name: displayName(row),
        active: row.active !== false,
      })),
    };
  } catch (err) {
    return fail(publicAgentResourceError(err));
  }
}

export async function listAgentResourcesPublisherRead({ currentUser, client = supabase, limit } = {}) {
  try {
    const db = ensureClient(client);
    const tenantId = tenantFromUser(currentUser);
    if (!tenantId) return fail("Sign in again to continue.");
    const take = clampLimit(limit, HQ_AGENT_RESOURCE_LIST_LIMIT, HQ_AGENT_RESOURCE_LIST_LIMIT);
    const res = await db
      .from("agent_resources")
      .select(HQ_AGENT_RESOURCE_LIST_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .limit(take);
    if (res.error) return fail(publicAgentResourceError(res.error, "Could not load resources."));
    const resources = (res.data || []).map(mapResource);
    const publishedIds = resources
      .map((row) => row.currentPublishedVersionId)
      .filter((id) => isUuid(id));
    const versionById = new Map();
    if (publishedIds.length) {
      const vers = await db
        .from("agent_resource_versions")
        .select(HQ_AGENT_RESOURCE_VERSION_COLUMNS)
        .in("id", publishedIds);
      if (!vers.error) {
        for (const row of vers.data || []) versionById.set(row.id, mapVersion(row));
      }
    }
    const agents = await listActiveTenantAgentsPublisherRead({ currentUser, client: db });
    const activeAgentCount = agents.success ? agents.data.length : 0;
    const activeSet = new Set((agents.data || []).map((a) => a.userId));
    const requiredPublished = resources.filter(
      (row) => row.requiredReading && row.currentPublishedVersionId && !row.archivedAt
    );
    const ackCounts = new Map();
    const audienceCounts = new Map();
    if (requiredPublished.length) {
      const versionIds = requiredPublished.map((row) => row.currentPublishedVersionId);
      const acks = await db
        .from("agent_resource_acknowledgements")
        .select("version_id, profile_user_id")
        .in("version_id", versionIds);
      if (!acks.error) {
        for (const row of acks.data || []) {
          if (!activeSet.has(row.profile_user_id)) continue;
          ackCounts.set(row.version_id, (ackCounts.get(row.version_id) || 0) + 1);
        }
      }
      const namedIds = requiredPublished.filter((row) => row.audienceType === "named_agents").map((row) => row.id);
      if (namedIds.length) {
        const aud = await db
          .from("agent_resource_audiences")
          .select("resource_id, profile_user_id")
          .in("resource_id", namedIds);
        if (!aud.error) {
          for (const row of aud.data || []) {
            if (!activeSet.has(row.profile_user_id)) continue;
            audienceCounts.set(row.resource_id, (audienceCounts.get(row.resource_id) || 0) + 1);
          }
        }
      }
    }
    const rows = resources.map((row) => {
      const published = versionById.get(row.currentPublishedVersionId) || null;
      let readStatus = null;
      if (row.requiredReading && published && !row.archivedAt) {
        const denom =
          row.audienceType === "named_agents"
            ? audienceCounts.get(row.id) || 0
            : activeAgentCount;
        readStatus = { read: ackCounts.get(published.id) || 0, total: denom };
      }
      return { ...row, currentPublished: published, readStatus };
    });
    return { success: true, error: null, data: rows };
  } catch (err) {
    return fail(publicAgentResourceError(err));
  }
}

export async function getAgentResourceDetailPublisherRead({
  currentUser,
  resourceId,
  client = supabase,
} = {}) {
  try {
    const db = ensureClient(client);
    const tenantId = tenantFromUser(currentUser);
    if (!tenantId || !isUuid(resourceId)) return fail("Resource not found.");
    const res = await db
      .from("agent_resources")
      .select(HQ_AGENT_RESOURCE_DETAIL_COLUMNS)
      .eq("id", resourceId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (res.error) return fail(publicAgentResourceError(res.error, "Could not load resource."));
    if (!res.data) return fail("Resource not found.");
    const [versions, audiences, acks] = await Promise.all([
      db
        .from("agent_resource_versions")
        .select(HQ_AGENT_RESOURCE_VERSION_COLUMNS)
        .eq("resource_id", resourceId)
        .eq("tenant_id", tenantId)
        .order("version_number", { ascending: false }),
      db
        .from("agent_resource_audiences")
        .select(HQ_AGENT_RESOURCE_AUDIENCE_COLUMNS)
        .eq("resource_id", resourceId)
        .eq("tenant_id", tenantId),
      db
        .from("agent_resource_acknowledgements")
        .select(HQ_AGENT_RESOURCE_ACK_COLUMNS)
        .eq("resource_id", resourceId)
        .eq("tenant_id", tenantId)
        .order("acknowledged_at", { ascending: false })
        .limit(500),
    ]);
    if (versions.error) return fail(publicAgentResourceError(versions.error, "Could not load versions."));
    const profileIds = [
      ...new Set(
        [...(audiences.data || []), ...(acks.data || [])]
          .map((row) => row.profile_user_id)
          .filter(Boolean)
      ),
    ];
    const names = new Map();
    if (profileIds.length) {
      const prof = await db
        .from("profiles")
        .select(HQ_AGENT_RESOURCE_AGENT_IDENTITY_COLUMNS)
        .eq("tenant_id", tenantId)
        .in("user_id", profileIds);
      if (!prof.error) {
        for (const row of prof.data || []) names.set(row.user_id, displayName(row));
      }
    }
    const resource = mapResource(res.data);
    const versionRows = (versions.data || []).map(mapVersion);
    return {
      success: true,
      error: null,
      data: {
        resource,
        versions: versionRows,
        currentPublished: versionRows.find((v) => v.id === resource.currentPublishedVersionId) || null,
        drafts: versionRows.filter((v) => v.status === "draft"),
        history: versionRows.filter((v) => v.status !== "draft"),
        audience: (audiences.data || []).map((row) => ({
          id: row.id,
          profileUserId: row.profile_user_id,
          name: names.get(row.profile_user_id) || "Agent",
        })),
        acknowledgements: (acks.data || []).map((row) => ({
          id: row.id,
          versionId: row.version_id,
          profileUserId: row.profile_user_id,
          name: names.get(row.profile_user_id) || "Agent",
          acknowledgedAt: row.acknowledged_at,
        })),
      },
    };
  } catch (err) {
    return fail(publicAgentResourceError(err));
  }
}

export async function createAgentResourceWrite({
  currentUser,
  title,
  description,
  category,
  audienceType,
  requiredReading,
  namedProfileUserIds,
  file,
  client = supabase,
} = {}) {
  try {
    const db = ensureClient(client);
    const tenantId = tenantFromUser(currentUser);
    const actorId = actorFromUser(currentUser);
    if (!tenantId) return fail("Sign in again to continue.");
    const trimmedTitle = str(title);
    if (!trimmedTitle) return fail("Title is required.");
    if (!AGENT_RESOURCE_CATEGORIES.some((row) => row.id === category)) {
      return fail("Choose a category.");
    }
    const audience = audienceType === "named_agents" ? "named_agents" : "all_agents";
    const namedIds = [...new Set((namedProfileUserIds || []).map(str).filter(isUuid))];
    if (audience === "named_agents" && namedIds.length === 0) {
      return fail("Select at least one agent for a named-audience resource.");
    }
    const fileMeta = await inspectAgentResourceFile(file);
    if (!fileMeta.ok) return fail(fileMeta.error);

    const resourceId = crypto.randomUUID();
    const created = await db
      .from("agent_resources")
      .insert({
        id: resourceId,
        tenant_id: tenantId,
        title: trimmedTitle,
        description: str(description) || null,
        category,
        audience_type: audience,
        required_reading: Boolean(requiredReading),
        created_by: actorId || null,
      })
      .select(HQ_AGENT_RESOURCE_DETAIL_COLUMNS)
      .single();
    if (created.error) return fail(publicAgentResourceError(created.error, "Could not create the resource."));

    if (audience === "named_agents") {
      const aud = await db.from("agent_resource_audiences").insert(
        namedIds.map((profileUserId) => ({
          resource_id: resourceId,
          tenant_id: tenantId,
          profile_user_id: profileUserId,
          created_by: actorId || null,
        }))
      );
      if (aud.error) {
        return fail(publicAgentResourceError(aud.error, "Resource created but audience could not be saved."));
      }
    }

    const version = await insertDraftVersion(db, {
      tenantId,
      resourceId,
      actorId,
      fileMeta,
      file,
    });
    if (!version.success) {
      return {
        success: false,
        error: version.error,
        data: { resource: mapResource(created.data), ...version.data },
      };
    }
    return {
      success: true,
      error: null,
      data: { resource: mapResource(created.data), version: version.data.version },
    };
  } catch (err) {
    return fail(publicAgentResourceError(err));
  }
}

export async function createAgentResourceVersionWrite({
  currentUser,
  resourceId,
  file,
  client = supabase,
} = {}) {
  try {
    const db = ensureClient(client);
    const tenantId = tenantFromUser(currentUser);
    const actorId = actorFromUser(currentUser);
    if (!tenantId || !isUuid(resourceId)) return fail("Resource not found.");
    const fileMeta = await inspectAgentResourceFile(file);
    if (!fileMeta.ok) return fail(fileMeta.error);
    const existing = await db
      .from("agent_resources")
      .select("id, archived_at")
      .eq("id", resourceId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (existing.error || !existing.data) return fail("Resource not found.");
    if (existing.data.archived_at) return fail("Archived resources cannot get new versions.");
    return insertDraftVersion(db, { tenantId, resourceId, actorId, fileMeta, file });
  } catch (err) {
    return fail(publicAgentResourceError(err));
  }
}

export async function updateAgentResourceMetadataWrite({
  currentUser,
  resourceId,
  title,
  description,
  category,
  requiredReading,
  audienceType,
  client = supabase,
} = {}) {
  try {
    const db = ensureClient(client);
    const tenantId = tenantFromUser(currentUser);
    if (!tenantId || !isUuid(resourceId)) return fail("Resource not found.");
    const patch = {};
    if (title !== undefined) {
      const trimmed = str(title);
      if (!trimmed) return fail("Title is required.");
      patch.title = trimmed;
    }
    if (description !== undefined) patch.description = str(description) || null;
    if (category !== undefined) {
      if (!AGENT_RESOURCE_CATEGORIES.some((row) => row.id === category)) return fail("Choose a category.");
      patch.category = category;
    }
    if (requiredReading !== undefined) patch.required_reading = Boolean(requiredReading);
    if (audienceType !== undefined) {
      patch.audience_type = audienceType === "named_agents" ? "named_agents" : "all_agents";
    }
    if (!Object.keys(patch).length) return fail("Nothing to update.");
    const { data, error } = await db
      .from("agent_resources")
      .update(patch)
      .eq("id", resourceId)
      .eq("tenant_id", tenantId)
      .select(HQ_AGENT_RESOURCE_DETAIL_COLUMNS)
      .maybeSingle();
    if (error) return fail(publicAgentResourceError(error, "Could not save changes."));
    if (!data) return fail("Resource not found.");
    return { success: true, error: null, data: mapResource(data) };
  } catch (err) {
    return fail(publicAgentResourceError(err));
  }
}

export async function replaceAgentResourceAudienceWrite({
  currentUser,
  resourceId,
  audienceType,
  namedProfileUserIds,
  client = supabase,
} = {}) {
  try {
    const db = ensureClient(client);
    const tenantId = tenantFromUser(currentUser);
    const actorId = actorFromUser(currentUser);
    if (!tenantId || !isUuid(resourceId)) return fail("Resource not found.");
    const nextType = audienceType === "named_agents" ? "named_agents" : "all_agents";
    const namedIds = [...new Set((namedProfileUserIds || []).map(str).filter(isUuid))];

    if (nextType === "named_agents") {
      if (!namedIds.length) return fail("Select at least one agent for a named-audience resource.");
      const agents = await listActiveTenantAgentsPublisherRead({ currentUser, client: db });
      if (!agents.success) return agents;
      const allowed = new Set(agents.data.map((row) => row.userId));
      if (namedIds.some((id) => !allowed.has(id))) {
        return fail("Named audience can include only active agents.");
      }
      const inserts = namedIds.map((profileUserId) => ({
        resource_id: resourceId,
        tenant_id: tenantId,
        profile_user_id: profileUserId,
        created_by: actorId || null,
      }));
      const ins = await db.from("agent_resource_audiences").upsert(inserts, {
        onConflict: "resource_id,profile_user_id",
        ignoreDuplicates: true,
      });
      if (ins.error) return fail(publicAgentResourceError(ins.error, "Could not save audience."));
      const extra = await db
        .from("agent_resource_audiences")
        .delete()
        .eq("resource_id", resourceId)
        .eq("tenant_id", tenantId)
        .not("profile_user_id", "in", `(${namedIds.join(",")})`);
      if (extra.error) return fail(publicAgentResourceError(extra.error, "Could not update audience."));
      const typed = await updateAgentResourceMetadataWrite({
        currentUser,
        resourceId,
        audienceType: "named_agents",
        client: db,
      });
      if (!typed.success) return typed;
      return { success: true, error: null, data: typed.data };
    }

    const typed = await updateAgentResourceMetadataWrite({
      currentUser,
      resourceId,
      audienceType: "all_agents",
      client: db,
    });
    if (!typed.success) return typed;
    const cleared = await db
      .from("agent_resource_audiences")
      .delete()
      .eq("resource_id", resourceId)
      .eq("tenant_id", tenantId);
    if (cleared.error) {
      return {
        success: true,
        error: null,
        data: typed.data,
        warning: "Audience type is All Agents. Extra named rows could not be cleared.",
      };
    }
    return { success: true, error: null, data: typed.data };
  } catch (err) {
    return fail(publicAgentResourceError(err));
  }
}

export async function publishAgentResourceVersionWrite({
  currentUser,
  versionId,
  client = supabase,
} = {}) {
  try {
    const db = ensureClient(client);
    if (!tenantFromUser(currentUser) || !isUuid(versionId)) return fail("Version not found.");
    const { data, error } = await db.rpc("publish_agent_resource_version", { p_version_id: versionId });
    if (error) return fail(publicAgentResourceError(error, "Publish failed."));
    return { success: true, error: null, data: { versionId: data || versionId } };
  } catch (err) {
    return fail(publicAgentResourceError(err));
  }
}

export async function archiveAgentResourceWrite({
  currentUser,
  resourceId,
  client = supabase,
} = {}) {
  try {
    const db = ensureClient(client);
    const tenantId = tenantFromUser(currentUser);
    if (!tenantId || !isUuid(resourceId)) return fail("Resource not found.");
    const { data, error } = await db
      .from("agent_resources")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", resourceId)
      .eq("tenant_id", tenantId)
      .select(HQ_AGENT_RESOURCE_DETAIL_COLUMNS)
      .maybeSingle();
    if (error) return fail(publicAgentResourceError(error, "Could not archive."));
    if (!data) return fail("Resource not found.");
    return { success: true, error: null, data: mapResource(data) };
  } catch (err) {
    return fail(publicAgentResourceError(err));
  }
}

export async function getAgentResourceSignedUrl({
  currentUser,
  versionId,
  client = supabase,
} = {}) {
  try {
    const db = ensureClient(client);
    const tenantId = tenantFromUser(currentUser);
    if (!tenantId || !isUuid(versionId)) {
      return fail("Unable to open this resource right now. Please try again.");
    }
    const { data, error } = await db
      .from("agent_resource_versions")
      .select(HQ_AGENT_RESOURCE_VERSION_OPEN_COLUMNS)
      .eq("id", versionId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) return fail("Unable to open this resource right now. Please try again.");
    if (!data?.storage_path) return fail("Unable to open this resource right now. Please try again.");
    const filename = sanitizeAgentResourceDownloadName(
      data.original_filename,
      isDocxMime(data.mime_type) ? "resource.docx" : "resource"
    );
    const signed = isDocxMime(data.mime_type)
      ? await db.storage
          .from(AGENT_RESOURCES_BUCKET)
          .createSignedUrl(data.storage_path, HQ_AGENT_RESOURCE_SIGNED_URL_TTL_SEC, {
            download: filename,
          })
      : await db.storage
          .from(AGENT_RESOURCES_BUCKET)
          .createSignedUrl(data.storage_path, HQ_AGENT_RESOURCE_SIGNED_URL_TTL_SEC);
    if (signed.error || !signed.data?.signedUrl) {
      return fail("Unable to open this resource right now. Please try again.");
    }
    return {
      success: true,
      error: null,
      data: {
        url: signed.data.signedUrl,
        filename,
        mimeType: data.mime_type || "",
        expiresAt: new Date(Date.now() + HQ_AGENT_RESOURCE_SIGNED_URL_TTL_SEC * 1000).toISOString(),
      },
    };
  } catch (err) {
    return fail("Unable to open this resource right now. Please try again.");
  }
}

async function sessionUserId(db, currentUser) {
  try {
    const { data } = await db.auth.getUser();
    if (data?.user?.id) return str(data.user.id);
  } catch {
    /* fall through */
  }
  return actorFromUser(currentUser);
}

export async function listAgentResourcesAgentRead({ currentUser, client = supabase } = {}) {
  try {
    const db = ensureClient(client);
    const tenantId = tenantFromUser(currentUser);
    const selfId = await sessionUserId(db, currentUser);
    if (!tenantId || !selfId) return fail("Sign in again to continue.");
    const res = await db
      .from("agent_resources")
      .select(HQ_AGENT_RESOURCE_AGENT_LIST_COLUMNS)
      .eq("tenant_id", tenantId)
      .is("archived_at", null)
      .not("current_published_version_id", "is", null)
      .order("category", { ascending: true })
      .limit(HQ_AGENT_RESOURCE_LIST_LIMIT);
    if (res.error) return fail(publicAgentResourceError(res.error, "Could not load resources."));
    const resources = res.data || [];
    const versionIds = resources.map((row) => row.current_published_version_id).filter(isUuid);
    const versionById = new Map();
    if (versionIds.length) {
      const vers = await db
        .from("agent_resource_versions")
        .select(HQ_AGENT_RESOURCE_AGENT_VERSION_COLUMNS)
        .in("id", versionIds);
      if (vers.error) return fail(publicAgentResourceError(vers.error, "Could not load resources."));
      for (const row of vers.data || []) versionById.set(row.id, row);
    }
    const ackByVersion = new Map();
    if (versionIds.length) {
      const acks = await db
        .from("agent_resource_acknowledgements")
        .select(HQ_AGENT_RESOURCE_AGENT_ACK_COLUMNS)
        .eq("profile_user_id", selfId)
        .in("version_id", versionIds);
      if (!acks.error) {
        for (const row of acks.data || []) ackByVersion.set(row.version_id, row.acknowledged_at);
      }
    }
    const data = resources
      .map((row) => {
        const version = versionById.get(row.current_published_version_id);
        if (!version || version.status !== "published") return null;
        const acknowledgedAt = ackByVersion.get(version.id) || null;
        return {
          id: row.id,
          title: row.title,
          description: row.description || "",
          category: row.category,
          requiredReading: Boolean(row.required_reading),
          versionId: version.id,
          versionNumber: version.version_number,
          mimeType: version.mime_type,
          publishedAt: version.published_at || null,
          acknowledgedAt,
          acknowledged: Boolean(acknowledgedAt),
        };
      })
      .filter(Boolean);
    return { success: true, error: null, data };
  } catch (err) {
    return fail(publicAgentResourceError(err, "Could not load resources."));
  }
}

export async function acknowledgeAgentResourceVersionWrite({
  currentUser,
  resourceId,
  versionId,
  client = supabase,
} = {}) {
  try {
    const db = ensureClient(client);
    const tenantId = tenantFromUser(currentUser);
    const selfId = await sessionUserId(db, currentUser);
    if (!tenantId || !selfId) return fail("Sign in again to continue.");
    if (!isUuid(resourceId) || !isUuid(versionId)) {
      return fail("Could not mark this resource as read. Please try again.");
    }
    const ins = await db
      .from("agent_resource_acknowledgements")
      .insert({
        tenant_id: tenantId,
        resource_id: resourceId,
        version_id: versionId,
        profile_user_id: selfId,
      })
      .select(HQ_AGENT_RESOURCE_AGENT_ACK_COLUMNS)
      .maybeSingle();
    if (!ins.error && ins.data) {
      return {
        success: true,
        error: null,
        data: { versionId, acknowledgedAt: ins.data.acknowledged_at, acknowledged: true },
      };
    }
    const duplicate = ins.error?.code === "23505" || /duplicate|unique/i.test(ins.error?.message || "");
    if (duplicate) {
      const existing = await db
        .from("agent_resource_acknowledgements")
        .select(HQ_AGENT_RESOURCE_AGENT_ACK_COLUMNS)
        .eq("profile_user_id", selfId)
        .eq("version_id", versionId)
        .maybeSingle();
      if (existing.data?.acknowledged_at) {
        return {
          success: true,
          error: null,
          data: { versionId, acknowledgedAt: existing.data.acknowledged_at, acknowledged: true },
        };
      }
      return {
        success: true,
        error: null,
        data: { versionId, acknowledgedAt: new Date().toISOString(), acknowledged: true },
      };
    }
    return fail("Could not mark this resource as read. Please try again.");
  } catch (err) {
    return fail("Could not mark this resource as read. Please try again.");
  }
}
