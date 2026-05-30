/**
 * RoCom 模块公共工具函数
 *
 * 从各文件中提取的重复工具函数，统一维护。
 */

export function trimText (value = '') {
  return String(value || '').trim()
}

export function toNumber (value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

export function encodeAssetPath (assetPath = '') {
  return String(assetPath || '')
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/')
}

export function normalizeUrl (value = '') {
  const text = trimText(value)
  if (!text) return ''
  if (text.includes('{{_res_path}}')) return ''
  if (/^data:image\//.test(text)) return text
  if (text.startsWith('//')) return `https:${text}`
  if (/^https?:\/\//.test(text)) return text
  return ''
}

export function toDisplayText (value, fallback = '--') {
  if (value === undefined || value === null || value === '') return fallback
  return String(value)
}

export function resolveAccountType (loginType = '') {
  const normalized = trimText(loginType).toLowerCase()
  if (normalized === 'qq') return 1
  if (normalized === 'wechat') return 2
  return undefined
}

export function resolveZone (loginType = '') {
  const normalized = trimText(loginType).toLowerCase()
  if (normalized === 'qq') return 0
  if (normalized === 'wechat') return 1
  return undefined
}

export function formatWinRate (value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '--'
  return `${num.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}%`
}

export function normalizeBattleResult (value) {
  const text = String(value ?? '').trim().toLowerCase()
  if (Number(value) === 0) return 'win'
  if (Number(value) === 1) return 'fail'
  if (['win', 'success', 'true'].includes(text)) return 'win'
  return 'fail'
}

export function normalizeBattlePets (petInfoList = [], petIdList = []) {
  if (Array.isArray(petInfoList) && petInfoList.length > 0) {
    return petInfoList.slice(0, 6).map((item, index) => ({
      name: toDisplayText(item?.pet_name, `精灵 ${index + 1}`),
      icon: normalizeUrl(item?.pet_img_url)
    }))
  }

  if (Array.isArray(petIdList) && petIdList.length > 0) {
    return petIdList.slice(0, 6).map((_, index) => ({
      name: `精灵 ${index + 1}`,
      icon: ''
    }))
  }

  return []
}

export function pickPrimaryAccount (accounts = []) {
  return accounts.find((item) => item?.binding?.is_primary === true || item?.binding?.isPrimary === true) ||
    accounts[0] ||
    null
}

export function extractUidFromAccount (account = {}) {
  return trimText(
    account?.role?.id ||
    account?.role_id ||
    account?.binding?.role_id ||
    account?.binding?.roleId
  )
}
