export type ResourceType = string;
export type ResourceID = string;
export type ResourceProps = Record<string, any>;
export type ResourceAttr = Record<string, any>;

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
  new (_: never): Attr;
};

export const Resource = <const Type extends string>(type: Type) => {
  interface Resource {
    new (_: never): {};
  }
  abstract class Resource {
    static readonly Type = type;
    abstract readonly Attr: {
      [key: string]: any;
    };
    abstract readonly ID: string;
    abstract readonly Props: any;
  }
  return Resource;
};
