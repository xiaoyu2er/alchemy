import type { Class } from "./class.ts";
import type { Resource, ResourceProps } from "./resource.ts";

export type Capability<
  Verb extends string = string,
  R extends Resource | Class<any, any> = Resource | Class<any, any>,
> = {
  Kind: "Capability";
  Verb: Verb;
  Resource: R;
};

export const Capability = <
  const Verb extends string,
  Cls extends Class<any, any>,
>(
  verb: Verb,
  resource: Cls,
) =>
  Object.assign(
    (resource: Resource, props?: ResourceProps) => ({
      resource,
      props,
    }),
    {
      Kind: "Capability",
      Verb: verb,
      Resource: resource,
    } as const,
  ) as any;
