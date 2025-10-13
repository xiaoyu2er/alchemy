export type ResourceType = string;
export type ResourceID = string;
export type ResourceProps = Record<string, any>;
export type ResourceAttr = Record<string, any>;

export const Resource =
  <const Type extends string>(type: Type) =>
  <Self extends Resource<Type>>(): ResourceClass<Self> =>
    (<const ID extends string, const Props extends Self["props"]>(
      id: ID,
      props: Props,
    ) => {
      class Resource {}
      return Object.assign(Resource, {
        kind: "Resource",
        type,
        id,
        props,
        attr: undefined!,
        parent: Resource!,
      });
    }) as unknown as ResourceClass<Self>;

export interface ResourceClass<R extends Resource = Resource> {
  kind: "ResourceClass";
  type: R["type"];
  props: R["props"];
  attr: R["attr"];
  resource: R;
  <const ID extends string, const Props extends R["props"]>(
    id: ID,
    props: Props,
  ): {
    type: R["type"];
    kind: "Resource";
    id: ID;
    props: Props;
    attr: {
      [a in keyof (R & { props: Props })["attr"]]: (R & {
        props: Props;
      })["attr"][a];
    };
    parent: R;
    new (
      _: never,
    ): {
      type: R["type"];
      kind: "Resource";
      parent: R;
      id: ID;
      props: Props;
      attr: {
        [a in keyof (R & { props: Props })["attr"]]: (R & {
          props: Props;
        })["attr"][a];
      };
    };
  };
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
  // new(_: never): Resource<type>;
}
