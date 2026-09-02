/**
 * Agent Resources file inspection (no Supabase). PDF/JPEG/PNG magic bytes plus
 * DOCX as an OPC package (ZIP names only — no decompression, no extra deps).
 */
export const AGENT_RESOURCE_DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const AGENT_RESOURCE_ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  AGENT_RESOURCE_DOCX_MIME,
]);

export const AGENT_RESOURCE_FILE_ACCEPT =
  "application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.jpg,.jpeg,.png,.docx";

const BLOCKED_EXTENSIONS = new Set([
  "doc",
  "dot",
  "docm",
  "dotm",
  "zip",
  "xlsx",
  "xlsm",
  "xls",
  "pptx",
  "pptm",
  "ppt",
]);

const MAX_ZIP_ENTRIES = 4096;

function str(v) {
  return String(v ?? "").trim();
}

export function isDocxMime(mime) {
  return str(mime).toLowerCase() === AGENT_RESOURCE_DOCX_MIME;
}

export function agentResourceOpenLabel(mime) {
  return isDocxMime(mime) ? "Download" : "Open";
}

export function sanitizeAgentResourceDownloadName(filename, fallback = "resource.docx") {
  const base = str(filename).split(/[/\\]/).pop() || fallback;
  const cleaned = base.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 180);
  return cleaned || fallback;
}

