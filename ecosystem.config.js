module.exports = {
  apps: [
    {
      name: "diana-bot",
      script: "dist/index.js",
      watch: false, // Audit #9: НИКОГДА watch в production
      max_memory_restart: "256M", // Audit #10: Перезапуск при утечке памяти
      error_file: "./logs/bot-error.log",
      out_file: "./logs/bot-out.log",
      merge_logs: true,
      restart_delay: 5000,
      max_restarts: 10,
      env: { NODE_ENV: "production" }
    },
    {
      name: "diana-userbot",
      script: "dist/userbot/index.js",
      watch: false, // Audit #9: НИКОГДА watch в production
      max_memory_restart: "256M", // Audit #10: Перезапуск при утечке памяти
      error_file: "./logs/userbot-error.log",
      out_file: "./logs/userbot-out.log",
      merge_logs: true,
      restart_delay: 5000,
      max_restarts: 10,
      env: { NODE_ENV: "production" }
    }
  ]
};