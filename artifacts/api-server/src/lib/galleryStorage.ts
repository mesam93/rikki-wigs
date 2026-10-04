import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Storage } from "@google-cloud/storage";
import { createS3ImageUpload, deleteS3Image, readS3Image, type StoredImage } from "./s3ImageStorage";

const SIDECAR = "http://127.0.0.1:1106";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function parsePath(value: string) {
  const parts = value.replace(/^\/+/, "").split("/");
  if (parts.length < 2) throw new Error("Invalid object storage path");
  return { bucket: parts[0], object: parts.slice(1).join("/") };
}

function privateDir() {
  const value = process.env.PRIVATE_OBJECT_DIR;
  if (!value) throw new Error("PRIVATE_OBJECT_DIR is required");
  return value.replace(/\/+$/, "");
}

type Collection = "gallery" | "services";

export function imageObjectKey(objectPath: string, collection: Collection) {
  if (!new RegExp(`^/objects/${collection}/[a-zA-Z0-9_-]+$`).test(objectPath)) {
    throw new Error("Invalid image storage path");
  }
  return objectPath.slice("/objects/".length);
}

export function imageStorageBackend() {
  const backend = process.env.OBJECT_STORAGE_BACKEND ?? "replit";
  if (backend !== "replit" && backend !== "s3") throw new Error("Invalid OBJECT_STORAGE_BACKEND");
  return backend;
}

async function createImageUploadUrl(collection: Collection, contentType: string) {
  if (!contentType.startsWith("image/")) throw new Error("An image content type is required");
  const key = `${collection}/${randomUUID()}`;
  const objectPath = `/objects/${key}`;
  if (imageStorageBackend() === "s3") {
    return { uploadUrl: await createS3ImageUpload(key, contentType), objectPath };
  }
  const fullPath = `${privateDir()}/${key}`;
  const { bucket, object } = parsePath(fullPath);
  const response = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucket,
      object_name: object,
      method: "PUT",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("Could not create upload URL");
  const payload = (await response.json()) as { signed_url: string };
  return { uploadUrl: payload.signed_url, objectPath };
}

export function createGalleryUploadUrl(contentType: string) {
  return createImageUploadUrl("gallery", contentType);
}

export function createServiceUploadUrl(contentType: string) {
  return createImageUploadUrl("services", contentType);
}

function replitFile(key: string) {
  const { bucket, object } = parsePath(`${privateDir()}/${key}`);
  return storage.bucket(bucket).file(object);
}

async function readImage(objectPath: string, collection: Collection): Promise<StoredImage> {
  const key = imageObjectKey(objectPath, collection);
  if (imageStorageBackend() === "s3") return readS3Image(key);
  const file = replitFile(key);
  const [metadata] = await file.getMetadata();
  return { contentType: metadata.contentType || "image/jpeg", body: file.createReadStream() };
}

export function getGalleryFile(objectPath: string) {
  return readImage(objectPath, "gallery");
}

export function getServiceFile(objectPath: string) {
  return readImage(objectPath, "services");
}

async function deleteImage(objectPath: string, collection: Collection) {
  const key = imageObjectKey(objectPath, collection);
  if (imageStorageBackend() === "s3") return deleteS3Image(key);
  await replitFile(key).delete();
}

export function deleteGalleryFile(objectPath: string) {
  return deleteImage(objectPath, "gallery");
}

export function deleteServiceFile(objectPath: string) {
  return deleteImage(objectPath, "services");
}

export async function streamGalleryFile(file: StoredImage, res: import("express").Response) {
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.setHeader("X-Content-Type-Options", "nosniff");
  await pipeline(file.body, res);
}