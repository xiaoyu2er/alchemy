import type * as HKT from "effect/HKT";
import type { Capability } from "./capability";
import type { Kind } from "./hkt";

// export interface RuntimeClassLike extends HKT.TypeLambda {
//   Name: string;
//   RuntimeProps: any;
//   BindingProps: any;
// }

// export interface RuntimeClass<
//   Name extends string = string,
//   RuntimeProps = any,
//   BindingProps = any,
// > extends HKT.TypeLambda {
//   Name: Name;
//   RuntimeProps: RuntimeProps;
//   BindingProps: BindingProps;
//   new (_: never): {};
//   <T>(T: T): HKT.Kind<this, never, never, never, T>;
// }

// export interface Runtime<A, Cls extends RuntimeClassLike> {
//   Value: A;
//   Runtime: Cls;
//   Tag: A extends Capability ? Binding<Cls, A> : never;
// }

export interface RuntimeType<Name extends string = string, ResourceProps = any>
  extends HKT.TypeLambda {
  Name: Name;
  ResourceProps: ResourceProps;
  Capability: Extract<this["Target"], Capability>;
  output: any;
  new (...args: any[]): {};
}

export interface Runtime<Name extends string = string, ResourceProps = any>
  extends RuntimeType<Name, ResourceProps> {
  <T>(T: T): Kind<this, T>;
}

export const Runtime =
  <const Name extends string>(Name: Name) =>
  <Self>() =>
    Object.assign(() => {}, { Name }) as Self;
