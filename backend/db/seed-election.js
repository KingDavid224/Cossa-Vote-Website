/**
 * Creates one starter election with the standard COSSA positions, if none exists.
 * Run once during setup: node db/seed-election.js
 */
require('dotenv').config();
const mongoose = require('./database');
const Election = require('./models/Election');
const Position = require('./models/Position');

async function main() {
  await mongoose.connection.asPromise();

  const existing = await Election.findOne();
  if (existing) {
    console.log('An election already exists (id=' + existing._id + ') — skipping.');
    await mongoose.connection.close();
    process.exit(0);
  }

  const opens = new Date();
  const closes = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const election = await Election.create({
    title: 'COSSA General Election 2026',
    department: 'Computer Science',
    opensAt: opens.toISOString(),
    closesAt: closes.toISOString(),
    status: 'Open',
  });

  const positionNames = [
    'President', 'Vice President', 'General Secretary',
    'Financial Secretary', 'Public Relations Officer', 'Welfare Director',
  ];

  for (const name of positionNames) {
    await Position.create({ electionId: election._id, name });
  }

  console.log(`Created election "${election.title}" (id=${election._id}) with ${positionNames.length} positions.`);
  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
