#!/bin/bash

# SnowTime 游戏备份脚本
# 用于备份应用数据、配置文件和日志

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="/var/backups/snowtime"
S3_BUCKET="${S3_BUCKET:-}"
RETENTION_DAYS=30

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

# 创建备份
create_backup() {
    local backup_name="snowtime-backup-$(date +%Y%m%d-%H%M%S)"
    local backup_path="$BACKUP_DIR/$backup_name"

    log "创建备份: $backup_name"

    mkdir -p "$backup_path"

    # 备份应用代码
    log "备份应用代码..."
    tar -czf "$backup_path/app.tar.gz" -C "$PROJECT_DIR" \
        --exclude=node_modules \
        --exclude=client/node_modules \
        --exclude=client/dist \
        --exclude=logs \
        --exclude=.git \
        .

    # 备份配置文件
    log "备份配置文件..."
    cp "$PROJECT_DIR/.env" "$backup_path/" 2>/dev/null || true
    cp "$PROJECT_DIR/ecosystem.config.js" "$backup_path/" 2>/dev/null || true

    # 备份日志文件
    if [ -d "$PROJECT_DIR/logs" ]; then
        log "备份日志文件..."
        tar -czf "$backup_path/logs.tar.gz" -C "$PROJECT_DIR" logs/
    fi

    # 备份数据库 (如果使用)
    if command -v redis-cli &> /dev/null; then
        log "备份 Redis 数据..."
        redis-cli --rdb "$backup_path/dump.rdb" 2>/dev/null || true
    fi

    # 创建备份信息文件
    cat > "$backup_path/backup-info.txt" << EOF
备份时间: $(date)
备份类型: 完整备份
应用版本: $(cd "$PROJECT_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
服务器: $(hostname)
备份大小: $(du -sh "$backup_path" | cut -f1)
EOF

    log "备份完成: $backup_path"
    echo "$backup_path"
}

# 上传到云存储
upload_to_cloud() {
    local backup_path="$1"
    local backup_name=$(basename "$backup_path")

    if [ -n "$S3_BUCKET" ] && command -v aws &> /dev/null; then
        log "上传备份到 S3..."
        tar -czf "/tmp/$backup_name.tar.gz" -C "$BACKUP_DIR" "$backup_name"
        aws s3 cp "/tmp/$backup_name.tar.gz" "s3://$S3_BUCKET/snowtime-backups/"
        rm "/tmp/$backup_name.tar.gz"
        log "备份已上传到 S3"
    fi
}

# 清理旧备份
cleanup_old_backups() {
    log "清理 $RETENTION_DAYS 天前的备份..."

    find "$BACKUP_DIR" -name "snowtime-backup-*" -type d -mtime +$RETENTION_DAYS -exec rm -rf {} + 2>/dev/null || true

    if [ -n "$S3_BUCKET" ] && command -v aws &> /dev/null; then
        # 清理 S3 中的旧备份
        aws s3 ls "s3://$S3_BUCKET/snowtime-backups/" | while read -r line; do
            backup_date=$(echo "$line" | awk '{print $1}')
            backup_file=$(echo "$line" | awk '{print $4}')

            if [ -n "$backup_date" ] && [ -n "$backup_file" ]; then
                days_old=$(( ($(date +%s) - $(date -d "$backup_date" +%s)) / 86400 ))
                if [ $days_old -gt $RETENTION_DAYS ]; then
                    aws s3 rm "s3://$S3_BUCKET/snowtime-backups/$backup_file"
                    log "删除旧备份: $backup_file"
                fi
            fi
        done 2>/dev/null || true
    fi
}

# 恢复备份
restore_backup() {
    local backup_path="$1"

    if [ ! -d "$backup_path" ]; then
        error "备份路径不存在: $backup_path"
    fi

    log "恢复备份: $backup_path"

    # 停止服务
    if command -v pm2 &> /dev/null; then
        pm2 stop snowtime 2>/dev/null || true
    fi

    # 备份当前状态
    local current_backup="$BACKUP_DIR/pre-restore-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$current_backup"
    cp -r "$PROJECT_DIR" "$current_backup/" 2>/dev/null || true

    # 恢复应用代码
    if [ -f "$backup_path/app.tar.gz" ]; then
        log "恢复应用代码..."
        cd "$PROJECT_DIR"
        tar -xzf "$backup_path/app.tar.gz"
    fi

    # 恢复配置文件
    if [ -f "$backup_path/.env" ]; then
        log "恢复配置文件..."
        cp "$backup_path/.env" "$PROJECT_DIR/"
    fi

    # 恢复数据库
    if [ -f "$backup_path/dump.rdb" ] && command -v redis-cli &> /dev/null; then
        log "恢复 Redis 数据..."
        redis-cli --rdb "$backup_path/dump.rdb" 2>/dev/null || true
    fi

    # 重新安装依赖
    log "重新安装依赖..."
    cd "$PROJECT_DIR"
    npm ci --production

    # 重启服务
    if command -v pm2 &> /dev/null; then
        pm2 start ecosystem.config.js 2>/dev/null || true
    fi

    log "备份恢复完成"
}

# 列出可用备份
list_backups() {
    log "可用备份列表:"

    if [ -d "$BACKUP_DIR" ]; then
        ls -la "$BACKUP_DIR" | grep "snowtime-backup-" | while read -r line; do
            backup_name=$(echo "$line" | awk '{print $9}')
            backup_date=$(echo "$line" | awk '{print $6" "$7" "$8}')
            backup_size=$(du -sh "$BACKUP_DIR/$backup_name" 2>/dev/null | cut -f1)
            echo "  $backup_name ($backup_date, $backup_size)"
        done
    fi

    if [ -n "$S3_BUCKET" ] && command -v aws &> /dev/null; then
        log "S3 备份列表:"
        aws s3 ls "s3://$S3_BUCKET/snowtime-backups/" 2>/dev/null || true
    fi
}

# 验证备份
verify_backup() {
    local backup_path="$1"

    log "验证备份: $backup_path"

    # 检查必要文件
    local required_files=("app.tar.gz" "backup-info.txt")
    for file in "${required_files[@]}"; do
        if [ ! -f "$backup_path/$file" ]; then
            error "备份文件不完整，缺少: $file"
        fi
    done

    # 检查压缩文件完整性
    if ! tar -tzf "$backup_path/app.tar.gz" >/dev/null 2>&1; then
        error "应用备份文件损坏"
    fi

    if [ -f "$backup_path/logs.tar.gz" ]; then
        if ! tar -tzf "$backup_path/logs.tar.gz" >/dev/null 2>&1; then
            error "日志备份文件损坏"
        fi
    fi

    log "备份验证通过"
}

# 主函数
main() {
    local action=${1:-backup}

    # 创建备份目录
    mkdir -p "$BACKUP_DIR"

    case $action in
        "backup"|"create")
            backup_path=$(create_backup)
            upload_to_cloud "$backup_path"
            cleanup_old_backups
            ;;

        "restore")
            local backup_name="$2"
            if [ -z "$backup_name" ]; then
                list_backups
                error "请指定要恢复的备份名称"
            fi

            local backup_path="$BACKUP_DIR/$backup_name"
            verify_backup "$backup_path"
            restore_backup "$backup_path"
            ;;

        "list")
            list_backups
            ;;

        "verify")
            local backup_name="$2"
            if [ -z "$backup_name" ]; then
                error "请指定要验证的备份名称"
            fi

            verify_backup "$BACKUP_DIR/$backup_name"
            ;;

        "cleanup")
            cleanup_old_backups
            ;;

        *)
            echo "SnowTime 游戏备份脚本"
            echo ""
            echo "使用方法:"
            echo "  $0 backup              创建新备份"
            echo "  $0 restore <name>      恢复指定备份"
            echo "  $0 list                列出所有备份"
            echo "  $0 verify <name>       验证备份完整性"
            echo "  $0 cleanup             清理旧备份"
            echo ""
            echo "环境变量:"
            echo "  S3_BUCKET             S3 存储桶名称 (可选)"
            echo "  RETENTION_DAYS        备份保留天数 (默认: 30)"
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"