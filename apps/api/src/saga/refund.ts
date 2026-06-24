import { logger } from "../common/powertools";
import type { SagaState } from "./types";

// Compensation: refund the charge (mocked).
export const handler = async (event: SagaState): Promise<SagaState> => {
  logger.info("compensate: refund payment", { orderId: event.orderId });
  return { ...event, refunded: true };
};
