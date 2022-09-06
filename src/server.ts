import { once } from "node:events";
import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from "node:http";
import { HttpError } from "./errors";

import { defaultLogger, Logger } from "./logger";

export type Matcher =
  | string
  | RegExp
  | ((request: Request, route: Route) => boolean);

export type Request = {
  path: string;
  method: string;
  headers: Record<string, string | string[]>;
  body?: string;
};

export type Response = {
  status: number;
  headers?: Record<string, string | string[]>;
  body: unknown;
};

export type RouteHandler<Tx, Rx, R> = (request: Tx, route: R) => Promise<Rx>;

export type RouteEvaluator<Tx, Rx, R> = (
  request: Tx,
  route: R,
  logger: Logger
) => Promise<Rx>;

export interface Route {
  matcher: Matcher;
  handler: RouteHandler<Request, Response, Route>;
}

export interface HttpServer {
  debug(debug: boolean): this;
  start(): Promise<void>;
  stop(): void;
  addRoute(route: Route): this;
}

export type Parsers<Tx extends Request = Request> = {
  Request: (req: IncomingMessage) => Promise<Omit<Tx, "body" | "headers">>;
  Headers: (req: IncomingMessage) => Promise<Tx["headers"]>;
  Body: (req: IncomingMessage) => Promise<Tx["body"]>;
};

export type ServerInstanceFactory<T, R = Route> = (
  context: ServerInstanceContext<R>
) => T;

export type ServerInstanceContext<R = Route> = {
  debug: boolean;
  server: Server;
  port: number;
  routes: R[];
};

export const defaultServerInstanceFactory: ServerInstanceFactory<
  HttpServer,
  Route
> = (context: ServerInstanceContext) => {
  const { server, routes, port } = context;
  return {
    async start() {
      server.listen(port);
      await once(server, "listening");
    },
    debug(debug) {
      context.debug = debug;
      return this;
    },
    stop() {
      server.close();
    },
    addRoute(route: Route) {
      routes.push(route);
      return this;
    },
  };
};

export type RouteMatcher = (route: Route, request: Request) => boolean;

export interface HttpServerOptions<
  T extends HttpServer = HttpServer,
  P extends Parsers = Parsers
> {
  port: number;
  defaultResponse?: Response;
  logger?: Logger;
  routeEvaluator?: RouteEvaluator<Request, Response, Route>;
  requestParser?: P["Request"];
  headersParser?: P["Headers"];
  bodyParser?: P["Body"];
  routeMatcher?: RouteMatcher;
  serverFactory?: ServerInstanceFactory<T, Route>;
}

export const defaultRouteEvaluator: RouteEvaluator<
  Request,
  Response,
  Route
> = async (request, route, logger = defaultLogger()) => {
  return await route.handler(request, route);
};

export const defaultRouteMatcher: RouteMatcher = (route, request) => {
  const requestString = `${request.method} ${request.path}`;
  if (typeof route.matcher === "string") {
    return route.matcher === requestString;
  } else if (route.matcher instanceof RegExp) {
    return route.matcher.test(requestString);
  } else {
    return route.matcher(request, route);
  }
};

export const defaultHeadersParser: Parsers["Headers"] = async (req) => {
  const headers: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers[key.toLowerCase()] = value;
  }
  return headers;
};

export const defaultBodyParser: Parsers["Body"] = async (req) => {
  let data: string | undefined;
  for await (const chunk of req) {
    if (data == undefined) data = "";
    data += chunk;
  }
  return data;
};

export const defaultRequestParser: Parsers["Request"] = async (req) => {
  return {
    path: req.url ?? "/",
    method: req.method ?? "GET",
  };
};

export function formatErrorAsResponse(error: unknown): Response {
  let body = "Internal Server Error";
  let status = 500;
  if (error instanceof HttpError) {
    body = error.message;
    status = error.statusCode;
  } else if (error instanceof Error) {
    body = error.message;
  }
  return { body, status };
}

export function sendResponse(
  response: Response,
  serverResponse: ServerResponse
): void {
  let body;
  if ("body" in response && response.body != undefined) {
    let contentType = "text/plain";
    body = `${response.body}`;
    if (typeof response.body === "object") {
      body = JSON.stringify(response.body);
      contentType = "application/json";
    }
    response.headers = {
      "content-type": contentType,
      ...response.headers,
      "content-length": Buffer.byteLength(body).toString(),
    };
  }

  serverResponse.writeHead(response.status, response.headers);
  if (body) serverResponse.write(body);
  serverResponse.end();
}

export function createHttpServer<
  T extends HttpServer = HttpServer,
  P extends Parsers = Parsers
>({
  port,
  defaultResponse,
  routeEvaluator = defaultRouteEvaluator,
  requestParser = defaultRequestParser,
  headersParser = defaultHeadersParser,
  bodyParser = defaultBodyParser,
  routeMatcher = defaultRouteMatcher,
  serverFactory,
  logger = defaultLogger(),
}: HttpServerOptions<T, P>): T {
  const server = createServer();
  const routes: { matcher: Matcher; handler: any }[] = [];
  const context = { server, port, routes, debug: false };

  const factory = serverFactory ?? defaultServerInstanceFactory;
  const instance: T = factory(context) as T;

  server.on("request", async (req, res) => {
    if (context.debug) {
      logger.debug("raw request", req.url, req.method, req.headers);
    }
    const request = {
      ...(await requestParser(req)),
      headers: await headersParser(req),
      body: await bodyParser(req),
    };
    if (context.debug) {
      logger.debug("parsed request", request);
    }
    let response: Response = defaultResponse
      ? JSON.parse(JSON.stringify(defaultResponse))
      : {
          status: 500,
          headers: {
            "content-type": "text/plain",
          },
          body: "invalid route",
        };
    for (const route of routes) {
      if (routeMatcher(route, request)) {
        try {
          response = await routeEvaluator(request, route, logger);
        } catch (error: unknown) {
          logger.error(error);
          response = formatErrorAsResponse(error);
        }
        break;
      }
    }
    sendResponse(response, res);
  });

  return instance;
}
