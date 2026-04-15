import { Link, useLocation } from "react-router-dom";

export default function Layout({ title, children }) {
  const location = useLocation();

  const navItems = [
    { path: "/", label: "Dashboard" },
    { path: "/stock", label: "Stock" },
    { path: "/visit", label: "Visit" },
  ];

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <h1 style={styles.title}>{title}</h1>
      </header>

      <main style={styles.main}>{children}</main>

      <nav style={styles.nav}>
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            style={{
              ...styles.navLink,
              ...(location.pathname === item.path ? styles.active : {}),
            }}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

const styles = {
  app: {
    minHeight: "100vh",
    background: "#f8fafc",
    paddingBottom: "70px",
  },
  header: {
    background: "#2563eb",
    color: "white",
    padding: "16px",
  },
  title: {
    margin: 0,
  },
  main: {
    padding: "16px",
  },
  nav: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "space-around",
    background: "white",
    borderTop: "1px solid #e2e8f0",
    padding: "10px",
  },
  navLink: {
    textDecoration: "none",
    color: "#64748b",
    fontWeight: "bold",
  },
  active: {
    color: "#2563eb",
  },
};