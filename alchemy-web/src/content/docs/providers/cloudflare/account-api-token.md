---
title: AccountApiToken
description: Learn how to create and manage Cloudflare Account API Tokens using Alchemy for secure access to the Cloudflare API and R2 storage.
---

Creates a [Cloudflare API Token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) with specified permissions and access controls. Account API Tokens are the primary way to generate S3-compatible credentials for R2 storage, enabling pre-signed URLs and direct S3 API access.

## Minimal Example

Create a basic API token with read-only permissions for zones.

```ts
import { AccountApiToken } from "alchemy/cloudflare";

const token = await AccountApiToken("readonly-token", {
  name: "Readonly Zone Token",
  policies: [
    {
      effect: "allow",
      permissionGroups: ["Zone Read", "Analytics Read"],
      resources: {
        "com.cloudflare.api.account.zone.*": "*",
      },
    },
  ],
});
```

## R2 Bucket with Pre-Signed URLs

Create an API token for R2 bucket access and use it to generate pre-signed URLs. This is the recommended way to provide temporary access to R2 objects.

```ts
import { AccountApiToken, R2Bucket } from "alchemy/cloudflare";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Create R2 bucket
const bucket = await R2Bucket("my-bucket", {
  name: "my-bucket",
});

// Create API token with R2 permissions
const r2Token = await AccountApiToken("r2-access-token", {
  name: "R2 Access Token",
  policies: [
    {
      effect: "allow",
      permissionGroups: [
        "Workers R2 Storage Read",
        "Workers R2 Storage Write",
      ],
      resources: {
        [`com.cloudflare.edge.r2.bucket.${process.env.CLOUDFLARE_ACCOUNT_ID}_${bucket.jurisdiction ?? "default"}_${bucket.name}`]:
          "*",
      },
    },
  ],
});

// Configure S3 client with the token
const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: r2Token.accessKeyId.unencrypted,
    secretAccessKey: r2Token.secretAccessKey.unencrypted,
  },
});

// Generate a pre-signed URL for an object
const command = new GetObjectCommand({
  Bucket: bucket.name,
  Key: "path/to/file.pdf",
});

const signedUrl = await getSignedUrl(s3Client, command, {
  expiresIn: 3600, // URL expires in 1 hour
});

console.log("Pre-signed URL:", signedUrl);
```

## R2 Storage in Worker

Bind an R2 bucket directly to a Worker for runtime access, and use an API token for generating pre-signed URLs from within the Worker.

```ts
import { Worker, AccountApiToken, R2Bucket } from "alchemy/cloudflare";

const bucket = await R2Bucket("storage", {
  name: "my-storage",
});

const r2Token = await AccountApiToken("r2-token", {
  name: "R2 Token for Signed URLs",
  policies: [
    {
      effect: "allow",
      permissionGroups: ["Workers R2 Storage Read"],
      resources: {
        [`com.cloudflare.edge.r2.bucket.${process.env.CLOUDFLARE_ACCOUNT_ID}_default_${bucket.name}`]:
          "*",
      },
    },
  ],
});

await Worker("file-server", {
  name: "file-server",
  bindings: {
    BUCKET: bucket,
    R2_ACCESS_KEY_ID: r2Token.accessKeyId,
    R2_SECRET_ACCESS_KEY: r2Token.secretAccessKey,
  },
  script: `
    import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
    import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
    
    export default {
      async fetch(request, env) {
        // Generate pre-signed URL
        const s3 = new S3Client({
          region: "auto",
          endpoint: "https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com",
          credentials: {
            accessKeyId: env.R2_ACCESS_KEY_ID,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY,
          },
        });
        
        const command = new GetObjectCommand({
          Bucket: "my-storage",
          Key: "file.pdf",
        });
        
        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        
        return Response.json({ url: signedUrl });
      }
    }
  `,
});
```

## With Time and IP Restrictions

Create a token with time-based and IP address restrictions for enhanced security.

```ts
import { AccountApiToken } from "alchemy/cloudflare";

const restrictedToken = await AccountApiToken("restricted-token", {
  name: "Restricted Access Token",
  policies: [
    {
      effect: "allow",
      permissionGroups: ["Worker Routes Edit"],
      resources: {
        "com.cloudflare.api.account.worker.route.*": "*",
      },
    },
  ],
  notBefore: "2024-01-01T00:00:00Z",
  expiresOn: "2024-12-31T23:59:59Z",
  condition: {
    requestIp: {
      in: ["192.168.1.0/24"],
      notIn: ["192.168.1.100/32"],
    },
  },
});
```

## Account-Level Permissions

Create a token with broad account-level permissions for R2 storage operations.

```ts
import { AccountApiToken } from "alchemy/cloudflare";

const accountToken = await AccountApiToken("account-access-token", {
  name: "Account R2 Token",
  policies: [
    {
      effect: "allow",
      permissionGroups: ["Workers R2 Storage Write", "Workers R2 Storage Read"],
      resources: {
        "com.cloudflare.api.account": "*",
      },
    },
  ],
});
```

## Understanding Access Credentials

The `AccountApiToken` resource provides S3-compatible credentials through two properties:

- **`accessKeyId`**: The token's ID, used as the AWS access key ID
- **`secretAccessKey`**: A SHA-256 hash of the token value, used as the AWS secret access key

These credentials work with any S3-compatible client library, including the AWS SDK.

```ts
const token = await AccountApiToken("my-token", {
  name: "My Token",
  policies: [
    /* ... */
  ],
});

// Use with S3 SDK
console.log("Access Key ID:", token.accessKeyId.unencrypted);
console.log("Secret Access Key:", token.secretAccessKey.unencrypted);
```

## Important Notes

:::tip[Pre-signed URLs]
Pre-signed URLs are the recommended way to provide temporary access to R2 objects. They're more secure than public access and work with existing S3 tooling.
:::

:::caution[API Token Requirements]
Creating Account API Tokens programmatically requires either:

- A Global API Key
- An API Token with permission to create other API Tokens

See the [Cloudflare setup guide](/guides/cloudflare/#api-token) for more details.
:::

:::note[Resource Naming]
When specifying R2 bucket resources, use the format:
`com.cloudflare.edge.r2.bucket.{accountId}_{jurisdiction}_{bucketName}`

For buckets without a jurisdiction, use `default` as the jurisdiction value.
:::
