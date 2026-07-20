function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits, no leading zero issues
}

module.exports = generateCode;
