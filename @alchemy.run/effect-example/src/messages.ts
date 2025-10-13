import * as Lambda from "@alchemy.run/effect-aws/lambda";
import * as SQS from "@alchemy.run/effect-aws/sqs";
import * as Effect from "effect/Effect";
import * as S from "effect/Schema";

// schema
export const Message = S.Struct({
  id: S.Int,
  value: S.String,
});

// resource declaration
export class Messages extends SQS.Queue.create("messages", {
  fifo: true,
  schema: Message,
}) {}

// business logic
export class Consumer extends SQS.consume(
  Messages,
  "consumer",
  Effect.fn(function* (batch) {
    for (const record of batch.Records) {
      console.log(record);
    }
  }),
) {}

// runtime handler
export default Consumer.pipe(
  Effect.provide(SQS.clientFromEnv()),
  Lambda.toHandler,
);
