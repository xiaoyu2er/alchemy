import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import { isBound, type Bound } from "./bind.ts";
import type { Binding } from "./binding.ts";
import type { Capability, SerializedCapability } from "./capability.ts";
import type { Phase } from "./phase.ts";
import { Provider, type ProviderService } from "./provider.ts";
import type { AnyResource, Resource, ResourceClass } from "./resource.ts";
import type { Runtime } from "./runtime.ts";
import { State, type ResourceState } from "./state.ts";

export type PlanError = never;

/**
 * A node in the plan that represents a binding operation acting on a resource.
 */
export type BindNode<Cap extends Capability = Capability> =
  | Attach<Cap>
  | Detach<Cap>
  | NoopBind<Cap>;

export type Attach<Cap extends Capability = Capability> = {
  action: "attach";
  capability: Cap;
  olds?: SerializedCapability<Cap>;
  attributes: Cap["Resource"]["Attr"];
};

export type Detach<Cap extends Capability = Capability> = {
  action: "detach";
  capability: Cap;
  attributes: Cap["Resource"]["Attr"];
};

export type NoopBind<Cap extends Capability = Capability> = {
  action: "noop";
  capability: Cap;
  attributes: Cap["Resource"]["Attr"];
};

/**
 * A node in the plan that represents a resource CRUD operation.
 */
export type CRUD<R extends Resource = Resource> =
  | Create<R>
  | Update<R>
  | Delete<R>
  | Replace<R>
  | NoopUpdate<R>;

export type Apply<R extends Resource> =
  | Create<R>
  | Update<R>
  | Replace<R>
  | NoopUpdate<R>;

export type Create<R extends Resource> = {
  action: "create";
  resource: R;
  news: any;
  provider: ProviderService;
  attributes: R["Attr"];
};

export type Update<R extends Resource> = {
  action: "update";
  resource: R;
  olds: any;
  news: any;
  output: any;
  provider: ProviderService;
  attributes: R["Attr"];
};

export type Delete<R extends Resource> = {
  action: "delete";
  resource: R;
  olds: any;
  output: any;
  provider: ProviderService;
  bindings: [];
  attributes: R["Attr"];
  downstream: string[];
};

export type NoopUpdate<R extends Resource> = {
  action: "noop";
  resource: R;
  attributes: R["Attr"];
};

export type Replace<R extends Resource> = {
  action: "replace";
  resource: R;
  olds: any;
  news: any;
  output: any;
  provider: ProviderService;
  attributes: R["Attr"];
  deleteFirst?: boolean;
};

type PlanNode = Bound<any> | Resource;
type PlanGraph = {
  [id in string]: PlanNode;
};
type PlanGraphEffect = Effect.Effect<PlanGraph, never, unknown>;

type ApplyAll<
  Subgraphs extends PlanGraphEffect[],
  Accum extends Record<string, CRUD> = {},
> = Subgraphs extends [
  infer Head extends PlanGraphEffect,
  ...infer Tail extends PlanGraphEffect[],
]
  ? ApplyAll<
      Tail,
      Accum & {
        [id in keyof Effect.Effect.Success<Head>]: _Apply<
          Extract<Effect.Effect.Success<Head>[id], PlanNode>
        >;
      }
    >
  : Accum;

type _Apply<Item extends PlanNode> = Item extends Bound<
  infer Run extends Runtime<string, any, any>
>
  ? Apply<Run>
  : Item extends Resource
    ? Apply<Item>
    : never;

type DerivePlan<
  P extends Phase = Phase,
  Resources extends PlanGraphEffect[] = PlanGraphEffect[],
> = P extends "update"
  ?
      | {
          [k in keyof ApplyAll<Resources>]: ApplyAll<Resources>[k];
        }
      | {
          [k in Exclude<
            string,
            keyof ApplyAll<Resources>
          >]: Delete<AnyResource>;
        }
  : {
      [k in Exclude<string, keyof ApplyAll<Resources>>]: Delete<AnyResource>;
    };

export type Plan = {
  [id in string]: CRUD;
};

export const plan = <
  const Phase extends "update" | "destroy",
  const Resources extends PlanGraphEffect[],
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
          capabilities: SerializedCapability[];
        } => !!resource?.capabilities,
      )
      .flatMap((resource) =>
        resource.capabilities.map((cap) => [cap.Resource.ID, resource.id]),
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
                          const resource = isBound(node) ? node.runtime : node;
                          const statements = isBound(node)
                            ? node.runtime.Capability
                            : [];
                          const news = isBound(node)
                            ? node.runtime.Props
                            : resource.Props;

                          const oldState = yield* state.get(id);
                          if (!resource.Parent) {
                            console.log({ resource: resource });
                          }
                          const provider: ProviderService = yield* Provider(
                            resource.Parent as ResourceClass,
                          );
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
                            } satisfies Create<Resource>;
                          } else if (provider.diff) {
                            const diff = yield* provider.diff({
                              id,
                              olds: oldState.props,
                              news,
                              output: oldState.output,
                            });
                            if (diff.action === "noop") {
                              return {
                                action: "noop",
                                resource,
                                // phantom
                                attributes: undefined!,
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
                              };
                            }
                          } else if (compare(oldState, resource.Props)) {
                            return {
                              action: "update",
                              olds: oldState.props,
                              news,
                              output: oldState.output,
                              provider,
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
                            };
                          }
                        }),
                      ),
                    )).map((update) => [update.resource.ID, update]),
                  ) as Plan;
                }),
              ),
            ),
          )
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
                    Kind: "Resource",
                    ID: id,
                    Parent: undefined,
                    Type: oldState.type,
                    // Class: oldState.type,
                    Attr: oldState.output,
                    Props: oldState.props,
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
  const oldBindings = oldState?.capabilities;
  const oldSids = new Set(oldBindings?.map((binding) => binding.sid));
  for (const binding of bindings) {
    const sid = binding.Sid ?? `${binding.Action}:${binding.Resource.ID}`;
    oldSids.delete(sid);

    const oldBinding = oldBindings?.find((binding) => binding.sid === sid);
    if (!oldBinding) {
      actions.push({
        action: "attach",
        capability: binding,
        // phantom
        attributes: binding.Resource.Attr,
      });
    } else if (isBindingDiff(oldBinding, binding)) {
      actions.push({
        action: "attach",
        capability: binding,
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

const isBindingDiff = (oldBinding: SerializedCapability, newBinding: Binding) =>
  oldBinding.Action !== newBinding.Action ||
  oldBinding.Resource.id !== newBinding.Resource.ID;
