import { spawn, spawnSync } from 'node:child_process';
import { createTestDb } from './test-db';
import { upsertRecall } from './upsert-recall';

const { db, cleanup } = await createTestDb();
let server: ReturnType<typeof spawn> | undefined;

try {
  await upsertRecall(
    db,
    {
      RecallID: 1,
      RecallNumber: '26-001',
      Title: 'Acme recalls infant cribs due to entrapment hazard',
      Description: 'Compare the model number on the crib label with AC-123 before use.',
      RecallDate: '2026-10-01T00:00:00',
      Products: [{ Name: 'Acme Convertible Crib', Model: 'AC-123' }],
      Hazards: [{ Name: 'Children can become trapped, posing an entrapment hazard.' }],
      RemedyOptions: [{ Option: 'Refund' }],
      Remedies: [{ Name: 'Stop using the crib and contact Acme for a refund.' }],
      ConsumerContact: `Contact Acme at https://example.com/${'contact'.repeat(30)}`,
      Images: [
        {
          URL: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="600"%3E%3Crect width="800" height="600" fill="gray"/%3E%3C/svg%3E',
          Caption: 'Front view of the recalled crib',
        },
      ],
    },
    '2026-10-02T12:00:00.000Z'
  );
  await upsertRecall(
    db,
    {
      RecallID: 2,
      Title: 'Bobo recalls strollers due to fall hazard',
      RecallDate: '2026-09-01T00:00:00',
      Hazards: [{ Name: 'The frame can collapse, posing a fall hazard.' }],
    },
    '2026-10-02T12:00:00.000Z'
  );

  const database = await db.run('PRAGMA database_list');
  const file = database.rows[0]?.file;
  if (typeof file !== 'string' || !file) throw new Error('Test database file not found');
  const build = spawnSync('npm', ['run', 'build'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: `file:${file}`, DATABASE_AUTH_TOKEN: '' },
  });
  if (build.status !== 0) throw new Error('Accessibility fixture build failed');

  server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4322'], {
    stdio: 'inherit',
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => server?.kill(signal));
  }
  const code = await new Promise<number | null>((resolve, reject) => {
    server!.once('error', reject);
    server!.once('exit', resolve);
  });
  if (code !== null && code !== 0) process.exitCode = code;
} finally {
  server?.kill();
  cleanup();
}
