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
  Action extends string = string,
  Res = any,
  Class extends HKT.TypeLambda = HKT.TypeLambda,
> = {
  /**
   * ID uniquely identifying this statement
   *
   * @default ${action}:${resource.id}
   */
  Sid?: string;
  Label: string;
  Kind: "Capability";
  Action: Action;
  Resource: Res; //Extract<Res, Resource | ResourceClass>;
  Class: Class;
};

export const Capability =
  <const Action extends string, Res = any>(Action: Action, Res: Res) =>
  <Self extends CapabilityClass<Action, any>>() => {
    const res = Res as Resource | ResourceClass;
    const label =
      res.Kind === "ResourceClass"
        ? `${Action}(${res.Type})`
        : `${Action}(${res.ID})`;
    return Object.assign(
      (resource: Resource | ResourceClass, props?: ResourceProps) => ({
        resource,
        props,
      }),
      {
        Kind: "Capability",
        Action: Action,
        Resource: Res,
        Ctor: undefined!,
        Label: label,
        Sid: label, // TODO(sam): should this be different
      } as const,
    ) as any as Self;
  };
