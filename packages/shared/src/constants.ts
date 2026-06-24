/** Domain constants shared by backend and frontend. */

export const ORDER_STATUSES = ["PENDING", "PAID", "SHIPPED", "CANCELLED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** DynamoDB Orders table partition key attribute name. */
export const TABLE_PK = "id";

/** GSI for per-user access: partition by customerId, sort by createdAt. */
export const GSI_BY_CUSTOMER = "byCustomer";
export const GSI_PK = "customerId";
export const GSI_SK = "createdAt";

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export const ORDER_ID_PREFIX = "ord";
