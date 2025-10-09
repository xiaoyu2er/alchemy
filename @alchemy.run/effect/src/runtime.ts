import type { HKT, Types } from "effect";

export interface RuntimeType<Name extends string = string>
  extends HKT.TypeLambda {
  new (...args: any[]): {};
  Name: Name;
  Svc: unknown;
  Cap: unknown;
  Props: unknown;
  Attr: unknown;

  Instance: unknown;

  InputProps: unknown;
}
export declare namespace Runtime {
  export type Instance<F extends RuntimeType, Svc, Cap, Props> = F extends {
    readonly Instance: unknown;
  }
    ? (F & {
        readonly Svc: Svc;
        readonly Cap: Cap;
        readonly Props: Props;
      })["Instance"]
    : {
        readonly F: F;
        readonly Svc: Types.Covariant<Svc>;
        readonly Cap: Types.Contravariant<Cap>;
        readonly Props: Types.Contravariant<Props>;
      };

  export type Binding<F extends RuntimeType, Cap> = F extends {
    readonly Binding: unknown;
  }
    ? (F & {
        readonly Cap: Cap;
      })["Binding"]
    : {
        readonly F: F;
        readonly Cap: Types.Contravariant<Cap>;
      };
}

export interface Runtime<Name extends string = string>
  extends RuntimeType<Name> {
  <T>(T: T): Runtime.Binding<this, T>;
}

export const Runtime =
  <const Name extends string>(Name: Name) =>
  <Self>() =>
    Object.assign(() => {}, { Name }) as Self;
