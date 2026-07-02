/**
 * Shared validation report for Architecture Enforcement Platform.
 */
export class ValidationReport {
  constructor(name) {
    this.name = name;
    this.findings = [];
    this.stats = { error: 0, warn: 0, info: 0, pass: 0 };
  }

  add(severity, code, message, { file = null, scope = "global" } = {}) {
    this.findings.push({ severity, code, message, file, scope });
    if (severity in this.stats) this.stats[severity]++;
  }

  pass(code, message) {
    this.add("pass", code, message);
  }

  error(code, message, meta = {}) {
    this.add("error", code, message, meta);
  }

  warn(code, message, meta = {}) {
    this.add("warn", code, message, meta);
  }

  info(code, message, meta = {}) {
    this.add("info", code, message, meta);
  }

  score(maxErrors = 0) {
    const penalty = this.stats.error * 10 + this.stats.warn * 3;
    return Math.max(0, 100 - penalty);
  }

  failed() {
    return this.stats.error > 0;
  }

  toJSON() {
    return {
      name: this.name,
      score: this.score(),
      stats: this.stats,
      findings: this.findings.filter((f) => f.severity !== "pass"),
    };
  }

  print() {
    console.log(`\n=== ${this.name} ===`);
    for (const f of this.findings) {
      if (f.severity === "pass") continue;
      const prefix = f.severity.toUpperCase().padEnd(5);
      const loc = f.file ? ` [${f.file}]` : "";
      console.log(`${prefix} ${f.code}${loc}: ${f.message}`);
    }
    console.log(
      `Score: ${this.score()}/100 — errors=${this.stats.error} warns=${this.stats.warn} infos=${this.stats.info}`
    );
  }
}

export class EnforcementSummary {
  constructor() {
    this.reports = [];
  }

  add(report) {
    this.reports.push(report);
  }

  failed() {
    return this.reports.some((r) => r.failed());
  }

  aggregateScore() {
    if (!this.reports.length) return 100;
    return Math.round(this.reports.reduce((s, r) => s + r.score(), 0) / this.reports.length);
  }

  dimensionScores() {
    return Object.fromEntries(this.reports.map((r) => [r.name, r.score()]));
  }

  toJSON() {
    return {
      generated_at: new Date().toISOString(),
      aggregate_score: this.aggregateScore(),
      failed: this.failed(),
      dimensions: this.dimensionScores(),
      reports: this.reports.map((r) => r.toJSON()),
    };
  }

  print() {
    for (const r of this.reports) r.print();
    console.log(`\n=== ENFORCEMENT SUMMARY ===`);
    console.log(`Aggregate score: ${this.aggregateScore()}/100`);
    console.log(`Result: ${this.failed() ? "FAIL" : "PASS"}`);
  }
}

export function shouldEnforceFinding(file, scopeFiles, severity, incremental) {
  if (incremental && !scopeFiles?.length) {
    return severity === "error" ? false : false;
  }
  if (severity === "error" && incremental && scopeFiles?.length) {
    return file ? scopeFiles.some((f) => file.includes(f) || f.includes(file)) : false;
  }
  if (severity === "warn" && incremental) return false;
  return true;
}
