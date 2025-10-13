import {
  Binding,
  Capability,
  Provider,
  Runtime,
  Service,
} from "@alchemy.run/effect";

export const FunctionType = "AWS.Lambda.Function";
export type FunctionType = typeof FunctionType;

export type FunctionProps = {
  main: string;
  handler?: string;
  memory?: number;
  runtime?: "nodejs20x" | "nodejs22x";
  architecture?: "x86_64" | "arm64";
  url?: boolean;
};

export type FunctionAttr<Props extends FunctionProps = FunctionProps> = {
  functionArn: string;
  functionName: string;
  functionUrl: Props["url"] extends true ? string : undefined;
  roleName: string;
  roleArn: string;
  code: {
    hash: string;
  };
};

export interface Function<svc = unknown, cap = unknown, props = unknown>
  extends Runtime<FunctionType, svc, cap> {
  readonly Provider: FunctionProvider;
  readonly Binding: FunctionBinding<this["capability"]>;
  readonly Instance: Function<
    this["service"],
    this["capability"],
    this["props"]
  >;
  readonly attr: FunctionAttr<Extract<this["props"], FunctionProps>>;
}
export const Function = Runtime(FunctionType)<Function>();

export type FunctionProvider = Provider<
  Function<Service, Capability, FunctionProps>
>;

export interface FunctionBinding<Cap extends Capability>
  extends Binding<
    Function,
    Cap,
    {
      env: Record<string, string>;
      policyStatements: any[];
    }
  > {}
