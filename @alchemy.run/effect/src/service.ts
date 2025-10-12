import type * as Effect from "effect/Effect";
import type { Capability } from "./capability.ts";
import type { ResourceID } from "./resource.ts";

export type ServiceHandler = (
  ...inputs: any[]
) => Effect.Effect<any, never, any>;

export type Service<
  ID extends ResourceID = ResourceID,
  Handler extends ServiceHandler = ServiceHandler,
  Cap extends Capability = Capability,
> = {
  kind: "Service";
  id: ID;
  impl: Handler;
  capability: Cap;
  new (_: never): Service<ID, Handler, Cap>;
};

export const Service = <
  const ID extends ResourceID,
  Handler extends ServiceHandler,
  Cap extends Capability = never,
>(
  id: ID,
  impl: Handler,
  capability?: Cap,
): Service<ID, Handler, Cap> =>
  class {
    static readonly kind = "Service";
    static readonly id = id;
    static readonly impl = impl;
    static readonly capability = capability;

    readonly kind = "Service";
    readonly id = id;
    readonly impl = impl;
    readonly capability = capability;
    constructor(_: never) {}
  } as Service<ID, Handler, Cap>;
