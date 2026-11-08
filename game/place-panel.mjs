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
  const formatCount = value => Number.isSafeInteger(value) ? new Intl.NumberFormat('pt-BR').format(value) : '—';
  const formatMoney = value => Number.isSafeInteger(value) ? formatCoins(value) : '—';
  const economyRoleNames = Object.freeze({admin:'Administrador',leader:'Líder',minister:'Ministro da Economia',treasurer:'Tesoureiro',auditor:'Auditor'});
  const content = dialog.querySelector('#lodging-options');
  const status = dialog.querySelector('#lodging-status');
  const heading = dialog.querySelector('[data-panel-heading]');
  const back = dialog.querySelector('#lodging-back');
  const quantities = new Map();
  const buyQuantities = new Map();
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
    if (route === 'economy' && !state.economyManagementPanel) {
      content.replaceChildren(); heading.textContent='Gestão econômica';
      status.textContent='Sua conta não tem permissão para consultar os indicadores econômicos.'; return;
    }
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
        if (section === 'economy' && !state.economyManagementPanel) continue;
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
      const offers = Object.entries(state.marketQuotes || {}).filter(([item, quote]) =>
        Object.hasOwn(TRADE_PRICES, item) && Number.isSafeInteger(quote?.availableStock)
        && quote.availableStock > 0 && Number.isSafeInteger(quote.sellPrice) && quote.sellPrice > 0);
      fragment.append(element('strong', 'Comprar materiais do estoque da vila'));
      if (!offers.length) fragment.append(element('p', 'Nenhum material disponível para compra no momento. Os recursos vendidos por jogadores abastecem o balcão.', 'lodging-note'));
      for (const [item, quote] of offers) {
        const price = quote.sellPrice, available = quote.availableStock;
        const row = element('div', '', 'lodging-trade commerce-purchase');
        const label = element('label');
        label.htmlFor = `buy-material-quantity-${item}`;
        label.append(element('span', itemNames[item]), element('small',
          `${formatCoins(price)} por unidade · ${available} disponíveis no balcão`));
        const input = element('input');
        input.type = 'number'; input.min = '1'; input.max = String(Math.min(50, available));
        input.id = label.htmlFor; input.dataset.buyQuantityItem = item;
        input.dataset.focusKey = `${item}-buy-quantity`; input.inputMode = 'numeric';
        input.step = '1'; input.required = true;
        input.value = String(Math.max(1, Math.min(50, available, buyQuantities.get(item) || 1)));
        input.disabled = busy || state.guest;
        input.setAttribute('aria-label', `Quantidade de ${itemNames[item]} para comprar`);
        const quantity = element('div', '', 'commerce-quantity');
        for (const [text, change] of [['−', -1], ['+', 1]]) {
          const step = element('button', text); step.type = 'button'; step.dataset.quantityStep = String(change);
          step.setAttribute('aria-label', `${change < 0 ? 'Diminuir' : 'Aumentar'} compra de ${itemNames[item]}`);
          step.disabled = input.disabled; quantity.append(step);
        }
        quantity.insertBefore(input, quantity.lastChild);
        const total = element('small', `Total da compra: ${formatCoins(price * Number(input.value))}`, 'commerce-total');
        total.dataset.unitPrice = String(price);
        const button = actionButton('Comprar', 'lodgeBuyMaterial', { item }, state.guest || balance(state) < price);
        button.dataset.focusKey = `${item}-buy`;
        row.append(label, quantity, total, button);
        fragment.append(row);
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
    } else if (route === 'economy') {
      const panel=state.economyManagementPanel;
      const kpis=panel.kpis||{};
      const governmentNames={village:'Vila',kingdom:'Reino',realm:'Domínio',castle:'Castelo'};
      const fundNames={general:'Geral',donations:'Doações',materials:'Materiais',
        construction:'Construção',territory:'Território',diplomacy:'Diplomacia'};
      const projectNames={donation:'Doação',material_purchase:'Compra de materiais',
        construction:'Construção',territory_expansion:'Expansão territorial',diplomacy:'Diplomacia'};
      const projectStatuses={proposed:'Proposto',funded:'Verba reservada',cancelled:'Cancelado',
        approved:'Aprovado',in_progress:'Em execução',completed:'Concluído'};
      fragment.append(element('p',
        `${governmentNames[panel.governmentType]||panel.governmentType||'Governo'} · ${panel.settlementId||panel.governmentId} · mundo ${panel.worldId||'desconhecido'} · ${economyRoleNames[panel.role]||'Equipe econômica'}`,
        'lodging-note'));
      fragment.append(element('p',
        `Últimos ${panel.periodGameDays||7} dias do jogo · consulta ${new Date(panel.sampledAt||Date.now()).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} · ${panel.parentGovernmentId?'governo superior: '+panel.parentGovernmentId:'sem governo superior cadastrado'}.`,
        'lodging-note'));
      if((panel.governments||[]).length>1) {
        fragment.append(element('strong','Selecionar tesouro autorizado'));
        const selector=element('div','','economy-government-choices');
        for(const government of panel.governments){
          const current=government.governmentId===panel.governmentId;
          const button=actionButton(
            `${current?'✓ ':''}${governmentNames[government.governmentType]||government.governmentType}: ${government.settlementId}`,
            'economyGovernmentSelect',{governmentId:government.governmentId},current);
          selector.append(button);
        }
        fragment.append(selector);
      }
      if(panel.governmentId!=='surface:arrival')
        fragment.append(element('p',
          'Os números do balcão da Vila da Chegada não pertencem a este governo. Compras, estoque e preços locais ficarão indisponíveis até existir mercado regional próprio.',
          'lodging-note'));
      const summary=element('div','','economy-kpi-grid');
      const values=[
        ['Materiais entregues ao NPC',formatCount(kpis.soldToNpc)],
        ['Materiais comprados do NPC',formatCount(kpis.boughtFromNpc)],
        ['Valor bruto das entregas',formatMoney(kpis.grossSalesBronze)],
        ['Receita de revenda do NPC',formatMoney(kpis.npcPurchaseRevenueBronze)],
        ['Estoque disponível',`${formatCount(kpis.marketStock)} unidades · ${formatCount(kpis.marketVarieties)} tipos`],
        ['Entradas no tesouro',formatMoney(kpis.treasuryReceiptsBronze)],
        ['Saídas do tesouro',formatMoney(kpis.treasuryExpensesBronze)],
        ['Lançamentos financeiros',formatCount(kpis.transactions)],
      ];
      for(const [label,value] of values){
        const tile=element('div','','economy-kpi');
        tile.append(element('small',label),element('strong',value));
        summary.append(tile);
      }
      fragment.append(summary);
      if(panel.monetary)fragment.append(element('p',
        `Fator monetário de preços: ${Number(panel.monetary.priceFactor).toLocaleString('pt-BR',{maximumFractionDigits:3})}× · última amostragem da moeda: ${formatMoney(panel.monetary.referenceSupplyBronze)}.`,
        'lodging-note'));
      const imbalance=kpis.journalBalanceBronze;
      fragment.append(element('p',Number.isSafeInteger(imbalance)
        ? imbalance===0?'Diário financeiro conciliado na janela consultada (diferença zero).'
          : `Atenção: diferença contábil de ${formatMoney(imbalance)} na janela consultada.`
        : 'Conciliação contábil indisponível para esta janela.','lodging-note'));
      const totalFunds=(panel.funds||[]).reduce((sum,f)=>sum+(f.balanceBronze||0),0);
      const totalReserved=(panel.funds||[]).reduce((sum,f)=>sum+(f.reservedBronze||0),0);
      fragment.append(element('strong','Tesouro e orçamento por finalidade'));
      fragment.append(element('p',
        `Total ${formatMoney(totalFunds)} · reservado ${formatMoney(totalReserved)} · disponível ${formatMoney(totalFunds-totalReserved)}. Reservar não é gastar e mover verba entre fundos não cria moeda.`,
        'lodging-note'));
      if(panel.initialTreasuryBronze!==null&&panel.initialTreasuryBronze!==undefined)
        fragment.append(element('p',`Verba inicial efetivamente emitida: ${formatMoney(panel.initialTreasuryBronze)}.`,'lodging-note'));
      else if(panel.budgetTemplateBronze!==null&&panel.budgetTemplateBronze!==undefined)
        fragment.append(element('p',
          `Modelo de orçamento inicial: ${formatMoney(panel.budgetTemplateBronze)} (não significa que o valor já foi emitido).`,
          'lodging-note'));
      for(const fund of panel.funds||[]){
        const row=element('div','','economy-list-row');
        row.append(element('strong',({general:'Geral',donations:'Doações',materials:'Materiais',construction:'Construção',territory:'Território',diplomacy:'Diplomacia'})[fund.fundCode]||fund.fundCode),
          element('small',`Saldo ${formatMoney(fund.balanceBronze)} · reservado ${formatMoney(fund.reservedBronze)} · livre ${formatMoney(fund.balanceBronze-fund.reservedBronze)}`));
        fragment.append(row);
      }
      if(panel.permissions?.manageFunds && (panel.funds||[]).length>1){
        fragment.append(element('strong','Redistribuir recursos do próprio governo'));
        const form=element('div','','economy-role-form economy-transfer-form');
        for(const [name,label] of [['fromFund','De qual fundo'],['toFund','Para qual fundo']]){
          const wrap=element('label',label),select=element('select');
          select.name=name;select.dataset.focusKey='economy-transfer-'+name;
          for(const fund of panel.funds){
            const option=element('option',fundNames[fund.fundCode]||fund.fundCode);option.value=fund.fundCode;
            select.append(option);
          }
          if(name==='toFund' && select.options.length>1)select.selectedIndex=1;
          wrap.append(select);form.append(wrap);
        }
        const value=element('label','Quantidade em bronzes');
        const input=element('input');input.type='number';input.name='amountBronze';input.min='1';
        input.max='999999999';input.step='1';input.required=true;input.inputMode='numeric';
        input.placeholder='Ex.: 300';input.dataset.focusKey='economy-transfer-amount';
        value.append(input);form.append(value);
        form.append(actionButton('Revisar transferência','economyFundTransfer'));
        fragment.append(form);
      }
      fragment.append(element('strong','Projetos e compromissos públicos'));
      fragment.append(element('p','Propor ou reservar verba não executa pagamentos. Nenhuma obra, compra ou transferência a jogadores acontece automaticamente.','lodging-note'));
      if(panel.permissions?.proposeProjects){
        const form=element('div','','economy-role-form economy-project-form');
        const nameLabel=element('label','Nome do projeto');
        const name=element('input');name.name='title';name.type='text';name.required=true;
        name.minLength=4;name.maxLength=80;name.placeholder='Ex.: Reconstruir a ponte';
        name.dataset.focusKey='economy-project-title';nameLabel.append(name);form.append(nameLabel);
        const typeLabel=element('label','Finalidade');
        const type=element('select');type.name='projectType';type.dataset.focusKey='economy-project-kind';
        for(const [key,label] of Object.entries(projectNames)){
          const option=element('option',label);option.value=key;type.append(option);
        }
        typeLabel.append(type);form.append(typeLabel);
        const amountLabel=element('label','Orçamento solicitado (bronzes)');
        const amount=element('input');amount.name='budgetBronze';amount.type='number';
        amount.min='1';amount.max='999999999';amount.step='1';amount.required=true;
        amount.inputMode='numeric';amount.dataset.focusKey='economy-project-budget';
        amountLabel.append(amount);form.append(amountLabel);
        form.append(actionButton('Propor projeto','economyProjectPropose'));
        fragment.append(form);
      }
      if(!(panel.projects||[]).length)fragment.append(element('p','Nenhum projeto público registrado para este governo.','lodging-note'));
      for(const project of panel.projects||[]){
        const card=element('div','','economy-list-row economy-project-card');
        card.append(element('strong',project.title),
          element('small',`${projectNames[project.projectType]||project.projectType} · ${projectStatuses[project.status]||project.status} · orçamento ${formatMoney(project.budgetBronze)} · gasto ${formatMoney(project.spentBronze)}`));
        if(panel.permissions?.approveProjects && project.status==='proposed')
          card.append(actionButton('Reservar verba','economyProjectDecide',
            {projectId:project.projectId,decision:'fund'}));
        if(panel.permissions?.approveProjects && ['proposed','funded'].includes(project.status))
          card.append(actionButton('Cancelar projeto','economyProjectDecide',
            {projectId:project.projectId,decision:'cancel'}));
        fragment.append(card);
      }
      if((panel.transfers||[]).length){
        fragment.append(element('strong','Últimas movimentações internas'));
        for(const transfer of panel.transfers){
          const card=element('div','','economy-list-row');
          card.append(element('small',
            `${fundNames[transfer.fromFund]||transfer.fromFund} → ${fundNames[transfer.toFund]||transfer.toFund} · ${formatMoney(transfer.amountBronze)}`));
          fragment.append(card);
        }
      }
      if((panel.daily||[]).length) {
        fragment.append(element('strong','Compras e entregas por dia do jogo'));
        const max=Math.max(1,...panel.daily.map(day=>(day.soldToNpc||0)+(day.boughtFromNpc||0)));
        for(const day of panel.daily){
          const count=(day.soldToNpc||0)+(day.boughtFromNpc||0);
          const row=element('div','','economy-day-row');
          row.append(element('small',`${day.day.slice(5)} · ${formatCount(day.soldToNpc)} entregues / ${formatCount(day.boughtFromNpc)} comprados`));
          const track=element('div','','economy-trend-track');
          const bar=element('span','','economy-trend-bar');bar.style.width=`${100*count/max}%`;
          track.append(bar);row.append(track);fragment.append(row);
        }
      }
      if((panel.stock||[]).length){
        fragment.append(element('strong','Preços e disponibilidade do balcão'));
        for(const item of panel.stock){
          const row=element('div','','economy-list-row');
          row.append(element('strong',itemNames[item.itemId]||item.itemId),
            element('small',`${formatCount(item.available)} disponíveis · compra NPC ${formatMoney(item.buyPrice)} · venda NPC ${formatMoney(item.sellPrice)}`));
          fragment.append(row);
        }
      }
      if(panel.permissions?.manageRoles){
        fragment.append(element('strong','Nomear cargos de economia'));
        fragment.append(element('p','Somente o líder ou administrador pode nomear e revogar cargos. Todas as mudanças são registradas.','lodging-note'));
        const form=element('div','','economy-role-form');
        const accountLabel=element('label','Usuário');
        const accountInput=element('input');accountInput.name='username';accountInput.type='text';
        accountInput.minLength=3;accountInput.maxLength=20;accountInput.pattern='[a-zA-Z0-9_]{3,20}';
        accountInput.placeholder='nome_da_conta';accountInput.autocomplete='off';
        accountInput.dataset.focusKey='economy-role-username';accountInput.required=true;
        accountLabel.append(accountInput);form.append(accountLabel);
        const roleLabel=element('label','Cargo');
        const roleSelect=element('select');roleSelect.name='role';roleSelect.dataset.focusKey='economy-role-select';
        for(const [value,label]of [['minister','Ministro da Economia · impostos e KPIs'],
          ['treasurer','Tesoureiro · KPIs e fundos'],['auditor','Auditor · somente leitura']]){
          const option=element('option',label);option.value=value;roleSelect.append(option);
        }
        roleLabel.append(roleSelect);form.append(roleLabel);
        form.append(actionButton('Nomear ou atualizar','economyRoleSet'));
        fragment.append(form);
        for(const member of panel.roles||[]){
          const row=element('div','','economy-list-row economy-staff-row');
          row.append(element('strong',member.username),
            element('small',economyRoleNames[member.role]||member.role),
            actionButton('Revogar cargo','economyRoleSet',{username:member.username,role:'none'}));
          fragment.append(row);
        }
      }
      fragment.append(actionButton('Atualizar indicadores','economyRefresh'));
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
    onClose() { session = null; contentKey = ''; busy = false; keyRecipient = ''; draft = null; askingPrice = null; propertyDrafts.clear(); rentalPeriods.clear(); renewals.clear(); quantities.clear(); buyQuantities.clear(); taxDrafts.clear(); },
  });
  back.addEventListener('click', () => controller.back());
  dialog.querySelector('#lodging-close').addEventListener('click', () => controller.close());
  content.addEventListener('input', event => {
    if (event.target.dataset.quantityItem) {
      quantities.set(event.target.dataset.quantityItem, Number(event.target.value));
      const total = event.target.closest('.commerce-sale').querySelector('[data-unit-price]');
      total.textContent = event.target.validity.valid ? `Total bruto: ${formatCoins(Number(total.dataset.unitPrice) * Number(event.target.value))}` : 'Escolha uma quantidade válida (até 50 por venda).';
    }
    if (event.target.dataset.buyQuantityItem) {
      buyQuantities.set(event.target.dataset.buyQuantityItem, Number(event.target.value));
      const total = event.target.closest('.commerce-purchase').querySelector('[data-unit-price]');
      total.textContent = event.target.validity.valid ? `Total da compra: ${formatCoins(Number(total.dataset.unitPrice) * Number(event.target.value))}` : 'Escolha uma quantidade válida disponível no balcão.';
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
      const economicRequirements={
        economyRoleSet:'manageRoles',economyFundTransfer:'manageFunds',
        economyProjectPropose:'proposeProjects',economyProjectDecide:'approveProjects',
      };
      const capability=economicRequirements[pending.message.name];
      if(capability && (!state.economyManagementPanel?.permissions?.[capability]
          || state.economyManagementPanel.governmentId!==pending.message.governmentId)){
        status.textContent='Sua autorização ou o tesouro selecionado mudou.';controller.back();return;
      }
      if (pending.message.name==='economyRoleSet' && !state.economyManagementPanel?.permissions?.manageRoles) {
        status.textContent='Sua autorização para administrar cargos mudou.';controller.back();return;
      }
      if (priceNow !== pending.price || (pending.message.name === 'lodgeSell'
        ? (state.inventory[pending.message.item] || 0) < pending.message.quantity
        : pending.message.name === 'lodgeBuyMaterial'
          ? (state.marketQuotes?.[pending.message.item]?.availableStock || 0) < pending.message.quantity || pending.cost > balance(state)
          : pending.cost > balance(state))) {
        status.textContent = 'Os dados mudaram. Confira novamente o preço, o saldo e a quantidade.'; controller.back(); return;
      }
      if (onAction(pending.message, session.point)) { busy = true; status.textContent = 'Aguarde a confirmação do servidor…'; controller.back(); controller.refresh(); }
      else { status.textContent = 'Não foi possível enviar. Confira a conexão e tente novamente.'; controller.back(); }
      return;
    }
    const { serviceAction: name, ...fields } = button.dataset;
    status.textContent='';
    const message = { type: 'action', name, ...fields };
    delete message.focusKey;
    if (name === 'lodgeSell' || name === 'lodgeBuyMaterial') {
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
    if (name === 'economyGovernmentSelect') {
      if(!getState().economyManagementPanel?.governments?.some(g=>g.governmentId===message.governmentId)){
        status.textContent='Este governo não está na lista de acesso autorizado.';return;
      }
    }
    if (name === 'economyFundTransfer') {
      const panel=getState().economyManagementPanel;
      if(!panel?.permissions?.manageFunds) {status.textContent='Você não pode redistribuir recursos públicos.';return;}
      const form=button.closest('.economy-transfer-form');
      const source=form?.querySelector('[name="fromFund"]');
      const target=form?.querySelector('[name="toFund"]');
      const amount=form?.querySelector('[name="amountBronze"]');
      if(!source?.value||!target?.value||!amount?.reportValidity())return;
      message.fromFund=source.value;message.toFund=target.value;message.amountBronze=Number(amount.value);
      const available=panel.funds.find(f=>f.fundCode===message.fromFund);
      if(source.value===target.value||!Number.isSafeInteger(message.amountBronze)||message.amountBronze<1
          ||!available||message.amountBronze>available.balanceBronze-available.reservedBronze){
        status.textContent='Escolha fundos diferentes e um valor dentro do saldo livre.';return;
      }
      message.requestId=crypto.randomUUID();message.governmentId=panel.governmentId;
      draft={message,price:0,cost:0,title:'Revisar transferência pública',
        summary:`Movimentar ${formatMoney(message.amountBronze)} do fundo ${({general:'Geral',donations:'Doações',materials:'Materiais',construction:'Construção',territory:'Território',diplomacy:'Diplomacia'})[message.fromFund]} para ${({general:'Geral',donations:'Doações',materials:'Materiais',construction:'Construção',territory:'Território',diplomacy:'Diplomacia'})[message.toFund]} no tesouro ${panel.governmentId}.`,
        detail:'Movimentação interna sem emissão ou gasto de moedas. O servidor verifica o saldo não reservado e registra duas linhas contábeis.'};
      controller.navigate('commerce-review');return;
    }
    if (name === 'economyProjectPropose') {
      const panel=getState().economyManagementPanel;
      if(!panel?.permissions?.proposeProjects){status.textContent='Seu cargo não pode propor projetos.';return;}
      const form=button.closest('.economy-project-form');
      const title=form?.querySelector('[name="title"]');
      const type=form?.querySelector('[name="projectType"]');
      const amount=form?.querySelector('[name="budgetBronze"]');
      if(!title?.reportValidity()||!amount?.reportValidity()||!type?.value)return;
      message.title=title.value.trim();message.projectType=type.value;
      message.budgetBronze=Number(amount.value);
      if(message.title.length<4||!Number.isSafeInteger(message.budgetBronze)||message.budgetBronze<1)return;
      message.projectId=crypto.randomUUID();message.governmentId=panel.governmentId;
      draft={message,price:0,cost:0,title:'Revisar proposta de projeto',
        summary:`${message.title} · orçamento de ${formatMoney(message.budgetBronze)} · categoria ${message.projectType}.`,
        detail:'A proposta não movimenta dinheiro. A liderança deverá aprovar e reservar o orçamento posteriormente.'};
      controller.navigate('commerce-review');return;
    }
    if (name === 'economyProjectDecide') {
      const panel=getState().economyManagementPanel;
      if(!panel?.permissions?.approveProjects){status.textContent='Somente a liderança pode decidir.';return;}
      const project=panel.projects?.find(p=>p.projectId===message.projectId);
      if(!project || !['fund','cancel'].includes(message.decision))return;
      message.governmentId=panel.governmentId;
      draft={message,price:0,cost:0,title:message.decision==='fund'?'Reservar orçamento público':'Cancelar projeto público',
        summary:`${project.title} · ${formatMoney(project.budgetBronze)} · fundo ${project.fundCode}.`,
        detail:message.decision==='fund'
          ? 'A reserva reduz o saldo disponível, mas não gasta nem emite moeda. Falta de saldo bloqueará a operação.'
          : 'O cancelamento libera a reserva remanescente. Nenhum valor será devolvido a carteiras de jogadores.'};
      controller.navigate('commerce-review');return;
    }
    if (name === 'economyRoleSet') {
      const panel=getState().economyManagementPanel;
      message.governmentId=panel?.governmentId;
      const permissions=panel?.permissions;
      if (!permissions?.manageRoles) { status.textContent='Cargo econômico não autorizado.'; return; }
      if (!message.username) {
        const form=button.closest('.economy-role-form');
        const input=form?.querySelector('[name="username"]');
        const role=form?.querySelector('[name="role"]');
        if (!input?.reportValidity() || !role?.value) return;
        message.username=input.value.trim().toLowerCase();
        message.role=role.value;
      }
      draft={message,price:0,cost:0,title:'Revisar cargo econômico',
        summary:message.role==='none'
          ? `Revogar o cargo econômico de ${message.username}? O acesso aos painéis será removido imediatamente.`
          : `Atribuir a ${message.username} o cargo de ${economyRoleNames[message.role]||'não reconhecido'} neste governo?`,
        detail:'Somente o líder ou administrador pode confirmar. O servidor registra a alteração.'};
      controller.navigate('commerce-review');return;
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
    if (['lodgeClaim', 'propertyBuy', 'propertyRent', 'propertyList', 'lodgeBuyTool', 'lodgeSell', 'lodgeBuyMaterial'].includes(name)) {
      const state = getState(), price = operationPrice(message, state);
      if (!Number.isSafeInteger(price) || price < 1) { status.textContent = 'Preço indisponível. Atualize e tente novamente.'; return; }
      if(name==='lodgeClaim') message.requestId=crypto.randomUUID();
      message.expectedPriceBronze=price;
      const selling = name === 'lodgeSell', listing = name === 'propertyList';
      const cost = selling || listing ? 0 : name === 'lodgeBuyMaterial' ? price * message.quantity : price;
      if (cost > balance(state)) { status.textContent = 'Saldo insuficiente para esta operação.'; return; }
      draft = { message, price, cost, title: selling ? 'Revisar venda' : listing ? 'Revisar anúncio' : name === 'lodgeClaim' && message.mode === 'rent' ? 'Revisar aluguel' : 'Revisar compra',
        summary: selling ? `${message.quantity} × ${itemNames[message.item]} · total bruto ${formatCoins(price * message.quantity)}. O imposto vigente será descontado pelo servidor.`
          : name === 'lodgeBuyMaterial' ? `${message.quantity} × ${itemNames[message.item]} · ${formatCoins(price)} por unidade. Total ${formatCoins(cost)}. Saldo após compra: ${formatCoins(balance(state) - cost)}.`
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
    if(['propertyRequest','propertyRentDelist','economyRoleSet','economyRefresh',
      'economyGovernmentSelect','economyFundTransfer','economyProjectPropose','economyProjectDecide'].includes(message.name))return 0;
    if(['propertyQuote','propertyRentList'].includes(message.name))return message.askingPriceBronze || 0;
    if (['setLodgingAutoRenew', 'propertyDelist', 'cabinRevokeKey'].includes(message.name)) return 0;
    if (message.name === 'lodgeSell') return state.marketQuotes?.[message.item]?.buyPrice ?? TRADE_PRICES[message.item];
    if (message.name === 'lodgeBuyMaterial') return state.marketQuotes?.[message.item]?.sellPrice;
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
