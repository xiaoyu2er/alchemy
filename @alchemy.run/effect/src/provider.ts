import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { Resource, ResourceClass } from "./resource.ts";
import type { AnyRuntime } from "./runtime.ts";

export type Provider<R extends Resource> = Context.TagClass<
  Provider<R>,
  R["Type"],
  ProviderService<R>
>;
export const Provider = <R extends ResourceClass | AnyRuntime>(R: R) => {
  return Context.Tag(R.Type)() as Provider<
    R extends ResourceClass ? InstanceType<R> : R
  >;
};

export type Diff =
  | {
      action: "update" | "noop";
      deleteFirst?: undefined;
    }
  | {
      action: "replace";
      deleteFirst?: boolean;
    };

export interface ProviderService<Res extends Resource = Resource> {
  // tail();
  // watch();
  // replace(): Effect.Effect<void, never, never>;
  read?(input: {
    id: string;
    olds: Res["Props"] | undefined;
    // what is the ARN?
    output: Res["Attr"] | undefined; // current state -> synced state
  }): Effect.Effect<Res["Attr"] | undefined, any, never>;
  diff?(input: {
    id: string;
    olds: Res["Props"];
    news: Res["Props"];
    output: Res["Attr"];
  }): Effect.Effect<Diff, never, never>;
  stub?(input: {
    id: string;
    news: Res["Props"];
  }): Effect.Effect<Res["Attr"], any, never>;
  create(input: {
    id: string;
    news: Res["Props"];
  }): Effect.Effect<Res["Attr"], any, never>;
  update(input: {
    id: string;
    news: Res["Props"];
    olds: Res["Props"];
    output: Res["Attr"];
  }): Effect.Effect<Res["Attr"], any, never>;
  delete(input: {
    id: string;
    olds: Res["Props"];
    output: Res["Attr"];
  }): Effect.Effect<void, any, never>;
}
