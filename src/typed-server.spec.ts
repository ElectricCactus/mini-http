import { get, request, IncomingMessage } from "node:http";

import { Static, Type } from "@sinclair/typebox";

import { AuthError } from "./errors";
import { Logger } from "./logger";

import { createTypedHttpServer, TypedHttpServer } from "./typed-server";
import { httpGet, httpPost } from "./client";

const testServers: TypedHttpServer[] = [];

const defaultLogger = new Proxy(
  {},
  {
    get: () => () => {
      // noop
    },
  }
) as Logger;

function* portGenerator(): Generator<number> {
  let port = 9050;
  while (true) {
    yield port++;
  }
}

const portGen = portGenerator();

const createTestHttpServer: typeof createTypedHttpServer = (...args) => {
  const server = createTypedHttpServer(...args);
  testServers.push(server);
  return server;
};

afterAll(() => {
  testServers.forEach((server) => server.stop());
});

describe("createHttpServer", () => {
  it("should create a functional http server", async () => {
    const port = portGen.next().value;
    const server = createTestHttpServer({ port, logger: defaultLogger });

    expect(server).toBeDefined();
    expect(server.addRoute).toBeDefined();
    expect(server.start).toBeDefined();
    expect(server.stop).toBeDefined();

    await server.start();
  });

  it("should create an http server and respond to a request", async () => {
    const port = portGen.next().value;
    const server = createTestHttpServer({ port, logger: defaultLogger });

    await server.start();

    const url = new URL(`http://localhost:${port}/test`);

    const response = await httpGet(url);

    expect(response).toBeDefined();
    expect(response.status).toBe(500);
    expect("body" in response && response.body).toBe("invalid route");
  });

  it("should add a basic route", async () => {
    const port = portGen.next().value;
    const server = createTestHttpServer({ port, logger: defaultLogger });

    server.addRoute({
      matcher: "GET /",
      async handler(request, route) {
        return {
          status: 200,
          body: "hello world",
        };
      },
    });

    await server.start();

    const url = new URL(`http://localhost:${port}/`);

    const response = await httpGet(url);

    expect(response).toBeDefined();
    expect(response.status).toBe(200);
    expect("body" in response && response.body).toBe("hello world");
  });

  it("should add a typed route", async () => {
    const port = portGen.next().value;
    const server = createTestHttpServer({ port, logger: defaultLogger });

    const schema = Type.Object({
      foo: Type.String(),
      bar: Type.Number(),
    });

    server.addTypedRoute({
      matcher: "POST /",
      schema: {
        body: schema,
      },
      async handler(request, route) {
        return {
          status: 200,
          body: "hello world",
        };
      },
    });

    await server.start();

    const url = new URL(`http://localhost:${port}/`);

    const response = await httpPost(url, { foo: "str", bar: 1 });

    expect(response).toBeDefined();
    expect(response.status).toBe(200);
    expect("body" in response && response.body).toBe("hello world");
  });

  it("should return 400 when payload is invalid", async () => {
    const port = portGen.next().value;
    const server = createTestHttpServer({ port, logger: defaultLogger });

    const schema = Type.Object({
      foo: Type.String(),
      bar: Type.Number(),
    });

    server.addTypedRoute({
      matcher: "POST /",
      schema: {
        body: schema,
      },
      async handler(request, route) {
        return {
          status: 200,
          body: "hello world",
        };
      },
    });

    await server.start();

    const url = new URL(`http://localhost:${port}/`);

    const response = await httpPost(url, {});

    expect(response).toBeDefined();
    expect(response.status).toBe(400);
  });

  it("should return 401 when auth error is thrown", async () => {
    const port = portGen.next().value;
    const server = createTestHttpServer({ port, logger: defaultLogger });

    server.addRoute({
      matcher: "GET /",
      async handler() {
        throw new AuthError("");
      },
    });

    await server.start();

    const url = new URL(`http://localhost:${port}/`);

    const response = await httpGet(url);

    expect(response).toBeDefined();
    expect(response.status).toBe(401);
  });
});
