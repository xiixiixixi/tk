// 验证 Supabase 里 6 张表是否都已建好
// 用法: node scripts/verify-tables.js
// 不需要代理,只走 HTTPS,需要 .env.local 里的 SERVICE_ROLE_KEY

const fs = require('fs');
const path = require('path');

// 1. 手写解析 .env.local(不引 dotenv 依赖,保持零依赖)
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env.local 不存在');
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2];
    }
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ .env.local 缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const EXPECTED_TABLES = [
  'videos',
  'video_assets',
  'analysis_results',
  'creators',
  'keywords',
  'tasks',
];

async function checkTable(name) {
  const url = `${SUPABASE_URL}/rest/v1/${name}?select=id&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  // 200 = 表存在;404/400 = 表不存在
  return res.status === 200;
}

async function main() {
  console.log(`🔍 验证 Supabase: ${SUPABASE_URL}\n`);

  const results = await Promise.all(EXPECTED_TABLES.map(async (t) => [t, await checkTable(t)]));
  let allOk = true;

  for (const [t, ok] of results) {
    console.log(`  ${ok ? '✅' : '❌'}  ${t}`);
    if (!ok) allOk = false;
  }

  console.log('');
  if (allOk) {
    console.log('🎉 6 张表都建好了!可以开始跑业务代码。');
  } else {
    console.log('⚠️  有表缺失。请到 Supabase Dashboard → SQL Editor 跑 migrations/00001_init.sql');
  }
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error('❌ 异常:', e.message);
  process.exit(1);
});
