import DodoPayments from "dodopayments";
import { serverEnv } from "./env";

// DodoPayments client. Live mode unless DODO_PAYMENTS_ENVIRONMENT=test_mode.
// Server-only.
export function createDodoClient() {
  const environment =
    serverEnv.dodoEnvironment === "test_mode" ? "test_mode" : "live_mode";
  return new DodoPayments({
    bearerToken: serverEnv.dodoApiKey,
    environment,
  });
}
