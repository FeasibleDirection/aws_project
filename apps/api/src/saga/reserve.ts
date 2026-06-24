import { logger } from "../common/powertools";
import type { SagaState } from "./types";

// Forward step 1: reserve inventory (mocked).
export const handler = async (event: SagaState): Promise<SagaState> => {
  logger.info("reserve inventory", { orderId: event.orderId });
  if (event.simulateFailAt === "reserve") throw new Error("inventory unavailable");
  return { ...event, reserved: true };
};
