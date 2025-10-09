import * as FileSystem from "@effect/platform/FileSystem";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import { Capability, type CapabilityType } from "./capability.ts";
import { Provider } from "./provider.ts";
import { Service } from "./service.ts";

import type * as lambda from "aws-lambda";
import { bind } from "./bind.ts";
import { Binding, Bindings } from "./binding.ts";
import { plan } from "./plan.ts";
import { Resource } from "./resource.ts";
import { Runtime } from "./runtime.ts";

// export interface LambdaFunctionInstance extends TypeLambda {
//   readonly type: LambdaFunction<this["Target"], this["Input"], this["Output"]>;
// }

export interface LambdaFunction //<
  // Svc extends Service = Service,
  // B extends Binding = Binding,
  // Props = any,
  //>
  extends Runtime<
    "AWS.Lambda.Function",
    {
      main: string;
      handler?: string;
      memory?: number;
      timeout?: number;
      runtime?: "nodejs20x" | "nodejs22x";
      architecture?: "x86_64" | "arm64";
      url?: boolean;
    }
  > {
  // readonly instance: LambdaFunctionInstance;
  readonly type: Lambda<this["Capability"]>;
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

// Cloudflare Worker (Host)
export interface WorkerRuntime
  extends Runtime<
    "Cloudflare.Worker",
    {
      main: string;
      compatibilityDate?: string;
      compatibilityFlags?: string[];
      format?: "esm" | "cjs";
    }
  > {
  readonly type: Worker<this["Capability"]>;
}
export const Worker = Runtime("Cloudflare.Worker")<WorkerRuntime>();

export interface Worker<Cap extends Capability>
  extends Binding<
    WorkerRuntime,
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
  declare Attr: {
    queueUrl: Props["fifo"] extends true ? `${string}.fifo` : string;
  };
  constructor(
    readonly ID: ID,
    readonly Props: Props,
  ) {
    super(ID, Props);
  }
}

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
    event: SQSEvent<Q["Props"]["schema"]["Type"]>,
    context: lambda.Context,
  ) => Effect.Effect<lambda.SQSBatchResponse | void, never, Req>,
) {
  const schema = queue.Props.schema;
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
  message: Q["Props"]["schema"]["Type"],
) => Effect.Effect<void, never, SendMessage<Resource.Instance<Q>>>;

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

const tag = Lambda(SendMessage(Queue));

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

// example resource
class Messages extends Queue.create("messages", {
  fifo: true,
  schema: S.Struct({
    id: S.Int,
    value: S.String,
  }),
}) {}

export const serve = <const ID extends string, Req>(
  id: ID,
  handler: (req: Request) => Effect.Effect<Response, never, Req>,
) => Service(id, handler);

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

// AWS Lambda Function (Binding)
class EchoService extends serve(
  "echo-service",
  Effect.fn(function* (req) {
    yield* sendMessage(Messages, {
      id: 1,
      value: "test",
    });
    return new Response(req.body, req);
  }),
) {}

const echo = bind(Lambda, EchoService, Bindings(SendMessage(Messages)), {
  main: "./src/index.ts",
  handler: "index.handler",
  memory: 1024,
  timeout: 300,
  runtime: "nodejs20x",
  architecture: "x86_64",
});

echo.pipe(Effect.provide(lambdaSendSQSMessage), Effect.runPromise);

const echoPlan = plan({
  phase: "update",
  resources: [echo],
});
