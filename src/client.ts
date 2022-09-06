import { get, request, IncomingMessage } from "node:http";
import { once } from "node:events";
import { HttpHeaders, HttpResponse } from "./http";

type Response = HttpResponse & {
  raw: IncomingMessage;
};

export async function readBody(
  raw: IncomingMessage
): Promise<string | undefined> {
  let body: string | undefined;
  for await (const chunk of raw) {
    if (body == undefined) body = "";
    body += chunk;
  }
  return body;
}

export async function httpRequest(
  url: URL,
  method: string,
  body?: unknown,
  headers?: HttpHeaders
): Promise<Response> {
  let payload: string | undefined;
  const options = {
    method,
    headers: {
      ...headers,
    },
  };
  if (body) {
    payload = JSON.stringify(body);
    options.headers = {
      ...options.headers,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload).toString(),
    };
  }
  const response = await new Promise<Response>((resolve, reject) => {
    const handleIncomingMessage = async (raw: IncomingMessage) => {
      const [body] = await Promise.all([readBody(raw), once(raw, "end")]);
      let response: Response = {
        status: raw.statusCode ?? 0,
        raw,
        body,
      };
      if (response.body === undefined) {
        delete response.body;
      }
      resolve(response);
    };
    const req = request(url, options, handleIncomingMessage).on(
      "error",
      reject
    );
    if (payload) {
      req.write(payload);
    }
    req.end();
  });

  return response;
}

export async function httpGet(url: URL): Promise<Response> {
  return httpRequest(url, "GET");
}

export async function httpPost(url: URL, data: unknown): Promise<Response> {
  return httpRequest(url, "POST", data);
}
