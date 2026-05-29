UPDATE attendees
SET seat_number = CONCAT('UNASSIGNED-', id)
WHERE seat_number IS NULL OR TRIM(seat_number) = '';

ALTER TABLE attendees
  ALTER COLUMN seat_number SET NOT NULL,
  ADD COLUMN IF NOT EXISTS tag VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pass_template VARCHAR(80),
  ADD COLUMN IF NOT EXISTS pass_details JSONB DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendees_event_seat
  ON attendees(event_id, LOWER(seat_number));
