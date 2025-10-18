import * as Alchemy from "@alchemy.run/effect";
import { Bindings, Capability, type Policy } from "@alchemy.run/effect";
import * as Lambda from "@alchemy.run/effect-aws/lambda";
import * as SQS from "@alchemy.run/effect-aws/sqs";
import * as Effect from "effect/Effect";
import * as S from "effect/Schema";

const Component = <
  const Graph extends [{ id: string }, { [k: string]: { id: string } }],
>(
  id: string,
  fn: () => Graph,
) => {
  return class {} as unknown as Graph[0] & {
    [k in keyof Graph[1]]: Graph[1][k];
  } & {
    pipe: any; // TODO: implement this
  };
};

// src/my-component.ts
class Message extends S.Class<Message>("Message")({
  id: S.Int,
  value: S.String,
}) {}

// Monitor<QueueClient | SendMessage<Outer>>.Messages
const Monitor = <Req>(
  id: string,
  handler: (batch: SQS.SQSEvent<Message>) => Effect.Effect<void, never, Req>,
  policy: Policy<Extract<Req, Capability>>,
) =>
  Component(id, () => {
    class Messages extends SQS.Queue("Messages", {
      fifo: true,
      schema: Message,
    }) {}

    class Api extends Lambda.serve(
      "api",
      Effect.fn(function* (req) {
        return {
          statusCode: 200,
          body: "Hello, world!",
        };
      }),
    ) {}

    class Consumer extends SQS.consume(
      Messages,
      "consumer",
      Effect.fn(function* (batch) {
        yield* SQS.sendMessage(Messages, {
          id: 1,
          value: "1",
        }).pipe(Effect.catchAll(() => Effect.void));
        return yield* handler(batch);
      }),
      Bindings(SQS.SendMessage(Messages), ...policy.capabilities),
    ) {}

    return [Consumer, { Messages }];
  });

// src/my-api.ts
class Outer extends SQS.Queue("outer", {
  fifo: true,
  schema: Message,
}) {}

export class MyMonitor extends Monitor(
  "my-monitor",
  Effect.fn(function* (batch) {
    for (const record of batch.Records) {
      yield* SQS.sendMessage(Outer, record.body).pipe(
        Effect.catchAll(() => Effect.void),
      );
    }
  }),
  Bindings(SQS.SendMessage(Outer)),
) {}

export const handler2 = MyMonitor.pipe(
  Effect.provide(SQS.clientFromEnv()),
  Lambda.toHandler,
);

// alchemy.run.ts

// Monitor<QueueClient | SendMessage<Outer>>.Messages
MyMonitor.Messages;

const func = Alchemy.bind(
  Lambda.Function,
  MyMonitor,
  // TODO: go away
  Alchemy.Bindings(
    SQS.Consume(MyMonitor.Messages),
    SQS.SendMessage(Outer),
    SQS.SendMessage(MyMonitor.Messages),
  ),
  {
    main: import.meta.filename,
  },
);

export const handler = MyMonitor.pipe(
  Effect.provide(SQS.clientFromEnv()),
  Lambda.toHandler,
);
