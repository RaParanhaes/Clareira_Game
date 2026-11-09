# Regras do agente da Clareira

## 1. Fonte da verdade e deploy

- **GitHub é a fonte da verdade.** Repositório: `RaParanhaes/Clareira_Game`.
- A **VPS atualiza sozinha** a partir da `main` do GitHub (cerca de 10 minutos depois de cada integração).
- **Ninguém edita direto na VPS.** O agente trabalha localmente, em branch, e envia pelo GitHub.
- A checagem no jogo da VPS depois da integração é feita pelo dono, não pelo agente.

## 2. Branches

- Nunca editar direto na `main`.
- **Regra única:** toda mudança nova começa em uma branch nova, criada a partir da `main` atualizada (`git fetch` antes).
- **Reaproveitar uma branch só quando o dono pedir** para continuar nela. Não há reaproveitamento automático.
- Nome da branch: `<tipo>/<area>-<tema>`, por exemplo `feat/world-sol-verao` ou `fix/server-chat`.
  - Tipos: `feat`, `fix`, `chore`.
  - Áreas: `character`, `world`, `server`, `ui`, `db`, `infra`.
- Uma branch = um tema. Assunto novo gera branch nova.
- **Nunca apagar branch** sem pedido explícito do dono. Branch integrada fica como histórico.

## 3. Commits

- Só se commita depois da aprovação do dono da prova de imagem (seção 4).
- Mensagem: `categoria: resumo curto em português`, com `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>` no fim.
- Um commit por mudança aprovada. Não misturar categorias no mesmo commit.
- Antes de commitar, `git status`: arquivos fora da mudança (inclusive `.claude/`) ficam de fora.
- Nunca `reset --hard`, `push --force` ou reescrever histórico. Para desfazer, `git revert`.

## 4. Fluxo de cada entrega

1. **Planejar:** uma frase com o que muda e em qual área.
2. **Implementar** na branch nova.
3. **Validar no jogo real** (teste de unidade não basta):
   - rodar o jogo a partir do código da branch, em sandbox separado, com data e horário fixados;
   - capturar **antes** (estado atual da `main`) e **depois** (branch), em **desktop e celular**;
   - rodar os testes focados da área.
4. **Enviar ao dono:** imagens antes e depois (aqui no chat), data e horário usados, resultado dos testes e o que mudou. Nenhuma entrega chega sem imagem.
5. **Aguardar a decisão do dono:**
   - **Aprovado:** commit na branch, `push` e abertura de **PR detalhada**.
   - **Reprovado:** diagnosticar o que não deu certo (o que o dono viu, o que era esperado, qual valor ou regra causou o efeito), corrigir na mesma branch e repetir a partir do passo 3, com imagens novas.
6. **Integrar** só com autorização explícita do dono, pela PR.

## 5. Pull request

- Toda integração é feita por PR.
- **Título:** curto, em português.
- **Tags:** etiquetas da PR, sempre em inglês (ex.: `feature`, `bugfix`, `enhancement`, `fixture`, `docs`, `infra`, `refactor`). Os nomes são exemplos: o agente escolhe a etiqueta que melhor descreve cada PR. Quando a etiqueta ainda não existe no repositório, o agente pede ao dono antes de criá-la; enquanto isso, usa a padrão mais próxima.
- **Descrição** com estas seções, nesta ordem:
  1. **Tags**
  2. **Resumo:** o que muda e por quê, em 2 a 4 frases.
  3. **O que mudou:** lista de arquivos e comportamento.
  4. **Como testar:** passos para o dono reproduzir no jogo.
  5. **Testes:** comandos e resultado.
  6. **Evidências:** pasta local e nomes das imagens (sempre o caminho completo).
  7. **Registro:** link para o `MODIFICACOES.md`.
- A PR só é integrada depois da aprovação do dono.

## 6. Registro de modificações (`MODIFICACOES.md`)

- Fica na raiz do repositório, com uma linha por área (formato de tabela: data, área, hash, resumo, evidências).
- Cada integração atualiza **somente a linha da área afetada**, no mesmo commit.
- **Resumo** em uma frase e **link** para a pasta de evidências (imagens e textos) no computador do dono: `~/clareira-evidencias/<data>-<area>-<tema>/`.
- Nunca apagar linhas antigas: o histórico continua no Git.

## 7. Evidências

- Imagens e relatórios ficam no computador do dono, em `~/clareira-evidencias/<data>-<area>-<tema>/`.
- Nunca reutilizar capturas antigas. Cada prova é refeita com o estado atual.
- A imagem deve mostrar o efeito pedido. HTTP 200 e ausência de erro no console não provam qualidade.

## 8. Sandbox e processos

- Todo teste tem limite de tempo (`timeout`).
- Todo script de navegador fecha o navegador no `finally`, mesmo com erro.
- Servidores temporários usam as portas 8099 e 8100 quando estiverem livres. Se estiverem ocupadas por outra sessão, usar outra porta e registrar no relatório.
- Encerrar só processos que o próprio agente iniciou, pelo PID exato. Nunca `pkill` nem `killall`.
- Processos de outra sessão não são encerrados: são informados ao dono.
- Testes que abrem navegador rodam um de cada vez.
- Ao terminar, conferir processos e portas deixados pelo próprio agente.

## 9. Dados e segurança

- Segredos, contas, saves, `.local/` e `node_modules/` nunca entram no Git.
- Nenhuma dependência é instalada sem autorização do dono.
- PostgreSQL é a fonte de dados persistentes. Redis é só cache e presença.

## Histórico desta versão

- Sol de verão: PR #11, integrada em `main` pelo merge `c5aac3b`, com `MODIFICACOES.md` atualizado.
