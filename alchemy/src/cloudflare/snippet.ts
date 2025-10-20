import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Context } from "../context.ts";
import { Resource, ResourceKind } from "../resource.ts";
import { handleApiError } from "./api-error.ts";
import { extractCloudflareResult } from "./api-response.ts";
import {
  createCloudflareApi,
  type CloudflareApi,
  type CloudflareApiOptions,
} from "./api.ts";
import { findZoneForHostname, type Zone } from "./zone.ts";

/**
 * Properties for creating or updating a Snippet
 */
export interface SnippetProps extends CloudflareApiOptions {
  /**
   * The zone this snippet belongs to
   * Can be a zone ID (32-char hex), zone name/hostname (e.g. "example.com"), or a Zone resource
   */
  zone: string | Zone;

  /**
   * The identifying name of the snippet
   * Only lowercase letters (a-z), numbers (0-9), and underscores (_) are allowed
   *
   * @default ${app}-${stage}-${id} (with dashes converted to underscores)
   */
  name?: string;

  /**
   * The JavaScript code content of the snippet (inline)
   * Either script or entrypoint must be provided
   */
  script?: undefined | string;

  /**
   * Path to the JavaScript file containing the snippet code
   * Either script or entrypoint must be provided
   */
  entrypoint?: string;

  /**
   * Whether to adopt an existing snippet
   * @default false
   */
  adopt?: boolean;
}

/**
 * Output returned after Snippet creation/update.
 * IMPORTANT: The type name MUST match the exported resource name.
 */
export type Snippet = Omit<
  SnippetProps,
  "zone" | "script" | "entrypoint" | "adopt" | "accountId" | "apiToken"
> & {
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
   * Zone ID for the domain.
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
 * Type guard for Snippet resource
 */
export function isSnippet(resource: any): resource is Snippet {
  return resource?.[ResourceKind] === "cloudflare::Snippet";
}

/**
 * Creates and manages Cloudflare Snippets for executing custom JavaScript at the edge.
 *
 * Snippets allow you to run custom JavaScript code on Cloudflare's edge network,
 * enabling modifications to requests and responses for your zone.
 *
 * After creating Snippets, use the SnippetRule resource to define when each snippet should execute.
 * A Snippet without any associated rules will not be executed.
 *
 * @example
 * // Create a basic snippet with inline script that adds a custom header:
 * const headerSnippet = await Snippet("custom-header", {
 *   zone: myZone,
 *   script: `
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
 * // Create a snippet from a file entrypoint:
 * const fileSnippet = await Snippet("my-snippet", {
 *   zone: "example.com",
 *   entrypoint: "./src/snippets/header-modifier.js"
 * });
 *
 * @example
 * // Create a snippet that modifies request URLs with auto-generated name:
 * const urlRewriteSnippet = await Snippet("url-rewrite", {
 *   zone: "example.com",
 *   script: `
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
 * // Create a snippet for A/B testing with explicit name:
 * const abTestSnippet = await Snippet("ab-test", {
 *   zone: myZone,
 *   name: "ab_testing",
 *   script: `
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
 * @example
 * // Create a snippet with associated execution rules:
 * import { SnippetRule } from "./snippet-rule.ts";
 *
 * const apiSnippet = await Snippet("api-processor", {
 *   zone: myZone,
 *   script: `
 *     export default {
 *       async fetch(request) {
 *         return fetch(request);
 *       }
 *     }
 *   `
 * });
 *
 * // Create a rule to execute this snippet only on /api paths
 * const apiRule = await SnippetRule("api-rule", {
 *   zone: myZone,
 *   snippet: apiSnippet,
 *   expression: 'http.request.uri.path starts_with "/api"',
 *   enabled: true
 * });
 *
 * @see https://developers.cloudflare.com/rules/snippets/
 * @see SnippetRule - Use this resource to define when snippets should execute
 */
export const Snippet = Resource(
  "cloudflare::Snippet",
  async function (
    this: Context<Snippet>,
    id: string,
    props: SnippetProps,
  ): Promise<Snippet> {
    const name =
      props.name ?? this.output?.name ?? this.scope.createPhysicalName(id, "_");

    //* Early validation to prevent HTTP errors
    validateSnippetName(name);

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
    const snippetId = this.output?.snippetId || name;
    const adopt = props.adopt ?? this.scope.adopt;

    if (this.phase === "delete") {
      await deleteSnippet(api, zoneId, snippetId);
      return this.destroy();
    }

    const content = await getScriptContent(props);
    const exists = await snippetExists(api, zoneId, name);

    if (this.phase === "create" && exists && !adopt) {
      throw new Error(
        `Snippet "${name}" already exists. Use adopt: true to adopt it.`,
      );
    }

    await createOrUpdateSnippet(api, zoneId, name, content);

    const result = await getSnippet(api, zoneId, name);

    return {
      id,
      name,
      snippetId: name,
      zoneId,
      createdOn: new Date(result.created_on),
      modifiedOn: new Date(result.modified_on),
      type: "snippet",
    };
  },
);

/**
 * Get script content from either inline script or file entrypoint
 * @internal
 */
async function getScriptContent(props: SnippetProps): Promise<string> {
  if ("script" in props && props.script) {
    return props.script;
  }
  if ("entrypoint" in props && props.entrypoint) {
    const filePath = resolve(props.entrypoint);
    return await readFile(filePath, "utf-8");
  }
  throw new Error("Either 'script' or 'entrypoint' must be provided");
}

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
    if (deleteResponse.status === 400) {
      const errorBody = await deleteResponse.text();
      if (errorBody.includes("requested snippet not found")) {
        return;
      }
    }
    await handleApiError(deleteResponse, "delete", "snippet", snippetName);
  }
}

/**
 * Validates that a snippet name meets Cloudflare requirements due to strong restrictions on the name.
 * Cloudflare Snippets only allow lowercase letters (a-z), numbers (0-9), and underscores (_)
 *
 * @throws Error if the name does not meet Cloudflare snippet requirements
 * @internal
 */
export function validateSnippetName(name: string): boolean {
  if (!name || name.trim().length === 0) {
    throw new Error("Snippet name cannot be empty");
  }

  if (name.length > 255) {
    throw new Error("Snippet name cannot exceed 255 characters");
  }

  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error(
      "Snippet name must contain only lowercase letters (a-z), numbers (0-9), and underscores (_). Invalid characters found.",
    );
  }

  return true;
}
