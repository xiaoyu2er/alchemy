export type ResourceType = string;
export type ResourceID = string;
export type ResourceProps = Record<string, any>;
export type ResourceAttr = Record<string, any>;

export type ResourceClass<Type extends string = string> = {
  Kind: "Resource";
  Type: Type;
  new (...args: any[]): any;
};

export declare namespace Resource {
  export type Instance<R> = R extends new (
    ...args: any[]
  ) => infer I
    ? I
    : R extends new (
          _: never,
        ) => infer I
      ? I
      : R;
}

export type Resource<
  Type extends ResourceType = ResourceType,
  ID extends ResourceID = ResourceID,
  Props extends ResourceProps = ResourceProps,
  Attr extends ResourceAttr = ResourceAttr,
> = {
  Kind: "Resource";
  Type: Type;
  ID: ID;
  Props: Props;
  /** @internal phantom type */
  Attr: Attr;
  new (...args: any[]): any;
};

export const Resource =
  <const Type extends string>(type: Type) =>
  <Self>() => {
    interface R {
      new (_: never): {};
    }
    abstract class R {
      static readonly Type = type;
      static readonly Kind = "Resource";

      readonly Kind = "Resource";
      readonly Type = type;
      abstract readonly ID: string;
      abstract readonly Props: any;
      abstract readonly Attr: {
        [key: string]: any;
      };
    }
    return R as unknown as Self & Resource<Type>;
  };
