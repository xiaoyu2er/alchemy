import type { Resource, ResourceProps } from "./resource.ts";

export type Capability<
  Verb extends string = string,
  Resource = any,
  Ctor extends (...args: any[]) => any = (...args: any[]) => any,
> = {
  Kind: "Capability";
  Verb: Verb;
  Resource: Resource;
  Ctor: Ctor;
} & Ctor;

export const Capability = <const Verb extends string, Cls>(
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
      Ctor: undefined!,
    } as const,
  ) as any;
