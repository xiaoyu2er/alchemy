import util from "node:util";

import type { Types } from "effect";
import * as Context from "effect/Context";
import type { Capability } from "./capability.ts";
import type { Resource } from "./resource.ts";
import type { Service } from "./service.ts";

export interface RuntimeType<
  type extends string = string,
  svc = unknown,
  cap = unknown,
  props = unknown,
> extends Resource<type, string, props> {
  new (...args: any[]): {};
  type: type;
  /** @internal - we need to use `unknown` or else implicit intersections are performed, so instead we expose the mapped form */
  svc: svc;
  service: Extract<this["svc"], Service>;
  /** @internal - we need to use `unknown` or else implicit intersections are performed, so instead we expose the mapped form */
  cap: cap;
  capability: Extract<this["cap"], Capability>;
}
export declare namespace Runtime {
  export type Binding<
    F extends RuntimeType<string, any, any, any>,
    Cap,
  > = F extends {
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

export type AnyRuntime = RuntimeType<string, any, any, any>;

export interface Runtime<
  type extends string = string,
  svc = unknown,
  cap = unknown,
  props = unknown,
> extends RuntimeType<type, svc, cap, props> {
  <T>(T: T): Runtime.Binding<this, T>;
}

export const Runtime =
  <const Type extends string>(Type: Type) =>
  <Self>() =>
    Object.assign(
      (cap: Capability) => {
        const tag = `${Type}(${cap})` as const;
        return class extends Context.Tag(tag)<Self, string>() {
          Capability = cap;
          static toString() {
            return tag;
          }
          static [Symbol.toStringTag]() {
            return this.toString();
          }
          static [util.inspect.custom]() {
            return this.toString();
          }
        };
      },
      {
        Type: Type,
        Kind: "Runtime",
        service: undefined! as Service,
        capability: undefined! as Capability[],
        toString() {
          return `${this.Type}(${this.service?.id}${this.capability?.length ? `, ${this.capability.map((c) => `${c}`).join(", ")}` : ""})`;
        },
        [Symbol.toStringTag]() {
          return this.toString();
        },
        [util.inspect.custom]() {
          return this.toString();
        },
      },
    ) as Self;
