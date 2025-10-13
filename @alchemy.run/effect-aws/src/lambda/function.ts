import { Binding, Capability, Runtime } from "@alchemy.run/effect";

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

export type FunctionAttributes<Props extends FunctionProps = FunctionProps> = {
  functionArn: string;
  functionName: string;
  functionUrl: Props["url"] extends true ? string : undefined;
  roleName: string;
  roleArn: string;
  code: {
    hash: string;
  };
};

export interface FunctionClass<
  svc = unknown,
  cap = unknown,
  props extends FunctionProps = FunctionProps,
  _Attr = unknown,
> extends Runtime<FunctionType, svc, cap, props> {
  readonly Binding: Function<this["capability"]>;
  readonly Instance: FunctionClass<
    this["service"],
    this["capability"],
    this["props"],
    {
      [a in keyof this["attr"]]: this["attr"][a];
    }
  >;
  readonly attr: FunctionAttributes<this["props"]>;
}
export const Function = Runtime(FunctionType)<FunctionClass>();

export interface Function<Cap extends Capability>
  extends Binding<
    FunctionClass,
    Cap,
    {
      env: Record<string, string>;
      policyStatements: any[];
    }
  > {}
