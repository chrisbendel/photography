-- Photos and series move out of markdown-in-git and into D1. The `published`
-- column replaces the old archive/ vs src/content/photos/ directory split:
-- same distinction, one flag, editable from /studio.

CREATE TABLE IF NOT EXISTS series (
	slug        TEXT PRIMARY KEY,
	title       TEXT NOT NULL,
	description TEXT,
	cover       TEXT,
	sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS photos (
	id         TEXT PRIMARY KEY,          -- 6-char lowercase hex, unchanged
	added      TEXT NOT NULL,             -- ISO date; drives newest-first
	date       TEXT,                      -- when the shutter clicked; display only
	alt        TEXT NOT NULL,
	caption    TEXT,
	camera     TEXT,
	film       TEXT,
	location   TEXT,
	format     TEXT,
	series     TEXT REFERENCES series(slug) ON DELETE SET NULL,
	notes      TEXT,                      -- markdown body → Notes section
	image_key  TEXT NOT NULL,             -- R2 object key
	width      INTEGER,                   -- intrinsic size, to reserve layout
	height     INTEGER,
	published  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS photos_published_added ON photos(published, added DESC);
CREATE INDEX IF NOT EXISTS photos_series ON photos(series);

CREATE TABLE IF NOT EXISTS photo_tags (
	photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
	tag      TEXT NOT NULL,
	PRIMARY KEY (photo_id, tag)
);

CREATE INDEX IF NOT EXISTS photo_tags_tag ON photo_tags(tag);
