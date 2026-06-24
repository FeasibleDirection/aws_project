/** State threaded through the fulfillment state machine. */
export interface SagaState {
  orderId: string;
  customerId?: string;
  /** Manual-start flag to demo the compensation path. */
  simulateFailAt?: "reserve" | "charge" | "ship";
  reserved?: boolean;
  charged?: boolean;
  shipped?: boolean;
  released?: boolean;
  refunded?: boolean;
  [k: string]: unknown;
}
