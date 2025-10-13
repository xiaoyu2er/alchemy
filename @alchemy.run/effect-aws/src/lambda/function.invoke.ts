import * as Effect from "effect/Effect";

import {
  allow,
  Capability,
  Resource,
  type CapabilityType,
} from "@alchemy.run/effect";
import { FunctionClient } from "./function.client.ts";
import type { Function } from "./function.ts";

export interface InvoleFunctionClass
  extends CapabilityType<"AWS.Lambda.InvokeFunction", Function> {
  readonly type: InvokeFunction<Resource.Instance<this["Target"]>>;
}
export const InvokeFunction = Capability(
  "AWS.Lambda.InvokeFunction",
  Function,
)<InvoleFunctionClass>();

export interface InvokeFunction<Q>
  extends Capability<"AWS.Lambda.InvokeFunction", Q, InvoleFunctionClass> {}

export const invoke = <F extends Function>(func: F, input: any) =>
  Effect.gen(function* () {
    const lambda = yield* FunctionClient;
    const functionArn = process.env[`${func.id}-functionArn`]!;
    yield* allow<InvokeFunction<F>>();
    return yield* lambda.invoke({
      FunctionName: functionArn,
      InvocationType: "RequestResponse",
      Payload: JSON.stringify(input),
    });
  });
