import { useMemo, useState } from "react";
import {
  PUBLIC_SITE,
  buildEnquiryMessage,
  buildWhatsAppHref,
} from "./config/publicContact.js";

const NAV = [
  { href: "#products", label: "Products" },
  { href: "#why", label: "Why PrimeCare" },
  { href: "#contact", label: "Contact" },
];

const CATEGORIES = [
  {
    title: "Blood Collection",
    description: "Tubes, needles, and related collection essentials for routine draws.",
  },
  {
    title: "Laboratory Consumables",
    description: "Day-to-day consumables that keep diagnostic workflows moving.",
  },
  {
    title: "Reagents",
    description: "Core reagents for common laboratory testing needs.",
  },
  {
    title: "Sample Collection",
    description: "Materials that support reliable sample collection and handling.",
  },
  {
    title: "General Lab Supplies",
    description: "Practical supplies labs reorder regularly for operations.",
  },
];

const WHY = [
  {
    title: "Reliable Supply",
    description: "Dependable fulfilment for the consumables your lab uses every day.",
  },
  {
    title: "Competitive Pricing",
    description: "Clear, business-focused quotes without unnecessary complexity.",
  },
  {
    title: "Responsive Support",
    description: "Quick replies when availability, delivery, or reorders matter.",
  },
  {
    title: "Convenient Reordering",
    description: "Existing customers can reorder through the PrimeCare portal.",
  },
  {
    title: "Local Hyderabad Support",
    description: "Serving diagnostic laboratories across Hyderabad / Telangana.",
  },
];

const STEPS = [
  {
    title: "Share your requirement",
    description: "Tell us the lab, location, and products you need.",
  },
  {
    title: "Receive availability / quote",
    description: "We confirm what can be supplied and share pricing.",
  },
  {
    title: "Confirm and receive supplies",
    description: "Approve the quote and receive your laboratory supplies.",
  },
];

