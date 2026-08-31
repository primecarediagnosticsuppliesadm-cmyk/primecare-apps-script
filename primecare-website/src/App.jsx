import { useEffect, useMemo, useState } from "react";
import {
  PUBLIC_SITE,
  buildEnquiryMessage,
  buildWhatsAppHref,
} from "./config/publicContact.js";

const NAV = [
  { href: "#about", label: "About" },
  { href: "#products", label: "Products" },
  { href: "#why", label: "Why PrimeCare" },
  { href: "#contact", label: "Contact" },
];

const CATEGORIES = [
  {
    title: "Laboratory Consumables",
    description: "Everyday consumables used in diagnostic laboratory workflows.",
  },
  {
    title: "Blood Collection & Sample Collection",
    description: "Collection materials commonly used for routine blood and sample work.",
  },
  {
    title: "General Laboratory Supplies",
    description: "Practical supplies laboratories reorder to support day-to-day operations.",
  },
  {
    title: "Diagnostic Supplies",
    description: "Supply categories aligned to diagnostic laboratory procurement needs.",
  },
  {
    title: "IVD / Reagent Requirements",
    description:
      "Discuss your IVD and reagent requirements with us. Supply is subject to applicable regulatory requirements and supplier confirmation.",
  },
];

const WHY = [
  {
    title: "Responsive Local Support",
    description: "Direct communication with a Hyderabad-focused team for procurement questions.",
  },
  {
    title: "Transparent Procurement",
    description: "Clear discussion of requirements, options, and next steps before you commit.",
  },
  {
    title: "Requirement-Based Sourcing",
    description: "We start from the products and brands your laboratory actually uses.",
  },
  {
    title: "Convenient Reordering",
    description: "Existing customers can access technology-enabled ordering and account tools.",
  },
  {
    title: "Hyderabad / Telangana Focus",
    description: "Built around diagnostic laboratories operating in Hyderabad and Telangana.",
  },
];

