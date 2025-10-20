import type { Context } from "../context.ts";
import { Resource } from "../resource.ts";
import { logger } from "../util/logger.ts";
import { withExponentialBackoff } from "../util/retry.ts";
import { CloudflareApiError } from "./api-error.ts";
import { extractCloudflareResult } from "./api-response.ts";
import {
  createCloudflareApi,
  type CloudflareApi,
  type CloudflareApiOptions,
} from "./api.ts";
import { type Snippet } from "./snippet.ts";
import { findZoneForHostname, type Zone } from "./zone.ts";

/**
 * Input format for snippet rule operations
 * @internal
 */
export interface SnippetRuleInput {
  expression: string;
  snippetName: string;
  description?: string;
  enabled?: boolean;
}

/**
 * Cloudflare API response format for a snippet rule
 * @internal
 */
export interface SnippetRuleResponse {
  id: string;
  expression: string;
  snippet_name: string;
  description?: string;
  enabled: boolean;
  last_updated: string;
  version: string;
}

/**
 * Properties for creating or updating a batch of Snippet Rules
 */
export interface SnippetRuleProps extends CloudflareApiOptions {
  /**
   * The zone this rule batch belongs to
   * Can be a zone ID (32-char hex), zone name/hostname (e.g. "example.com"), or a Zone resource
   */
  zone: string | Zone;

  /**
   * Array of rules to manage for this zone
   * Rules are executed in the order they appear in this array
   */
  rules: Array<{
    /**
     * The expression defining which traffic will match the rule
     * @example 'http.request.uri.path eq "/api"'
     */
    expression: string;

    /**
     * The snippet to execute (by name or Snippet resource)
     */
    snippet: string | Snippet;

    /**
     * Optional description of the rule
     */
    description?: string;

    /**
     * Whether the rule is enabled (default: true)
     */
    enabled?: boolean;

    /**
     * Optional ID for identifying this rule in the batch
     * Used internally for adoption and updates
     * @internal
     */
    id?: string;
  }>;

  /**
   * Whether to adopt existing rules matching the same expressions/snippets
   * @default false
   */
  adopt?: boolean;
}

/**
 * A Snippet Rule batch resource
 */
export type SnippetRule = Omit<SnippetRuleProps, "rules" | "adopt" | "zone"> & {
  /**
   * The identifier for this rule batch resource
   */
  id: string;

  /**
   * The zone ID
   */
  zoneId: string;

  /**
   * Rules managed by this resource
   */
  rules: Array<{
    /**
     * The ID of the rule
     */
    ruleId: string;

    /**
     * The expression for the rule
     */
    expression: string;

    /**
     * The snippet name
     */
    snippetName: string;

    /**
     * Description of the rule
     */
    description?: string;

    /**
     * Whether the rule is enabled
     */
    enabled: boolean;

    /**
     * Last updated timestamp
     */
    lastUpdated: Date;
  }>;

  /**
   * Resource type identifier
   * @internal
   */
  type: "snippet-rule";
};

/**
 * Manages a batch of Snippet Rules for a zone
 *
 * The SnippetRule resource manages all snippet rules in a zone as a cohesive batch.
 * Rules are executed in the order they appear in the rules array. This resource
 * uses the batch update pattern for efficiency and atomic consistency.
 *
 * @example
 * // Create a batch of rules with explicit order
 * const rules = await SnippetRule("my-rules", {
 *   zone: "example.com",
 *   rules: [
 *     {
 *       expression: 'http.request.uri.path eq "/api"',
 *       snippet: apiSnippet,
 *       description: "API endpoint handler",
 *     },
 *     {
 *       expression: 'http.request.uri.path eq "/admin"',
 *       snippet: adminSnippet,
 *       description: "Admin panel handler",
 *       enabled: false,
 *     }
 *   ]
 * });
 *
 * @example
 * // Update rules maintaining explicit order
 * const updated = await SnippetRule("my-rules", {
 *   zone: "example.com",
 *   rules: [
 *     // New first rule
 *     {
 *       expression: 'http.request.uri.path eq "/health"',
 *       snippet: healthSnippet,
 *     },
 *     // Existing rules follow
 *     {
 *       id: previousRuleId,
 *       expression: 'http.request.uri.path eq "/api"',
 *       snippet: apiSnippet,
 *     }
 *   ]
 * });
 */
