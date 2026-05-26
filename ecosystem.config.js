module.exports = {
  apps: [{
    name: "diana-bot",
    script: "src/index.ts",
    interpreter: "node",
    interpreter_args: "--require ts-node/register"
  }]
};

module.exports = {
  apps: [
    {
      name: "diana-userbot",
      script: "npm.cmd", // Windows учун энг муҳим жойи!
      args: "run userbot",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
      }
    }
  ]
};