#!/usr/bin/env node
/**
 * Agent Resources file-type inspection: PDF/JPEG/PNG magic bytes + DOCX OPC package.
 * Static. Does not call Production or QA.
 */
import { inspectAgentResourceFile } from "../src/api/agentResourceFileInspect.js";

const MAX = 10485760;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

let failures = 0;
function pass(id, d) {
  console.log(`PASS  ${id}: ${d}`);
}
function fail(id, d) {
  console.error(`FAIL  ${id}: ${d}`);
  failures += 1;
}
function assert(c, id, d) {
  if (c) pass(id, d);
  else fail(id, d);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(files) {
  const encoder = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of files) {
    const nameBytes = encoder.encode(entry.name);
    const data =
      entry.content instanceof Uint8Array ? entry.content : encoder.encode(entry.content || "");
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const total = offset + cdSize + 22;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of locals) {
    out.set(part, pos);
    pos += part.length;
  }
  for (const part of centrals) {
    out.set(part, pos);
    pos += part.length;
  }
  out.set(eocd, pos);
  return out;
}

function fakeFile(name, bytes, type) {
  return new File([bytes], name, { type });
}

const MIN_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25]);
const MIN_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const MIN_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const OLE = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const VALID_DOCX = storedZip([
  { name: "[Content_Types].xml", content: "<Types/>" },
  { name: "word/document.xml", content: "<w:document/>" },
]);
const SPOOF_ZIP = storedZip([{ name: "readme.txt", content: "not a word file" }]);
const XLSX_AS_DOCX = storedZip([
  { name: "[Content_Types].xml", content: "<Types/>" },
  { name: "xl/workbook.xml", content: "<workbook/>" },
]);
const PPTX_AS_DOCX = storedZip([
  { name: "[Content_Types].xml", content: "<Types/>" },
  { name: "ppt/presentation.xml", content: "<ppt/>" },
]);
const DOCM_AS_DOCX = storedZip([
  { name: "[Content_Types].xml", content: "<Types/>" },
  { name: "word/document.xml", content: "<w:document/>" },
  { name: "word/vbaProject.bin", content: "vba" },
]);
const EMPTY_WORD_DIR = storedZip([
  { name: "[Content_Types].xml", content: "<Types/>" },
  { name: "word/", content: "" },
]);

const cases = [
  {
    id: "pass.pdf",
    file: fakeFile("guide.pdf", MIN_PDF, "application/pdf"),
    ok: true,
    mime: "application/pdf",
  },
  {
    id: "pass.jpeg",
    file: fakeFile("sheet.jpg", MIN_JPEG, "image/jpeg"),
    ok: true,
    mime: "image/jpeg",
  },
  {
    id: "pass.png",
    file: fakeFile("sheet.png", MIN_PNG, "image/png"),
    ok: true,
    mime: "image/png",
  },
  {
    id: "pass.docx",
    file: fakeFile("playbook.docx", VALID_DOCX, DOCX_MIME),
    ok: true,
    mime: DOCX_MIME,
  },
  {
    id: "pass.docx_zip_browser_mime",
    file: fakeFile("playbook.docx", VALID_DOCX, "application/zip"),
    ok: true,
    mime: DOCX_MIME,
  },
  {
    id: "fail.doc",
    file: fakeFile("legacy.doc", OLE, "application/msword"),
    ok: false,
  },
  {
    id: "fail.docm",
    file: fakeFile("macro.docm", VALID_DOCX, "application/vnd.ms-word.document.macroEnabled.12"),
    ok: false,
  },
  {
    id: "fail.zip",
    file: fakeFile("pack.zip", SPOOF_ZIP, "application/zip"),
    ok: false,
  },
  {
    id: "fail.xlsx",
    file: fakeFile("grid.xlsx", XLSX_AS_DOCX, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ok: false,
  },
  {
    id: "fail.pptx",
    file: fakeFile("deck.pptx", PPTX_AS_DOCX, "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    ok: false,
  },
  {
    id: "fail.docx_spoof_zip",
    file: fakeFile("guide.docx", SPOOF_ZIP, DOCX_MIME),
    ok: false,
  },
  {
    id: "fail.docx_xlsx_package",
    file: fakeFile("guide.docx", XLSX_AS_DOCX, DOCX_MIME),
    ok: false,
  },
  {
    id: "fail.docx_pptx_package",
    file: fakeFile("guide.docx", PPTX_AS_DOCX, DOCX_MIME),
    ok: false,
  },
  {
    id: "fail.docx_vba",
    file: fakeFile("guide.docx", DOCM_AS_DOCX, DOCX_MIME),
    ok: false,
  },
  {
    id: "fail.docx_no_document_xml",
    file: fakeFile("guide.docx", EMPTY_WORD_DIR, DOCX_MIME),
    ok: false,
  },
  {
    id: "fail.docx_ole",
    file: fakeFile("guide.docx", OLE, DOCX_MIME),
    ok: false,
  },
  {
    id: "fail.too_large",
    file: {
      name: "huge.pdf",
      type: "application/pdf",
      size: MAX + 1,
      slice: () => new Blob([MIN_PDF]),
      arrayBuffer: async () => MIN_PDF.buffer,
    },
    ok: false,
  },
];

for (const row of cases) {
  const result = await inspectAgentResourceFile(row.file, MAX);
  if (row.ok) {
    assert(result.ok === true && result.mime === row.mime, row.id, result.error || row.mime);
  } else {
    assert(result.ok === false && Boolean(result.error), row.id, result.error || "expected reject");
  }
}

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO — Agent Resources file types\n");
