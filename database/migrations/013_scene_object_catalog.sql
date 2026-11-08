CREATE TABLE object_catalog_state (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0)
);
CREATE TABLE object_templates (
 id text PRIMARY KEY,
 base_id text REFERENCES object_templates(id) DEFERRABLE INITIALLY DEFERRED,
 kind text NOT NULL,
 properties jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(properties)='object'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 archived boolean NOT NULL DEFAULT false
);
CREATE TABLE scene_objects (
 id text PRIMARY KEY,
 template_id text NOT NULL REFERENCES object_templates(id) DEFERRABLE INITIALLY DEFERRED,
 parent_id text REFERENCES scene_objects(id) DEFERRABLE INITIALLY DEFERRED,
 scene_id text NOT NULL,
 properties jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(properties)='object'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 archived boolean NOT NULL DEFAULT false
);
CREATE INDEX scene_objects_parent_idx ON scene_objects(parent_id);
CREATE INDEX scene_objects_scene_idx ON scene_objects(scene_id) WHERE NOT archived;
CREATE INDEX scene_objects_properties_idx ON scene_objects USING gin(properties);
CREATE TABLE object_catalog_history (
 revision bigint PRIMARY KEY,
 actor text NOT NULL,
 changes jsonb NOT NULL,
 previous_snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE room_objects ADD COLUMN properties jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(properties)='object');
-- The application needs the new tables but cannot modify schema_migrations.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='clareira_preview_game') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON object_catalog_state,object_templates,scene_objects,object_catalog_history TO clareira_preview_game;
 END IF;
END $$;
