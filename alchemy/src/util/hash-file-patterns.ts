import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "pathe";

/**
 * Returns a combined hash of the contents of the files matching the given patterns.
 *
 * @param cwd - The working directory to search for files.
 * @param patterns - The glob patterns to match files.
 * @returns A hash of the contents of the files matching the given patterns.
 */
export async function hashFilePatterns(cwd: string, patterns: string[]) {
  const { glob } = await import("glob");

  const files = await glob(patterns, { cwd, nodir: true });
  const hashes = new Map<string, string>();

  await Promise.all(
    files.map(async (file) => {
      const content = await fs.readFile(path.join(cwd, file));
      hashes.set(
        file,
        crypto.createHash("sha256").update(content).digest("hex"),
      );
    }),
  );

  const sortedHashes = Array.from(hashes.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  const finalHash = crypto.createHash("sha256");
  for (const [, hash] of sortedHashes) {
    finalHash.update(hash);
  }
  return finalHash.digest("hex");
}
