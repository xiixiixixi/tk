const { SocksClient } = require('socks');
const { Client } = require('pg');
const tls = require('tls');
const fs = require('fs');
const path = require('path');

// 1) 手写 .env.local 解析(零依赖,跟 verify-tables.js / migrate-with-pat.js 保持一致)
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env.local 不存在,请先 cp .env.local.example .env.local');
  }
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

// 2) 从 NEXT_PUBLIC_SUPABASE_URL 解析出 ref,自动算出 db host(避免硬编码错 ref)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const REF = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!REF) throw new Error('NEXT_PUBLIC_SUPABASE_URL 解析不出 project ref');

const PROXY_HOST = process.env.SUPABASE_PROXY_HOST || '127.0.0.1';
const PROXY_PORT = parseInt(process.env.SUPABASE_PROXY_PORT || '7897', 10);
const PG_HOST = `db.${REF}.supabase.co`;
const PG_PORT = 5432;
const PG_USER = 'postgres';
const PG_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PG_PASSWORD) throw new Error('SUPABASE_DB_PASSWORD 未配置,请填到 .env.local');
const PG_DATABASE = 'postgres';

const sql = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'migrations', '00001_init.sql'),
  'utf-8'
);

async function main() {
  console.log('通过 SOCKS5 代理连接 Supabase...');

  // Step 1: 通过 SOCKS5 建立 TCP 连接
  const info = await SocksClient.createConnection({
    proxy: { host: PROXY_HOST, port: PROXY_PORT, type: 5 },
    command: 'connect',
    destination: { host: PG_HOST, port: PG_PORT },
  });
  console.log('TCP 连接已建立');

  // Step 2: 在 TCP 连接上建立 TLS
  const tlsSocket = tls.connect({
    socket: info.socket,
    servername: PG_HOST,
    rejectUnauthorized: false,
  });

  await new Promise((resolve, reject) => {
    tlsSocket.once('secureConnect', resolve);
    tlsSocket.once('error', reject);
  });
  console.log('TLS 握手完成');

  // Step 3: PG 客户端使用 TLS socket
  const client = new Client({
    user: PG_USER,
    password: PG_PASSWORD,
    database: PG_DATABASE,
    stream: tlsSocket,
  });

  try {
    await client.connect();
    console.log('数据库连接成功！');

    console.log('正在执行建表 SQL...');
    await client.query(sql);
    console.log('建表完成！');

    const { rows } = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('\n已创建的表：');
    rows.forEach(r => console.log(`  ✅ ${r.table_name}`));
  } catch (err) {
    console.error('❌ 错误：', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
