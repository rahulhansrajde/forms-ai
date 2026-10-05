import { ApplicationContainer } from './composition/application-container.js';
import { ConfigurationLoader } from './infrastructure/configuration/app-config.js';

const SHUTDOWN_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

async function start(): Promise<void> {
  const config = new ConfigurationLoader().load(process.env);
  const container = await ApplicationContainer.create(config);
  await container.migrate();
  const server = container.app.listen(config.port, () => {
    container.logger.info('Forms AI API listening', { port: config.port, aiProvider: config.ai.provider });
  });
  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, () => {
      server.close(() => {
        void container.close().finally(() => process.exit(0));
      });
    });
  }
}

start().catch((error: unknown) => {
  process.stderr.write(`Forms AI failed to start: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exit(1);
});
