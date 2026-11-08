// Curated, data-only medieval furniture catalogue. Each record is a distinct
// buildable design with its own silhouette profile, dimensions, material and use.
const families=[
 ['cadeiras','Cadeiras','chair','sit',.72,.72,2.15,['cadeira de espaldar alto','cadeira de braços','cadeira de palhinha','cadeira torneada','cadeira de escriba','cadeira de couro','cadeira dobrável','cadeira de guarda','cadeira entalhada','cadeira de banquete']],
 ['tronos','Tronos','chair','sit',1.12,1.05,2.65,['trono do carvalho','trono do cervo','trono do corvo','trono de pedra','trono de cobre','trono da rainha','trono do conselho','trono das raízes','trono de guerra','trono cerimonial']],
 ['bancos','Bancos e banquetas','stool','sit',.9,.68,1.05,['banqueta de três pés','banco de tanoeiro','banco de viagem','banco entalhado','banco de ordenha','banco de couro','banco baixo','banco de toras','banco de praça','banco de taverna']],
 ['sofas','Sofás e divãs','sofa','sit',1.75,.95,1.75,['divã de lã','sofá de taverna','divã bordado','banco estofado','sofá de caça','divã de veludo','sofá de viagem','banco com almofadas','divã real','sofá de tapeçaria']],
 ['mesas','Mesas','table','none',1.55,1.12,1.4,['mesa de jantar','mesa de banquete','mesa redonda','mesa de cavalete','mesa de carvalho','mesa de nogueira','mesa de taverna','mesa dobrável','mesa de conselho','mesa de casamento']],
 ['escrivaninhas','Escrivaninhas','desk','none',1.35,.82,1.45,['mesa de escriba','escrivaninha de mapas','bancada de monge','mesa de alquimista','púlpito de leitura','mesa de cartógrafo','escrivaninha com gavetas','bancada de gravura','mesa de arquivo','escrivaninha de cedro']],
 ['aparadores','Aparadores','table','none',1.3,.65,1.25,['aparador de louça','mesa de serviço','bancada de cozinha','mesa de poções','bancada de ferreiro','mesa de açougueiro','mesa de ervas','aparador de salão','mesa de instrumentos','bancada de costura']],
 ['bancadas','Bancadas','desk','none',1.7,.78,1.35,['bancada de carpinteiro','bancada de armas','bancada de curtidor','bancada de boticário','bancada de padeiro','mesa de oleiro','bancada de joias','bancada de remendos','mesa de entalhador','bancada de lavoura']],
 ['camas','Camas','bed','lie',1.9,1.3,1.1,['cama de palha','cama de dossel','cama de casal','cama de campanha','cama de castelo','cama de viagem','cama de tapeçaria','cama de plumas','cama de carvalho','cama de estalagem']],
 ['bercos','Berços','bed','lie',1.1,.85,1.2,['berço de balanço','berço de vime','berço com dossel','berço de pinho','berço entalhado','cestinho de dormir','berço de viagem','berço de carvalho','berço com cortinas','berço de herdeiro']],
 ['baus','Baús e arcas','chest','none',1.1,.75,1.05,['baú de viagem','arca de enxoval','baú ferrado','cofre de moedas','arca de cedro','baú de marinheiro','caixa de ferramentas','arca de mantimentos','baú de guerra','cofre de relíquias']],
 ['armarios','Armários','wardrobe','none',1.15,.9,2.75,['armário de mantos','roupeiro de pinho','armário de armas','guarda-roupa real','armário de boticário','armário de louças','armário de arquivo','roupeiro de viagem','armário de mantimentos','guarda-roupa entalhado']],
 ['estantes','Estantes e prateleiras','bookshelf','none',1.25,.66,2.55,['estante de pergaminhos','estante de biblioteca','prateleira de poções','estante de mapas','estante de capela','nicho de livros','estante de ervas','estante de armas','estante de curiosidades','arquivo monástico']],
 ['banheiras','Banheiras e duchas','shower','bathe',1.25,1.05,1.15,['banheira de cobre','tina de carvalho','banheira de pedra','banheira de viagem','ofurô medieval','banheira com pés','tina de banho duplo','banheira esmaltada','banheira de ervas','banheira real']],
 ['lavatorios','Lavatórios','shower','wash',.85,.75,1.25,['lavatório de pedra','bacia de cobre','lavatório de viagem','fonte de lavar mãos','bacia de cerâmica','lavatório com espelho','pila de mármore','lavabo de capela','lavatório de latão','bacia de aposento']],
 ['tochas','Tochas e archotes','lamp','light',.42,.42,2.55,['tocha de parede','archote de ferro','tocha de resina','tocha de guarda','tocha de salão','tocha de bronze','tocha de vigia','tocha de corredor','tocha de carvalho','tocha de estandarte']],
 ['velas','Velas e castiçais','lamp','light',.42,.42,1.3,['vela de sebo','castiçal de ferro','vela de cera de abelha','castiçal de mesa','vela votiva','castiçal de altar','vela aromática','candelinha de viagem','castiçal de bronze','vela de vigília']],
 ['lanternas','Lanternas','lamp','light',.55,.55,1.7,['lanterna de mão','lanterna de carroça','lanterna de vidro','lanterna de cobre','lanterna de vigia','lanterna de mina','lanterna de taverna','lanterna de gancho','lanterna de peregrino','lanterna de ferro']],
 ['candelabros','Candelabros','lamp','light',.85,.85,1.8,['candelabro de três braços','candelabro de altar','candelabro de ferro','candelabro de latão','candelabro de sete velas','candelabro de mesa','candelabro de procissão','candelabro de prata','candelabro de capela','candelabro de festa']],
 ['lustres','Lustres','lamp','light',1.05,1.05,2.35,['lustre de ferro','lustre de chifres','lustre de corrente','lustre de rodas','lustre de salão','lustre de cobre','lustre de cristal','lustre de taverna','lustre de carvalho','lustre de banquete']],
];
const woods=['cedar','pine','hotel','vista'];
const colors=[
 {dark:'#49382e',wood:'#815a3d',light:'#bd8b58',fabric:'#a9574b',accent:'#e0bd75',stone:'#70736a'},
 {dark:'#403a31',wood:'#715538',light:'#a98550',fabric:'#547664',accent:'#d1b874',stone:'#687162'},
 {dark:'#40342f',wood:'#74533e',light:'#c09a62',fabric:'#5a7181',accent:'#ead19a',stone:'#697074'},
 {dark:'#393641',wood:'#685d59',light:'#ad9877',fabric:'#64678a',accent:'#d8bf91',stone:'#696875'},
];
const rows=[];
const lightProfiles={
 tochas:{kind:'torch',height:2.35,reach:4.6,strength:.82,color:'#ff9b50',flicker:.18},
 velas:{kind:'candle',height:1.05,reach:2.8,strength:.42,color:'#ffd27c',flicker:.1},
 lanternas:{kind:'lantern',height:1.55,reach:4.8,strength:.7,color:'#ffc16d',flicker:.08},
 candelabros:{kind:'candelabra',height:1.65,reach:5.2,strength:.78,color:'#ffd083',flicker:.13},
 lustres:{kind:'chandelier',height:2.2,reach:6.4,strength:.88,color:'#ffd38b',flicker:.15},
};
const capabilityFor=(use,family)=>({
  sit:{seats:family==='tronos'?1:family==='sofas'?2:1,pose:'sit'},
  lie:{pose:'lie',covers:family==='camas',sleep:true},
  bathe:{pose:'bathe',water:true},wash:{pose:'wash',water:true},
  light:{toggle:true,source:lightProfiles[family]},
}[use]||{});
for(const [category,categoryLabel,renderKind,use,width,depth,height,names] of families){
 for(let i=0;i<10;i++){
  const n=i+1,id=`furniture.medieval-${category}-${String(n).padStart(2,'0')}`,catalogId=id;
  const light=lightProfiles[category];
  rows.push(Object.freeze({id,catalogId,label:`${names[i]}${i>0?` ${['I','II','III','IV','V','VI','VII','VIII','IX'][i-1]}`:''}`,category,categoryLabel,family:category,variantIndex:i,renderKind,use,capabilities:capabilityFor(use,category),...(light?{light:{...light,height:Math.min(height,light.height),reach:light.reach*(1+(i%3)*.04),strength:light.strength*(1+(i%2)*.04),flicker:light.flicker}}:{}),dimension:{native:['surface'],purchaseIn:['surface'],crossDimensionImport:'rare',playerTrade:true},width:Math.round(width*(i%3===1?1.12:i%3===2?.9:1)*100)/100,depth:Math.round(depth*(i%2?.92:1)*100)/100,height:Math.round(height*(i%4===3?1.12:i%4===1?.94:1)*100)/100,palette:woods[i%4],colors:colors[i%4],silhouette:['plain','turned','carved','ironbound','arched','panelled','woven','gothic','reinforced','ceremonial'][i],physics:{shape:renderKind==='stool'?'circle':'box',...(renderKind==='stool'?{radiusRatio:.5}:{}),authority:'server'},depthOrder:{anchor:'footprint-front',vertical:'support-base'},renderer:'3d-uv-frame-atlas',manifest:'art/room-furniture/medieval-3d-v1/manifest.json',rotations:4}));
 }
}
export const MEDIEVAL_FURNITURE=Object.freeze(rows);
export const MEDIEVAL_FURNITURE_CATEGORIES=Object.freeze(families.map(([id,label])=>({id,label,count:10})));
export const medievalFurnitureById=id=>MEDIEVAL_FURNITURE.find(item=>item.id===id);
