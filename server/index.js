require('dotenv').config();
const path = require('path');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 5342;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'upkeep.db');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

const app = createApp({ dbPath: DB_PATH, adminPassword: ADMIN_PASSWORD });

app.listen(PORT, () => {
  console.log(`Upkeep Status listening on http://localhost:${PORT}  (admin at /admin)`);
  if (ADMIN_PASSWORD === 'admin') {
    console.log('⚠ Using default admin password — set ADMIN_PASSWORD in .env for production.');
  }
});
