import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { listOperationalEvidence } from "@/api/operationalEvidenceApi.js";
import EvidencePreviewDrawer from "@/components/evidence/EvidencePreviewDrawer.jsx";
import { ImageIcon } from "lucide-react";

/**
 * @param {object} props
 * @param {object} props.currentUser
 * @param {string} [props.labId]
 * @param {string} [props.visitId]
 * @param {string} [props.paymentId]
 * @param {string} [props.className]
 * @param {string} [props.size] sm | default
 */
export default function EvidenceContextActions({
  currentUser,
  labId,
  visitId,
  paymentId,
  className = "",
  size = "sm",
}) {
  const [open, setOpen] = useState(false);
  const tenantId = currentUser?.tenantId ?? currentUser?.tenant_id ?? "";

  const records = useMemo(
    () =>
      listOperationalEvidence(tenantId, currentUser, {
        labId,
        visitId,
        paymentId,
        limit: 24,
      }),
    [tenantId, currentUser, labId, visitId, paymentId, open]
  );

  if (!records.length) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
        Proof ({records.length})
      </Button>
      <EvidencePreviewDrawer
        open={open}
        onClose={() => setOpen(false)}
        currentUser={currentUser}
        labId={labId}
        visitId={visitId}
        paymentId={paymentId}
        initialRecord={records[0]}
      />
    </>
  );
}
