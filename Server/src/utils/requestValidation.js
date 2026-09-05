const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_PAGE = 100000;

export function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function requireObjectBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw createError("Request body must be an object", 400);
  }
}

export function validateStringLength(value, field, maximum, { allowEmpty = true } = {}) {
  if (value === undefined) {
    return;
  }

  if (typeof value !== "string" || (!allowEmpty && !value.trim()) || value.length > maximum) {
    throw createError(`${field} is invalid`, 400);
  }
}

export function parsePagination(query) {
  const limitValue = query.limit;
  const pageValue = query.page;
  const limit = limitValue === undefined ? DEFAULT_LIMIT : Number(limitValue);
  const page = pageValue === undefined ? 1 : Number(pageValue);

  if (!Number.isInteger(limit) || limit < 1) {
    throw createError("limit must be a positive integer", 400);
  }

  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) {
    throw createError("page must be a positive integer", 400);
  }

  return {
    limit: Math.min(limit, MAX_LIMIT),
    skip: (page - 1) * Math.min(limit, MAX_LIMIT),
    page,
  };
}

export { DEFAULT_LIMIT, MAX_LIMIT };
