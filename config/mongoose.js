// config/mongoose.js
const mongoose = require('mongoose');
const db = require('./database');

// v6+ doesn't require options, but safe to keep the pattern consistent
const employeesConn = mongoose.createConnection(db.employees);
const moviesConn = mongoose.createConnection(db.movies || ''); // will error if not set & used

employeesConn.on('connected', () => console.log('[Mongo] employees connected:', db.employees));
moviesConn.on('connected', () => console.log('[Mongo] movies connected:', db.movies));

employeesConn.on('error', (e) => console.error('[Mongo] employees error:', e.message));
moviesConn.on('error', (e) => console.error('[Mongo] movies error:', e.message));

module.exports = { employeesConn, moviesConn };
