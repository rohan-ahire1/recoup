// Wipes the local database and replays the demo business (about five months of activity).
import { seedDemo } from '../lib/sample';

async function main() {
  const started = Date.now();
  const result = await seedDemo();
  console.log(`Seeded ${result.customers} customers in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
