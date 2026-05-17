function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || err.statusCode || 500;
  const isDev  = process.env.NODE_ENV === 'development';
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} → ${status}:`, err.message);
  res.status(status).json({
    success: false,
    message: err.message || 'An unexpected error occurred.',
    ...(isDev && { stack: err.stack }),
  });
}

function notFound(req, res) {
  res.status(404).json({ success: false, message: `Cannot ${req.method} ${req.originalUrl}` });
}

module.exports = { errorHandler, notFound };