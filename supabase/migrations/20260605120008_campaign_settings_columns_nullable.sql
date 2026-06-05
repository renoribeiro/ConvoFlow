-- Campaigns upgrade (fix): the wizard sends optional settings columns as explicit NULL
-- (e.g. business_hours_start when "horário comercial" is off). An explicit NULL bypasses the
-- column DEFAULT, so NOT NULL columns rejected the insert ("null value in column
-- business_hours_start ... violates not-null constraint"). These settings are all handled as
-- optional by the dispatch engine (null = feature off / use fallback), so relax NOT NULL while
-- keeping the defaults for when the column is omitted.

ALTER TABLE public.mass_message_campaigns
  ALTER COLUMN business_hours_start          DROP NOT NULL,
  ALTER COLUMN business_hours_end            DROP NOT NULL,
  ALTER COLUMN timezone                      DROP NOT NULL,
  ALTER COLUMN message_type                  DROP NOT NULL,
  ALTER COLUMN audience_type                 DROP NOT NULL,
  ALTER COLUMN audience_config               DROP NOT NULL,
  ALTER COLUMN message_templates             DROP NOT NULL,
  ALTER COLUMN min_delay_seconds             DROP NOT NULL,
  ALTER COLUMN max_delay_seconds             DROP NOT NULL,
  ALTER COLUMN enable_message_randomization  DROP NOT NULL,
  ALTER COLUMN respect_business_hours        DROP NOT NULL;
