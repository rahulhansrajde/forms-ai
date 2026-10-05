import pg from 'pg';

const urls = [process.env.DATABASE_URL, process.env.TEST_DATABASE_URL].filter((url) => url && url.startsWith('postgres'));

for (const url of urls) {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.slice(1));
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Unsupported database name: ${name}`);
  }
  const maintenance = new URL(url);
  maintenance.pathname = '/postgres';
  const client = new pg.Client({ connectionString: maintenance.toString() });
  await client.connect();
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE ${name}`);
      process.stdout.write(`Created database ${name}\n`);
    } else {
      process.stdout.write(`Database ${name} already exists\n`);
    }
  } finally {
    await client.end();
  }
}
