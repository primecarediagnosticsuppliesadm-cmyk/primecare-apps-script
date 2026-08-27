import { useEffect, useMemo } from "react";
import {
  PUBLIC_SITE,
  buildTelHref,
  buildWhatsAppHref,
} from "./config/publicContact.js";

const CONNECT_WHATSAPP_INTRO =
  "Hello PrimeCare Diagnostics, I would like to discuss my laboratory procurement requirements.";

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
          <h1>Laboratory Supplies &amp; Procurement — Hyderabad</h1>
          <p className="hero-lead">How can we help your lab?</p>
          <p className="connect-categories">Consumables • Reagents • Laboratory Supplies</p>

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
