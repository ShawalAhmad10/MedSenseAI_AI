// src/db/init.js
const { sequelize } = require('../config/database');
const { Pharmacist, OTP } = require('../models');

const initDatabase = async () => {
  try {
    console.log('🔄 Initializing database...');

    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    // Sync all models (create tables)
    await sequelize.sync({ force: false, alter: true });
    console.log('✅ Database tables created/updated');

    console.log('\n📊 Database Schema:');
    console.log('  - pharmacists (main user table)');
    console.log('  - otps (OTP verification codes)');

    console.log('\n✅ Database initialization complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
};

initDatabase();
