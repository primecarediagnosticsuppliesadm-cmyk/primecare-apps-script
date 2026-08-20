# PrimeCare Diagnostics — Public Website Deployment

Public marketing site for `www.primecarediagnostics.in`.

**Isolated from** the authenticated portal (`app.primecarediagnostics.in` / QA `primecare-portal.vercel.app`).

---

## Architecture

| Surface | Location | Hosting |
|---------|----------|---------|
| Public website | `primecare-website/` | New Vercel project → `www.primecarediagnostics.in` |
| Portal (unchanged) | `primecare-portal/` | Existing Vercel projects |

Do **not** mount this site inside the portal SPA.

---

## Local development

```bash
cd primecare-website
cp .env.example .env.local
# set VITE_PUBLIC_WHATSAPP_E164=91XXXXXXXXXX
# optional: VITE_PUBLIC_CONTACT_EMAIL=...
npm install
npm run dev
npm run verify
```

---

## Vercel project setup (Founder / ops)

1. Create a **new** Vercel project (name suggestion: `primecare-website`).
2. Import the same GitHub repo.
3. Set **Root Directory** to `primecare-website`.
4. Framework preset: Vite.
5. Build command: `npm run build`
6. Output directory: `dist`
7. Environment variables (Production):
   - `VITE_PUBLIC_WHATSAPP_E164` = official WhatsApp number in E.164 digits (e.g. `9198XXXXXXXX`)
   - `VITE_PUBLIC_CONTACT_EMAIL` = official business email (optional)
8. Deploy from `main` only after QA review of this package (or deploy the feature branch to a Vercel Preview first).

---

## DNS (STOP — Founder approval required)

Do **not** apply automatically.

| Host | Type | Value |
|------|------|-------|
| `www` | CNAME | Vercel DNS target for `primecare-website` project |
| apex `primecarediagnostics.in` | — | **Deferred** — do not redirect until Founder approves |

Also:

- Do **not** change DNS for `app.primecarediagnostics.in`.
- Do **not** attach this project to the portal Vercel projects.

After DNS is live:

1. Open `https://www.primecarediagnostics.in`
2. Confirm no portal login/sidebar
3. Confirm WhatsApp + Login CTAs
4. Confirm portal at `https://app.primecarediagnostics.in` still works

---

## Information still needed from Founder

1. Official WhatsApp Business number (E.164)
2. Official public business email (if any)
3. Whether legal entity / GST line should appear in the footer
4. Approval to create the separate Vercel project and attach `www`
