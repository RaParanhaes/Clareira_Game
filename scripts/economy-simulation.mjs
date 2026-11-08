import { calculateBankInterestQuote, calculateDynamicQuote, calculateGovernmentTaxRate, calculateInputCost, calculateMinimumShiftPay, calculateMoneySupplyPriceFactor, calculatePropertyTransfer, calculateTaxWithRemainder, calculateTradeBalance, calculateValueAdded, ECONOMY_RECIPES } from '../game/economy.mjs';

const base = { timber:1, plank:12, copperOre:5, charcoal:7, copperIngot:60 };
const recipes = ECONOMY_RECIPES;

function runScenario(name, { stock, sales }, days = 8) {
  const previous = { ...base };
  console.log(`\n${name}`);
  console.log('dia | madeira | ripa | minério Cu | carvão | lingote Cu (bronzes)');
  for (let day = 1; day <= days; day++) {
    const current = {};
    for (const itemId of Object.keys(base)) {
      const inputCost = calculateInputCost(recipes[itemId], Object.fromEntries(
        Object.entries(current).map(([key, sellPrice]) => [key, { sellPrice }]),
      ), base);
      const quote = calculateDynamicQuote({
        basePrice:base[itemId], previousPrice:previous[itemId],
        recentUnitsSold:sales[itemId] ?? 10, expectedUnitsSold:10,
        eligibleStock:stock[itemId] ?? 100, targetStock:100, inputCost,
      });
      current[itemId] = Math.max(quote.sellPrice, quote.productionFloor);
    }
    console.log(`${String(day).padStart(3)} | ${String(current.timber).padStart(7)} | ${String(current.plank).padStart(4)} | ${String(current.copperOre).padStart(10)} | ${String(current.charcoal).padStart(6)} | ${String(current.copperIngot).padStart(17)}`);
    Object.assign(previous, current);
  }
}

runScenario('Referência: estoque e vendas no alvo', { stock:{}, sales:{} });
runScenario('Demanda alta: vendas do lingote 2x do normal', {
  stock:{}, sales:{ copperIngot:20, copperOre:16, charcoal:14 },
});
runScenario('Escassez: pouco minério e carvão disponíveis', {
  stock:{ copperOre:5, charcoal:4, copperIngot:24 }, sales:{},
});
runScenario('Excedente: lingotes 4x acima do estoque-alvo', {
  stock:{ copperIngot:400 }, sales:{},
});

console.log('\nPolítica demonstrativa compartilhada com o cálculo do jogo: suavização de 30%, limite de 30% por período, faixa de 55–180% do preço-base e spread de 15%.');

console.log('\nImposto da vila por saldo do tesouro (taxa base 2%, alvo 300.000 bronzes, sensibilidade 1%, ajuste diário 20%):');
console.log('saldo no tesouro | taxa do próximo dia');
for (const balance of [0, 150_000, 300_000, 1_000_000]) {
  const rate = calculateGovernmentTaxRate({
    baseRateBps:200, minimumRateBps:0, maximumRateBps:500,
    treasuryTargetBronze:300_000, treasuryBalanceBronze:balance,
    treasurySensitivityBps:100, previousRateBps:200,
  });
  console.log(`${String(balance).padStart(16)} | ${(rate / 100).toFixed(2)}% (${rate} pontos-base)`);
}

console.log('\nVenda hipotética de uma cabana anunciada por 10.000 bronzes:');
console.log('alíquota | vendedor recebe | tesouro recebe');
for (const rate of [0, 200, 220, 500]) {
  const split = calculatePropertyTransfer(10_000, rate);
  console.log(`${(rate / 100).toFixed(2).padStart(7)}% | ${String(split.sellerProceedsBronze).padStart(15)} | ${String(split.taxBronze).padStart(14)}`);
}
let rentTaxRemainder = 0, rentTaxTotal = 0;
for (let day = 0; day < 30; day += 1) {
  const charge = calculateTaxWithRemainder(24, 220, rentTaxRemainder);
  rentTaxTotal += charge.taxBronze;
  rentTaxRemainder = charge.remainderNumerator;
}
console.log(`30 diárias de 24 bronzes a 2,20%: ${rentTaxTotal} bronzes de imposto agregado (resto de ${rentTaxRemainder}/10.000 bronze para as próximas cobranças).`);

console.log('\nEfeito macro da oferta de moedas sobre um preço-base de 100 bronzes (referência calibrada, suavização 20%, limite diário 10%):');
console.log('oferta vs referência | fator-alvo | fator do primeiro dia | cotação ilustrativa');
for (const [label, supply] of [['metade', 500_000n], ['igual', 1_000_000n], ['dobro', 2_000_000n], ['dez vezes', 10_000_000n]]) {
  const monetary = calculateMoneySupplyPriceFactor({ currentSupplyBronze:supply, referenceSupplyBronze:1_000_000n });
  const quote = calculateDynamicQuote({ basePrice:100, moneySupplyFactor:monetary.priceFactor });
  console.log(`${label.padEnd(20)} | ${monetary.targetFactor.toFixed(3).padStart(9)} | ${monetary.priceFactor.toFixed(3).padStart(18)} | ${String(quote.sellPrice).padStart(20)}`);
}
console.log('A cotação usa também procura, estoque, custo dos insumos e seus limites; moedas e lingotes são contabilizados separadamente.');

