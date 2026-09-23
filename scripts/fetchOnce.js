require('dotenv').config();
const connectDB = require('../config/db');
const { fetchAndStoreJobs } = require('../services/jobFetcher');
const mongoose = require('mongoose');

(async () => {
  await connectDB();
  console.log('Fetching jobs...');
  const summary = await fetchAndStoreJobs();
  console.log('Done:', summary);
  await mongoose.disconnect();
  process.exit(0);
})();
