/**
 * Logistics Phase 2 — courier registry and shipment assignment validation.
 */

function str(v) {
  return String(v ?? "").trim();
}

export const ASSIGNMENT_TYPE = {
  INTERNAL_DRIVER: "internal_driver",
  EXTERNAL_COURIER: "external_courier",
  CUSTOMER_PICKUP: "customer_pickup",
};

export const ASSIGNMENT_TYPE_OPTIONS = [
  { id: ASSIGNMENT_TYPE.INTERNAL_DRIVER, label: "Internal Driver" },
  { id: ASSIGNMENT_TYPE.EXTERNAL_COURIER, label: "External Courier" },
  { id: ASSIGNMENT_TYPE.CUSTOMER_PICKUP, label: "Customer Pickup" },
];

/** Maps assignment UI type → persisted delivery_method + assignee_type */
export function assignmentTypeToDeliveryFields(assignmentType) {
  const key = str(assignmentType).toLowerCase();
  if (key === ASSIGNMENT_TYPE.INTERNAL_DRIVER) {
    return { deliveryMethod: "primecare_delivery", assignedToType: "driver" };
  }
  if (key === ASSIGNMENT_TYPE.EXTERNAL_COURIER) {
    return { deliveryMethod: "courier", assignedToType: "courier" };
  }
  if (key === ASSIGNMENT_TYPE.CUSTOMER_PICKUP) {
    return { deliveryMethod: "customer_pickup", assignedToType: "" };
  }
  return { deliveryMethod: "", assignedToType: "" };
}

export function deliveryMethodToAssignmentType(deliveryMethod, assignedToType = "") {
  const method = str(deliveryMethod).toLowerCase();
  const assignee = str(assignedToType).toLowerCase();
  if (method === "customer_pickup") return ASSIGNMENT_TYPE.CUSTOMER_PICKUP;
  if (method === "courier" || assignee === "courier") return ASSIGNMENT_TYPE.EXTERNAL_COURIER;
  if (method === "primecare_delivery" || assignee === "driver") return ASSIGNMENT_TYPE.INTERNAL_DRIVER;
  if (method === "courier") return ASSIGNMENT_TYPE.EXTERNAL_COURIER;
  return "";
}

export function assignmentTypeLabel(assignmentType) {
  const key = str(assignmentType).toLowerCase();
  return ASSIGNMENT_TYPE_OPTIONS.find((o) => o.id === key)?.label || assignmentType || "—";
}

export function isExternalCourierAssignment(assignmentType) {
  return str(assignmentType).toLowerCase() === ASSIGNMENT_TYPE.EXTERNAL_COURIER;
}

export function isCustomerPickupAssignment(assignmentType) {
  return str(assignmentType).toLowerCase() === ASSIGNMENT_TYPE.CUSTOMER_PICKUP;
}

export function buildCourierId() {
  const suffix = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `CRR-${Date.now().toString(36).toUpperCase()}-${suffix}`;
}

export function mapCourierRow(row) {
  if (!row) return null;
  return {
    courierId: str(row.courier_id ?? row.courierId),
    tenantId: str(row.tenant_id ?? row.tenantId),
    name: str(row.name),
    contactPerson: str(row.contact_person ?? row.contactPerson),
    phone: str(row.phone),
    email: str(row.email),
    vehicleType: str(row.vehicle_type ?? row.vehicleType),
    isActive: row.is_active ?? row.isActive ?? true,
    notes: str(row.notes),
    createdBy: str(row.created_by ?? row.createdBy),
    createdAt: str(row.created_at ?? row.createdAt),
    updatedAt: str(row.updated_at ?? row.updatedAt),
  };
}

export function validateShipmentAssignment({
  assignmentType = "",
  courierId = "",
  assignedToName = "",
  trackingNumber = "",
} = {}) {
  const type = str(assignmentType).toLowerCase();
  if (!type) {
    return { valid: false, error: "Select an assignment type (Internal Driver, External Courier, or Customer Pickup)." };
  }
  if (isCustomerPickupAssignment(type)) {
    return { valid: true, error: null };
  }
  if (!str(assignedToName)) {
    return { valid: false, error: "Assigned person is required." };
  }
  if (isExternalCourierAssignment(type)) {
    if (!str(courierId)) {
      return { valid: false, error: "Select a courier for external courier assignments." };
    }
    if (!str(trackingNumber)) {
      return { valid: false, error: "Tracking number is required for external courier shipments." };
    }
  }
  return { valid: true, error: null };
}

export function validateCourierForm({ name = "" } = {}) {
  if (!str(name)) {
    return { valid: false, error: "Courier name is required." };
  }
  return { valid: true, error: null };
}

export function filterCouriers(couriers = [], { search = "", activeOnly = false } = {}) {
  const q = str(search).toLowerCase();
  return (couriers || []).filter((row) => {
    if (activeOnly && row.isActive === false) return false;
    if (!q) return true;
    return (
      str(row.name).toLowerCase().includes(q) ||
      str(row.contactPerson).toLowerCase().includes(q) ||
      str(row.phone).toLowerCase().includes(q) ||
      str(row.email).toLowerCase().includes(q)
    );
  });
}

export function sortCouriersByName(couriers = []) {
  return [...(couriers || [])].sort((a, b) => str(a.name).localeCompare(str(b.name)));
}
