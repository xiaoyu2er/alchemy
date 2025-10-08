import "../../src/test/vitest.ts";

import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { destroy } from "../../src/destroy.ts";
import { createResend } from "../../src/resend/api.ts";
import { ApiKey } from "../../src/resend/index.ts";
import { BRANCH_PREFIX } from "../util.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("ApiKey", () => {
  test("create, update, and delete", async (scope) => {
    const ids: string[] = [];
    try {
      const a1 = await ApiKey("api-key");
      ids.push(a1.id);
      expect(a1.id).toBeTypeOf("string");
      expect(a1.name).toBeTypeOf("string");
      expect(a1.permission).toBe("full_access");
      expect(a1.token.unencrypted).toBeTypeOf("string");
      expect(a1.createdAt).toBeInstanceOf(Date);

      // verify that the key is replaced, not updated
      const a2 = await ApiKey("api-key", { permission: "sending_access" });
      ids.push(a2.id);
      expect(a2.id).not.toBe(a1.id);
      expect(a2.name).toBe(a1.name);
      expect(a2.permission).toBe("sending_access");
    } finally {
      await destroy(scope);
      await assertApiKeysDeleted(ids);
    }
  });
});

async function assertApiKeysDeleted(ids: string[]) {
  const resend = createResend();
  const response = await resend.getApiKeys();
  for (const id of ids) {
    const key = response.data.data?.find((k) => k.id === id);
    expect(key).not.toBeDefined();
  }
}
