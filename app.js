const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

let dbModule;
const app = express();

// 中间件配置
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'xin_yousuo_shu_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// 登录中间件
function isLoggedIn(req, res, next) {
  if (req.session.userId) {
    const user = dbModule.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    if (user) {
      const profile = dbModule.prepare('SELECT * FROM profiles WHERE user_id = ?').get(user.id);
      req.user = { ...user, hasProfile: !!profile };
      req.isAdmin = user.email === 'admin@shu.edu.cn';
      return next();
    }
  }
  res.redirect('/login');
}

// ============ 路由 ============

// 首页
app.get('/', (req, res) => {
  let user = null;
  if (req.session.userId) {
    const u = dbModule.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
    if (u) {
      const profile = dbModule.prepare('SELECT * FROM profiles WHERE user_id = ?').get(u.id);
      user = { ...u, hasProfile: !!profile };
    }
  }
  res.render('index', {
    title: '首页',
    user: user,
    message: req.query.msg,
    messageType: req.query.type
  });
});

// 登录页 - 输入邮箱
app.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('login', { title: '登录' });
});

// 发送登录验证码
app.post('/login', async (req, res) => {
  const { email } = req.body;

  if (!email.toLowerCase().endsWith('@shu.edu.cn')) {
    return res.render('login', {
      title: '登录',
      message: '只能使用 @shu.edu.cn 结尾的学校邮箱',
      messageType: 'error',
      email
    });
  }

  // 检查用户是否存在
  let user = dbModule.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());

  // 生成登录验证码
  const loginCode = Math.random().toString(36).substring(2, 10);
  const expireTime = new Date(Date.now() + 10 * 60 * 1000);

  if (user) {
    dbModule.prepare('UPDATE users SET login_code = ?, login_code_expire = ? WHERE id = ?')
      .run(loginCode, expireTime.toISOString(), user.id);
  } else {
    // 自动注册新用户（默认已验证）
    dbModule.prepare('INSERT INTO users (email, login_code, login_code_expire, verified) VALUES (?, ?, ?, 1)')
      .run(email.toLowerCase(), loginCode, expireTime.toISOString());
    user = dbModule.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  }

  // 发送登录邮件
  const { sendLoginEmail } = require('./mailer');

  const result = await sendLoginEmail(email, loginCode);

  if (result.success) {
    res.render('login', {
      title: '登录',
      message: '验证码已发送到你的邮箱，点击邮件中的链接即可登录',
      messageType: 'success'
    });
  } else {
    // 邮件发送失败时显示验证码（开发/测试模式）
    res.render('login', {
      title: '登录',
      message: '邮件发送失败，请使用以下链接登录（测试模式）:<br>' + result.url,
      messageType: 'error'
    });
  }
});

// 验证码登录
app.get('/login/verify/:code', (req, res) => {
  const user = dbModule.prepare('SELECT * FROM users WHERE login_code = ?').get(req.params.code);

  if (!user) {
    return res.render('login', {
      title: '登录',
      message: '验证码无效或已过期',
      messageType: 'error'
    });
  }

  if (new Date(user.login_code_expire) < new Date()) {
    return res.render('login', {
      title: '登录',
      message: '验证码已过期，请重新获取',
      messageType: 'error'
    });
  }

  dbModule.prepare('UPDATE users SET login_code = NULL, login_code_expire = NULL WHERE id = ?').run(user.id);
  req.session.userId = user.id;
  res.redirect('/');
});

// 注册页（已合并到登录流程）
app.get('/register', (req, res) => {
  res.redirect('/login');
});

// 个人资料页（问卷）
app.get('/profile', isLoggedIn, (req, res) => {
  const profile = dbModule.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id);
  res.render('profile', {
    title: '填写问卷',
    user: req.user,
    profile,
    isAdmin: req.isAdmin
  });
});

// 提交问卷（完整24题，删除第6题）
app.post('/survey/submit', isLoggedIn, (req, res) => {
  const data = req.body;

  // 处理多选字段（checkbox返回数组）
  const processMultiSelect = (val) => {
    if (Array.isArray(val)) return val.join(',');
    return val || '';
  };

  // 字段列表（删除expected_graduation）
  const fields = [
    'gender', 'preferred_gender', 'purpose', 'my_grade', 'preferred_grade',
    'campus', 'cross_campus', 'height', 'preferred_height',
    'hometown', 'preferred_hometown', 'core_traits', 'long_distance',
    'communication', 'spending', 'cohabitation', 'marriage_plan', 'relationship_style',
    'sleep_schedule', 'smoke_alcohol', 'pet', 'social_public', 'social_boundary', 'interests'
  ];

  const values = {};
  fields.forEach(f => {
    if (f === 'core_traits' || f === 'interests') {
      values[f] = processMultiSelect(data[f]);
    } else {
      values[f] = data[f] || null;
    }
  });

  const existing = dbModule.prepare('SELECT id FROM profiles WHERE user_id = ?').get(req.user.id);

  if (existing) {
    const setClauses = fields.map(f => `${f} = ?`).join(', ');
    const sql = `UPDATE profiles SET ${setClauses}, updated_at = datetime('now') WHERE user_id = ?`;
    dbModule.prepare(sql).run(...fields.map(f => values[f]), req.user.id);
  } else {
    const cols = ['user_id', ...fields].join(', ');
    const placeholders = fields.map(() => '?').join(', ');
    const sql = `INSERT INTO profiles (user_id, ${cols}) VALUES (?, ${placeholders})`;
    dbModule.prepare(sql).run(req.user.id, ...fields.map(f => values[f]));
  }

  res.redirect('/?msg=问卷已保存&type=success');
});

