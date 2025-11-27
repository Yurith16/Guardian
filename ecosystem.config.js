module.exports = {
  apps: [{
    name: "guardianbot",
    script: "./main.js",
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "500M",
    env: {
      NODE_ENV: "production",
      PM2: "true"
    },
    env_development: {
      NODE_ENV: "development",
      PM2: "true"
    },
    error_file: "./logs/err.log",
    out_file: "./logs/out.log",
    log_file: "./logs/combined.log",
    time: true,
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: "10s"
  }]
};