const STEPS = [
  {
    title: "Share your requirements",
    description: "Tell us the lab, area, products or brands, and where procurement can improve.",
  },
  {
    title: "Discuss options",
    description: "We review your requirements and discuss availability and pricing with you.",
  },
  {
    title: "Confirm & coordinate supply",
    description: "If the requirement is a fit, we confirm the agreed products, pricing and next steps.",
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
        {!compact ? <span className="brand-tag">Laboratory supply & procurement</span> : null}
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
    productsBrands: "",
    monthlyRequirement: "",
    procurementChallenge: "",
  });

  const whatsappHref = useMemo(
    () =>
      buildWhatsAppHref(
        "Hello PrimeCare Diagnostics, I would like to discuss my laboratory procurement requirements."
      ),
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

  useEffect(() => {
    const id = decodeURIComponent(String(window.location.hash || "").replace(/^#/, ""));
    if (!id) return;

    const scrollToHash = () => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "auto", block: "start" });
    };

    scrollToHash();
    const frame = window.requestAnimationFrame(scrollToHash);
    return () => window.cancelAnimationFrame(frame);
  }, []);

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
              <h1>Diagnostic &amp; Laboratory Supply Solutions — Hyderabad</h1>
              <p className="hero-lead">
                PrimeCare Diagnostics works with diagnostic laboratories to understand their
                procurement requirements and provide responsive, transparent sourcing support for
                laboratory consumables and diagnostic supplies.
              </p>
              <p className="hero-support">
                Tell us what products and brands you currently purchase and where your procurement
                process can improve.
              </p>
              <div className="cta-row">
                {whatsappHref ? (
                  <a className="btn btn-primary" href={whatsappHref} target="_blank" rel="noopener noreferrer">
                    WhatsApp Us
                  </a>
                ) : null}
                <a className="btn btn-secondary" href="#enquiry">
                  Request a Quote
                </a>
              </div>
            </div>
            <aside className="hero-panel" aria-label="How we help labs">
              <div>
                <h2>Procurement support for diagnostic labs</h2>
                <p>
                  Share your recurring requirements. We help you clarify what you need and discuss
                  sourcing options with transparency.
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

        <section className="section" id="about">
          <div className="container about-block">
            <div className="section-head">
              <h2>About PrimeCare</h2>
            </div>
            <div className="about-copy">
              <p>
                PrimeCare Diagnostics is a Hyderabad-based laboratory supply and procurement company
                focused on making laboratory purchasing simpler, more responsive, and more
                transparent.
              </p>
              <p>
                We work directly with diagnostic laboratories to understand their recurring
                requirements and build supply relationships around the products they actually use.
              </p>
            </div>
          </div>
        </section>

        <section className="section section-alt" id="products">
          <div className="container">
            <div className="section-head">
              <h2>Supply categories</h2>
              <p>Broad laboratory supply categories we discuss with diagnostic laboratories.</p>
            </div>
            <div className="category-grid">
              {CATEGORIES.map((item) => (
                <article className="category-card" key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
            <p className="section-note">
              Product availability, brand availability, and regulated product supply are subject to
              supplier confirmation and applicable regulatory requirements.
            </p>
          </div>
        </section>

        <section className="section" id="why">
          <div className="container">
            <div className="section-head">
              <h2>Why PrimeCare</h2>
              <p>Service principles that guide how we work with laboratory partners.</p>
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
              <p>A simple discovery conversation for laboratory purchasing teams.</p>
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
              <h2>Discuss Your Requirements</h2>
              <p>
                Share your laboratory procurement requirements and continue on WhatsApp. We will
                review what you need and follow up to discuss options — no account creation required
                for first-time enquiries.
              </p>
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
                  required
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
                  required
                  value={form.contactPerson}
                  onChange={updateField("contactPerson")}
                  placeholder="Your name"
                />
              </div>
              <div className="field">
                <label htmlFor="location">Area / Location</label>
                <input
                  id="location"
                  name="location"
                  autoComplete="address-level2"
                  required
                  value={form.location}
                  onChange={updateField("location")}
                  placeholder="e.g. Banjara Hills, Hyderabad"
                />
              </div>
              <div className="field">
                <label htmlFor="productsBrands">Products / brands required</label>
                <textarea
                  id="productsBrands"
                  name="productsBrands"
                  required
                  value={form.productsBrands}
                  onChange={updateField("productsBrands")}
                  placeholder="List products or brands you currently purchase"
                />
              </div>
              <div className="field">
                <label htmlFor="monthlyRequirement">
                  Approximate monthly requirement <span className="field-optional">(optional)</span>
                </label>
                <input
                  id="monthlyRequirement"
                  name="monthlyRequirement"
                  value={form.monthlyRequirement}
                  onChange={updateField("monthlyRequirement")}
                  placeholder="e.g. approximate volume or spend range"
                />
              </div>
              <div className="field">
                <label htmlFor="procurementChallenge">
                  Main procurement challenge <span className="field-optional">(optional)</span>
                </label>
                <textarea
                  id="procurementChallenge"
                  name="procurementChallenge"
                  value={form.procurementChallenge}
                  onChange={updateField("procurementChallenge")}
                  placeholder="e.g. lead times, pricing clarity, reorder friction"
                />
              </div>
              <p className="form-note">
                Submitting opens WhatsApp with your enquiry details. Nothing is stored on this
                website.
              </p>
              {PUBLIC_SITE.hasWhatsApp ? (
                <button className="btn btn-primary" type="submit">
                  Continue on WhatsApp
                </button>
              ) : (
                <a className="btn btn-secondary" href="#contact">
                  View contact options
                </a>
              )}
            </form>
          </div>
        </section>

        <section className="section section-alt" id="contact">
          <div className="container">
            <div className="section-head">
              <h2>Contact</h2>
              <p>Reach PrimeCare Diagnostics for laboratory supply and procurement enquiries.</p>
            </div>
            <div className="contact-grid">
              {PUBLIC_SITE.hasWhatsApp ? (
                <article className="contact-card">
                  <h3>WhatsApp / Phone</h3>
                  <p>
                    <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                      {PUBLIC_SITE.whatsappDisplay}
                    </a>
                  </p>
                </article>
              ) : null}
              {PUBLIC_SITE.hasEmail ? (
                <article className="contact-card">
                  <h3>Email</h3>
                  <p>
                    <a href={`mailto:${PUBLIC_SITE.contactEmail}`}>{PUBLIC_SITE.contactEmail}</a>
                  </p>
                </article>
              ) : null}
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
                <p>Technology-enabled ordering and account access for PrimeCare customers.</p>
              </div>
              <a className="btn btn-primary" href={PUBLIC_SITE.portalUrl} rel="noopener noreferrer">
                Existing Customer Login
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
              PrimeCare Diagnostics · Hyderabad, Telangana
              <br />
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
