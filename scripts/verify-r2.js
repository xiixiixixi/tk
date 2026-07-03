// R2 连通性最小验证:S3 SDK ListObjects + curl 公共 URL
// 用法: node scripts/verify-r2.js

const fs = require('fs');
const path = require('path');
const https = require('https');

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
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error('❌ R2 env 字段缺失');
  process.exit(1);
}

async function testS3Auth() {
  const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });

  console.log('🪣 测试 1: S3 SDK ListObjects(验证 access key + secret + bucket)');
  try {
    const cmd = new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, MaxKeys: 10 });
    const res = await client.send(cmd);
    const count = res.Contents?.length ?? 0;
    console.log(`   ✅ 鉴权成功,bucket "${R2_BUCKET_NAME}" 里有 ${count} 个对象`);
    return true;
  } catch (e) {
    console.error('   ❌ 鉴权失败:', e.name, e.message);
    return false;
  }
}

async function testPublicUrl() {
  console.log('\n🌐 测试 2: 公共 URL 域名响应(确认 .r2.dev 公开可访问)');
  // fetch 一个不存在的 key,期望 404 (说明 URL 路径响应了,域名通)
  const testUrl = `${R2_PUBLIC_URL}/${R2_BUCKET_NAME}/_nonexistent_test_path_${Date.now()}.mp4`;
  return new Promise((resolve) => {
    const req = https.get(testUrl, (res) => {
      if (res.statusCode === 404) {
        console.log(`   ✅ URL 域名响应(404 = 路径不存在的正常错误,说明公开可达)`);
        console.log(`   测试 URL: ${testUrl}`);
        resolve(true);
      } else {
        console.log(`   ⚠️  HTTP ${res.statusCode} - 域名可达但不是预期 404`);
        resolve(true);
      }
    });
    req.on('error', (e) => {
      console.log(`   ❌ 域名不可达: ${e.message}`);
      resolve(false);
    });
    req.setTimeout(10000, () => {
      req.destroy();
      console.log('   ❌ 超时');
      resolve(false);
    });
  });
}

async function main() {
  console.log(`🔌 连接 R2:`);
  console.log(`   Account: ${R2_ACCOUNT_ID}`);
  console.log(`   Bucket:  ${R2_BUCKET_NAME}`);
  console.log(`   Public:  ${R2_PUBLIC_URL}\n`);

  const authOk = await testS3Auth();
  const urlOk = await testPublicUrl();

  console.log('');
  if (authOk && urlOk) {
    console.log('🎉 R2 全部连通!可以开始视频上传 + Gemini 调通了。');
  } else {
    console.log('⚠️  有问题,看上面 ↑');
    process.exit(1);
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
