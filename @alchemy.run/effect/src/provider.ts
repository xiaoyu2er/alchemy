import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { Class } from "./class.ts";
import type { Resource } from "./resource.ts";

export interface ProviderTag<R extends Resource>
  extends Context.TagClass<ProviderTag<R>, R["Type"], Provider<R>> {
  <cls extends Class<Resource>>(cls: cls): ProviderTag<cls["Object"]>;
}

export const Provider = (<cls extends Class<Resource>>(cls: cls) => {
  type R = Extract<Class.Instance<cls>, Resource>;
  return Context.Tag(cls.Name)<ProviderTag<R>, Provider<R>>();
}) as ProviderTag<Resource>;

export type Diff =
  | {
      action: "update" | "noop";
      deleteFirst?: undefined;
    }
  | {
      action: "replace";
      deleteFirst?: boolean;
    };

export interface Provider<Res extends Resource = Resource> {
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
