import { randomUUID } from 'node:crypto';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient, USERS_TABLE } from '../db.js';

/**
 * Users table — partition key `email` (lowercased).
 *
 * Email is the key because login is by email and it must be unique; that makes
 * account creation a single conditional Put with no read-then-write race.
 *
 * Item shape:
 *   email          S   partition key, lowercased
 *   userId         S   uuid, stable even if we later allow email changes
 *   name           S
 *   passwordHash   S   scrypt$N$r$p$salt$hash — never leaves this module
 *   createdAt      S   ISO
 *   lastLoginAt    S   ISO
 *   savedDates     L   capsule dates the user bookmarked
 *   loginCount     N
 */

/** Strips the password hash. Everything leaving this module goes through here. */
function toPublicUser(item) {
  if (!item) return null;
  return {
    userId: item.userId,
    email: item.email,
    name: item.name,
    createdAt: item.createdAt,
    lastLoginAt: item.lastLoginAt ?? null,
    savedDates: Array.isArray(item.savedDates) ? item.savedDates : [],
    loginCount: item.loginCount ?? 0,
  };
}

export class EmailTakenError extends Error {
  constructor() {
    super('Email already registered');
    this.name = 'EmailTakenError';
    this.status = 409;
  }
}

/** Internal use only — the returned item contains the password hash. */
async function findRaw(email) {
  const { Item } = await docClient.send(
    new GetCommand({ TableName: USERS_TABLE, Key: { email } }),
  );
  return Item ?? null;
}

export async function findByEmail(email) {
  return toPublicUser(await findRaw(email));
}

/**
 * Returns the stored hash for verification, or null if no such account.
 * The caller must not log or return the hash.
 */
export async function findCredentials(email) {
  const item = await findRaw(email);
  if (!item) return null;
  return { passwordHash: item.passwordHash, user: toPublicUser(item) };
}

export async function createUser({ email, name, passwordHash }) {
  const now = new Date().toISOString();
  const item = {
    email,
    userId: randomUUID(),
    name,
    passwordHash,
    createdAt: now,
    lastLoginAt: null,
    savedDates: [],
    loginCount: 0,
  };

  try {
    await docClient.send(
      new PutCommand({
        TableName: USERS_TABLE,
        Item: item,
        // Atomic uniqueness check — no read-then-write window.
        ConditionExpression: 'attribute_not_exists(email)',
      }),
    );
  } catch (err) {
    if (err?.name === 'ConditionalCheckFailedException') throw new EmailTakenError();
    throw err;
  }

  return toPublicUser(item);
}

export async function recordLogin(email) {
  const { Attributes } = await docClient.send(
    new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { email },
      UpdateExpression:
        'SET lastLoginAt = :now ADD loginCount :one',
      ExpressionAttributeValues: { ':now': new Date().toISOString(), ':one': 1 },
      ReturnValues: 'ALL_NEW',
    }),
  );
  return toPublicUser(Attributes);
}

/** Used only to upgrade a hash to a stronger scheme during a successful login. */
export async function updatePasswordHash(email, passwordHash) {
  await docClient.send(
    new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { email },
      UpdateExpression: 'SET passwordHash = :hash',
      ExpressionAttributeValues: { ':hash': passwordHash },
      ConditionExpression: 'attribute_exists(email)',
    }),
  );
}

export async function updateName(email, name) {
  const { Attributes } = await docClient.send(
    new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { email },
      UpdateExpression: 'SET #name = :name',
      // "name" is a DynamoDB reserved word.
      ExpressionAttributeNames: { '#name': 'name' },
      ExpressionAttributeValues: { ':name': name },
      ConditionExpression: 'attribute_exists(email)',
      ReturnValues: 'ALL_NEW',
    }),
  );
  return toPublicUser(Attributes);
}

/**
 * Bookmarks a capsule date. list_append on an if_not_exists base keeps this a
 * single round trip, and the guard prevents duplicates without a read first.
 */
export async function saveCapsule(email, date) {
  try {
    const { Attributes } = await docClient.send(
      new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { email },
        UpdateExpression:
          'SET savedDates = list_append(if_not_exists(savedDates, :empty), :entry)',
        ConditionExpression: 'attribute_exists(email) AND NOT contains(savedDates, :date)',
        ExpressionAttributeValues: { ':empty': [], ':entry': [date], ':date': date },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return toPublicUser(Attributes);
  } catch (err) {
    // Already saved, or the list attribute does not exist yet on an older item.
    if (err?.name === 'ConditionalCheckFailedException') {
      const existing = await findByEmail(email);
      if (existing && !existing.savedDates.includes(date)) {
        return setSavedDates(email, [...existing.savedDates, date]);
      }
      return existing;
    }
    throw err;
  }
}

export async function unsaveCapsule(email, date) {
  const user = await findByEmail(email);
  if (!user) return null;
  if (!user.savedDates.includes(date)) return user;
  return setSavedDates(
    email,
    user.savedDates.filter((d) => d !== date),
  );
}

async function setSavedDates(email, dates) {
  const { Attributes } = await docClient.send(
    new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { email },
      UpdateExpression: 'SET savedDates = :dates',
      ExpressionAttributeValues: { ':dates': dates },
      ConditionExpression: 'attribute_exists(email)',
      ReturnValues: 'ALL_NEW',
    }),
  );
  return toPublicUser(Attributes);
}

export async function deleteUser(email) {
  await docClient.send(new DeleteCommand({ TableName: USERS_TABLE, Key: { email } }));
}
