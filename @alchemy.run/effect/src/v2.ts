import * as FileSystem from "@effect/platform/FileSystem";
import * as Effect from "effect/Effect";
import type * as HKT from "effect/HKT";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import { Binding } from "./binding.ts";
import { Capability, type CapabilityClass } from "./capability.ts";
import { Provider } from "./provider.ts";
import { Service } from "./service.ts";

export interface LambdaRuntime
  extends Runtime<{
    memory: number;
    timeout: number;
    runtime: "nodejs20x" | "nodejs22x";
    architecture: "x86_64" | "arm64";
    main: string;
    handler: string;
  }> {
  readonly type: Lambda<Extract<this["Target"], Capability>>;
}

export const Lambda = Runtime("AWS.Lambda.Function")<LambdaRuntime>();

export interface Lambda<T extends Capability>
  extends Binding<
    Lambda<T>,
    "AWS.Lambda.Function",
    T,
    {
      env: Record<string, string>;
      policyStatements: any[];
    }
  > {}

// Cloudflare Worker (Host)
export interface WorkerRuntime
  extends Runtime<{
    main: string;
    compatibilityDate?: string;
    compatibilityFlags?: string[];
    format?: "esm" | "cjs";
  }> {
  readonly type: Worker<Extract<this["Target"], Capability>>;
}
export const Worker = Runtime("Cloudflare.Worker")<WorkerRuntime>();

export type Worker<Cap extends Capability> = Binding<
  Worker<Cap>,
  "Cloudflare.Worker",
  Cap,
  {
    bindings: {
      [key: string]: any;
    };
  }
>;

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

import type * as lambda from "aws-lambda";
import type { BoundDecl } from "./plan.ts";
import { attach, type Policy } from "./policy.ts";
import { Resource } from "./resource.ts";
import { Runtime } from "./runtime.ts";

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
export interface ConsumeClass
  extends CapabilityClass<"AWS.SQS.Consume", Queue> {
  readonly type: Consume<Resource.Instance<this["Target"]>>;
}
export interface Consume<Q>
  extends Capability<"AWS.SQS.Consume", Q, ConsumeClass> {}
export const Consume = Capability("AWS.SQS.Consume", Queue)<ConsumeClass>();

// SendMessage (Binding)
export interface SendMessageClass
  extends CapabilityClass<"AWS.SQS.SendMessage", Queue> {
  readonly type: SendMessage<Resource.Instance<this["Target"]>>;
}
export interface SendMessage<Q>
  extends Capability<"AWS.SQS.SendMessage", Q, SendMessageClass> {}
export const SendMessage = Capability(
  "AWS.SQS.SendMessage",
  Queue,
)<SendMessageClass>();

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

const messageConsumer = consume(
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
);

// AWS Lambda Function (Binding)

export const make = <Run extends Runtime, Svc extends Service>(
  runtime: Run,
  svc: Svc,
  bindings: Policy<
    Extract<
      Svc["capability"] | Effect.Effect.Context<ReturnType<Svc["impl"]>>,
      Capability
    >
  >,
  props: Run["Props"],
) => {
  type Cap = Extract<
    Svc["capability"] | Effect.Effect.Context<ReturnType<Svc["impl"]>>,
    Capability
  >;
  const eff = Effect.gen(function* () {
    return {
      ...(Object.fromEntries(
        bindings?.capabilities.map((cap) => [cap.Resource.ID, cap.Resource]) ??
          [],
      ) as {
        [id in Cap["Resource"]["ID"]]: Extract<Cap["Resource"], { ID: id }>;
      }),
      [svc.id]: {
        type: "bound",
        svc,
        bindings:
          bindings?.capabilities.map((cap) => runtime(cap) as any) ?? [],
        // TODO(sam): this should be passed to an Effect that interacts with the Provider
        props: {
          // ...self.props,
          main,
          handler,
        },
      } satisfies BoundDecl<Svc, Cap>,
    };
  });

  const clss: any = class {};
  Object.assign(clss, eff);
  clss.pipe = eff.pipe.bind(eff);

  type Plan = {
    [id in Svc["id"]]: BoundDecl<Resource.Instance<Svc>, Cap>;
  } & {
    [id in Exclude<Cap["Resource"]["ID"], Svc["id"]>]: Extract<
      Cap["Resource"],
      { ID: id }
    >;
  };

  type Kind<Class extends HKT.TypeLambda, A> = HKT.Kind<
    Class,
    unknown,
    never,
    never,
    A
  >;

  return clss as Effect.Effect<
    {
      [k in keyof Plan]: Plan[k];
    },
    never,
    // distribute over each capability class and compute Runtime<Capability<Resource.class>
    Cap["Class"] extends any
      ? Kind<Run, Kind<Cap["Class"], Cap["Resource"]["Class"]>>
      : never
  >;
};

class EchoService extends serve(
  "echo",
  Effect.fn(function* (req) {
    yield* sendMessage(Messages, {
      id: 1,
      value: "test",
    });
    return new Response(req.body, req);
  }),
) {}

const bar = make(Lambda, EchoService, attach(SendMessage(Messages)), {
  main: "./src/index.ts",
  handler: "index.handler",
  memory: 1024,
  timeout: 300,
  runtime: "nodejs20x",
  architecture: "x86_64",
});

declare const foo: Consume<Messages>;
foo.Resource.Parent;
