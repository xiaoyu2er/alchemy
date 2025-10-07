import type { UserConfig } from "@hey-api/openapi-ts";

export default {
  input:
    "https://raw.githubusercontent.com/resend/resend-openapi/main/resend.yaml",
  output: {
    path: "alchemy/src/resend/api",
    format: "biome",
  },
  plugins: [
    {
      name: "@hey-api/typescript",
      exportFromIndex: false,
    },
    {
      name: "@hey-api/sdk",
      instance: "ResendClient",
      exportFromIndex: false,
      auth: false,
    },
    {
      name: "@hey-api/client-fetch",
      throwOnError: true,
    },
  ],
} satisfies UserConfig;

export const patch = async () => {
  const file = Bun.file("alchemy/src/resend/api/sdk.gen.ts");
  let text = await file.text();
  text = text.replace(
    "import",
    'import type {ResendError} from "../api.ts"\nimport',
  );
  await file.write(text.replaceAll(/unknown,/g, "ResendError,"));
};
