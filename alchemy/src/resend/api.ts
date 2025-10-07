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

  constructor(payload: ResendErrorPayload) {
    super(payload.message);
    this.name = "ResendError";
    this.code = payload.name;
    this.status = payload.statusCode;
  }
}

const client = createClient({
  baseUrl: "https://api.resend.com",
  auth: "123",
  throwOnError: true,
});
client.interceptors.error.use((error) => {
  return new ResendError(error as ResendErrorPayload);
});

export const resend = new ResendClient({
  client,
});

const { request, response, ...data } = await resend.getApiKeys({
  throwOnError: false,
});

console.log(data);
