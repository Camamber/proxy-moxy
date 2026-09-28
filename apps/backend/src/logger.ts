export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export type LogSink = Pick<Console, 'log' | 'warn' | 'error'>;

const WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

export function createLogger(level: LogLevel, sink: LogSink = console): Logger {
  const threshold = WEIGHT[level];
  const line =
    (name: Exclude<LogLevel, 'silent'>, write: (...args: unknown[]) => void) =>
    (message: string, ...args: unknown[]): void => {
      if (WEIGHT[name] < threshold) return;
      write(`${new Date().toISOString()} ${name.padEnd(5)} ${message}`, ...args);
    };

  return {
    debug: line('debug', (...args) => sink.log(...args)),
    info: line('info', (...args) => sink.log(...args)),
    warn: line('warn', (...args) => sink.warn(...args)),
    error: line('error', (...args) => sink.error(...args)),
  };
}
