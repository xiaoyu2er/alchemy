import type * as lambda from "aws-lambda";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import { Function } from "../lambda/function.ts";

import { allow, Capability, Resource, Service } from "@alchemy.run/effect";
import { Queue } from "./queue.ts";

export interface Consume<Resource = unknown>
  extends Capability<"AWS.SQS.Consume", Resource> {
  constructor: Consume;
  construct: Consume<this["instance"]>;
}
export const Consume = Capability<Consume>("AWS.SQS.Consume");

export type SQSRecord<Data> = Omit<lambda.SQSRecord, "body"> & {
  body: Data;
};

export type SQSEvent<Data> = Omit<lambda.SQSEvent, "Records"> & {
  Records: SQSRecord<Data>[];
};

export function consume<Q extends Queue, ID extends string, Req = never>(
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
      yield* allow<Consume<Resource.Instance<Q>>>();
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

export const consumeFromLambdaFunction = () =>
  Layer.effect(
    Function(Consume(Queue)),
    Effect.gen(function* () {
      return Function(Consume(Queue)).of({
        attach: Effect.fn(function* (queue) {
          return {
            env: {
              [`${queue.id.toUpperCase().replace(/-/g, "_")}_QUEUE_URL`]:
                queue.attr.queueUrl,
            },
          };
        }),
      });
    }),
  );
