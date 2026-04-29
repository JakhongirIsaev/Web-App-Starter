import type { RecommendationDocument } from "@workspace/db";

// Pure matcher for the knowledge base. Given a set of candidate keywords
// (from profile + recommended products), returns the active KB docs whose
// tags overlap, sorted by sort_order then most-recent.
//
// Tags on a doc are stored as a comma-separated string (e.g. "transport,>7y,jewelry").
// Matching is case-insensitive, exact-tag (no partial substring), to keep
// authors in control of what triggers what.

export function extractTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function matchKnowledgeDocs(
  documents: RecommendationDocument[],
  keywords: Array<string | null | undefined>,
  limit = 5,
): RecommendationDocument[] {
  const lowerKeywords = new Set(
    keywords
      .filter((k): k is string => typeof k === "string" && k.length > 0)
      .map((k) => k.toLowerCase().trim())
      .filter(Boolean),
  );
  if (lowerKeywords.size === 0) return [];

  const matched = documents.filter((doc) => {
    if (!doc.isActive) return false;
    const tags = extractTags(doc.tags);
    return tags.some((tag) => lowerKeywords.has(tag));
  });

  return matched.slice(0, limit);
}
