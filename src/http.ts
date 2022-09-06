export const HttpMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export type HttpMethod = typeof HttpMethods[number] | string;

export type HttpHeaders = Record<string, string | string[]>;

export interface HttpRequest {
  path: string;
  headers: HttpHeaders;
  method: HttpMethod;
  body?: string;
}

export interface HttpEmptyResponse {
  status: number;
  headers?: HttpHeaders;
}

export interface HttpStringResponse {
  status: number;
  headers?: HttpHeaders;
  body?: string;
}

export interface HttpJsonResponse {
  status: number;
  headers?: HttpHeaders;
  body?: Record<string, unknown>;
}

export type HttpResponse =
  | HttpEmptyResponse
  | HttpStringResponse
  | HttpJsonResponse;
