import { startBackend } from './app.ts';
import { loadConfig } from './config.ts';

const backend = await startBackend(loadConfig());

const stop = (): void => {
  backend.close().then(() => process.exit(0), () => process.exit(1));
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
