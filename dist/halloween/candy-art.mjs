import { COOKING_MOLDS, COOKING_PALETTE } from './cooking-rules.mjs';

const EXPECTED_SHAPES = Object.freeze([
  { id: 'star', name: '星星' },
  { id: 'heart', name: '爱心' },
  { id: 'pumpkin', name: '南瓜' },
  { id: 'ghost', name: '幽灵' },
]);
const EXPECTED_COLORS = Object.freeze([
  { id: 'amber', name: '琥珀金', hex: '#F4A941' },
  { id: 'rose', name: '莓果粉', hex: '#D16B87' },
  { id: 'plum', name: '葡萄紫', hex: '#9972B8' },
  { id: 'cream', name: '奶油白', hex: '#F5E5BB' },
  { id: 'mint', name: '薄荷绿', hex: '#79B8A3' },
  { id: 'blue', name: '晴空蓝', hex: '#84B7D6' },
]);
const ASSET_BASE_BY_VERSION = Object.freeze({
  'halloween-candy-v1': '/halloween/candies/v1/',
  'halloween-candy-v2': '/halloween/candies/v2/',
  'halloween-candy-v3': '/halloween/candies/v3/',
});
const SHAPES_BY_VERSION = Object.freeze({
  'halloween-candy-v1': EXPECTED_SHAPES,
  'halloween-candy-v2': EXPECTED_SHAPES,
  'halloween-candy-v3': Object.freeze(COOKING_MOLDS.map(({ id, name }) => ({ id, name }))),
});
const COLORS_BY_VERSION = Object.freeze({
  'halloween-candy-v1': EXPECTED_COLORS,
  'halloween-candy-v2': EXPECTED_COLORS,
  'halloween-candy-v3': Object.freeze(COOKING_PALETTE.map(({ id, name, hex }) => ({ id, name, hex }))),
});
const sameCatalog = (actual, expected, fields) => Array.isArray(actual) && actual.length === expected.length &&
  expected.every(item => actual.some(candidate => candidate && fields.every(field => candidate[field] === item[field]))) &&
  actual.every((item, index) => actual.findIndex(candidate => candidate?.id === item?.id) === index);

function validateCandyManifest(manifest) {
  const assetBase = ASSET_BASE_BY_VERSION[manifest?.version];
  const expectedShapes = SHAPES_BY_VERSION[manifest?.version];
  const expectedColors = COLORS_BY_VERSION[manifest?.version];
  if (!manifest || typeof manifest !== 'object' || !assetBase ||
      !sameCatalog(manifest.shapes, expectedShapes, ['id', 'name']) ||
      !sameCatalog(manifest.colors, expectedColors, ['id', 'name', 'hex']) || !Array.isArray(manifest.assets))
    throw new TypeError('candy_manifest_unavailable');
  const assets = new Map();
  for (const asset of manifest.assets) {
    if (!asset || typeof asset !== 'object' || !expectedShapes.some(shape => shape.id === asset.shape) ||
        !expectedColors.some(color => color.id === asset.color) ||
        asset.url !== `${assetBase}${asset.shape}-${asset.color}.png` ||
        assets.has(`${asset.shape}:${asset.color}`)) throw new TypeError('candy_manifest_invalid');
    assets.set(`${asset.shape}:${asset.color}`, asset.url);
  }
  if (assets.size !== expectedShapes.length * expectedColors.length)
    throw new TypeError('candy_manifest_incomplete');
  return { assets, shapes: manifest.shapes.map(shape => ({ ...shape })),
    colors: manifest.colors.map(color => ({ ...color })) };
}

// Accepts the real Three.js export manifest. There is deliberately no filename
// fallback: missing artwork makes crafting unavailable.
export function createCandyArt(manifest) {
  const catalog = validateCandyManifest(manifest);
  const byShape = new Map(catalog.shapes.map(shape => [shape.id, shape]));
  const byColor = new Map(catalog.colors.map(color => [color.id, color]));
  function renderCandy({ shape, color, flavor, flavorMaterial }) {
    const shapeInfo = byShape.get(shape), colorInfo = byColor.get(color);
    if (!shapeInfo || !colorInfo || typeof flavor !== 'string' || !flavor.endsWith('味') ||
        typeof flavorMaterial !== 'string' || flavor !== `${flavorMaterial}味`) throw new TypeError('candy_art_unavailable');
    const image = catalog.assets.get(`${shape}:${color}`);
    if (!image) throw new TypeError('candy_art_unavailable');
    return {
      appearance: { shape, shapeName: shapeInfo.name, color, colorName: colorInfo.name,
        colorHex: colorInfo.hex, flavor, flavorMaterial,
        name: `${shapeInfo.name}${colorInfo.name}${flavor}糖` },
      image,
    };
  }
  return { renderCandy, appearance: {
    shapes: catalog.shapes.map(({ id }) => id), colors: catalog.colors.map(({ id }) => id),
    shapeOptions: catalog.shapes, colorOptions: catalog.colors,
  } };
}

export function createCandyRenderer(manifest) { return createCandyArt(manifest).renderCandy; }
