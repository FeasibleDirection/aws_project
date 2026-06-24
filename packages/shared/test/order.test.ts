import { describe, it, expect } from "vitest";
import {
  CreateOrderSchema,
  UpdateOrderSchema,
  OrderSchema,
} from "../src/schemas/order";

describe("CreateOrderSchema", () => {
  it("accepts a valid order and defaults customerId to anon", () => {
    const parsed = CreateOrderSchema.parse({
      items: [{ sku: "ABC", qty: 2, price: 9.99 }],
    });
    expect(parsed.customerId).toBe("anon");
    expect(parsed.items).toHaveLength(1);
  });

  it("rejects an empty items array", () => {
    expect(() => CreateOrderSchema.parse({ items: [] })).toThrow();
  });

  it("rejects non-positive quantities", () => {
    expect(() =>
      CreateOrderSchema.parse({ items: [{ sku: "A", qty: 0, price: 1 }] }),
    ).toThrow();
  });
});

describe("UpdateOrderSchema", () => {
  it("requires at least one field", () => {
    expect(() => UpdateOrderSchema.parse({})).toThrow();
  });

  it("accepts a status-only update", () => {
    expect(UpdateOrderSchema.parse({ status: "PAID" })).toEqual({
      status: "PAID",
    });
  });
});

describe("OrderSchema", () => {
  it("round-trips a full order", () => {
    const order = {
      id: "ord_1",
      customerId: "anon",
      items: [{ sku: "A", qty: 1, price: 1 }],
      status: "PENDING" as const,
      total: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(OrderSchema.parse(order)).toMatchObject({ id: "ord_1" });
  });
});
