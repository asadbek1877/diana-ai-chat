require('dotenv').config(); // Бу қатор .env файлини ўқиш учун шарт!
const { defineConfig } = require('@prisma/config');

module.exports = defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
});