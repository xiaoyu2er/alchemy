import type { Types } from "effect";
import * as Context from "effect/Context";
import type { Capability } from "./capability.ts";
import type { Resource } from "./resource.ts";
import type { Service } from "./service.ts";

export interface RuntimeType<Name extends string = string>
  extends Resource<Name> {
  new (...args: any[]): {};
  Name: Name;
  /** @internal - we need to use `unknown` or else implicit intersections are performed, so instead we expose the mapped form */
  Svc: unknown;
  Service: Extract<this["Svc"], Service>;
  /** @internal - we need to use `unknown` or else implicit intersections are performed, so instead we expose the mapped form */
  Cap: unknown;
  Capability: Extract<this["Cap"], Capability>;
}
export declare namespace Runtime {
  export type Binding<F extends RuntimeType, Cap> = F extends {
    readonly Binding: unknown;
  }
    ? (F & {
        readonly Cap: Cap;
      })["Binding"]
    : {
        readonly F: F;
        readonly Cap: Types.Contravariant<Cap>;
      };
}

export interface Runtime<Name extends string = string>
  extends RuntimeType<Name> {
  <T>(T: T): Runtime.Binding<this, T>;
}

export const Runtime =
  <const Name extends string>(Name: Name) =>
  <Self>() =>
    (() =>
      class extends Context.Tag(`Runtime(${Name})`)<Self, string>() {}) as Self;
