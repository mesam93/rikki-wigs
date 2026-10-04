import { Readable } from "node:stream";
import { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type StoredImage = { contentType: string; body: Readable };

let configuredStorage: { client: S3Client; bucket: string } | undefined;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for S3 image storage`);
  return value;
}

export function s3ImageStorage() {
  if (!configuredStorage) {
    configuredStorage = {
      bucket: required("S3_BUCKET"),
      client: new S3Client({
        endpoint: required("S3_ENDPOINT"),
        region: required("S3_REGION"),
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
        credentials: {
          accessKeyId: required("S3_ACCESS_KEY_ID"),
          secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
        },
        // A presigned PUT has no body yet. Do not sign an empty-body checksum
        // that would reject the actual image sent directly by the browser.
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      }),
    };
  }
  return configuredStorage;
}

export async function createS3ImageUpload(key: string, contentType: string) {
  const { client, bucket } = s3ImageStorage();
  return getSignedUrl(client, new PutObjectCommand({
    Bucket: bucket, Key: key, ContentType: contentType,
  }), { expiresIn: 900, signableHeaders: new Set(["content-type"]) });
}

export async function readS3Image(key: string): Promise<StoredImage> {
  const { client, bucket } = s3ImageStorage();
  const image = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!(image.Body instanceof Readable)) throw new Error("Image storage returned no readable body");
  return { contentType: image.ContentType || "image/jpeg", body: image.Body };
}

export async function deleteS3Image(key: string) {
  const { client, bucket } = s3ImageStorage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}