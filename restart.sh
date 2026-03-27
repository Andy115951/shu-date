#!/bin/bash

# 停止旧服务
pkill -f "node app" 2>/dev/null
sleep 1

# 启动新服务
echo "正在启动服务..."
node app.js
