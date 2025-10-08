import type * as HKT from "effect/HKT";
import type { Binding } from "./binding";
import type { Capability } from "./capability";

export interface RuntimeClassLike extends HKT.TypeLambda {
  Name: string;
  RuntimeProps: any;
  BindingProps: any;
}

export interface RuntimeClass<
  Name extends string = string,
  RuntimeProps = any,
  BindingProps = any,
> extends HKT.TypeLambda {
  Name: Name;
  RuntimeProps: RuntimeProps;
  BindingProps: BindingProps;
  new (_: never): {};
  <T>(T: T): HKT.Kind<this, never, never, never, T>;
}

export interface Runtime<A, Cls extends RuntimeClassLike> {
  Value: A;
  Runtime: Cls;
  Tag: A extends Capability ? Binding<Cls, Cls["Name"], A> : never;
}

export const RuntimeClass =
  <const Name extends string>(Name: Name) =>
  <Self>() =>
    Object.assign(() => {}, { Name }) as Self;
