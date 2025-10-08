import type { Context } from "../context.ts";
import { Resource } from "../resource.ts";
import { createResend, ResendError, type ResendProps } from "./api.ts";
import type { DomainRecord } from "./api/types.gen.ts";

export interface DomainProps extends ResendProps {
  /**
   * The name of the domain.
   */
  name: string;
  /**
   * The region where the domain is hosted.
   * @default "us-east-1"
   */
  region?: Domain.Region;
  /**
   * To track clicks, Resend modifies each link in the body of the HTML email.
   * When recipients open a link, they are sent to a Resend server, and are immediately redirected to the URL destination.
   * @default false
   */
  openTracking?: boolean;
  /**
   * Not recommended. A 1x1 pixel transparent GIF image is inserted in each email and includes a unique reference.
   * Open tracking can produce inaccurate results and decrease deliverability. Learn more and consider if [open tracking is right for you](https://resend.com/docs/knowledge-base/why-are-my-open-rates-not-accurate).
   * @default false
   */
  clickTracking?: boolean;
  /**
   * The TLS mode for the domain.
   * Opportunistic TLS means that it always attempts to make a secure connection to the receiving mail server. If it can’t establish a secure connection, it sends the message unencrypted.
   * Enforced TLS on the other hand, requires that the email communication must use TLS no matter what. If the receiving server does not support TLS, the email will not be sent.
   * @default "opportunistic"
   */
  tls?: "enforced" | "opportunistic";
  /**
   * Adopt the domain if it already exists.
   * @default false
   */
  adopt?: boolean;
}

export type Domain = {
  /**
   * The ID of the domain.
   */
  id: string;
  /**
   * The name of the domain.
   */
  name: string;
  /**
   * The status of the domain.
   */
  status: Domain.Status;
  /**
   * DNS records for the domain.
   */
  records: Array<DomainRecord>;
  /**
   * The region where the domain is hosted.
   */
  region: Domain.Region;
  /**
   * Track the open rate of each email.
   */
  openTracking: boolean | undefined;
  /**
   * Track the click rate of each email.
   */
  clickTracking: boolean | undefined;
  /**
   * The TLS mode for the domain.
   */
  tls: "enforced" | "opportunistic" | undefined;
  /**
   * The date and time the domain was created.
   */
  createdAt: Date;
  /**
   * The date and time the domain was updated.
   */
  updatedAt: Date;
};

export declare namespace Domain {
  export type Status =
    | "not_started"
    | "pending"
    | "verified"
    | "failed"
    | "temporary_failure";

  export type Region = "us-east-1" | "eu-west-1" | "sa-east-1";
}

export const Domain = Resource(
  "resend::Domain",
  async function (
    this: Context<Domain>,
    id: string,
    props: DomainProps,
  ): Promise<Domain> {
    const resend = createResend(props);

    switch (this.phase) {
      case "create": {
        const { data } = await resend
          .postDomains({
            body: {
              name: props.name,
              region: props.region,
            },
          })
          .catch(async (error) => {
            if (
              error instanceof ResendError &&
              error.code === "validation_error" &&
              error.message.includes("registered already") &&
              (props.adopt ?? this.scope.adopt)
            ) {
              const response = await resend.getDomains();
              const domain = response.data.data?.find(
                (domain) => domain.name === props.name,
              );
              if (domain) {
                return await resend.getDomainsByDomainId({
                  path: {
                    domain_id: domain.id!,
                  },
                });
              }
            }
            throw error;
          });

        // TODO(john): this does not work
        if (
          props.tls ||
          props.openTracking !== undefined ||
          props.clickTracking !== undefined
        ) {
          await resend.patchDomainsByDomainId({
            path: {
              domain_id: data.id!,
            },
            body: {
              open_tracking: props.openTracking,
              click_tracking: props.clickTracking,
              tls: props.tls,
            },
          });
        }

        return {
          id: data.id!,
          name: data.name!,
          status: data.status as Domain.Status,
          records: data.records!,
          region: data.region as Domain.Region,
          openTracking: props.openTracking,
          clickTracking: props.clickTracking,
          tls: props.tls,
          createdAt: new Date(data.created_at!),
          updatedAt: new Date(data.created_at!),
        };
      }
      case "update": {
        if (this.output.name !== props.name) {
          this.replace();
        }
        if (this.output.region !== props.region) {
          this.replace(true);
        }

        // TODO(john): this does not work
        if (
          this.output.openTracking !== props.openTracking ||
          this.output.clickTracking !== props.clickTracking ||
          this.output.tls !== props.tls
        ) {
          await resend.patchDomainsByDomainId({
            path: {
              domain_id: this.output.id,
            },
            body: {
              open_tracking: props.openTracking,
              click_tracking: props.clickTracking,
              tls: props.tls,
            },
          });
        }

        return {
          ...this.output,
          openTracking: props.openTracking,
          clickTracking: props.clickTracking,
          tls: props.tls,
          updatedAt: new Date(),
        };
      }
      case "delete": {
        if (this.output.id) {
          const { error } = await resend.deleteDomainsByDomainId({
            path: {
              domain_id: this.output.id,
            },
            throwOnError: false,
          });
          if (error && error.status !== 404) {
            throw new Error(`Failed to delete domain "${id}"`, {
              cause: error,
            });
          }
        }
        return this.destroy();
      }
    }
  },
);
