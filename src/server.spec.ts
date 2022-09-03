import { get, IncomingMessage } from "http";
import { Logger } from "./logger";

import { createHttpServer, HttpServer } from "./server";

const testServers: HttpServer[] = [];

const defaultLogger = new Proxy(
  {},
  {
    get: () => () => {},
  }
) as Logger;

function* portGenerator(): Generator<number> {
  let port = 3000;
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

    const response: {
      status?: number;
      data: string;
      raw: IncomingMessage;
    } = await new Promise((resolve, reject) => {
      get(url, (res) => {
        res.setEncoding("utf8");
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            data,
            raw: res,
          });
        });
        res.on("error", reject);
      });
    });

    expect(response).toBeDefined();
    expect(response.status).toBe(500);
    expect(response.data).toBe("invalid route");
  });
});
