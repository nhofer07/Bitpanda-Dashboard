// Bitpanda identifiers use the UUID wire format, but are not limited to the
// older UUID versions 1-5. Keep the structural/variant validation while also
// accepting newer versions such as UUIDv7.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function cleanUuid(value, field) {
  const id = String(value || "").trim();
  if (!UUID_PATTERN.test(id)) throw new Error(`${field} ist ungültig.`);
  return id;
}
