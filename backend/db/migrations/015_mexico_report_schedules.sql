-- México comparte las preferencias y la programación de las otras colecciones.
ALTER TABLE report_email_schedules DROP CONSTRAINT IF EXISTS report_email_schedules_area_check;
ALTER TABLE report_email_schedules ADD CONSTRAINT report_email_schedules_area_check
    CHECK (area IN ('finance', 'markets', 'mexico'));
