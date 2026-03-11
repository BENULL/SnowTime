#!/bin/bash

# SnowTime 游戏自动部署脚本
# 使用方法: ./deploy.sh [环境] [分支]
# 示例: ./deploy.sh production main

set -e  # 遇到错误立即退出

# 配置变量
ENVIRONMENT=${1:-production}
BRANCH=${2:-main}
APP_NAME="snowtime"
APP_DIR="/var/www/snowtime"
BACKUP_DIR="/var/backups/snowtime"
LOG_FILE="/var/log/snowtime-deploy.log"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" >> $LOG_FILE
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    echo "[ERROR] $1" >> $LOG_FILE
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARN] $1${NC}"
    echo "[WARN] $1" >> $LOG_FILE
}

info() {
    echo -e "${BLUE}[INFO] $1${NC}"
    echo "[INFO] $1" >> $LOG_FILE
}

# 检查权限
check_permissions() {
    if [[ $EUID -eq 0 ]]; then
        error "请不要使用 root 用户运行此脚本"
    fi

    if [ ! -w "$APP_DIR" ]; then
        error "没有应用目录的写权限: $APP_DIR"
    fi
}

# 检查依赖
check_dependencies() {
    log "检查系统依赖..."

    command -v node >/dev/null 2>&1 || error "Node.js 未安装"
    command -v npm >/dev/null 2>&1 || error "npm 未安装"
    command -v pm2 >/dev/null 2>&1 || error "PM2 未安装"
    command -v git >/dev/null 2>&1 || error "Git 未安装"

    # 检查 Node.js 版本
    NODE_VERSION=$(node -v | cut -d'v' -f2)
    REQUIRED_VERSION="18.0.0"

    if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
        error "Node.js 版本过低，需要 $REQUIRED_VERSION 或更高版本，当前版本: $NODE_VERSION"
    fi

    log "依赖检查完成"
}

# 创建备份
create_backup() {
    log "创建备份..."

    BACKUP_NAME="snowtime-backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$BACKUP_DIR"

    if [ -d "$APP_DIR" ]; then
        tar -czf "$BACKUP_DIR/$BACKUP_NAME.tar.gz" -C "$APP_DIR" . 2>/dev/null || warn "备份创建失败"
        log "备份已创建: $BACKUP_DIR/$BACKUP_NAME.tar.gz"
    fi

    # 保留最近 5 个备份
    cd "$BACKUP_DIR"
    ls -t snowtime-backup-*.tar.gz | tail -n +6 | xargs -r rm -f
}

# 拉取代码
pull_code() {
    log "拉取最新代码..."

    cd "$APP_DIR"

    # 检查是否有未提交的更改
    if [ -n "$(git status --porcelain)" ]; then
        warn "检测到未提交的更改，将被重置"
        git stash push -m "Auto-stash before deploy $(date)"
    fi

    # 拉取最新代码
    git fetch origin
    git checkout "$BRANCH"
    git pull origin "$BRANCH"

    COMMIT_HASH=$(git rev-parse --short HEAD)
    log "代码更新完成，当前提交: $COMMIT_HASH"
}

# 安装依赖
install_dependencies() {
    log "安装服务端依赖..."

    cd "$APP_DIR"

    # 清理 node_modules 如果 package-lock.json 有变化
    if git diff HEAD~1 HEAD --name-only | grep -q "package-lock.json"; then
        log "检测到 package-lock.json 变化，清理 node_modules"
        rm -rf node_modules
    fi

    npm ci --production --silent

    # 构建客户端
    if [ -d "client" ]; then
        log "构建客户端..."
        cd client
        npm ci --silent
        npm run build
        cd ..
    fi

    log "依赖安装完成"
}

# 运行测试
run_tests() {
    if [ "$ENVIRONMENT" = "production" ]; then
        log "运行测试..."

        cd "$APP_DIR"
        npm test || error "测试失败，部署中止"

        log "测试通过"
    else
        info "跳过测试 (非生产环境)"
    fi
}

