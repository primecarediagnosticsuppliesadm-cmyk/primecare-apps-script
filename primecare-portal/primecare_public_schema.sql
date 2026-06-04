--
-- PostgreSQL database dump
--

\restrict 9mcQ2xp6g0Sf6tuYiRlQW3LqNfZh9SY4PzRZemsgeMYyzKsk3wHaicf6DxBTmKm

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agent_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_visits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    visit_id text,
    lab_id text NOT NULL,
    agent_id text,
    visit_date timestamp with time zone DEFAULT now(),
    visit_type text,
    notes text,
    follow_up_required boolean DEFAULT false,
    next_follow_up_date date,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: ar_credit_control; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ar_credit_control (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    lab_id text NOT NULL,
    lab_name text,
    total_delivered numeric(12,2) DEFAULT 0,
    total_paid numeric(12,2) DEFAULT 0,
    outstanding numeric(12,2) DEFAULT 0,
    credit_limit numeric(12,2) DEFAULT 0,
    days_overdue integer DEFAULT 0,
    allowed_overdue_days integer DEFAULT 15,
    credit_hold boolean DEFAULT false,
    collections_notes text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: event_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    event_type text NOT NULL,
    entity_type text,
    entity_id text,
    severity text DEFAULT 'INFO'::text,
    message text,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    product_id text NOT NULL,
    current_stock numeric(12,2) DEFAULT 0,
    min_stock numeric(12,2) DEFAULT 0,
    reorder_qty numeric(12,2) DEFAULT 0,
    stock_in numeric(12,2) DEFAULT 0,
    stock_out numeric(12,2) DEFAULT 0,
    last_updated timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: inventory_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    movement_id text,
    product_id text NOT NULL,
    movement_type text,
    quantity numeric(12,2) NOT NULL,
    reference_type text,
    reference_id text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    created_by text,
    product_name text,
    order_id text,
    stock_before numeric DEFAULT 0,
    stock_after numeric DEFAULT 0
);


--
-- Name: labs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.labs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    lab_id text NOT NULL,
    lab_name text NOT NULL,
    owner_name text,
    phone text,
    area text,
    gst_number text,
    credit_terms text,
    status text DEFAULT 'PROSPECT'::text,
    assigned_agent_id text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_item_id text,
    order_id text NOT NULL,
    product_id text,
    product_name text,
    quantity numeric DEFAULT 0,
    unit_price numeric DEFAULT 0,
    total_price numeric DEFAULT 0,
    tenant_id text,
    created_by text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: order_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    order_id text NOT NULL,
    product_id text NOT NULL,
    product_name text,
    quantity numeric(12,2) DEFAULT 0,
    unit_selling_price numeric(12,2) DEFAULT 0,
    net_line_total numeric(12,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    order_id text NOT NULL,
    lab_id text NOT NULL,
    order_date timestamp with time zone DEFAULT now(),
    status text DEFAULT 'DRAFT'::text,
    total_amount numeric(12,2) DEFAULT 0,
    inventory_updated boolean DEFAULT false,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    notes text,
    updated_at timestamp with time zone DEFAULT now(),
    status_notes text,
    fulfilled_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    ar_posted boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN orders.inventory_updated; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.inventory_updated IS 'True once ORDER_OUT inventory deduction ran (ledger or flag). Idempotency.';


--
-- Name: COLUMN orders.ar_posted; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.ar_posted IS 'True once fulfill path increased AR for this order. Idempotency.';


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    payment_id text NOT NULL,
    order_id text,
    lab_id text NOT NULL,
    amount_received numeric(12,2) DEFAULT 0,
    payment_date timestamp with time zone DEFAULT now(),
    mode text,
    outstanding_balance numeric(12,2),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    product_id text NOT NULL,
    product_name text NOT NULL,
    category text,
    unit text,
    selling_price numeric(12,2),
    cost_price numeric(12,2),
    preferred_supplier text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: purchase_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    po_id text NOT NULL,
    product_id text NOT NULL,
    product_name text,
    quantity numeric DEFAULT 0 NOT NULL,
    received_qty numeric DEFAULT 0 NOT NULL,
    unit_cost numeric DEFAULT 0 NOT NULL,
    total_cost numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    po_id text NOT NULL,
    po_date date DEFAULT CURRENT_DATE NOT NULL,
    product_id text,
    product_name text,
    quantity numeric DEFAULT 0 NOT NULL,
    received_qty numeric DEFAULT 0 NOT NULL,
    unit_cost numeric DEFAULT 0 NOT NULL,
    total_cost numeric DEFAULT 0 NOT NULL,
    supplier text,
    status text DEFAULT 'Draft'::text NOT NULL,
    notes text,
    grn_notes text,
    received_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_code text NOT NULL,
    tenant_name text NOT NULL,
    status text DEFAULT 'ACTIVE'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    user_code text,
    user_name text,
    email text,
    role text,
    lab_id text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['ADMIN'::text, 'EXECUTIVE'::text, 'AGENT'::text, 'LAB'::text])))
);


