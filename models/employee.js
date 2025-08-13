// models/employee.js
const { employeesConn } = require('../config/mongoose');
const { Schema } = require('mongoose');

const EmpSchema = new Schema({
  name: String,
  salary: Number,
  age: Number
});

module.exports = employeesConn.model('Employee', EmpSchema);
