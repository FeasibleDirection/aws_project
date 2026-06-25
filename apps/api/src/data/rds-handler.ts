import { Client } from "pg";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { logger } from "../common/powertools";

/**
 * VPC Lambda that reaches Aurora THROUGH RDS Proxy. Lambda concurrency would
 * otherwise exhaust Postgres connections — RDS Proxy pools/multiplexes them.
 * Credentials come from Secrets Manager (read via the VPC interface endpoint,
 * so no NAT). Demonstrates the SQL read-model / relational alternative.
 */
const sm = new SecretsManagerClient({});
let creds: { username: string; password: string } | undefined;

async function getCreds() {
  if (creds) return creds;
  const res = await sm.send(
    new GetSecretValueCommand({ SecretId: process.env.SECRET_ARN }),
  );
  const parsed = JSON.parse(res.SecretString ?? "{}") as {
    username: string;
    password: string;
  };
  creds = { username: parsed.username, password: parsed.password };
  return creds;
}

export const handler = async (): Promise<{
  ok: boolean;
  via: string;
  version?: string;
  now?: string;
}> => {
  const c = await getCreds();
  const client = new Client({
    host: process.env.PROXY_ENDPOINT,
    port: 5432,
    user: c.username,
    password: c.password,
    database: process.env.DB_NAME ?? "orders",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  try {
    const r = await client.query<{ version: string; now: string }>(
      "SELECT version() AS version, now()::text AS now",
    );
    logger.info("rds query ok via proxy");
    return { ok: true, via: "rds-proxy", version: r.rows[0]?.version, now: r.rows[0]?.now };
  } finally {
    await client.end();
  }
};
