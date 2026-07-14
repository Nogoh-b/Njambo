export type PaymentProviderId = "mtn_momo" | "orange_money" | "apple" | "google" | "simulated";
export type PaymentStatus = "pending" | "paid" | "refused" | "refunded";

export interface CreatePaymentInput {
  orderId: string;
  amountXaf: number;
  uid: string;
}

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  readonly simulated: boolean;
  createIntent(input: CreatePaymentInput): Promise<{ externalRef: string; status: PaymentStatus }>;
  verify(externalRef: string): Promise<{ status: PaymentStatus; receiptId?: string }>;
}

class SimulationAdapter implements PaymentProvider {
  readonly simulated = true;
  constructor(readonly id: PaymentProviderId) {}
  async createIntent(input: CreatePaymentInput) {
    return { externalRef: `${this.id}_${input.orderId}`, status: "pending" as const };
  }
  async verify(externalRef: string) {
    return { status: "paid" as const, receiptId: `sim_${externalRef}` };
  }
}

// V1 : chaque canal utilise le même simulateur tout en conservant un contrat
// stable. Les adaptateurs réels remplaceront une entrée sans toucher au ledger.
const providers = new Map<PaymentProviderId, PaymentProvider>(
  (["mtn_momo", "orange_money", "apple", "google", "simulated"] as const)
    .map((id) => [id, new SimulationAdapter(id)]),
);

export function paymentProvider(id: string): PaymentProvider | null {
  return providers.get(id as PaymentProviderId) ?? null;
}
