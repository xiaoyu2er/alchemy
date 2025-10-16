import type { Context } from "../context.ts";
import { Resource } from "../resource.ts";
import { handleApiError } from "./api-error.ts";
import { extractCloudflareResult } from "./api-response.ts";
import {
  createCloudflareApi,
  type CloudflareApi,
  type CloudflareApiOptions,
} from "./api.ts";
import type { Zone } from "./zone.ts";

/**
 * Properties for creating or updating a Snippet
 */
export interface SnippetProps extends CloudflareApiOptions {
  /**
   * The zone to create the snippet in
   */
  zone: string | Zone;

  /**
   * The identifying name of the snippet
   * Must be unique within the zone
   * Only lowercase letters (a-z), numbers (0-9), and underscores (_) are allowed
   */
  name: string;

  /**
   * The JavaScript code content of the snippet
   */
  content: string;

  /**
   * Whether to delete the snippet
   * If set to false, the snippet will remain but the resource will be removed from state
   * @default true
   */
  delete?: boolean;

  /**
   * Whether to adopt an existing snippet
   * @default false
   */
  adopt?: boolean;

  /**
   * The Cloudflare-generated zone ID (only used for update/delete operations)
   * @internal
   */
  zoneId?: string;

  /**
   * The snippet name (only used for update/delete operations)
   * @internal
   */
  snippetId?: string;
}

/**
 * Snippet rule for controlling when a snippet executes
 */
export interface SnippetRule {
  /**
   * The expression that defines when this rule applies
   * Uses Cloudflare's Rules language
   */
  expression: string;

  /**
   * The name of the snippet to execute when this rule matches
   */
  snippetName: string;

  /**
   * Description of what this rule does
   */
  description?: string;

  /**
   * Whether this rule is enabled
   * @default true
   */
  enabled?: boolean;
}

/**
 * Output returned after Snippet creation/update.
 * IMPORTANT: The type name MUST match the exported resource name.
 */
export type Snippet = Omit<SnippetProps, "zone" | "content" | "adopt"> & {
  /**
   * The ID of the resource
   */
  id: string;

  /**
   * The identifying name of the snippet
   */
  name: string;

  /**
   * The snippet name (used for update/delete operations)
   * @internal
   */
  snippetId: string;

  /**
   * The zone ID this snippet belongs to
   */
  zoneId: string;

  /**
   * When the snippet was created
   */
  createdOn: Date;

  /**
   * When the snippet was last modified
   */
  modifiedOn: Date;

  /**
   * Resource type identifier
   * @internal
   */
  type: "snippet";
};

/**
 * Creates and manages Cloudflare Snippets for executing custom JavaScript at the edge.
 *
 * Snippets allow you to run custom JavaScript code on Cloudflare's edge network,
 * enabling modifications to requests and responses for your zone.
 *
 * @example
 * // Create a basic snippet that adds a custom header
 * const headerSnippet = await Snippet("custom-header", {
 *   zone: myZone,
 *   name: "add-custom-header",
 *   content: `
 *     export default {
 *       async fetch(request) {
 *         const response = await fetch(request);
 *         response.headers.set('X-Custom-Header', 'Hello from Snippet');
 *         return response;
 *       }
 *     }
 *   `
 * });
 *
 * @example
 * // Create a snippet that modifies request URLs
 * const urlRewriteSnippet = await Snippet("url-rewrite", {
 *   zone: "example.com",
 *   name: "rewrite-api-urls",
 *   content: `
 *     export default {
 *       async fetch(request) {
 *         const url = new URL(request.url);
 *         if (url.pathname.startsWith('/api/v1/')) {
 *           url.pathname = url.pathname.replace('/api/v1/', '/api/v2/');
 *         }
 *         return fetch(new Request(url, request));
 *       }
 *     }
 *   `
 * });
 *
 * @example
 * // Create a snippet for A/B testing
 * const abTestSnippet = await Snippet("ab-test", {
 *   zone: myZone,
 *   name: "ab-testing",
 *   content: `
 *     export default {
 *       async fetch(request) {
 *         const variant = Math.random() < 0.5 ? 'A' : 'B';
 *         const response = await fetch(request);
 *         response.headers.set('X-AB-Variant', variant);
 *         return response;
 *       }
 *     }
 *   `
 * });
 *
 * @see https://developers.cloudflare.com/rules/snippets/
 */
