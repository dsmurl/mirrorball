export class HttpError extends Error {
  status: number;

  constructor({ message, status = 200 }: { message: string; status: number }) {
    super(message);
    this.name = "HttpError";
    this.status = status;

    // Set the prototype explicitly (necessary for some environments when extending Error)
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}
