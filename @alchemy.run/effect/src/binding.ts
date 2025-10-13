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
  Run extends RuntimeType<string, any, any> = RuntimeType<string, any, any>,
  Cap extends Capability = Capability,
  BindingProps = any,
> extends Context.TagClass<
    Runtime.Binding<Run, Cap>,
    `${Cap["action"]}(${Cap["resource"]["type"]["Name"]}, ${Run["type"]})`,
    BindingService<Cap["resource"], BindingProps>
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
        `${Cap.action}(${Cap.resource.Type.Name}, ${Runtime})` as `${Cap["action"]}(${Cap["resource"]["Type"]["Name"]}, ${Runtime})`,
      )<Self, BindingService<Cap["resource"]["Type"], Props>>(),
      {
        Kind: "Binding",
        Capability: Cap,
      },
    ) as Self;

export type BindingService<
  R extends Resource = Resource,
  Props = any,
  AttachReq = never,
  DetachReq = never,
> = {
  attach: (
    resource: R,
    to: Props,
  ) => Effect.Effect<Partial<Props> | void, never, AttachReq>;
  detach?: (resource: R, from: Props) => Effect.Effect<void, never, DetachReq>;
};

export type Bindings = ReturnType<typeof Bindings>;

export const Bindings = <S extends any[]>(
  ...capabilities: S
): Policy<S[number]> => ({
  capabilities,
});
