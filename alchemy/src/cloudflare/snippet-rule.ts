import type { Context } from "../context.ts";
import { Resource } from "../resource.ts";
import { logger } from "../util/logger.ts";
import { extractCloudflareResult } from "./api-response.ts";
import {
  createCloudflareApi,
  type CloudflareApi,
  type CloudflareApiOptions,
} from "./api.ts";
import type { Snippet } from "./snippet.ts";
import { findZoneForHostname, type Zone } from "./zone.ts";

/**
 * Input format for snippet rule operations
 * Used when calling updateSnippetRules() helper
 * @internal
 * @see updateSnippetRules
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
 * Properties for creating or updating a Snippet Rule
 */
export interface SnippetRuleProps extends CloudflareApiOptions {
  /**
   * The zone this rule belongs to
   * Can be either a zone hostname string or a Zone resource
   */
  zone: string | Zone;

  /**
   * The snippet to execute when this rule matches
   * Can be a snippet name string or a Snippet resource with a name property
   */
  snippet: string | Snippet;

  /**
   * The expression defining when this rule applies
   * Uses Cloudflare's Rules language
   * @example 'http.request.uri.path eq "/api"'
   * @example 'http.request.uri.path starts_with "/admin"'
   * @example 'http.request.headers["user-agent"] contains "Mobile"'
   */
  expression: string;

  /**
   * Description of what this rule does
   */
  description?: string;

  /**
   * Whether this rule is enabled
   * @default true
   */
  enabled?: boolean;

  /**
   * Whether to adopt existing rules in the zone with the same expression and snippet
   * @default false
   */
  adopt?: boolean;
}

/**
 * Output returned after Snippet Rule creation/update
 * IMPORTANT: The type name MUST match the exported resource name
 */
export type SnippetRule = Omit<
  SnippetRuleProps,
  "zone" | "adopt" | "snippet" | "accountId" | "apiToken"
> & {
  /**
   * The ID of the resource (for Alchemy tracking)
   */
  id: string;

  /**
   * The Cloudflare-generated rule ID
   */
  ruleId: string;

  /**
   * The zone ID (extracted from zone prop)
   */
  zoneId: string;

  /**
   * The name of the snippet this rule executes
   */
  snippetName: string;

  /**
   * When the rule was last updated
   */
  lastUpdated: Date;

  /**
   * The rule version
   */
  version: string;
};

/**
 * Creates and manages Cloudflare Snippet Rules for controlling when snippets execute.
 *
 * Snippet Rules define the conditions under which a Snippet will be executed using Cloudflare's Rules language.
 * Rules are scoped to a zone and can be combined to create complex execution patterns.
 *
 * @example
 * ## Create a rule to execute a snippet on API paths
 *
 * ```ts
 * const apiRule = await SnippetRule("api-rule", {
 *   zone: "example.com",
 *   snippet: "api_processor",
 *   expression: 'http.request.uri.path starts_with "/api"',
 *   description: "Execute API processor snippet for API endpoints"
 * });
 * ```
 *
 * @example
 * ## Create a rule using a Snippet resource
 *
 * ```ts
 * const snippet = await Snippet("my-snippet", {
 *   zone: "example.com",
 *   script: "export default { async fetch(r) { return fetch(r); } }"
 * });
 *
 * const rule = await SnippetRule("my-rule", {
 *   zone: "example.com",
 *   snippet: snippet,  // Pass the Snippet resource directly
 *   expression: 'http.request.uri.path eq "/api"',
 *   enabled: true
 * });
 * ```
 *
 * @example
 * ## Create multiple rules for different request patterns
 *
 * ```ts
 * const apiRule = await SnippetRule("api-rule", {
 *   zone: "example.com",
 *   snippet: "api_handler",
 *   expression: 'http.request.uri.path starts_with "/api"'
 * });
 *
 * const adminRule = await SnippetRule("admin-rule", {
 *   zone: "example.com",
 *   snippet: "admin_handler",
 *   expression: 'http.request.uri.path starts_with "/admin"'
 * });
 * ```
 *
 * @example
 * ## Create a rule targeting specific hostnames with User-Agent matching
 *
 * ```ts
 * const mobileRule = await SnippetRule("mobile-rule", {
 *   zone: "example.com",
 *   snippet: "mobile_optimizer",
 *   expression: 'http.host eq "api.example.com" and http.request.headers["user-agent"] contains "Mobile"',
 *   description: "Optimize mobile requests to API subdomain"
 * });
 * ```
 *
 * @see https://developers.cloudflare.com/rules/snippets/
 * @see Snippet - Create snippets to execute with these rules
 */
