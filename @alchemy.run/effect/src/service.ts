import type * as Effect from "effect/Effect";
import type { Capability } from "./capability.ts";
import type { ResourceID } from "./resource.ts";

export type ServiceHandler = (...inputs: any[]) => Effect.Effect<any, any, any>;

export type Service<
  ID extends ResourceID = ResourceID,
  Handler extends ServiceHandler = ServiceHandler,
  Cap extends Capability = Capability,
> = {
  kind: "Service";
  id: ID;
  impl: Handler;
  capability: Cap;
};

export const Service = <
  const ID extends ResourceID,
  Handler extends ServiceHandler,
  Cap extends Capability = never,
>(
  id: ID,
  impl: Handler,
  capability?: Cap,
): Service<ID, Handler, Cap> => ({
  kind: "Service",
  id,
  impl,
  capability: capability!,
});
