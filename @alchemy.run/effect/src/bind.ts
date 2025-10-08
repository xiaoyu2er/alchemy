import * as Effect from "effect/Effect";
import type * as HKT from "effect/HKT";
import { Capability } from "./capability.ts";
import type { Bound } from "./plan.ts";
import type { Policy } from "./policy.ts";
import type { Resource } from "./resource.ts";
import type { RuntimeClass } from "./runtime.ts";
import { Service } from "./service.ts";

export const bind = <Run extends RuntimeClass, Svc extends Service>(
  runtime: Run,
  svc: Svc,
  bindings: Policy<
    Extract<
      Svc["capability"] | Effect.Effect.Context<ReturnType<Svc["impl"]>>,
      Capability
    >
  >,
  props: Run["Props"],
) => {
  type Cap = Extract<
    Svc["capability"] | Effect.Effect.Context<ReturnType<Svc["impl"]>>,
    Capability
  >;
  const eff = Effect.gen(function* () {
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
        props: {
          // ...self.props,
          main,
          handler,
        },
      } satisfies Bound<Svc, Cap>,
    };
  });

  const clss: any = class {};
  Object.assign(clss, eff);
  clss.pipe = eff.pipe.bind(eff);

  // Runtime<Capability<Resource.class>>
  type Providers = Cap["Class"] extends any
    ? Kind<Run, Kind<Cap["Class"], Cap["Resource"]["Class"]>>
    : never;
  // Runtime<Capability<Resource>>
  // type Bindings = Cap["Class"] extends any
  //   ? Kind<Run, Kind<Cap["Class"], Cap["Resource"]>>
  //   : never;
  type Bindings = Cap["Class"] extends any
    ? Kind<Cap["Class"], Cap["Resource"]>
    : never;
  type Plan = {
    [id in Svc["id"]]: Bound<Kind<Run, Resource.Instance<Svc>>, Bindings>;
  } & {
    [id in Exclude<Cap["Resource"]["ID"], Svc["id"]>]: Extract<
      Cap["Resource"],
      { ID: id }
    >;
  };

  type Kind<Class extends HKT.TypeLambda, A> = HKT.Kind<
    Class,
    unknown,
    never,
    never,
    A
  >;

  return clss as Effect.Effect<
    {
      [k in keyof Plan]: Plan[k];
    },
    never,
    // distribute over each capability class and compute Runtime<Capability<Resource.class>
    Providers
  >;
};
