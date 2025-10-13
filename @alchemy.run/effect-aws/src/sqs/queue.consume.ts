import type * as lambda from "aws-lambda";

import * as Effect from "effect/Effect";
import * as S from "effect/Schema";

import {
  Capability,
  Resource,
  Service,
  type CapabilityType,
} from "@alchemy.run/effect";
import { Queue } from "./queue.ts";

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

export interface ConsumeClass extends CapabilityType<"AWS.SQS.Consume", Queue> {
  readonly type: Consume<Resource.Instance<this["Target"]>>;
}

export const Consume = Capability("AWS.SQS.Consume", Queue)<ConsumeClass>();
export interface Consume<Q>
  extends Capability<"AWS.SQS.Consume", Q, ConsumeClass> {}
