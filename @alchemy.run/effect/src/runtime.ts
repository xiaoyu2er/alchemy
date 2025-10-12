import util from "node:util";

import type { Types } from "effect";
import * as Context from "effect/Context";
import type { Capability } from "./capability.ts";
import { inspect } from "./inspect.ts";
import type { Resource } from "./resource.ts";
import type { Service } from "./service.ts";

export interface RuntimeType<
  Type extends string = string,
  Svc = unknown,
  Cap = unknown,
  Props = unknown,
> extends Resource<Type, string, Props> {
  new (...args: any[]): {};
  Type: Type;
  /** @internal - we need to use `unknown` or else implicit intersections are performed, so instead we expose the mapped form */
  Svc: Svc;
  Service: Extract<this["Svc"], Service>;
  /** @internal - we need to use `unknown` or else implicit intersections are performed, so instead we expose the mapped form */
  Cap: Cap;
  Capability: Extract<this["Cap"], Capability>;
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
  Type extends string = string,
  Svc = unknown,
  Cap = unknown,
  Props = unknown,
> extends RuntimeType<Type, Svc, Cap, Props> {
  <T>(T: T): Runtime.Binding<this, T>;
}

export const Runtime =
  <const Type extends string>(Type: Type) =>
  <Self>() =>
    Object.assign(
      (cap: Capability) => {
        const tag = `${Type}(${inspect(cap)})` as const;
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
        Service: undefined! as Service,
        Capability: undefined! as Capability[],
        toString() {
          return `${this.Type}(${this.Service?.id}${this.Capability?.length ? `, ${this.Capability.map((c) => `${c}`).join(", ")}` : ""})`;
        },
        [Symbol.toStringTag]() {
          return this.toString();
        },
        [util.inspect.custom]() {
          return this.toString();
        },
      },
    ) as Self;
