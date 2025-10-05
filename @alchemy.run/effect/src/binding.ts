import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { Capability } from "./capability.ts";
import type { Resource, ResourceProps } from "./resource.ts";

export interface BindingTag<
  Self,
  Name extends string,
  Cap extends Capability,
  Props extends ResourceProps,
> extends Context.TagClass<
    Self,
    `${Cap["Verb"]}(${Cap["Resource"]["Type"]["Name"]}, ${Name})`,
    Binding<Cap["Resource"], Props>
  > {}

export const Binding =
  <
    const Runtime extends string,
    Cap extends Capability,
    Props extends ResourceProps,
  >(
    Runtime: Runtime,
    Cap: Cap,
  ) =>
  <Self>(): Self =>
    Object.assign(
      Context.Tag(
        `${Cap.Verb}(${Cap.Resource.Type.Name}, ${Runtime})` as `${Cap["Verb"]}(${Cap["Resource"]["Type"]["Name"]}, ${Runtime})`,
      )<Self, Binding<Cap["Resource"]["Type"], Props>>(),
      {
        Kind: "Binding",
        Capability: Cap,
      },
    ) as Self;

export type Binding<
  R extends Resource = Resource,
  Props extends ResourceProps = ResourceProps,
  // AttachReq = any,
  // DetachReq = any,
> = {
  attach: (
    resource: R["Attr"],
    to: Props,
  ) => Effect.Effect<Partial<Props> | void>;
  detach?: (resource: R["Attr"], from: Props) => Effect.Effect<void>;
};