# 更新配置
update_config() {
    log "更新配置文件..."

    cd "$APP_DIR"

    # 复制环境配置
    if [ -f ".env.$ENVIRONMENT" ]; then
        cp ".env.$ENVIRONMENT" .env
        log "已应用 $ENVIRONMENT 环境配置"
    elif [ ! -f ".env" ]; then
        warn ".env 文件不存在，请手动创建"
    fi

    # 设置文件权限
    chmod 600 .env 2>/dev/null || true
    chmod +x deploy/*.sh 2>/dev/null || true
}

# 重启服务
restart_service() {
    log "重启应用服务..."

    cd "$APP_DIR"

    # 检查 PM2 进程是否存在
    if pm2 list | grep -q "$APP_NAME"; then
        log "重载 PM2 进程..."
        pm2 reload "$APP_NAME" --update-env
    else
        log "启动新的 PM2 进程..."
        pm2 start ecosystem.config.js
    fi

    # 等待服务启动
    sleep 5

    # 检查服务状态
    if pm2 list | grep "$APP_NAME" | grep -q "online"; then
        log "服务启动成功"
    else
        error "服务启动失败"
    fi
}

# 健康检查
health_check() {
    log "执行健康检查..."

    # 获取服务端口
    PORT=$(grep "^PORT=" .env 2>/dev/null | cut -d'=' -f2 || echo "3000")

    # 检查端口是否监听
    for i in {1..30}; do
        if curl -f -s "http://localhost:$PORT/health" >/dev/null 2>&1; then
            log "健康检查通过"
            return 0
        fi
        info "等待服务启动... ($i/30)"
        sleep 2
    done

    error "健康检查失败，服务可能未正常启动"
}

# 清理工作
cleanup() {
    log "执行清理工作..."

    cd "$APP_DIR"

    # 清理临时文件
    find . -name "*.tmp" -type f -delete 2>/dev/null || true
    find . -name ".DS_Store" -type f -delete 2>/dev/null || true

    # 清理旧日志 (保留最近 7 天)
    find logs/ -name "*.log" -type f -mtime +7 -delete 2>/dev/null || true

    log "清理完成"
}

# 发送通知 (可选)
send_notification() {
    if [ -n "$WEBHOOK_URL" ]; then
        COMMIT_MSG=$(git log -1 --pretty=format:"%s")
        COMMIT_AUTHOR=$(git log -1 --pretty=format:"%an")

        curl -X POST "$WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{
                \"text\": \"🚀 SnowTime 部署完成\",
                \"attachments\": [{
                    \"color\": \"good\",
                    \"fields\": [
                        {\"title\": \"环境\", \"value\": \"$ENVIRONMENT\", \"short\": true},
                        {\"title\": \"分支\", \"value\": \"$BRANCH\", \"short\": true},
                        {\"title\": \"提交\", \"value\": \"$COMMIT_HASH\", \"short\": true},
                        {\"title\": \"作者\", \"value\": \"$COMMIT_AUTHOR\", \"short\": true},
                        {\"title\": \"消息\", \"value\": \"$COMMIT_MSG\", \"short\": false}
                    ]
                }]
            }" 2>/dev/null || true
    fi
}

# 回滚函数
rollback() {
    error_msg=$1
    log "部署失败，开始回滚..."

    # 查找最新备份
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/snowtime-backup-*.tar.gz 2>/dev/null | head -n1)

    if [ -n "$LATEST_BACKUP" ]; then
        log "恢复备份: $LATEST_BACKUP"
        cd "$APP_DIR"
        tar -xzf "$LATEST_BACKUP"
        pm2 restart "$APP_NAME" 2>/dev/null || true
        log "回滚完成"
    else
        warn "未找到备份文件，无法自动回滚"
    fi

    error "$error_msg"
}

# 主函数
main() {
    log "开始部署 SnowTime 游戏 (环境: $ENVIRONMENT, 分支: $BRANCH)"

    # 设置错误处理
    trap 'rollback "部署过程中发生错误"' ERR

    check_permissions
    check_dependencies
    create_backup
    pull_code
    install_dependencies
    run_tests
    update_config
    restart_service
    health_check
    cleanup
    send_notification

    log "🎉 部署完成！SnowTime 游戏已成功部署到 $ENVIRONMENT 环境"

    # 显示服务状态
    echo ""
    info "服务状态:"
    pm2 list | grep "$APP_NAME" || true

    echo ""
    info "访问地址:"
    PORT=$(grep "^PORT=" .env 2>/dev/null | cut -d'=' -f2 || echo "3000")
    echo "  本地: http://localhost:$PORT"

    if [ -n "$DOMAIN" ]; then
        echo "  外网: https://$DOMAIN"
    fi
}

# 显示帮助信息
show_help() {
    echo "SnowTime 游戏部署脚本"
    echo ""
    echo "使用方法:"
    echo "  $0 [环境] [分支]"
    echo ""
    echo "参数:"
    echo "  环境    部署环境 (production, staging, development) [默认: production]"
    echo "  分支    Git 分支名 [默认: main]"
    echo ""
    echo "示例:"
    echo "  $0                          # 部署到生产环境，使用 main 分支"
    echo "  $0 staging develop          # 部署到测试环境，使用 develop 分支"
    echo "  $0 production v1.2.0        # 部署到生产环境，使用 v1.2.0 标签"
    echo ""
    echo "环境变量:"
    echo "  WEBHOOK_URL    部署通知 Webhook 地址"
    echo "  DOMAIN         外网访问域名"
    echo ""
}

# 检查参数
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_help
    exit 0
fi

# 创建日志目录
mkdir -p "$(dirname "$LOG_FILE")"

# 执行主函数
main "$@"