/**
 * Context-aware labels for HQ order status actions.
 */
export function getOrderStatusActionLoadingLabel(nextStatus = "") {
  switch (String(nextStatus || "").trim()) {
    case "Processing":
      return "Marking Processing…";
    case "Fulfilled":
      return "Fulfilling Order…";
    case "Cancelled":
      return "Cancelling Order…";
    case "Placed":
      return "Resetting Order…";
    default:
      return "Updating…";
  }
}
