const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "njambo-server",
      cwd: path.join(__dirname, "server"),
      script: "dist/server/src/index.js",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "768M",
      restart_delay: 2000,
      exp_backoff_restart_delay: 100,
      min_uptime: "10s",
      max_restarts: 10,
      listen_timeout: 10000,
      kill_timeout: 10000,
      time: true,
      merge_logs: true,
      output: path.join(__dirname, "logs", "njambo-server.out.log"),
      error: path.join(__dirname, "logs", "njambo-server.error.log"),
      env: {
        NODE_ENV: "development",
        PORT: "8081",
      },
      env_production: {
        NODE_ENV: "production",
        PORT: "8081",
      },
    },
  ],
};
