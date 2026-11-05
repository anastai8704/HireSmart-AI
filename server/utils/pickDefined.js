// Copies only the listed keys that are present in `source`. Used instead of spreading request bodies into
// models, so a field added to a request schema later cannot silently become writable.
const pickDefined = (source, keys) =>
  Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));

module.exports = pickDefined;
