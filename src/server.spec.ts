import { get, IncomingMessage } from "http";
import { AuthError } from "./errors";
import { Logger } from "./logger";

import { createHttpServer, HttpServer } from "./server";

const testServers: HttpServer[] = [];

const defaultLogger = new Proxy(
  {},
  {
    get: () => () => {
      // noop
    },
  }
) as Logger;

function* portGenerator(): Generator<number> {
  let port = 9000;
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
  testServers.forEach((server) => server.shutdown());
});

async function httpGet(
  url: URL
): Promise<{ status?: number; data: string; raw: IncomingMessage }> {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, data, raw: res }));
    }).on("error", reject);
  });
}

describe("createHttpServer", () => {
  it("should create a functional http server", async () => {
    const server = createTestHttpServer(portGen.next().value, defaultLogger);

    expect(server).toBeDefined();
    expect(server.addRoute).toBeDefined();
    expect(server.start).toBeDefined();
    expect(server.shutdown).toBeDefined();

    await server.start();
  });

  it("should create an http server and respond to a request", async () => {
    const port = portGen.next().value;
    const server = createTestHttpServer(port, defaultLogger);

    await server.start();

    const url = new URL(`http://localhost:${port}/test`);

    const response = await httpGet(url);

    expect(response).toBeDefined();
    expect(response.status).toBe(500);
    expect(response.data).toBe("invalid route");
  });

  it("should add a basic route", async () => {
    const port = portGen.next().value;
    const server = createTestHttpServer(port, defaultLogger);

    server.addRoute({
      matcher: "/",
      method: "GET",
      async handler(request, route) {
        return {
          statusCode: 200,
          body: "hello world",
        };
      },
    });

    await server.start();

    const url = new URL(`http://localhost:${port}/`);

    const response = await httpGet(url);

    expect(response).toBeDefined();
    expect(response.status).toBe(200);
    expect(response.data).toBe("hello world");
  });

  it("should return 401 when auth error is thrown", async () => {
    const port = portGen.next().value;
    const server = createTestHttpServer(port, defaultLogger);

    server.addRoute({
      matcher: "/",
      method: "GET",
      async handler(request, route) {
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
