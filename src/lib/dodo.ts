import DodoPayments from "dodopayments";
import { serverEnv } from "./env";

// DodoPayments client (test/sandbox mode by default). Server-only.
export function createDodoClient() {
  const environment =
    serverEnv.dodoEnvironment === "live_mode" ? "live_mode" : "test_mode";
  return new DodoPayments({
    bearerToken: serverEnv.dodoApiKey,
    environment,
  });
}
