import "../../src/test/vitest.ts";

import { beforeAll, describe, expect } from "vitest";
import { alchemy } from "../../src/alchemy.ts";
import { destroy } from "../../src/destroy.ts";
import { createResend } from "../../src/resend/api.ts";
import { Domain } from "../../src/resend/index.ts";
import { BRANCH_PREFIX } from "../util.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});
const resend = createResend();

describe("Domain", () => {
  const name = `${BRANCH_PREFIX.replaceAll(/[^a-zA-Z0-9]/g, "")}-example.com`;

  beforeAll(async () => {
    const response = await resend.getDomains();
    const domain = response.data.data?.find((domain) => domain.name === name);
    if (domain) {
      await resend.deleteDomainsByDomainId({
        path: {
          domain_id: domain.id!,
        },
      });
    }
  });

  test("create and delete", async (scope) => {
    let domain: Domain | undefined;
    try {
      domain = await Domain("domain", {
        name,
      });
      expect(domain).toMatchObject({
        id: expect.any(String),
        name,
        status: "not_started",
        records: expect.arrayContaining([expect.any(Object)]),
        region: "us-east-1",
        openTracking: false,
        clickTracking: false,
        tls: "opportunistic",
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });

      // TODO(john): test update (currently doesn't work), replace
    } finally {
      await destroy(scope);
      if (domain) {
        const response = await resend.getDomainsByDomainId({
          path: {
            domain_id: domain.id,
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
