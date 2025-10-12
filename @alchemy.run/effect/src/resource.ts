import util from "node:util";
import { inspect } from "./inspect.ts";

export type ResourceType = string;
export type ResourceID = string;
export type ResourceProps = Record<string, any>;
export type ResourceAttr = Record<string, any>;

export interface ResourceClass<
  Type extends string = string,
  Self extends Resource<Type> = any,
> {
  Kind: "ResourceClass";
  Type: Type;
  new (id: string, props: any): Self;
}

export declare namespace Resource {
  export type Instance<R> = R extends (...args: any[]) => infer I
    ? I
    : R extends new (
          ...args: any[]
        ) => infer I
      ? I
      : R extends new (
            _: never,
          ) => infer I
        ? I
        : R;
}

export interface Resource<
  Type extends ResourceType = ResourceType,
  ID extends ResourceID = ResourceID,
  // @ts-expect-error
  Props extends ResourceProps = unknown,
  // @ts-expect-error
  Attr extends ResourceAttr = unknown,
  Parent = unknown,
> {
  Kind: "Resource";
  Type: Type;
  ID: ID;
  Props: Props;
  /** @internal phantom type */
  Attr: Attr;
  Parent: Parent;
  // new (...args: any[]): Resource<Type, ID, Props, Attr, Parent>;
}

export const Resource = <const Type extends string>(type: Type) => {
  interface R {
    new (...args: any[]): unknown;
  }
  abstract class R {
    static readonly Type = type;
    static readonly Kind = "ResourceClass";

    readonly Kind = "Resource";
    readonly Type = type;
    abstract readonly Attr: {
      [key: string]: any;
    };
    readonly Class: typeof R = R;

    constructor(
      readonly ID: string,
      readonly Props: any,
    ) {
      return class extends (this as any) {} as any;
    }

    static create<
      Self extends new (
        ...args: any[]
      ) => any,
      const ID extends string,
      const Props extends any,
    >(
      this: Self,
      id: ID,
      props: Props,
    ): {
      readonly Kind: "Resource";
      readonly Type: Type;
      readonly ID: ID;
      readonly Props: Props;
      readonly Attr: any;
      readonly Class: Self;

      new (
        ...args: any[]
      ): {
        readonly Kind: "Resource";
        readonly Type: Type;
        readonly ID: ID;
        readonly Props: Props;
        readonly Attr: any;
        readonly Parent: InstanceType<Self>;
        Class: Self;
      };
    } {
      return createClass(type, id, props, R);
    }
  }
  return R;
};

const createClass = <
  Type extends string,
  ID extends string,
  Props extends any,
  Base extends abstract new (
    ...args: any[]
  ) => any,
>(
  type: Type,
  id: ID,
  props: Props,
  Base: Base,
): any => {
  abstract class cls extends Base {
    static readonly Kind = "Resource";
    static readonly Type = type;
    static readonly ID = id;
    static readonly Props = props;
    static readonly Attr = {} as any;

    readonly Kind = "Resource";
    readonly Type = type;
    readonly ID = id;
    readonly Props = props;
    readonly Attr = {} as any;
    readonly Parent = this as any;

    static toString() {
      return `${type}(${id}${
        props && typeof props === "object" && Object.keys(props).length > 0
          ? `, ${Object.entries(props as any)
              .map(([key, value]) => `${key}: ${inspect(value)}`)
              .join(", ")}`
          : ""
      })`;
    }
    static [util.inspect.custom]() {
      return this.toString();
    }
    static [Symbol.toStringTag]() {
      return this.toString();
    }
  }

  return cls;
};
