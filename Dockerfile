FROM node:18-alpine AS base

# 设置工作目录
WORKDIR /app

# 安装系统依赖
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# 复制 package 文件
COPY package*.json ./
COPY client/package*.json ./client/

# 开发阶段
FROM base AS development
ENV NODE_ENV=development
RUN npm ci
RUN cd client && npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# 构建阶段
FROM base AS build
ENV NODE_ENV=production

# 安装所有依赖 (包括 devDependencies)
RUN npm ci

# 复制源代码
COPY . .

# 构建客户端
RUN cd client && npm ci && npm run build

# 清理开发依赖
RUN npm ci --production && npm cache clean --force

# 生产阶段
FROM node:18-alpine AS production

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs
RUN adduser -S snowtime -u 1001

# 设置工作目录
WORKDIR /app

# 复制构建产物
COPY --from=build --chown=snowtime:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=snowtime:nodejs /app/server ./server
COPY --from=build --chown=snowtime:nodejs /app/client/dist ./client/dist
COPY --from=build --chown=snowtime:nodejs /app/package*.json ./
COPY --from=build --chown=snowtime:nodejs /app/ecosystem.config.js ./

# 创建日志目录
RUN mkdir -p logs && chown snowtime:nodejs logs

# 切换到非 root 用户
USER snowtime

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["node", "server/index.js"]