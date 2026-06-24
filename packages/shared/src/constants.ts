/** Domain constants shared by backend and frontend. */

export const ORDER_STATUSES = ["PENDING", "PAID", "SHIPPED", "CANCELLED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** DynamoDB Orders table partition key attribute name. */
export const TABLE_PK = "id";

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export const ORDER_ID_PREFIX = "ord";
