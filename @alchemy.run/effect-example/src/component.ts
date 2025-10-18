import * as Alchemy from "@alchemy.run/effect";
import { Bindings, Capability, type Policy } from "@alchemy.run/effect";
import * as Lambda from "@alchemy.run/effect-aws/lambda";
import * as SQS from "@alchemy.run/effect-aws/sqs";
import * as Effect from "effect/Effect";
import * as S from "effect/Schema";

// src/my-component.ts
class Message extends S.Class<Message>("Message")({
  id: S.Int,
  value: S.String,
}) {}

const route1 = <M extends SQS.Queue>(Messages: M) =>
  Effect.gen(function* () {
    // SQS.SendMessage(Messages)
    yield* SQS.sendMessage(Messages, {
      id: 1,
      value: "1",
    }).pipe(Effect.catchAll(() => Effect.void));
  });
//

const Monitor = <const ID extends string, const Req>(
  id: ID,
  policy: Policy<Extract<Req, Capability>>,
  handler: (batch: SQS.SQSEvent<Message>) => Effect.Effect<void, never, Req>,
) => {
  class Messages extends SQS.Queue(`${id}-Messages`, {
    fifo: true,
    schema: Message,
  }) {}

  return SQS.consume(
    Messages,
    id,
    Bindings(SQS.SendMessage(Messages), ...policy.capabilities),
    Effect.fn(function* (batch) {
      yield* route1(Messages);
      return yield* handler(batch);
    }),
  );
};

// src/my-api.ts
class Outer extends SQS.Queue("outer", {
  fifo: true,
  schema: Message,
}) {}

export class MyMonitor extends Monitor(
  "MyMonitor",
  Bindings(SQS.SendMessage(Outer)),
  Effect.fn(function* (batch) {
    for (const record of batch.Records) {
      yield* SQS.sendMessage(Outer, record.body).pipe(
        Effect.catchAll(() => Effect.void),
      );
    }
  }),
) {}

export const handler2 = MyMonitor.pipe(
  Effect.provide(SQS.clientFromEnv()),
  Lambda.toHandler,
);

// const Func = Lambda.Function("MyMonitor", {
//   service: MyMonitor,
//   main: import.meta.filename,
// });

const func = Alchemy.bind(
  Lambda.FunctionRuntime,
  MyMonitor,
  // TODO: go away
  // Alchemy.Bindings(SQS.SendMessage(Outer)),
  {
    main: import.meta.filename,
  },
);

export const handler = MyMonitor.pipe(
  Effect.provide(SQS.clientFromEnv()),
  Lambda.toHandler,
);
