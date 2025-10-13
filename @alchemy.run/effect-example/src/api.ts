import * as Lambda from "@alchemy.run/effect-aws/lambda";
import * as SQS from "@alchemy.run/effect-aws/sqs";
import * as Effect from "effect/Effect";
import * as S from "effect/Schema";
import { Message, Messages } from "./messages.ts";

export class Api extends Lambda.serve(
  "api",
  Effect.fn(function* (req) {
    const msg = yield* S.validate(Message)(req.body).pipe(
      Effect.catchAll(Effect.die),
    );
    yield* SQS.sendMessage(Messages, msg).pipe(
      Effect.catchAll(() => Effect.void),
    );
    return {
      statusCode: 200,
      body: JSON.stringify(null),
    };
  }),
) {}

// runtime handler
export default Api.pipe(Effect.provide(SQS.clientFromEnv()), Lambda.toHandler);
