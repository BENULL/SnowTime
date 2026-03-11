# SnowTime 游戏部署清单

## 🚀 快速部署

### 方式一：Docker 部署 (推荐)
```bash
# 1. 克隆项目
git clone <your-repo-url>
cd snowtime

# 2. 快速启动
./deploy/quick-start.sh production

# 3. 访问游戏
# http://localhost:3000
```

### 方式二：传统部署
```bash
# 1. 运行部署脚本
./deploy/deploy.sh production main

# 2. 检查服务状态
pm2 status
```

## 📋 部署前检查清单

### 系统要求
- [ ] Node.js 18+ 已安装
- [ ] Docker & Docker Compose 已安装 (Docker 部署)
- [ ] PM2 已安装 (传统部署)
- [ ] Nginx 已安装并配置
- [ ] SSL 证书已配置 (生产环境)

### 配置文件
- [ ] 复制并配置 `.env.production`
- [ ] 更新 `ecosystem.config.js` 中的部署配置
- [ ] 配置 `deploy/nginx.conf` 中的域名
- [ ] 设置 Redis 配置 (如果使用)

### 安全设置
- [ ] 更改默认密码和密钥
- [ ] 配置防火墙规则
- [ ] 设置 SSL/TLS 证书
- [ ] 配置访问控制

## 🔧 部署脚本说明

| 脚本 | 用途 | 使用方法 |
|------|------|----------|
| `deploy.sh` | 自动化部署 | `./deploy.sh [环境] [分支]` |
| `quick-start.sh` | Docker 快速启动 | `./quick-start.sh [环境]` |
| `monitor.sh` | 服务监控 | `./monitor.sh [check\|fix\|report\|watch]` |
| `backup.sh` | 数据备份 | `./backup.sh [backup\|restore\|list]` |

## 📁 配置文件说明

| 文件 | 用途 |
|------|------|
| `ecosystem.config.js` | PM2 进程管理配置 |
| `docker-compose.yml` | 生产环境 Docker 配置 |
| `docker-compose.dev.yml` | 开发环境 Docker 配置 |
| `deploy/nginx.conf` | Nginx 反向代理配置 |
| `deploy/redis.conf` | Redis 缓存配置 |
| `.env.production` | 生产环境变量 |
| `.env.staging` | 测试环境变量 |
| `.env.development` | 开发环境变量 |

## 🌐 环境配置

### 生产环境
```bash
# 启动生产环境
./deploy/quick-start.sh production

# 或使用传统部署
./deploy/deploy.sh production main
```

### 测试环境
```bash
# 启动测试环境
./deploy/quick-start.sh staging

# 或使用传统部署
./deploy/deploy.sh staging develop
```

### 开发环境
```bash
# 启动开发环境
./deploy/quick-start.sh development

# 或直接运行
npm run dev
```

## 📊 监控和维护

### 服务监控
```bash
# 检查服务状态
./deploy/monitor.sh check

# 持续监控
./deploy/monitor.sh watch

# 生成监控报告
./deploy/monitor.sh report
```

### 日志查看
```bash
# PM2 日志
pm2 logs snowtime

# Docker 日志
docker-compose logs -f snowtime

# Nginx 日志
sudo tail -f /var/log/nginx/snowtime_access.log
```

### 性能优化
```bash
# PM2 监控面板
pm2 monit

# 系统资源监控
htop
df -h
free -h
```

## 💾 备份和恢复

### 创建备份
```bash
# 创建完整备份
./deploy/backup.sh backup

# 列出所有备份
./deploy/backup.sh list
```

### 恢复备份
```bash
# 恢复指定备份
./deploy/backup.sh restore snowtime-backup-20240311-120000

# 验证备份完整性
./deploy/backup.sh verify snowtime-backup-20240311-120000
```

## 🔒 安全建议

### 服务器安全
- 使用非 root 用户运行应用
- 配置防火墙规则
- 定期更新系统和依赖
- 使用强密码和 SSH 密钥

### 应用安全
- 设置复杂的 SESSION_SECRET
- 配置 CORS 白名单
- 启用 HTTPS
- 设置请求频率限制

### 数据安全
- 定期备份数据
- 加密敏感配置
- 监控异常访问
- 设置访问日志

## 🚨 故障排除

### 常见问题

1. **服务无法启动**
   ```bash
   # 检查端口占用
   sudo lsof -i :3000

   # 检查日志
   pm2 logs snowtime
   ```

2. **WebSocket 连接失败**
   ```bash
   # 检查 Nginx 配置
   sudo nginx -t

   # 重启 Nginx
   sudo systemctl restart nginx
   ```

3. **内存不足**
   ```bash
   # 增加 swap 空间
   sudo fallocate -l 1G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```

4. **数据库连接失败**
   ```bash
   # 检查 Redis 状态
   redis-cli ping

   # 重启 Redis
   sudo systemctl restart redis
   ```

### 紧急恢复
```bash
# 快速回滚到上一个版本
./deploy/backup.sh restore $(./deploy/backup.sh list | tail -1)

# 重启所有服务
pm2 restart all
sudo systemctl restart nginx
```

## 📞 技术支持

如遇到部署问题，请按以下步骤排查：

1. 检查系统要求是否满足
2. 查看错误日志定位问题
3. 参考故障排除指南
4. 检查网络和防火墙配置
5. 验证配置文件正确性

更多详细信息请参考 `DEPLOYMENT.md` 文档。