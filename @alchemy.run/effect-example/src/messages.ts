import * as SQS from "@alchemy.run/effect-aws/sqs";
import * as S from "effect/Schema";

// schema
export class Message extends S.Struct({
  id: S.Int,
  value: S.String,
}) {}

// resource declaration
export class Messages extends SQS.Queue("messages", {
  fifo: true,
  schema: Message,
}) {}
