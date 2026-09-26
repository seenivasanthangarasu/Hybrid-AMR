/**
 * Map package serialization, parsing, and geometry utilities
 * Supports ROS 2 map_server YAML format and binary PGM (P5) image format.
 */

export function parseMapYaml(yamlText) {
  if (!yamlText || typeof yamlText !== 'string') {
    throw new Error('Invalid YAML text');
  }

  const lines = yamlText.split('\n');
  const result = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) throw new Error('Unsupported map YAML syntax');

    const key = trimmed.slice(0, colonIdx).trim();
    const rawVal = trimmed.slice(colonIdx + 1).trim();
    if (!['image', 'resolution', 'origin', 'negate', 'occupied_thresh', 'free_thresh', 'mode'].includes(key) || Object.hasOwn(result, key)) throw new Error('Unsupported or duplicate map YAML key');

    if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      // Parse array like origin: [-20.0, -15.0, 0.0]
      const items = rawVal
        .slice(1, -1)
        .split(',')
        .map((s) => Number(s.trim()));
      result[key] = items;
    } else {
      const num = Number(rawVal);
      if (Number.isFinite(num) && rawVal !== '') {
        result[key] = num;
      } else {
        result[key] = rawVal.replace(/^['"]|['"]$/g, '');
      }
    }
  }

  if (result.image !== 'map.pgm') throw new Error('Only package-relative map.pgm is supported');
  if (!Number.isFinite(result.resolution) || result.resolution <= 0) {
    throw new Error('Missing or invalid positive resolution in map YAML');
  }
  if (!Array.isArray(result.origin) || result.origin.length !== 3 || !result.origin.every(Number.isFinite)) {
    throw new Error('Missing or invalid origin [x, y, yaw] in map YAML');
  }

  if (![0, 1].includes(result.negate) || !Number.isFinite(result.free_thresh) || !Number.isFinite(result.occupied_thresh) || result.free_thresh < 0 || result.occupied_thresh > 1 || result.free_thresh >= result.occupied_thresh || (result.mode && result.mode !== 'trinary')) throw new Error('Unsupported map thresholds or mode');
  return result;
}

export function serializeMapYaml({
  image = 'map.pgm',
  resolution = 0.05,
  origin = [0, 0, 0],
  negate = 0,
  occupied_thresh = 0.65,
  free_thresh = 0.25,
  mode = 'trinary',
}) {
  return [
    `image: ${image}`,
    `mode: ${mode}`,
    `resolution: ${resolution}`,
    `origin: [${origin[0]}, ${origin[1]}, ${origin[2]}]`,
    `negate: ${negate}`,
    `occupied_thresh: ${occupied_thresh}`,
    `free_thresh: ${free_thresh}`,
    '',
  ].join('\n');
}

/**
 * Encodes ROS OccupancyGrid data into binary PGM (P5) format.
 * ROS grid data is row-major starting at bottom-left:
 * -1 = unknown, 0 = free, 100 = occupied.
 * Standard PGM greyscale:
 * 0 = black (occupied)
 * 254 = white (free)
 * 205 = grey (unknown)
 * Image rows start from top-left (Y flip applied).
 */
export function serializeP5Pgm(width, height, gridData) {
  if (!Number.isInteger(width) || width <= 0) throw new Error('Invalid grid width');
  if (!Number.isInteger(height) || height <= 0) throw new Error('Invalid grid height');
  if (!gridData || gridData.length !== width * height) {
    throw new Error(`Data length (${gridData?.length}) does not match dimensions (${width}x${height})`);
  }

  const headerStr = `P5\n${width} ${height}\n255\n`;
  const headerBytes = new TextEncoder().encode(headerStr);
  const totalLength = headerBytes.length + width * height;
  const buffer = new Uint8Array(totalLength);

  buffer.set(headerBytes, 0);
  let offset = headerBytes.length;

  for (let r = 0; r < height; r++) {
    // Flip Y: PGM row 0 is top of map (ROS grid row height - 1 - r)
    const gridRow = height - 1 - r;
    const rowOffset = gridRow * width;
    for (let c = 0; c < width; c++) {
      const val = gridData[rowOffset + c];
      let pixel;
      if (val === -1) {
        pixel = 205; // unknown grey
      } else if (val === 0) {
        pixel = 254; // free white
      } else if (val >= 65) {
        pixel = 0; // occupied black
      } else {
        // Linear scale between 254 and 0
        pixel = Math.round(254 - (val / 100) * 254);
      }
      buffer[offset++] = pixel;
    }
  }

  return buffer;
}

/**
 * Parses binary PGM (P5) buffer into ROS OccupancyGrid format.
 * Output: { width, height, data } where data is Int8Array (-1, 0, 100).
 */
export function parseP5Pgm(buffer, config = { negate: 0, occupied_thresh: 0.65, free_thresh: 0.25 }) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let idx = 0;

  function nextWord() {
    while (idx < bytes.length && (bytes[idx] <= 32 || bytes[idx] === 35)) {
      if (bytes[idx] === 35) {
        // Skip comment until newline
        while (idx < bytes.length && bytes[idx] !== 10 && bytes[idx] !== 13) {
          idx++;
        }
      } else {
        idx++;
      }
    }
    const start = idx;
    while (idx < bytes.length && bytes[idx] > 32 && bytes[idx] !== 35) {
      idx++;
    }
    return new TextDecoder().decode(bytes.slice(start, idx));
  }

  const magic = nextWord();
  if (magic !== 'P5') {
    throw new Error(`Unsupported PGM format: ${magic}. Only binary P5 is supported.`);
  }

  const width = Number(nextWord());
  const height = Number(nextWord());
  const maxVal = Number(nextWord());

  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0 || width * height > 16000000 || maxVal !== 255) {
    throw new Error('Invalid PGM dimensions');
  }

  // Consume the required delimiter, never skip binary pixels that look like whitespace.
  if (![9, 10, 13, 32].includes(bytes[idx])) throw new Error('Invalid PGM delimiter');
  if (bytes[idx] === 13 && bytes[idx + 1] === 10) idx++;
  idx++;

  const pixelCount = width * height;
  if (bytes.length - idx !== pixelCount) {
    throw new Error('Truncated PGM pixel buffer');
  }

  const gridData = new Int8Array(pixelCount);

  for (let r = 0; r < height; r++) {
    // Invert Y flip: PGM row 0 is top, gridRow is bottom
    const gridRow = height - 1 - r;
    const rowOffset = gridRow * width;
    for (let c = 0; c < width; c++) {
      const pixel = bytes[idx++];
      let val;
      if (pixel === 205) {
        val = -1;
      } else {
        const probability = config.negate ? pixel / 255 : (255 - pixel) / 255;
        val = probability > config.occupied_thresh ? 100 : probability < config.free_thresh ? 0 : -1;
      }
      gridData[rowOffset + c] = val;
    }
  }

  return { width, height, maxVal, data: gridData };
}

/**
 * Calculates SHA-256 hash of a Uint8Array or string.
 */
export async function computeSha256(data) {
  const bytes =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array || (ArrayBuffer.isView(data) && (data.constructor?.name === 'Uint8Array' || Object.prototype.toString.call(data) === '[object Uint8Array]'))
        ? data
        : new Uint8Array(data);

  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  throw new Error('Secure context with Web Crypto SHA-256 is required for map integrity.');
}
