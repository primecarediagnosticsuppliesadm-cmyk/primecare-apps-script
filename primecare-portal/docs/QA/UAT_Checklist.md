# PrimeCare UAT Checklist

## Executive
- [x] Login as founder/executive
- [x] Dashboard loads
- [x] Financial Intelligence loads
- [x] Revenue Funnel loads
- [ ] Credit & Risk validates with data
- [ ] Operations Center validates with data
- [ ] No QA/Predator tooling exposed in production unless intentionally allowed

## Admin
- [x] Login as admin
- [x] Master Catalog loads
- [x] Create product
- [x] Product appears in Inventory
- [ ] Create lab
- [ ] Create / edit AR credit terms
- [ ] Create order as admin
- [ ] Fulfill order
- [ ] Record payment

## Agent
- [ ] Login as agent
- [ ] Dashboard loads
- [ ] Assigned labs only
- [ ] Visits page loads
- [ ] Collections page loads
- [ ] Cannot access admin/executive pages

## Lab
- [x] Login as lab
- [x] Lab portal loads
- [x] Lab Ordering loads
- [x] Invoice Center loads
- [x] Payments & Account loads
- [ ] Assigned catalog visible after lab/product setup
- [ ] Place order
- [ ] View generated invoice
- [ ] Confirm payment/account update

## End-to-End Business Flow
- [ ] Create lab
- [ ] Assign lab user/profile
- [ ] Assign product catalog / stock
- [ ] Lab places order
- [ ] HQ/Admin fulfills order
- [ ] Invoice generated
- [ ] Payment recorded
- [ ] AR updates
- [ ] Inventory decreases
- [ ] Executive KPIs update
