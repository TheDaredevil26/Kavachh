'use strict';

let uuidv4;
try {
  uuidv4 = require('uuid').v4;
} catch (_) {
  const crypto = require('crypto');
  uuidv4 = crypto.randomUUID ? crypto.randomUUID.bind(crypto) : () => crypto.randomBytes(16).toString('hex');
}

/**
 * Middleware: generate a unique UUID request_id for each incoming request.
 * Sets req.id, req.requestId, req.request_id, and attaches the X-Request-Id header to the response.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requestIdMiddleware(req, res, next) {
  const existingId = req.headers['x-request-id'];
  const id = (typeof existingId === 'string' && existingId.trim().length > 0)
    ? existingId.trim()
    : uuidv4();

  req.id = id;
  req.requestId = id;
  req.request_id = id;

  if (res && typeof res.setHeader === 'function') {
    res.setHeader('X-Request-Id', id);
  }

  next();
}

module.exports = requestIdMiddleware;
module.exports.requestIdMiddleware = requestIdMiddleware;
module.exports.attachRequestId = requestIdMiddleware;
