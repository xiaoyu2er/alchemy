import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { createCloudflareApi } from "../../src/cloudflare/api.ts";
import {
  listSnippetRules,
  SnippetRule,
} from "../../src/cloudflare/snippet-rule.ts";
import { Snippet } from "../../src/cloudflare/snippet.ts";
import { findZoneForHostname } from "../../src/cloudflare/zone.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";

import "../../src/test/vitest.ts";
import { createSnippetName } from "./snippet.test.ts";

const ZONE_NAME = process.env.TEST_ZONE ?? process.env.ALCHEMY_TEST_DOMAIN!;

const api = await createCloudflareApi();
const zoneId = (await findZoneForHostname(api, ZONE_NAME)).zoneId;

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe.sequential("SnippetRule Batch Resource", () => {
  test("create and delete batch of rules with explicit order", async (scope) => {
    const snippet1Name = createSnippetName(`${BRANCH_PREFIX}_batch_snippet_1`);
    const snippet2Name = createSnippetName(`${BRANCH_PREFIX}_batch_snippet_2`);
    const snippet3Name = createSnippetName(`${BRANCH_PREFIX}_batch_snippet_3`);
    const batchId = `${BRANCH_PREFIX}_batch_rules`;

    let snippet1: Snippet | undefined;
    let snippet2: Snippet | undefined;
    let snippet3: Snippet | undefined;
    let batch: SnippetRule | undefined;

    try {
      snippet1 = await Snippet(snippet1Name, {
        zone: zoneId,
        name: snippet1Name,
        script:
          "export default { async fetch(r) { return new Response('1'); } }",
        adopt: true,
      });

      snippet2 = await Snippet(snippet2Name, {
        zone: zoneId,
        name: snippet2Name,
        script:
          "export default { async fetch(r) { return new Response('2'); } }",
        adopt: true,
      });

      snippet3 = await Snippet(snippet3Name, {
        zone: zoneId,
        name: snippet3Name,
        script:
          "export default { async fetch(r) { return new Response('3'); } }",
        adopt: true,
      });

      batch = await SnippetRule(batchId, {
        zone: zoneId,
        rules: [
          {
            expression: 'http.request.uri.path eq "/first"',
            snippet: snippet1,
            description: "First handler - executes first",
          },
          {
            expression: 'http.request.uri.path eq "/second"',
            snippet: snippet2,
            description: "Second handler - executes second",
          },
          {
            expression: 'http.request.uri.path eq "/third"',
            snippet: snippet3,
            description: "Third handler - executes last",
            enabled: false,
          },
        ],
      });

      expect(batch.id).toEqual(batchId);
      expect(batch.rules).toHaveLength(3);
      expect(batch.rules[0].expression).toEqual(
        'http.request.uri.path eq "/first"',
      );
      expect(batch.rules[0].snippetName).toEqual(snippet1Name);
      expect(batch.rules[1].expression).toEqual(
        'http.request.uri.path eq "/second"',
      );
      expect(batch.rules[1].snippetName).toEqual(snippet2Name);
      expect(batch.rules[2].expression).toEqual(
        'http.request.uri.path eq "/third"',
      );
      expect(batch.rules[2].enabled).toBe(false);

      // Verify rules were created in API
      const apiRules = await listSnippetRules(api, zoneId);
      const ourRules = apiRules.filter((r) =>
        [snippet1Name, snippet2Name, snippet3Name].includes(r.snippet_name),
      );
      expect(ourRules).toHaveLength(3);

      batch = await SnippetRule(batchId, {
        zone: zoneId,
        rules: [
          {
            id: batch.rules[2].ruleId,
            expression: 'http.request.uri.path eq "/third"',
            snippet: snippet3,
            description: "Third handler - now first",
            enabled: true,
          },
          {
            id: batch.rules[0].ruleId,
            expression: 'http.request.uri.path eq "/first"',
            snippet: snippet1,
            description: "First handler - now second",
          },
          {
            id: batch.rules[1].ruleId,
            expression: 'http.request.uri.path eq "/second"',
            snippet: snippet2,
            description: "Second handler - now third",
          },
        ],
      });

      expect(batch.rules[0].expression).toEqual(
        'http.request.uri.path eq "/third"',
      );
      expect(batch.rules[0].enabled).toBe(true);
      expect(batch.rules[1].expression).toEqual(
        'http.request.uri.path eq "/first"',
      );
      expect(batch.rules[2].expression).toEqual(
        'http.request.uri.path eq "/second"',
      );
    } finally {
      await destroy(scope);

      // Verify all rules were deleted
      const finalRules = await listSnippetRules(api, zoneId);
      const remainingOurRules = finalRules.filter((r) =>
        [snippet1Name, snippet2Name, snippet3Name].includes(r.snippet_name),
      );
      expect(remainingOurRules).toHaveLength(0);
    }
  }, 180000);

  test("handles empty rules array", async (scope) => {
    const batchId = `${BRANCH_PREFIX}_empty_batch`;

    try {
      const batch = await SnippetRule(batchId, {
        zone: zoneId,
        rules: [],
      });

      expect(batch.id).toEqual(batchId);
      expect(batch.rules).toHaveLength(0);
    } finally {
      await destroy(scope);
    }
  });

  test("throws error for duplicate rule definitions", async (scope) => {
    const snippetName = createSnippetName(`${BRANCH_PREFIX}_dup_snippet`);
    const batchId = `${BRANCH_PREFIX}_dup_batch`;

    let snippet: Snippet | undefined;

    try {
      snippet = await Snippet(snippetName, {
        zone: zoneId,
        name: snippetName,
        script: "export default { async fetch(r) { return fetch(r); } }",
        adopt: true,
      });

      await expect(
        SnippetRule(batchId, {
          zone: zoneId,
          rules: [
            {
              expression: 'http.request.uri.path eq "/api"',
              snippet: snippet,
            },
            {
              expression: 'http.request.uri.path eq "/api"',
              snippet: snippet,
            },
          ],
        }),
      ).rejects.toThrow(/Duplicate rule found/);
    } finally {
      await destroy(scope);
    }
  });

  test("adoption prevents conflicts", async (scope) => {
    const snippet1Name = createSnippetName(`${BRANCH_PREFIX}_adopt_snippet_1`);
    const snippet2Name = createSnippetName(`${BRANCH_PREFIX}_adopt_snippet_2`);
    const batchId = `${BRANCH_PREFIX}_adopt_batch`;
    let snippet1: Snippet | undefined;
    let snippet2: Snippet | undefined;

    try {
      snippet1 = await Snippet(snippet1Name, {
        zone: zoneId,
        name: snippet1Name,
        script:
          "export default { async fetch(r) { return new Response('1'); } }",
        adopt: true,
      });

      snippet2 = await Snippet(snippet2Name, {
        zone: zoneId,
        name: snippet2Name,
        script:
          "export default { async fetch(r) { return new Response('2'); } }",
        adopt: true,
      });

      const batch1 = await SnippetRule(batchId, {
        zone: zoneId,
        rules: [
          {
            expression: 'http.request.uri.path eq "/first"',
            snippet: snippet1,
          },
        ],
      });

      expect(batch1.rules).toHaveLength(1);
      const firstRuleId = batch1.rules[0].ruleId;
      const batch2 = await SnippetRule(batchId, {
        zone: zoneId,
        adopt: true,
        rules: [
          {
            id: firstRuleId,
            expression: 'http.request.uri.path eq "/first"',
            snippet: snippet1,
          },
          {
            expression: 'http.request.uri.path eq "/second"',
            snippet: snippet2,
          },
        ],
      });

      expect(batch2.rules).toHaveLength(2);
      expect(batch2.rules[0].ruleId).toEqual(firstRuleId);
      expect(batch2.rules[1].snippetName).toEqual(snippet2Name);
    } finally {
      await destroy(scope);
    }
  });

  test("performance - single API call for batch", async (scope) => {
    const snippets: Snippet[] = [];
    const snippetNames: string[] = [];
    const batchId = `${BRANCH_PREFIX}_perf_batch`;

    try {
      // Create 10 snippets
      for (let i = 0; i < 10; i++) {
        const name = createSnippetName(`${BRANCH_PREFIX}_perf_snippet_${i}`);
        snippetNames.push(name);
        const snippet = await Snippet(name, {
          zone: zoneId,
          name,
          script: `export default { async fetch(r) { return new Response('${i}'); } }`,
          adopt: true,
        });
        snippets.push(snippet);
      }

      // Create batch with all 10 rules in one call
      const batch = await SnippetRule(batchId, {
        zone: zoneId,
        rules: snippets.map((snippet, i) => ({
          expression: `http.request.uri.path eq "/path${i}"`,
          snippet,
          description: `Rule ${i}`,
        })),
      });

      expect(batch.rules).toHaveLength(10);

      // Verify all rules exist
      const apiRules = await listSnippetRules(api, zoneId);
      const ourRules = apiRules.filter((r) =>
        snippetNames.includes(r.snippet_name),
      );
      expect(ourRules).toHaveLength(10);
    } finally {
      await destroy(scope);
    }
  }, 60000);

  test("update using snippet string references", async (scope) => {
    const snippet1Name = createSnippetName(`${BRANCH_PREFIX}_string_ref_1`);
    const snippet2Name = createSnippetName(`${BRANCH_PREFIX}_string_ref_2`);
    const batchId = `${BRANCH_PREFIX}_string_batch`;

    try {
      await Snippet(snippet1Name, {
        zone: zoneId,
        name: snippet1Name,
        script:
          "export default { async fetch(r) { return new Response('1'); } }",
        adopt: true,
      });

      await Snippet(snippet2Name, {
        zone: zoneId,
        name: snippet2Name,
        script:
          "export default { async fetch(r) { return new Response('2'); } }",
        adopt: true,
      });

      const batch = await SnippetRule(batchId, {
        zone: zoneId,
        rules: [
          {
            expression: 'http.request.uri.path eq "/path1"',
            snippet: snippet1Name,
          },
          {
            expression: 'http.request.uri.path eq "/path2"',
            snippet: snippet2Name,
          },
        ],
      });

      expect(batch.rules).toHaveLength(2);
      expect(batch.rules[0].snippetName).toEqual(snippet1Name);
      expect(batch.rules[1].snippetName).toEqual(snippet2Name);
    } finally {
      await destroy(scope);
    }
  });

  test("rule execution order determined by array position", async (scope) => {
    const snippet1Name = createSnippetName(`${BRANCH_PREFIX}_order_1`);
    const snippet2Name = createSnippetName(`${BRANCH_PREFIX}_order_2`);
    const snippet3Name = createSnippetName(`${BRANCH_PREFIX}_order_3`);
    const batchId = `${BRANCH_PREFIX}_order_batch`;
    let snippet1: Snippet | undefined;
    let snippet2: Snippet | undefined;
    let snippet3: Snippet | undefined;

    try {
      snippet1 = await Snippet(snippet1Name, {
        zone: zoneId,
        name: snippet1Name,
        script:
          "export default { async fetch(r) { return new Response('1'); } }",
        adopt: true,
      });

      snippet2 = await Snippet(snippet2Name, {
        zone: zoneId,
        name: snippet2Name,
        script:
          "export default { async fetch(r) { return new Response('2'); } }",
        adopt: true,
      });

      snippet3 = await Snippet(snippet3Name, {
        zone: zoneId,
        name: snippet3Name,
        script:
          "export default { async fetch(r) { return new Response('3'); } }",
        adopt: true,
      });

      const batch = await SnippetRule(batchId, {
        zone: zoneId,
        rules: [
          {
            expression: "true",
            snippet: snippet1,
            description: "Executes first",
          },
          {
            expression: "true",
            snippet: snippet2,
            description: "Executes second",
          },
          {
            expression: "true",
            snippet: snippet3,
            description: "Executes third",
          },
        ],
      });

      expect(batch.rules[0].snippetName).toEqual(snippet1Name);
      expect(batch.rules[1].snippetName).toEqual(snippet2Name);
      expect(batch.rules[2].snippetName).toEqual(snippet3Name);
    } finally {
      await destroy(scope);
    }
  });
});
