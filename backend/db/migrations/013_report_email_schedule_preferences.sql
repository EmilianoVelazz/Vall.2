-- Las ediciones personales pueden enviarse una vez al día, en días hábiles,
-- semanalmente o con cada corte editorial. La hora y el día viven en el JSON
-- de preferencias; este campo queda como índice resumido para consultas.
ALTER TABLE report_email_schedules
    DROP CONSTRAINT IF EXISTS report_email_schedules_interval_hours_check;

ALTER TABLE report_email_schedules
    ADD CONSTRAINT report_email_schedules_interval_hours_check
    CHECK (interval_hours IN (12, 24, 168));
