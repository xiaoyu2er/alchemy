import * as Alchemy from "@alchemy.run/effect";
import { Binding, Capability, Provider, Runtime } from "@alchemy.run/effect";
import * as IAM from "../iam.ts";

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

export interface FunctionRuntime<
  svc = unknown,
  cap = unknown,
  props = FunctionProps,
> extends Runtime<FunctionType, svc, cap, props> {
  readonly Provider: FunctionProvider;
  readonly Binding: FunctionBinding<this["capability"]>;
  readonly Instance: FunctionRuntime<
    this["service"],
    this["capability"],
    this["props"]
  >;
  readonly attr: FunctionAttr<Extract<this["props"], FunctionProps>>;
}
export const FunctionRuntime = Runtime(FunctionType)<FunctionRuntime>();

export const Function = <
  S extends Alchemy.Service,
  const Props extends FunctionProps,
>(
  service: S,
  props: Props,
) => Alchemy.bind(FunctionRuntime, service, props);

export type FunctionProvider = Provider<
  FunctionRuntime<unknown, unknown, FunctionProps>
>;

export interface FunctionBinding<Cap extends Capability.Concrete>
  extends Binding<
    FunctionRuntime,
    Cap,
    {
      env: Record<string, string>;
      policyStatements: IAM.PolicyStatement[];
    }
  > {}
