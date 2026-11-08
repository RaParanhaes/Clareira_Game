-- Continuous game day: 24 minutes. Preserve today's completed contracts/flows
-- when switching DATE buckets; historical timestamps and journal rows stay intact.
UPDATE resource_contract_completions SET contract_day=DATE '1970-01-01'+floor(extract(epoch FROM now())/1440)::integer
 WHERE contract_day=current_date;
UPDATE economy_daily_flows SET flow_day=DATE '1970-01-01'+floor(extract(epoch FROM now())/1440)::integer
 WHERE flow_day=current_date;
