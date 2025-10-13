import * as Effect from "effect/Effect";
import * as HKT from "effect/HKT";
import * as util from "util";
import { Capability } from "./capability.ts";
import type { Policy } from "./policy.ts";
import type { Resource } from "./resource.ts";
import type { Runtime } from "./runtime.ts";
import { Service } from "./service.ts";

export const isBound = (value: any): value is Bound =>
  value && typeof value === "object" && value.type === "bound";

export type Bound<Run extends Runtime = Runtime<string, any, any>> = {
  type: "bound";
  runtime: Run;
};

export const bind = <
  Run extends Runtime,
  Svc extends Service,
  const Props extends Run["props"],
>(
  Run: Run,
  Svc: Svc,
  Policy: Policy<
    Extract<
      Svc["capability"] | Effect.Effect.Context<ReturnType<Svc["impl"]>>,
      Capability
    >
  >,
  Props: Props,
) => {
  type Cap = Extract<
    Svc["capability"] | Effect.Effect.Context<ReturnType<Svc["impl"]>>,
    Capability
  >;

  type Service = Resource.Instance<Svc>;

  type Plan = {
    [id in Svc["id"]]: Bound<
      // @ts-expect-error
      (Run & { svc: Service; cap: Cap; props: Props })["Instance"]
    >;
  } & {
    [id in Exclude<Cap["resource"]["id"], Svc["id"]>]: Extract<
      Cap["resource"],
      { id: id }
    >;
  };

  type Providers<C extends Capability> = C extends any
    ?
        | Runtime.Provider<Run, C, Service, Props>
        | Runtime.Binding<
            Run,
            HKT.Kind<
              Cap["class"],
              never,
              unknown,
              unknown,
              Cap["resource"]["parent"]
            >
          >
    : never;

  return Effect.gen(function* () {
    const self = {
      ...Run,
      id: Svc.id,
      service: Svc,
      capability: Policy?.capabilities as any,
      parent: Run,
      props: Props,
    };
    return {
      ...(Object.fromEntries(
        Policy?.capabilities.map((cap) => [cap.resource.id, cap.resource]) ??
          [],
      ) as {
        [id in Cap["resource"]["id"]]: Extract<Cap["resource"], { id: id }>;
      }),
      [Svc.id]: {
        runtime: self,
        type: "bound",
        toString() {
          return `${self}` as const;
        },
        [Symbol.toStringTag]() {
          return this.toString();
        },
        [util.inspect.custom]() {
          return this.toString();
        },
      },
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
