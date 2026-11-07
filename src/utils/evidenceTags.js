export const normalizeEvidenceTags = (value) => {
  const values = Array.isArray(value)
    ? value
    : String(value || "").split(/[,
]/);
  const seen = new Set();
  return values
    .map((tag) => String(tag || "").trim().replace(/^#+/, "").slice(0, 32))
    .filter((tag) => {
      const key = tag.toLocaleLowerCase();
      if (!tag || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
};

export const evidenceTagsToText = (value) =>
  normalizeEvidenceTags(value).join(", ");
