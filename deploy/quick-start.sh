#!/bin/bash

# SnowTime 游戏快速启动脚本
# 使用方法: ./quick-start.sh [环境]

set -e

ENVIRONMENT=${1:-development}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')] $1${NC}"
}

info() {
    echo -e "${BLUE}[INFO] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[WARN] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

# 检查 Docker
check_docker() {
    if ! command -v docker &> /dev/null; then
        error "Docker 未安装，请先安装 Docker"
    fi

    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose 未安装，请先安装 Docker Compose"
    fi

    if ! docker info &> /dev/null; then
        error "Docker 服务未启动，请启动 Docker"
    fi
}

# 创建必要目录
create_directories() {
    log "创建必要目录..."

    cd "$PROJECT_DIR"
    mkdir -p logs
    mkdir -p logs/nginx

    # 设置权限
    chmod 755 logs
    chmod 755 logs/nginx
}

# 复制环境配置
setup_environment() {
    log "设置 $ENVIRONMENT 环境配置..."

    cd "$PROJECT_DIR"

    if [ -f ".env.$ENVIRONMENT" ]; then
        cp ".env.$ENVIRONMENT" .env
        log "已复制 $ENVIRONMENT 环境配置"
    else
        warn "未找到 .env.$ENVIRONMENT 文件，使用默认配置"
        if [ ! -f ".env" ]; then
            cp ".env.development" .env
        fi
    fi
}

# 构建和启动服务
start_services() {
    log "构建和启动 SnowTime 服务..."

    cd "$PROJECT_DIR"

    case $ENVIRONMENT in
        "development"|"dev")
            docker-compose -f docker-compose.dev.yml up --build -d
            ;;
        "production"|"prod")
            docker-compose up --build -d
            ;;
        "staging")
            docker-compose -f docker-compose.yml up --build -d
            ;;
        *)
            error "未知环境: $ENVIRONMENT (支持: development, staging, production)"
            ;;
    esac
}

# 等待服务启动
wait_for_services() {
    log "等待服务启动..."

    # 等待应用启动
    for i in {1..30}; do
        if curl -f -s http://localhost:3000/health >/dev/null 2>&1; then
            log "SnowTime 服务启动成功!"
            break
        fi

        if [ $i -eq 30 ]; then
            error "服务启动超时"
        fi

        info "等待服务启动... ($i/30)"
        sleep 2
    done
}

# 显示服务状态
show_status() {
    log "服务状态:"
    docker-compose ps

    echo ""
    info "访问地址:"
    echo "  游戏地址: http://localhost:3000"

    if [ "$ENVIRONMENT" = "development" ]; then
        echo "  开发服务器: http://localhost:5173"
    fi

    echo ""
    info "有用的命令:"
    echo "  查看日志: docker-compose logs -f snowtime"
    echo "  停止服务: docker-compose down"
    echo "  重启服务: docker-compose restart"
    echo "  查看状态: docker-compose ps"
}

# 主函数
main() {
    log "🚀 启动 SnowTime 游戏 (环境: $ENVIRONMENT)"

    check_docker
    create_directories
    setup_environment
    start_services
    wait_for_services
    show_status

    log "🎉 SnowTime 游戏启动完成!"
}

# 显示帮助
show_help() {
    echo "SnowTime 游戏快速启动脚本"
    echo ""
    echo "使用方法:"
    echo "  $0 [环境]"
    echo ""
    echo "环境选项:"
    echo "  development, dev    开发环境 (默认)"
    echo "  staging            测试环境"
    echo "  production, prod   生产环境"
    echo ""
    echo "示例:"
    echo "  $0                 # 启动开发环境"
    echo "  $0 dev             # 启动开发环境"
    echo "  $0 production      # 启动生产环境"
}

# 检查参数
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_help
    exit 0
fi

# 执行主函数
main