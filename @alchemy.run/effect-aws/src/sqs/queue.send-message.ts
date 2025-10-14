import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { allow, Capability, type Resource } from "@alchemy.run/effect";
import { Function } from "../lambda/index.ts";
import { QueueClient } from "./queue.client.ts";
import { Queue } from "./queue.ts";

export interface SendMessage<Resource = unknown>
  extends Capability<"AWS.SQS.SendMessage", Resource> {
  constructor: SendMessage;
  construct: SendMessage<this["instance"]>;
}
export const SendMessage = Capability<SendMessage>("AWS.SQS.SendMessage");

export const sendMessage = <Q extends Queue>(
  queue: Q,
  message: Q["props"]["schema"]["Type"],
) =>
  Effect.gen(function* () {
    // TODO(sam): we want this to be a phantom and not explicitly in the Requirements
    yield* allow<SendMessage<Resource.Instance<Q>>>();
    const sqs = yield* QueueClient;
    const url =
      process.env[`${queue.id.toUpperCase().replace(/-/g, "_")}_QUEUE_URL`]!;
    return yield* sqs.sendMessage({
      QueueUrl: url,
      MessageBody: JSON.stringify(message),
    });
  });

export const sendMessageFromLambdaFunction = () =>
  Layer.succeed(Function(SendMessage(Queue)), {
    attach: Effect.fn(function* ({ resource: queue, binding }) {
      return {
        env: {
          [`${queue.id.toUpperCase().replace(/-/g, "_")}_QUEUE_URL`]:
            queue.queueUrl,
        },
        policyStatements: [
          {
            Sid: binding.stmt.sid,
            Effect: "Allow",
            Action: ["sqs:SendMessage"],
            Resource: [queue.queueArn],
          },
        ],
      };
    }),
  });
