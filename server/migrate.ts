import { initDb } from './db.js';

async function runMigration() {
  console.log('Running database schema migrations...');
  try {
    await initDb();
    console.log('Migrations completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
