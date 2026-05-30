module.exports = {
  apps: [
    {
      name: "diana-bot",
      script: "dist/index.js", // .ts эмас, .js бўлди
      watch: ["dist/index.js"],
      env: { NODE_ENV: "production" }
    },
    {
      name: "diana-userbot",
      script: "dist/userbot/index.js", // .ts эмас, .js бўлди
      watch: ["dist/userbot/index.js"],
      env: { NODE_ENV: "production" }
    }
  ]
};