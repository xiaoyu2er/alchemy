/**
 * Utility functions for snippet tests
 */

/**
 * Create a valid snippet name from a base string
 * Cloudflare snippet names must contain only lowercase letters, numbers, and underscores
 */
export function createSnippetName(base: string): string {
  return base.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
}
