import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { config } from './config.js';

/**
 * One client, created at module scope so warm Lambda invocations reuse the
 * connection pool. Credentials come from the execution role — never from code.
 */
const client = new DynamoDBClient({ region: config.region });

export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

export const USERS_TABLE = config.tables.users;
