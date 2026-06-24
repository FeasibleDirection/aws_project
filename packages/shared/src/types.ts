import type { z } from "zod";
import {
  OrderSchema,
  OrderItemSchema,
  CreateOrderSchema,
  UpdateOrderSchema,
} from "./schemas/order";

export type Order = z.infer<typeof OrderSchema>;
export type OrderItem = z.infer<typeof OrderItemSchema>;
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
export type UpdateOrderInput = z.infer<typeof UpdateOrderSchema>;
