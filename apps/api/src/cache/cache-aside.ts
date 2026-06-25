import { createClient } from "@redis/client";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { TABLE_PK } from "@app/shared";
import { ddb, TABLE_NAME } from "../db/client";
import { logger } from "../common/powertools";

/**
 * Cache-aside read for hot order lookups: check Valkey first; on a miss read
 * DynamoDB (via the free gateway endpoint) and populate the cache with a TTL.
 * Invoked via a Lambda Function URL: GET ?id=<orderId>.
 */
const endpoint = process.env.CACHE_ENDPOINT;
const TTL_SECONDS = 60;

type CacheClient = ReturnType<typeof createClient>;
let redis: CacheClient | undefined;

async function getRedis(): Promise<CacheClient> {
  if (redis?.isOpen) return redis;
  redis = createClient({ url: `rediss://${endpoint}:6379` });
  redis.on("error", (e) => logger.error("redis error", { error: e }));
  await redis.connect();
  return redis;
}

interface UrlEvent {
  queryStringParameters?: { id?: string } | null;
}

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const handler = async (event: UrlEvent) => {
  const id = event.queryStringParameters?.id;
  if (!id) return json(400, { error: "missing ?id" });

  const cache = await getRedis();
  const key = `order:${id}`;

  const cached = await cache.get(key);
  if (cached) {
    logger.info("cache hit", { id });
    return json(200, { source: "cache", order: JSON.parse(cached) });
  }

  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { [TABLE_PK]: id } }),
  );
  if (!res.Item) return json(404, { error: "not found" });

  await cache.set(key, JSON.stringify(res.Item), { EX: TTL_SECONDS });
  logger.info("cache miss → populated", { id });
  return json(200, { source: "dynamodb", order: res.Item });
};
