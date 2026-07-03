import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 客户端(S3 兼容协议)
 * 服务端用:S3Client + AWS SDK
 * 浏览器端:直接通过 R2 公开 URL 或 Presigned URL,不暴露 S3Client
 */

let _r2: S3Client | null = null;

function r2(): S3Client {
  if (_r2) return _r2;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 凭据缺失(env: R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)");
  }
  _r2 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _r2;
}

function bucket(): string {
  const name = process.env.R2_BUCKET_NAME;
  if (!name) throw new Error("R2_BUCKET_NAME 缺失");
  return name;
}

/**
 * 上传对象到 R2
 * @param key 相对路径(如 "{video_id}/video.mp4")
 * @param body Buffer / Uint8Array / string
 * @param contentType MIME 类型
 */
export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<void> {
  const data = typeof body === "string" ? Buffer.from(body, "utf-8") : body;
  await r2().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: data,
      ContentType: contentType,
    })
  );
}

/** 删除对象 */
export async function deleteFromR2(key: string): Promise<void> {
  await r2().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/**
 * 开发期:返回 .r2.dev 或自定义域名公开 URL(走 Public Access)
 * 生产期:留空该函数,用 getR2PresignedUrl() 替代
 */
export function getR2PublicUrl(key: string): string {
  const base = process.env.R2_PUBLIC_URL;
  if (!base) {
    throw new Error(
      "R2_PUBLIC_URL 缺失。开发期填 .r2.dev,生产期改用 getR2PresignedUrl()"
    );
  }
  return `${base.replace(/\/$/, "")}/${bucket()}/${key}`;
}

/**
 * 生产期:生成 Presigned URL(默认 1 小时过期)
 * 不需要 Public Access,链接临时签名,过期失效
 */
export async function getR2PresignedUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  return getSignedUrl(
    r2(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn }
  );
}
