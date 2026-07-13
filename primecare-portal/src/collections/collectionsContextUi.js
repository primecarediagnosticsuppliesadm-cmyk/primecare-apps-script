/**
 * Build context strip parts for Collections workspaces (orientation only).
 */
export function buildCollectionsContextParts({
  workspaceLabel = "",
  attentionFilter = "",
  selectedLabName = "",
  searchActive = false,
  searchQuery = "",
  focusLabName = "",
} = {}) {
  const parts = [];
  if (workspaceLabel) parts.push(workspaceLabel);
  if (attentionFilter && attentionFilter !== "ALL") {
    parts.push(`Filter: ${attentionFilter}`);
  }
  if (selectedLabName) parts.push(`Recording: ${selectedLabName}`);
  else if (focusLabName) parts.push(`Focused: ${focusLabName}`);
  if (searchActive && searchQuery) parts.push(`Search: “${searchQuery}”`);
  return parts;
}
