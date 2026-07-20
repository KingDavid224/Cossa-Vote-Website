const mongoose = require('mongoose');

// ---------------------------------------------------------------
// MongoDB connection (Atlas). server.js requires this file first,
// before any routes load, so the connection starts as early as
// possible. Mongoose queues up operations internally until the
// connection is actually open, so requiring the models elsewhere
// before the connection finishes is safe.
// ---------------------------------------------------------------

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set. Add it to your .env file (see .env.example).');
  process.exit(1);
}

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas.'))
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err.message);
});

module.exports = mongoose;
