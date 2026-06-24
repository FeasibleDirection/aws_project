import { logger } from "../common/powertools";
import type { SagaState } from "./types";

// Forward step 2: charge payment (mocked). Throwing here triggers the
// compensation path (release inventory).
export const handler = async (event: SagaState): Promise<SagaState> => {
  logger.info("charge payment", { orderId: event.orderId });
  if (event.simulateFailAt === "charge") throw new Error("payment declined");
  return { ...event, charged: true };
};
