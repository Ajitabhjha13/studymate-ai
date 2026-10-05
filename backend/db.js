// MySQL database connection (connection pool)
// Local: localhost:3306 bina SSL. Cloud (Aiven): alag host/port + SSL zaroori.
const fs = require('fs');
const mysql = require('mysql2/promise');

function sslConfig() {
  if (process.env.DB_SSL !== 'true') return undefined;
  // Aiven ka CA certificate: env variable mein text, ya file ka path
  let ca = process.env.DB_SSL_CA;
  if (!ca && process.env.DB_SSL_CA_FILE) ca = fs.readFileSync(process.env.DB_SSL_CA_FILE, 'utf8');
  if (ca) return { ca: ca.replace(/\\n/g, '\n'), rejectUnauthorized: true };
  console.warn('WARNING: DB_SSL is on but no CA certificate given; connection is encrypted but the server is not verified.');
  return { rejectUnauthorized: false };
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: sslConfig(),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
  enableKeepAlive: true,
});

module.exports = pool;
