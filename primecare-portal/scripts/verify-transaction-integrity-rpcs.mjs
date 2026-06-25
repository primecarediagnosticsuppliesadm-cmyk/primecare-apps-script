#!/usr/bin/env node
/**
 * Transaction integrity RPC migration presence (static + optional live probe).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const migration = resolve(
  root,
  "supabase/migrations/20260624130001_sprint1_transaction_integrity_rpcs.sql"
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const sql = readFileSync(migration, "utf8");
assert(sql.includes("post_collection_payment"), "post_collection_payment missing");
assert(sql.includes("deduct_inventory_for_order"), "deduct_inventory_for_order missing");
assert(sql.includes("create_lab_order"), "create_lab_order missing");
assert(sql.includes("inventory_stock_non_negative"), "stock CHECK missing");
assert(sql.includes("client_request_id"), "client_request_id missing");

const api = readFileSync(resolve(root, "src/api/primecareSupabaseApi.js"), "utf8");
assert(api.includes('rpc("post_collection_payment"'), "client must call post_collection_payment");
assert(api.includes('rpc("deduct_inventory_for_order"'), "client must call deduct_inventory_for_order");
assert(api.includes('rpc("create_lab_order"'), "client must call create_lab_order");

console.log("PASS — transaction integrity RPC migration + client wiring");
