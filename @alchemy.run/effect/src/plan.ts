import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type { Binding, SerializedBinding } from "./binding.ts";
import type { Phase } from "./phase.ts";
import type { ProviderService } from "./provider.ts";
import type { Resource } from "./resource.ts";
import type { Runtime } from "./runtime.ts";
import type { Service } from "./service.ts";
import { State, type ResourceState } from "./state.ts";
import type { TagInstance } from "./tag-instance.ts";

export type PlanError = never;

export type Bound<
  Run extends Runtime = Runtime,
  Svc = Service,
  Bindings = Binding,
  Props = any,
> = {
  type: "bound";
  svc: Svc;
  bindings: Bindings[];
  props: Props;
};

export const isBoundDecl = (value: any): value is Bound =>
  value && typeof value === "object" && value.type === "bound";

/**
 * A node in the plan that represents a binding operation acting on a resource.
 */
export type BindNode<B extends Binding = Binding> =
  | Attach<B>
  | Detach<B>
  | NoopBind<B>;

export type Attach<B extends Binding = Binding> = {
  action: "attach";
  binding: B;
  olds?: SerializedBinding<B>;
  attributes: B["Identifier"]["Resource"]["Attr"];
};

export type Detach<B extends Binding = Binding> = {
  action: "detach";
  binding: B;
  attributes: B["Identifier"]["Resource"]["Attr"];
};

export type NoopBind<B extends Binding = Binding> = {
  action: "noop";
  binding: B;
  attributes: B["Identifier"]["Resource"]["Attr"];
};

/**
 * A node in the plan that represents a resource CRUD operation.
 */
export type CrudNode<
  R extends Resource = Resource,
  B extends Binding = Binding,
> =
  | Create<R, B>
  | Update<R, B>
  | Delete<R, B>
  | Replace<R, B>
  | NoopUpdate<R, B>;

export type Create<R extends Resource, B extends Binding = Binding> = {
  action: "create";
  resource: R;
  news: any;
  provider: ProviderService;
  bindings: Attach<B>[];
  attributes: R["Attr"];
};

export type Update<R extends Resource, B extends Binding = Binding> = {
  action: "update";
  resource: R;
  olds: any;
  news: any;
  output: any;
  provider: ProviderService;
  bindings: BindNode<B>[];
  attributes: R["Attr"];
};

export type Delete<R extends Resource, _B extends Binding = Binding> = {
  action: "delete";
  resource: R;
  olds: any;
  output: any;
  provider: ProviderService;
  bindings: [];
  attributes: R["Attr"];
  downstream: string[];
};

export type NoopUpdate<R extends Resource, B extends Binding = Binding> = {
  action: "noop";
  resource: R;
  attributes: R["Attr"];
  bindings: NoopBind<B>[];
};

export type Replace<R extends Resource, B extends Binding = Binding> = {
  action: "replace";
  resource: R;
  olds: any;
  news: any;
  output: any;
  provider: ProviderService;
  bindings: BindNode<B>[];
  attributes: R["Attr"];
  deleteFirst?: boolean;
};

type PlanItem = Effect.Effect<
  {
    [id in string]: Bound | Resource;
  },
  never,
  any
>;

type ApplyAll<
  Items extends PlanItem[],
  Accum extends Record<string, CrudNode> = {},
> = Items extends [
  infer Head extends PlanItem,
  ...infer Tail extends PlanItem[],
]
  ? ApplyAll<
      Tail,
      Accum & {
        [id in keyof Effect.Effect.Success<Head>]: Apply<
          Effect.Effect.Success<Head>[id],
          id extends keyof Accum
            ? Accum[id]["bindings"][number]["binding"]
            : never
        >;
      }
    >
  : Accum;

type Apply<T, Cap extends Binding = never> = T extends Bound<
  infer From,
  infer Bindings extends Binding
>
  ? CrudNode<From, Bindings | Cap>
  : T extends Resource
    ? CrudNode<T, Cap>
    : never;

type DerivePlan<
  P extends Phase = Phase,
  Resources extends PlanItem[] = PlanItem[],
