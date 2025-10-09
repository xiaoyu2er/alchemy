import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { Capability } from "./capability.ts";
import type { Policy } from "./policy.ts";
import type { Resource } from "./resource.ts";
import type { Runtime, RuntimeType } from "./runtime.ts";

export interface BindingProps {
  [key: string]: any;
}

export interface Binding<
  Run extends RuntimeType = RuntimeType,
  Cap extends Capability = Capability,
  BindingProps = any,
> extends Context.TagClass<
    Runtime.Binding<Run, Cap>,
    `${Cap["Action"]}(${Cap["Resource"]["Type"]["Name"]}, ${Run["Name"]})`,
    BindingService<Cap["Resource"], BindingProps>
  > {
  Run: Run;
  BindingProps: BindingProps;
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

export type Bindings = ReturnType<typeof Bindings>;

export const Bindings = <S extends any[]>(
  ...capabilities: S
): Policy<S[number]> => ({
  capabilities,
});
