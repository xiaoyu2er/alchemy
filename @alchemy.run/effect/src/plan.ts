import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import util from "node:util";
import { isBound, type Bound } from "./bind.ts";
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
  attributes: Cap["resource"]["attr"];
};

export type Detach<Cap extends Capability = Capability> = {
  action: "detach";
  capability: Cap;
  attributes: Cap["resource"]["attr"];
};

export type NoopBind<Cap extends Capability = Capability> = {
  action: "noop";
  capability: Cap;
  attributes: Cap["resource"]["attr"];
};

export const isCRUD = (node: any): node is CRUD => {
  return (
    node &&
    typeof node === "object" &&
    (node.action === "create" ||
      node.action === "update" ||
      node.action === "replace" ||
      node.action === "noop")
  );
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

const BaseNode = {
  action: undefined! as "create" | "update" | "replace" | "noop",
  resource: undefined! as Resource,
  toString() {
    return `${this.action.charAt(0).toUpperCase()}${this.action.slice(1)}(${this.resource})`;
  },
  [Symbol.toStringTag]() {
    return this.toString();
  },
  [util.inspect.custom]() {
    return this.toString();
  },
};

export type Create<R extends Resource> = {
  action: "create";
  resource: R;
  news: any;
  provider: ProviderService;
  attributes: R["attr"];
  bindings: BindNode[];
};

export type Update<R extends Resource> = {
  action: "update";
  resource: R;
  olds: any;
  news: any;
  output: any;
  provider: ProviderService;
  attributes: R["attr"];
  bindings: BindNode[];
};

export type Delete<R extends Resource> = {
  action: "delete";
  resource: R;
  olds: any;
  output: any;
  provider: ProviderService;
  bindings: BindNode[];
  attributes: R["attr"];
  downstream: string[];
};

export type NoopUpdate<R extends Resource> = {
  action: "noop";
  resource: R;
  attributes: R["attr"];
  bindings: BindNode[];
};

export type Replace<R extends Resource> = {
  action: "replace";
  resource: R;
  olds: any;
  news: any;
  output: any;
  provider: ProviderService;
  bindings: BindNode[];
  attributes: R["attr"];
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
        resource.capabilities.map((cap) => [cap.resource.id, resource.id]),
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
                            ? node.runtime.capability
                            : [];
                          const news = isBound(node)
                            ? node.runtime.props
                            : resource.props;

                          const oldState = yield* state.get(id);
                          if (!resource.parent) {
                            console.log({ resource: resource });
                          }
                          const provider: ProviderService = yield* Provider(
                            resource.parent as ResourceClass,
                          );
                          const capabilities = diffCapabilities(
                            oldState,
                            statements,
                          );

                          if (
                            oldState === undefined ||
                            oldState.status === "creating"
                          ) {
                            return {
                              ...BaseNode,
                              action: "create",
                              news,
                              provider,
                              resource,
                              bindings: capabilities,
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
                                ...BaseNode,
                                action: "noop",
                                resource,
                                capabilities,
                                // phantom
                                attributes: undefined!,
                              };
                            } else if (diff.action === "replace") {
                              return {
                                ...BaseNode,
                                action: "replace",
                                olds: oldState.props,
                                news,
                                output: oldState.output,
                                provider,
                                resource,
                                capabilities,
                                // phantom
                                attributes: undefined!,
                              };
                            } else {
                              return {
                                ...BaseNode,
                                action: "update",
                                olds: oldState.props,
                                news,
                                output: oldState.output,
                                provider,
                                resource,
                                capabilities,
                                // phantom
                                attributes: undefined!,
                              };
                            }
                          } else if (compare(oldState, resource.props)) {
                            return {
                              ...BaseNode,
                              action: "update",
                              olds: oldState.props,
                              news,
                              output: oldState.output,
                              provider,
                              resource,
                              capabilities,
                              // phantom
                              attributes: undefined!,
                            };
                          } else {
                            return {
                              ...BaseNode,
                              action: "noop",
                              resource,
                              capabilities,
                              // phantom
                              attributes: undefined!,
                            };
                          }
                        }),
                      ),
                    )).map((update) => [update.resource.id, update]),
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
                    kind: "Resource",
                    id: id,
                    parent: undefined,
                    type: oldState.type,
                    attr: oldState.output,
                    props: oldState.props,
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
  newState: R["props"],
) => JSON.stringify(oldState?.props) === JSON.stringify(newState);

const diffCapabilities = (
  oldState: ResourceState | undefined,
  caps: Capability[],
) => {
  const actions: BindNode[] = [];
  const oldCaps = oldState?.capabilities;
  const oldSids = new Set(oldCaps?.map((binding) => binding.sid));
  for (const cap of caps) {
    const sid = cap.sid ?? `${cap.action}:${cap.resource.ID}`;
    oldSids.delete(sid);

    const oldBinding = oldCaps?.find((cap) => cap.sid === sid);
    if (!oldBinding) {
      actions.push({
        action: "attach",
        capability: cap,
        // phantom
        attributes: cap.resource.Attr,
      });
    } else if (isCapabilityDiff(oldBinding, cap)) {
      actions.push({
        action: "attach",
        capability: cap,
        olds: oldBinding,
        // phantom
        attributes: cap.resource.Attr,
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

const isCapabilityDiff = (
  oldBinding: SerializedCapability,
  newBinding: Capability,
) =>
  oldBinding.action !== newBinding.action ||
  // oldBinding.Resource.Type !== newBinding.Resource.Type ||
  oldBinding.resource.id !== newBinding.resource.id;
