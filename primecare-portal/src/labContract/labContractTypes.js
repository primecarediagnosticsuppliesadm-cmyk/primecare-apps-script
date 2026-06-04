export const LAB_CONTRACT_VERSION = "v1";

export const CONTRACT_TYPES = {
  L1A_CONSUMABLES: "L1A Consumables",
  L1B_REAGENT_RENTAL: "L1B Reagent Rental",
  LAB_OS: "Lab OS",
  HYBRID: "Hybrid",
};

export const CONTRACT_STATUSES = {
  DRAFT: "Draft",
  UNDER_REVIEW: "Under Review",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  EXPIRED: "Expired",
  TERMINATED: "Terminated",
};

export const PAYMENT_TERMS_OPTIONS = [
  "Immediate",
  "15 Days",
  "30 Days",
  "45 Days",
  "60 Days",
];

export const HEALTH_BANDS = {
  HEALTHY: "Healthy",
  WATCH: "Watch",
  RISK: "Risk",
};

export const REAGENT_COMPLIANCE = {
  COMPLIANT: "Compliant",
  AT_RISK: "At Risk",
  BREACH_RISK: "Breach Risk",
};

export const TIMELINE_EVENT_TYPES = [
  "created",
  "submitted",
  "approved",
  "activated",
  "suspended",
  "renewed",
  "expired",
  "terminated",
];