--
-- Name: v_lab_catalog; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_lab_catalog AS
 SELECT i.tenant_id,
    i.product_id,
    COALESCE(p.product_name, i.product_id) AS product_name,
    COALESCE(p.category, 'Consumables'::text) AS category,
    'PrimeCare'::text AS brand,
    COALESCE(p.selling_price, (0)::numeric) AS unit_selling_price,
    COALESCE(p.cost_price, (0)::numeric) AS unit_cost,
    (0)::numeric AS tax_rate,
        CASE
            WHEN (p.active IS TRUE) THEN 'Y'::text
            ELSE 'N'::text
        END AS active_flag,
    i.current_stock,
    i.min_stock,
    i.reorder_qty,
        CASE
            WHEN (i.current_stock <= i.min_stock) THEN 'REORDER'::text
            ELSE 'OK'::text
        END AS reorder_status
   FROM (public.inventory i
     LEFT JOIN public.products p ON ((upper(TRIM(BOTH FROM p.product_id)) = upper(TRIM(BOTH FROM i.product_id)))));


--
-- Name: v_labs_credit; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_labs_credit AS
 SELECT l.tenant_id,
    l.lab_id,
    l.lab_name,
    l.owner_name,
    l.phone,
    l.area,
    l.status,
    l.assigned_agent_id,
    COALESCE(a.outstanding, (0)::numeric) AS outstanding,
    COALESCE(a.credit_limit, (0)::numeric) AS credit_limit,
    COALESCE(a.days_overdue, 0) AS days_overdue,
    COALESCE(a.allowed_overdue_days, 15) AS allowed_overdue_days,
    COALESCE(a.credit_hold, false) AS credit_hold,
        CASE
            WHEN (COALESCE(a.credit_hold, false) = true) THEN 'BLOCKED'::text
            WHEN ((COALESCE(a.credit_limit, (0)::numeric) > (0)::numeric) AND (COALESCE(a.outstanding, (0)::numeric) >= COALESCE(a.credit_limit, (0)::numeric))) THEN 'LIMIT_REACHED'::text
            WHEN (COALESCE(a.days_overdue, 0) > COALESCE(a.allowed_overdue_days, 15)) THEN 'OVERDUE'::text
            ELSE 'OK'::text
        END AS credit_status
   FROM (public.labs l
     LEFT JOIN public.ar_credit_control a ON (((l.tenant_id = a.tenant_id) AND (l.lab_id = a.lab_id))));


--
-- Name: v_stock_dashboard; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_stock_dashboard AS
 SELECT p.tenant_id,
    p.product_id,
    p.product_name,
    p.category,
    p.unit,
    p.selling_price,
    p.cost_price,
    p.preferred_supplier,
    COALESCE(i.current_stock, (0)::numeric) AS current_stock,
    COALESCE(i.min_stock, (0)::numeric) AS min_stock,
    COALESCE(i.reorder_qty, (0)::numeric) AS reorder_qty,
        CASE
            WHEN (COALESCE(i.current_stock, (0)::numeric) <= COALESCE(i.min_stock, (0)::numeric)) THEN 'REORDER'::text
            ELSE 'OK'::text
        END AS reorder_status
   FROM (public.products p
     LEFT JOIN public.inventory i ON (((p.tenant_id = i.tenant_id) AND (p.product_id = i.product_id))));


