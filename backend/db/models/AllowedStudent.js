const mongoose = require('../database');

// The official register of students allowed to create an account.
// Populate this via db/seed-students.js from your class list CSV.
const allowedStudentSchema = new mongoose.Schema({
  matric: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  level: { type: String },
});

module.exports = mongoose.model('AllowedStudent', allowedStudentSchema);
