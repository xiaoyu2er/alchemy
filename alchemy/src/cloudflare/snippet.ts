import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Context } from "../context.ts";
import { Resource } from "../resource.ts";
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
   * The zone to create the snippet in
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
  "zone" | "script" | "entrypoint" | "adopt"
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
    const zoneId =
      this.output?.zoneId ||
      (typeof props.zone === "string"
        ? (await findZoneForHostname(api, props.zone)).zoneId
        : props.zone.id);
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
      accountId: props.accountId,
      apiToken: props.apiToken,
      type: "snippet",
    };
  },
);

/**
 * Resolve and return the snippet's JavaScript source from inline `script` or a filesystem `entrypoint`.
 *
 * @param props - Snippet properties containing either an inline `script` or an `entrypoint` path
 * @returns The snippet source code as a UTF-8 string
 * @throws Error if neither `script` nor `entrypoint` is provided
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
 * Uploads a JavaScript snippet to a Cloudflare zone, creating or replacing the named snippet.
 *
 * @internal
 * @param zoneId - The Cloudflare zone identifier where the snippet will be stored
 * @param snippetName - The unique name of the snippet within the zone
 * @param content - The JavaScript source to upload as the snippet
 * @throws If the Cloudflare API returns an error while creating or updating the snippet
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
 * Determine whether a Cloudflare snippet with the given name exists in the specified zone.
 *
 * @internal
 * @returns `true` if the snippet exists, `false` otherwise.
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
 * Retrieve metadata for a Cloudflare snippet by name.
 *
 * @internal
 * @param api - Cloudflare API client used to perform the request
 * @param zoneId - Identifier of the Cloudflare zone containing the snippet
 * @param snippetName - The name of the snippet to retrieve
 * @returns The snippet metadata (`SnippetResponse`)
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
 * Retrieve the raw content of a Cloudflare snippet.
 *
 * @internal
 * @returns The snippet's raw JavaScript content as a string.
 * @throws When the Cloudflare API responds with an error for the snippet content request.
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
 * List all snippets for the given zone.
 *
 * @internal
 * @returns An array of snippet metadata objects for the zone.
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
 * Remove a named snippet from a Cloudflare zone.
 *
 * Deletes the snippet identified by `snippetName` in the given `zoneId`. Treats a 404 response
 * and the Cloudflare 400 message "requested snippet not found" as successful deletions; other
 * non-OK responses are propagated via API error handling.
 *
 * @internal
 * @param zoneId - The Cloudflare zone identifier containing the snippet
 * @param snippetName - The name of the snippet to delete
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
 * Ensures a snippet name conforms to Cloudflare's naming rules.
 *
 * @returns `true` if the name is valid.
 * @throws Error if the name is empty, longer than 255 characters, or contains characters other than lowercase letters (a-z), numbers (0-9), or underscores (_).
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