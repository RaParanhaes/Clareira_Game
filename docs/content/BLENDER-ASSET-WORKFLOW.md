# Produção e revisão de assets 3D → UV → sprites

Fluxo obrigatório da Clareira para criar ou revisar construções, móveis, vegetação e props modelados em Blender. O objetivo é uma peça visualmente convincente, fisicamente coerente e utilizável no jogo. Uma aprovação técnica não aprova a aparência; uma imagem bonita não aprova colisão ou profundidade.

Leia primeiro este roteiro. Consulte [UV-MATERIALS.md](UV-MATERIALS.md), [ISOMETRIC-DEPTH.md](ISOMETRIC-DEPTH.md) e [SCENE-OBJECTS.md](SCENE-OBJECTS.md) para os contratos espaciais; para casas, acrescente [BUILDING-STANDARD.md](BUILDING-STANDARD.md). Os exemplos abaixo orientam o processo; medidas de uma cabana não são medidas universais de outros objetos.

## Comece por uma peça completa

Traduza o pedido em uma frase e uma lista curta de relações verificáveis. Exemplo: “Revisar a Cabana do Cedro, mantendo uma janela de quarto e entrada funcional, com alpendre apoiado, cobertura assimétrica e leitura consistente nas quatro rotações”.

Registre ao lado da fonte ou em `logs/<entrega>/iteration_review.json`:

- Peça/ID, função e estilo pretendido; o que o dono aprovou e o que rejeitou.
- Dimensões físicas, centro de apoio, posição da porta/janelas, orientação, capacidade de uso, pontos de colisão e estados pertinentes. Extraia do catálogo/runtime; não adivinhe pela imagem.
- Invariantes e mudanças permitidas. Para uma revisão de arte, preservar IDs, contas, chaves, móveis salvos e autoridade do servidor.
- Imagens de evidência anteriores, fonte e `.blend` preservados. Não sobrescrever a única cópia de uma versão aprovada.

Não ampliar uma revisão de cabana para todos os prédios ou 200 objetos antes de concluir e revisar esse exemplar. Uma família nova pode partir dele depois, com parâmetros próprios e revisão por variante.

## Etapas e critérios para avançar

| Etapa | Faça | Evidência exigida antes de avançar |
|---|---|---|
| 1. Referências | Abra fotos/desenhos reais que respondam às dúvidas de proporção, apoio e construção. Comece com o material do dono; complete lacunas com até três fontes primárias úteis. | Notas com URL/imagem, ângulo, relação observada e suposição. Uma página lida ou URL coletada sem abrir a imagem não conta como referência visual. |
| 2. Volumes | Revise silhueta, proporção humana, planta, inclinação/espessura de cobertura e espaços negativos. Trabalhe com forma simples e iluminação neutra. | Frente e três quartos mostram massa coerente; acesso e vãos funcionam. Se ainda parece um bloco genérico, corrija a forma antes de detalhar. |
| 3. Construção | Encaixe paredes, pilares, travessas, aberturas, telhado e peças secundárias. Dê a cada componente apoio ou conexão explicável. | Vistas complementares mostram juntas contínuas, peças apoiadas e vãos livres. Não esconder um defeito do ângulo difícil com outro enquadramento. |
| 4. UV e materiais | Use UV local por face, atlas com margem e densidade coerente. Faça o material dizer madeira, pedra, reboco, tecido etc. | Textura não se achata, atravessa outra face ou muda com o giro. Palette e detalhe continuam legíveis em tamanho de jogo. |
| 5. Exportação | Gere pela fonte, em Blender limpo, as quatro rotações e estados relevantes. Separe peças conforme oclusão/uso. | Mesma câmera, escala, apoio e identidade em todas as vistas; frente, fundos, laterais, topo, hero e folha completa inspecionados. |
| 6. Auditoria | Reabra o `.blend`; cheque geometria avaliada, UV, aberturas e pontos físicos. Rode testes pertinentes e catálogo. | Nenhum defeito técnico inexplicado. Warnings não viram aprovação só porque um comando retornou exit 0. |
| 7. Integração | Carregue pelo pacote da cena e use o renderer, ordenação e física reais. Faça capturas desktop/celular e ações pertinentes. | Arte visível, tamanho correto, personagem/uso sem sobreposição indevida; resultado isolado e resultado no mapa real identificados separadamente. |

Etapas já aprovadas são preservadas. Uma correção de dobradiça não exige remodelar o telhado; uma silhueta errada exige voltar aos volumes. Não inventar uma nota estética numérica ou aprovação automática.

