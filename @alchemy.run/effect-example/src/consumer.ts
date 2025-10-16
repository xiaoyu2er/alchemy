import * as Lambda from "@alchemy.run/effect-aws/lambda";
import * as SQS from "@alchemy.run/effect-aws/sqs";
import * as Effect from "effect/Effect";
import { Messages } from "./messages.ts";

// business logic
export class Consumer extends SQS.consume(
  Messages,
  "consumer",
  Effect.fn(function* (batch) {
    for (const record of batch.Records) {
      console.log(record);
      yield* SQS.sendMessage(Messages, {
        id: 1,
        value: "1",
      }).pipe(Effect.catchAll(() => Effect.void));
    }
  }),
) {}

// runtime handler
export default Consumer.pipe(
  Effect.provide(SQS.clientFromEnv()),
  Lambda.toHandler,
);
