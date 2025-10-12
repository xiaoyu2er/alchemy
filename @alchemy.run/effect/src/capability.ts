import type * as HKT from "effect/HKT";
import util from "node:util";
import type { Resource, ResourceClass, ResourceProps } from "./resource.ts";

export interface CapabilityType<Action extends string = string, Resource = any>
  extends HKT.TypeLambda {
  Action: Action;
  Resource: Resource;
  new (_: never): CapabilityType<Action, Resource>;
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
  <Self extends CapabilityType<Action, any>>() => {
    const res = Res as Resource | ResourceClass;
    const label =
      res.Kind === "ResourceClass"
        ? `${Action}(${res.Type})`
        : `${Action}(${res.ID})`;
    return Object.assign(
      (Resource: Resource | ResourceClass, Props?: ResourceProps) => ({
        Resource,
        Props,
        toString() {
          return `${Action}(${Resource}${
            Props
              ? `, ${Object.entries(Props as any)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(", ")}`
              : ""
          })`;
        },
        [util.inspect.custom]() {
          return this.toString();
        },
        [Symbol.toStringTag]() {
          return this.toString();
        },
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