## Decisões de modelagem que evitam os erros anteriores

### Aberturas e apoios

- A janela é uma abertura na geometria, com esquadria e vidro encaixados. Um retângulo desenhado sobre uma parede inteira pode parecer tampado. Verifique a malha salva, não apenas a intenção do código.
- Vigas são organizadas **ao redor** das aberturas. Um cruck que desce do telhado ao chão pode atravessar o vidro mesmo depois de remover travessas menores.
- Alpendre deve cobrir a porta. Compare os centros dos pilares e a soleira com o catálogo; não instalar uma cobertura bonita sobre a parede ao lado.
- Cumeeira, testeira, telhas e beiral pertencem ao mesmo sistema de cobertura. Não usar uma grade de barras soltas para simular telhas.
- Fundação, pés, suportes de floreira, chaminé e juntas devem continuar apoiados na vista lateral e traseira. Proximidade de caixas delimitadoras é pista, não comprovação de contato entre superfícies.
- Dimensão de vão livre, dimensão da moldura e dimensão do vidro são distintas. Dê nomes a cada uma; não corrigir a proporção de um giro redesenhando o objeto naquele PNG.
- Número de quartos/janelas deriva da planta. Um respiro cego não emite luz nem é outra janela. Não adicionar quartos para justificar detalhes decorativos.

### UV, malha e textura

Para uma projeção planar local, descarte o eixo de maior valor absoluto da normal da face; descarte do eixo menor pode colapsar UV em faces alinhadas aos eixos. Verifique área UV não nula, orientação e escala de texel, inclusive em faces criadas por Boolean.

Recalcule normais de malhas fechadas antes de Boolean. Limite bevel por espessura da peça: bordas muito largas em uma haste fina produziram faces degeneradas no modelo anterior. Inspecione a geometria **avaliada**, depois de modificadores.

A cabana atual é composta por sólidos fechados e exige zero faces degeneradas/arestas nulas/não-manifold. Outros assets podem ter planos abertos intencionais, como folhas ou tecido; documente a razão e revise visualmente. Não converter essa particularidade em obrigação de soldar toda malha do jogo.

Use variação tonal controlada dentro do material. Uma cor muito diferente sorteada para cada telha produz um mosaico sem relação com a superfície. Enfeite não compensa proporção ou encaixe errado.

### Camadas e profundidade

Decida as camadas a partir do que precisa ficar entre o personagem e outra parte. Na cabana: parede/telhado principal, pilar esquerdo, pilar direito e cobertura do alpendre. Em uma cama: estrutura, ocupante e coberta/cabeceira conforme a direção. Uma montagem estática em um PNG só serve quando nenhuma parte precisa se intercalar com o ator.

Não desenhar simultaneamente o alpendre dentro do PNG e a versão procedural por cima. Ative a montagem nova quando suas camadas necessárias estiverem prontas. Todas usam o mesmo apoio do mundo; margens transparentes não alteram o tamanho físico.

Use o helper de ordenação chamado pelo runtime. Um teste com a soma crua `x+y` não valida um personagem se o runtime depois muda seu anchor. A falha antiga promovia o personagem ao canto distante do prédio, colocando-o à frente de todos os pilares. `buildingExteriorAvatarDepthAnchor` preserva a relação com a fachada e cada pilar.

## Receita executável: Cabana do Cedro

Fontes e decisões atuais:

- `scripts/blender/build-medieval-cottage.py`: geometria, materiais, câmera e exportação.
- `scripts/blender/cottage_pixels.py`: normalização sem perda de RGB invisível e PNGs.
- `scripts/blender/validate-medieval-cottage.py`: auditoria da malha salva, raios pelos painéis da janela em quatro rotações, posições dos pilares e UVs.
- `game/art/buildings/medieval-cottage-3d/BUILD-CONTRACT.md`: medidas, camadas, estados e limitações atuais.
- `game/art/buildings/medieval-cottage-3d/reference_notes.md`: imagens observadas e adaptação autoral.
- `scripts/check-cottage-art.mjs`: checagens técnicas em sequência, com logs e status real.

A partir da raiz do repositório:

```sh
npm run art:cottage:build
npm run art:cottage:check
```

O primeiro comando gera `.blend`, atlas, PNGs, vistas e comprovantes SHA-256 da fonte/exportações. O segundo rejeita uma fonte alterada depois do render ou PNG divergente; reabre o Blender, audita a geometria, roda os testes de edifícios/colisão, valida o catálogo e depois abre Chromium para a integração visual isolada. Os resultados ficam em `logs/cottage-art-revision/`. Não executar testes e Chromium ao mesmo tempo.