> = P extends "update"
  ?
      | {
          [k in keyof ApplyAll<Resources>]: ApplyAll<Resources>[k];
        }
      | {
          [k in Exclude<string, keyof ApplyAll<Resources>>]: Delete<
            Resource,
            Binding
          >;
        }
  : {
      [k in Exclude<string, keyof ApplyAll<Resources>>]: Delete<
        Resource,
        Binding
      >;
    };

export type Plan = {
  [id in string]: CrudNode;
};

export const plan = <
  const Phase extends "update" | "destroy",
  const Resources extends PlanItem[],
>({
  phase,
  resources,
}: {
  phase: Phase;
  resources: Resources;
}) => {
  return Effect.gen(function* () {
    const state = yield* State;

    const resourceIds = yield* state.list();
    const resourcesState = yield* Effect.all(
      resourceIds.map((id) => state.get(id)),
    );
    // map of resource ID -> its downstream dependencies (resources that depend on it)
    const downstream = resourcesState
      .filter(
        (
          resource,
        ): resource is ResourceState & {
          bindings: SerializedBinding[];
        } => !!resource?.bindings,
      )
      .flatMap((resource) =>
        resource.bindings.map((binding) => [binding.resource.id, resource.id]),
      )
      .reduce(
        (acc, [id, resourceId]) => ({
          ...acc,
          [id]: [...(acc[id] ?? []), resourceId],
        }),
        {} as Record<string, string[]>,
      );

    const updates = (
      phase === "update"
        ? yield* Effect.all(
            resources.map((resource) =>
              Effect.flatMap(
                resource,
                Effect.fn(function* (subgraph: {
                  [x: string]: Resource | Bound;
                }) {
                  return Object.fromEntries(
                    (yield* Effect.all(
                      Object.entries(subgraph).map(
                        Effect.fn(function* ([id, node]) {
                          const resource = isBoundDecl(node) ? node.svc : node;
                          const statements = isBoundDecl(node)
                            ? node.bindings
                            : [];
                          const news = isBoundDecl(node)
                            ? node.props
                            : resource.props;

                          const oldState = yield* state.get(id);
                          const provider: ProviderService =
                            yield* resource.provider;
                          const bindings = diffBindings(oldState, statements);

                          if (
                            oldState === undefined ||
                            oldState.status === "creating"
                          ) {
                            return {
                              action: "create",
                              news,
                              provider,
                              resource,
                              // phantom
                              attributes: undefined!,
                              bindings: bindings as Attach<Binding>[],
                            } satisfies Create<Resource, Binding>;
                          } else if (provider.diff) {
                            const diff = yield* provider.diff({
                              id,
                              olds: oldState.props,
                              news,
                              output: oldState.output,
                              bindings,
                            });
                            if (diff.action === "noop") {
                              return {
                                action: "noop",
                                resource,
                                // phantom
                                attributes: undefined!,
                                bindings: bindings as NoopBind<Binding>[],
                              };
                            } else if (diff.action === "replace") {
                              return {
                                action: "replace",
                                olds: oldState.props,
                                news,
                                output: oldState.output,
                                provider,
                                resource,
                                // phantom
                                attributes: undefined!,
                                bindings: bindings,
                              };
                            } else {
                              return {
                                action: "update",
                                olds: oldState.props,
                                news,
                                output: oldState.output,
                                provider,
                                resource,
                                // phantom
                                attributes: undefined!,
                                bindings: bindings,
                              };
                            }
                          } else if (compare(oldState, resource.props)) {
                            return {
                              action: "update",
                              olds: oldState.props,
                              news,
                              output: oldState.output,
                              provider,
                              bindings,
                              resource,
                              // phantom
                              attributes: undefined!,
                            };
                          } else {
                            return {
                              action: "noop",
                              resource,
                              // phantom
                              attributes: undefined!,
                              bindings: bindings as NoopBind<Binding>[],
                            };
                          }
                        }),
                      ),
                    )).map((update) => [update.resource.ID, update]),
                  ) as Plan;
                }),
              ),
            ),
          ) as Effect.Effect<
            {
              [id in keyof Resources]: Apply<Resources[id]>;
            }, // & DeleteOrphans<keyof Resources>,
            PlanError,
            // | Req
            | State
            // extract the providers from the deeply nested resources
            | {
                [id in keyof Resources]: Resources[id] extends Bound
                  ?
                      | TagInstance<Resources[id]["svc"]["provider"]>
                      | TagInstance<
                          Resources[id]["bindings"][number]["Resource"]["provider"]
                        >
                  : Resources[id] extends Resource
                    ? TagInstance<Resources[id]["provider"]>
                    : never;
              }[keyof Resources]
          >
        : []
    ).reduce((acc, update: any) => ({ ...acc, ...update }), {} as Plan);

    const deletions = Object.fromEntries(
      (yield* Effect.all(
        (yield* state.list()).map(
          Effect.fn(function* (id) {
            if (id in updates) {
              return;
            }
            const oldState = yield* state.get(id);
            const context = yield* Effect.context<never>();
            if (oldState) {
              const provider = context.unsafeMap.get(oldState?.type);
              if (!provider) {
                yield* Effect.die(
                  new Error(`Provider not found for ${oldState?.type}`),
                );
              }
              return [
                id,
                {
                  action: "delete",
                  olds: oldState.props,
                  output: oldState.output,
                  provider,
                  attributes: oldState?.output,
                  // TODO(sam): Support Detach Bindings
                  bindings: [],
                  resource: {
                    ID: id,
                    Class: oldState.type,
                    Attr: oldState.output,
                    Props: oldState.props,
                    provider,
                  },
                  downstream: downstream[id] ?? [],
                } satisfies Delete<Resource>,
              ] as const;
            }
          }),
        ),
      )).filter((v) => !!v),
    );

    for (const [resourceId, deletion] of Object.entries(deletions)) {
      const dependencies = deletion.downstream.filter((d) => d in updates);
      if (dependencies.length > 0) {
        return yield* Effect.fail(
          new DeleteResourceHasDownstreamDependencies({
            message: `Resource ${resourceId} has downstream dependencies`,
            resourceId,
            dependencies,
          }),
        );
      }
    }

    return [updates, deletions].reduce(
      (acc, plan) => ({ ...acc, ...plan }),
      {} as any,
    );
  }) as Effect.Effect<
    DerivePlan<Phase, Resources>,
    never,
    Effect.Effect.Context<Resources[number]> | State
  >;
};