function Brand({ compact = false }) {
  return (
    <a className="brand" href="#top" aria-label="PrimeCare Diagnostics home">
      <span className="brand-mark" aria-hidden="true">
        PC
      </span>
      <span className="brand-text">
        <span className="brand-name">PrimeCare Diagnostics</span>
        {!compact ? <span className="brand-tag">Laboratory supplies</span> : null}
      </span>
    </a>
  );
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [form, setForm] = useState({
    labName: "",
    contactPerson: "",
    location: "",
    requirement: "",
  });

  const whatsappHref = useMemo(
    () => buildWhatsAppHref("Hello PrimeCare Diagnostics, I would like a quote for laboratory supplies."),
    []
  );

  const enquiryHref = useMemo(
    () => buildWhatsAppHref(buildEnquiryMessage(form)),
    [form]
  );

  function updateField(key) {
    return (event) => {
      setForm((prev) => ({ ...prev, [key]: event.target.value }));
    };
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className="site-shell" id="top">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="site-header">
        <div className="container header-inner">
          <Brand />
          <nav className="nav-desktop" aria-label="Primary">
            {NAV.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
            <a href={PUBLIC_SITE.portalUrl} rel="noopener noreferrer">
              Existing Customer Login
            </a>
          </nav>
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            Menu
          </button>
        </div>
        <div className="container">
          <nav
            id="mobile-nav"
            className={`nav-mobile${menuOpen ? " open" : ""}`}
            aria-label="Mobile"
          >
            {NAV.map((item) => (
              <a key={item.href} href={item.href} onClick={closeMenu}>
                {item.label}
              </a>
            ))}
            <a href={PUBLIC_SITE.portalUrl} rel="noopener noreferrer" onClick={closeMenu}>
              Existing Customer Login
            </a>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <p className="hero-kicker">PrimeCare Diagnostics</p>
              <h1>Reliable Laboratory Supplies. Delivered When You Need Them.</h1>
              <p className="hero-lead">
                PrimeCare Diagnostics supplies laboratory consumables and diagnostic supplies to
                diagnostic laboratories — with responsive support for Hyderabad / Telangana labs.
              </p>
              <div className="cta-row">
                {whatsappHref ? (
                  <a className="btn btn-primary" href={whatsappHref} target="_blank" rel="noopener noreferrer">
                    WhatsApp Us
                  </a>
                ) : (
                  <a className="btn btn-primary" href="#enquiry">
                    WhatsApp Us
                  </a>
                )}
                <a className="btn btn-secondary" href="#enquiry">
                  Request a Quote
                </a>
                <a className="btn btn-ghost" href={PUBLIC_SITE.portalUrl} rel="noopener noreferrer">
                  Existing Customer? Login
                </a>
              </div>
            </div>
            <aside className="hero-panel" aria-label="How we help labs">
              <div>
                <h2>Supplies for diagnostic laboratories</h2>
                <p>
                  From blood collection essentials to everyday consumables — request availability
                  and pricing in minutes.
                </p>
              </div>
              <div className="hero-stats">
                <div className="hero-stat">
                  <strong>B2B</strong>
                  <span>Lab-focused</span>
                </div>
                <div className="hero-stat">
                  <strong>Local</strong>
                  <span>Hyderabad</span>
                </div>
                <div className="hero-stat">
                  <strong>Portal</strong>
                  <span>For customers</span>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="section section-alt" id="products">
          <div className="container">
            <div className="section-head">
              <h2>What we supply</h2>
              <p>Category-level laboratory supply support for diagnostic operations.</p>
            </div>
            <div className="category-grid">
              {CATEGORIES.map((item) => (
                <article className="category-card" key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="why">
          <div className="container">
            <div className="section-head">
              <h2>Why PrimeCare</h2>
              <p>Practical reasons labs choose a reliable local supplies partner.</p>
            </div>
            <div className="why-grid">
              {WHY.map((item) => (
                <article className="why-card" key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section section-alt" id="how">
          <div className="container">
            <div className="section-head">
              <h2>How it works</h2>
              <p>A simple enquiry-to-supply process for laboratory purchasing teams.</p>
            </div>
            <div className="steps">
              {STEPS.map((step, index) => (
                <article className="step-card" key={step.title}>
                  <span className="step-index" aria-hidden="true">
                    {index + 1}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="enquiry">
          <div className="container enquiry">
            <div className="section-head">
              <h2>Request a quote</h2>
              <p>
                Share a few details and continue on WhatsApp. No account creation required for
                first-time enquiries.
              </p>
              {!PUBLIC_SITE.hasWhatsApp ? (
                <p className="notice" role="status">
                  WhatsApp number is not configured yet. Set{" "}
                  <code>VITE_PUBLIC_WHATSAPP_E164</code> before public launch.
                </p>
              ) : null}
            </div>
            <form
              className="enquiry-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!enquiryHref) return;
                window.open(enquiryHref, "_blank", "noopener,noreferrer");
              }}
            >
              <div className="field">
                <label htmlFor="labName">Lab name</label>
                <input
                  id="labName"
                  name="labName"
                  autoComplete="organization"
                  value={form.labName}
                  onChange={updateField("labName")}
                  placeholder="e.g. City Diagnostics"
                />
              </div>
              <div className="field">
                <label htmlFor="contactPerson">Contact person</label>
                <input
                  id="contactPerson"
                  name="contactPerson"
                  autoComplete="name"
                  value={form.contactPerson}
                  onChange={updateField("contactPerson")}
                  placeholder="Your name"
                />
              </div>
              <div className="field">
                <label htmlFor="location">Location</label>
                <input
                  id="location"
                  name="location"
                  autoComplete="address-level2"
                  value={form.location}
                  onChange={updateField("location")}
                  placeholder="City / area"
                />
              </div>
              <div className="field">
                <label htmlFor="requirement">Product requirement</label>
                <textarea
                  id="requirement"
                  name="requirement"
                  value={form.requirement}
                  onChange={updateField("requirement")}
                  placeholder="List products or categories you need"
                />
              </div>
              <p className="form-note">
                Submitting opens WhatsApp with your enquiry details. Nothing is stored on this
                website.
              </p>
              <button className="btn btn-primary" type="submit" disabled={!PUBLIC_SITE.hasWhatsApp}>
                Continue on WhatsApp
              </button>
            </form>
          </div>
        </section>

        <section className="section section-alt" id="contact">
          <div className="container">
            <div className="section-head">
              <h2>Contact</h2>
              <p>Reach PrimeCare Diagnostics for laboratory supply enquiries.</p>
            </div>
            <div className="contact-grid">
              <article className="contact-card">
                <h3>WhatsApp / Phone</h3>
                {PUBLIC_SITE.hasWhatsApp ? (
                  <p>
                    <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                      +{PUBLIC_SITE.whatsappE164}
                    </a>
                  </p>
                ) : (
                  <p>WhatsApp number pending configuration.</p>
                )}
              </article>
              <article className="contact-card">
                <h3>Email</h3>
                {PUBLIC_SITE.hasEmail ? (
                  <p>
                    <a href={`mailto:${PUBLIC_SITE.contactEmail}`}>{PUBLIC_SITE.contactEmail}</a>
                  </p>
                ) : (
                  <p>Business email pending configuration.</p>
                )}
              </article>
              <article className="contact-card">
                <h3>Service area</h3>
                <p>
                  {PUBLIC_SITE.serviceArea}
                  <br />
                  <a href={PUBLIC_SITE.websiteUrl}>{PUBLIC_SITE.websiteUrl.replace("https://", "")}</a>
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="section" id="customers">
          <div className="container">
            <div className="customer-band">
              <div>
                <h2>Already a PrimeCare customer?</h2>
                <p>Sign in to the PrimeCare portal for ordering and account activity.</p>
              </div>
              <a className="btn btn-primary" href={PUBLIC_SITE.portalUrl} rel="noopener noreferrer">
                Login to PrimeCare Portal
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <div>
            <Brand compact />
            <p className="footer-meta">
              © {new Date().getFullYear()} PrimeCare Diagnostics. All rights reserved.
            </p>
          </div>
          <div className="footer-links">
            <a href="#contact">Contact</a>
            <a href={PUBLIC_SITE.portalUrl} rel="noopener noreferrer">
              Existing Customer Login
            </a>
            <a href="#enquiry">Request a Quote</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
