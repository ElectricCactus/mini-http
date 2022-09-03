import { Static, TSchema } from "@sinclair/typebox";

export const HttpMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export type HttpMethod = typeof HttpMethods[number];

export type HttpHeaders = Record<string, string | string[] | undefined>;

export interface HttpRequest {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  method: HttpMethod;
  body?: string;
}

export interface ValidatedHttpRequest<BodySchema extends TSchema> {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  method: HttpMethod;
  body: Static<BodySchema>;
}

export interface HttpEmptyResponse {
  statusCode: number;
  headers?: HttpHeaders;
}

export interface HttpStringResponse {
  statusCode: number;
  headers?: HttpHeaders;
  body?: string;
}

export interface HttpJsonResponse {
  statusCode: number;
  headers?: HttpHeaders;
  body?: Record<string, unknown>;
}

export type HttpResponse =
  | HttpEmptyResponse
  | HttpStringResponse
  | HttpJsonResponse;
