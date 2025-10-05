import * as FileSystem from "@effect/platform/FileSystem";
import * as Effect from "effect/Effect";
import type * as HKT from "effect/HKT";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import { Binding, type BindingTag } from "./binding.ts";
import { Capability } from "./capability.ts";
import type { Class } from "./class.ts";
import { Provider } from "./provider.ts";
import { Resource } from "./resource.ts";
import { Service } from "./service.ts";

// AWS Lambda Function (Binding)
export const Lambda = <Cap extends Capability>(Cap: Cap) =>
  Binding("AWS.Lambda.Function", Cap)<Lambda<Cap>>();

export type Lambda<Cap extends Capability> = BindingTag<
  Lambda<Cap>,
  "AWS.Lambda.Function",
  Cap,
  {
    env: Record<string, string>;
    policyStatements: any[];
  }
>;

// Cloudflare Worker (Host)
export const Worker = <Cap extends Capability>(Cap: Cap) =>
  Binding("Cloudflare.Worker", Cap)<Worker<Cap>>();

export type Worker<Cap extends Capability> = BindingTag<
  Worker<Cap>,
  "Cloudflare.Worker",
  Cap,
  {
    bindings: {
      [key: string]: any;
    };
  }
>;

// SQS Queue (Resource)
export type QueueProps<Message = any> = {
  fifo?: boolean;
  schema: S.Schema<Message>;
};

export type Queue<
  ID extends string = string,
  Props extends QueueProps = QueueProps,
> = Resource<
  "AWS.SQS.Queue",
  ID,
  Props,
  {
    id: ID;
    queueUrl: Props["fifo"] extends true ? `${string}.fifo` : string;
  }
>;

export const Queue: Class<
  Queue,
  <ID extends string, Props extends QueueProps>(
    id: ID,
    props: Props,
  ) => Queue<ID, Props>
> = Resource("AWS.SQS.Queue");

// Consume (Binding)
export type Consume<Q = Queue> = Capability<"AWS.SQS.Consume", Q> &
  (<Q>(queue: Q) => Consume<Class.Instance<Q>>);
export const Consume = Capability("AWS.SQS.Consume", Queue) as Consume<Queue>;

// SendMessage (Binding)
export type SendMessage<Q = Queue> = Capability<"AWS.SQS.SendMessage", Q> &
  (<Q>(queue: Q) => SendMessage<Class.Instance<Q>>);
export const SendMessage: SendMessage<Queue> = Capability(
  "AWS.SQS.SendMessage",
  Queue,
);

// example resource
class Messages extends Queue("messages", {
  fifo: true,
  schema: S.Struct({
    id: S.Int,
    value: S.String,
  }),
}) {}

const _Messages = Queue("messages", {
  fifo: true,
  schema: S.Struct({
    id: S.Int,
    value: S.String,
  }),
});

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

export const lambdaSendMessage = Layer.effect(
  Lambda(SendMessage(Queue)),
  Effect.gen(function* () {
    const _fs = yield* FileSystem.FileSystem;
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

export const serve = Service<(req: Request) => Effect.Effect<Response, any>>();

const echo = serve(
  "echo",
  Effect.fn(function* (req) {
    return new Response(req.body, req);
  }),
);

// const _tag: typeof tag = "AWS.SQS.SendMessage(messages)";

export interface FlatMap<F extends HKT.TypeLambda> extends HKT.TypeClass<F> {
  readonly flatMap: {
    <A, R2, O2, E2, B>(
      f: (a: A) => HKT.Kind<F, R2, O2, E2, B>,
    ): <R1, O1, E1>(
      self: HKT.Kind<F, R1, O1, E1, A>,
    ) => HKT.Kind<F, R1 & R2, O1 | O2, E1 | E2, B>;
    <R1, O1, E1, A, R2, O2, E2, B>(
      self: HKT.Kind<F, R1, O1, E1, A>,
      f: (a: A) => HKT.Kind<F, R2, O2, E2, B>,
    ): HKT.Kind<F, R1 & R2, O1 | O2, E1 | E2, B>;
  };
}
