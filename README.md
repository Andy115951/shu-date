# 心有所SHU 💕

上海大学校园交友匹配网站 - V0.1

## 快速开始

### 1. 安装 Node.js
如果没有 Node.js，请先下载安装：https://nodejs.org （选择 LTS 版本）

### 2. 安装依赖
```bash
cd SHUDATE
npm install
```

### 3. 配置邮件（可选）
编辑 `.env` 文件，配置你的 SMTP 邮箱：

```
SMTP_HOST=smtp.qq.com
SMTP_PORT=587
SMTP_USER=你的QQ邮箱
SMTP_PASS=QQ邮箱授权码
FROM_EMAIL=你的QQ邮箱
```

> 如果不配置邮件，验证码会直接显示在页面上（开发模式）

### 4. 启动
```bash
npm start
```

然后打开浏览器访问 http://localhost:3000

### 5. 第一个管理员账号
注册邮箱 `admin@shu.edu.cn` 即可成为管理员，可访问 `/admin` 页面

## 功能

- ✅ @shu.edu.cn 邮箱注册
- ✅ 邮箱验证
- ✅ 填写个人问卷（年级、专业、爱好、性格标签等）
- ✅ 每周随机匹配
- ✅ 匹配结果邮件通知
- ✅ 管理后台（查看用户、手动触发匹配）

## 项目结构

```
SHUDATE/
├── app.js         # 主应用
├── database.js    # 数据库
├── mailer.js      # 邮件模块
├── package.json   # 依赖
├── .env           # 配置
├── public/        # 静态资源
│   └── css/
└── views/         # 页面模板
    ├── layout.ejs
    ├── index.ejs
    ├── register.ejs
    ├── login.ejs
    ├── verify.ejs
    ├── profile.ejs
    ├── matches.ejs
    └── admin.ejs
```

## 技术栈

- Node.js + Express
- SQLite（无需配置）
- EJS 模板
- Nodemailer 邮件

---
Made with ❤️ for SHU students