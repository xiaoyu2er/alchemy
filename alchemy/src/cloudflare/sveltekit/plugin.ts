import adapter, { type AdapterOptions } from "@sveltejs/adapter-cloudflare";
import type { Adapter } from "@sveltejs/kit";
import { getPlatformProxyOptions } from "../cloudflare-env-proxy.ts";

const isSvelteLanguageServer = !!process.argv.find((arg) =>
  arg.includes("svelte-language-server"),
);
const isSvelteKitSync =
  process.argv.some((arg) => arg.includes("sveltekit")) &&
  process.argv.includes("sync");

export default (options?: AdapterOptions): Adapter => {
  if (isSvelteLanguageServer || isSvelteKitSync) {
    // the svelte language server runs from the root and therefore may be running in a different cwd than the `Website.cwd`
    // for now, we work around this by returning a noop adapter to avoid breaking svelte intellisense
    return {
      adapt() {},
      name: "alchemy-noop",
    };
  }
  const { platformProxy: proxyOptions, ...config } = options ?? {};
  const platformProxy = getPlatformProxyOptions(proxyOptions);
  return adapter({
    platformProxy,
    config: platformProxy.configPath,
    ...config,
  });
};
