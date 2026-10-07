/**
 * 图片尺寸与「不透明内容框」测量。
 *
 * 远行商人卡片的图标来自两个上游（mmbiz 图文图 / cloudstatic 游戏资源），
 * 画布大小、四周留白、内容长宽比都不一致：
 * 直接 `object-fit: contain` 是按**整张画布**贴边的，所以同一张卡片里
 * 圆球能占满、细长的果实只剩一半宽、留白多的晶体更是明显偏小。
 *
 * 这里只做两件不含业务的事：
 *   1. 读原图尺寸；
 *   2. 量出不透明内容的包围盒（用于裁掉留白）。
 *
 * 格式支持：
 *   - PNG：8bit、非隔行的灰度+alpha / RGBA 可以精确量出留白；
 *     其它变体（调色板、16bit、隔行）只读尺寸，留白按整张算。
 *   - WebP：只读画布尺寸（VP8X / VP8L / VP8 三种头都支持），留白按整张算。
 *   - 其它格式：返回 null，调用方按原样渲染。
 */

import zlib from 'node:zlib'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** PNG 颜色类型 → 每像素通道数 */
const PNG_CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
/** 带独立 alpha 通道的颜色类型 → alpha 在像素里的下标 */
const PNG_ALPHA_INDEX = { 4: 1, 6: 3 }

function paeth (a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/** 按 PNG 的 5 种行过滤器还原一行原始像素 */
function unfilterScanline (src, dest, prev, filter, bpp) {
  const length = src.length

  if (filter === 0) {
    src.copy(dest, 0, 0, length)
    return true
  }

  if (filter === 1) {
    for (let i = 0; i < length; i += 1) {
      dest[i] = (src[i] + (i >= bpp ? dest[i - bpp] : 0)) & 0xff
    }
    return true
  }

  if (filter === 2) {
    for (let i = 0; i < length; i += 1) {
      dest[i] = (src[i] + prev[i]) & 0xff
    }
    return true
  }

  if (filter === 3) {
    for (let i = 0; i < length; i += 1) {
      const left = i >= bpp ? dest[i - bpp] : 0
      dest[i] = (src[i] + ((left + prev[i]) >> 1)) & 0xff
    }
    return true
  }

  if (filter === 4) {
    for (let i = 0; i < length; i += 1) {
      const left = i >= bpp ? dest[i - bpp] : 0
      const up = prev[i]
      const upLeft = i >= bpp ? prev[i - bpp] : 0
      dest[i] = (src[i] + paeth(left, up, upLeft)) & 0xff
    }
    return true
  }

  return false
}

/** 读 PNG 的 IHDR */
function readPngHeader (buffer) {
  if (buffer.length < 33) return null
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null

  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  if (width <= 0 || height <= 0) return null

  return {
    width,
    height,
    bitDepth: buffer[24],
    colorType: buffer[25],
    interlace: buffer[28]
  }
}

/**
 * 量 PNG 的不透明内容框。
 * 只处理 8bit 非隔行、且带独立 alpha 通道的 PNG；其余返回 null（表示「整张都算内容」）。
 */
function readPngContentBox (buffer, header) {
  const alphaIndex = PNG_ALPHA_INDEX[header.colorType]
  if (alphaIndex === undefined) return null
  if (header.bitDepth !== 8 || header.interlace !== 0) return null

  const channels = PNG_CHANNELS[header.colorType]
  const stride = header.width * channels
  if (stride <= 0) return null

  const idatParts = []
  let offset = 8
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const dataStart = offset + 8
    if (dataStart + length > buffer.length) break
    if (type === 'IDAT') idatParts.push(buffer.subarray(dataStart, dataStart + length))
    if (type === 'IEND') break
    offset = dataStart + length + 4
  }
  if (idatParts.length === 0) return null

  let raw
  try {
    raw = zlib.inflateSync(Buffer.concat(idatParts))
  } catch {
    return null
  }

  let current = Buffer.alloc(stride)
  let previous = Buffer.alloc(stride)
  let cursor = 0
  let minX = header.width
  let minY = header.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < header.height; y += 1) {
    if (cursor + 1 + stride > raw.length) return null
    const filter = raw[cursor]
    cursor += 1
    const line = raw.subarray(cursor, cursor + stride)
    cursor += stride

    if (!unfilterScanline(line, current, previous, filter, channels)) return null

    for (let x = 0; x < header.width; x += 1) {
      if (current[(x * channels) + alphaIndex] === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }

    const swap = previous
    previous = current
    current = swap
  }

  if (maxX < 0) return null

  return {
    x: minX,
    y: minY,
    width: (maxX - minX) + 1,
    height: (maxY - minY) + 1
  }
}