// 旧版保存个人资料（兼容）
app.post('/profile', isLoggedIn, (req, res) => {
  res.redirect('/profile');
});

// 匹配结果页 - 显示匹配列表和分数
app.get('/matches', isLoggedIn, (req, res) => {
  if (!req.user.verified) {
    return res.render('matches', { title: '匹配结果', user: req.user });
  }

  const profile = dbModule.prepare('SELECT id FROM profiles WHERE user_id = ?').get(req.user.id);
  if (!profile) {
    return res.redirect('/profile');
  }

  // 使用MatchService计算匹配
  const matchService = require('./matchService');
  const matches = matchService.getTopMatches(req.user.id, 10);

  res.render('matches', {
    title: '匹配结果',
    user: req.user,
    matches: matches,
    isAdmin: req.isAdmin
  });
});

// API: 获取匹配列表
app.get('/api/matches', isLoggedIn, (req, res) => {
  const matchService = require('./matchService');
  const matches = matchService.findMatches(req.user.id);
  res.json({ success: true, data: matches });
});

// API: 获取前5名
app.get('/api/match/top', isLoggedIn, (req, res) => {
  const matchService = require('./matchService');
  const matches = matchService.getTopMatches(req.user.id, 5);
  res.json({ success: true, data: matches });
});

// 管理页
app.get('/admin', isLoggedIn, (req, res) => {
  if (!req.isAdmin) return res.redirect('/');

  const users = dbModule.prepare(`
    SELECT u.*, CASE WHEN p.id IS NOT NULL THEN 1 ELSE 0 END as hasProfile
    FROM users u
    LEFT JOIN profiles p ON u.id = p.user_id
    ORDER BY u.created_at DESC
  `).all();

  res.render('admin', {
    title: '管理',
    user: req.user,
    users,
    weekNumber: getWeekNumber(),
    isAdmin: true
  });
});

// 手动触发匹配
app.get('/admin/match', isLoggedIn, (req, res) => {
  if (!req.isAdmin) return res.redirect('/');
  const result = runWeeklyMatch();
  res.redirect('/admin?msg=' + encodeURIComponent(result.message) + '&type=' + (result.success ? 'success' : 'error'));
});

// 登出
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// ============ 匹配逻辑 ============

function getWeekNumber() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now - start;
  return Math.floor(diff / 604800000);
}

function runWeeklyMatch() {
  const weekNumber = getWeekNumber();
  const existing = dbModule.prepare('SELECT id FROM matches WHERE week_number = ?').get(weekNumber);
  if (existing) {
    return { success: false, message: '本周已执行匹配' };
  }

  const users = dbModule.prepare(`
    SELECT u.id, u.email, u.name
    FROM users u
    JOIN profiles p ON u.id = p.user_id
    WHERE u.verified = 1
  `).all();

  if (users.length < 2) {
    return { success: false, message: '用户数量不足，需要至少2位用户' };
  }

  const shuffled = users.sort(() => Math.random() - 0.5);
  const pairs = [];

  for (let i = 0; i < shuffled.length - 1; i += 2) {
    pairs.push([shuffled[i], shuffled[i + 1]]);
  }
  if (shuffled.length % 2 === 1 && shuffled.length > 2) {
    pairs.push([shuffled[shuffled.length - 1], shuffled[0]]);
  }

  for (const [u1, u2] of pairs) {
    dbModule.prepare('INSERT INTO matches (user_id_1, user_id_2, week_number) VALUES (?, ?, ?)')
      .run(u1.id, u2.id, weekNumber);

    const p1 = dbModule.prepare('SELECT * FROM profiles WHERE user_id = ?').get(u1.id);
    const p2 = dbModule.prepare('SELECT * FROM profiles WHERE user_id = ?').get(u2.id);

    const { sendMatchEmail } = require('./mailer');
    sendMatchEmail(u1.email, u1.name || '同学', u2.name || 'TA', p2?.grade, p2?.major);
    sendMatchEmail(u2.email, u2.name || '同学', u1.name || 'TA', p1?.grade, p1?.major);
  }

  return { success: true, message: `匹配完成，共 ${pairs.length} 对` };
}

// 初始化数据库并启动
async function start() {
  dbModule = require('./database');
  await dbModule.initDatabase();

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`
  ╔════════════════════════════════════════╗
  ║     💕 心有所SHU 服务器已启动          ║
  ║     访问: http://localhost:${PORT}           ║
  ╚════════════════════════════════════════╝
    `);
  });
}

start().catch(console.error);

module.exports = app;