import { randomUUID } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value, fallback = '', maxLength = 180) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : fallback;

function jsonObject(value, field) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${field} precisa ser um objeto.`);
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded) > 12_000) throw new RangeError(`${field} excede o limite do registro.`);
  const copied = JSON.parse(encoded);
  if (Object.getPrototypeOf(copied) !== Object.prototype) throw new TypeError(`${field} inválido.`);
  return copied;
}

export function normalizeInteractionEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Registro de interação inválido.');
  const context = jsonObject(value.context, 'contexto');
  const object = jsonObject(value.object, 'objeto');
  const transfer = jsonObject(value.transfer, 'transferência');
  const details = jsonObject(value.details, 'detalhes');
  const position = jsonObject(context.position, 'posição');
  for (const axis of ['x', 'y', 'z']) {
    if (position[axis] !== undefined && (!Number.isFinite(position[axis]) || Math.abs(position[axis]) > 100_000)) {
      throw new TypeError('Posição de interação inválida.');
    }
  }
  const location = context.location === 'room' ? 'room' : 'clearing';
  return {
    eventId: UUID.test(value.eventId || '') ? value.eventId : randomUUID(),
    actorProfileId: UUID.test(value.actorProfileId || '') ? value.actorProfileId : null,
    action: text(value.action, 'interact', 80),
    dimensionId: text(context.dimensionId, 'surface', 80),
    location,
    placeId: text(context.placeId, location === 'room' ? 'room' : 'clearing', 180),
    instanceId: text(context.instanceId, '', 180) || null,
    position: { x: position.x || 0, y: position.y || 0, z: position.z || 0 },
    objectId: text(object.id, '', 180) || null,
    objectKind: text(object.kind, '', 80) || null,
    objectProperties: jsonObject(object.properties, 'propriedades do objeto'),
    transfer,
    details,
    happenedAt: Number.isFinite(value.happenedAt) ? new Date(value.happenedAt).toISOString() : new Date().toISOString(),
  };
}
