import { createApp } from './app.js';
import { config } from './config.js';

/** Local development entrypoint. In AWS the app runs via src/lambda.js instead. */
const app = createApp();

app.listen(config.port, () => {
  console.log(`[backend] listening on http://localhost:${config.port}`);
  console.log(`[backend] region=${config.region} usersTable=${config.tables.users}`);
  console.log(`[backend] allowed origins: ${config.allowedOrigins.join(', ')}`);
  console.log(`[backend] bcrypt cost: ${config.password.bcryptCost}`);
});
