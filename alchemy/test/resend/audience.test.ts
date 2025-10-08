import "../../src/test/vitest.ts";

import { describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { destroy } from "../../src/destroy.ts";
import { createResend } from "../../src/resend/api.ts";
import { Audience } from "../../src/resend/index.ts";
import { BRANCH_PREFIX } from "../util.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

describe("Audience", () => {
  test("create, read, update, and delete", async (scope) => {
    const ids: string[] = [];
    try {
      const a1 = await Audience("audience");
      ids.push(a1.id);
      expect(a1.id).toBeTypeOf("string");
      expect(a1.name).toBeTypeOf("string");
      expect(a1.createdAt).toBeInstanceOf(Date);

      const ref = await Audience.get({ id: a1.id });
      expect(ref).toMatchObject({
        id: a1.id,
        name: a1.name,
        createdAt: expect.any(Date),
      });
      // the API doesn't return the exact createdAt time, so we need to check that it's close
      expect(
        Math.abs(a1.createdAt.getTime() - ref.createdAt.getTime()),
      ).toBeLessThan(10_000);

      // verify that the audience is replaced, not updated
      const a2 = await Audience("audience", { name: `${BRANCH_PREFIX}-1` });
      ids.push(a2.id);
      expect(a2.id).not.toBe(a1.id);
      expect(a2.name).toBe(`${BRANCH_PREFIX}-1`);
    } finally {
      await destroy(scope);
      const resend = createResend();
      for (const id of ids) {
        const response = await resend.getAudiencesById({
          path: {
            id,
          },
          throwOnError: false,
        });
        expect(response.error).toMatchObject({
          status: 404,
        });
      }
    }
  });
});
