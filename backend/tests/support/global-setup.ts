import pg from 'pg';

export default async function resetPostgresTestDatabase(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    return;
  }
  const databaseName = new URL(url).pathname.slice(1);
  if (!databaseName.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL must point to a database whose name ends with _test.');
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }
}
