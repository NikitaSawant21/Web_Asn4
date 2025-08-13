// app.js
// Express + Mongoose (dual DB: Employees on local, Movies on Atlas via .env)
// Includes: Handlebars UI, proper error handling, REST APIs

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const exphbs = require('express-handlebars');
const path = require('path');

const app = express();
const port = process.env.PORT || 8000;

// ---------- Parsers ----------
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.json({ type: 'application/vnd.api+json' }));

// ---------- View Engine (Handlebars) ----------
app.engine('hbs', exphbs.engine({ extname: '.hbs' }));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- DB Connections ----------
const EMP_URI = process.env.MONGODB_URI_EMPLOYEES || 'mongodb://localhost:27017/yourDB';
const MOV_URI = process.env.MONGODB_URI_MOVIES; // Atlas (required for Movie APIs)

// Keep databases separate
const employeesConn = mongoose.createConnection(EMP_URI);
employeesConn.on('connected', () => console.log('[Mongo] employees connected:', EMP_URI));
employeesConn.on('error', (e) => console.error('[Mongo] employees error:', e.message));

let moviesConn = null;
if (MOV_URI) {
  moviesConn = mongoose.createConnection(MOV_URI);
  moviesConn.on('connected', () => console.log('[Mongo] movies connected:', MOV_URI));
  moviesConn.on('error', (e) => console.error('[Mongo] movies error:', e.message));
} else {
  console.warn('[Mongo] Warning: MONGODB_URI_MOVIES is not set. Movie routes & UI will return 503.');
}

// ---------- Schemas & Models ----------
const { Schema } = mongoose;

// Employee (local DB)
const EmpSchema = new Schema({
  name: { type: String, required: true },
  salary: { type: Number, required: true },
  age: { type: Number, required: true }
});
const Employee = employeesConn.model('Employee', EmpSchema);

// Movie (Atlas DB)
let Movie = null;
if (moviesConn) {
  const MovieSchema = new Schema(
    {
      movie_id: { type: Number, index: true },
      movie_title: { type: String, index: true, required: true },
      Released: { type: String } // adjust to Date/Number if your dataset differs
    },
    { timestamps: true }
  );
  Movie = moviesConn.model('Movie', MovieSchema);
}

// ---------- Helpers ----------
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function ensureMovieConn(req, res) {
  if (!Movie) {
    res.status(503).json({
      error: true,
      status: 503,
      message: 'Movies DB not configured. Set MONGODB_URI_MOVIES in your .env.'
    });
    return true;
  }
  return false;
}

// ---------- Employee REST Routes (Local Mongo) ----------
// GET all employees
app.get('/api/employees', asyncHandler(async (req, res) => {
  const list = await Employee.find({});
  res.json(list);
}));

// GET employee by id
app.get('/api/employees/:id', asyncHandler(async (req, res) => {
  const doc = await Employee.findById(req.params.id);
  if (!doc) { const err = new Error('Not found'); err.status = 404; throw err; }
  res.json(doc);
}));

// POST create employee
app.post(
  '/api/employees',
  [body('name').trim().notEmpty(), body('salary').isNumeric(), body('age').isNumeric()],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const err = new Error('Validation failed'); err.status = 400; err.details = errors.array(); throw err;
    }
    await Employee.create({
      name: req.body.name,
      salary: req.body.salary,
      age: req.body.age
    });
    const all = await Employee.find({});
    res.json(all);
  })
);

// PUT update employee
app.put('/api/employees/:id', asyncHandler(async (req, res) => {
  const updated = await Employee.findByIdAndUpdate(
    req.params.id,
    { name: req.body.name, salary: req.body.salary, age: req.body.age },
    { new: true }
  );
  if (!updated) { const err = new Error('Not found'); err.status = 404; throw err; }
  res.send('Successfully! Employee updated - ' + updated.name);
}));

// DELETE employee
app.delete('/api/employees/:id', asyncHandler(async (req, res) => {
  const r = await Employee.deleteOne({ _id: req.params.id });
  if (r.deletedCount === 0) { const err = new Error('Not found'); err.status = 404; throw err; }
  res.send('Successfully! Employee has been Deleted.');
}));

// ---------- Movie REST Routes (Atlas) ----------
// GET all movies
app.get('/api/movies', asyncHandler(async (req, res) => {
  if (ensureMovieConn(req, res)) return;
  const list = await Movie.find({}).limit(200);
  res.json(list);
}));

// GET movie by id OR movie_id OR title
app.get('/api/movies/find', asyncHandler(async (req, res) => {
  if (ensureMovieConn(req, res)) return;
  const { id, movie_id, title } = req.query;

  if (id) {
    const doc = await Movie.findById(id);
    if (!doc) { const err = new Error('Not found'); err.status = 404; throw err; }
    return res.json(doc);
  }
  if (movie_id) {
    const doc = await Movie.findOne({ movie_id: Number(movie_id) });
    if (!doc) { const err = new Error('Not found'); err.status = 404; throw err; }
    return res.json(doc);
  }
  if (title) {
    const doc = await Movie.findOne({ movie_title: title });
    if (!doc) { const err = new Error('Not found'); err.status = 404; throw err; }
    return res.json(doc);
  }
  const err = new Error('Provide id or movie_id or title'); err.status = 400; throw err;
}));

