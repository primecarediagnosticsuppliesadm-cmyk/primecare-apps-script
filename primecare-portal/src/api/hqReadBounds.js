/** Bounded HQ read defaults — prevents unbounded full-table fetches at scale. */

export const HQ_ORDERS_LIST_DEFAULT_LIMIT = 100;
export const HQ_ORDERS_LIST_MAX_LIMIT = 500;
export const HQ_DASHBOARD_ORDERS_LIMIT = 2000;
export const HQ_DASHBOARD_VISITS_LIMIT = 500;
export const HQ_DASHBOARD_RECENT_DAYS = 90;
export const HQ_PAYMENTS_RECENT_DAYS = 90;
export const HQ_PAYMENTS_RECENT_LIMIT = 5000;
export const HQ_COLLECTIONS_AR_LIMIT = 5000;
export const HQ_LABS_CREDIT_LIMIT = 5000;
export const HQ_QUALIFICATION_LIMIT = 5000;
export const HQ_INVENTORY_HEALTH_LIMIT = 5000;
export const HQ_INVENTORY_LEDGER_LIMIT = 10000;
export const HQ_INVENTORY_LEDGER_RECENT_DAYS = 90;
export const HQ_SEARCH_CATALOG_LIMIT = 2000;
export const HQ_SEARCH_STOCK_LIMIT = 2000;
export const HQ_PURCHASE_ORDER_LIMIT = 1000;
export const HQ_STOCK_DASHBOARD_LIMIT = 5000;
export const HQ_LAB_CATALOG_LIMIT = 2000;
export const HQ_REORDER_CANDIDATES_LIMIT = 2000;
export const HQ_LAB_ORDERS_RECENT_LIMIT = 50;
export const HQ_INVOICE_LIST_DEFAULT_LIMIT = 25;
export const HQ_INVOICE_LIST_MAX_LIMIT = 100;
export const HQ_INVOICE_ORDER_LOOKUP_CHUNK = 100;
export const HQ_READ_CACHE_TTL_MS = 45_000;

export const HQ_COMPENSATION_PERIODS_LIMIT = 120;
export const HQ_COMPENSATION_RUNS_LIMIT = 500;
export const HQ_COMPENSATION_LINES_LIMIT = 2000;
export const HQ_COMPENSATION_COMMISSION_LIMIT = 2000;
export const HQ_COMPENSATION_AUDIT_LIMIT = 1000;
export const HQ_COMPENSATION_EXPORT_LIMIT = 500;

export const HQ_PAYROLL_PERIOD_READ_COLUMNS =
  "id,tenant_id,period_ym,period_start,period_end,pay_date,status,submitted_at,approved_at,locked_at,exported_at,metadata,created_at,updated_at";
export const HQ_PAYROLL_RUN_READ_COLUMNS =
  "id,tenant_id,period_id,run_number,status,generated_at,submitted_at,approved_at,locked_at,exported_at,totals_json,metadata,created_at,updated_at";
export const HQ_PAYROLL_LINE_READ_COLUMNS =
  "id,tenant_id,payroll_run_id,period_id,plan_assignment_id,commission_entry_id,agent_id,agent_name,profile_user_id,employee_name,employee_role,salary_amount,fuel_allowance,mobile_allowance,commission_amount,collection_incentive,delivery_incentive,qualification_incentive,attendance_incentive,quarterly_bonus,annual_bonus,manual_adjustments_total,penalties_total,recoveries_total,gross_pay,deductions_total,net_payable,line_status,calculation_snapshot,metadata,created_at,updated_at";
export const HQ_COMPENSATION_PLAN_READ_COLUMNS =
  "id,tenant_id,plan_code,version,role_scope,effective_from,effective_to,base_salary,fuel_allowance,mobile_allowance,commission_rate_bps,promotion_salary,promotion_commission_rate_bps,promotion_collection_threshold,promotion_min_efficiency_pct,promotion_max_overdue_days,status";
export const HQ_COMPENSATION_ASSIGNMENT_READ_COLUMNS =
  "id,tenant_id,plan_id,profile_user_id,agent_id,agent_name,employee_name,employee_role,assignment_status,start_date,end_date";
export const HQ_COMPENSATION_COMMISSION_READ_COLUMNS =
  "id,tenant_id,period_id,agent_id,agent_name,profile_user_id,attributable_cash_collected,commission_rate_bps,commission_amount,eligibility_status,blocked_reason,rule_version,status,metadata,created_at,updated_at";
