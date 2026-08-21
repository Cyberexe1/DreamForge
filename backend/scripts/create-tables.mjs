import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  UpdateContinuousBackupsCommand,
} from '@aws-sdk/client-dynamodb';

/**
 * Creates both DynamoDB tables.
 *
 * Idempotent: an existing table is reported and left completely untouched — no
 * updates, no deletes. Safe to re-run.
 *
 * infra/template.yaml is the source of truth for deployed environments. This
 * script exists so local development can run against real DynamoDB today,
 * before the SAM template is written.
 *
 * Usage:  node scripts/create-tables.mjs
 * Env:    AWS_REGION (default us-east-1), AWS_PROFILE, USERS_TABLE, HISTORY_TABLE
 */

const region = process.env.AWS_REGION ?? 'us-east-1';
const client = new DynamoDBClient({ region });

const TABLES = [
  {
    name: process.env.USERS_TABLE ?? 'dreamforge-users',
    purpose: 'accounts, hashed passwords, saved capsules',
    keys: [{ AttributeName: 'email', KeyType: 'HASH' }],
    attributes: [{ AttributeName: 'email', AttributeType: 'S' }],
    // Real user credentials live here, so recovery and a delete guard are worth it.
    pointInTimeRecovery: true,
    deletionProtection: true,
  },
  {
    name: process.env.HISTORY_TABLE ?? 'dreamforge-history',
    purpose: "the agent's memory and run history",
    keys: [
      { AttributeName: 'pk', KeyType: 'HASH' },
      { AttributeName: 'sk', KeyType: 'RANGE' },
    ],
    attributes: [
      { AttributeName: 'pk', AttributeType: 'S' },
      { AttributeName: 'sk', AttributeType: 'S' },
    ],
    // Regenerable from S3 capsules, so no need for PITR or a delete guard.
    pointInTimeRecovery: false,
    deletionProtection: false,
  },
];

async function describe(name) {
  try {
    const { Table } = await client.send(new DescribeTableCommand({ TableName: name }));
    return Table ?? null;
  } catch (err) {
    if (err?.name === 'ResourceNotFoundException') return null;
    throw err;
  }
}

async function waitForActive(name, attempts = 30) {
  for (let i = 0; i < attempts; i += 1) {
    const table = await describe(name);
    if (table?.TableStatus === 'ACTIVE') return true;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return false;
}

async function create(spec) {
  const existing = await describe(spec.name);
  if (existing) {
    console.log(`  = ${spec.name} already exists (${existing.TableStatus}) — untouched`);
    return;
  }

  await client.send(
    new CreateTableCommand({
      TableName: spec.name,
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: spec.keys,
      AttributeDefinitions: spec.attributes,
      SSESpecification: { Enabled: true },
      DeletionProtectionEnabled: spec.deletionProtection,
      Tags: [
        { Key: 'project', Value: 'dreamforge' },
        { Key: 'managed-by', Value: 'create-tables-script' },
      ],
    }),
  );

  console.log(`  + ${spec.name} created, waiting for ACTIVE...`);

  if (!(await waitForActive(spec.name))) {
    console.warn(`  ! ${spec.name} did not reach ACTIVE within 60s — check the console`);
    return;
  }

  if (spec.pointInTimeRecovery) {
    try {
      await client.send(
        new UpdateContinuousBackupsCommand({
          TableName: spec.name,
          PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
        }),
      );
      console.log(`  + ${spec.name} point-in-time recovery enabled`);
    } catch (err) {
      console.warn(`  ! ${spec.name} PITR could not be enabled: ${err?.name}`);
    }
  }

  console.log(`  ✓ ${spec.name} ACTIVE`);
}

async function main() {
  console.log(`region: ${region}`);
  console.log(`profile: ${process.env.AWS_PROFILE ?? 'default'}\n`);

  for (const spec of TABLES) {
    console.log(`${spec.name} — ${spec.purpose}`);
    await create(spec);
    console.log('');
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(`\nFailed: ${err?.name ?? 'Error'} — ${err?.message ?? err}`);
  if (err?.name === 'AccessDeniedException' || err?.name === 'UnrecognizedClientException') {
    console.error('Check that AWS credentials are configured and the user has dynamodb:CreateTable.');
  }
  process.exitCode = 1;
});
