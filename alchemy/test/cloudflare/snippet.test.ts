import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { createCloudflareApi } from "../../src/cloudflare/api.ts";
import {
  Snippet,
  deleteSnippet,
  deleteSnippetRules,
  getSnippet,
  getSnippetContent,
  listSnippets,
  updateSnippetRules,
  type SnippetRule,
} from "../../src/cloudflare/snippet.ts";
import { Zone } from "../../src/cloudflare/zone.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";

import "../../src/test/vitest.ts";

const api = await createCloudflareApi();

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

// Helper function to create snippet-safe names
// Cloudflare Snippets only allow a-z, 0-9, and _
//TODO: The Alchemy resource should validate the name and throw a TypeError & runtime error if it's not valid
function createSnippetName(base: string): string {
  return base.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
}

describe("Snippet Resource", () => {
  const testDomain = `${BRANCH_PREFIX}-snippet-test.dev`;

  test("create, update, and delete snippet", async (scope) => {
    let zone: Zone | undefined;
    let snippet: Snippet | undefined;

    try {
      zone = await Zone(testDomain, {
        name: testDomain,
        type: "full",
        jumpStart: false,
      });

      expect(zone.id).toBeTruthy();
      expect(zone.name).toEqual(testDomain);

      const snippetName = createSnippetName(`${BRANCH_PREFIX}_test_snippet`);
      snippet = await Snippet(snippetName, {
        zone: zone.id,
        name: snippetName,
        content: `
export default {
  async fetch(request) {
    const response = await fetch(request);
    response.headers.set('X-Test-Header', 'Hello from Snippet');
    return response;
  }
}
        `.trim(),
      });

      expect(snippet.id).toEqual(snippetName);
      expect(snippet.name).toEqual(snippetName);
      expect(snippet.zoneId).toEqual(zone.id);
      expect(snippet.createdOn).toBeInstanceOf(Date);
      expect(snippet.modifiedOn).toBeInstanceOf(Date);

      const createdSnippet = await getSnippet(api, zone.id, snippetName);
      expect(createdSnippet.snippet_name).toEqual(snippetName);

      const content = await getSnippetContent(api, zone.id, snippetName);
      expect(content).toContain("X-Test-Header");
      expect(content).toContain("Hello from Snippet");

      snippet = await Snippet(snippetName, {
        zone: zone.id,
        name: snippetName,
        content: `
export default {
  async fetch(request) {
    const response = await fetch(request);
    response.headers.set('X-Test-Header', 'Updated Content');
    response.headers.set('X-Version', '2.0');
    return response;
  }
}
        `.trim(),
      });

      expect(snippet.name).toEqual(snippetName);

      const updatedContent = await getSnippetContent(api, zone.id, snippetName);
      expect(updatedContent).toContain("Updated Content");
      expect(updatedContent).toContain("X-Version");

      const snippets = await listSnippets(api, zone.id);
      expect(snippets.length).toBeGreaterThan(0);
      const foundSnippet = snippets.find((s) => s.snippet_name === snippetName);
      expect(foundSnippet).toBeTruthy();
    } finally {
      await destroy(scope);

      if (zone && snippet) {
        try {
          await getSnippet(api, zone.id, snippet.name);
          throw new Error("Snippet should have been deleted");
        } catch (error) {
          expect(error).toBeTruthy();
        }
      }

      if (zone) {
        const getDeletedResponse = await api.get(`/zones/${zone.id}`);
        expect(getDeletedResponse.status).toEqual(400);
      }
    }
  });

  test("snippet with rules", async (scope) => {
    let zone: Zone | undefined;
    let snippet1: Snippet | undefined;
    let snippet2: Snippet | undefined;

    try {
      const ruleDomain = `${BRANCH_PREFIX}-snippet-rules.dev`;
      zone = await Zone(ruleDomain, {
        name: ruleDomain,
        type: "full",
        jumpStart: false,
      });

      expect(zone.id).toBeTruthy();

      const snippet1Name = createSnippetName(`${BRANCH_PREFIX}_rule_snippet_1`);
      const snippet2Name = createSnippetName(`${BRANCH_PREFIX}_rule_snippet_2`);

      snippet1 = await Snippet(snippet1Name, {
        zone: zone.id,
        name: snippet1Name,
        content: `
export default {
  async fetch(request) {
    const response = await fetch(request);
    response.headers.set('X-Snippet', '1');
    return response;
  }
}
        `.trim(),
      });

      snippet2 = await Snippet(snippet2Name, {
        zone: zone.id,
        name: snippet2Name,
        content: `
export default {
  async fetch(request) {
    const response = await fetch(request);
    response.headers.set('X-Snippet', '2');
    return response;
  }
}
        `.trim(),
      });

      expect(snippet1.name).toEqual(snippet1Name);
      expect(snippet2.name).toEqual(snippet2Name);

      const rules: SnippetRule[] = [
        {
          expression: 'http.request.uri.path eq "/api"',
          snippetName: snippet1Name,
          description: "Apply snippet 1 to /api paths",
          enabled: true,
        },
        {
          expression: 'http.request.uri.path eq "/admin"',
          snippetName: snippet2Name,
          description: "Apply snippet 2 to /admin paths",
          enabled: true,
        },
      ];

      const createdRules = await updateSnippetRules(api, zone.id, rules);
      expect(createdRules.length).toEqual(2);
      expect(createdRules[0].snippet_name).toEqual(snippet1Name);
      expect(createdRules[1].snippet_name).toEqual(snippet2Name);

      await deleteSnippetRules(api, zone.id);
    } finally {
      await destroy(scope);
    }
  });

  test("delete snippet explicitly", async (scope) => {
    let zone: Zone | undefined;
    const snippetName = createSnippetName(`${BRANCH_PREFIX}_delete_test`);

    try {
      const deleteDomain = `${BRANCH_PREFIX}-snippet-delete.dev`;
      zone = await Zone(deleteDomain, {
        name: deleteDomain,
        type: "full",
        jumpStart: false,
      });

      const snippet = await Snippet(snippetName, {
        zone: zone.id,
        name: snippetName,
        content: `
export default {
  async fetch(request) {
    return fetch(request);
  }
}
        `.trim(),
      });

      expect(snippet.name).toEqual(snippetName);

      const foundSnippet = await getSnippet(api, zone.id, snippetName);
      expect(foundSnippet.snippet_name).toEqual(snippetName);

      await deleteSnippet(api, zone.id, snippetName);

      try {
        await getSnippet(api, zone.id, snippetName);
        throw new Error("Snippet should have been deleted");
      } catch (error) {
        expect(error).toBeTruthy();
      }
    } finally {
      await destroy(scope);
    }
  });

  test("list snippets in zone", async (scope) => {
    let zone: Zone | undefined;

    try {
      const listDomain = `${BRANCH_PREFIX}-snippet-list.dev`;
      zone = await Zone(listDomain, {
        name: listDomain,
        type: "full",
        jumpStart: false,
      });

      const snippet1Name = createSnippetName(`${BRANCH_PREFIX}_list_1`);
      const snippet2Name = createSnippetName(`${BRANCH_PREFIX}_list_2`);

      await Snippet(snippet1Name, {
        zone: zone.id,
        name: snippet1Name,
        content:
          "export default { async fetch(request) { return fetch(request); } }",
      });

      await Snippet(snippet2Name, {
        zone: zone.id,
        name: snippet2Name,
        content:
          "export default { async fetch(request) { return fetch(request); } }",
      });

      const snippets = await listSnippets(api, zone.id);
      expect(snippets.length).toBeGreaterThanOrEqual(2);

      const snippet1 = snippets.find((s) => s.snippet_name === snippet1Name);
      const snippet2 = snippets.find((s) => s.snippet_name === snippet2Name);

      expect(snippet1).toBeTruthy();
      expect(snippet2).toBeTruthy();
    } finally {
      await destroy(scope);
    }
  });

  test("adopt existing snippet", async (scope) => {
    let zone: Zone | undefined;
    const snippetName = createSnippetName(`${BRANCH_PREFIX}_adopt_test`);

    try {
      const adoptDomain = `${BRANCH_PREFIX}-snippet-adopt.dev`;
      zone = await Zone(adoptDomain, {
        name: adoptDomain,
        type: "full",
        jumpStart: false,
      });

      const snippet1 = await Snippet(snippetName, {
        zone: zone.id,
        name: snippetName,
        content: `
export default {
  async fetch(request) {
    const response = await fetch(request);
    response.headers.set('X-Version', '1.0');
    return response;
  }
}
        `.trim(),
      });

      expect(snippet1.name).toEqual(snippetName);

      try {
        await Snippet(`${snippetName}-2`, {
          zone: zone.id,
          name: snippetName,
          content: `
export default {
  async fetch(request) {
    return fetch(request);
  }
}
          `.trim(),
        });
        throw new Error(
          "Should have thrown error for existing snippet without adopt",
        );
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("already exists");
        expect((error as Error).message).toContain("adopt: true");
      }

      const snippet2 = await Snippet(`${snippetName}-adopted`, {
        zone: zone.id,
        name: snippetName,
        content: `
export default {
  async fetch(request) {
    const response = await fetch(request);
    response.headers.set('X-Version', '2.0');
    return response;
  }
}
        `.trim(),
        adopt: true,
      });

      expect(snippet2.name).toEqual(snippetName);

      const adoptedContent = await getSnippetContent(api, zone.id, snippetName);
      expect(adoptedContent).toContain("X-Version");
      expect(adoptedContent).toContain("2.0");
    } finally {
      await destroy(scope);
    }
  });
});
