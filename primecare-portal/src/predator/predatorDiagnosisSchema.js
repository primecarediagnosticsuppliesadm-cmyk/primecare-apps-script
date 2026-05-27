/**
 * Predator Phase 3 — pipeline layers (ordered) for divergence tracing.
 * @readonly
 */
export const PREDATOR_PIPELINE_LAYERS = [
  { id: "auth", label: "Auth / Session" },
  { id: "rls", label: "RLS / Browser DB" },
  { id: "api", label: "API Payload" },
  { id: "normalize", label: "Normalization" },
  { id: "compute", label: "KPI Compute" },
  { id: "cache", label: "Cache" },
  { id: "state", label: "React State" },
  { id: "ui", label: "Rendered UI" },
];

/**
 * @typedef {'cosmetic' | 'functional' | 'data_integrity' | 'security' | 'tenant_isolation' | 'performance' | 'ui_sync' | 'render_timing' | 'setup_pending' | 'informational'} PredatorIssueClass
 */

/**
 * @typedef {Object} PredatorLayerValue
 * @property {string} layerId
 * @property {string} label
 * @property {unknown} value
 * @property {'PASS' | 'WARN' | 'FAIL'} [status]
 * @property {number|null} [durationMs]
 * @property {Record<string, unknown>} [meta]
 */

/**
 * @typedef {Object} PredatorRootCauseDiagnosis
 * @property {string} metricId
 * @property {string} metricLabel
 * @property {'PASS' | 'INFO' | 'WARN' | 'FAIL'} status
 * @property {PredatorIssueClass} issueClass
 * @property {string} firstDivergenceLayer
 * @property {string} probableRootCause
 * @property {string[]} suggestions
 * @property {PredatorLayerValue[]} layerTrace
 * @property {string} timestamp
 */

/**
 * @typedef {Object} PredatorModuleDiagnosis
 * @property {string} module
 * @property {'PASS' | 'INFO' | 'WARN' | 'FAIL'} status
 * @property {PredatorRootCauseDiagnosis[]} metrics
 * @property {Object[]} timeline
 * @property {Object|null} regression
 * @property {string} ranAt
 * @property {Object} [reliability]
 * @property {string} [healthHeadline]
 */

/**
 * @typedef {Object} PredatorModuleReliabilityScore
 * @property {string} module
 * @property {number} dataReliability
 * @property {number} renderStability
 * @property {number} cacheHealth
 * @property {number} stateSynchronization
 * @property {number} rerenderStability
 * @property {'PASS' | 'WARN' | 'FAIL'} summary
 * @property {string} computedAt
 */