console.log('\nOrçamento público versus circulação (apenas cenários, não valores padrão):');
const goldInBronze=10_000n;
const treasuryExamples=[['vila',20_000n*goldInBronze],['castelo',1_000_000n*goldInBronze]];
const circulatingBeforeLoan=500_000_000n;
console.log('governo | orçamento do tesouro (ouro) | circulação medida | fator de preço');
for (const [kind,treasury] of treasuryExamples) {
  const factor=calculateMoneySupplyPriceFactor({currentSupplyBronze:circulatingBeforeLoan,referenceSupplyBronze:circulatingBeforeLoan});
  console.log(`${kind.padEnd(8)} | ${String(treasury/goldInBronze).padStart(26)} | ${String(circulatingBeforeLoan).padStart(17)} | ${factor.priceFactor.toFixed(3)}`);
}
const circulationAfterLoan=circulatingBeforeLoan+100_000_000n;
const loanEffect=calculateMoneySupplyPriceFactor({currentSupplyBronze:circulationAfterLoan,referenceSupplyBronze:circulatingBeforeLoan});
console.log(`Empréstimo de 10.000 ouro liberado à carteira: circulação ${circulatingBeforeLoan} → ${circulationAfterLoan} bronzes; fator do primeiro dia ${loanEffect.priceFactor.toFixed(3)}.`);
console.log('O valor guardado no tesouro não entra na circulação; a liberação do empréstimo entra. Reservas bancárias também ficam fora da circulação.');

console.log('\nTaxa de novos empréstimos conforme liquidez bancária (meta de reserva 1.000.000 ouro; política ilustrativa):');
console.log('reserva do banco | dívida ativa | taxa cotada | crédito ainda disponível');
for (const [reserve,outstanding] of [[2_500_000_000n,0n],[10_000_000_000n,0n],[20_000_000_000n,5_000_000_000n]]) {
  const quote=calculateBankInterestQuote({baseRateBps:500,minimumRateBps:0,maximumRateBps:2500,
    reserveTargetBronze:10_000_000_000n,reserveBalanceBronze:reserve,rateSensitivityBps:1000,
    creditCapacityBps:50_000,outstandingCreditBronze:outstanding,previousRateBps:500});
  console.log(`${String(reserve/goldInBronze).padStart(16)} | ${String(outstanding/goldInBronze).padStart(12)} | ${(quote.rateBps/100).toFixed(2).padStart(10)}% | ${String(quote.availableCreditBronze/goldInBronze).padStart(24)} ouro`);
}
console.log('Cada contrato mantém a taxa aceita na contratação; mudanças da política afetam novas ofertas, sem reajuste retroativo silencioso.');

console.log('\nIndicadores de produção, salário e comércio (cenário ilustrativo):');
const ingotGross=60, ingotIntermediateCost=5+2*7;
const ingotValueAdded=calculateValueAdded({outputValueBronze:ingotGross,intermediateInputCostBronze:ingotIntermediateCost});
const tradeBalance=calculateTradeBalance({exportsBronze:1_600,importsBronze:1_200});
const wage=calculateMinimumShiftPay({minimumWageBronzePerShift:150,shifts:4,agreedGrossWageBronze:600});
console.log(`Lingote vendido por ${ingotGross} bronzes, com ${ingotIntermediateCost} em insumos: contribuição local ao PIB ${ingotValueAdded} bronzes (a venda inteira não é contada como nova produção).`);
console.log(`Vila exporta 1.600 e importa 1.200 bronzes: saldo comercial +${tradeBalance} bronzes; isso mede comércio, não cria esse valor em moedas.`);
console.log(`Piso de 150 bronzes por turno × 4 turnos: salário bruto mínimo ${wage.minimumGrossBronze} bronzes; salário ilustrativo de 600 está ${wage.compliant?'em conformidade':'abaixo do piso'}.`);
console.log('Salário mínimo e tarifas comerciais são políticas versionadas por governo; a simulação não escolhe valores padrão para o mundo.');

console.log('\nCofre público e expansão (cenário didático, sem gravação no banco):');
let villageGeneral = 150_000, villageRate = 200, collected = 0;
for (let day = 1; day <= 30; day += 1) {
  const tax = Math.floor(60_000 * villageRate / 10_000);
  villageGeneral += tax;
  collected += tax;
  villageRate = calculateGovernmentTaxRate({
    baseRateBps:200, minimumRateBps:0, maximumRateBps:500,
    treasuryTargetBronze:300_000, treasuryBalanceBronze:villageGeneral,
    treasurySensitivityBps:100, previousRateBps:villageRate,
  });
}
const allocations = {
  donations:Math.floor(collected * 0.05), materials:Math.floor(collected * 0.20),
  construction:Math.floor(collected * 0.40), territory:Math.floor(collected * 0.35),
};
const expansionPrice = 15_000;
console.log(`30 dias: ${collected} bronzes arrecadados; cofre geral termina com ${villageGeneral}; alíquota cotada para o próximo ciclo ${(villageRate / 100).toFixed(2)}%.`);
console.log(`Reserva didática dos novos impostos: doações ${allocations.donations}, materiais ${allocations.materials}, construção ${allocations.construction}, território ${allocations.territory} bronzes.`);
console.log(`Pedido da vila ao reino: 2 unidades de terreno por ${expansionPrice} bronzes; ${allocations.territory >= expansionPrice ? 'reserva cobre o preço e o pagamento credita o tesouro do reino antes de aumentar o limite local' : 'a vila ainda precisa poupar ou pedir outra aprovação'}.`);
console.log('Na implementação real, propostas, aprovações, reservas, pagamento ao governo pai e aumento de limite precisam de operações auditadas no mesmo fluxo transacional.');
