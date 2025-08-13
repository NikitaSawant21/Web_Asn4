// models/movie.js
const { moviesConn } = require('../config/mongoose');
const { Schema } = require('mongoose');

const MovieSchema = new Schema({
  movie_id: { type: Number, index: true },
  movie_title: { type: String, index: true },
  Released: String
}, { timestamps: true });

module.exports = moviesConn.model('Movie', MovieSchema);