/** 读 WebP 画布尺寸（VP8X / VP8L / VP8） */
function readWebpSize (buffer) {
  if (buffer.length < 30) return null
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') return null
  if (buffer.toString('ascii', 8, 12) !== 'WEBP') return null

  const chunk = buffer.toString('ascii', 12, 16)

  if (chunk === 'VP8X') {
    const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16))
    const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16))
    return { width, height }
  }

  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21)
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1
    }
  }

  if (chunk === 'VP8 ') {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff
    }
  }

  return null
}

/**
 * 读一张图的尺寸与内容框。
 *
 * @returns {{ width:number, height:number, content:{x:number,y:number,width:number,height:number} }|null}
 *   无法识别时返回 null。
 */
export function readImageMetrics (buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) return null

  if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    const header = readPngHeader(buffer)
    if (!header) return null
    return {
      width: header.width,
      height: header.height,
      content: readPngContentBox(buffer, header) || {
        x: 0,
        y: 0,
        width: header.width,
        height: header.height
      }
    }
  }

  const webp = readWebpSize(buffer)
  if (webp) {
    return {
      width: webp.width,
      height: webp.height,
      content: { x: 0, y: 0, width: webp.width, height: webp.height }
    }
  }

  return null
}

function round4 (value) {
  return Math.round(value * 10000) / 10000
}

/**
 * 把「等面积归一」算成 CSS transform 参数。
 *
 * 卡片里 `.goods-img` 是 `width:100%; height:100%; object-fit: contain`，
 * 也就是按**整张画布**贴边居中。这里在它之上再叠一层以框中心为原点的
 * `translate(...) scale(...)`：
 *
 *   - `scale`：把「不透明内容」缩放到 targetArea 对应的面积；
 *     上限是内容不溢出图标框，所以特别细长的商品会自动少一点面积。
 *   - `offsetX/Y`：content 在画布里不一定居中，缩放后要把它挪回框中心。
 *     transform 的 translate 写在 scale 前面，按矩阵乘法是「先缩放后平移」，
 *     所以这里的位移不会被 scale 再放大一次。
 *
 * @returns {{scale:number, offsetX:number, offsetY:number}|null} 无法计算时返回 null。
 */
export function buildIconFit (metrics, options = {}) {
  const boxWidth = Number(options.boxWidth) || 0
  const boxHeight = Number(options.boxHeight) || 0
  const targetArea = Number(options.targetArea) || 0
  if (boxWidth <= 0 || boxHeight <= 0 || targetArea <= 0) return null

  const width = Number(metrics?.width) || 0
  const height = Number(metrics?.height) || 0
  const content = metrics?.content
  const contentWidth = Number(content?.width) || 0
  const contentHeight = Number(content?.height) || 0
  if (width <= 0 || height <= 0 || contentWidth <= 0 || contentHeight <= 0) return null

  const containScale = Math.min(boxWidth / width, boxHeight / height)
  if (!Number.isFinite(containScale) || containScale <= 0) return null

  const contentScale = Math.min(
    Math.sqrt(targetArea / (contentWidth * contentHeight)),
    boxWidth / contentWidth,
    boxHeight / contentHeight
  )
  if (!Number.isFinite(contentScale) || contentScale <= 0) return null

  const contentCenterX = (Number(content?.x) || 0) + (contentWidth / 2)
  const contentCenterY = (Number(content?.y) || 0) + (contentHeight / 2)
  const scale = contentScale / containScale

  return {
    scale: round4(scale),
    offsetX: round4(-contentScale * (contentCenterX - (width / 2))),
    offsetY: round4(-contentScale * (contentCenterY - (height / 2)))
  }
}
