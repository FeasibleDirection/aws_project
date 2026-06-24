import { logger } from "../common/powertools";
import type { SagaState } from "./types";

// Compensation: undo the inventory reservation (mocked).
export const handler = async (event: SagaState): Promise<SagaState> => {
  logger.info("compensate: release inventory", { orderId: event.orderId });
  return { ...event, released: true };
};
