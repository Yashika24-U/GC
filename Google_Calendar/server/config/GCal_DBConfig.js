const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: String(process.env.DB_PASSWORD), // Ensures it's a string even if empty
  port: process.env.DB_PORT,
});

// Log any unexpected errors on idle clients
pool.on("error", (err) => {
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
module.exports = pool;
  