import type { Context } from "../context.ts";
import { Resource } from "../resource.ts";
import { createResend, type ResendProps } from "./api.ts";

export interface AudienceProps extends ResendProps {
  /**
   * The name of the audience.
   * @default ${app}-${stage}-${id}
   */
  name?: string;
}

export type Audience = {
  /**
   * The ID of the audience.
   */
  id: string;
  /**
   * The name of the audience.
   */
  name: string;
  /**
   * The date and time the audience was created.
   */
  createdAt: Date;
};

export async function Audience(
  id: string,
  props: AudienceProps = {},
): Promise<Audience> {
  return await _Audience(id, props);
}

export namespace Audience {
  export interface GetProps extends ResendProps {
    id: string;
  }

  export const get = async (props: GetProps): Promise<Audience> => {
    const resend = createResend(props);
    const { data } = await resend.getAudiencesById({
      path: {
        id: props.id,
      },
    });
    return {
      id: data.id!,
      name: data.name!,
      createdAt: new Date(data.created_at!),
    };
  };
}

const _Audience = Resource(
  "resend::Audience",
  async function (
    this: Context<Audience>,
    id: string,
    props: AudienceProps,
  ): Promise<Audience> {
    const name =
      props.name ?? this.output?.name ?? this.scope.createPhysicalName(id);
    const resend = createResend(props);

    switch (this.phase) {
      case "create": {
        const { data } = await resend.postAudiences({
          body: {
            name,
          },
        });
        return {
          id: data.id!,
          name: data.name!,
          createdAt: new Date(),
        };
      }
      case "update": {
        return this.replace();
      }
      case "delete": {
        if (this.output.id) {
          const { error } = await resend.deleteAudiencesById({
            path: {
              id: this.output.id,
            },
            throwOnError: false,
          });
          if (error && error.status !== 404) {
            throw new Error(`Failed to delete audience "${id}"`, {
              cause: error,
            });
          }
        }
        return this.destroy();
      }
    }
  },
);
