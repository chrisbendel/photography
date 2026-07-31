-- Format, lens and film together say everything the body did — a 4×5 Wista is
-- implied by "4x5". Swap the camera column for a lens one.
ALTER TABLE photos DROP COLUMN camera;
ALTER TABLE photos ADD COLUMN lens TEXT;
