/** Bounded HQ read defaults — prevents unbounded full-table fetches at scale. */

export const HQ_ORDERS_LIST_DEFAULT_LIMIT = 100;
export const HQ_ORDERS_LIST_MAX_LIMIT = 500;
export const HQ_DASHBOARD_ORDERS_LIMIT = 2000;
export const HQ_DASHBOARD_VISITS_LIMIT = 500;
export const HQ_DASHBOARD_RECENT_DAYS = 90;
export const HQ_PAYMENTS_RECENT_DAYS = 90;
export const HQ_PAYMENTS_RECENT_LIMIT = 5000;
export const HQ_COLLECTIONS_AR_LIMIT = 5000;

export const HQ_ORDER_LIST_COLUMNS =
  "id,order_id,lab_id,status,order_date,created_at,total_amount,tenant_id,created_by,notes,agent_id,inventory_updated,fulfilled_at";

export const HQ_ORDER_LINE_COUNT_COLUMNS = "order_id";

export const HQ_AR_COLUMNS =
  "lab_id,lab_name,outstanding,total_paid,credit_limit,credit_hold,tenant_id,total_delivered";

export const HQ_PAYMENT_COLUMNS =
  "payment_id,order_id,lab_id,amount_received,payment_date,mode,tenant_id,created_at,agent_id";

export const HQ_LABS_NAME_COLUMNS = "lab_id,lab_name";

export const HQ_V_LABS_CREDIT_COLUMNS =
  "lab_id,lab_name,outstanding,credit_limit,credit_hold,tenant_id,credit_status,days_overdue";

export const HQ_INVENTORY_COLUMNS =
  "tenant_id,product_id,current_stock,min_stock,reorder_qty,stock_in,stock_out,last_updated";

export const HQ_AGENT_VISIT_COLUMNS =
  "id,lab_id,agent_id,agent_name,visit_date,created_at,notes,visit_type,tenant_id,visit_id";

export function clampLimit(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

export function recentDateYmd(daysBack = HQ_DASHBOARD_RECENT_DAYS) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}
