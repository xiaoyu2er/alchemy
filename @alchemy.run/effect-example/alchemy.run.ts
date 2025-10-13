import { join } from "node:path";

import { NodeContext } from "@effect/platform-node";
import * as Effect from "effect/Effect";

import * as Alchemy from "@alchemy.run/effect";
import * as AWS from "@alchemy.run/effect-aws";
import * as Lambda from "@alchemy.run/effect-aws/lambda";
import * as SQS from "@alchemy.run/effect-aws/sqs";
import * as AlchemyCLI from "@alchemy.run/effect-cli";

import { Api, Messages } from "./src/index.ts";

// TODO(sam): combine this with Alchemy.plan to do it all in one-line
const app = Alchemy.app({ name: "my-iae-app", stage: "dev" });

const src = join(import.meta.dirname, "src");

const plan = Alchemy.plan({
  phase: process.argv.includes("--destroy") ? "destroy" : "update",
  resources: [
    Alchemy.bind(
      Lambda.Lambda,
      Api,
      Alchemy.Bindings(SQS.SendMessage(Messages)),
      {
        main: join(src, "api.ts"),
        url: true,
      },
    ),
  ],
}).pipe(Alchemy.apply);

const stack = Alchemy.plan({
  phase: process.argv.includes("--destroy") ? "destroy" : "update",
  resources: [
    Alchemy.bind(
      Lambda.Lambda,
      Api,
      Alchemy.Bindings(SQS.SendMessage(Messages)),
      {
        main: join(src, "api.ts"),
        url: true,
      },
    ),
  ],
}).pipe(
  Alchemy.apply,
  Effect.catchTag("PlanRejected", () => Effect.void),
  Effect.provide(AlchemyCLI.layer),
  Effect.provide(AWS.layer),
  Effect.provide(Alchemy.dotAlchemy),
  Effect.provide(Alchemy.State.localFs),
  Effect.provide(NodeContext.layer),
  Effect.provide(app),
  // Effect.runPromise,
);

if (stack) {
  const { api, messages } = stack;
  console.log(stack.api.functionUrl);
}

export default stack;
