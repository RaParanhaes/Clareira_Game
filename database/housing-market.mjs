import { randomUUID } from 'node:crypto';
import { isCabin } from '../game/cabin-access.mjs';
const fail = (message,status=400)=>Object.assign(new Error(message),{status});
const validPrice = price=>Number.isSafeInteger(price)&&price>=1&&price<=9_999_999;
export function createHousingMarketStore(pool) {
  return {
    async getPropertyRequests(profileId) {
      const {rows}=await pool.query(`SELECT r.*,a.username buyer_name FROM property_purchase_requests r
        JOIN profiles p ON p.id=r.buyer_profile_id JOIN accounts a ON a.id=p.account_id
        WHERE (r.buyer_profile_id=$1 OR r.seller_profile_id=$1) AND r.status IN ('requested','quoted') ORDER BY r.updated_at DESC LIMIT 100`,[profileId]);
      return rows.map(r=>({requestId:r.request_id,buildingId:r.building_id,unitNumber:r.unit_number,
        buyerProfileId:r.buyer_profile_id,sellerProfileId:r.seller_profile_id,buyerName:r.buyer_name,
        askingPriceBronze:r.asking_price_bronze===null?null:Number(r.asking_price_bronze),status:r.status,isBuyer:r.buyer_profile_id===profileId}));
    },
    async requestPropertyPurchase({profileId,buildingId}) {
      if(!isCabin(buildingId))throw fail('Esta propriedade não aceita solicitação.');
      const {rows}=await pool.query(`INSERT INTO property_purchase_requests(request_id,building_id,unit_number,buyer_profile_id,seller_profile_id)
        SELECT $1,c.building_id,c.unit_number,$2,c.profile_id FROM lodging_claims c
        JOIN profiles p ON p.id=$2 AND NOT p.is_guest
        WHERE c.building_id=$3 AND c.mode='owned' AND c.profile_id<>$2
        ON CONFLICT(building_id,buyer_profile_id) DO UPDATE SET
          seller_profile_id=EXCLUDED.seller_profile_id,status=CASE WHEN property_purchase_requests.status IN ('requested','quoted')
          AND property_purchase_requests.seller_profile_id=EXCLUDED.seller_profile_id THEN property_purchase_requests.status ELSE 'requested' END,
          asking_price_bronze=CASE WHEN property_purchase_requests.status IN ('requested','quoted') AND property_purchase_requests.seller_profile_id=EXCLUDED.seller_profile_id
          THEN property_purchase_requests.asking_price_bronze ELSE NULL END,updated_at=now() RETURNING request_id`,[randomUUID(),profileId,buildingId]);
      if(!rows.length)throw fail('Não encontrei outra pessoa como dona desta propriedade.',409);
      return rows[0].request_id;
    },
    async quotePropertyPurchase({profileId,requestId,buildingId,askingPriceBronze,decline=false}) {
      if(!decline&&!validPrice(askingPriceBronze))throw fail('Informe um preço inteiro em bronzes entre 1 e 9.999.999.');
      const {rowCount}=await pool.query(`UPDATE property_purchase_requests r SET asking_price_bronze=$3,status=$4,updated_at=now()
        WHERE r.request_id=$1 AND r.seller_profile_id=$2 AND ($5::text IS NULL OR r.building_id=$5) AND r.status IN ('requested','quoted')
        AND EXISTS(SELECT 1 FROM lodging_claims c WHERE c.building_id=r.building_id AND c.unit_number=r.unit_number AND c.mode='owned' AND c.profile_id=$2)`,
        [requestId,profileId,decline?null:askingPriceBronze,decline?'declined':'quoted',buildingId || null]);
      if(!rowCount)throw fail('A solicitação não está disponível para esta conta.',403);
    },
    async getPropertyRentalListings() {
      const {rows}=await pool.query(`SELECT l.*,a.username owner_name,EXISTS(SELECT 1 FROM lodging_claims t WHERE t.building_id=l.building_id AND t.mode='rent' AND t.expires_at>now()) AS occupied FROM property_rental_listings l
        JOIN lodging_claims c ON c.building_id=l.building_id AND c.unit_number=l.unit_number AND c.mode='owned' AND c.profile_id=l.owner_profile_id
        JOIN profiles p ON p.id=l.owner_profile_id JOIN accounts a ON a.id=p.account_id
        ORDER BY l.building_id LIMIT 100`);
      return rows.map(r=>({buildingId:r.building_id,unitNumber:r.unit_number,ownerProfileId:r.owner_profile_id,ownerName:r.owner_name,occupied:r.occupied,rentBronze:Number(r.rent_bronze)}));
    },
    async listPropertyRental({profileId,buildingId,rentBronze,remove=false}) {
      if(!isCabin(buildingId)||(!remove&&!validPrice(rentBronze)))throw fail('Informe uma cabana sua e um aluguel válido em bronzes.');
      if(remove){const owner=await pool.query("SELECT 1 FROM lodging_claims WHERE building_id=$1 AND profile_id=$2 AND mode='owned'",[buildingId,profileId]);if(!owner.rowCount)throw fail('Somente o dono pode retirar o anúncio de aluguel.',403);await pool.query('DELETE FROM property_rental_listings WHERE building_id=$1 AND owner_profile_id=$2',[buildingId,profileId]);return;}
      const {rowCount}=await pool.query(`INSERT INTO property_rental_listings(building_id,unit_number,owner_profile_id,rent_bronze)
        SELECT building_id,unit_number,profile_id,$3 FROM lodging_claims WHERE building_id=$1 AND profile_id=$2 AND mode='owned'
        ON CONFLICT(building_id,unit_number) DO UPDATE SET owner_profile_id=EXCLUDED.owner_profile_id,rent_bronze=EXCLUDED.rent_bronze,updated_at=now()`,[buildingId,profileId,rentBronze]);
      if(!rowCount)throw fail('Somente o dono pode anunciar o aluguel.',403);
    },
  };
}
