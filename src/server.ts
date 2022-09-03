import { once } from "events";
import { createServer, Server, IncomingMessage, ServerResponse } from "http";
import { Static, TSchema } from "@sinclair/typebox";
import { TypeCheck, TypeCompiler } from "@sinclair/typebox/compiler";
import { defaultLogger, Logger } from "./logger";
import { HttpError } from "./errors";
import {
  HttpJsonResponse,
  HttpResponse,
  HttpMethod,
  HttpMethods,
  HttpRequest,
  ValidatedHttpRequest,
} from "./http";

function parsePath({ url }: IncomingMessage): string {
  return url ?? "/";
}

function parseMethod({ method }: IncomingMessage): HttpMethod {
  if (method && HttpMethods.find((item) => item === method?.toUpperCase())) {
    return method.toUpperCase() as HttpMethod;
  } else {
    throw new Error(`Invalid method: ${method}`);
  }
}

async function parseBody(
  request: IncomingMessage
): Promise<string | undefined> {
  let data: string | undefined;
  for await (const chunk of request) {
    if (data == undefined) data = "";
    data += chunk;
  }
  return data;
}

async function parseRequest(request: IncomingMessage): Promise<HttpRequest> {
  return {
    path: parsePath(request),
    headers: request.headers,
    method: parseMethod(request),
    body: await parseBody(request),
  };
}

type Matcher = string | RegExp;

type RouteHandler<Route, Request> = (
  request: Request,
  route: Route
) => Promise<HttpResponse>;

interface DefaultRoute<M extends Matcher> {
  matcher: M;
  method: HttpMethod;
  handler: RouteHandler<this, HttpRequest>;
}

interface RouteWithValidations<M extends Matcher, BodySchema extends TSchema> {
  matcher: M;
  method: HttpMethod;
  validators: {
    body: BodySchema;
  };
  handler: RouteHandler<this, ValidatedHttpRequest<BodySchema>>;
}

function isRouteWithValidations<M extends Matcher, S extends TSchema>(
  route: Route<M, S>
): route is RouteWithValidations<M, S> {
  return (
    // ensure validators is defined
    "validators" in route &&
    // ensure all validators are defined
    Object.values(route.validators).filter((x) => x != undefined).length > 0
  );
}

type Route<M extends Matcher, Schema extends TSchema> =
  | DefaultRoute<M>
  | RouteWithValidations<M, Schema>;

export interface HttpServer {
  start(): Promise<void>;
  shutdown(): void;
  addRoute<M extends Matcher>(route: DefaultRoute<M>): HttpServer;
  addRoute<M extends Matcher, S extends TSchema>(
    route: RouteWithValidations<M, S>
  ): HttpServer;
  setDebug(debug: boolean): void;
}

function matchPath<M extends Matcher, T extends TSchema, U extends HttpRequest>(
  { path }: U,
  { matcher }: Route<M, T>
): boolean {
  if (matcher instanceof RegExp) {
    const pathMatches = matcher.test(path);
    return pathMatches;
  } else {
    return matcher === path;
  }
}

function matchMethod<
  M extends Matcher,
  T extends TSchema,
  U extends HttpRequest
>({ method: reqMethod }: U, { method }: Route<M, T>): boolean {
  return reqMethod === method;
}

function matchRoute<
  M extends Matcher,
  T extends TSchema,
  U extends HttpRequest
>(request: U, route: Route<M, T>): boolean {
  return matchPath(request, route) && matchMethod(request, route);
}

function formatErrorResponse(
  message: string,
  statusCode = 500
): HttpJsonResponse {
  return {
    statusCode,
    body: {
      error: message,
    },
  };
}

function createCompilerCache<T extends TSchema>() {
  const cache = new Map<T, TypeCheck<T>>();
  return {
    compile(schema: T): TypeCheck<T> {
      if (cache.has(schema)) {
        return cache.get(schema)!;
      } else {
        const compiler = TypeCompiler.Compile(schema);
        cache.set(schema, compiler);
        return compiler;
      }
    },
  };
}

function isJsonValid<T extends TSchema>(
  data: unknown,
  schema: T,
  compilerCache: ReturnType<typeof createCompilerCache>
): data is Static<T> {
  const validator = compilerCache.compile(schema);
  return validator.Check(data);
}

function validateRequestBody<M extends Matcher, T extends TSchema>(
  cache: ReturnType<typeof createCompilerCache>,
  request: HttpRequest,
  { body: bodyValidator }: RouteWithValidations<M, T>["validators"]
): ValidatedHttpRequest<T> {
  const { body: requestBody } = request;
  if (requestBody == undefined) {
    throw new Error("body is undefined");
  }
  const body = JSON.parse(requestBody);
  if (!isJsonValid(body, bodyValidator, cache)) {
    throw new Error("body is invalid");
  }
  return {
    ...request,
    body,
  };
}

function parseErrorResponse(err: unknown): HttpJsonResponse {
  if (err instanceof HttpError) {
    return formatErrorResponse(err.message, err.statusCode);
  } else if (err instanceof Error) {
    return formatErrorResponse(err.message);
  } else {
    return formatErrorResponse("internal server error");
  }
}

export const createHttpServer = <M extends Matcher, T extends TSchema>(
  port: number,
  log: Logger = defaultLogger()
): HttpServer => {
  const compilerCache = createCompilerCache();
  let debug = false;
  const routes: Route<M, T>[] = [];
  const server: Server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const request = await parseRequest(req);
      let response: HttpResponse = {
        statusCode: 500,
        headers: {
          "content-type": "text/plain",
        },
        body: "invalid route",
      };

      if (debug) {
        log.debug(request);
      }

      for (const route of routes) {
        if (matchRoute(request, route)) {
          try {
            if (isRouteWithValidations(route)) {
              const validatedRequest = {
                ...validateRequestBody(
                  compilerCache,
                  request,
                  route.validators
                ),
              };
              response = await route.handler(validatedRequest, route);
            } else {
              response = await route.handler(request, route);
            }
          } catch (err) {
            log.error(err);
            response = parseErrorResponse(err);
          }
          // there can be only one
          break;
        }
      }

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
      res.writeHead(response.statusCode, response.headers);
      if (body) res.write(body);
      res.end();
    }
  );

  server.on("listening", (): void => {
    log.debug(`listening on port ${port}`);
  });

  const self: HttpServer = {
    addRoute(route: Route<M, T>): typeof self {
      routes.push(route);
      return self;
    },
    setDebug(value: boolean): void {
      debug = value;
    },
    async start(): Promise<void> {
      server.listen(port);
      await once(server, "listening");
    },
    shutdown(): void {
      server.close();
    },
  };

  return self;
};
