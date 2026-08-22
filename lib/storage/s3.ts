/**
 * The S3-compatible backend — project-map section 3's photo storage
 * (R2, Supabase Storage, MinIO, S3 itself).
 *
 * Signed with SigV4 over `fetch` rather than an SDK. Two calls are needed
 * (PUT an object, GET it back), the signing is ~60 lines of node:crypto,
 * and an SDK would be the largest dependency in the tree for it. If this
 * grows a third and fourth call — lifecycle, multipart, presigning — that
 * trade flips.
 *
 * The bucket is **private**. Nothing here hands a browser an object URL;
 * every read goes back through the app's own photo route, which is where
 * the access decision lives (lib/storage/index.ts).
 *
 * Server-only.
 */
import { createHash, createHmac } from "node:crypto";

import { S3_SCHEME, isSafeKey } from "./locator";
import {
  StorageBackendError,
  StorageConfigError,
  type PhotoObjectBackend,
} from "./types";

export type S3Config = {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Prefix every key, for a bucket shared with something else. */
  prefix: string;
  /** `<endpoint>/<bucket>/<key>` rather than `<bucket>.<host>/<key>`. */
  pathStyle: boolean;
};

const REQUIRED = [
  "S3_BUCKET",
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const;

/** Every S3_* variable, so a stray one still counts as "meant to configure". */
const ALL_VARS = [...REQUIRED, "S3_REGION", "S3_PREFIX", "S3_FORCE_PATH_STYLE"];

/**
 * Read the bucket configuration, or null when none was attempted.
 *
 * Half-configured is an error, never a silent fall back to local bytes: a
 * deployment that meant to write customer photos to R2 and is quietly
 * filling its own database instead looks fine until it doesn't.
 */
export function readS3Config(
  env: Record<string, string | undefined> = process.env,
): S3Config | null {
  const present = ALL_VARS.filter((name) => (env[name] ?? "").trim().length > 0);
  if (present.length === 0) return null;

  const missing = REQUIRED.filter((name) => (env[name] ?? "").trim().length === 0);
  if (missing.length > 0) {
    throw new StorageConfigError(
      `Object storage is half-configured: ${present.join(", ")} set, ` +
        `${missing.join(", ")} missing. Set all of ${REQUIRED.join(", ")} ` +
        `or none of them (photos then stay in this deployment).`,
    );
  }

  const endpoint = env.S3_ENDPOINT!.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(endpoint)) {
    throw new StorageConfigError(
      `S3_ENDPOINT must be an http(s) URL, got "${endpoint}"`,
    );
  }

  return {
    bucket: env.S3_BUCKET!.trim(),
    endpoint,
    region: (env.S3_REGION ?? "auto").trim() || "auto",
    accessKeyId: env.S3_ACCESS_KEY_ID!.trim(),
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!.trim(),
    prefix: (env.S3_PREFIX ?? "").trim().replace(/^\/+|\/+$/g, ""),
    // Path style by default: it is what R2, Supabase Storage and MinIO all
    // accept, and virtual-hosted style needs DNS the endpoint may not have.
    pathStyle: (env.S3_FORCE_PATH_STYLE ?? "true").trim().toLowerCase() !== "false",
  };
}

const sha256Hex = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");

const hmac = (key: Buffer | string, data: string) =>
  createHmac("sha256", key).update(data, "utf8").digest();

/** RFC 3986, and `/` is a path separator so it survives. */
function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join("/");
}

type SignedRequest = { url: string; headers: Record<string, string> };

/**
 * AWS Signature Version 4, over the headers we actually send. No query
 * signing: presigning is only worth having once a browser is allowed to
 * talk to the bucket, and it deliberately is not.
 */
export function signRequest(
  config: S3Config,
  method: "GET" | "PUT",
  objectPath: string,
  payload: Buffer,
  extraHeaders: Record<string, string> = {},
  now = new Date(),
): SignedRequest {
  const base = new URL(config.endpoint);
  const host = config.pathStyle ? base.host : `${config.bucket}.${base.host}`;
  const basePath = base.pathname.replace(/\/+$/, "");
  const canonicalPath = encodePath(
    config.pathStyle
      ? `${basePath}/${config.bucket}/${objectPath}`
      : `${basePath}/${objectPath}`,
  );

  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(payload);

  const headers: Record<string, string> = {
    ...extraHeaders,
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };

  const canonicalHeaderNames = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort();
  const lowered = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()]),
  );
  const canonicalHeaders = canonicalHeaderNames
    .map((name) => `${name}:${lowered[name]}\n`)
    .join("");
  const signedHeaders = canonicalHeaderNames.join(";");

  const canonicalRequest = [
    method,
    canonicalPath,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, dateStamp), config.region), "s3"),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign, "utf8")
    .digest("hex");

  headers.Authorization =
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { url: `${base.protocol}//${host}${canonicalPath}`, headers };
}

export type S3BackendOptions = {
  /** Injectable so the tests can answer as a bucket without one existing. */
  fetchImpl?: typeof fetch;
};

export function createS3Backend(
  config: S3Config,
  { fetchImpl = fetch }: S3BackendOptions = {},
): PhotoObjectBackend {
  const objectPath = (key: string): string => {
    if (!isSafeKey(key)) {
      throw new StorageBackendError(`Refusing to resolve unsafe photo key "${key}"`);
    }
    return config.prefix ? `${config.prefix}/${key}` : key;
  };

  return {
    name: "s3",
    scheme: S3_SCHEME,

    async put(key, bytes, mediaType) {
      const signed = signRequest(config, "PUT", objectPath(key), bytes, {
        "content-type": mediaType,
        // Deliberately absent: any x-amz-acl. The bucket is private and
        // an object that made itself public would defeat the point.
      });
      const response = await fetchImpl(signed.url, {
        method: "PUT",
        headers: signed.headers,
        body: new Uint8Array(bytes),
      });
      if (!response.ok) {
        throw new StorageBackendError(
          `Photo upload failed: ${response.status} ${await safeText(response)}`,
        );
      }
    },

    async get(key) {
      const signed = signRequest(config, "GET", objectPath(key), Buffer.alloc(0));
      const response = await fetchImpl(signed.url, {
        method: "GET",
        headers: signed.headers,
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new StorageBackendError(
          `Photo read failed: ${response.status} ${await safeText(response)}`,
        );
      }
      return Buffer.from(await response.arrayBuffer());
    },
  };
}

/** A bucket's error body is XML and may be huge; keep the useful head of it. */
async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return "";
  }
}