--
-- Name: v_reorder_candidates; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_reorder_candidates AS
 SELECT tenant_id,
    product_id,
    product_name,
    category,
    unit,
    selling_price,
    cost_price,
    preferred_supplier,
    current_stock,
    min_stock,
    reorder_qty,
    reorder_status
   FROM public.v_stock_dashboard
  WHERE (reorder_status = 'REORDER'::text);


--
-- Name: agent_visits agent_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_visits
    ADD CONSTRAINT agent_visits_pkey PRIMARY KEY (id);


--
-- Name: ar_credit_control ar_credit_control_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ar_credit_control
    ADD CONSTRAINT ar_credit_control_pkey PRIMARY KEY (id);


--
-- Name: ar_credit_control ar_credit_control_tenant_id_lab_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ar_credit_control
    ADD CONSTRAINT ar_credit_control_tenant_id_lab_id_key UNIQUE (tenant_id, lab_id);


--
-- Name: event_log event_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_log
    ADD CONSTRAINT event_log_pkey PRIMARY KEY (id);


--
-- Name: inventory_ledger inventory_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_ledger
    ADD CONSTRAINT inventory_ledger_pkey PRIMARY KEY (id);


--
-- Name: inventory inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_pkey PRIMARY KEY (id);


--
-- Name: inventory inventory_tenant_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_tenant_id_product_id_key UNIQUE (tenant_id, product_id);


--
-- Name: labs labs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labs
    ADD CONSTRAINT labs_pkey PRIMARY KEY (id);


