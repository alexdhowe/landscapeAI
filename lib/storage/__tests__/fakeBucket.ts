/**
 * An S3-compatible bucket, in process.
 *
 * Enough of the protocol for the two calls lib/storage/s3.ts makes — PUT
 * an object, GET it back — served over a loopback HTTP server so the
 * tests exercise the real signing, the real fetch and the real response
 * handling. No credentials, no network, nothing to provision: the same
 * rule the rest of the suite lives by (the store tests use a temp dir, the
 * database tests use PGlite).
 *
 * It is a fake, not a mock: it refuses an unsigned request and refuses one
 * whose x-amz-content-sha256 does not match the body it received, because
 * a signing bug that a fake happily accepted would be a bug the suite
 * cannot see.
 */
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export type BucketObject = { bytes: Buffer; contentType: string };

export type FakeBucket = {
  endpoint: string;
  bucket: string;
  objects: Map<string, BucketObject>;
  /** Every request path the bucket was asked for, in order. */
  requests: { method: string; path: string; authorized: boolean }[];
  close(): Promise<void>;
};

export async function startFakeBucket(bucket = "landscape-photos"): Promise<FakeBucket> {
  const objects = new Map<string, BucketObject>();
  const requests: FakeBucket["requests"] = [];

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const path = decodeURIComponent((req.url ?? "").split("?")[0]);
      const auth = req.headers.authorization ?? "";
      const authorized =
        auth.startsWith("AWS4-HMAC-SHA256 Credential=") &&
        auth.includes("SignedHeaders=") &&
        auth.includes("Signature=") &&
        typeof req.headers["x-amz-date"] === "string" &&
        req.headers["x-amz-content-sha256"] ===
          createHash("sha256").update(body).digest("hex");
      requests.push({ method: req.method ?? "", path, authorized });

      if (!authorized) {
        res.writeHead(403, { "Content-Type": "application/xml" });
        res.end("<Error><Code>SignatureDoesNotMatch</Code></Error>");
        return;
      }

      const prefix = `/${bucket}/`;
      if (!path.startsWith(prefix)) {
        res.writeHead(404, { "Content-Type": "application/xml" });
        res.end("<Error><Code>NoSuchBucket</Code></Error>");
        return;
      }
      const key = path.slice(prefix.length);

      if (req.method === "PUT") {
        objects.set(key, {
          bytes: body,
          contentType: String(req.headers["content-type"] ?? ""),
        });
        res.writeHead(200, { ETag: `"${createHash("md5").update(body).digest("hex")}"` });
        res.end();
        return;
      }
      if (req.method === "GET") {
        const object = objects.get(key);
        if (!object) {
          res.writeHead(404, { "Content-Type": "application/xml" });
          res.end("<Error><Code>NoSuchKey</Code></Error>");
          return;
        }
        res.writeHead(200, { "Content-Type": object.contentType });
        res.end(object.bytes);
        return;
      }
      res.writeHead(405);
      res.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    endpoint: `http://127.0.0.1:${port}`,
    bucket,
    objects,
    requests,
    close: () => closeServer(server),
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

/** Point the environment at a fake bucket. Returns a restore function. */
export function useBucket(bucket: FakeBucket): () => void {
  const before = { ...process.env };
  process.env.S3_BUCKET = bucket.bucket;
  process.env.S3_ENDPOINT = bucket.endpoint;
  process.env.S3_REGION = "auto";
  process.env.S3_ACCESS_KEY_ID = "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
  return () => {
    for (const name of [
      "S3_BUCKET",
      "S3_ENDPOINT",
      "S3_REGION",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
      "S3_PREFIX",
      "S3_FORCE_PATH_STYLE",
    ]) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
  };
}
