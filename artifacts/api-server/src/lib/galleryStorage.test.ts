import test from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import type { Response } from "express";
import {
  createGalleryUploadUrl, createServiceUploadUrl, deleteGalleryFile, deleteServiceFile,
  getGalleryFile, getServiceFile, imageObjectKey, imageStorageBackend, streamGalleryFile,
} from "./galleryStorage";
import { s3ImageStorage } from "./s3ImageStorage";

const id = "4e225f20-3aa9-47bd-91a8-b4898b25925d";

test("storage defaults to Replit and rejects an unknown backend", () => {
  delete process.env.OBJECT_STORAGE_BACKEND;
  assert.equal(imageStorageBackend(), "replit");
  process.env.OBJECT_STORAGE_BACKEND = "unrecognized";
  assert.throws(imageStorageBackend, /Invalid OBJECT_STORAGE_BACKEND/);
  process.env.OBJECT_STORAGE_BACKEND = "replit";
});

test("stored paths retain their collection and reject traversal or cross-collection reads", () => {
  assert.equal(imageObjectKey(`/objects/gallery/${id}`, "gallery"), `gallery/${id}`);
  assert.equal(imageObjectKey(`/objects/services/${id}`, "services"), `services/${id}`);
  for (const path of ["/objects/gallery/../private", "/objects/gallery/a/b",
    "/objects/gallery/%2Fprivate", `/objects/services/${id}`, "/objects/gallery/"]) {
    assert.throws(() => imageObjectKey(path, "gallery"), /Invalid image storage path/);
  }
});

test("Replit uploads still use the sidecar and retain existing public object paths", async () => {
  process.env.PRIVATE_OBJECT_DIR = "/test-only-bucket/private";
  const originalFetch = globalThis.fetch;
  const requests: { url: string; payload: Record<string, unknown> }[] = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), payload: JSON.parse(String(init?.body)) });
    return new globalThis.Response(JSON.stringify({ signed_url: "https://uploads.example.test/image" }));
  };
  try {
    const gallery = await createGalleryUploadUrl("image/png");
    const services = await createServiceUploadUrl("image/jpeg");
    assert.match(gallery.objectPath, /^\/objects\/gallery\/[a-f0-9-]+$/);
    assert.match(services.objectPath, /^\/objects\/services\/[a-f0-9-]+$/);
    assert.equal(gallery.uploadUrl, "https://uploads.example.test/image");
    for (const [index, result] of [gallery, services].entries()) {
      assert.equal(requests[index].url, "http://127.0.0.1:1106/object-storage/signed-object-url");
      assert.equal(requests[index].payload.bucket_name, "test-only-bucket");
      assert.equal(requests[index].payload.object_name, `private/${result.objectPath.slice(9)}`);
      assert.equal(requests[index].payload.method, "PUT");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("upload validation rejects non-images before creating a storage capability", async () => {
  await assert.rejects(createGalleryUploadUrl("text/html"), /image content type/);
  await assert.rejects(createServiceUploadUrl("application/pdf"), /image content type/);
});

test("S3 configuration fails explicitly instead of falling back to Replit or ambient AWS credentials", () => {
  delete process.env.S3_BUCKET;
  assert.throws(s3ImageStorage, /S3_BUCKET is required/);
});

test("S3 uploads sign the requested content type without an empty-body checksum", async () => {
  process.env.OBJECT_STORAGE_BACKEND = "s3";
  Object.assign(process.env, {
    S3_BUCKET: "test-only-bucket", S3_ENDPOINT: "https://storage.example.test",
    S3_REGION: "auto", S3_FORCE_PATH_STYLE: "false",
    S3_ACCESS_KEY_ID: "test-only-key", S3_SECRET_ACCESS_KEY: "test-only-secret",
  });
  for (const [create, collection] of [[createGalleryUploadUrl, "gallery"],
    [createServiceUploadUrl, "services"]] as const) {
    const result = await create("image/png");
    const url = new URL(result.uploadUrl);
    assert.equal(url.hostname, "test-only-bucket.storage.example.test");
    assert.equal(url.pathname, result.objectPath.slice("/objects".length));
    assert.match(result.objectPath, new RegExp(`^/objects/${collection}/[a-f0-9-]+$`));
    assert.equal(url.searchParams.get("X-Amz-Expires"), "900");
    assert.match(url.searchParams.get("X-Amz-SignedHeaders") ?? "", /content-type/);
    assert.ok(![...url.searchParams.keys()].some((key) => key.toLowerCase().includes("checksum")));
  }
});

test("S3 reads, streaming and deletion use only the requested key and preserve image MIME type", async () => {
  const bytes = Buffer.from("test-only-image-bytes");
  const calls: { command?: string; key?: string }[] = [];
  const storage = s3ImageStorage();
  storage.client.middlewareStack.add((_next, context) => async (args) => {
    const input = args.input as { Bucket: string; Key: string };
    assert.equal(input.Bucket, "test-only-bucket");
    calls.push({ command: context.commandName, key: input.Key });
    if (context.commandName === "GetObjectCommand") {
      return { response: {}, output: {
        $metadata: {}, ContentType: "image/webp", Body: Readable.from([bytes]),
      } };
    }
    return { response: {}, output: { $metadata: {} } };
  }, { step: "initialize", name: "testOnlyStorageTransport" });
  const headers = new Map<string, string>();
  const received: Buffer[] = [];
  const response = new Writable({
    write(chunk, _encoding, done) { received.push(Buffer.from(chunk)); done(); },
  }) as Writable & { setHeader(name: string, value: string): void };
  response.setHeader = (name, value) => { headers.set(name, value); };
  await streamGalleryFile(await getGalleryFile(`/objects/gallery/${id}`), response as unknown as Response);
  assert.deepEqual(Buffer.concat(received), bytes);
  assert.equal(headers.get("Content-Type"), "image/webp");
  assert.equal(headers.get("Cache-Control"), "public, max-age=86400");
  const service = await getServiceFile(`/objects/services/${id}`);
  service.body.destroy();
  await deleteGalleryFile(`/objects/gallery/${id}`);
  await deleteServiceFile(`/objects/services/${id}`);
  assert.deepEqual(calls, [
    { command: "GetObjectCommand", key: `gallery/${id}` },
    { command: "GetObjectCommand", key: `services/${id}` },
    { command: "DeleteObjectCommand", key: `gallery/${id}` },
    { command: "DeleteObjectCommand", key: `services/${id}` },
  ]);
});