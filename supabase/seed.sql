-- Local dev seed. Real challenge set lands on D3, gear registry on D5.
insert into public.challenges (id, league, category, title, summary, difficulty, time_limit_seconds) values
  ('sample-sum-of-evens', 'global', 'logic', 'Sum of Evens', 'Warm-up: sum the even numbers in a generated list.', 1, 300),
  ('thai-baht-text', 'thai', 'thai-text', 'Baht Text', 'Convert generated amounts into Thai baht text ending in "บาทถ้วน".', 2, 600);

insert into public.gear_registry (id, name, kind, category, capabilities, match_patterns) values
  ('basic-memory', 'Basic Memory', 'mcp', 'memory', '{notes,knowledge-graph}', '{basic-memory}'),
  ('context7', 'Context7', 'mcp', 'docs', '{library-docs}', '{context7}');
