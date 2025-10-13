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

export interface Resource<type extends ResourceType = ResourceType> {
  kind: "Resource";
  type: type;
  id: ResourceID;
  props: unknown;
  /** @internal phantom type */
  attr: unknown;
  parent: unknown;
  // new (...args: any[]): Resource<Type, ID, Props, Attr, Parent>;
  capability?: unknown;
}

export const Resource =
  <const Type extends string>(type: Type) =>
  <Self extends Resource<Type>>() => {
    const fac = <const ID extends string, const Props extends Self["props"]>(
      id: ID,
      props: Props,
    ) => {
      type Attr = (Self & {
        props: Props;
      })["attr"];
      type ResourceClass = {
        kind: "Resource";
        type: Type;
        id: ID;
        props: Props;
        attr: {
          [k in keyof Attr]: Attr[k];
        };
        parent: Self;
        new (
          _: never,
        ): Self & {
          id: ID;
          props: Props;
        };
      };
      class Resource {}
      return Object.assign(Resource, {
        kind: "Resource",
        type,
        id,
        props,
        attr: undefined!,
        parent: Resource!,
      }) as unknown as ResourceClass;
    };

    return fac as typeof fac & {
      // added purely for syntax highlighting (resources highlighted as types/classes)
      new (_: never): {};
    };
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
    readonly type = type;
    readonly id = id;
    readonly props = props;
    readonly attr = {} as any;
    readonly parent = this as any;

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
