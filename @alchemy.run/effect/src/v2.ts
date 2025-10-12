import { NodeContext } from "@effect/platform-node";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import { Capability, type CapabilityType } from "./capability.ts";
import { Provider } from "./provider.ts";
import { Service } from "./service.ts";

import type * as lambda from "aws-lambda";
import { app } from "./app.ts";
import { bind } from "./bind.ts";
import { Binding, Bindings } from "./binding.ts";
import { dotAlchemy } from "./dot-alchemy.ts";
import { plan } from "./plan.ts";
import { Resource } from "./resource.ts";
import { Runtime } from "./runtime.ts";
import * as State from "./state.ts";

export type LambdaFunctionProps = {
  main: string;
  handler?: string;
  memory?: number;
  runtime?: "nodejs20x" | "nodejs22x";
  architecture?: "x86_64" | "arm64";
  url?: boolean;
};

export interface LambdaFunction<
  svc = unknown,
  cap = unknown,
  props extends LambdaFunctionProps = LambdaFunctionProps,
  _Attr = unknown,
> extends Runtime<"AWS.Lambda.Function", svc, cap, props> {
  readonly Binding: Lambda<this["capability"]>;
  readonly attr: this["props"] extends { url?: infer url }
    ? {
        readonly functionName: string;
        readonly functionUrl: url extends true ? string : undefined;
      }
    : never;
  readonly Instance: LambdaFunction<
    this["service"],
    this["capability"],
    this["props"],
    this["attr"]
  >;
}
export const Lambda = Runtime("AWS.Lambda.Function")<LambdaFunction>();

export interface Lambda<Cap extends Capability>
  extends Binding<
    LambdaFunction,
    Cap,
    {
      env: Record<string, string>;
      policyStatements: any[];
    }
  > {}

export const lambdaFunctionProvider = Layer.succeed(
  Provider(Lambda),
  Provider(Lambda).of({
    create: Effect.fn(function* () {
      return {
        functionName: "test",
        functionUrl: "test",
      };
    }),
    update: Effect.fn(function* () {
      return {
        functionName: "test",
        functionUrl: "test",
      };
    }),
    delete: Effect.fn(function* () {}),
  }),
);

// Cloudflare Worker (Host)
export type WorkerProps = {
  main: string;
  compatibilityDate?: string;
  compatibilityFlags?: string[];
  format?: "esm" | "cjs";
  url?: boolean;
};

export type WorkerAttr<Props> = {
  readonly url: Props extends { url: false } ? undefined : string;
};

export interface WorkerScript<svc = unknown, cap = Capability>
  extends Runtime<"Cloudflare.Worker", svc, cap> {
  readonly Binding: Worker<this["capability"]>;
  readonly attr: WorkerAttr<this["props"]>;
  readonly Instance: WorkerScript<this["service"], this["capability"]>;
}

export const Worker = Runtime("Cloudflare.Worker")<WorkerScript>();

export interface Worker<Cap extends Capability>
  extends Binding<
    WorkerScript,
    Cap,
    {
      bindings: {
        [key: string]: any;
      };
    }
  > {}

export type QueueProps<Message = any> = {
  fifo?: boolean;
  schema: S.Schema<Message>;
};

// SQS Queue (Resource)
export class Queue<
  ID extends string = string,
  Props extends QueueProps = QueueProps,
> extends Resource("AWS.SQS.Queue") {
  declare attr: {
    queueUrl: Props["fifo"] extends true ? `${string}.fifo` : string;
  };
  constructor(
    readonly id: ID,
    readonly props: Props,
  ) {
    super(id, props);
  }
}
export const queueProvider = Layer.succeed(
  Provider(Queue),
  Provider(Queue).of({
    create: Effect.fn(function* () {
      return {
        id: "test",
        queueUrl: "test",
      };
    }),
    update: Effect.fn(function* () {
      return {
        id: "test",
        queueUrl: "test",
      };
    }),
    delete: Effect.fn(function* () {}),
  }),
);

export type SQSRecord<Data> = Omit<lambda.SQSRecord, "body"> & {
  body: Data;
};

export type SQSEvent<Data> = Omit<lambda.SQSEvent, "Records"> & {
  Records: SQSRecord<Data>[];
};

// "Pull" function
export function consume<Q extends Queue, ID extends string, Req>(
  queue: Q,
  id: ID,
  handler: (
    event: SQSEvent<Q["props"]["schema"]["Type"]>,
    context: lambda.Context,
  ) => Effect.Effect<lambda.SQSBatchResponse | void, never, Req>,
) {
  const schema = queue.props.schema;
  return Service(
    id,
    Effect.fn(function* (event: lambda.SQSEvent, context: lambda.Context) {
      const records = yield* Effect.all(
        event.Records.map(
          Effect.fn(function* (record) {
            return {
              ...record,
              body: yield* S.validate(schema)(record.body).pipe(
                Effect.catchAll(() => Effect.void),
              ),
            };
          }),
        ),
      );
      const response = yield* handler(
        {
          Records: records.filter((record) => record.body !== undefined),
        },
        context,
      );
      return {
        batchItemFailures: [
          ...(response?.batchItemFailures ?? []),
          ...records
            .filter((record) => record.body === undefined)
            .map((failed) => ({
              itemIdentifier: failed.messageId,
            })),
        ],
      } satisfies lambda.SQSBatchResponse;
    }),
    Consume(queue),
  );
}

