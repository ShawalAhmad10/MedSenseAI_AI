// src/config/database.js
const { Sequelize } = require('sequelize');
require('dotenv').config();
const databaseSchema = process.env.DB_SCHEMA || 'public';
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(databaseSchema)) {
  throw new Error('DB_SCHEMA must be a valid PostgreSQL schema name.');
}

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    dialectOptions: {
      options: `-c search_path=${databaseSchema}`,
      connectionTimeoutMillis: 15000,
      ...(process.env.DB_SSL === 'true' ? {
        ssl: { require: true, rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
      } : {})
    },
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    define: {
      timestamps: true,
      underscored: true,
    },
  }
);

// Test connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error.message);
    process.exit(1);
  }
};

module.exports = { sequelize, testConnection };