Para o mapa real, após terminar os testes, execute `node scripts/browser-cottage-live-check.mjs`. O roteiro entra como visitante, espera `sceneReady`, atravessa o prólogo pelos controles normais e tenta caminhar até a cabana. Ele grava `live-cottage-result.json` e capturas atuais, com `pending` e motivo concreto se não alcançar o alvo. Não confundir esse comando com a galeria isolada; não repetir tentativas sem analisar a falha registrada.

Depois **abra** estes arquivos com a ferramenta de imagem:

1. `game/art/buildings/medieval-cottage-3d/frames/hero-three-quarter.png`.
2. `game/art/buildings/medieval-cottage-3d/cottage-multiview-contact-sheet.png`.
3. `logs/cottage-art-revision/browser/canvas-day-night-depth-desktop.png`.
4. `logs/cottage-art-revision/browser/canvas-day-night-mobile.png`.

A abertura das imagens e o julgamento de forma são ações do agente: o script não consegue certificar beleza. Quando uma miniatura não resolve uma dúvida, abra a vista individual. Compare o mesmo apoio, câmera e escala; registre quando a apresentação também mudou. Uma folha com 11 vistas e só 10 células escondia o hero: calcule o número de linhas necessário.

Para outra família, adapte os parâmetros, nomes, ações e auditoria. Não executar uma auditoria de janela de cabana e apresentá-la como validação de cadeira, árvore ou armário.

## Revisão visual: responda com evidência

Antes de editar, crie uma tabela com `requisito`, `pass/fail/unclear`, `arquivo da imagem` e `observação concreta`. Depois da correção, atualize a mesma tabela e diga o que foi preservado. `unclear` requer outra vista ou medição; não pode virar `pass` por inferência de nomes de objetos.

Perguntas necessárias para esta classe de asset:

- A peça continua reconhecível pela silhueta e possui proporção humana plausível?
- Acessos, aberturas e partes usáveis continuam visíveis e livres?
- Alguma viga, cama, cobertura, almofada ou avatar atravessa uma parte que deveria ocultá-la?
- Cada apoio e junta se sustenta também na lateral e nos fundos?
- Madeira, pedra, tecido e vidro diferem sem ruído ou saturação excessiva?
- O detalhe continua legível no tamanho nativo e no celular?
- A mesma geometria e os mesmos estados explicam todas as orientações?

Se duas correções consecutivas não mudarem o defeito visível, reformule a hipótese com outra vista ou isolamento da peça. Não repetir a mesma correção cosmética nem simplificar o asset inteiro para eliminar um warning.

## Integração e estados de validação

Versione os assets em `game/content-assets.mjs`; confira bytes, hashes e memória RGBA decodificada. O custo de triângulos do Blender não é o custo do jogo quando a entrega é PNG offline. Só afirmar FPS/latência melhor com medição comparável. Não adicionar engine 3D ao runtime para resolver autoria.

Mudanças de metadados persistentes exigem patch versionado e revisão atual do catálogo, preservando overrides e saves. Alterar um default em código não migra a instância já salva no PostgreSQL. Registre qualquer diferença pendente entre material autorado e fallback legado.

No `/dev/`, espere o loading terminar e um estado jogável explícito. Use seletores por papel/nome acessível; o botão de visitante tem uma seta decorativa. Não esconder overlays ou forçar clique para chamar a entrada de aprovada. Capture a tela e o estado real se a preparação de sessão/cena impedir a inspeção. Não confundir login visível, autenticação concluída e mundo pronto.

Registre separadamente:

| Estado | O que autoriza dizer |
|---|---|
| `technical-pass` | Fonte e arquivos correspondem; medições e testes indicados passaram. |
| `visual-reviewed` | O agente abriu as imagens e registrou avaliação concreta por requisito. Não representa aprovação do dono. |
| `isolated-runtime-pass` | O renderer do jogo desenhou a montagem em Chromium, com as ações/estados documentados. |
| `live-game-pass` | O mapa real foi carregado e a ação foi experimentada; há capturas atuais. |
| `blocked` / `pending` | Há um impedimento ou requisito ainda sem evidência; informar qual e preservar o trabalho. |

Na conclusão, mostre uma imagem útil primeiro, uma comparação ou folha de vistas quando pertinente, o que mudou e as verificações efetivamente realizadas. Não dizer “tudo validado”, “pronto para todos os objetos” ou “melhor desempenho” se as evidências só cobrem uma montagem isolada.
