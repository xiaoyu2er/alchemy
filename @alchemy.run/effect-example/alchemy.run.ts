import * as Alchemy from "@alchemy.run/effect";
import * as AWS from "@alchemy.run/effect-aws";
import * as Lambda from "@alchemy.run/effect-aws/lambda";
import * as AlchemyCLI from "@alchemy.run/effect-cli";
import { FetchHttpClient } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import * as Effect from "effect/Effect";
import { join } from "node:path";
import { Api, Consumer } from "./src/index.ts";

const src = join(import.meta.dirname, "src");

const api = Alchemy.bind(
  Lambda.Function,
  Api,
  // Bindings(SQS.SendMessage(Messages)),
  {
    main: join(src, "api.ts"),
    url: true,
  },
);

const consumer = Alchemy.bind(
  Lambda.Function,
  Consumer,
  // Bindings(SQS.Consume(Messages)),
  {
    main: join(src, "consumer.ts"),
  },
);

const plan = Alchemy.plan({
  phase: process.argv.includes("--destroy") ? "destroy" : "update",
  resources: [api, consumer],
});

const stack = await plan.pipe(
  Alchemy.apply,
  Effect.catchTag("PlanRejected", () => Effect.void),
  Effect.provide(AlchemyCLI.layer),
  Effect.provide(AWS.live),
  Effect.provide(Alchemy.State.localFs),
  Effect.provide(Alchemy.dotAlchemy),
  Effect.provide(Alchemy.app({ name: "my-iae-app", stage: "dev" })),
  Effect.provide(NodeContext.layer),
  Effect.provide(FetchHttpClient.layer),
  Effect.tap((stack) => Effect.log(stack?.api.functionUrl)),
  Effect.runPromise,
);
