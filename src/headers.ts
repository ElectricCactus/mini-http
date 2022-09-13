import { IncomingMessage } from "node:http";
import { HttpHeaders } from "./http";

export function parseHeaders(req: IncomingMessage): HttpHeaders | undefined {
  let headers: Record<string, string | string[]> | undefined;
  for (const [key, value] of Object.entries(req.headers)) {
    if (!headers) headers = {};
    if (value) headers[key.toLowerCase()] = value;
  }
  return headers;
}
