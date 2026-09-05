export function notFoundHandler(_req, res) {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
}

export function errorHandler(error, _req, res, _next) {
  if (error.type === "entity.too.large" || error instanceof SyntaxError && error.status === 400) {
    return res.status(400).json({
      success: false,
      message: "Request body is invalid or too large",
    });
  }

  const statusCode = error.statusCode ||
    (error.name === "ValidationError" || error.name === "CastError" ? 400 : 500);

  res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? "Internal server error" : error.message,
  });
}
