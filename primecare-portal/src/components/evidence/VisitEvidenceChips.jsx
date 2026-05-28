import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import EvidencePreviewDrawer from "@/components/evidence/EvidencePreviewDrawer.jsx";
import { ImageIcon } from "lucide-react";
import {
  getEvidenceKindLabel,
  filterVisitProofEvidence,
  filterVisitSessionCollectionEvidence,
} from "@/utils/operationalEvidenceUi.js";

/**
 * Scoped evidence actions for a visit row (visit proof vs collection-on-visit only).
 */
export default function VisitEvidenceChips({
  currentUser,
  visitId,
  labId,
  allEvidence = [],
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [focusRecord, setFocusRecord] = useState(null);

  const visitProof = filterVisitProofEvidence(allEvidence, visitId);
  const collectionOnVisit = filterVisitSessionCollectionEvidence(allEvidence, visitId);

  if (!visitProof.length && !collectionOnVisit.length) return null;

  function openDrawer(record) {
    setFocusRecord(record);
    setOpen(true);
  }

  return (
    <>
      <div className={`flex flex-wrap gap-1.5 ${className}`}>
        {visitProof.length ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[10px]"
            onClick={() => openDrawer(visitProof[0])}
          >
            <ImageIcon className="mr-1 h-3 w-3" />
            Visit proof ({visitProof.length})
          </Button>
        ) : null}
        {collectionOnVisit.length ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[10px]"
            onClick={() => openDrawer(collectionOnVisit[0])}
          >
            <ImageIcon className="mr-1 h-3 w-3" />
            {getEvidenceKindLabel(collectionOnVisit[0].kind)} ({collectionOnVisit.length})
          </Button>
        ) : null}
      </div>
      <EvidencePreviewDrawer
        open={open}
        onClose={() => {
          setOpen(false);
          setFocusRecord(null);
        }}
        currentUser={currentUser}
        labId={labId}
        visitId={visitId}
        initialRecord={focusRecord}
        records={open ? [...visitProof, ...collectionOnVisit] : undefined}
      />
    </>
  );
}