export const SnippetRule = Resource(
  "cloudflare::SnippetRule",
  async function (
    this: Context<SnippetRule>,
    id: string,
    props: SnippetRuleProps,
  ): Promise<SnippetRule> {
    const api = await createCloudflareApi(props);
    let zoneId: string;
    if (this.output?.zoneId) {
      zoneId = this.output.zoneId;
    } else if (typeof props.zone === "string") {
      zoneId = props.zone.includes(".")
        ? (await findZoneForHostname(api, props.zone)).zoneId
        : props.zone;
    } else {
      zoneId = props.zone.id;
    }

    if (this.phase === "delete") {
      await deleteSnippetRules(api, zoneId);
      return this.destroy();
    }

    const seenRuleDefinitions = new Set<string>();
    for (const rule of props.rules) {
      const key = `${rule.expression}:${
        typeof rule.snippet === "string" ? rule.snippet : rule.snippet.name
      }`;
      if (seenRuleDefinitions.has(key)) {
        throw new Error(
          `Duplicate rule found: expression="${rule.expression}" with snippet="${
            typeof rule.snippet === "string" ? rule.snippet : rule.snippet.name
          }"`,
        );
      }
      seenRuleDefinitions.add(key);
    }

    const existingRules = await listSnippetRules(api, zoneId);
    const existingByKey = new Map(
      existingRules.map((r) => [`${r.expression}:${r.snippet_name}`, r]),
    );
    const apiRules: Array<SnippetRuleInput & { id?: string }> = [];

    for (const rule of props.rules) {
      const snippetName =
        typeof rule.snippet === "string" ? rule.snippet : rule.snippet.name;
      const key = `${rule.expression}:${snippetName}`;
      const existing = existingByKey.get(key);

      if (rule.id || existing) {
        apiRules.push({
          id: rule.id || existing?.id,
          expression: rule.expression,
          snippetName,
          description: rule.description,
          enabled: rule.enabled ?? true,
        });
      } else {
        apiRules.push({
          expression: rule.expression,
          snippetName,
          description: rule.description,
          enabled: rule.enabled ?? true,
        });
      }
    }

    const result = await withExponentialBackoff(
      async () => updateSnippetRules(api, zoneId, apiRules),
      (error: CloudflareApiError) => {
        const shouldRetry = error.errorData?.some(
          (e: any) =>
            e.code === 1002 ||
            e.message?.includes("doesn't exist") ||
            e.message?.includes("not found"),
        );
        if (shouldRetry) {
          logger.warn(
            `Snippet rules update encountered error, retrying due to propagation delay: ${error.message}`,
          );
        }
        return shouldRetry;
      },
      20,
      100,
    );

    return {
      id,
      zoneId,
      rules: result.map((r) => ({
        ruleId: r.id,
        expression: r.expression,
        snippetName: r.snippet_name,
        description: r.description,
        enabled: r.enabled,
        lastUpdated: new Date(r.last_updated),
      })),
      type: "snippet-rule",
    };
  },
);

/**
 * List all snippet rules in a zone
 * @internal
 */
export async function listSnippetRules(
  api: CloudflareApi,
  zoneId: string,
): Promise<SnippetRuleResponse[]> {
  const result = await extractCloudflareResult<SnippetRuleResponse[] | null>(
    `list snippet rules in zone "${zoneId}"`,
    api.get(`/zones/${zoneId}/snippets/snippet_rules`),
  );

  return result ?? [];
}

/**
 * Update snippet rules in a zone (replaces all rules)
 * @internal
 */
export async function updateSnippetRules(
  api: CloudflareApi,
  zoneId: string,
  rules: Array<SnippetRuleInput & { id?: string }>,
): Promise<SnippetRuleResponse[]> {
  const requestBody = {
    rules: rules.map((rule) => ({
      ...(rule.id && { id: rule.id }),
      expression: rule.expression,
      snippet_name: rule.snippetName,
      description: rule.description,
      enabled: rule.enabled ?? true,
    })),
  };

  const result = await extractCloudflareResult<SnippetRuleResponse[] | null>(
    `update snippet rules in zone "${zoneId}"`,
    api.put(`/zones/${zoneId}/snippets/snippet_rules`, requestBody),
  );

  return result ?? [];
}

/**
 * Delete all snippet rules in a zone
 * @internal
 */
export async function deleteSnippetRules(
  api: CloudflareApi,
  zoneId: string,
): Promise<void> {
  try {
    await api.delete(`/zones/${zoneId}/snippets/snippet_rules`);
  } catch (error) {
    logger.error(`Error deleting snippet rules in zone ${zoneId}:`, error);
    throw error;
  }
}
