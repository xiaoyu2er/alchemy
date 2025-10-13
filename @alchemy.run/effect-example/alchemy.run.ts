import { join } from "node:path";

import { NodeContext } from "@effect/platform-node";
import * as Effect from "effect/Effect";

import * as Alchemy from "@alchemy.run/effect";
import { Bindings } from "@alchemy.run/effect";
import * as AWS from "@alchemy.run/effect-aws";
import * as Lambda from "@alchemy.run/effect-aws/lambda";
import * as SQS from "@alchemy.run/effect-aws/sqs";
import * as AlchemyCLI from "@alchemy.run/effect-cli";

import { Api, Messages } from "./src/index.ts";

const src = join(import.meta.dirname, "src");

const stack = await Alchemy.plan({
  phase: process.argv.includes("--destroy") ? "destroy" : "update",
  resources: [
    Alchemy.bind(Lambda.Lambda, Api, Bindings(SQS.SendMessage(Messages)), {
      main: join(src, "api.ts"),
      url: true,
    }),
  ],
}).pipe(
  Alchemy.apply,
  Effect.catchTag("PlanRejected", () => Effect.void),
  Effect.provide(AlchemyCLI.layer),
  Effect.provide(AWS.layer),
  Effect.provide(Alchemy.dotAlchemy),
  Effect.provide(Alchemy.State.localFs),
  Effect.provide(NodeContext.layer),
  // TODO(sam): combine this with Alchemy.plan to do it all in one-line
  Effect.provide(Alchemy.app({ name: "my-iae-app", stage: "dev" })),
  Effect.runPromise,
);

if (stack) {
  const { api, messages } = stack;
  console.log(stack.api.functionUrl);
}

export default stack;
