import { ensureInvoicePdfAndGetSignedUrl } from "@/api/invoiceSupabaseApi.js";

/**
 * One-click invoice PDF download with loading / error states.
 * @param {object} params
 * @param {string} [params.invoiceId]
 * @param {string} [params.orderId]
 * @param {string} [params.tenantId]
 * @param {(phase: 'loading'|'success'|'error', detail?: string) => void} [params.onPhase]
 */
export async function downloadInvoicePdf({
  invoiceId,
  orderId,
  tenantId,
  onPhase,
} = {}) {
  onPhase?.("loading");

  const res = await ensureInvoicePdfAndGetSignedUrl({
    invoiceId,
    orderId,
    tenantId,
  });

  if (!res.success || !res.url) {
    const message = res.error || "Unable to download invoice PDF";
    onPhase?.("error", message);
    return { success: false, error: message, invoiceId: res.invoiceId || null };
  }

  try {
    const anchor = document.createElement("a");
    anchor.href = res.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    const fileLabel = res.invoice?.invoiceNumber || res.invoiceId || "invoice";
    anchor.download = `${fileLabel}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    onPhase?.("success");
    return { success: true, invoiceId: res.invoiceId, url: res.url, error: null };
  } catch (err) {
    const message = err?.message || "Download failed";
    onPhase?.("error", message);
    return { success: false, error: message, invoiceId: res.invoiceId || null };
  }
}
