export class AppError extends Error {
  constructor(message, statusCode = 400, details = null, options = {}) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.expose = options.expose ?? statusCode < 500;
  }
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: 'Rota não encontrada.'
  });
}

export function errorHandler(error, req, res, next) {
  const statusCode = error.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  const hasDetails = error.details !== undefined && error.details !== null;
  const canExposeMessage = error.expose === true || (error.expose !== false && statusCode < 500 && !hasDetails);
  const payload = {
    success: false,
    message: isProduction && !canExposeMessage
      ? 'Erro interno do servidor.'
      : error.message || 'Erro interno do servidor.'
  };

  if (hasDetails) {
    console.error('[error:details]', {
      statusCode,
      message: error.message,
      details: error.details
    });
  }

  if (statusCode >= 500) {
    console.error('[error]', {
      statusCode,
      message: error.message,
      stack: error.stack
    });
  }

  if (!isProduction && hasDetails) payload.details = error.details;
  if (!isProduction && statusCode === 500) {
    payload.stack = error.stack;
  }

  res.status(statusCode).json(payload);
}
