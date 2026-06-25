#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const sql = readFileSync(
  resolve(root, "supabase/migrations/20260624130002_sprint1_founder_snapshot_rpc.sql"),
  "utf8"
);
const api = readFileSync(resolve(root, "src/api/founderSnapshotApi.js"), "utf8");
if (!sql.includes("get_founder_snapshot")) throw new Error("migration missing RPC");
if (!api.includes('rpc("get_founder_snapshot"')) throw new Error("client missing RPC call");
console.log("PASS — founder snapshot RPC migration + API");