export const HQ_COMPENSATION_AUDIT_READ_COLUMNS =
  "id,tenant_id,event_type,entity_type,entity_id,actor_user_id,actor_role,before_json,after_json,reason,metadata,created_at";
export const HQ_COMPENSATION_EXPORT_READ_COLUMNS =
  "id,tenant_id,payroll_run_id,period_id,export_format,storage_path,checksum,metadata,created_at,generated_by";
export const HQ_COMPENSATION_ADJUSTMENT_READ_COLUMNS =
  "id,tenant_id,period_id,payroll_run_id,payroll_run_line_id,agent_id,agent_name,adjustment_type,component,amount,reason,notes,requested_by,approved_by,approved_at,status,metadata,created_at,updated_at";

export const HQ_ORDER_LIST_COLUMNS =
  "id,order_id,lab_id,status,order_date,created_at,total_amount,merchandise_subtotal,delivery_charge_amount,delivery_charge_reason,delivery_method_intent,delivery_charge_status,tenant_id,created_by,notes,agent_id,inventory_updated,fulfilled_at,invoice_id";

export const HQ_ORDER_LINE_COUNT_COLUMNS = "order_id";

/**
 * @deprecated Use ORDER_LINES_METRIC_COLUMNS / ORDER_ITEMS_METRIC_COLUMNS from orderLineMetricsSupport.js.
 * Kept for callers that still import this symbol; do not use in new PostgREST selects.
 */
export const HQ_ORDER_LINE_METRIC_COLUMNS =
  "order_id,quantity,unit_selling_price,net_line_total,unit_price,total_price";

export const HQ_AR_COLUMNS =
  "lab_id,lab_name,outstanding,total_paid,credit_limit,credit_hold,tenant_id,total_delivered";

export const HQ_PAYMENT_COLUMNS =
  "payment_id,order_id,lab_id,amount_received,payment_date,mode,tenant_id,created_at,agent_id";

/** Bounded invoice list projection (Phase 2+ reads). */
export const HQ_INVOICE_LIST_COLUMNS =
  "id,tenant_id,lab_id,order_id,invoice_number,invoice_date,due_date,subtotal,tax_amount,total_amount,status,pdf_storage_path,pdf_generated_at,sent_at,paid_at,created_at,updated_at";

/** Bounded invoice line projection for detail reads. */
export const HQ_INVOICE_LINE_COLUMNS =
  "id,tenant_id,invoice_id,line_number,order_id,product_id,product_name,sku,quantity,unit_price,tax_rate,tax_amount,line_total,created_at";

/** Bounded payment allocation projection. */
export const HQ_INVOICE_ALLOCATION_COLUMNS =
  "id,tenant_id,payment_id,invoice_id,allocated_amount,created_at,created_by";

export const HQ_LABS_NAME_COLUMNS = "lab_id,lab_name";

export const HQ_V_LABS_CREDIT_COLUMNS =
  "lab_id,lab_name,outstanding,credit_limit,credit_hold,tenant_id,credit_status,days_overdue";

/** Full v_labs_credit projection for LabsPage / Agent workspace mapping (view-safe columns only). */
export const HQ_V_LABS_CREDIT_LIST_COLUMNS =
  "lab_id,lab_name,tenant_id,area,owner_name,phone,assigned_agent_id,status,ordering_mode,credit_hold,credit_limit,credit_status,days_overdue,outstanding,allowed_overdue_days,sourced_by_agent_id";

export const HQ_INVENTORY_COLUMNS =
  "tenant_id,product_id,current_stock,min_stock,reorder_qty,stock_in,stock_out,last_updated";

export const HQ_INVENTORY_HEALTH_COLUMNS = HQ_INVENTORY_COLUMNS;

export const HQ_INVENTORY_LEDGER_COLUMNS =
  "id,created_at,tenant_id,product_id,product_name,movement_type,quantity,order_id,reference_type,reference_id,created_by,stock_before,stock_after,notes";

export const HQ_LAB_PRODUCT_INTELLIGENCE_LIMIT = 200;

export const HQ_LAB_PRODUCT_INTELLIGENCE_COLUMNS =
  "id,tenant_id,lab_id,source_visit_id,product_category,brand,monthly_quantity,current_supplier,primary_pain_point,sku_spec,pack_size,current_purchase_price,purchase_frequency,willingness_to_switch,alternative_brand_ok,sample_requested,sample_sku,sample_quantity,sample_issued_at,agent_id,notes,created_at,updated_at";

