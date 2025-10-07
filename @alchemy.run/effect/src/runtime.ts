import type * as HKT from "effect/HKT";

export interface Runtime<Props = any> extends HKT.TypeLambda {
  Props: Props;
  new (_: never): {};
  <T>(T: T): HKT.Kind<this, never, never, never, T>;
}

export const Runtime =
  <const Name extends string>(Name: Name) =>
  <Self>() =>
    Object.assign(() => {}, { Name }) as Self;
