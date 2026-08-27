import { useEffect, useMemo } from "react";
import {
  PUBLIC_SITE,
  buildTelHref,
  buildWhatsAppHref,
} from "./config/publicContact.js";

const CONNECT_WHATSAPP_INTRO =
  "Hello PrimeCare Diagnostics, I would like to discuss my laboratory procurement requirements.";

const HELP_ITEMS = [
  {
    title: "Laboratory Consumables",
    description: "Routine laboratory and sample-collection supplies.",
  },
  {
    title: "Reagents & Diagnostic Supplies",
    description:
      "Laboratory reagents, kits and related diagnostic requirements, subject to product availability and applicable regulatory requirements.",
  },
  {
    title: "Managed Procurement",
    description:
      "Help laboratories consolidate recurring requirements and simplify sourcing and supply coordination.",
  },
  {
    title: "Lab Operations Technology",
    description:
      "PrimeCare's technology platform supports structured laboratory operational workflows.",
  },
];

export default function ConnectPage() {
  const whatsappHref = useMemo(() => buildWhatsAppHref(CONNECT_WHATSAPP_INTRO), []);
  const telHref = useMemo(() => buildTelHref(), []);

  useEffect(() => {
    document.title = "PrimeCare Diagnostics | Connect";
  }, []);

  return (
    <div className="site-shell connect-page">
      <a className="skip-link" href="#connect-main">
        Skip to content
      </a>

      <header className="site-header">
        <div className="container header-inner">
          <a className="brand" href="/" aria-label="PrimeCare Diagnostics home">
            <span className="brand-mark" aria-hidden="true">
              PC
            </span>
            <span className="brand-text">
              <span className="brand-name">PrimeCare Diagnostics</span>
              <span className="brand-tag">Laboratory supply & procurement</span>
            </span>
          </a>
        </div>
      </header>

      <main id="connect-main" className="connect-main">
        <div className="container connect-copy">
          <p className="hero-kicker">Prime Care Diagnostics</p>
          <h1>Laboratory Supplies, Procurement &amp; Operations</h1>
          <p className="hero-lead">
            Supporting diagnostic laboratories with reliable procurement and smarter day-to-day
            operations.
          </p>

          <section className="connect-block" aria-labelledby="connect-help-heading">
            <h2 id="connect-help-heading" className="connect-kicker">
              What we help with
            </h2>
            <div className="connect-help">
              {HELP_ITEMS.map((item) => (
                <article className="category-card" key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="connect-os" aria-labelledby="connect-os-heading">
            <h2 id="connect-os-heading" className="connect-kicker">
              PrimeCare OS
            </h2>
            <p className="connect-os-lead">Technology built around laboratory operations.</p>
            <p>
              PrimeCare OS is designed to support structured workflows across areas such as orders,
              inventory, purchasing, collections and operational visibility.
            </p>
            <a className="btn btn-secondary" href="/#enquiry">
              Talk to Us
            </a>
          </section>

          <div className="connect-actions">
            {whatsappHref ? (
              <a className="btn btn-primary" href={whatsappHref} target="_blank" rel="noopener noreferrer">
                WhatsApp PrimeCare
              </a>
            ) : null}
            {telHref ? (
              <a className="btn btn-secondary" href={telHref}>
                Call PrimeCare
              </a>
            ) : null}
            <a className="btn btn-secondary" href="/#enquiry">
              Request a Quote
            </a>
            <a className="btn btn-secondary" href="/">
              Visit Website
            </a>
          </div>
        </div>
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <p className="footer-meta">
            PrimeCare Diagnostics · {PUBLIC_SITE.serviceArea}
            <br />
            © {new Date().getFullYear()} PrimeCare Diagnostics. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