function extensionOf(name) {
  const base = str(name).split(/[/\\]/).pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

function mapBrowserMime(file) {
  const type = str(file?.type).toLowerCase();
  if (type === "image/jpg") return "image/jpeg";
  return type;
}

function isPdfHeader(header) {
  return header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46;
}

function isPngHeader(header) {
  return header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
}

function isJpegHeader(header) {
  return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
}

function isZipHeader(header) {
  return header[0] === 0x50 && header[1] === 0x4b && (header[2] === 0x03 || header[2] === 0x05 || header[2] === 0x07);
}

function isOleHeader(header) {
  return header[0] === 0xd0 && header[1] === 0xcf && header[2] === 0x11 && header[3] === 0xe0;
}

function readU16(view, offset) {
  if (offset + 2 > view.byteLength) return 0;
  return view.getUint16(offset, true);
}

function readU32(view, offset) {
  if (offset + 4 > view.byteLength) return 0;
  return view.getUint32(offset, true);
}

function decodeName(bytes) {
  try {
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

function listZipNamesFromCentralDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdSig = 0x06054b50;
  const start = Math.max(0, bytes.length - 65557);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= start; i -= 1) {
    if (readU32(view, i) === eocdSig) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const cdEntries = readU16(view, eocd + 10);
  const cdSize = readU32(view, eocd + 12);
  const cdOffset = readU32(view, eocd + 16);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff || cdEntries > MAX_ZIP_ENTRIES) return [];
  const names = [];
  let pos = cdOffset;
  const cdSig = 0x02014b50;
  const limit = Math.min(cdEntries, MAX_ZIP_ENTRIES);
  for (let n = 0; n < limit && pos + 46 <= bytes.length; n += 1) {
    if (readU32(view, pos) !== cdSig) break;
    const nameLen = readU16(view, pos + 28);
    const extraLen = readU16(view, pos + 30);
    const commentLen = readU16(view, pos + 32);
    const nameStart = pos + 46;
    const nameEnd = nameStart + nameLen;
    if (nameEnd > bytes.length) break;
    names.push(decodeName(bytes.subarray(nameStart, nameEnd)).replace(/\\/g, "/"));
    pos = nameEnd + extraLen + commentLen;
  }
  return names;
}

function listZipNamesFromLocalHeaders(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const names = [];
  let pos = 0;
  const localSig = 0x04034b50;
  for (let n = 0; n < MAX_ZIP_ENTRIES && pos + 30 <= bytes.length; n += 1) {
    if (readU32(view, pos) !== localSig) break;
    const flags = readU16(view, pos + 6);
    const nameLen = readU16(view, pos + 26);
    const extraLen = readU16(view, pos + 28);
    const compSize = readU32(view, pos + 18);
    const nameStart = pos + 30;
    const nameEnd = nameStart + nameLen;
    if (nameEnd > bytes.length) break;
    names.push(decodeName(bytes.subarray(nameStart, nameEnd)).replace(/\\/g, "/"));
    if (flags & 0x8) break;
    pos = nameEnd + extraLen + compSize;
  }
  return names;
}

export function listZipEntryNames(bytes) {
  if (!bytes || bytes.length < 22) return [];
  const fromCd = listZipNamesFromCentralDirectory(bytes);
  if (Array.isArray(fromCd) && fromCd.length) return fromCd;
  return listZipNamesFromLocalHeaders(bytes);
}

export function inspectDocxPackageNames(names) {
  const list = (names || []).map((name) => str(name).replace(/\\/g, "/"));
  const hasContentTypes = list.some(
    (name) => name === "[Content_Types].xml" || name.endsWith("/[Content_Types].xml")
  );
  const hasWordDir = list.some((name) => name === "word/" || name.startsWith("word/"));
  const hasDocument = list.some((name) => name === "word/document.xml");
  const hasVba = list.some((name) => /vbaProject\.bin$/i.test(name));
  const hasXl = list.some((name) => name === "xl/" || name.startsWith("xl/"));
  const hasPpt = list.some((name) => name === "ppt/" || name.startsWith("ppt/"));
  if (hasVba) return { ok: false, error: "Macro-enabled Word files are not allowed." };
  if (hasXl && !hasWordDir) return { ok: false, error: "Excel files are not allowed. Use PDF, JPEG, PNG, or DOCX." };
  if (hasPpt && !hasWordDir) {
    return { ok: false, error: "PowerPoint files are not allowed. Use PDF, JPEG, PNG, or DOCX." };
  }
  if (!hasContentTypes || !hasWordDir || !hasDocument) {
    return { ok: false, error: "That file is not a valid Word document." };
  }
  return { ok: true };
}

async function inspectDocxFile(file) {
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (isOleHeader(header)) {
    return { ok: false, error: "Legacy Word (.doc) files are not allowed. Save as .docx or PDF." };
  }
  if (!isZipHeader(header)) {
    return { ok: false, error: "That file is not a valid Word document." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const names = listZipEntryNames(bytes);
  const pack = inspectDocxPackageNames(names);
  if (!pack.ok) return pack;
  return {
    ok: true,
    mime: AGENT_RESOURCE_DOCX_MIME,
    size: file.size,
    filename: str(file.name) || "document.docx",
  };
}

export async function inspectAgentResourceFile(file, maxBytes) {
  if (!file) return { ok: false, error: "Choose a file to upload." };
  const name = str(file.name);
  const ext = extensionOf(name);
  if (BLOCKED_EXTENSIONS.has(ext)) {
    if (ext === "doc" || ext === "dot") {
      return { ok: false, error: "Legacy Word (.doc) files are not allowed. Save as .docx or PDF." };
    }
    if (ext === "docm" || ext === "dotm") {
      return { ok: false, error: "Macro-enabled Word files are not allowed." };
    }
    if (ext === "zip") {
      return { ok: false, error: "ZIP files are not allowed. Use PDF, JPEG, PNG, or DOCX." };
    }
    if (ext === "xlsx" || ext === "xlsm" || ext === "xls") {
      return { ok: false, error: "Excel files are not allowed. Use PDF, JPEG, PNG, or DOCX." };
    }
    return { ok: false, error: "PowerPoint files are not allowed. Use PDF, JPEG, PNG, or DOCX." };
  }
  if (file.size <= 0) return { ok: false, error: "The file is empty." };
  if (Number.isFinite(maxBytes) && file.size > maxBytes) {
    return { ok: false, error: "File is larger than 10 MB." };
  }
  const browserMime = mapBrowserMime(file);
  if (ext === "docx" || browserMime === AGENT_RESOURCE_DOCX_MIME) {
    if (ext !== "docx") {
      return { ok: false, error: "Word files must use the .docx extension." };
    }
    try {
      return await inspectDocxFile(file);
    } catch {
      return { ok: false, error: "Could not read the file. Try another file." };
    }
  }
  if (browserMime === "application/zip" || ext === "zip") {
    return { ok: false, error: "ZIP files are not allowed. Use PDF, JPEG, PNG, or DOCX." };
  }
  const mime = browserMime;
  if (!AGENT_RESOURCE_ALLOWED_MIME.has(mime) || isDocxMime(mime)) {
    return { ok: false, error: "Use a PDF, JPEG, PNG, or Word (.docx) file." };
  }
  try {
    const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (mime === "application/pdf" && !isPdfHeader(header)) {
      return { ok: false, error: "That file is not a valid PDF." };
    }
    if (mime === "image/png" && !isPngHeader(header)) {
      return { ok: false, error: "That file is not a valid PNG." };
    }
    if (mime === "image/jpeg" && !isJpegHeader(header)) {
      return { ok: false, error: "That file is not a valid JPEG." };
    }
  } catch {
    return { ok: false, error: "Could not read the file. Try another file." };
  }
  return { ok: true, mime, size: file.size, filename: name || "document" };
}
