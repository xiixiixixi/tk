// 通过 Supabase Management API (PAT) 跑建表 SQL
// 不走 SOCKS5 代理,纯 HTTPS,直连 https://api.supabase.com

const fs = require('fs');
const path = require('path');

// 手写 .env.local 解析(零依赖)
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2];
    }
  }
}
loadEnv();

const PAT = process.env.SUPABASE_PAT;
const REF = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

if (!PAT) {
  console.error('❌ .env.local 缺少 SUPABASE_PAT');
  process.exit(1);
}
if (!REF) {
  console.error('❌ .env.local 的 NEXT_PUBLIC_SUPABASE_URL 解析不出 project ref');
  process.exit(1);
}

const SQL_PATH = path.join(__dirname, '..', 'supabase', 'migrations', '00001_init.sql');
const sql = fs.readFileSync(SQL_PATH, 'utf-8');

async function runQuery(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PAT}`,
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function main() {
  console.log(`🔌 连接 Supabase Management API (project: ${REF})`);

  console.log('\n📋 步骤 1/2: 跑建表 SQL');
  try {
    const result = await runQuery(sql);
    console.log('   ✅ SQL 执行完成');
    if (Array.isArray(result) && result.length) {
      console.log(`   返回 ${result.length} 条结果(可能来自 SELECT 类语句)`);
    }
  } catch (e) {
    console.error('   ❌ 失败:', e.message);
    // 如果是"已存在"类的错误,降级到只查表
    if (/already exists|duplicate/i.test(e.message)) {
      console.log('   ⚠️  检测到表已存在,继续验证');
    } else {
      process.exit(1);
    }
  }

  console.log('\n📋 步骤 2/2: 列出现有表');
  const tables = await runQuery(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);

  if (!Array.isArray(tables) || tables.length === 0) {
    console.log('   ⚠️  public schema 下没有表');
    process.exit(1);
  }

  console.log('   已建的表:');
  for (const row of tables) {
    console.log(`     ✅ ${row.table_name}`);
  }

  const expected = ['videos', 'video_assets', 'analysis_results', 'creators', 'keywords', 'tasks'];
  const actual = new Set(tables.map(r => r.table_name));
  const missing = expected.filter(t => !actual.has(t));

  console.log('');
  if (missing.length === 0) {
    console.log('🎉 6 张表全部建好!');
  } else {
    console.log(`⚠️  缺失 ${missing.length} 张: ${missing.join(', ')}`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('❌ 异常:', e.message);
  process.exit(1);
});