export const HQ_QUALIFICATION_COLUMNS =
  "id,tenant_id,lab_id,lab_size,monthly_consumables_estimate,current_supplier,payment_terms,decision_maker,reagent_rental_potential,lab_os_fit,next_follow_up_date,founder_review_status,qualification_score,qualification_band,agent_id,agent_name,updated_by,notes,created_at,updated_at,pipeline_stage,pipeline_stage_updated_at,pipeline_stage_updated_by,pipeline_lost_reason,pipeline_next_action,pipeline_expected_value,pipeline_probability,pipeline_notes";

export const HQ_V_LAB_CATALOG_COLUMNS = "product_id,product_name,category,tenant_id";

/** Lab catalog / ordering projection (view-safe). */
export const HQ_LAB_CATALOG_LIST_COLUMNS =
  "product_id,product_name,category,tenant_id,current_stock,min_stock,reorder_qty,reorder_status,unit_selling_price,unit_cost,brand,tax_rate,active_flag";

export const HQ_REORDER_CANDIDATE_COLUMNS =
  "product_id,product_name,category,tenant_id,current_stock,min_stock,reorder_qty,reorder_status,selling_price,cost_price,preferred_supplier,unit";

export const HQ_INVENTORY_CATALOG_FALLBACK_COLUMNS =
  "tenant_id,product_id,product_name,current_stock,min_stock,reorder_qty,reorder_status,unit_selling_price,unit_cost,category,brand,tax_rate,active_flag";

export const HQ_V_STOCK_DASHBOARD_COLUMNS =
  "product_id,product_name,category,tenant_id,current_stock,min_stock,reorder_qty,reorder_status,selling_price,cost_price,preferred_supplier,unit";

export const HQ_PURCHASE_ORDER_COLUMNS = "po_id,id,status,supplier_name,tenant_id,created_at";

/** Full PO header projection for list/receive flows. */
export const HQ_PURCHASE_ORDER_LIST_COLUMNS =
  "po_id,po_date,product_id,product_name,quantity,received_qty,unit_cost,total_cost,supplier,status,notes,grn_notes,received_at,tenant_id,created_at,updated_at";

export const HQ_PURCHASE_ORDER_ITEM_COLUMNS =
  "po_id,product_id,product_name,quantity,received_qty,unit_cost,total_cost,tenant_id,created_at,updated_at";

export const HQ_AGENT_VISIT_COLUMNS =
  "id,lab_id,agent_id,agent_name,visit_date,created_at,notes,visit_type,tenant_id,visit_id,follow_up_required,next_follow_up_date,next_follow_up_type,next_action";

/** Agent Resources publisher list (AR-1B). storage_path is selected only for signed-URL open. */
export const HQ_AGENT_RESOURCE_LIST_LIMIT = 200;
export const HQ_AGENT_RESOURCE_LIST_COLUMNS =
  "id,tenant_id,title,description,category,required_reading,audience_type,current_published_version_id,created_at,updated_at,archived_at";
export const HQ_AGENT_RESOURCE_DETAIL_COLUMNS = HQ_AGENT_RESOURCE_LIST_COLUMNS;
export const HQ_AGENT_RESOURCE_VERSION_COLUMNS =
  "id,resource_id,tenant_id,version_number,original_filename,mime_type,file_size,status,created_at,published_by,published_at,archived_at";
export const HQ_AGENT_RESOURCE_VERSION_OPEN_COLUMNS =
  "id,tenant_id,original_filename,storage_path";
export const HQ_AGENT_RESOURCE_AUDIENCE_COLUMNS =
  "id,resource_id,tenant_id,profile_user_id,created_at";
export const HQ_AGENT_RESOURCE_ACK_COLUMNS =
  "id,tenant_id,resource_id,version_id,profile_user_id,acknowledged_at";
export const HQ_AGENT_RESOURCE_AGENT_IDENTITY_COLUMNS =
  "user_id,display_name,agent_name,username,role,active";
export const HQ_AGENT_RESOURCE_SIGNED_URL_TTL_SEC = 300;
export const HQ_AGENT_RESOURCE_MAX_FILE_BYTES = 10485760;
export const HQ_AGENT_RESOURCE_AGENT_LIST_COLUMNS =
  "id,title,description,category,required_reading,current_published_version_id";
export const HQ_AGENT_RESOURCE_AGENT_VERSION_COLUMNS =
  "id,resource_id,version_number,mime_type,published_at,status";
export const HQ_AGENT_RESOURCE_AGENT_ACK_COLUMNS = "version_id,acknowledged_at";

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
