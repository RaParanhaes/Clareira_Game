# Diagnóstico de movimento e quedas de sessão

O cliente mantém até 64 eventos técnicos recentes por aba. Quando detecta ACK parado, fila de previsão congestionada, pausa de quadro ou fechamento do WebSocket, persiste e envia um lote ao servidor; se a conexão caiu, reenvia após reconectar. O servidor registra o lote no journal do serviço e confirma o `reportId` para impedir duplicação. O fechamento do socket e ticks de servidor excepcionalmente lentos também geram linhas independentes.

Os eventos guardam sequência enviada/confirmada, quantidade de comandos pendentes, vetor de movimento, corrida/agachamento, bytes na fila do WebSocket, duração sem ACK, pausa entre quadros e estado resumido da fila no servidor. Não coletam chat, credenciais, cookies, nome de conta, IP, coordenadas do mundo nem conteúdo do inventário. IDs de conexão e relatório são aleatórios e temporários. O buffer local é limitado; a retenção remota segue a política de journald do host.

Para analisar o preview:

```sh
sudo journalctl -u clareira-dev-preview-room.service --since '24 hours ago' -o cat \
  | node scripts/analyze-movement-diagnostics.mjs
```

Para guardar uma amostra privada e analisá-la depois:

```sh
sudo journalctl -u clareira-dev-preview-room.service --since today -o cat \
  | rg 'movement-diagnostic|movement-session-close|movement-server-tick-slow' \
  > /tmp/clareira-movement-diagnostics.log
node scripts/analyze-movement-diagnostics.mjs /tmp/clareira-movement-diagnostics.log
```

O cliente recupera a conexão após congestionamento de ACK sustentado, mesmo quando chegam confirmações esporádicas. A recuperação é marcada no lote para distinguir interrupção de rede de sobrecarga do servidor. O relatório agrega pendências, pausas, hiatos entre ACKs, lacuna entre comandos recebidos e simulados, quedas e ticks lentos. Os comandos continuam agrupados em pares, mas um comando ímpar final agora é enviado após uma janela de 40 ms; assim, soltar a tecla não deixa um passo preso aguardando um segundo comando. Uma tentativa de envio que encontra o socket fechado também preserva a fila para a reconexão.

Lotes de diagnóstico são limitados pelo tamanho serializado em UTF-8 e divididos para caber no limite WebSocket de 8 KiB do servidor. O limite é compartilhado entre cliente e servidor; cada lote mantém o mesmo ID até a confirmação e os eventos seguintes só são enviados depois dela.

Use uma sessão real em desktop e celular para comparar os eventos com a reprodução do travamento antes de alterar física ou frequência de snapshots.
