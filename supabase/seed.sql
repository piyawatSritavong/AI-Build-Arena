-- Local dev seed. Challenges come from code: pnpm --filter @arena/challenges sync. Gear registry lands on D5.
insert into public.gear_registry (id, name, kind, category, capabilities, match_patterns) values
  ('basic-memory', 'Basic Memory', 'mcp', 'memory', '{notes,knowledge-graph}', '{basic-memory}'),
  ('context7', 'Context7', 'mcp', 'docs', '{library-docs}', '{context7}');
