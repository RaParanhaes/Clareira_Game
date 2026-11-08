CREATE TABLE property_purchase_requests (
 request_id uuid PRIMARY KEY, building_id text NOT NULL,unit_number integer NOT NULL,
 buyer_profile_id uuid NOT NULL REFERENCES profiles(id), seller_profile_id uuid NOT NULL REFERENCES profiles(id),
 asking_price_bronze bigint CHECK(asking_price_bronze BETWEEN 1 AND 9999999),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','quoted','declined','completed')),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(building_id,buyer_profile_id),
 CHECK(buyer_profile_id<>seller_profile_id),CHECK(status<>'quoted' OR asking_price_bronze IS NOT NULL)
);
CREATE INDEX property_requests_seller_idx ON property_purchase_requests(seller_profile_id,status);
CREATE TABLE property_rental_listings (
 building_id text NOT NULL, unit_number integer NOT NULL,owner_profile_id uuid NOT NULL REFERENCES profiles(id),
 rent_bronze bigint NOT NULL CHECK(rent_bronze BETWEEN 1 AND 9999999),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(building_id,unit_number)
);
ALTER TABLE lodging_leases ADD COLUMN landlord_profile_id uuid REFERENCES profiles(id);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='clareira_preview_game') THEN
 GRANT SELECT,INSERT,UPDATE ON property_purchase_requests TO clareira_preview_game;
 GRANT SELECT,INSERT,UPDATE,DELETE ON property_rental_listings TO clareira_preview_game;
END IF; END $$;
