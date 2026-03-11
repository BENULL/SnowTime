#!/bin/bash

# SnowTime 游戏监控脚本
# 用于监控服务状态、资源使用和性能指标

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="/var/log/snowtime-monitor.log"

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[WARN] $1${NC}"
    echo "[WARN] $1" >> "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    echo "[ERROR] $1" >> "$LOG_FILE"
}

# 检查服务状态
check_service_status() {
    log "检查服务状态..."

    # 检查 PM2 进程
    if command -v pm2 &> /dev/null; then
        if pm2 list | grep -q "snowtime.*online"; then
            log "✅ SnowTime 服务运行正常"
        else
            error "❌ SnowTime 服务未运行"
            return 1
        fi
    fi

    # 检查端口监听
    PORT=${PORT:-3000}
    if netstat -tuln | grep -q ":$PORT "; then
        log "✅ 端口 $PORT 正在监听"
    else
        error "❌ 端口 $PORT 未监听"
        return 1
    fi

    # 检查 HTTP 响应
    if curl -f -s "http://localhost:$PORT/health" >/dev/null; then
        log "✅ HTTP 健康检查通过"
    else
        error "❌ HTTP 健康检查失败"
        return 1
    fi

    return 0
}

# 检查系统资源
check_system_resources() {
    log "检查系统资源..."

    # CPU 使用率
    CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    if (( $(echo "$CPU_USAGE > 80" | bc -l) )); then
        warn "⚠️  CPU 使用率较高: ${CPU_USAGE}%"
    else
        log "✅ CPU 使用率正常: ${CPU_USAGE}%"
    fi

    # 内存使用率
    MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
    if (( $(echo "$MEMORY_USAGE > 80" | bc -l) )); then
        warn "⚠️  内存使用率较高: ${MEMORY_USAGE}%"
    else
        log "✅ 内存使用率正常: ${MEMORY_USAGE}%"
    fi

    # 磁盘使用率
    DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | cut -d'%' -f1)
    if [ "$DISK_USAGE" -gt 80 ]; then
        warn "⚠️  磁盘使用率较高: ${DISK_USAGE}%"
    else
        log "✅ 磁盘使用率正常: ${DISK_USAGE}%"
    fi
}

# 检查应用性能
check_app_performance() {
    log "检查应用性能..."

    # 检查响应时间
    RESPONSE_TIME=$(curl -o /dev/null -s -w '%{time_total}' "http://localhost:${PORT:-3000}/health")
    if (( $(echo "$RESPONSE_TIME > 1.0" | bc -l) )); then
        warn "⚠️  响应时间较慢: ${RESPONSE_TIME}s"
    else
        log "✅ 响应时间正常: ${RESPONSE_TIME}s"
    fi

    # 检查 PM2 进程信息
    if command -v pm2 &> /dev/null; then
        PM2_INFO=$(pm2 jlist | jq -r '.[] | select(.name=="snowtime") | "CPU: \(.monit.cpu)% Memory: \(.monit.memory/1024/1024 | floor)MB Restarts: \(.pm2_env.restart_time)"')
        log "📊 PM2 进程信息: $PM2_INFO"
    fi
}

# 检查日志错误
check_logs() {
    log "检查应用日志..."

    LOG_DIR="$PROJECT_DIR/logs"
    if [ -d "$LOG_DIR" ]; then
        # 检查最近的错误日志
        ERROR_COUNT=$(find "$LOG_DIR" -name "*.log" -mtime -1 -exec grep -c "ERROR\|error" {} + 2>/dev/null | awk '{sum+=$1} END {print sum+0}')

        if [ "$ERROR_COUNT" -gt 10 ]; then
            warn "⚠️  发现 $ERROR_COUNT 个错误日志条目"
        else
            log "✅ 错误日志数量正常: $ERROR_COUNT"
        fi

        # 检查日志文件大小
        find "$LOG_DIR" -name "*.log" -size +100M -exec basename {} \; | while read -r large_log; do
            warn "⚠️  日志文件过大: $large_log"
        done
    fi
}

# 检查网络连接
check_network() {
    log "检查网络连接..."

    # 检查活跃连接数
    CONNECTIONS=$(netstat -an | grep ":${PORT:-3000}" | grep ESTABLISHED | wc -l)
    log "🌐 当前活跃连接数: $CONNECTIONS"

    if [ "$CONNECTIONS" -gt 1000 ]; then
        warn "⚠️  连接数较多，可能需要优化"
    fi
}

# 自动修复
auto_fix() {
    log "尝试自动修复..."

    # 重启服务如果检测到问题
    if ! check_service_status >/dev/null 2>&1; then
        log "尝试重启 SnowTime 服务..."

        if command -v pm2 &> /dev/null; then
            pm2 restart snowtime
            sleep 5

            if check_service_status >/dev/null 2>&1; then
                log "✅ 服务重启成功"
            else
                error "❌ 服务重启失败"
            fi
        fi
    fi

    # 清理大日志文件
    find "$PROJECT_DIR/logs" -name "*.log" -size +500M -exec truncate -s 100M {} \; 2>/dev/null || true
}

# 发送告警
send_alert() {
    local message="$1"

    if [ -n "$WEBHOOK_URL" ]; then
        curl -X POST "$WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{\"text\": \"🚨 SnowTime 监控告警: $message\"}" \
            2>/dev/null || true
    fi

    # 发送邮件 (如果配置了)
    if [ -n "$ALERT_EMAIL" ] && command -v mail &> /dev/null; then
        echo "$message" | mail -s "SnowTime 监控告警" "$ALERT_EMAIL" 2>/dev/null || true
    fi
}

# 生成监控报告
generate_report() {
    log "生成监控报告..."

    REPORT_FILE="/tmp/snowtime-monitor-report-$(date +%Y%m%d-%H%M%S).txt"

    cat > "$REPORT_FILE" << EOF
SnowTime 游戏监控报告
生成时间: $(date)

=== 服务状态 ===
$(pm2 list 2>/dev/null || echo "PM2 未安装")

=== 系统资源 ===
CPU: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}')
内存: $(free -h | grep Mem)
磁盘: $(df -h /)

=== 网络连接 ===
活跃连接: $(netstat -an | grep ":${PORT:-3000}" | grep ESTABLISHED | wc -l)

=== 最近日志 ===
$(tail -20 "$PROJECT_DIR/logs/combined.log" 2>/dev/null || echo "日志文件不存在")

EOF

    log "监控报告已生成: $REPORT_FILE"
}

# 主函数
main() {
    local mode=${1:-check}

    case $mode in
        "check")
            log "🔍 开始监控检查..."

            if ! check_service_status; then
                send_alert "服务状态异常"
            fi

            check_system_resources
            check_app_performance
            check_logs
            check_network

            log "✅ 监控检查完成"
            ;;

        "fix")
            log "🔧 开始自动修复..."
            auto_fix
            ;;

        "report")
            generate_report
            ;;

        "watch")
            log "👀 开始持续监控..."
            while true; do
                main check
                sleep 300  # 每5分钟检查一次
            done
            ;;

        *)
            echo "使用方法: $0 [check|fix|report|watch]"
            echo "  check  - 执行监控检查 (默认)"
            echo "  fix    - 尝试自动修复问题"
            echo "  report - 生成详细监控报告"
            echo "  watch  - 持续监控模式"
            exit 1
            ;;
    esac
}

# 创建日志目录
mkdir -p "$(dirname "$LOG_FILE")"

# 执行主函数
main "$@"