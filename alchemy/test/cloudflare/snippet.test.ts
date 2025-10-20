import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { createCloudflareApi } from "../../src/cloudflare/api.ts";
import {
  deleteSnippetRules,
  updateSnippetRules,
  type SnippetRuleInput,
} from "../../src/cloudflare/snippet-rule.ts";
import {
  Snippet,
  deleteSnippet,
  getSnippet,
  getSnippetContent,
  listSnippets,
} from "../../src/cloudflare/snippet.ts";
import { findZoneForHostname } from "../../src/cloudflare/zone.ts";
import { destroy } from "../../src/destroy.ts";
import "../../src/test/vitest.ts";
import { BRANCH_PREFIX } from "../util.ts";
import { createSnippetName } from "./snippet-test-util.ts";

const ZONE_NAME = process.env.TEST_ZONE ?? process.env.ALCHEMY_TEST_DOMAIN!;
const api = await createCloudflareApi();
const zoneId = (await findZoneForHostname(api, ZONE_NAME)).zoneId;
const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

async function verifySnippetExists(snippetName: string): Promise<void> {
  const snippet = await getSnippet(api, zoneId, snippetName);
  expect(snippet.snippet_name).toEqual(snippetName);
}

async function verifySnippetDeleted(snippetName: string): Promise<void> {
  try {
    await getSnippet(api, zoneId, snippetName);
    throw new Error("Snippet should have been deleted");
  } catch (error) {
    expect(error).toBeTruthy();
  }
}

describe("Snippet Resource", () => {
  test("create, update, and delete snippet", async (scope) => {
    const snippetName = createSnippetName(`${BRANCH_PREFIX}_test_snippet`);
    let snippet: Snippet | undefined;

    try {
      snippet = await Snippet(snippetName, {
        zone: zoneId,
        name: snippetName,
        script: `
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
      expect(snippet.zoneId).toEqual(zoneId);
      expect(snippet.createdOn).toBeInstanceOf(Date);
      expect(snippet.modifiedOn).toBeInstanceOf(Date);

      await verifySnippetExists(snippetName);

      const content = await getSnippetContent(api, zoneId, snippetName);
      expect(content).toContain("X-Test-Header");
      expect(content).toContain("Hello from Snippet");

      snippet = await Snippet(snippetName, {
        zone: zoneId,
        name: snippetName,
        script: `
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

      const updatedContent = await getSnippetContent(api, zoneId, snippetName);
      expect(updatedContent).toContain("Updated Content");
      expect(updatedContent).toContain("X-Version");

      const snippets = await listSnippets(api, zoneId);
      expect(snippets.length).toBeGreaterThan(0);
      const foundSnippet = snippets.find((s) => s.snippet_name === snippetName);
      expect(foundSnippet).toBeTruthy();
    } finally {
      await destroy(scope);

      if (snippet) {
        await verifySnippetDeleted(snippet.name);
      }
    }
  });

  test("snippet with rules", async (scope) => {
    const snippet1Name = createSnippetName(`${BRANCH_PREFIX}_rule_snippet_1`);
    const snippet2Name = createSnippetName(`${BRANCH_PREFIX}_rule_snippet_2`);
    let snippet1: Snippet | undefined;
    let snippet2: Snippet | undefined;

    try {
      snippet1 = await Snippet(snippet1Name, {
        zone: zoneId,
        name: snippet1Name,
        script: `
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
        zone: zoneId,
        name: snippet2Name,
        script: `
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

      const rules: SnippetRuleInput[] = [
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

      const createdRules = await updateSnippetRules(api, zoneId, rules);
      expect(createdRules.length).toEqual(2);
      expect(createdRules[0].snippet_name).toEqual(snippet1Name);
      expect(createdRules[1].snippet_name).toEqual(snippet2Name);

      await deleteSnippetRules(api, zoneId);
    } finally {
      await destroy(scope);
    }
  });

  test("delete snippet explicitly", async (scope) => {
    const snippetName = createSnippetName(`${BRANCH_PREFIX}_delete_test`);

    try {
      const snippet = await Snippet(snippetName, {
        zone: zoneId,
        name: snippetName,
        script: `
export default {
  async fetch(request) {
    return fetch(request);
  }
}
        `.trim(),
      });

      expect(snippet.name).toEqual(snippetName);

      await verifySnippetExists(snippetName);

      await deleteSnippet(api, zoneId, snippetName);

      await verifySnippetDeleted(snippetName);
    } finally {
      await destroy(scope);
    }
  });

  test("list snippets in zone", async (scope) => {
    const snippet1Name = createSnippetName(`${BRANCH_PREFIX}_list_1`);
    const snippet2Name = createSnippetName(`${BRANCH_PREFIX}_list_2`);

    try {
      await Snippet(snippet1Name, {
        zone: zoneId,
        name: snippet1Name,
        script:
          "export default { async fetch(request) { return fetch(request); } }",
        adopt: true,
      });

      await Snippet(snippet2Name, {
        zone: zoneId,
        name: snippet2Name,
        script:
          "export default { async fetch(request) { return fetch(request); } }",
        adopt: true,
      });

      const snippets = await listSnippets(api, zoneId);
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
    const snippetName = createSnippetName(`${BRANCH_PREFIX}_adopt_test`);

    try {
      const snippet1 = await Snippet(snippetName, {
        zone: zoneId,
        name: snippetName,
        script: `
export default {
  async fetch(request) {
    const response = await fetch(request);
    response.headers.set('X-Version', '1.0');
    return response;
  }
}
        `.trim(),
        adopt: true,
      });

      expect(snippet1.name).toEqual(snippetName);

      try {
        await Snippet(`${snippetName}-2`, {
          zone: zoneId,
          name: snippetName,
          script: `
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
        zone: zoneId,
        name: snippetName,
        script: `
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

      const adoptedContent = await getSnippetContent(api, zoneId, snippetName);
      expect(adoptedContent).toContain("X-Version");
      expect(adoptedContent).toContain("2.0");
    } finally {
      await destroy(scope);
    }
  });

  test("validate snippet name throws error for invalid characters", async () => {
    const snippetName = "A@B-1.2";
    try {
      await Snippet(snippetName, {
        zone: zoneId,
        name: snippetName,
        script:
          "export default { async fetch(request) { return fetch(request); } }",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        "Snippet name must contain only lowercase letters (a-z), numbers (0-9), and underscores (_). Invalid characters found.",
      );
    }
    // Should never need to destroy scope since validation happens early and failure results in Snippet HTTP error
  });
});
