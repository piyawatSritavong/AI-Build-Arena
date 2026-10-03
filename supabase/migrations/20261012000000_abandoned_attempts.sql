-- Abandoned attempts: the agent failed for a reason outside the challenge (usage/session limit, API rate limit,
-- expired sign-in, agent crash, timeout before any answer was written). The CLI closes the attempt as 'abandoned'
-- instead of submitting an empty answer, so it is neither a pass nor a fail and sets no flag.
-- Every score/Lift/Reliability/Efficiency/baseline query lists the statuses it counts ('passed', 'failed',
-- 'expired'), so abandoned attempts drop out of all of them with no further change. They still count against the
-- hourly attempt limit (counted at start). abandon_reason keeps the CLI's category so the abandon rate per account
-- can be watched later (cherry-picking: abandoning runs that look like they are going badly).

alter type public.attempt_status add value if not exists 'abandoned';

alter table public.attempts add column abandon_reason text
  check (abandon_reason in ('usage_limit', 'rate_limit', 'auth', 'agent_error', 'timeout'));