class DeleteResourceHasDownstreamDependencies extends Data.TaggedError(
  "DeleteResourceHasDownstreamDependencies",
)<{
  message: string;
  resourceId: string;
  dependencies: string[];
}> {}

const compare = <R extends Resource>(
  oldState: ResourceState | undefined,
  newState: R["Props"],
) => JSON.stringify(oldState?.props) === JSON.stringify(newState);

const diffBindings = (
  oldState: ResourceState | undefined,
  bindings: Binding[],
) => {
  const actions: BindNode[] = [];
  const oldBindings = oldState?.bindings;
  const oldSids = new Set(oldBindings?.map((binding) => binding.sid));
  for (const binding of bindings) {
    const sid = binding.Sid ?? `${binding.Action}:${binding.Resource.ID}`;
    oldSids.delete(sid);

    const oldBinding = oldBindings?.find((binding) => binding.sid === sid);
    if (!oldBinding) {
      actions.push({
        action: "attach",
        binding: binding,
        // phantom
        attributes: binding.Resource.Attr,
      });
    } else if (isBindingDiff(oldBinding, binding)) {
      actions.push({
        action: "attach",
        binding: binding,
        olds: oldBinding,
        // phantom
        attributes: binding.Resource.Attr,
      });
    }
  }
  // for (const sid of oldSids) {
  //   actions.push({
  //     action: "detach",
  //     cap: oldBindings?.find((binding) => binding.sid === sid)!,
  //   });
  // }
  return actions;
};

const isBindingDiff = (oldBinding: SerializedBinding, newBinding: Binding) =>
  oldBinding.Action !== newBinding.Action ||
  oldBinding.Resource.id !== newBinding.Resource.ID;
