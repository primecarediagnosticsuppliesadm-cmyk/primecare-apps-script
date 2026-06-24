import React, { useEffect, useMemo } from "react";
import {
  Loader2,
  X,
  Package,
  Truck,
  CheckCircle2,
  Circle,
  Download,
  LifeBuoy,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ux";
import { paymentStatusToVariant } from "@/utils/statusTokens";
import { cn } from "@/lib/utils";
import {
  buildTrackingSteps,
  isCancelledStatus,
  logOrderTrackingEvent,
  orderStatusChipVariant,
  resolveDrawerDetails,
} from "@/utils/orderTracking.js";

function formatWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StepIcon({ state, stepKey }) {
  if (state === "complete") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  }
  if (state === "current") {
    if (stepKey === "dispatched") return <Truck className="h-3.5 w-3.5 text-blue-600" />;
    if (stepKey === "packed") return <Package className="h-3.5 w-3.5 text-indigo-600" />;
    return <Circle className="h-3 w-3 fill-blue-500 text-blue-600 animate-pulse" />;
  }
  if (state === "cancelled") {
    return <X className="h-3.5 w-3.5 text-red-600" />;
  }
  return <Circle className="h-3 w-3 text-slate-300" />;
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {object | null} props.order
 * @param {boolean} [props.loading]
 * @param {string} [props.error]
 * @param {(action: string, details: object | null) => void} [props.onAction]
 * @param {boolean} [props.repeatLoading]
 * @param {boolean} [props.invoiceLoading]
 */
export default function OrderTrackingDrawer({
  open,
  onClose,
  order,
  loading = false,
  error = "",
  onAction,
  repeatLoading = false,
  invoiceLoading = false,
}) {
  const details = useMemo(() => resolveDrawerDetails(order), [order]);

  const steps = useMemo(() => {
    if (!details) return [];
    return buildTrackingSteps(
      {
        orderStatus: details.orderStatus,
        createdAt: details.createdAt,
        orderDate: details.orderDate,
        updatedAt: details.updatedAt,
      },
      {
        placedAt: details.createdAt || details.orderDate,
        updatedAt: details.updatedAt || details.orderDate,
      }
    );
  }, [details]);

  const cancelled = details ? isCancelledStatus(details.orderStatus) : false;

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !details?.orderId) return;
    logOrderTrackingEvent("order_tracking.timeline_render", {
      orderId: details.orderId,
      status: details.orderStatus,
    });
  }, [open, details?.orderId, details?.orderStatus]);

  if (!open) return null;

  const handleAction = (action) => {
    if (onAction) onAction(action, details);
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Order tracking">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close order tracking"
      />
      <div
        className={cn(
          "absolute flex flex-col bg-white shadow-[-12px_0_40px_rgba(15,23,42,0.18)]",
          "inset-y-0 right-0 w-full max-w-[min(100vw,520px)]",
          "max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:h-[min(88vh,720px)] max-md:max-w-none max-md:rounded-t-xl"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Order Tracking</p>
            {details?.orderId ? (
              <p className="truncate text-[11px] text-slate-500">ORD {details.orderId}</p>
            ) : null}
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading order details…
            </div>
          ) : error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : !details ? (
            <div className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-slate-500">
              No order details available.
            </div>
          ) : (
            <div className="space-y-3">
              <section className="rounded-lg border border-slate-200 bg-slate-50/80 p-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Current status</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StatusBadge variant={orderStatusChipVariant(details.orderStatus)}>
                        {details.orderStatus}
                      </StatusBadge>
                      <StatusBadge variant={paymentStatusToVariant(details.paymentLabel)}>
                        {details.paymentLabel}
                      </StatusBadge>
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-600">
                    <p className="font-semibold tabular-nums text-slate-900">
                      ₹{Number(details.orderTotal || 0).toLocaleString("en-IN")}
                    </p>
                    <p>{details.productUnitLabel || `${details.itemCount} items`}</p>
                  </div>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                  <div>
                    <dt className="text-slate-500">Order date</dt>
                    <dd>{formatWhen(details.orderDate || details.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Payment</dt>
                    <dd>{details.paymentLabel}</dd>
                  </div>
                </dl>
              </section>

              {cancelled ? (
                <section className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-900">
                  <p className="text-sm font-semibold text-red-800">Order Cancelled</p>
                  <p className="mt-0.5 text-red-700">This order will not be fulfilled.</p>
                  <dl className="mt-2 space-y-1.5 text-[11px]">
                    <div>
                      <dt className="font-medium text-red-800/80">Cancelled On</dt>
                      <dd className="text-red-900">
                        {details.cancelledOnLabel
                          ? formatWhen(details.cancelledOnLabel)
                          : "Not captured"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-red-800/80">Reason</dt>
                      <dd className="whitespace-pre-wrap text-red-900">
                        {details.cancellationReason || "No reason captured"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-red-800/80">Cancelled By</dt>
                      <dd className="text-red-900">{details.cancelledByLabel}</dd>
                    </div>
                  </dl>
                </section>
              ) : (
                <section>
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Order progress
                  </h3>
                  <ol className="relative ml-0.5">
                    {steps.map((step, index) => (
                      <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0">
                        {index < steps.length - 1 ? (
                          <span
                            className={cn(
                              "absolute left-[13px] top-7 bottom-0 w-px",
                              step.state === "complete" ? "bg-emerald-300" : "bg-slate-200"
                            )}
                            aria-hidden
                          />
                        ) : null}
                        <span
                          className={cn(
                            "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 bg-white",
                            step.state === "complete" && "border-emerald-500",
                            step.state === "current" && "border-blue-500 shadow-sm",
                            step.state === "upcoming" && "border-slate-200"
                          )}
                        >
                          <StepIcon state={step.state} stepKey={step.key} />
                        </span>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p
                            className={cn(
                              "text-xs font-medium",
                              step.state === "current" && "text-blue-700",
                              step.state === "complete" && "text-slate-800",
                              step.state === "upcoming" && "text-slate-400"
                            )}
                          >
                            {step.label}
                          </p>
                          {step.timestamp ? (
                            <p className="mt-0.5 text-[10px] text-slate-500">
                              {formatWhen(step.timestamp)}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              <section>
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Order items
                </h3>
                <div className="space-y-1.5">
                  {details.lines.length ? (
                    details.lines.map((line) => (
                      <div
                        key={line.orderLineId || line.productId}
                        className="flex items-center justify-between gap-2 rounded-md border border-slate-100 px-2 py-1.5 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{line.productName}</p>
                          <p className="text-slate-500">
                            Qty {line.quantity} · ₹{Number(line.unitPrice).toLocaleString("en-IN")} each
                          </p>
                        </div>
                        <p className="shrink-0 font-semibold tabular-nums">
                          ₹{Number(line.lineTotal).toLocaleString("en-IN")}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">Line items will appear once fulfillment syncs.</p>
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 p-2.5">
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Delivery & operations
                </h3>
                <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">Expected dispatch</dt>
                    <dd className="text-slate-800">
                      {details.expectedDispatch || "Pending schedule update"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Last updated</dt>
                    <dd className="text-slate-800">
                      {formatWhen(details.updatedAt || details.orderDate)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Delivery status</dt>
                    <dd className="text-slate-800">{details.deliveryStatus || details.orderStatus}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Payment status</dt>
                    <dd className="text-slate-800">{details.paymentLabel}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-slate-500">Fulfillment note</dt>
                    <dd className="text-slate-800">{details.fulfillmentNote || "No notes yet"}</dd>
                  </div>
                </dl>
              </section>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t bg-white px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 flex-1 min-w-[7rem] text-xs"
              disabled={!details || cancelled || invoiceLoading}
              title={cancelled ? "No invoice available for cancelled orders" : undefined}
              onClick={() => handleAction("invoice")}
            >
              {invoiceLoading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-3.5 w-3.5" />
              )}
              {invoiceLoading ? "Downloading…" : "Invoice"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 flex-1 min-w-[7rem] text-xs"
              disabled={!details}
              onClick={() => handleAction("support")}
            >
              <LifeBuoy className="mr-1.5 h-3.5 w-3.5" />
              Support
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-9 flex-1 min-w-[8rem] text-xs"
              onClick={() => handleAction("repeat")}
              disabled={repeatLoading || !details}
            >
              {repeatLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Repeat order
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}