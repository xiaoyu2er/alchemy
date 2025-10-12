import * as Effect from "effect/Effect";
import type { Capability } from "./capability.ts";

// in - Contravariance
// out - Covariance

// A policy is invariant over its allowed actions
export interface Policy<in out Caps extends Capability = any> {
  readonly capabilities: Caps[];
}

export const allow = <S extends Capability>() =>
  Effect.gen(function* () {}) as Effect.Effect<void, never, S>;
