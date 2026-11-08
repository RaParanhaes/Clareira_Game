-- Keep every claim, lease, balance and furniture object. Ownership is per unit.
ALTER TABLE lodging_claims DROP CONSTRAINT lodging_claims_profile_id_key;
CREATE INDEX lodging_claims_profile_idx ON lodging_claims(profile_id);
DROP INDEX lodging_leases_active_profile_idx;
CREATE INDEX lodging_leases_profile_active_idx ON lodging_leases(profile_id) WHERE status='active';
-- Existing paid periods retain the same proportion of remaining game time.
UPDATE lodging_leases SET next_charge_at=now()+((next_charge_at-now())/60),
 period_ms=period_ms/60,updated_at=now()
 WHERE status='active' AND period_ms=86400000;
-- Legacy imported rentals may predate recurring lease records.
UPDATE lodging_claims c SET expires_at=now()+((expires_at-now())/60)
 WHERE mode='rent' AND expires_at>now() AND NOT EXISTS
 (SELECT 1 FROM lodging_leases l WHERE l.profile_id=c.profile_id AND l.building_id=c.building_id
  AND l.unit_number=c.unit_number AND l.status='active');
UPDATE lodging_claims c SET expires_at=l.next_charge_at FROM lodging_leases l
 WHERE c.profile_id=l.profile_id AND c.building_id=l.building_id AND c.unit_number=l.unit_number
 AND c.mode='rent' AND l.status='active';
-- Rooms have a stable physical identity. Account home remains a separate room.
ALTER TABLE rooms ADD COLUMN lodging_key text;
ALTER TABLE rooms DROP CONSTRAINT rooms_owner_profile_id_key;
CREATE UNIQUE INDEX rooms_home_owner_idx ON rooms(owner_profile_id) WHERE lodging_key IS NULL;
CREATE UNIQUE INDEX rooms_lodging_key_idx ON rooms(lodging_key) WHERE lodging_key IS NOT NULL;
-- Previously all lodging furniture lived in the account room. Move, never clone, it.
UPDATE rooms r SET lodging_key=c.building_id||':'||c.mode||':'||c.unit_number
 FROM lodging_claims c WHERE c.profile_id=r.owner_profile_id;

UPDATE player_locations p SET room_key='lodging:'||c.building_id||':'||c.unit_number||':'||c.mode||':'||c.profile_id
 FROM lodging_claims c WHERE p.room_key='lodging:'||c.building_id||':'||c.unit_number||':'||c.profile_id;
CREATE TABLE lodging_action_receipts (
 profile_id uuid NOT NULL REFERENCES profiles(id), request_id uuid NOT NULL,
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(profile_id,request_id)
);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='clareira_preview_game') THEN
 GRANT SELECT,INSERT ON lodging_action_receipts TO clareira_preview_game;
END IF; END $$;
