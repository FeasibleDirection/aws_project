import { z } from "zod";
import { ORDER_STATUSES } from "../constants";
import { Iso8601, NonEmptyString } from "./common";

/** A single line item on an order. */
export const OrderItemSchema = z
  .object({
    sku: NonEmptyString,
    qty: z.number().int().positive(),
    price: z.number().nonnegative(),
  })
  .meta({ id: "OrderItem" });

export const OrderStatusSchema = z.enum(ORDER_STATUSES).meta({ id: "OrderStatus" });

/** The canonical Order entity — the single declaration everything derives from. */
export const OrderSchema = z
  .object({
    id: z.string().meta({ example: "ord_3f9a1c2e" }),
    customerId: z.string(),
    items: z.array(OrderItemSchema).min(1),
    status: OrderStatusSchema,
    total: z.number().nonnegative(),
    attachmentKey: z.string().optional(),
    createdAt: Iso8601,
    updatedAt: Iso8601,
  })
  .meta({ id: "Order", description: "An order" });

/**
 * Create input = client-supplied fields only. `total` is derived server-side,
 * `status` defaults to PENDING, ids/timestamps are server-owned. In Phase 1
 * `customerId` defaults to "anon"; from Phase 2 it comes from the JWT `sub`.
 */
export const CreateOrderSchema = z
  .object({
    customerId: z.string().min(1).default("anon"),
    items: z.array(OrderItemSchema).min(1),
  })
  .meta({ id: "CreateOrder" });

/** Update input = editable fields, all optional (PATCH); at least one required. */
export const UpdateOrderSchema = z
  .object({
    items: z.array(OrderItemSchema).min(1).optional(),
    status: OrderStatusSchema.optional(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: "At least one field is required",
  })
  .meta({ id: "UpdateOrder" });
