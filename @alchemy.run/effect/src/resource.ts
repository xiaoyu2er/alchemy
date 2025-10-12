import util from "node:util";
import { inspect } from "./inspect.ts";

export type ResourceType = string;
export type ResourceID = string;
export type ResourceProps = Record<string, any>;
export type ResourceAttr = Record<string, any>;

export interface ResourceClass<
  type extends string = string,
  Self extends Resource<type> = any,
> {
  kind: "ResourceClass";
  type: type;
  props: unknown;
  attr: unknown;
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

export type AnyResource = Resource<any, any, any, any, any>;

export interface Resource<
  type extends ResourceType = ResourceType,
  id extends ResourceID = ResourceID,
  props = unknown,
  attr = unknown,
  parent = unknown,
> {
  kind: "Resource";
  type: type;
  id: id;
  props: props;
  /** @internal phantom type */
  attr: attr;
  parent: parent;
  // new (...args: any[]): Resource<Type, ID, Props, Attr, Parent>;
  capability?: unknown;
}

export const Resource = <const Type extends string>(type: Type) => {
  interface R {
    new (...args: any[]): unknown;
  }
  abstract class R {
    static readonly kind = "ResourceClass";
    static readonly type = type;
    static readonly props = {} as unknown;
    static readonly attr = {} as unknown;

    readonly kind = "Resource";
    readonly type = type;
    abstract readonly attr: {
      [key: string]: any;
    };
    readonly class: typeof R = R;
    static get parent() {
      return this;
    }

    constructor(
      readonly id: string,
      readonly props: any,
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
      readonly class: Self;
      readonly kind: "Resource";
      readonly type: Type;
      readonly id: ID;
      readonly props: Props;
      readonly attr: any;

      new (
        ...args: any[]
      ): {
        readonly kind: "Resource";
        readonly type: Type;
        readonly id: ID;
        readonly props: Props;
        readonly attr: any;
        readonly parent: InstanceType<Self>;
        class: Self;
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
    static readonly kind = "Resource";
    static readonly Type = type;
    static readonly id = id;
    static readonly props = props;
    static readonly Attr = {} as any;

    readonly kind = "Resource";
    readonly Type = type;
    readonly id = id;
    readonly props = props;
    readonly attr = {} as any;
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
