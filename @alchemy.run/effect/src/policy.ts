import * as Effect from "effect/Effect";
import type { Capability } from "./capability.ts";
import type { Resource as _Resource } from "./resource.ts";

// A policy is invariant over its allowed actions
export interface Policy<in out Caps extends Capability = any> {
  readonly capabilities: Caps[];
}

export type SerializedStatement<S extends Statement = Statement> = Omit<
  S,
  "resource"
> & {
  resource: {
    type: string;
    id: string;
  };
};

export type Statement<
  Action extends string = string,
  Resource extends _Resource = _Resource,
> = Allow<Action, Resource>; //| Deny<Action, Resource>;

export interface Allow<
  Action extends string,
  Resource extends _Resource,
  Condition = any,
  Binding = any,
> {
  /**
   * ID uniquely identifying this statement
   *
   * @default ${effect}:${action}:${resource.id}
   */
  sid?: string;
  label: string;
  effect: "Allow";
  action: Action;
  resource: Resource;
  condition?: Condition;
  binding: Binding;
}

export const allow = <S extends Statement>() =>
  Effect.gen(function* () {}) as Effect.Effect<void, never, S>;

export const attach = <S extends any[]>(
  ...capabilities: S
): Policy<S[number]> => ({
  capabilities,
});
