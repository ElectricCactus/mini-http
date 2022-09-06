import { once } from "node:events";
import { IncomingMessage } from "node:http";

import { Static, TSchema } from "@sinclair/typebox";
import { TypeCheck, TypeCompiler } from "@sinclair/typebox/compiler";

import {
  createHttpServer,
  HttpServer,
  HttpServerOptions,
  Matcher,
  Parsers,
  Request,
  Response,
  Route,
  RouteEvaluator,
  ServerInstanceContext,
  ServerInstanceFactory,
} from "./server";
import { BadInputError } from "./errors";

export type TypedRequest<Body> = Omit<Request, "body"> & {
  typed: true;
  body: Body;
};

export type Requests<Body> = Request | TypedRequest<Body>;

export function isTypedRequest<Body>(
  request: Requests<Body>
): request is TypedRequest<Body> {
  return "typed" in request;
}

export interface TypedRoute<Body extends TSchema> {
  matcher: Matcher;
  schema: {
    body: Body;
  };
  handler: (
    request: TypedRequest<Static<Body>>,
    route: this
  ) => Promise<Response>;
}

export function isTypedRoute<Body extends TSchema>(
  route: Routes<Body>
): route is TypedRoute<Body> {
  return "schema" in route;
}

export type TypedParsers<Body extends TSchema> = Parsers & {
  Body: (req: IncomingMessage) => Promise<Static<Body>>;
};

export interface TypedHttpServer<Body extends TSchema> extends HttpServer {
  addTypedRoute(route: TypedRoute<Body>): this;
}

export type Routes<Body extends TSchema> = Route | TypedRoute<Body>;

export type TypedServerInstanceFactory<Body extends TSchema> =
  ServerInstanceFactory<TypedHttpServer<Body>, Routes<Body>>;

export interface TypedHttpServerOptions<Body extends TSchema>
  extends HttpServerOptions<TypedHttpServer<Body>, TypedParsers<Body>> {
  routeEvaluator?: RouteEvaluator<Requests<Body>, Response, Routes<Body>>;
  serverFactory?: TypedServerInstanceFactory<Body>;
}

export function createCompilerCache<T extends TSchema>() {
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

export function typedServerInstanceFactory<Body extends TSchema>(
  context: ServerInstanceContext<Routes<Body>>
): TypedHttpServer<Body> {
  const { server, routes, port } = context;
  return {
    async start() {
      server.listen(port);
      await once(server, "listening");
    },
    stop() {
      server.close();
    },
    addRoute(route: Route) {
      routes.push(route);
      return this;
    },
    addTypedRoute(route: TypedRoute<Body>) {
      routes.push(route);
      return this;
    },
  };
}

export function createTypedHttpServer<Body extends TSchema>(
  options: TypedHttpServerOptions<Body>
): TypedHttpServer<Body> {
  const compiler = createCompilerCache();
  const _options: TypedHttpServerOptions<Body> = {
    ...options,
    serverFactory: options.serverFactory ?? typedServerInstanceFactory,
    routeEvaluator: (request, route) => {
      if (isTypedRoute(route)) {
        if (route.schema?.body && typeof request.body === "string") {
          const body = JSON.parse(request.body);
          const validator = compiler.compile(route.schema.body);
          if (!validator.Check(body)) {
            throw new BadInputError("Invalid request body");
          }
          const typedRequest: TypedRequest<Static<Body>> = {
            ...request,
            typed: true,
            body,
          };
          return route.handler(typedRequest, route);
        }
        throw new BadInputError("expected body to be a string");
      } else if (!isTypedRequest(request)) {
        return route.handler(request, route);
      } else {
        throw new BadInputError("unexpected input");
      }
    },
  };
  const instance = createHttpServer<TypedHttpServer<Body>, TypedParsers<Body>>(
    _options
  );

  return instance;
}
