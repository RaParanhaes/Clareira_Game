import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMovementDiagnostics } from './analyze-movement-diagnostics.mjs';

test('movement log analysis reads client reports, session closes and slow server ticks',()=>{
 const input=[
  'systemd prefix {"type":"movement-diagnostic-report","server":{"inputSeq":20,"receivedSeq":32},"events":[{"kind":"input-ack-stall","ageMs":1800,"pending":90},{"kind":"frame-gap","frameGapMs":420}]}',
  '{"type":"movement-session-close","code":1006,"reason":"abnormal-close","inputSeq":20,"receivedSeq":32}',
  '{"type":"websocket-client-error","reason":"payload-too-large","code":"WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"}',
  '{"type":"movement-server-tick-slow","tickDurationMs":125}',
 ].join('\n');
 assert.deepEqual(analyzeMovementDiagnostics(input),{
  reports:1,reportEvents:2,sessionCloses:1,eventKinds:{'input-ack-stall':1,'frame-gap':1},
  closeReasons:{'abnormal-close':1},closeCodes:{'1006':1},webSocketErrors:{'payload-too-large':1},clientPending:{count:1,max:90,p95:90,average:90},
  ackStallAgeMs:{count:1,max:1800,p95:1800,average:1800},frameGapMs:{count:1,max:420,p95:420,average:420},
  serverQueueGap:{count:2,max:12,p95:12,average:12},slowServerTickMs:{count:1,max:125,p95:125,average:125},
 });
});
