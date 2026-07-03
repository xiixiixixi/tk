// R2 Presigned URL 路径验证:PutObject + GetObject Presigned + curl fetch
// 用法: node scripts/verify-r2-presigned.js

const fs = require('fs');
const path = require('path');

// .env.local 手写解析
function loadEnv() {
  const content = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.error('❌ R2 env 字段缺失');
  process.exit(1);
}

async function fetchUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const buf = Buffer.from(await res.arrayBuffer());
    return { statusCode: res.status, body: buf, headers: Object.fromEntries(res.headers) };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });

  const key = `test/presigned-test-${Date.now()}.txt`;
  const content = 'hello presigned url test';
  const expiresIn = 3600; // 1 小时

  console.log(`🔌 R2 Presigned URL 路径验证`);
  console.log(`   Account: ${R2_ACCOUNT_ID}`);
  console.log(`   Bucket:  ${R2_BUCKET_NAME}`);
  console.log(`   Key:     ${key}`);
  console.log(`   Expires: ${expiresIn}s\n`);

  let uploadStatus = null;
  let fetchStatus = null;
  let contentBytes = 0;
  let deleteStatus = null;
  let presignedUrl = null;
  let errorMsg = null;

  try {
    // 1. PutObject 上传
    console.log('📤 Step 1: PutObjectCommand 上传测试文件');
    const putRes = await client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: content,
      ContentType: 'text/plain',
    }));
    uploadStatus = putRes.$metadata?.httpStatusCode ?? 'unknown';
    console.log(`   ✅ Upload status: ${uploadStatus}\n`);

    // 2. 生成 Presigned GET URL
    console.log('🔗 Step 2: getSignedUrl(GetObjectCommand) 生成 1h 过期 URL');
    presignedUrl = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }),
      { expiresIn }
    );
    console.log(`   URL: ${presignedUrl}\n`);

    // 3. curl fetch(用 Node https 模拟)
    console.log('🌐 Step 3: fetch Presigned URL,期望 200 + 内容匹配');
    const fetchRes = await fetchUrl(presignedUrl);
    fetchStatus = fetchRes.statusCode;
    contentBytes = fetchRes.body.length;
    const fetchedText = fetchRes.body.toString('utf-8');
    const contentMatch = fetchedText === content;

    console.log(`   Status:  ${fetchStatus}`);
    console.log(`   Bytes:   ${contentBytes}`);
    console.log(`   Body:    ${JSON.stringify(fetchedText)}`);
    console.log(`   Match:   ${contentMatch ? '✅' : '❌'}\n`);

    if (fetchStatus !== 200 || !contentMatch) {
      errorMsg = `fetch 状态码或内容不匹配`;
    }
  } catch (e) {
    errorMsg = e.message;
    console.error(`   ❌ 异常: ${e.name} ${e.message}`);
  }

  // 4. 清理
  try {
    console.log('🧹 Step 4: DeleteObjectCommand 清理测试文件');
    const delRes = await client.send(new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    }));
    deleteStatus = delRes.$metadata?.httpStatusCode ?? 'unknown';
    console.log(`   ✅ Delete status: ${deleteStatus}`);
  } catch (e) {
    console.error(`   ⚠️  清理失败: ${e.message} (key=${key},需手动删)`);
  }

  // 汇总
  console.log('\n' + '='.repeat(60));
  console.log('📊 结果汇总');
  console.log('='.repeat(60));
  console.log(`1) Presigned URL:`);
  console.log(`   ${presignedUrl || '(未生成)'}`);
  console.log(`2) 上传状态码:  ${uploadStatus}`);
  console.log(`   Fetch 状态码: ${fetchStatus}`);
  console.log(`3) 内容字节数:  ${contentBytes}`);
  console.log(`4) 整体结论:    ${errorMsg ? `❌ 失败: ${errorMsg}` : '✅ URL 路径通'}`);
  console.log(`   清理状态:    ${deleteStatus}`);

  if (errorMsg) process.exit(1);
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
