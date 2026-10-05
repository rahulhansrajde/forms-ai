import { ApplicationContainer } from './composition/application-container.js';
import { ConfigurationLoader } from './infrastructure/configuration/app-config.js';

async function migrate(): Promise<void> {
  const container = await ApplicationContainer.create(new ConfigurationLoader().load(process.env));
  try {
    const applied = await container.migrate();
    container.logger.info('Database migrations complete', { applied });
  } finally {
    await container.close();
  }
}

migrate().catch((error: unknown) => {
  process.stderr.write(`Migration failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.exit(1);
});
