const { Pool } = require('pg');
const dns = require('dns').promises;
require('dotenv').config();

// 强制使用IPv4解析
dns.setDefaultResultOrder('ipv4');

// 获取数据库配置
async function getPoolConfig() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL not set');
  }

  // 解析连接字符串
  const url = new URL(connectionString);
  let host = url.hostname;

  // 尝试解析为IPv4地址
  try {
    const addresses = await dns.resolve4(host);
    if (addresses && addresses.length > 0) {
      host = addresses[0];
      console.log(`Resolved ${url.hostname} to IPv4: ${host}`);
    }
  } catch (e) {
    console.log('DNS resolution failed, using original hostname');
  }

  // 提取端口（默认5432）
  const port = parseInt(url.port) || 5432;

  return {
    host: host,
    port: port,
    database: url.pathname.substring(1) || 'postgres',
    user: url.username,
    password: url.password,
    ssl: {
      rejectUnauthorized: false
    },
    family: 4,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000
  };
}

let pool = null;

// 获取连接池
async function getPool() {
  if (!pool) {
    const config = await getPoolConfig();
    pool = new Pool(config);
    console.log('数据库配置:', {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user ? '已设置' : '未设置'
    });
  }
  return pool;
}

// 初始化数据库表
async function initDatabase() {
  const p = await getPool();
  const client = await p.connect();
  try {
    // users 表
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        verified INTEGER DEFAULT 0,
        login_code TEXT,
        login_code_expire TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // profiles 表
    await client.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE NOT NULL,
        gender TEXT,
        preferred_gender TEXT,
        purpose TEXT,
        my_grade TEXT,
        preferred_grade TEXT,
        campus TEXT,
        cross_campus TEXT,
        height TEXT,
        preferred_height TEXT,
        hometown TEXT,
        preferred_hometown TEXT,
        core_traits TEXT,
        long_distance TEXT,
        communication TEXT,
        spending TEXT,
        cohabitation TEXT,
        marriage_plan TEXT,
        relationship_style TEXT,
        sleep_schedule TEXT,
        smoke_alcohol TEXT,
        pet TEXT,
        social_public TEXT,
        social_boundary TEXT,
        interests TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // matches 表
    await client.query(`
      CREATE TABLE IF NOT EXISTS matches (
        id SERIAL PRIMARY KEY,
        user_id_1 INTEGER NOT NULL,
        user_id_2 INTEGER NOT NULL,
        score REAL,
        matched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        week_number INTEGER,
        FOREIGN KEY (user_id_1) REFERENCES users(id),
        FOREIGN KEY (user_id_2) REFERENCES users(id)
      )
    `);

    console.log('✅ Supabase数据库初始化完成');
  } catch (error) {
    console.error('数据库初始化失败:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// 确保数据库就绪
let ready = false;
const pendingQueries = [];

async function ensureReady() {
  if (ready) return;
  return new Promise((resolve) => {
    pendingQueries.push({ resolve });
  });
}

// SQL辅助函数
async function query(sql, params = []) {
  await ensureReady();
  const p = await getPool();
  const result = await p.query(sql, params);
  return result.rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0];
}

async function execute(sql, params = []) {
  await ensureReady();
  const p = await getPool();
  const result = await p.query(sql, params);
  return { changes: result.rowCount || 0 };
}

// 兼容旧API（返回带有then的对象）
function prepare(sql) {
  const p = getPool();
  return {
    run: async function(...params) {
      const pool = await p;
      const result = await pool.query(sql, params);
      return { changes: result.rowCount || 0 };
    },
    get: async function(...params) {
      const pool = await p;
      const result = await pool.query(sql, params);
      return result.rows[0];
    },
    all: async function(...params) {
      const pool = await p;
      const result = await pool.query(sql, params);
      return result.rows;
    }
  };
}

// 初始化并标记就绪
async function init() {
  await initDatabase();
  ready = true;
  for (const q of pendingQueries) {
    q.resolve();
  }
  pendingQueries.length = 0;
  return { initDatabase, prepare, query, queryOne, execute };
}

module.exports = {
  initDatabase,
  prepare,
  query,
  queryOne,
  execute,
  init,
  getPool
};