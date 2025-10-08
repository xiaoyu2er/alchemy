import type { Context } from "../context.ts";
import { Resource } from "../resource.ts";
import { Secret } from "../secret.ts";
import { createResend, type ResendProps } from "./api.ts";
import type { Domain } from "./domain.ts";

export interface ApiKeyProps extends ResendProps {
  /**
   * The name of the API key.
   * @default ${app}-${stage}-${id}
   */
  name?: string;
  /**
   * The API key can have full access to Resend’s API or be only restricted to send emails.
   * - full_access - Can create, delete, get, and update any resource.
   * - sending_access - Can only send emails.
   */
  permission?: ApiKey.Permission;
  /**
   * Restrict an API key to send emails only from a specific domain. Only used when the permission is sending_access.
   */
  domain?: string | Domain;
}

export type ApiKey = {
  /**
   * The ID of the API key.
   */
  id: string;
  /**
   * The name of the API key.
   */
  name: string;
  /**
   * The permission of the API key.
   */
  permission: ApiKey.Permission;
  /**
   * The token of the API key.
   */
  token: Secret;
  /**
   * The date and time the API key was created.
   */
  createdAt: Date;
};

export declare namespace ApiKey {
  export type Permission = "full_access" | "sending_access";
}

export const ApiKey = Resource(
  "resend::ApiKey",
  async function (
    this: Context<ApiKey>,
    id: string,
    props: ApiKeyProps = {},
  ): Promise<ApiKey> {
    const name =
      props.name ?? this.output?.name ?? this.scope.createPhysicalName(id);
    const domainId =
      typeof props.domain === "string" ? props.domain : props.domain?.id!;
    const resend = createResend(props);

    switch (this.phase) {
      case "create": {
        const permission = props.permission ?? "full_access";
        const { data } = await resend.postApiKeys({
          body: {
            name,
            permission,
            domain_id: domainId,
          },
        });
        return {
          id: data.id!,
          name,
          permission,
          token: new Secret(data.token!),
          createdAt: new Date(),
        };
      }
      case "update": {
        return this.replace();
      }
      case "delete": {
        if (this.output.id) {
          const { error } = await resend.deleteApiKeysByApiKeyId({
            path: {
              api_key_id: this.output.id,
            },
            throwOnError: false,
          });
          if (error && error.status !== 404) {
            throw new Error(`Failed to delete API key "${id}"`, {
              cause: error,
            });
          }
        }
        return this.destroy();
      }
    }
  },
);
