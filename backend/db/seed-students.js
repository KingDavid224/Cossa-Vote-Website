/**
 * Imports your official student list into the allowed_students collection.
 *
 * Usage:
 *   node db/seed-students.js path/to/your-students.csv
 *
 * The CSV MUST have a header row with these columns (any order): matric,name,level
 * See students_cs500.csv for the expected format.
 *
 * Re-running this is safe — existing matric numbers are updated, not duplicated.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const mongoose = require('./database');
const AllowedStudent = require('./models/AllowedStudent');

const filePath = process.argv[2] || path.join(__dirname, 'students_cs500.csv');

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

async function main() {
  // Wait for the connection opened by db/database.js to actually be ready
  // before running queries.
  await mongoose.connection.asPromise();

  const raw = fs.readFileSync(filePath, 'utf8');
  const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

  let count = 0;
  for (const row of records) {
    if (!row.matric || !row.name) continue;
    await AllowedStudent.findOneAndUpdate(
      { matric: row.matric.trim().toUpperCase() },
      { name: row.name.trim(), level: (row.level || '').trim() },
      { upsert: true }
    );
    count++;
  }

  const total = await AllowedStudent.countDocuments();
  console.log(`Imported ${count} rows. allowed_students now has ${total} students.`);
  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
