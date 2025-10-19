import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { createCloudflareApi } from "../../src/cloudflare/api.ts";
import { SnippetRule } from "../../src/cloudflare/snippet-rule.ts";
import { Snippet } from "../../src/cloudflare/snippet.ts";
import { findZoneForHostname } from "../../src/cloudflare/zone.ts";
import { destroy } from "../../src/destroy.ts";
import { BRANCH_PREFIX } from "../util.ts";

import "../../src/test/vitest.ts";

const ZONE_NAME = process.env.TEST_ZONE ?? process.env.ALCHEMY_TEST_DOMAIN!;

const api = await createCloudflareApi();
const zoneId = (await findZoneForHostname(api, ZONE_NAME)).zoneId;

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

function createSnippetName(base: string): string {
  return base.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
}

describe("SnippetRule Resource", () => {
  test("create and delete snippet rule", async (scope) => {
    const snippetName = createSnippetName(`${BRANCH_PREFIX}_rule_snippet`);
    const ruleName = `${BRANCH_PREFIX}_rule_basic`;

    let snippet: Snippet | undefined;
    let rule: SnippetRule | undefined;

    try {
      snippet = await Snippet(snippetName, {
        zone: ZONE_NAME,
        name: snippetName,
        adopt: true,
        script: `
export default {
  async fetch(request) {
    const response = await fetch(request);
    response.headers.set('X-Rule-Executed', 'true');
    return response;
  }
}
        `.trim(),
      });

      expect(snippet.name).toEqual(snippetName);

      rule = await SnippetRule(ruleName, {
        zone: ZONE_NAME,
        snippet: snippet,
        expression: 'http.request.uri.path eq "/api"',
        description: "Execute snippet for API paths",
        enabled: true,
      });

      expect(rule.id).toEqual(ruleName);
      expect(rule.snippetName).toEqual(snippetName);
      expect(rule.expression).toEqual('http.request.uri.path eq "/api"');
      expect(rule.enabled).toBe(true);
      expect(rule.description).toEqual("Execute snippet for API paths");
      expect(rule.zoneId).toEqual(zoneId);
      expect(rule.ruleId).toBeTruthy();
      expect(rule.lastUpdated).toBeInstanceOf(Date);
      expect(rule.version).toBeTruthy();
    } finally {
      await destroy(scope);
    }
  });

  test("create rule with snippet name string", async (scope) => {
    const snippetName = createSnippetName(`${BRANCH_PREFIX}_rule_snippet_2`);
    const ruleName = `${BRANCH_PREFIX}_rule_string_ref`;

    let rule: SnippetRule | undefined;

    try {
      await Snippet(snippetName, {
        zone: ZONE_NAME,
        name: snippetName,
        script:
          "export default { async fetch(request) { return fetch(request); } }",
        adopt: true,
      });

      rule = await SnippetRule(ruleName, {
        zone: ZONE_NAME,
        snippet: snippetName,
        expression: 'http.request.uri.path eq "/admin"',
        description: "Admin path handler",
        enabled: true,
      });

      expect(rule.snippetName).toEqual(snippetName);
      expect(rule.expression).toEqual('http.request.uri.path eq "/admin"');
    } finally {
      await destroy(scope);
    }
  });

  test("update snippet rule", async (scope) => {
    const snippetName = createSnippetName(
      `${BRANCH_PREFIX}_rule_update_snippet`,
    );
    const ruleName = `${BRANCH_PREFIX}_rule_update`;

    let snippet: Snippet | undefined;
    let rule: SnippetRule | undefined;

    try {
      snippet = await Snippet(snippetName, {
        zone: ZONE_NAME,
        name: snippetName,
        adopt: true,
        script:
          "export default { async fetch(request) { return fetch(request); } }",
      });

      rule = await SnippetRule(ruleName, {
        zone: ZONE_NAME,
        snippet: snippet,
        expression: 'http.request.uri.path eq "/api"',
        description: "Original description",
        enabled: true,
      });

      const originalRuleId = rule.ruleId;

      expect(rule.description).toEqual("Original description");
      expect(rule.enabled).toBe(true);

      rule = await SnippetRule(ruleName, {
        zone: ZONE_NAME,
        snippet: snippet,
        expression: 'http.request.uri.path eq "/api"',
        description: "Updated description",
        enabled: true,
      });

      expect(rule.ruleId).toEqual(originalRuleId);
      expect(rule.expression).toEqual('http.request.uri.path eq "/api"');
      expect(rule.description).toEqual("Updated description");
      expect(rule.lastUpdated).toBeInstanceOf(Date);
    } finally {
      await destroy(scope);
    }
  });

  test("disable and re-enable snippet rule", async (scope) => {
    const snippetName = createSnippetName(
      `${BRANCH_PREFIX}_rule_disable_snippet`,
    );
    const ruleName = `${BRANCH_PREFIX}_rule_disable`;

    let snippet: Snippet | undefined;
    let rule: SnippetRule | undefined;

    try {
      snippet = await Snippet(snippetName, {
        zone: ZONE_NAME,
        name: snippetName,
        adopt: true,
        script:
          "export default { async fetch(request) { return fetch(request); } }",
      });

      rule = await SnippetRule(ruleName, {
        zone: ZONE_NAME,
        snippet: snippet,
        expression: 'http.request.uri.path eq "/test"',
        enabled: true,
      });

      expect(rule.enabled).toBe(true);

      rule = await SnippetRule(ruleName, {
        zone: ZONE_NAME,
        snippet: snippet,
        expression: 'http.request.uri.path eq "/test"',
        enabled: false,
      });

      expect(rule.enabled).toBe(false);

      rule = await SnippetRule(ruleName, {
        zone: ZONE_NAME,
        snippet: snippet,
        expression: 'http.request.uri.path eq "/test"',
        enabled: true,
      });

      expect(rule.enabled).toBe(true);
    } finally {
      await destroy(scope);
    }
  });

  test("create multiple rules for different snippets", async (scope) => {
    const snippet1Name = createSnippetName(`${BRANCH_PREFIX}_multi_snippet_1`);
    const snippet2Name = createSnippetName(`${BRANCH_PREFIX}_multi_snippet_2`);
    const rule1Name = `${BRANCH_PREFIX}_multi_rule_1`;
    const rule2Name = `${BRANCH_PREFIX}_multi_rule_2`;

    let snippet1: Snippet | undefined;
    let snippet2: Snippet | undefined;
    let rule1: SnippetRule | undefined;
    let rule2: SnippetRule | undefined;

    try {
      snippet1 = await Snippet(snippet1Name, {
        zone: ZONE_NAME,
        name: snippet1Name,
        script:
          "export default { async fetch(request) { return fetch(request); } }",
        adopt: true,
      });

      snippet2 = await Snippet(snippet2Name, {
        zone: ZONE_NAME,
        name: snippet2Name,
        script:
          "export default { async fetch(request) { return fetch(request); } }",
        adopt: true,
      });

      rule1 = await SnippetRule(rule1Name, {
        zone: ZONE_NAME,
        snippet: snippet1,
        expression: 'http.request.uri.path eq "/api"',
        description: "API endpoint rule",
      });

      rule2 = await SnippetRule(rule2Name, {
        zone: ZONE_NAME,
        snippet: snippet2,
        expression: 'http.request.uri.path eq "/admin"',
        description: "Admin endpoint rule",
      });

      expect(rule1.snippetName).toEqual(snippet1Name);
      expect(rule2.snippetName).toEqual(snippet2Name);
      expect(rule1.ruleId).not.toEqual(rule2.ruleId);
      expect(rule1.expression).not.toEqual(rule2.expression);
    } finally {
      await destroy(scope);
    }
  });

  test("adopt existing snippet rule", async (scope) => {
    const snippetName = createSnippetName(`${BRANCH_PREFIX}_adopt_snippet`);
    const ruleName1 = `${BRANCH_PREFIX}_adopt_rule_1`;
    const ruleName2 = `${BRANCH_PREFIX}_adopt_rule_2`;

    let snippet: Snippet | undefined;
    let rule1: SnippetRule | undefined;
    let rule2: SnippetRule | undefined;

    try {
      snippet = await Snippet(snippetName, {
        zone: ZONE_NAME,
        name: snippetName,
        adopt: true,
        script:
          "export default { async fetch(request) { return fetch(request); } }",
      });

      rule1 = await SnippetRule(ruleName1, {
        zone: ZONE_NAME,
        snippet: snippet,
        expression: 'http.request.uri.path eq "/api"',
      });

      expect(rule1.snippetName).toEqual(snippetName);

      try {
        await SnippetRule(ruleName2, {
          zone: ZONE_NAME,
          snippet: snippet,
          expression: 'http.request.uri.path eq "/api"',
        });
        throw new Error(
          "Should have thrown error for existing rule without adopt",
        );
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("already exists");
        expect((error as Error).message).toContain("adopt: true");
      }

      rule2 = await SnippetRule(ruleName2, {
        zone: ZONE_NAME,
        snippet: snippet,
        expression: 'http.request.uri.path eq "/api"',
        description: "Adopted rule",
        adopt: true,
      });

      expect(rule2.snippetName).toEqual(snippetName);
      expect(rule2.ruleId).toEqual(rule1.ruleId); // Should be same rule
      expect(rule2.description).toEqual("Adopted rule");
    } finally {
      await destroy(scope);
    }
  });

  test("snippet rule with complex expression", async (scope) => {
    const snippetName = createSnippetName(`${BRANCH_PREFIX}_complex_snippet`);
    const ruleName = `${BRANCH_PREFIX}_complex_rule`;

    let snippet: Snippet | undefined;
    let rule: SnippetRule | undefined;

    try {
      snippet = await Snippet(snippetName, {
        zone: ZONE_NAME,
        name: snippetName,
        adopt: true,
        script:
          "export default { async fetch(request) { return fetch(request); } }",
      });

      const complexExpression =
        '(http.request.uri.path eq "/api" and http.request.method eq "POST") or (http.request.headers["user-agent"] contains "Mobile")';

      rule = await SnippetRule(ruleName, {
        zone: ZONE_NAME,
        snippet: snippet,
        expression: complexExpression,
        description: "Complex multi-condition rule",
      });

      expect(rule.expression).toEqual(complexExpression);
      expect(rule.description).toEqual("Complex multi-condition rule");
    } finally {
      await destroy(scope);
    }
  });

  test("snippet rule with Zone resource object", async (scope) => {
    const snippetName = createSnippetName(`${BRANCH_PREFIX}_zone_obj_snippet`);
    const ruleName = `${BRANCH_PREFIX}_zone_obj_rule`;

    let snippet: Snippet | undefined;
    let rule: SnippetRule | undefined;

    try {
      snippet = await Snippet(snippetName, {
        zone: ZONE_NAME,
        name: snippetName,
        adopt: true,
        script:
          "export default { async fetch(request) { return fetch(request); } }",
      });

      rule = await SnippetRule(ruleName, {
        zone: { id: zoneId } as any,
        snippet: snippet,
        expression: 'http.request.uri.path eq "/test"',
      });

      expect(rule.zoneId).toEqual(zoneId);
      expect(rule.snippetName).toEqual(snippetName);
    } finally {
      await destroy(scope);
    }
  });

  test("default enabled value is true", async (scope) => {
    const snippetName = createSnippetName(
      `${BRANCH_PREFIX}_default_enabled_snippet`,
    );
    const ruleName = `${BRANCH_PREFIX}_default_enabled_rule`;

    let snippet: Snippet | undefined;
    let rule: SnippetRule | undefined;

    try {
      snippet = await Snippet(snippetName, {
        zone: ZONE_NAME,
        name: snippetName,
        adopt: true,
        script:
          "export default { async fetch(request) { return fetch(request); } }",
      });

      rule = await SnippetRule(ruleName, {
        zone: ZONE_NAME,
        snippet: snippet,
        expression: 'http.request.uri.path eq "/test"',
      });

      expect(rule.enabled).toBe(true);
    } finally {
      await destroy(scope);
    }
  });
});
