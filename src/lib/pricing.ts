import type { ModelPricing } from "./types";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface CostBreakdown {
  costInputUsd: number;
  costOutputUsd: number;
  costCacheUsd: number;
  costTotalUsd: number;
}

// Cost per the brief's formula, using a model_pricing row for the chat's model.
//   cost_input  = (input  / 1e6) * input_price
//   cost_output = (output / 1e6) * output_price
//   cost_cache  = (cache_read / 1e6) * cache_read_price
//               + (cache_write / 1e6) * cache_write_price
// If a provider has no distinct cache-write cost, its row sets
// cache_write_price = input_price, so write tokens are charged as input.
export function computeCost(
  usage: TokenUsage,
  pricing: ModelPricing | null,
): CostBreakdown {
  if (!pricing) {
    return {
      costInputUsd: 0,
      costOutputUsd: 0,
      costCacheUsd: 0,
      costTotalUsd: 0,
    };
  }
  const costInputUsd =
    (usage.inputTokens / 1_000_000) * pricing.input_price_per_mtok;
  const costOutputUsd =
    (usage.outputTokens / 1_000_000) * pricing.output_price_per_mtok;
  const costCacheUsd =
    (usage.cacheReadTokens / 1_000_000) * pricing.cache_read_price_per_mtok +
    (usage.cacheWriteTokens / 1_000_000) * pricing.cache_write_price_per_mtok;
  const costTotalUsd = costInputUsd + costOutputUsd + costCacheUsd;
  return { costInputUsd, costOutputUsd, costCacheUsd, costTotalUsd };
}

export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
