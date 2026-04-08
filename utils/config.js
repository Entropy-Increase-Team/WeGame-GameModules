import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import Config from '../../../utils/config.js'
import { pluginRoot } from '../../../model/path.js'

const GAME_CODE = 'rocom'
const moduleRoot = path.join(pluginRoot, 'modules', GAME_CODE)
const defaultConfigPath = path.join(moduleRoot, 'defSet', 'config_default.yaml')

function deepMerge (base, override) {
  if (override == null || typeof override !== 'object') return base ?? override
  if (Array.isArray(override)) return override

  const result = {
    ...(base && typeof base === 'object' && !Array.isArray(base) ? base : {})
  }

  for (const key of Object.keys(override)) {
    const value = override[key]
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = deepMerge(result[key], value)
    } else {
      result[key] = value
    }
  }

  return result
}

function loadYaml (filePath) {
  try {
    if (!fs.existsSync(filePath)) return {}
    return YAML.parse(fs.readFileSync(filePath, 'utf8')) || {}
  } catch (error) {
    logger.error(`[WeGame-plugin][${GAME_CODE}] 读取模块默认配置失败`, error)
    return {}
  }
}

class RocomConfig {
  constructor () {
    this.ensureConfigFile()
  }

  ensureConfigFile () {
    const configPath = Config.getGameConfigPath(GAME_CODE)
    if (fs.existsSync(configPath)) return

    const defaultConfig = loadYaml(defaultConfigPath)
    if (!Object.keys(defaultConfig).length) return

    Config.setGameConfig(GAME_CODE, defaultConfig)
  }

  getConfig () {
    this.ensureConfigFile()
    const defaults = loadYaml(defaultConfigPath)
    const userConfig = Config.getGameConfig(GAME_CODE)
    return deepMerge(defaults, userConfig)
  }

  get (group, key) {
    const config = this.getConfig()
    return config?.[group]?.[key]
  }
}

export default new RocomConfig()
