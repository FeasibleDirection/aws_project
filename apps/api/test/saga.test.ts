import { describe, it, expect, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { handler as reserve } from "../src/saga/reserve";
import { handler as charge } from "../src/saga/charge";
import { handler as ship } from "../src/saga/ship";
import { handler as release } from "../src/saga/release-inventory";
import { handler as refund } from "../src/saga/refund";

const ddbMock = mockClient(DynamoDBDocumentClient);
beforeEach(() => ddbMock.reset());

describe("saga steps", () => {
  it("reserve marks reserved and threads state", async () => {
    expect(await reserve({ orderId: "o1", customerId: "u1" })).toMatchObject({
      orderId: "o1",
      reserved: true,
    });
  });

  it("charge throws on simulateFailAt=charge (drives compensation)", async () => {
    await expect(
      charge({ orderId: "o1", simulateFailAt: "charge" }),
    ).rejects.toThrow();
  });

  it("ship updates the order to SHIPPED", async () => {
    ddbMock.on(UpdateCommand).resolves({});
    const res = await ship({ orderId: "o1" });
    expect(res.shipped).toBe(true);
    const input = ddbMock.commandCalls(UpdateCommand)[0]!.args[0].input;
    expect(input.ExpressionAttributeValues?.[":shipped"]).toBe("SHIPPED");
    expect(input.ExpressionAttributeNames?.["#s"]).toBe("status");
  });

  it("compensation steps mark released/refunded", async () => {
    expect(await release({ orderId: "o1" })).toMatchObject({ released: true });
    expect(await refund({ orderId: "o1" })).toMatchObject({ refunded: true });
  });
});