// Consume (Binding)
export interface ConsumeClass extends CapabilityType<"AWS.SQS.Consume", Queue> {
  readonly type: Consume<Resource.Instance<this["Target"]>>;
}
export const Consume = Capability("AWS.SQS.Consume", Queue)<ConsumeClass>();
export interface Consume<Q>
  extends Capability<"AWS.SQS.Consume", Q, ConsumeClass> {}

// SendMessage (Binding)
export interface SendMessageClass
  extends CapabilityType<"AWS.SQS.SendMessage", Queue> {
  readonly type: SendMessage<Resource.Instance<this["Target"]>>;
}
export const SendMessage = Capability(
  "AWS.SQS.SendMessage",
  Queue,
)<SendMessageClass>();
export interface SendMessage<Q>
  extends Capability<"AWS.SQS.SendMessage", Q, SendMessageClass> {}

export declare const sendMessage: <Q extends Queue>(
  queue: Q,
  message: Q["props"]["schema"]["Type"],
) => Effect.Effect<void, never, SendMessage<Resource.Instance<Q>>>;

// bind a Queue to an AWS Lambda function
export const lambdaQueueEventSource = Layer.effect(
  Lambda(Consume(Queue)),
  Effect.gen(function* () {
    return Lambda(Consume(Queue)).of({
      attach: Effect.fn(function* ({ queueUrl }) {
        return {
          env: {
            QUEUE_URL: queueUrl,
          },
        };
      }),
    });
  }),
);

// bind a Queue to a Cloudflare Worker
export const lambdaQueueCloudflareBinding = Layer.effect(
  Worker(Consume(Queue)),
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return Worker(Consume(Queue)).of({
      attach: Effect.fn(function* ({ queueUrl }) {
        return {
          bindings: {
            QUEUE: queueUrl,
          },
        };
      }),
    });
  }),
);

export const workerSendSQSMessage = Layer.effect(
  Worker(SendMessage(Queue)),
  Effect.gen(function* () {
    return Worker(SendMessage(Queue)).of({
      attach: Effect.fn(function* ({ queueUrl }) {
        return {
          bindings: {
            QUEUE: queueUrl,
          },
        };
      }),
    });
  }),
);

export const lambdaSendSQSMessage = Layer.effect(
  Lambda(SendMessage(Queue)),
  Effect.gen(function* () {
    return Lambda(SendMessage(Queue)).of({
      attach: Effect.fn(function* ({ queueUrl }) {
        return {
          policyStatements: [
            {
              Effect: "Allow",
              Action: ["sqs:SendMessage"],
              Resource: [queueUrl],
            },
          ],
          env: {
            QUEUE_URL: queueUrl,
          },
        };
      }),
    });
  }),
);

export const serve = <const ID extends string, Req>(
  id: ID,
  handler: (req: Request) => Effect.Effect<Response, never, Req>,
) => Service(id, handler);

// example resource

// Resource
class Message extends S.Struct({
  id: S.Int,
  value: S.String,
}) {}

class Messages extends Queue.create("Messages", {
  fifo: true,
  schema: Message,
}) {}

// Service
class EchoService extends serve(
  "EchoService",
  Effect.fn(function* (req) {
    yield* sendMessage(Messages, {
      id: 1,
      value: "test",
    });
    return new Response(req.body, req);
  }),
) {}

class MessageConsumer extends consume(
  Messages,
  "MessageConsumer",
  Effect.fn(function* (event) {
    const fs = yield* FileSystem.FileSystem;
    for (const record of event.Records) {
      yield* sendMessage(Messages, record.body);
    }
    return {
      batchItemFailures: [],
    };
  }),
) {}

// Materialize Infrastructure
const echo = bind(Lambda, EchoService, Bindings(SendMessage(Messages)), {
  main: "./src/index.ts",
  handler: "index.handler",
  runtime: "nodejs20x",
  architecture: "arm64",
  url: true,
});

const consumer = bind(
  Lambda,
  MessageConsumer,
  Bindings(SendMessage(Messages), Consume(Messages)),
  {
    main: "./src/index.ts",
    handler: "index.handler",
    runtime: "nodejs20x",
    architecture: "arm64",
    url: true,
  },
);

// console.log(await echo.pipe(Effect.runPromise));

if (import.meta.main) {
  const echoPlan = await plan({
    phase: "update",
    resources: [echo],
  }).pipe(
    Effect.provide(dotAlchemy),
    Effect.provide(State.localFs),
    Effect.provide(app({ name: "my-iae-app", stage: "dev" })),
    Effect.provide(NodeContext.layer),
    Effect.provide(lambdaSendSQSMessage),
    Effect.provide(lambdaFunctionProvider),
    Effect.provide(queueProvider),
    Effect.runPromise,
  );
  console.log(echoPlan.EchoService.bindings);
}
