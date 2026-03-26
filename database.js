const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'shu.db');
let db = null;

// SQLite的占位符转换（PostgreSQL $1 -> ?）
function convertSQL(sql) {
  return sql.replace(/\$(\d+)/g, '?');
}

// 初始化数据库
async function initDatabase() {
  const SQL = await initSqlJs();

  let data = null;
  if (fs.existsSync(dbPath)) {
    data = fs.readFileSync(dbPath);
  }

  db = new SQL.Database(data);

  // users 表
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      verified INTEGER DEFAULT 0,
      login_code TEXT,
      login_code_expire TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // profiles 表
  db.run(`
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // matches 表
  db.run(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id_1 INTEGER NOT NULL,
      user_id_2 INTEGER NOT NULL,
      score REAL,
      matched_at TEXT DEFAULT (datetime('now')),
      week_number INTEGER,
      FOREIGN KEY (user_id_1) REFERENCES users(id),
      FOREIGN KEY (user_id_2) REFERENCES users(id)
    )
  `);

  saveDatabase();
  console.log('✅ SQLite数据库初始化完成 (本地文件: ' + dbPath + ')');
  return db;
}

// 保存数据库到文件
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

// SQL辅助函数
function prepare(sql) {
  return {
    run: function(...params) {
      try {
        db.run(convertSQL(sql), params);
        saveDatabase();
        return { changes: db.getRowsModified() };
      } catch (e) {
        console.error('SQL Error:', e.message);
        return { changes: 0 };
      }
    },
    get: function(...params) {
      try {
        const stmt = db.prepare(convertSQL(sql));
        stmt.bind(params);
        if (stmt.step()) {
          const row = stmt.getAsObject();
          stmt.free();
          return row;
        }
        stmt.free();
        return undefined;
      } catch (e) {
        console.error('SQL Error:', e.message);
        return undefined;
      }
    },
    all: function(...params) {
      try {
        const stmt = db.prepare(convertSQL(sql));
        stmt.bind(params);
        const results = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      } catch (e) {
        console.error('SQL Error:', e.message);
        return [];
      }
    }
  };
}

// 兼容方法
function query(sql, params = []) {
  return prepare(sql).all(...params);
}

function queryOne(sql, params = []) {
  return prepare(sql).get(...params);
}

function execute(sql, params = []) {
  return prepare(sql).run(...params);
}

// 初始化并返回
async function init() {
  await initDatabase();
  return { initDatabase, prepare, query, queryOne, execute };
}

module.exports = {
  initDatabase,
  prepare,
  query,
  queryOne,
  execute,
  init,
  getDb: () => db
};