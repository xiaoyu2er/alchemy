export type cls<Ctor extends (id: string, props: any) => any = any> =
  Class<Ctor>;
export type Class<
  Ctor extends (id: string, props: any) => any = (
    id: string,
    props: any,
  ) => any,
> = Ctor & {
  Kind: "Class";
  Name: string;
  Ctor: Ctor;
  Object: ReturnType<Ctor>;
  // (id: string, props: any): Object;
  // new (id: string, props: any): any;
};

export declare namespace Class {
  export type Instance<T> = T extends new (
    ...args: any[]
  ) => infer R
    ? R
    : T extends new (
          _: never,
        ) => infer R
      ? R
      : T extends { Object: infer Obj }
        ? Obj
        : T;
}
