// config/database.js
require('dotenv').config();

module.exports = {
  employees: process.env.MONGODB_URI_EMPLOYEES || "mongodb://localhost:27017/mydb",
  movies: process.env.MONGODB_URI_MOVIES // required for movies
};
