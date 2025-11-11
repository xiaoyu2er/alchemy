import type { CloudflareApiErrorPayload } from "./api-response";

/**
 * Custom error class for Cloudflare API errors
 * Includes HTTP status information from the Response
 */
export class CloudflareApiError extends Error {
  /**
   * HTTP status code
   */
  status: number;

  /**
   * HTTP status text
   */
  statusText: string;

  /**
   * Raw error data from the API
   */
  errorData?: any;

  /**
   * Create a new CloudflareApiError
   */
  constructor(message: string, response: Response, errorData?: any) {
    super(message);
    this.name = "CloudflareApiError";
    this.status = response.status;
    this.statusText = response.statusText;
    this.errorData = errorData;

    // Ensure instanceof works correctly
    Object.setPrototypeOf(this, CloudflareApiError.prototype);
  }
}

/**
 * Helper function to handle API errors
 *
 * @param response The fetch Response object
 * @param action The action being performed (e.g., "creating", "deleting")
 * @param resourceType The type of resource being acted upon (e.g., "R2 bucket", "Worker")
 * @param resourceName The name/identifier of the specific resource
 * @returns Never returns - always throws an error
 */
/**
 * Helper function to detect OAuth token authentication limitations
 * Does not consume the response - uses the provided parsed JSON data
 *
 * @param json The parsed JSON response data
 * @param action The action being performed (e.g., "creating", "deleting")
 * @param resourceType The type of resource being acted upon (e.g., "email routing")
 * @returns true if it's an OAuth error, false otherwise
 */
function isOAuthError(
  json: any,
  _action: string,
  _resourceType: string,
): boolean {
  const errors: { message: string; code?: number }[] = json?.errors || [];
  return errors.some(
    (error) =>
      error.message?.includes("oauth_token authentication scheme") ||
      error.message?.includes("POST method not allowed") ||
      error.code === 10000,
  );
}

export async function handleApiError(
  response: Response,
  action: string,
  resourceType: string,
  resourceName?: string,
): Promise<never> {
  // Read response body once and parse it
  const text = await response.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { errors: [{ message: text }] };
  }

  // Check for OAuth-specific errors first
  if (isOAuthError(json, action, resourceType)) {
    throw new Error(
      `${resourceType} ${action} requires API token authentication. ` +
        `OAuth tokens from 'wrangler login' don't support this operation. ` +
        "Please set CLOUDFLARE_API_TOKEN environment variable or pass apiToken option. " +
        "You can create an API token at https://dash.cloudflare.com/profile/api-tokens",
    );
  }

  // Handle general API errors
  const errors: { message: string; code: number }[] = json?.errors || [
    { message: response.statusText },
  ];
  const errorMessage = `Error ${response.status} ${action} ${resourceType}${
    resourceName ? ` '${resourceName}'` : ""
  }: ${errors.map((error) => `${error.code}: ${error.message}`).join(", ")}`;
  // End of Selection
  throw new CloudflareApiError(errorMessage, response, errors);
}

/**
 * Helper function to check if an error is a Cloudflare API error.
 * Optional match criteria can be provided to check for a specific HTTP status code or error code.
 */
export function isCloudflareApiError(
  error: unknown,
  match: { status?: number; code?: number } = {},
): error is CloudflareApiError & { errorData: CloudflareApiErrorPayload[] } {
  return (
    error instanceof CloudflareApiError &&
    (match.status === undefined || error.status === match.status) &&
    (match.code === undefined ||
      (Array.isArray(error.errorData) &&
        error.errorData.some((e) => "code" in e && e.code === match.code)))
  );
}
