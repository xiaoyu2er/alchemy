import type * as HKT from "effect/HKT";
import type { Resource, ResourceClass, ResourceProps } from "./resource.ts";

export interface CapabilityClass<Verb extends string = string, Res = any>
  extends HKT.TypeLambda {
  Verb: Verb;
  Resource: Res;
  new (_: never): CapabilityClass<Verb, Res>;
  <T>(T: T): HKT.Kind<this, never, never, never, T>;
}

export type Capability<
  Verb extends string = string,
  Res = any,
  Class extends HKT.TypeLambda = HKT.TypeLambda,
> = {
  /**
   * ID uniquely identifying this statement
   *
   * @default ${effect}:${action}:${resource.id}
   */
  Sid?: string;
  Label: string;
  Kind: "Capability";
  Verb: Verb;
  Resource: Res; //Extract<Res, Resource | ResourceClass>;
  Class: Class;
};

export const Capability =
  <const Verb extends string, Res = any>(verb: Verb, resource: Res) =>
  <Self extends CapabilityClass<Verb, any>>() => {
    const res = resource as Resource | ResourceClass;
    const label =
      res.Kind === "ResourceClass"
        ? `${verb}(${res.Type})`
        : `${verb}(${res.ID})`;
    return Object.assign(
      (resource: Resource | ResourceClass, props?: ResourceProps) => ({
        resource,
        props,
      }),
      {
        Kind: "Capability",
        Verb: verb,
        Resource: resource,
        Ctor: undefined!,
        Label: label,
        Sid: label, // TODO(sam): should this be different
      } as const,
    ) as any as Self;
  };
