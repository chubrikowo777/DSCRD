'use strict';
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const current = LEVELS[String(process.env.LOG_LEVEL || 'info')] ?? 2;

function stamp() {
  return new Date().toISOString().slice(11, 19);
}

module.exports = {
  error: (...a) => (current >= 0 ? console.error(`[${stamp()}] [error]`, ...a) : undefined),
  warn: (...a) => (current >= 1 ? console.warn(`[${stamp()}] [warn]`, ...a) : undefined),
  info: (...a) => (current >= 2 ? console.log(`[${stamp()}] [info]`, ...a) : undefined),
  debug: (...a) => (current >= 3 ? console.log(`[${stamp()}] [debug]`, ...a) : undefined)
};
