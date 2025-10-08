import type { Secret } from "../secret.ts";
import { createClient } from "../util/api/client/client.gen.ts";
import { ResendClient } from "./api/sdk.gen.ts";

interface ResendErrorPayload {
  statusCode: number;
  message: string;
  name: string;
}

export class ResendError extends Error {
  readonly code: string;
  readonly status: number;
  readonly url: string;
  readonly method: string;

  constructor(payload: ResendErrorPayload, request: Request) {
    super(payload.message);
    this.name = "ResendError";
    this.code = payload.name;
    this.status = payload.statusCode;
    this.url = request.url;
    this.method = request.method;
  }
}

export interface ResendProps {
  /**
   * The API key for the Resend API.
   * @default process.env.RESEND_API_KEY
   */
  apiKey?: Secret;
}

export const createResend = (props: ResendProps = {}) => {
  const apiKey = props.apiKey?.unencrypted ?? process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Resend API key is required. Set RESEND_API_KEY environment variable or provide apiKey option.",
    );
  }
  const client = createClient({
    baseUrl: "https://api.resend.com",
    throwOnError: true,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    fetch: (async (input, init) => {
      const request = new Request(input, init);
      let attempt = 0;
      while (true) {
        attempt++;
        const clone = request.clone();
        const response = await fetch(clone as Request);
        const retryAfter = Number(response.headers.get("retry-after"));
        if (
          response.status === 429 &&
          !Number.isNaN(retryAfter) &&
          attempt < 5
        ) {
          const delay = retryAfter * 1000;
          const jitter = Math.random() * 0.1 * delay;
          await new Promise((resolve) => setTimeout(resolve, delay + jitter));
          continue;
        }
        return response;
      }
    }) as typeof fetch,
  });
  client.interceptors.error.use((error, _response, request) => {
    return new ResendError(error as ResendErrorPayload, request);
  });
  return new ResendClient({
    client,
  });
};
