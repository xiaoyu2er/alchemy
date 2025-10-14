import type { Resource } from "./resource";

export type SerializedCapability<
  B extends Capability.Concrete = Capability.Concrete,
> = Omit<B, "resource"> & {
  resource: {
    type: string;
    id: string;
  };
};

export const Capability = <Self extends Capability>(
  type: Self["type"],
): CapCtor<Self> => {
  return undefined!;
};

type CapCtor<Self> = Self & {
  // for syntax highlighting (color capability constructors as classes)
  new (_: never): {};
};
export interface Capability<Type extends string = string, Resource = unknown> {
  type: Type;
  constructor: unknown; // Note: this is a necessary boilerplate -  we always need to be able to get the clean type constructor
  resource: Resource;
  instance: Resource.Instance<this["resource"]>;
  <T>(T: T): Capability.Instance<this, Resource.Instance<T>>;
  sid: string;
  action: string;
  label: string;
}

export declare namespace Capability {
  // @ts-expect-error
  type Instance<Cap extends Capability, A> = (Cap["constructor"] & {
    resource: A;
  })["construct"];

  type Attr<Cap> = Extract<
    Cap,
    { resource: { attr: unknown } }
  >["resource"]["attr"];
  type Concrete = Capability & {
    resource: Resource;
  };
}
