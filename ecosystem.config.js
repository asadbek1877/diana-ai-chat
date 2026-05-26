module.exports = {
  apps: [{
    name: "diana-bot",
    script: "src/index.ts",
    interpreter: "node",
    interpreter_args: "--require ts-node/register"
  }]
};