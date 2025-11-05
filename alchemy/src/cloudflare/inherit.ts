/**
 * Cloudflare Workers binding for inherting existing bindings.
 *
 * If a binding exists on another worker it can be copied to a new worker deployment.
 *
 * @example
 * ```ts
 * import { Worker, Inherit } from "alchemy/cloudflare";
 *
 * await Worker("my-worker", {
 *   name: "my-worker",
 *   entrypoint: "./src/worker.ts",
 *   bindings: {
 *     KEY: Inherit("Key")
 *   }
 * });
 * ```
 */
export function Inherit(options?: { oldName?: string; versionId?: string }) {
  return {
    type: "inherit",
    old_name: options?.oldName,
    version_id: options?.versionId,
  } as const;
}

export type Inherit = {
  type: "inherit";
  old_name: string | undefined;
  version_id: string | undefined;
};
