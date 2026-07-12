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
