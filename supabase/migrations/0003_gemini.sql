-- Add Google Gemini as a supported provider.
-- 1) widen the llm_credentials.provider CHECK constraint
-- 2) seed Gemini model pricing (USD per 1M tokens; cache-read ≈ 0.25× input,
--    cache-write = input since Gemini has no distinct cache-write price here).

alter table llm_credentials drop constraint if exists llm_credentials_provider_check;
alter table llm_credentials add constraint llm_credentials_provider_check
  check (provider in ('anthropic','openai','moonshot','gemini','custom'));

insert into model_pricing
  (provider, model_id, display_name, input_price_per_mtok, output_price_per_mtok,
   cache_read_price_per_mtok, cache_write_price_per_mtok, context_window, is_active)
values
  ('gemini','gemini-pro-latest','Gemini Pro (latest)',      1.25, 10.00, 0.3125, 1.25, 1000000, true),
  ('gemini','gemini-2.5-flash','Gemini 2.5 Flash',          0.30,  2.50, 0.075,  0.30, 1000000, true),
  ('gemini','gemini-flash-latest','Gemini Flash (latest)',  0.30,  2.50, 0.075,  0.30, 1000000, true),
  ('gemini','gemini-2.5-flash-lite','Gemini 2.5 Flash-Lite',0.10,  0.40, 0.025,  0.10, 1000000, true)
on conflict (provider, model_id) do update set
  display_name              = excluded.display_name,
  input_price_per_mtok      = excluded.input_price_per_mtok,
  output_price_per_mtok     = excluded.output_price_per_mtok,
  cache_read_price_per_mtok = excluded.cache_read_price_per_mtok,
  cache_write_price_per_mtok= excluded.cache_write_price_per_mtok,
  context_window            = excluded.context_window,
  is_active                 = excluded.is_active;
