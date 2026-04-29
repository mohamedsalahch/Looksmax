import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

let cachedClient: S3Client | null = null;

function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    throw new Error(
      "R2 storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL."
    );
  }

  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

export function getR2Client() {
  if (cachedClient) return cachedClient;

  const { accountId, accessKeyId, secretAccessKey } = getR2Config();

  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return cachedClient;
}

export function getR2PublicBaseUrl() {
  return getR2Config().publicBaseUrl;
}

export function getR2Bucket() {
  return getR2Config().bucket;
}

export function getPublicUrlForKey(key: string) {
  const base = getR2PublicBaseUrl();
  return `${base}/${key.replace(/^\/+/, "")}`;
}

export function extractKeyFromPublicUrl(url: string): string | null {
  if (!url) return null;
  try {
    const base = getR2PublicBaseUrl();
    if (url.startsWith(base + "/")) {
      return url.slice(base.length + 1);
    }
  } catch {
    // Config not loaded — fall through.
  }
  return null;
}

export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const normalizedKey = key.replace(/^\/+/, "");

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: normalizedKey,
      Body: body,
      ContentType: contentType,
    })
  );

  return getPublicUrlForKey(normalizedKey);
}

export async function deleteFromR2(key: string): Promise<void> {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const normalizedKey = key.replace(/^\/+/, "");

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: normalizedKey,
    })
  );
}
