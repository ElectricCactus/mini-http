import { inspect } from "node:util";

export interface Logger {
  log(...args: any[]): void;
  info(...args: any[]): void;
  debug(...args: any[]): void;
  error(...args: any[]): void;
  fatal(...args: any[]): void;
  trace(...args: any[]): void;
}

const log = (...args: any[]) => {
  console.log(
    ...args.map((x) => {
      if (typeof x === "string") {
        return x;
      } else if (x != undefined) {
        return inspect(x);
      } else {
        return `${x}`;
      }
    })
  );
};

export const defaultLogger = (): Logger => {
  const logger = {
    log: log,
    info: log,
    debug: log,
    error: log,
    fatal: log,
    trace: log,
  };

  return logger;
};
