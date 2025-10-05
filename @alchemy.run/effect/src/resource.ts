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
  // <Cls extends Class<any, any>>(): Cls => {
  type Res = any;
  type Props = ConstructorParameters<Res>[0];
  type Attr = InstanceType<Res>;
  return Object.assign(
    <const ID extends string, P extends Props>(id: ID, props: P) =>
      Object.assign(class {}, {
        type,
        id,
        props,
        attr: undefined! as Attr,
      }) as any as Res,
    {
      Type: type,
      Props: undefined! as Props,
      Attr: undefined! as Attr,
    },
  ) as any;
};
