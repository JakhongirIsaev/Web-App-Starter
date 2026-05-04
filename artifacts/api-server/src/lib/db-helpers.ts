/**
 * Escape SQL LIKE wildcard characters (%) and (_) in user-supplied strings
 * so they are treated as literal characters, not pattern metacharacters.
 */
export function escapeLike(str: string): string {
  return str.replace(/%/g, "\\%").replace(/_/g, "\\_");
}
