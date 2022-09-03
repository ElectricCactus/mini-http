export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(404, message);
  }
}

export class BadInputError extends HttpError {
  constructor(message: string) {
    super(400, message);
  }
}

export class AuthError extends HttpError {
  constructor(message: string) {
    super(401, message);
  }
}
