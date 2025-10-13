import type * as HKT from "effect/HKT";
import util from "node:util";
import type { Resource, ResourceClass, ResourceProps } from "./resource.ts";

export type SerializedCapability<B extends Capability = Capability> = Omit<
  B,
  "resource"
> & {
  resource: {
    type: string;
    id: string;
  };
};

export interface CapabilityType<Action extends string = string, Resource = any>
  extends HKT.TypeLambda {
  Action: Action;
  Resource: Resource;
  new (_: never): CapabilityType<Action, Resource>;
  <T>(
    T: T,
  ): HKT.Kind<
    this,
    never,
    never,
    never,
    // @ts-expect-error
    T["kind"] extends "ResourceClass" ? T["resource"] : T
  >;
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
  class: Class;
  kind: "Capability";
  sid?: string;
  label: string;
  action: Action;
  resource: Res; //Extract<Res, Resource | ResourceClass>;
};

export const Capability =
  <const Action extends string, Res = any>(action: Action, resource: Res) =>
  <Self extends CapabilityType<Action, any>>() => {
    const res = resource as Resource | ResourceClass;
    const label =
      res.kind === "ResourceClass"
        ? `${action}(${res.type})`
        : `${action}(${res.id})`;
    return Object.assign(
      (resource: Resource | ResourceClass, props?: ResourceProps) => ({
        resource,
        props,
        toString() {
          return `${action}(${"id" in resource ? resource.id : resource.type}${
            props
              ? `, ${Object.entries(props as any)
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
        action: action,
        resource: resource,
        label: label,
        sid: label, // TODO(sam): should this be different
      } as const,
    ) as any as Self;
  };
