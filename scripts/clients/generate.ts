import {
  createClient,
  defineConfig,
  type UserConfig,
} from "@hey-api/openapi-ts";
import fs from "node:fs/promises";
import path from "node:path";

export const generate = async (filter: string | undefined) => {
  const clients = await fs
    .readdir(__dirname)
    .then((files) =>
      files
        .map((file) => file.replace(".ts", ""))
        .filter((file) => file !== "generate" && file !== "utils"),
    );

  await patchBiomeConfig(clients);

  const selected: Array<{ name: string; patch?: () => Promise<void> }> = [];

  // 1. Generate clients
  for (const client of clients.filter((client) =>
    filter ? client === filter : true,
  )) {
    const input = (await import(`./${client}.ts`)) as {
      default: UserConfig;
      patch?: () => Promise<void>;
    };
    const config = await defineConfig(input.default);
    await createClient(config);
    selected.push({ name: client, patch: input.patch });
  }

  // 2. Move shared code to util/api
  const $ = Bun.$.cwd(path.join(process.cwd(), "alchemy"));
  await $`rm -rf src/util/api`;
  await $`mkdir -p src/util/api`;
  await $`mv src/${selected[0].name}/api/client/ src/${selected[0].name}/api/core/ src/util/api/`;
  await $`bunx biome check src/util/api --write`;

  // 3. Remove unused code
  for (const client of selected.slice(1)) {
    await $`rm -rf src/${client}/api/client/ src/${client}/api/core/`;
  }

  // 4. Update imports
  for (const client of selected) {
    await patchClientImports(client.name);
    if (client.patch) await client.patch();
    await $`bunx biome check src/${client.name}/api --write`;
  }
};

const patchClientImports = async (client: string) => {
  for (const name of ["client.gen.ts", "sdk.gen.ts"]) {
    const file = Bun.file(`alchemy/src/${client}/api/${name}`);
    const content = await file.text();
    await file.write(content.replace("./client", "../../util/api/client"));
  }
};

const patchBiomeConfig = async (clients: string[]) => {
  const root = path.join(import.meta.dirname, "..", "..");
  const file = Bun.file(path.join(root, "biome.json"));
  const json = (await file.json()) as { files: { includes: string[] } };
  const index = json.files.includes.findIndex((value) =>
    value.match(/alchemy\/src\/(.*)\/api\/\*.ts/),
  );
  const value = `alchemy/src/{${clients.join(",")}}/api/*.ts`;
  if (json.files.includes[index] === value) return;
  json.files.includes[index] = value;
  await file.write(`${JSON.stringify(json, null, 2)}\n`);
  await Bun.$.cwd(root)`bunx biome check biome.json --write`;
};

if (import.meta.main) {
  const filter = process.argv[2];
  await generate(filter);
}
