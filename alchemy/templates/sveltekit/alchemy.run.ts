import alchemy from "alchemy";
import { SvelteKit } from "alchemy/cloudflare";

const app = await alchemy("{projectName}");

export const website = await SvelteKit("website");

console.log({
  url: website.url,
});

await app.finalize();
