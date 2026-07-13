/**
 * Context-aware labels for collection payment / follow-up actions.
 */
export function getCollectionSaveLoadingLabel({
  amountCollected = "",
  evidenceUploading = false,
  saving = false,
} = {}) {
  if (evidenceUploading && !saving) return "Uploading proof…";
  const amt = Number(amountCollected || 0);
  if (amt > 0) return "Recording payment…";
  return "Saving follow-up…";
}

export function getEvidenceUploadProgressMessage(percent = 0) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  if (pct > 0 && pct < 100) return `Uploading proof… ${pct}%`;
  return "Uploading proof…";
}