--
-- Name: labs labs_tenant_id_lab_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labs
    ADD CONSTRAINT labs_tenant_id_lab_id_key UNIQUE (tenant_id, lab_id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: order_lines order_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_lines
    ADD CONSTRAINT order_lines_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: orders orders_tenant_id_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_tenant_id_order_id_key UNIQUE (tenant_id, order_id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payments payments_tenant_id_payment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_tenant_id_payment_id_key UNIQUE (tenant_id, payment_id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_tenant_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_tenant_id_product_id_key UNIQUE (tenant_id, product_id);


--
-- Name: purchase_order_items purchase_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_po_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_po_id_key UNIQUE (po_id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_tenant_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_tenant_code_key UNIQUE (tenant_code);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_orders_lab_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_lab_id ON public.orders USING btree (lab_id);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_payments_lab_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_lab_id ON public.payments USING btree (lab_id);


--
-- Name: idx_payments_payment_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_payment_date ON public.payments USING btree (payment_date);


--
-- Name: idx_purchase_order_items_po_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_order_items_po_id ON public.purchase_order_items USING btree (po_id);


--
-- Name: idx_purchase_order_items_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_order_items_product_id ON public.purchase_order_items USING btree (product_id);


--
-- Name: idx_purchase_orders_po_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_po_id ON public.purchase_orders USING btree (po_id);


--
-- Name: idx_purchase_orders_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_product_id ON public.purchase_orders USING btree (product_id);


--
-- Name: idx_purchase_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_purchase_orders_status ON public.purchase_orders USING btree (status);


--
-- Name: agent_visits agent_visits_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_visits
    ADD CONSTRAINT agent_visits_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: ar_credit_control ar_credit_control_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ar_credit_control
    ADD CONSTRAINT ar_credit_control_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: event_log event_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_log
    ADD CONSTRAINT event_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: inventory_ledger inventory_ledger_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_ledger
    ADD CONSTRAINT inventory_ledger_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: inventory inventory_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: labs labs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labs
    ADD CONSTRAINT labs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: order_lines order_lines_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_lines
    ADD CONSTRAINT order_lines_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: orders orders_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: payments payments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: products products_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: purchase_order_items purchase_order_items_po_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_po_id_fkey FOREIGN KEY (po_id) REFERENCES public.purchase_orders(po_id) ON DELETE CASCADE;


--
-- Name: users users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: agent_visits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_visits ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_visits allow anon insert agent visits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "allow anon insert agent visits" ON public.agent_visits FOR INSERT TO anon WITH CHECK (true);


--
-- Name: agent_visits allow anon read agent visits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "allow anon read agent visits" ON public.agent_visits FOR SELECT TO anon USING (true);


--
-- Name: order_lines allow anon read order lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "allow anon read order lines" ON public.order_lines FOR SELECT TO anon USING (true);


--
-- Name: orders allow anon read orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "allow anon read orders" ON public.orders FOR SELECT TO anon USING (true);


--
-- Name: ar_credit_control; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ar_credit_control ENABLE ROW LEVEL SECURITY;

--
-- Name: event_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_log ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: labs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.labs ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: order_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: ar_credit_control temp_anon_ar_credit_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp_anon_ar_credit_select ON public.ar_credit_control FOR SELECT TO anon USING (true);


--
-- Name: ar_credit_control temp_anon_ar_credit_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp_anon_ar_credit_update ON public.ar_credit_control FOR UPDATE TO anon USING (true) WITH CHECK (true);


--
-- Name: ar_credit_control temp_anon_ar_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp_anon_ar_select ON public.ar_credit_control FOR SELECT TO anon USING (true);


--
-- Name: ar_credit_control temp_anon_ar_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp_anon_ar_update ON public.ar_credit_control FOR UPDATE TO anon USING (true) WITH CHECK (true);


--
-- Name: inventory_ledger temp_anon_inventory_ledger_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp_anon_inventory_ledger_insert ON public.inventory_ledger FOR INSERT TO anon WITH CHECK (true);


--
-- Name: inventory_ledger temp_anon_inventory_ledger_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp_anon_inventory_ledger_select ON public.inventory_ledger FOR SELECT TO anon USING (true);


--
-- Name: inventory temp_anon_inventory_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp_anon_inventory_select ON public.inventory FOR SELECT TO anon USING (true);


--
-- Name: inventory temp_anon_inventory_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp_anon_inventory_update ON public.inventory FOR UPDATE TO anon USING (true) WITH CHECK (true);


--
-- Name: order_items temp_anon_order_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp_anon_order_items_insert ON public.order_items FOR INSERT TO anon WITH CHECK (true);


--
-- Name: order_items temp_anon_order_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp_anon_order_items_select ON public.order_items FOR SELECT TO anon USING (true);


--
-- Name: orders temp_anon_orders_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp_anon_orders_insert ON public.orders FOR INSERT TO anon WITH CHECK (true);


--
-- Name: orders temp_anon_orders_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp_anon_orders_select ON public.orders FOR SELECT TO anon USING (true);


--
-- Name: orders temp_anon_orders_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp_anon_orders_update ON public.orders FOR UPDATE TO anon USING (true) WITH CHECK (true);


--
-- Name: payments temp_anon_payments_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp_anon_payments_insert ON public.payments FOR INSERT TO anon WITH CHECK (true);


--
-- Name: payments temp_anon_payments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp_anon_payments_select ON public.payments FOR SELECT TO anon USING (true);


--
-- Name: products temp_anon_products_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp_anon_products_select ON public.products FOR SELECT TO anon USING (true);


--
-- Name: products temp_anon_products_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp_anon_products_update ON public.products FOR UPDATE TO anon USING (true) WITH CHECK (true);


--
-- Name: purchase_order_items temp_anon_purchase_order_items_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp_anon_purchase_order_items_insert ON public.purchase_order_items FOR INSERT TO anon WITH CHECK (true);


--
-- Name: purchase_order_items temp_anon_purchase_order_items_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp_anon_purchase_order_items_select ON public.purchase_order_items FOR SELECT TO anon USING (true);


--
-- Name: purchase_order_items temp_anon_purchase_order_items_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp_anon_purchase_order_items_update ON public.purchase_order_items FOR UPDATE TO anon USING (true) WITH CHECK (true);


--
-- Name: purchase_orders temp_anon_purchase_orders_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp_anon_purchase_orders_insert ON public.purchase_orders FOR INSERT TO anon WITH CHECK (true);


--
-- Name: purchase_orders temp_anon_purchase_orders_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp_anon_purchase_orders_select ON public.purchase_orders FOR SELECT TO anon USING (true);


--
-- Name: purchase_orders temp_anon_purchase_orders_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY temp_anon_purchase_orders_update ON public.purchase_orders FOR UPDATE TO anon USING (true) WITH CHECK (true);


--
-- Name: tenants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict 9mcQ2xp6g0Sf6tuYiRlQW3LqNfZh9SY4PzRZemsgeMYyzKsk3wHaicf6DxBTmKm

