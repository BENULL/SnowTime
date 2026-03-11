module.exports = {
  apps: [{
    name: 'snowtime',
    script: './server/index.js',
    instances: process.env.NODE_ENV === 'production' ? 'max' : 1,
    exec_mode: 'cluster',

    // 环境变量
    env: {
      NODE_ENV: 'development',
      PORT: 3000,
      HOST: '0.0.0.0'
    },

    env_production: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 3000,
      HOST: process.env.HOST || '0.0.0.0'
    },

    env_staging: {
      NODE_ENV: 'staging',
      PORT: process.env.PORT || 3001,
      HOST: process.env.HOST || '0.0.0.0'
    },

    // 日志配置
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

    // 进程管理
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    restart_delay: 4000,

    // 集群配置
    instance_var: 'INSTANCE_ID',

    // 健康检查
    health_check_grace_period: 3000,

    // 进程退出配置
    kill_timeout: 5000,
    listen_timeout: 3000,

    // 环境特定配置
    node_args: process.env.NODE_ENV === 'production'
      ? '--max-old-space-size=2048'
      : '--max-old-space-size=1024',

    // 源码映射 (开发环境)
    source_map_support: process.env.NODE_ENV !== 'production',

    // 合并日志
    merge_logs: true,

    // 时间戳
    time: true,

    // 自动重启条件
    min_uptime: '10s',
    max_restarts: 10,

    // 监控配置
    pmx: true,

    // 忽略监听文件
    ignore_watch: [
      'node_modules',
      'logs',
      'client/dist',
      'client/node_modules',
      '.git',
      '*.log'
    ],

    // 环境变量文件
    env_file: '.env'
  }],

  // 部署配置
  deploy: {
    production: {
      user: process.env.DEPLOY_USER || 'ubuntu',
      host: process.env.DEPLOY_HOST || 'your-server.com',
      ref: 'origin/main',
      repo: process.env.DEPLOY_REPO || 'git@github.com:yourusername/snowtime.git',
      path: '/var/www/snowtime',
      'pre-deploy-local': '',
      'post-deploy': 'npm ci --production && npm run build:client && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      'ssh_options': 'StrictHostKeyChecking=no'
    },

    staging: {
      user: process.env.DEPLOY_USER || 'ubuntu',
      host: process.env.DEPLOY_HOST_STAGING || 'staging-server.com',
      ref: 'origin/develop',
      repo: process.env.DEPLOY_REPO || 'git@github.com:yourusername/snowtime.git',
      path: '/var/www/snowtime-staging',
      'post-deploy': 'npm ci && npm run build:client && pm2 reload ecosystem.config.js --env staging'
    }
  }
};