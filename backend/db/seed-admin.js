/**
 * Creates (or updates) one admin account from the ADMIN_SEED_* values in .env.
 * Run once during setup: node db/seed-admin.js
 * Admins are never self-registered through the website — this is intentional.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('./database');
const Admin = require('./models/Admin');

const { ADMIN_SEED_ID, ADMIN_SEED_NAME, ADMIN_SEED_EMAIL, ADMIN_SEED_PASSWORD } = process.env;

if (!ADMIN_SEED_ID || !ADMIN_SEED_NAME || !ADMIN_SEED_EMAIL || !ADMIN_SEED_PASSWORD) {
  console.error('Set ADMIN_SEED_ID, ADMIN_SEED_NAME, ADMIN_SEED_EMAIL, ADMIN_SEED_PASSWORD in .env first.');
  process.exit(1);
}

async function main() {
  await mongoose.connection.asPromise();

  const passwordHash = bcrypt.hashSync(ADMIN_SEED_PASSWORD, 10);

  await Admin.findOneAndUpdate(
    { adminId: ADMIN_SEED_ID },
    { name: ADMIN_SEED_NAME, email: ADMIN_SEED_EMAIL, passwordHash },
    { upsert: true }
  );

  console.log(`Admin account ready: ${ADMIN_SEED_ID} (${ADMIN_SEED_EMAIL})`);
  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