// POST create movie
app.post(
  '/api/movies',
  [body('movie_title').trim().notEmpty()],
  asyncHandler(async (req, res) => {
    if (ensureMovieConn(req, res)) return;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const err = new Error('Validation failed'); err.status = 400; err.details = errors.array(); throw err;
    }
    const created = await Movie.create({
      movie_id: req.body.movie_id,
      movie_title: req.body.movie_title,
      Released: req.body.Released
    });
    res.status(201).json(created);
  })
);

// PUT update movie by id OR movie_id (title & Released)
app.put('/api/movies', asyncHandler(async (req, res) => {
  if (ensureMovieConn(req, res)) return;
  const { id, movie_id, movie_title, Released } = req.body;
  if (!id && !movie_id) { const err = new Error('Provide id or movie_id'); err.status = 400; throw err; }

  const filter = id ? { _id: id } : { movie_id: Number(movie_id) };
  const updated = await Movie.findOneAndUpdate(
    filter,
    { $set: { movie_title, Released } },
    { new: true }
  );
  if (!updated) { const err = new Error('Not found'); err.status = 404; throw err; }
  res.json(updated);
}));

// DELETE movie by id OR movie_id
app.delete('/api/movies', asyncHandler(async (req, res) => {
  if (ensureMovieConn(req, res)) return;
  const { id, movie_id } = req.query;
  if (!id && !movie_id) { const err = new Error('Provide id or movie_id'); err.status = 400; throw err; }

  const filter = id ? { _id: id } : { movie_id: Number(movie_id) };
  const r = await Movie.deleteOne(filter);
  if (r.deletedCount === 0) { const err = new Error('Not found'); err.status = 404; throw err; }
  res.json({ ok: true });
}));

// ---------- UI Routes (Handlebars) ----------
// Home: list + quick "show" form
// app.get('/', asyncHandler(async (req, res) => {
//   if (ensureMovieConn(req, res)) return;
//   const movies = await Movie.find({}).limit(50);
//   res.render('index', { layout: 'main', movies });
// }));

// HOME: list + quick "show" form
app.get('/', async (req, res, next) => {
  try {
    if (ensureMovieConn(req, res)) return;

    // grab raw docs
    const raw = await Movie.find({}).limit(50).lean();

    // normalize fields so the view always gets movie_title, movie_id, Released
    const movies = raw.map(d => ({
      _id: d._id?.toString(),
      movie_title: d.movie_title ?? d.title ?? d.name ?? d.MovieTitle ?? '',
      movie_id: d.movie_id ?? d.movieId ?? d.movieid ?? d.MovieID ?? '',
      Released: d.Released ?? d.released ?? d.release_year ?? d.releaseYear ?? d.year ?? ''
    }));

    res.render('index', { layout: 'main', movies });
  } catch (e) { next(e); }
});


// SHOW one (by _id OR movie_id)
app.get('/ui/movie/show', asyncHandler(async (req, res) => {
  if (ensureMovieConn(req, res)) return;
  const { id, movie_id } = req.query;
  let movie = null;

  if (id) movie = await Movie.findById(id);
  else if (movie_id) movie = await Movie.findOne({ movie_id: Number(movie_id) });

  res.render('movie-view', { layout: 'main', movie });
}));

// INSERT (form)
app.get('/ui/movie/new', (req, res) => {
  res.render('movie-form', { layout: 'main' });
});

app.post('/ui/movie/new', asyncHandler(async (req, res) => {
  if (ensureMovieConn(req, res)) return;
  await Movie.create({
    movie_id: req.body.movie_id,
    movie_title: req.body.movie_title,
    Released: req.body.Released
  });
  res.redirect('/');
}));

// UPDATE (form)
app.get('/ui/movie/update', (req, res) => {
  res.render('movie-update', { layout: 'main' });
});

app.post('/ui/movie/update', asyncHandler(async (req, res) => {
  if (ensureMovieConn(req, res)) return;
  const { id, movie_id, movie_title, Released } = req.body;
  if (!id && !movie_id) { const err = new Error('Provide id or movie_id'); err.status = 400; throw err; }
  const filter = id ? { _id: id } : { movie_id: Number(movie_id) };
  const updated = await Movie.findOneAndUpdate(filter, { $set: { movie_title, Released } }, { new: true });
  if (!updated) { const err = new Error('Not found'); err.status = 404; throw err; }
  res.redirect(`/ui/movie/show?${id ? `id=${id}` : `movie_id=${movie_id}`}`);
}));

// DELETE (form)
app.get('/ui/movie/delete', (req, res) => {
  res.render('movie-delete', { layout: 'main' });
});

app.post('/ui/movie/delete', asyncHandler(async (req, res) => {
  if (ensureMovieConn(req, res)) return;
  const { id, movie_id } = req.body;
  if (!id && !movie_id) { const err = new Error('Provide id or movie_id'); err.status = 400; throw err; }
  const filter = id ? { _id: id } : { movie_id: Number(movie_id) };
  const r = await Movie.deleteOne(filter);
  if (r.deletedCount === 0) { const err = new Error('Not found'); err.status = 404; throw err; }
  res.redirect('/');
}));

// ---------- Health Check ----------
app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

// ---------- 404 for unknown routes (must be before error handler) ----------
app.use((req, res, next) => {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.status = 404;
  next(err);
});

// ---------- Centralized Error Handler ----------
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(status).json({
    error: true,
    status,
    message: err.message || 'Internal Server Error',
    details: err.details || undefined,
    stack: isDev ? err.stack : undefined
  });
});

// ---------- Start (local only) ----------
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => console.log('Server listening on port', port));
}

// Export for Vercel / testing
module.exports = app;
