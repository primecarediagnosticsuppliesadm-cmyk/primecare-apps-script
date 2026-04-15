export default function StatCard({ label, value }) {
  return (
    <div style={styles.card}>
      <div style={styles.label}>{label}</div>
      <div style={styles.value}>{value}</div>
    </div>
  );
}

const styles = {
  card: {
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "16px",
    marginBottom: "10px",
  },
  label: {
    fontSize: "12px",
    color: "#64748b",
  },
  value: {
    fontSize: "24px",
    fontWeight: "bold",
  },
};