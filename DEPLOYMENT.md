# SnowTime 游戏部署指南

## 部署概览

SnowTime 是一个基于 Node.js + Express + Socket.IO 的多人在线桌游，支持多种部署方式。

## 部署选项

### 1. 传统服务器部署 (推荐)
- **适用场景**: 有自己的 VPS/云服务器
- **优势**: 完全控制，成本可控
- **要求**: Node.js 18+, PM2, Nginx

### 2. 容器化部署
- **适用场景**: 支持 Docker 的环境
- **优势**: 环境一致性，易于扩展
- **要求**: Docker, Docker Compose

### 3. 云平台部署
- **适用场景**: 快速上线，无需运维
- **支持平台**: Heroku, Railway, Render, Vercel

## 系统要求

- **Node.js**: 18.0+ (推荐 LTS 版本)
- **内存**: 最小 512MB，推荐 1GB+
- **存储**: 最小 1GB 可用空间
- **网络**: 支持 WebSocket 连接

## 环境变量配置

创建 `.env` 文件配置以下变量：

```bash
# 服务器配置
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# 游戏配置
MAX_ROOMS=100
ROOM_TIMEOUT=3600000
PLAYER_TIMEOUT=300000

# 安全配置
CORS_ORIGIN=https://yourdomain.com
SESSION_SECRET=your-super-secret-key-here

# 日志配置
LOG_LEVEL=info
LOG_FILE=logs/snowtime.log

# 监控配置 (可选)
SENTRY_DSN=your-sentry-dsn
ANALYTICS_ID=your-analytics-id
```

## 部署步骤

### 步骤 1: 服务器准备

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Node.js (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 PM2 (进程管理器)
sudo npm install -g pm2

# 安装 Nginx (反向代理)
sudo apt install nginx -y

# 创建应用目录
sudo mkdir -p /var/www/snowtime
sudo chown $USER:$USER /var/www/snowtime
```

### 步骤 2: 代码部署

```bash
# 克隆代码到服务器
cd /var/www/snowtime
git clone <your-repo-url> .

# 安装依赖
npm ci --production

# 构建客户端 (如果需要)
cd client && npm ci && npm run build
cd ..

# 设置权限
chmod +x deploy/deploy.sh
```

### 步骤 3: 配置服务

```bash
# 复制环境配置
cp .env.example .env
# 编辑 .env 文件设置生产环境变量

# 启动应用
pm2 start ecosystem.config.js

# 设置开机自启
pm2 startup
pm2 save
```

### 步骤 4: 配置 Nginx

```bash
# 复制 Nginx 配置
sudo cp deploy/nginx.conf /etc/nginx/sites-available/snowtime
sudo ln -s /etc/nginx/sites-available/snowtime /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

### 步骤 5: SSL 证书 (推荐)

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx -y

# 获取 SSL 证书
sudo certbot --nginx -d yourdomain.com

# 设置自动续期
sudo crontab -e
# 添加: 0 12 * * * /usr/bin/certbot renew --quiet
```

## 监控和维护

### 日志查看
```bash
# PM2 日志
pm2 logs snowtime

# Nginx 日志
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# 应用日志
tail -f logs/snowtime.log
```

### 性能监控
```bash
# PM2 监控
pm2 monit

# 系统资源
htop
df -h
free -h
```

### 更新部署
```bash
# 使用部署脚本
./deploy/deploy.sh

# 或手动更新
git pull origin main
npm ci --production
pm2 reload snowtime
```

## 故障排除

### 常见问题

1. **端口被占用**
   ```bash
   sudo lsof -i :3000
   sudo kill -9 <PID>
   ```

2. **WebSocket 连接失败**
   - 检查 Nginx 配置中的 WebSocket 代理设置
   - 确认防火墙允许相应端口

3. **内存不足**
   ```bash
   # 增加 swap 空间
   sudo fallocate -l 1G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```

4. **PM2 进程异常**
   ```bash
   pm2 restart snowtime
   pm2 delete snowtime
   pm2 start ecosystem.config.js
   ```

## 安全建议

1. **防火墙配置**
   ```bash
   sudo ufw allow ssh
   sudo ufw allow 'Nginx Full'
   sudo ufw enable
   ```

2. **定期备份**
   - 设置自动备份脚本
   - 备份游戏数据和配置文件

3. **监控告警**
   - 配置 Sentry 错误监控
   - 设置服务器资源告警

4. **访问控制**
   - 使用强密码
   - 配置 SSH 密钥认证
   - 定期更新系统和依赖

## 扩展部署

### 负载均衡 (多实例)
```bash
# PM2 集群模式
pm2 start ecosystem.config.js --instances max

# Nginx 负载均衡配置
# 参考 deploy/nginx-cluster.conf
```

### 数据库集成 (可选)
```bash
# 如需持久化数据，可集成 Redis 或 MongoDB
npm install redis mongodb
```

## 支持

如遇到部署问题，请检查：
1. 日志文件中的错误信息
2. 系统资源使用情况
3. 网络连接状态
4. 环境变量配置

更多详细信息请参考各配置文件中的注释说明。