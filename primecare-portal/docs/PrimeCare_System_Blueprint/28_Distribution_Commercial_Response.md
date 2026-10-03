# 28 — Distribution commercial response (P0-A)

A lab requirement already reaches HQ through AE-1C (`visit_handoffs`). P0-A is the commercial answer HQ attaches to that handoff.

It is not a quote, an order, a second product master, or a supplier portal.

## Decisions

| Decision | What HQ records | What the agent sees |
|----------|-----------------|---------------------|
| YES | Existing `products.product_id` when it matches, specification, quantity, pack, supplier, verified cost, selling price, availability, lead time, valid-until, internal note | Product/specification, quantity, pack, selling price, availability, lead time, valid-until, next action |
| NO | Next action, optional specification, optional internal note | That text only. No invented price |
| NEED_MORE_INFORMATION | The question for the agent, optional specification, optional internal note | That text only. No invented price |

`respond_visit_handoff` still moves `OPEN_HQ` to `HQ_RESPONDED`. The commercial rows and that status change commit together. `hq_response` is the agent-visible text. It does not contain purchase cost, supplier, margin, or the internal note.

On My Business, a YES reply is shown on the existing “PrimeCare Responded — Your Action” card as product, pack, PrimeCare price, availability, lead time, price valid until, and next action. A reply with no commercial row still shows `hq_response` as text. NO and NEED MORE INFORMATION show the next action and do not invent a price.

Verified cost is a `supplier_offers` row. It does not overwrite `products.cost_price`.

## Who can read cost

Admin and executive in the same tenant. Agent and lab cannot. Lab ordering still reads `v_lab_catalog.unit_selling_price`.

## Out of this slice

Quotes, quote acceptance, orders, invoices, payments, stock changes, procurement, and a new agent dashboard.
