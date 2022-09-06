import { httpGet, httpPost } from "./client";
import { AuthError } from "./errors";
import { Logger } from "./logger";

import { createHttpServer, HttpServer } from "./server";

const testServers: HttpServer[] = [];

const mockLog = jest.fn();

const defaultLogger = new Proxy(
  {},
  {
    get: () => mockLog,
  }
) as Logger;

function* portGenerator(): Generator<number> {
  let port = 9070;
  while (true) {
    yield port++;
  }
}

const portGen = portGenerator();

const createTestHttpServer: typeof createHttpServer = (...args) => {
  const server = createHttpServer(...args);
  testServers.push(server);
  return server;
};

afterAll(() => {
  testServers.forEach((server) => server.stop());
});

beforeEach(() => {
  mockLog.mockClear();
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

    expect(mockLog).not.toHaveBeenCalled();
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

  it("should add a string route", async () => {
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

  it("should add a regex route", async () => {
    const port = portGen.next().value;
    const server = createTestHttpServer({ port, logger: defaultLogger });

    server.addRoute({
      matcher: /GET \//,
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

  it("should add a functional route", async () => {
    const port = portGen.next().value;
    const server = createTestHttpServer({ port, logger: defaultLogger });

    server.addRoute({
      matcher: (request) => {
        return request.method === "GET" && request.path === "/";
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

    const response = await httpGet(url);

    expect(response).toBeDefined();
    expect(response.status).toBe(200);
    expect("body" in response && response.body).toBe("hello world");
  });

  it("should handle request body", async () => {
    const port = portGen.next().value;
    const server = createTestHttpServer({ port, logger: defaultLogger });

    server.addRoute({
      matcher: "POST /",
      async handler({ body }, route) {
        return {
          status: 200,
          body,
        };
      },
    });

    await server.start();

    const url = new URL(`http://localhost:${port}/`);

    const body = { hello: "world" };

    const response = await httpPost(url, body);

    expect(response).toBeDefined();
    expect(response.status).toBe(200);
    expect("body" in response && response.body).toBe(JSON.stringify(body));
  });

  it("should handle an object body response", async () => {
    const port = portGen.next().value;
    const server = createTestHttpServer({ port, logger: defaultLogger });

    const body = { hello: "world" };

    server.addRoute({
      matcher: "GET /",
      async handler(request, route) {
        return {
          status: 200,
          body,
        };
      },
    });

    await server.start();

    const url = new URL(`http://localhost:${port}/`);

    const response = await httpGet(url);

    expect(response).toBeDefined();
    expect(response.status).toBe(200);
    expect("body" in response && response.body).toBe(JSON.stringify(body));
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

  it("should catch when a generic error is thrown", async () => {
    const port = portGen.next().value;
    const server = createTestHttpServer({ port, logger: defaultLogger });

    server.addRoute({
      matcher: "GET /",
      async handler() {
        throw new Error("");
      },
    });

    await server.start();

    const url = new URL(`http://localhost:${port}/`);

    const response = await httpGet(url);

    expect(response).toBeDefined();
    expect(response.status).toBe(500);
  });

  it("should log when debug is enabled", async () => {
    const port = portGen.next().value;
    const server = createTestHttpServer({
      port,
      logger: defaultLogger,
    });

    server.debug(true);

    await server.start();

    const url = new URL(`http://localhost:${port}/`);

    const response = await httpGet(url);

    expect(response).toBeDefined();
    expect(response.status).toBe(500);

    expect(mockLog).toHaveBeenCalled();
  });
});
