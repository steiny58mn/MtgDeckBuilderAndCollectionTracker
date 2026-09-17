import 'dotenv/config';
import { initDb } from './db.js';

async function runMigration() {
  console.log('Running database schema migrations for Turso...');
  try {
    await initDb();
    console.log('Turso schema migrations completed successfully.');
  } catch (error) {
    console.error('Turso migration failed:', error);
    process.exit(1);
  }
}

runMigration();
