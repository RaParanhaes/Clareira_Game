import { GAME_RENTAL_DAYS, gameDaysToMs, gameDurationLabel, gameTimeRemaining } from './game-calendar.mjs';
import { VILLAGE_BUILDINGS } from './village-buildings.mjs';
import { LODGING_OFFERS, TOOL_PRICES, TRADE_PRICES, formatCoins } from './lodging-catalog.mjs';
import { axeToolFor, pickaxeToolFor } from './tool-progression.mjs';
import { SERVICE_SECTIONS } from './place-services.mjs';
import { isCabin } from './cabin-access.mjs';

const itemNames = Object.freeze({ wood: 'Graveto seco', timber: 'Madeira bruta', stone: 'Pedra',
  sturdyBranch: 'Galho forte', berries: 'Frutinha', apples: 'Maçã', leaves: 'Folhas secas', vines: 'Cipó',
  plank: 'Ripa de madeira', copperOre: 'Minério de cobre', ironOre: 'Minério de ferro', coal: 'Carvão mineral',
  charcoal: 'Carvão vegetal', copperIngot: 'Lingote de cobre', ironIngot: 'Lingote de ferro' });

export function createPlacePanel({ dialog, controller, getState, onAction }) {
  const doc = dialog.ownerDocument;
  const content = dialog.querySelector('#lodging-options');
  const status = dialog.querySelector('#lodging-status');
  const heading = dialog.querySelector('[data-panel-heading]');
  const back = dialog.querySelector('#lodging-back');
  const quantities = new Map();
  const renewals = new Map();
  const rentalPeriods = new Map();
  const propertyDrafts = new Map();
  const taxDrafts = new Map();
  let askingPrice = null;
  let session = null, contentKey = '', busy = false, keyRecipient = '', draft = null;

  function element(tag, text, className) {
    const node = doc.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function actionButton(text, action, fields = {}, disabled = false) {
    const button = element('button', text);
    button.type = 'button'; button.dataset.serviceAction = action;
    Object.assign(button.dataset, fields);
    button.disabled = busy || disabled;
    return button;
  }

  const balance = state => (state.inventory.gold || 0) * 10000 + (state.inventory.silver || 0) * 100 + (state.inventory.bronze || 0);

  function offerCard(offer, state, directory) {
    const card = element('div', '', 'lodging-option');
    card.append(element('strong', directory ? `${offer.roomLabel} · ${offer.buildingName}` : offer.roomLabel));
    card.append(element('small', offer.mode === 'rent'
      ? `Diária de 1 dia do jogo · ${formatCoins(offer.price)} · até ${offer.unitCount} quartos`
      : `Compra permanente · ${formatCoins(offer.price)} · ${offer.unitCount} unidade${offer.unitCount === 1 ? '' : 's'}`));
    if (directory) {
      card.append(element('small', isCabin(offer.buildingId)
        ? `Consulte a placa externa de ${offer.buildingName}. A entrada exige chave.`
        : `Vá até ${offer.buildingName} e converse no balcão.`));
    } else if (isCabin(offer.buildingId)) {
      const key = state.cabinKeys?.find(key => key.buildingId === offer.buildingId);
      const occupied = state.cabinOccupancy?.some(item => item.buildingId === offer.buildingId);
      const button = actionButton(key ? 'Abrir com minha chave' : occupied ? 'Porta trancada · já tem dono' : 'Comprar cabana e receber chave',
        key ? 'lodgeEnter' : 'lodgeClaim', { buildingId: offer.buildingId, mode: 'owned' },
        state.guest || (!key && (occupied || balance(state) < offer.price)));
      button.dataset.focusKey = `${offer.buildingId}-owned`;
      if(occupied && !key?.isOwner) card.append(actionButton('Solicitar compra ao dono','propertyRequest',{buildingId:offer.buildingId},state.guest));
      card.append(button, element('small', key ? key.isOwner ? 'Você tem a chave de proprietário.' : 'O dono concedeu uma chave para sua conta.'
        : occupied ? 'Peça ao dono uma chave para entrar. Amizade ou parentesco não abre a porta automaticamente.'
          : 'A compra entrega a chave. A consulta e a compra acontecem do lado de fora.'));
    } else {
      const claims = (state.claims || (state.claim ? [state.claim] : [])).filter(c=>c.buildingId===offer.buildingId && c.mode===offer.mode && (c.mode==='owned' || c.expiresAt>(state.worldTime || Date.now())));
      for (const claim of claims) {
        card.append(actionButton(`Entrar · ${offer.roomLabel} ${claim.unitNumber}`, 'lodgeEnter',
          {buildingId:offer.buildingId, mode:offer.mode, unitNumber:String(claim.unitNumber)}, state.guest));
        if (claim.expiresAt) card.append(element('small', `Tempo restante: ${gameTimeRemaining(claim.expiresAt,state.worldTime || Date.now())}.`));
      }
      const days = rentalPeriods.get(offer.buildingId) || 1;
      if (offer.mode === 'rent') {
        const label=element('label','Período do aluguel');
        const select=element('select');select.dataset.rentalPeriod=offer.buildingId; select.dataset.focusKey=`period-${offer.buildingId}`;select.disabled=busy;
        for(const value of GAME_RENTAL_DAYS){const option=element('option',`${gameDurationLabel(gameDaysToMs(value))} · ${formatCoins(offer.price*value)}`);option.value=String(value);option.selected=value===days;select.append(option);}
        label.append(select);card.append(label);
      }
      const button = actionButton(offer.mode === 'rent' ? claims.length ? 'Alugar outro quarto' : 'Reservar quarto' : `Comprar ${offer.roomLabel.toLowerCase()}`,
        'lodgeClaim', { buildingId:offer.buildingId, mode:offer.mode, additionalUnit:'true' }, state.guest || balance(state)<offer.price*(offer.mode==='rent'?days:1) || claims.length>=offer.unitCount);
      button.dataset.focusKey=`${offer.buildingId}-${offer.mode}`; card.append(button);
      if (offer.mode==='rent' && state.recurringLeasesAvailable) {
        const renewal=element('label','','lodging-auto-renew'); const input=element('input');input.type='checkbox';input.dataset.autoRenew=offer.buildingId;input.checked=renewals.get(offer.buildingId)===true;input.disabled=busy;
        renewal.append(input,element('span','Renovar automaticamente se houver saldo'));card.append(renewal);
      }

    }
    if (!directory && balance(state) < offer.price && !state.cabinKeys?.some(key => key.buildingId === offer.buildingId)) card.append(element('small', `Faltam ${formatCoins(offer.price - balance(state))} para esta opção.`));
    return card;
  }

  content.addEventListener('change', event=>{
    if(event.target.dataset.rentalPeriod){rentalPeriods.set(event.target.dataset.rentalPeriod,Number(event.target.value));controller.refresh();}
  });
  function propertyPriceInput(key,value){
    const label=element('label','Preço em bronzes');const input=element('input');input.type='number';input.inputMode='numeric';input.min='1';input.max='9999999';input.step='1';input.required=true;
    input.value=propertyDrafts.get(key) || String(value);input.dataset.propertyPrice=key;input.dataset.focusKey=key;input.disabled=busy;label.append(input);return label;
  }
  content.addEventListener('input',event=>{if(event.target.dataset.propertyPrice)propertyDrafts.set(event.target.dataset.propertyPrice,event.target.value);});
  function render(route, routes) {
    if (!session) return;
    if (route !== 'home' && route !== 'commerce-review' && !session.point.sections.includes(route)) return;
    const state = getState();
    if (route === 'government' && !state.governmentTaxPanel) {
      content.replaceChildren(); heading.textContent = 'Governo e impostos';
      status.textContent = 'Sua conta não tem acesso à gestão de impostos deste governo.'; return;
    }
    const place = VILLAGE_BUILDINGS.find(item => item.id === session.point.placeId);
    const placeName = place?.name || 'Recepção da Vila';
    const ownsCabin = state.cabinKeys?.some(key => key.buildingId === session.point.placeId && key.isOwner);
    dialog.querySelector('#lodging-title').textContent = placeName;
    dialog.querySelector('#lodging-eyebrow').textContent = session.point.label;
    dialog.querySelector('#lodging-path').textContent = route === 'home'
      ? placeName : `${session.point.label} › ${(SERVICE_SECTIONS[route]?.label || 'Revisar operação')}`;
    heading.textContent = route === 'home' ? 'Como podemos ajudar?' : (SERVICE_SECTIONS[route]?.label || 'Revisar operação');
    back.hidden = routes.length < 2;
    dialog.querySelector('#lodging-intro').textContent = route === 'home'
      ? isCabin(session.point.placeId) ? 'Cabana privada. Consulte a propriedade do lado de fora; a porta só abre com chave.'
        : 'Escolha um dos serviços deste balcão.' : (SERVICE_SECTIONS[route]?.description || 'Confira os dados antes de confirmar com o servidor.');
    const guestNote = route !== 'home' && route !== 'directory' && state.guest
      ? 'Entre com uma conta para comprar, reservar e guardar moedas.' : '';
    dialog.querySelector('#lodging-note').textContent = guestNote || (route === 'home'
      ? 'Você pode fechar e continuar explorando o local.' : 'Voltar retorna aos serviços. Fechar retorna ao local.');

    const previousFocus = doc.activeElement;
    const focusWasInContent = content.contains(previousFocus);
    const focusedKey = previousFocus?.dataset?.focusKey;
    const focusedSection = previousFocus?.dataset?.serviceSection;
    const fragment = doc.createDocumentFragment();
    if (route === 'commerce-review' && draft) {
      const card = element('div', '', 'lodging-option commerce-review');
      card.append(element('strong', draft.title), element('p', draft.summary), element('small', draft.detail || 'O servidor confere disponibilidade, saldo e preço antes de concluir.'));
      const confirm = actionButton('Confirmar operação', '__confirm'); confirm.dataset.focusKey = 'commerce-confirm';
      card.append(confirm); fragment.append(card);
    } else if (route === 'home') {
      for (const section of session.point.sections) {
        if (section === 'keys' && !ownsCabin) continue;
        if (section === 'government' && !state.governmentTaxPanel) continue;
        const button = element('button', '', 'service-choice'); button.type = 'button';
        button.dataset.serviceSection = section;
        button.append(element('strong', SERVICE_SECTIONS[section].label), element('small', SERVICE_SECTIONS[section].description));
        fragment.append(button);
      }
    } else if (['rooms', 'properties', 'directory'].includes(route)) {
      const offers = LODGING_OFFERS.filter(offer => route === 'directory'
        || (offer.buildingId === session.point.placeId && offer.mode === (route === 'rooms' ? 'rent' : 'owned')));
      const allClaims=state.claims || (state.claim?[state.claim]:[]);
      if(allClaims.length)fragment.append(element('p',`Você tem ${allClaims.length} propriedade(s) e quarto(s). Pode comprar ou alugar outras unidades disponíveis.`,'lodging-note'));
      if(route==='directory')for(const claim of allClaims){const place=VILLAGE_BUILDINGS.find(b=>b.id===claim.buildingId);fragment.append(element('p',`${place?.name||claim.buildingId} · unidade ${claim.unitNumber} · ${claim.mode==='owned'?'sua propriedade':`alugada, restam ${gameTimeRemaining(claim.expiresAt,state.worldTime||Date.now())}`}`,'lodging-note'));}
      for (const offer of offers) fragment.append(offerCard(offer, state, route === 'directory'));
      if (['rooms','properties'].includes(route)) for (const lease of state.lodgingLeases || (state.lodgingLease ? [state.lodgingLease] : [])) {
        if(lease.status!=='active'||lease.buildingId!==session.point.placeId)continue;
        const card=element('div','','lodging-option');
        card.append(element('strong',`Quarto ${lease.unitNumber} · renovação ${lease.autoRenew?'ativada':'desativada'}`),
          element('small',`${formatCoins(lease.rentBronze)} por ${gameDurationLabel(lease.periodMs)} · restam ${gameTimeRemaining(lease.nextChargeAt,state.worldTime || Date.now())}`),
          actionButton(lease.autoRenew?'Desativar renovação automática':'Ativar renovação automática','setLodgingAutoRenew',
            {buildingId:lease.buildingId,leaseId:lease.leaseId,autoRenew:String(!lease.autoRenew)},state.guest));fragment.append(card);
      }
      if (route === 'properties' && isCabin(session.point.placeId)) {
        const listing = (state.propertyListings || []).find(item => item.buildingId === session.point.placeId);
        if(listing&&!ownsCabin){const card=element('div','','lodging-option');card.append(element('strong','Propriedade à venda pelo dono'),element('small',`${listing.sellerName} pede ${formatCoins(listing.askingPriceBronze)}.`),actionButton('Comprar propriedade','propertyBuy',{buildingId:listing.buildingId},state.guest||balance(state)<listing.askingPriceBronze));fragment.append(card);}
        if (ownsCabin && listing) {
          fragment.append(element('p', `Anúncio ativo por ${formatCoins(listing.askingPriceBronze)}.`, 'lodging-note'),
            actionButton('Retirar anúncio', 'propertyDelist', { buildingId: session.point.placeId }));
        } else if (ownsCabin) {
          const row = element('div', '', 'lodging-trade commerce-property-list');
          const label = element('label'); label.htmlFor = 'property-asking-price';
          label.append(element('span', 'Preço em bronzes'));
          const input = element('input'); input.id = 'property-asking-price'; input.type = 'number';
          input.inputMode = 'numeric'; input.min = '1'; input.max = '9999999'; input.step = '1'; input.required = true;
          input.value = askingPrice ?? String(LODGING_OFFERS.find(item => item.buildingId === session.point.placeId && item.mode === 'owned')?.price || 1);
          input.dataset.askingPrice = 'true'; input.dataset.focusKey = 'property-price'; input.disabled = busy;
          label.append(input);
          row.append(label, actionButton('Anunciar propriedade', 'propertyList', { buildingId: session.point.placeId }));
          fragment.append(row);
        }
      }
      const requests=(state.propertyRequests || []).filter(r=>route==='directory' || r.buildingId===session.point.placeId);
      for(const request of requests){
        const card=element('div','','lodging-option');
        const property=VILLAGE_BUILDINGS.find(b=>b.id===request.buildingId);
        card.append(element('strong',`${property?.name || request.buildingId} · solicitação de compra`));
        if(request.isBuyer){
          card.append(element('small',request.status==='quoted'?`O dono pede ${formatCoins(request.askingPriceBronze)}.`:'Aguardando o dono informar um preço.'));
          if(request.status==='quoted')card.append(actionButton('Aceitar preço e comprar','propertyBuy',{buildingId:request.buildingId,requestId:request.requestId},state.guest||balance(state)<request.askingPriceBronze));
        }else{
          card.append(element('small',`Interessado: ${request.buyerName}. Você escolhe se quer vender.`));
          card.append(propertyPriceInput(`quote-${request.requestId}`,request.askingPriceBronze || 3200),
            actionButton('Responder com este preço','propertyQuote',{buildingId:request.buildingId,requestId:request.requestId}),
            actionButton('Recusar solicitação','propertyQuote',{buildingId:request.buildingId,requestId:request.requestId,decline:'true'}));
        }
        fragment.append(card);
      }
      if(route==='properties' && ownsCabin){
        const rental=(state.propertyRentalListings||[]).find(l=>l.buildingId===session.point.placeId);
        const card=element('div','','lodging-option');card.append(element('strong','Oferecer minha cabana para aluguel'),element('small','Preço por dia do jogo. Contratos pagos continuam válidos quando você retira o anúncio.'),
          propertyPriceInput(`rent-${session.point.placeId}`,rental?.rentBronze || 24),
          actionButton('Anunciar aluguel','propertyRentList',{buildingId:session.point.placeId}));
        if(rental)card.append(actionButton('Retirar anúncio de aluguel','propertyRentDelist',{buildingId:session.point.placeId}));fragment.append(card);
      }
      for(const rental of state.propertyRentalListings || []){
        if(rental.occupied || route!=='directory' && rental.buildingId!==session.point.placeId)continue;
        if(state.cabinKeys?.some(k=>k.buildingId===rental.buildingId&&k.isOwner))continue;
        const property=VILLAGE_BUILDINGS.find(b=>b.id===rental.buildingId);
        const card=element('div','','lodging-option');card.append(element('strong',`${property?.name || rental.buildingId} · para alugar`),element('small',`Dono: ${rental.ownerName} · ${formatCoins(rental.rentBronze)} por dia do jogo.`));
        const select=element('select');select.dataset.rentalPeriod=rental.buildingId;select.dataset.focusKey=`rent-period-${rental.buildingId}`;select.setAttribute('aria-label','Período do aluguel');select.disabled=busy;
        for(const days of GAME_RENTAL_DAYS){const option=element('option',`${gameDurationLabel(gameDaysToMs(days))} · ${formatCoins(rental.rentBronze*days)}`);option.value=String(days);option.selected=days===(rentalPeriods.get(rental.buildingId)||1);select.append(option);}card.append(select,
          actionButton('Alugar cabana','propertyRent',{buildingId:rental.buildingId},state.guest||balance(state)<rental.rentBronze*(rentalPeriods.get(rental.buildingId)||1)));fragment.append(card);
      }
      if (route === 'directory') {
        for (const listing of state.propertyListings || []) {
          const property = VILLAGE_BUILDINGS.find(item => item.id === listing.buildingId);
          if (!property) continue;
          const card = element('div', '', 'lodging-option');
          card.append(element('strong', `${property.name} · propriedade à venda`),
            element('small', `Vendedor: ${listing.sellerName} · ${formatCoins(listing.askingPriceBronze)} · imposto de transferência conforme o governo da vila`),
            actionButton('Comprar propriedade', 'propertyBuy', { buildingId: listing.buildingId }, state.guest || balance(state) < listing.askingPriceBronze));
          fragment.append(card);
        }
      }
      if (!offers.length) fragment.append(element('p', 'Não há opções disponíveis neste local.', 'lodging-note'));
    } else if (route === 'trade') {
      const goods = Object.entries(TRADE_PRICES).filter(([item]) => (state.inventory[item] || 0) > 0);
      if (!goods.length) fragment.append(element('p', 'Você ainda não tem materiais para vender. Colete recursos no bosque e volte ao balcão.', 'lodging-note'));
      for (const [item, basePrice] of goods) {
        const hasMarketQuote = Number.isSafeInteger(state.marketQuotes?.[item]?.buyPrice);
        const price = hasMarketQuote ? state.marketQuotes[item].buyPrice : basePrice;
        const available = state.inventory[item] || 0;
        const row = element('div', '', 'lodging-trade commerce-sale');
        const label = element('label'); label.htmlFor = `trade-quantity-${item}`;
        label.append(element('span', itemNames[item]), element('small', `${formatCoins(price)} por unidade · ${hasMarketQuote ? 'oferta de compra do balcão' : 'preço de referência'} · ${available} no Inventário`));
        const input = element('input'); input.type = 'number'; input.min = '1'; input.max = String(Math.min(50, available));
        input.id = label.htmlFor; input.dataset.quantityItem = item; input.dataset.focusKey = `${item}-quantity`;
        input.inputMode = 'numeric'; input.step = '1'; input.required = true;
        input.value = String(Math.max(1, Math.min(50, available, quantities.get(item) || 1)));
        input.disabled = busy || state.guest || available < 1;
        input.setAttribute('aria-label', `Quantidade de ${itemNames[item]} para vender`);
        const button = actionButton('Vender', 'lodgeSell', { item }, state.guest || available < 1);
        button.setAttribute('aria-label', `Vender ${itemNames[item]}`); button.dataset.focusKey = `${item}-sell`;
        const quantity = element('div', '', 'commerce-quantity');
        for (const [text, change] of [['−', -1], ['+', 1]]) {
          const step = element('button', text); step.type = 'button'; step.dataset.quantityStep = String(change);
          step.setAttribute('aria-label', `${change < 0 ? 'Diminuir' : 'Aumentar'} quantidade de ${itemNames[item]}`); step.disabled = input.disabled;
          quantity.append(step);
        }
        quantity.insertBefore(input, quantity.lastChild);
        const total = element('small', `Total bruto: ${formatCoins(price * Number(input.value))}`, 'commerce-total');
        total.dataset.unitPrice = String(price);
        row.append(label, quantity, total, button); fragment.append(row);
      }
    } else if (route === 'orders') {
      fragment.append(element('p', 'Cada pedido pode ser entregue uma vez por dia do jogo. A recompensa fica salva na carteira.', 'lodging-note'));
      for (const contract of state.contracts) {
        const row = element('div', '', 'lodging-option');
        row.append(element('strong', contract.title), element('small',
          `${contract.quantity} ${itemNames[contract.item] || contract.item} · recompensa ${formatCoins(contract.reward)}`));
        row.append(actionButton(contract.completed ? 'Concluída hoje' : 'Entregar', 'lodgeCompleteContract',
          { contractId: contract.id }, state.guest || contract.completed || (state.inventory[contract.item] || 0) < contract.quantity));
        fragment.append(row);
      }
      if (!state.contracts.length) fragment.append(element('p', 'Não há encomendas disponíveis agora.', 'lodging-note'));
    } else if (route === 'keys' && ownsCabin) {
      fragment.append(element('p', 'Sua chave de proprietário é permanente. Você pode entregar chaves para amigos ou familiares pelo nome da conta e revogá-las quando quiser.', 'lodging-note'));
      const row = element('div', '', 'cabin-key-form');
      const label = element('label', 'Nome da conta que receberá a chave'); label.htmlFor = 'cabin-key-recipient';
      const input = element('input'); input.id = label.htmlFor; input.type = 'text'; input.required = true;
      input.minLength = 3; input.maxLength = 20; input.pattern = '[A-Za-z0-9_]+';
      input.autocomplete = 'off'; input.value = keyRecipient; input.dataset.keyRecipient = 'true'; input.dataset.focusKey = 'key-recipient';
      input.disabled = busy;
      row.append(label, input, actionButton('Entregar chave', 'cabinGrantKey', { buildingId: session.point.placeId }));
      fragment.append(row);
      const recipients = (state.issuedCabinKeys || []).filter(key => key.buildingId === session.point.placeId);
      for (const key of recipients) {
        const card = element('div', '', 'lodging-option');
        card.append(element('strong', key.username), element('small', 'Tem uma chave desta cabana.'),
          actionButton('Revogar chave', 'cabinRevokeKey', { buildingId: key.buildingId, profileId: key.profileId }));
        fragment.append(card);
      }
      if (!recipients.length) fragment.append(element('p', 'Você ainda não entregou chaves para outras contas.', 'lodging-note'));
    } else if (route === 'government') {
      const panel = state.governmentTaxPanel;
      fragment.append(element('p', `${({village:'Vila',kingdom:'Reino',realm:'Domínio',castle:'Castelo'})[panel.governmentType] || panel.governmentType} · ${placeName} · Tesouro geral: ${formatCoins(panel.treasuryBalanceBronze)}`, 'lodging-note'));
      for (const policy of panel.policies || []) {
        const card = element('div', '', 'lodging-option');
        card.append(element('strong', `${({market_sale:'Venda de materiais',property_transfer:'Compra e venda de propriedades',lease_income:'Aluguéis'})[policy.taxCode] || policy.taxCode} · atual ${(policy.rateBps ?? policy.baseRateBps)/100}%`));
        const form = element('div', '', 'lodging-trade commerce-tax-form');
        form.dataset.taxCode = policy.taxCode;
        const fields = [
          ['baseRateBps','Alíquota-base (%)',policy.baseRateBps/100,0,100,0.01],
          ['minimumRateBps','Mínimo (%)',policy.minimumRateBps/100,0,100,0.01],
          ['maximumRateBps','Máximo (%)',policy.maximumRateBps/100,0,100,0.01],
          ['treasuryTargetBronze','Meta do tesouro (bronzes)',policy.treasuryTargetBronze,0,999999999,1],
          ['treasurySensitivityBps','Sensibilidade (%)',policy.treasurySensitivityBps/100,0,100,0.01],
        ];
        for (const [name,label,value,min,max,step] of fields) {
          const wrapper=element('label'); wrapper.append(element('span',label));
          const input=element('input'); input.type='number'; input.name=name; input.value=taxDrafts.get(`${policy.taxCode}:${name}`) ?? String(value);
          input.dataset.taxDraft = `${policy.taxCode}:${name}`; input.dataset.focusKey = input.dataset.taxDraft; input.inputMode = step === 1 ? 'numeric' : 'decimal';
          input.min=String(min); input.max=String(max); input.step=String(step); input.required=true;
          wrapper.append(input); form.append(wrapper);
        }
        const save=actionButton('Salvar alíquota','governmentTaxPolicySet',{taxCode:policy.taxCode});
        form.append(save); card.append(form); fragment.append(card);
      }
    } else if (route === 'tools') {
      for (const [tool, price] of Object.entries(TOOL_PRICES)) {
        const owned = tool === 'stoneAxe' ? axeToolFor(state.inventory) : pickaxeToolFor(state.inventory);
        const row = element('div', '', 'lodging-option');
        row.append(element('strong', tool === 'stoneAxe' ? 'Machado de pedra' : 'Picareta de pedra'),
          element('small', `${formatCoins(price)} · também pode ser fabricada no bosque`),
          actionButton(owned ? 'Já está no Inventário' : 'Comprar', 'lodgeBuyTool', { tool }, state.guest || Boolean(owned) || balance(state) < price));
        if (!owned && !state.guest && balance(state) < price) row.append(element('small', `Faltam ${formatCoins(price - balance(state))} para comprar esta ferramenta.`));
        fragment.append(row);
      }
    }
    content.replaceChildren(fragment);
    content.setAttribute('aria-busy', String(busy));
    if (busy) for (const input of content.querySelectorAll('input,select,textarea')) input.disabled = true;
    dialog.querySelector('#lodging-wallet').textContent = `Carteira: ${formatCoins(
      (state.inventory.gold || 0) * 10000 + (state.inventory.silver || 0) * 100 + (state.inventory.bronze || 0))}`;
    if (focusWasInContent) {
      const replacement = [...content.querySelectorAll('button,input,select')].find(node => !node.disabled
        && ((focusedKey && node.dataset.focusKey === focusedKey)
          || (focusedSection && node.dataset.serviceSection === focusedSection)));
      (replacement || heading).focus({ preventScroll: true });
    }
  }

  controller.register('place', dialog, {
    initialFocus: '[data-service-section]', render,
    onClose() { session = null; contentKey = ''; busy = false; keyRecipient = ''; draft = null; askingPrice = null; propertyDrafts.clear(); rentalPeriods.clear(); renewals.clear(); quantities.clear(); taxDrafts.clear(); },
  });
  back.addEventListener('click', () => controller.back());
  dialog.querySelector('#lodging-close').addEventListener('click', () => controller.close());
  content.addEventListener('input', event => {
    if (event.target.dataset.quantityItem) {
      quantities.set(event.target.dataset.quantityItem, Number(event.target.value));
      const total = event.target.closest('.commerce-sale').querySelector('[data-unit-price]');
      total.textContent = event.target.validity.valid ? `Total bruto: ${formatCoins(Number(total.dataset.unitPrice) * Number(event.target.value))}` : 'Escolha uma quantidade válida (até 50 por venda).';
    }
    if (event.target.dataset.taxDraft) taxDrafts.set(event.target.dataset.taxDraft, event.target.value);
    if (event.target.dataset.autoRenew) renewals.set(event.target.dataset.autoRenew, event.target.checked);
    if (event.target.dataset.askingPrice) askingPrice = event.target.value;
    if (event.target.dataset.keyRecipient) keyRecipient = event.target.value;
  });
  content.addEventListener('click', event => {
    const step = event.target.closest('[data-quantity-step]');
    if (step && !step.disabled && !busy) {
      const input = step.parentElement.querySelector('input');
      input.value = String(Math.max(1, Math.min(Number(input.max), (Number(input.value) || 1) + Number(step.dataset.quantityStep))));
      input.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true })); return;
    }
    const section = event.target.closest('[data-service-section]')?.dataset.serviceSection;
    if (section && session?.point.sections.includes(section)) {
      status.textContent = ''; controller.navigate(section); return;
    }
    const button = event.target.closest('button[data-service-action]');
    if (!button || button.disabled || busy || !session) return;
    if (button.dataset.serviceAction === '__confirm') {
      if (!draft) return;
      const pending = draft; draft = null;
      const state = getState();
      const priceNow = operationPrice(pending.message, state);
      if (priceNow !== pending.price || (pending.message.name === 'lodgeSell' ? (state.inventory[pending.message.item] || 0) < pending.message.quantity : pending.cost > balance(state))) {
        status.textContent = 'Os dados mudaram. Confira novamente o preço, o saldo e a quantidade.'; controller.back(); return;
      }
      if (onAction(pending.message, session.point)) { busy = true; status.textContent = 'Aguarde a confirmação do servidor…'; controller.back(); controller.refresh(); }
      else { status.textContent = 'Não foi possível enviar. Confira a conexão e tente novamente.'; controller.back(); }
      return;
    }
    const { serviceAction: name, ...fields } = button.dataset;
    const message = { type: 'action', name, ...fields };
    delete message.focusKey;
    if (name === 'lodgeSell') {
      const input = button.closest('.lodging-trade').querySelector('input');
      if (!input.reportValidity()) return;
      message.quantity = Number(input.value);
      if (!Number.isSafeInteger(message.quantity) || message.quantity < 1) return;
    }
    if (name === 'propertyList') {
      const input = button.parentElement.querySelector('input');
      if (!input?.reportValidity()) return;
      message.askingPriceBronze = Number(input.value);
      if (!Number.isSafeInteger(message.askingPriceBronze) || message.askingPriceBronze < 1) return;
    }
    if (name === 'governmentTaxPolicySet') {
      const form = button.parentElement;
      const fields = ['baseRateBps','minimumRateBps','maximumRateBps','treasuryTargetBronze','treasurySensitivityBps'];
      const inputs = Object.fromEntries(fields.map(field=>[field,form.querySelector(`[name="${field}"]`)]));
      if (Object.values(inputs).some(input=>!input?.reportValidity())) return;
      const toBps = input => Math.round(Number(input.value)*100);
      message.baseRateBps=toBps(inputs.baseRateBps); message.minimumRateBps=toBps(inputs.minimumRateBps);
      message.maximumRateBps=toBps(inputs.maximumRateBps); message.treasuryTargetBronze=Number(inputs.treasuryTargetBronze.value);
      message.treasurySensitivityBps=toBps(inputs.treasurySensitivityBps);
      if (message.minimumRateBps > message.baseRateBps || message.baseRateBps > message.maximumRateBps) {
        status.textContent = 'A alíquota-base deve ficar entre o mínimo e o máximo.'; return;
      }
    }
    if(['propertyQuote','propertyRentList'].includes(name)&&message.decline!=='true'){
      const input=button.parentElement.querySelector('[data-property-price]');if(!input?.reportValidity())return;message.askingPriceBronze=Number(input.value);
    }
    if(name==='propertyRent'){message.rentalDays=Number(button.parentElement.querySelector('[data-rental-period]')?.value||1);message.requestId=crypto.randomUUID();}
    if(['propertyQuote','propertyRentList','propertyRentDelist','propertyRequest'].includes(name)){
      draft={message,price:message.askingPriceBronze||0,cost:0,title:'Revisar negociação',summary:name==='propertyRequest'?'Solicitar ao dono um preço para comprar esta propriedade. Nenhuma moeda será cobrada agora.':name==='propertyQuote'?message.decline==='true'?'Recusar esta solicitação de compra.':`Oferecer a propriedade a este interessado por ${formatCoins(message.askingPriceBronze)}. A venda acontece quando ele aceitar e pagar.`:name==='propertyRentList'?`Anunciar por ${formatCoins(message.askingPriceBronze)} por dia do jogo. Você continua proprietário.`:'Retirar o anúncio de aluguel. Contratos já pagos continuam válidos.'};controller.navigate('commerce-review');return;
    }
    if (name === 'lodgeClaim' && fields.mode === 'rent') {
      message.autoRenew = button.parentElement.querySelector('[data-auto-renew]')?.checked === true;
      message.rentalDays=Number(button.parentElement.querySelector('[data-rental-period]')?.value || 1);
    }
    if (name === 'cabinGrantKey') {
      const input = content.querySelector('#cabin-key-recipient');
      if (!input?.reportValidity()) return;
      message.username = input.value.trim();
    }
    if (['setLodgingAutoRenew', 'propertyDelist', 'cabinRevokeKey'].includes(name)) {
      const state = getState();
      const lease = state.lodgingLeases?.find(l=>l.leaseId===message.leaseId) || state.lodgingLease;
      const recipient = state.issuedCabinKeys?.find(key => key.profileId === message.profileId)?.username || 'desta conta';
      draft = { message, price: 0, cost: 0, title: name === 'setLodgingAutoRenew' ? 'Revisar renovação' : name === 'propertyDelist' ? 'Retirar anúncio' : 'Revogar chave',
        summary: name === 'setLodgingAutoRenew' ? message.autoRenew === 'true' ? `Ativar renovação automática por ${formatCoins(lease?.rentBronze || 0)} por ${gameDurationLabel(lease?.periodMs || gameDaysToMs(1))}, se houver saldo.` : 'Desativar cobranças automáticas das próximas diárias. A diária atual continua válida até o vencimento.'
          : name === 'propertyDelist' ? 'Retirar a propriedade da venda. Você continuará dono e poderá anunciar novamente.' : `Revogar a chave de ${recipient}. A conta perde o acesso à cabana; visitantes sem outra chave serão retirados pelo servidor.` };
      controller.navigate('commerce-review'); return;
    }
    if (['lodgeClaim', 'propertyBuy', 'propertyRent', 'propertyList', 'lodgeBuyTool', 'lodgeSell'].includes(name)) {
      const state = getState(), price = operationPrice(message, state);
      if (!Number.isSafeInteger(price) || price < 1) { status.textContent = 'Preço indisponível. Atualize e tente novamente.'; return; }
      if(name==='lodgeClaim') message.requestId=crypto.randomUUID();
      message.expectedPriceBronze=price;
      const selling = name === 'lodgeSell', listing = name === 'propertyList';
      const cost = selling || listing ? 0 : price;
      if (cost > balance(state)) { status.textContent = 'Saldo insuficiente para esta operação.'; return; }
      draft = { message, price, cost, title: selling ? 'Revisar venda' : listing ? 'Revisar anúncio' : name === 'lodgeClaim' && message.mode === 'rent' ? 'Revisar aluguel' : 'Revisar compra',
        summary: selling ? `${message.quantity} × ${itemNames[message.item]} · total bruto ${formatCoins(price * message.quantity)}. O imposto vigente será descontado pelo servidor.`
          : listing ? `Anunciar a propriedade por ${formatCoins(price)}. Você continua dono até a venda ser concluída.`
          : `${VILLAGE_BUILDINGS.find(place => place.id === message.buildingId)?.name || (message.tool === 'stoneAxe' ? 'Machado de pedra' : 'Picareta de pedra')} · ${formatCoins(price)}. Saldo após pagamento: ${formatCoins(balance(state) - price)}.`,
        detail: message.mode === 'rent' || name==='propertyRent' ? `Período de ${gameDurationLabel(gameDaysToMs(message.rentalDays || 1))}. Renovação automática ${message.autoRenew ? 'ativada: novas diárias serão cobradas se houver saldo' : 'desativada'}.` : '' };
      controller.navigate('commerce-review'); return;
    }
    if (onAction(message, session.point)) {
      busy = true; status.textContent = 'Aguarde a confirmação…'; controller.refresh();
    } else status.textContent = 'Não foi possível enviar. Confira a conexão e tente novamente.';
  });

  function operationPrice(message, state) {
    if(['propertyRequest','propertyRentDelist'].includes(message.name))return 0;
    if(['propertyQuote','propertyRentList'].includes(message.name))return message.askingPriceBronze || 0;
    if (['setLodgingAutoRenew', 'propertyDelist', 'cabinRevokeKey'].includes(message.name)) return 0;
    if (message.name === 'lodgeSell') return state.marketQuotes?.[message.item]?.buyPrice ?? TRADE_PRICES[message.item];
    if (message.name === 'propertyList') return message.askingPriceBronze;
    if(message.name==='propertyRent')return state.propertyRentalListings?.find(l=>l.buildingId===message.buildingId)?.rentBronze * Number(message.rentalDays||1);
    if (message.name === 'propertyBuy') return message.requestId ? state.propertyRequests?.find(r=>r.requestId===message.requestId)?.askingPriceBronze : state.propertyListings?.find(item => item.buildingId === message.buildingId)?.askingPriceBronze;
    if (message.name === 'lodgeBuyTool') return TOOL_PRICES[message.tool];
    return LODGING_OFFERS.find(offer => offer.buildingId === message.buildingId && offer.mode === message.mode)?.price * (message.mode==='rent' ? Number(message.rentalDays || 1) : 1);
  }

  return {
    open(point, contextKey) {
      if (controller.current === 'place') return;
      controller.close({ restoreFocus: false });
      session = { point, contextKey }; contentKey = ''; busy = false;
      status.textContent = ''; controller.open('place');
    },
    refresh(point, contextKey) {
      if (!session || controller.current !== 'place') return;
      if (!point || point.key !== session.point.key || contextKey !== session.contextKey) return controller.close();
      const {worldTime,...stable}=getState();
      const key = JSON.stringify(stable);
      if (key !== contentKey) { contentKey = key; controller.refresh(); }
    },
    notice(text) {
      if (controller.current !== 'place') return;
      busy = false; status.textContent = text; controller.refresh();
    },
    get sessionKey() { return session?.point.key || null; },
  };
}
