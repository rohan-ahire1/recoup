// Wipes the local database and replays the demo business (about five months of activity).
import { defaultTenant } from '../lib/auth';
import { seedDemo } from '../lib/sample';
import { runAsBusiness } from '../lib/tenant';

async function main() {
  const started = Date.now();
  const result = await runAsBusiness(defaultTenant(), () => seedDemo());
  console.log(`Seeded ${result.customers} customers in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
