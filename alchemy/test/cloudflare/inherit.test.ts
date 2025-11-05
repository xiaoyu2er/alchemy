import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { Ai } from "../../src/cloudflare/ai.ts";
import { Inherit } from "../../src/cloudflare/inherit.ts";
import { Worker } from "../../src/cloudflare/worker.ts";
import { destroy } from "../../src/destroy.ts";
import { fetchAndExpectOK } from "../../src/util/safe-fetch.ts";
import { BRANCH_PREFIX } from "../util.ts";

import "../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Inherit Resource Binding", () => {
  test("create a worker and inherit its binding in another worker", async (scope) => {
    const workerName = `${BRANCH_PREFIX}-original-worker`;

    const value = "testing-value";

    try {
      await Worker(workerName, {
        name: workerName,
        adopt: true,
        script: `
          export default {
            async fetch(request, env) {
              return new Response(env.test);
            }
          }
        `,
        bindings: {
          TEST: value,
        },
      });

      const inheritWorker = await Worker(workerName, {
        name: workerName,
        adopt: true,
        script: `
          export default {
            async fetch(request, env) {
              return new Response(env.TEST);
            }
          }
        `,
        bindings: {
          TEST: Inherit(),
        },
      });

      const response = await fetchAndExpectOK(inheritWorker.url!);
      const body = await response.text();
      expect(body).toBe(value);
    } finally {
      await destroy(scope);
    }
  });
});
