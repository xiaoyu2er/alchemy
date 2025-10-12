import * as Effect from "effect/Effect";
import { Capability } from "./capability.ts";
import type { Kind } from "./hkt.ts";
import type { Bound } from "./plan.ts";
import type { Policy } from "./policy.ts";
import type { Resource } from "./resource.ts";
import type { Runtime } from "./runtime.ts";
import { Service } from "./service.ts";

export const bind = <
  Run extends Runtime,
  Svc extends Service,
  const Props extends Run["InputProps"],
>(
  runtime: Run,
  svc: Svc,
  bindings: Policy<
    Extract<
      Svc["capability"] | Effect.Effect.Context<ReturnType<Svc["impl"]>>,
      Capability
    >
  >,
  props: Props,
) => {
  type Cap = Extract<
    Svc["capability"] | Effect.Effect.Context<ReturnType<Svc["impl"]>>,
    Capability
  >;

  type Plan = {
    [id in Svc["id"]]: Runtime.Instance<
      Run,
      Resource.Instance<Svc>,
      Cap,
      Props
    >;
  } & {
    [id in Exclude<Cap["Resource"]["ID"], Svc["id"]>]: Extract<
      Cap["Resource"],
      { ID: id }
    >;
  };

  type Providers<Cap extends Capability> = Cap extends any
    ? Runtime.Binding<Run, Kind<Cap["Class"], Cap["Resource"]["Class"]>>
    : never;

  return Effect.gen(function* () {
    return {
      ...(Object.fromEntries(
        bindings?.capabilities.map((cap) => [cap.Resource.ID, cap.Resource]) ??
          [],
      ) as {
        [id in Cap["Resource"]["ID"]]: Extract<Cap["Resource"], { ID: id }>;
      }),
      [svc.id]: {
        type: "bound",
        svc,
        bindings:
          bindings?.capabilities.map((cap) => runtime(cap) as any) ?? [],
        // TODO(sam): this should be passed to an Effect that interacts with the Provider
        props,
      } satisfies Bound<Run, Svc, Cap, Props>,
    };
  }) as Effect.Effect<
    {
      [k in keyof Plan]: Plan[k];
    },
    never,
    // distribute over each capability class and compute Runtime<Capability<Resource.class>
    Providers<Cap>
  >;
};
