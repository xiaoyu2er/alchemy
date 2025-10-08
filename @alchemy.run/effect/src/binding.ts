import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as HKT from "effect/HKT";
import type { Capability } from "./capability.ts";
import type { Resource } from "./resource.ts";
import type { RuntimeClassLike } from "./runtime.ts";

export interface BindingProps {
  [key: string]: any;
}

export interface Binding<
  Ctx extends RuntimeClassLike = any,
  Name extends string = string,
  Cap extends Capability = Capability,
> extends Context.TagClass<
    HKT.Kind<Ctx, never, never, never, Cap>,
    `${Cap["Action"]}(${Cap["Resource"]["Type"]["Name"]}, ${Name})`,
    BindingService<Cap["Resource"], Ctx["BindingProps"]>
  > {
  Ctx: Ctx;
  Name: Name;
  Cap: Cap;
}

export const Binding =
  <
    const Runtime extends string,
    Cap extends Capability,
    Props extends BindingProps,
  >(
    Runtime: Runtime,
    Cap: Cap,
  ) =>
  <Self>(): Self =>
    Object.assign(
      Context.Tag(
        `${Cap.Action}(${Cap.Resource.Type.Name}, ${Runtime})` as `${Cap["Action"]}(${Cap["Resource"]["Type"]["Name"]}, ${Runtime})`,
      )<Self, BindingService<Cap["Resource"]["Type"], Props>>(),
      {
        Kind: "Binding",
        Capability: Cap,
      },
    ) as Self;

export type BindingService<
  R extends Resource = Resource,
  Props = any,
  AttachReq = any,
  DetachReq = any,
> = {
  attach: (
    resource: R["Attr"],
    to: Props,
  ) => Effect.Effect<Partial<Props> | void, never, AttachReq>;
  detach?: (
    resource: R["Attr"],
    from: Props,
  ) => Effect.Effect<void, never, DetachReq>;
};

export type SerializedBinding<B extends Binding = Binding> = Omit<
  B,
  "resource"
> & {
  Resource: {
    Type: string;
    ID: string;
  };
};
