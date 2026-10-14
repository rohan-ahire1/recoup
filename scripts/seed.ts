// Creates a demo workspace with five months of replayed activity, owned by a
// local user, and prints a sign-in link. Usage: npm run seed [email]
import { createBusiness, createLoginToken, findOrCreateUser, tenantOf } from '../lib/accounts';
import { loginLink } from '../lib/mailer';
import { seedDemo } from '../lib/sample';
import { runAsBusiness } from '../lib/tenant';

async function main() {
  const started = Date.now();
  const user = findOrCreateUser(process.argv[2] || 'dev@example.com');
  const business = createBusiness({ name: 'Ferro Service Co.', ownerId: user.id, demo: true });
  const result = await runAsBusiness(tenantOf(business), () => seedDemo());
  console.log(`Seeded ${result.customers} customers in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  console.log(`Sign in as ${user.email}: ${loginLink(createLoginToken(user.email))}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
