'use strict';

/**
 * Central ATS adapter registry — adding a new ATS requires one adapter file
 * and a registration entry in core/AdapterRegistry.js. No runner changes needed.
 */
module.exports = require('./core/AdapterRegistry');
