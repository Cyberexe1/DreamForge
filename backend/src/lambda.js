import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import serverlessHttp from 'serverless-http';

/**
 * Lambda entrypoint, invoked through a Function URL.
 *
 * A Function URL rather than API Gateway: one less service, and the API only
 * needs plain HTTPS request/response.
 *
 * ⚠️ This function's execution role must have no permission to invoke the
 * creative agent. The agent is started by its schedule alone, and nothing
 * reachable from a browser may trigger it.
 *
 * The JWT secret is fetched from Secrets Manager at cold start rather than
 * passed as a Lambda environment variable, because env vars are readable by
 * anyone with lambda:GetFunctionConfiguration. config.js validates the
 * environment at import time, so the secret has to be in place before the app
 * module loads — hence the top-level await and the dynamic import below.
 */
if (process.env.JWT_SECRET_ARN && !process.env.JWT_SECRET) {
  const client = new SecretsManagerClient({
    region: process.env.AWS_REGION ?? 'us-east-1',
  });

  const result = await client.send(
    new GetSecretValueCommand({ SecretId: process.env.JWT_SECRET_ARN }),
  );

  const raw = (result.SecretString ?? '').trim();
  if (!raw) {
    throw new Error(`Secret ${process.env.JWT_SECRET_ARN} is empty`);
  }

  // Accept either a bare string or {"JWT_SECRET":"..."} so the secret can be
  // rotated in either shape without a redeploy.
  let secret = raw;
  if (raw.startsWith('{')) {
    try {
      secret = JSON.parse(raw).JWT_SECRET ?? raw;
    } catch {
      secret = raw;
    }
  }

  process.env.JWT_SECRET = secret;
}

const { createApp } = await import('./app.js');

export const handler = serverlessHttp(createApp());