export const SnippetRule = Resource(
  "cloudflare::SnippetRule",
  async function (
    this: Context<SnippetRule>,
    id: string,
    props: SnippetRuleProps,
  ): Promise<SnippetRule> {
    const api = await createCloudflareApi(props);
    const zoneId =
      typeof props.zone === "string"
        ? (await findZoneForHostname(api, props.zone)).zoneId
        : props.zone.id;
    const snippetName =
      typeof props.snippet === "string" ? props.snippet : props.snippet.name;
    const adopt = props.adopt ?? this.scope.adopt;

    if (this.phase === "delete") {
      const ruleId = this.output?.ruleId;
      if (!ruleId) {
        logger.warn(`No ruleId found for ${id}, skipping delete`);
        return this.destroy();
      }

      await deleteSnippetRuleById(api, zoneId, ruleId);
      return this.destroy();
    }

    let existingRulesResponse: Array<SnippetRuleInput & { id: string }> = [];
    try {
      const rules = await listSnippetRules(api, zoneId);

      existingRulesResponse = (rules ?? []).map((r) => ({
        id: r.id,
        expression: r.expression,
        snippetName: r.snippet_name,
        description: r.description,
        enabled: r.enabled,
      }));
    } catch {
      logger.warn(`No existing snippet rules found for zone ${zoneId}`);
    }

    let ruleToUpdate = this.output?.ruleId
      ? existingRulesResponse.find((r) => r.id === this.output?.ruleId)
      : null;

    if (!ruleToUpdate && !this.output?.ruleId) {
      const existingByKey = existingRulesResponse.find(
        (r) =>
          r.expression === props.expression && r.snippetName === snippetName,
      );

      if (existingByKey) {
        if (!adopt) {
          throw new Error(
            `Snippet rule matching expression "${props.expression}" and snippet "${snippetName}" already exists. Use adopt: true to adopt it.`,
          );
        }
        ruleToUpdate = existingByKey;
      }
    }

    const ruleData: SnippetRuleInput = {
      expression: props.expression,
      snippetName,
      description: props.description,
      enabled: props.enabled ?? true,
    };

    let updatedRules: SnippetRuleInput[];

    if (ruleToUpdate) {
      updatedRules = existingRulesResponse.map((rule) =>
        rule.id === ruleToUpdate!.id ? ruleData : rule,
      );
    } else {
      updatedRules = [...existingRulesResponse, ruleData];
    }

    const result = await updateSnippetRules(api, zoneId, updatedRules);
    const updatedRule = result.find(
      (r) =>
        r.expression === props.expression && r.snippet_name === snippetName,
    );

    if (!updatedRule) {
      throw new Error(
        `Failed to find updated rule after update for expression "${props.expression}"`,
      );
    }

    return {
      id,
      ruleId: updatedRule.id,
      zoneId,
      snippetName: updatedRule.snippet_name,
      expression: updatedRule.expression,
      description: updatedRule.description,
      enabled: updatedRule.enabled,
      lastUpdated: new Date(updatedRule.last_updated),
      version: updatedRule.version || "1",
    };
  },
);

/**
 * Delete a snippet rule from a zone by its ID
 * @internal
 */
async function deleteSnippetRuleById(
  api: CloudflareApi,
  zoneId: string,
  ruleId: string,
): Promise<void> {
  try {
    let existingRulesResponse: Array<SnippetRuleInput & { id: string }> = [];
    try {
      const rules = await listSnippetRules(api, zoneId);
      existingRulesResponse = (rules ?? []).map((r) => ({
        id: r.id,
        expression: r.expression,
        snippetName: r.snippet_name,
        description: r.description,
        enabled: r.enabled,
      }));
    } catch {
      logger.warn(
        `No existing snippet rules found in zone ${zoneId} during delete`,
      );
      return;
    }

    const ruleIndex = existingRulesResponse.findIndex((r) => r.id === ruleId);

    if (ruleIndex === -1) {
      logger.warn(
        `Rule ${ruleId} not found in zone ${zoneId}, skipping delete`,
      );
      return;
    }

    const updatedRules = existingRulesResponse
      .filter((_, index) => index !== ruleIndex)
      .map(({ id, ...rest }) => rest);

    if (updatedRules.length > 0) {
      await updateSnippetRules(api, zoneId, updatedRules);
    } else {
      await deleteSnippetRules(api, zoneId);
    }
  } catch (error) {
    logger.error(`Error deleting snippet rule ${ruleId}:`, error);
    throw error;
  }
}

/**
 * List all snippet rules in a zone
 * @internal
 */
export async function listSnippetRules(
  api: CloudflareApi,
  zoneId: string,
): Promise<SnippetRuleResponse[]> {
  return await extractCloudflareResult<SnippetRuleResponse[]>(
    `list snippet rules in zone "${zoneId}"`,
    api.get(`/zones/${zoneId}/snippets/snippet_rules`),
  );
}

/**
 * Update snippet rules in a zone (replaces all rules)
 * @internal
 */
export async function updateSnippetRules(
  api: CloudflareApi,
  zoneId: string,
  rules: SnippetRuleInput[],
): Promise<SnippetRuleResponse[]> {
  const requestBody = {
    rules: rules.map((rule) => ({
      expression: rule.expression,
      snippet_name: rule.snippetName,
      description: rule.description,
      enabled: rule.enabled ?? true,
    })),
  };

  return await extractCloudflareResult<SnippetRuleResponse[]>(
    `update snippet rules in zone "${zoneId}"`,
    api.put(`/zones/${zoneId}/snippets/snippet_rules`, requestBody),
  );
}

/**
 * Delete all snippet rules in a zone
 * @internal
 */
export async function deleteSnippetRules(
  api: CloudflareApi,
  zoneId: string,
): Promise<void> {
  const response = await api.delete(`/zones/${zoneId}/snippets/snippet_rules`);

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete snippet rules: ${response.statusText}`);
  }
}