export const Snippet = Resource(
  "cloudflare::Snippet",
  async function (
    this: Context<Snippet>,
    id: string,
    props: SnippetProps,
  ): Promise<Snippet> {
    const api = await createCloudflareApi(props);
    const zoneId =
      props.zoneId ||
      this.output?.zoneId ||
      (typeof props.zone === "string" ? props.zone : props.zone.id);
    const snippetId = props.snippetId || this.output?.snippetId || props.name;
    const adopt = props.adopt ?? this.scope.adopt;

    if (this.phase === "delete") {
      if (props.delete !== false && snippetId) {
        await deleteSnippet(api, zoneId, snippetId);
      }
      return this.destroy();
    }

    const exists = await snippetExists(api, zoneId, props.name);

    if (this.phase === "create" && exists && !adopt) {
      throw new Error(
        `Snippet "${props.name}" already exists. Use adopt: true to adopt it.`,
      );
    }

    await createOrUpdateSnippet(api, zoneId, props.name, props.content);

    const result = await getSnippet(api, zoneId, props.name);

    return {
      id,
      name: props.name,
      snippetId: props.name,
      zoneId,
      createdOn: new Date(result.created_on),
      modifiedOn: new Date(result.modified_on),
      delete: props.delete,
      accountId: props.accountId,
      apiToken: props.apiToken,
      type: "snippet",
    };
  },
);

/**
 * Cloudflare API response format for a snippet
 * @internal
 */
interface SnippetResponse {
  created_on: string;
  snippet_name: string;
  modified_on: string;
}

/**
 * Create or update a snippet
 * @internal
 */
export async function createOrUpdateSnippet(
  api: CloudflareApi,
  zoneId: string,
  snippetName: string,
  content: string,
): Promise<void> {
  const body = new FormData();
  body.append(
    "files",
    new Blob([content], { type: "application/javascript" }),
    "snippet.js",
  );
  body.append(
    "metadata",
    new Blob([JSON.stringify({ main_module: "snippet.js" })], {
      type: "application/json",
    }),
  );

  const snippetResponse = await api.put(
    `/zones/${zoneId}/snippets/${snippetName}`,
    body,
  );

  if (!snippetResponse.ok) {
    await handleApiError(
      snippetResponse,
      "create or update",
      "snippet",
      snippetName,
    );
  }
}

/**
 * Check if a snippet exists
 * @internal
 */
export async function snippetExists(
  api: CloudflareApi,
  zoneId: string,
  snippetName: string,
): Promise<boolean> {
  const getResponse = await api.get(`/zones/${zoneId}/snippets/${snippetName}`);
  return getResponse.ok;
}

/**
 * Get a snippet by name
 * @internal
 */
export async function getSnippet(
  api: CloudflareApi,
  zoneId: string,
  snippetName: string,
): Promise<SnippetResponse> {
  return await extractCloudflareResult<SnippetResponse>(
    `get snippet "${snippetName}"`,
    api.get(`/zones/${zoneId}/snippets/${snippetName}`),
  );
}

/**
 * Get the content of a snippet
 * @internal
 */
export async function getSnippetContent(
  api: CloudflareApi,
  zoneId: string,
  snippetName: string,
): Promise<string> {
  const response = await api.get(
    `/zones/${zoneId}/snippets/${snippetName}/content`,
  );

  if (!response.ok) {
    throw await handleApiError(response, "get", "snippet content", snippetName);
  }

  return await response.text();
}

/**
 * List all snippets in a zone
 * @internal
 */
export async function listSnippets(
  api: CloudflareApi,
  zoneId: string,
): Promise<SnippetResponse[]> {
  return await extractCloudflareResult<SnippetResponse[]>(
    `list snippets in zone "${zoneId}"`,
    api.get(`/zones/${zoneId}/snippets`),
  );
}

/**
 * Delete a snippet from Cloudflare
 * @internal
 */
export async function deleteSnippet(
  api: CloudflareApi,
  zoneId: string,
  snippetName: string,
): Promise<void> {
  const deleteResponse = await api.delete(
    `/zones/${zoneId}/snippets/${snippetName}`,
  );

  if (!deleteResponse.ok && deleteResponse.status !== 404) {
    await handleApiError(deleteResponse, "delete", "snippet", snippetName);
  }
}

/**
 * Snippet rule response from Cloudflare API
 * @internal
 */
interface SnippetRuleResponse {
  id: string;
  expression: string;
  snippet_name: string;
  description?: string;
  enabled: boolean;
  last_updated: string;
  version: string;
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
 * Update snippet rules in a zone
 * @internal
 */
export async function updateSnippetRules(
  api: CloudflareApi,
  zoneId: string,
  rules: SnippetRule[],
): Promise<SnippetRuleResponse[]> {
  const requestBody = rules.map((rule) => ({
    expression: rule.expression,
    snippet_name: rule.snippetName,
    description: rule.description,
    enabled: rule.enabled ?? true,
  }));

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
    await handleApiError(response, "delete", "snippet rules", zoneId);
  }
}
