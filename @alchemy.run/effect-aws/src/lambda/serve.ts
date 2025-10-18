import { Capability, Service, type Policy } from "@alchemy.run/effect";
import * as Effect from "effect/Effect";

import type {
  Context as LambdaContext,
  LambdaFunctionURLEvent,
  LambdaFunctionURLResult,
} from "aws-lambda";

export const serve = <const ID extends string, Req>(
  id: ID,
  policy: Policy<Extract<Req, Capability>>,
  handler: (
    event: LambdaFunctionURLEvent,
    context: LambdaContext,
  ) => Effect.Effect<LambdaFunctionURLResult, never, Req>,
) => Service(id, handler, policy);
