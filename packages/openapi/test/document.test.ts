import { describe, it, expect } from "vitest";
import { buildDocument } from "../src/document";

describe("buildDocument", () => {
  const doc = buildDocument();

  it("is an OpenAPI 3.1 document", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.title).toBe("Orders API");
  });

  it("exposes the five CRUD operations", () => {
    expect(doc.paths["/orders"].get.operationId).toBe("listOrders");
    expect(doc.paths["/orders"].post.operationId).toBe("createOrder");
    expect(doc.paths["/orders/{id}"].get.operationId).toBe("getOrder");
    expect(doc.paths["/orders/{id}"].patch.operationId).toBe("updateOrder");
    expect(doc.paths["/orders/{id}"].delete.operationId).toBe("deleteOrder");
  });

  it("projects component schemas from the Zod SSOT", () => {
    expect(doc.components.schemas.Order).toBeTypeOf("object");
    expect(doc.components.schemas.CreateOrder).toBeTypeOf("object");
    expect(doc.components.schemas.UpdateOrder).toBeTypeOf("object");
  });
});
