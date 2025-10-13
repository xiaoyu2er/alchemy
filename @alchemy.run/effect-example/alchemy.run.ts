import { join } from "node:path";

import { NodeContext } from "@effect/platform-node";
import * as Effect from "effect/Effect";

import * as Alchemy from "@alchemy.run/effect";
import { Bindings } from "@alchemy.run/effect";
import * as AWS from "@alchemy.run/effect-aws";
import * as Lambda from "@alchemy.run/effect-aws/lambda";
import * as SQS from "@alchemy.run/effect-aws/sqs";
import * as AlchemyCLI from "@alchemy.run/effect-cli";

import { Api, Consumer, Messages } from "./src/index.ts";

const src = join(import.meta.dirname, "src");

const api = Alchemy.bind(
  Lambda.Function,
  Api,
  Bindings(SQS.SendMessage(Messages)),
  {
    main: join(src, "api.ts"),
    url: true,
  },
);

const consumer = Alchemy.bind(
  Lambda.Function,
  Consumer,
  Bindings(SQS.Consume(Messages)),
  {
    main: join(src, "consumer.ts"),
  },
);

const plan = Alchemy.plan({
  phase: process.argv.includes("--destroy") ? "destroy" : "update",
  resources: [api, consumer],
});

const stack = await plan.pipe(
  // TODO(sam): combine this with Alchemy.plan to do it all in one-line
  Alchemy.apply,
  Effect.catchTag("PlanRejected", () => Effect.void),
  Effect.provide(AlchemyCLI.layer),
  Effect.provide(AWS.live),
  Effect.provide(Alchemy.State.localFs),
  Effect.provide(Alchemy.dotAlchemy),
  Effect.provide(Alchemy.app({ name: "my-iae-app", stage: "dev" })),
  Effect.provide(NodeContext.layer),
  Effect.runPromise,
);

if (stack) {
  const { api, messages } = stack;
  console.log(stack.api.functionUrl);
  messages.queueUrl;
  messages.queueName;
}

export default stack;
