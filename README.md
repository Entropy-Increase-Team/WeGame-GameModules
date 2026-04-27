# rocom

`rocom` 是 `WeGame-plugin` 的洛克王国世界模块。

它不是独立运行插件，而是挂载在 `WeGame-plugin` 核心层之上的游戏模块，负责提供：

- 洛克档案查询
- 精灵列表查询
- 阵容助手 / 阵容详情
- 交换大厅
- 查蛋 / 配种
- 远行商人订阅
- 模块帮助命令

## 对应仓库

本模块对应的上游仓库为：

- `https://github.com/Entropy-Increase-Team/WeGame-GameModules`

分支约定：

- 总仓库默认分支：`main`
- 当前模块分支：`rocom`
- 模块名与分支名保持一致

也就是说，这个目录：

- `plugins/WeGame-plugin/modules/rocom`

对应仓库中的：

- `rocom` 分支

## 依赖关系

使用本模块前，需要先安装并配置：

- `WeGame-plugin`

本模块依赖 WeGame 核心层提供：

- WeGame 登录能力
- 账号绑定管理
- `frameworkToken` 获取
- 模块自动发现与加载

## WeGame 命令关系

安装本模块后，WeGame 登录能力会挂到当前模块前缀下：

- `+wx登陆`
- `+qq登陆`

为了避免和游戏自己的命令冲突，WeGame 绑定账号管理在模块内使用 `wg` 命名空间：

- `+wg账号列表`
- `+wg切换账号 1`
- `+wg删除账号 1`

其中 `+账号列表` 仍表示洛克王国世界可识别的角色账号列表。
如果未安装任何游戏模块，才使用核心兜底帮助 `=帮助` 查看 WeGame 核心命令。

## 当前命令

当前模块支持：

- `+帮助`
- `+wx登陆`
- `+qq登陆`
- `+wg账号列表`
- `+wg切换账号 1`
- `+wg删除账号 1`
- `+账号列表`
- `+档案`
- `+uid`
- `+uid 437023912`
- `+战绩`
- `+精灵列表`
- `+阵容 闪耀大赛 1`
- `+查看阵容 59`
- `+交换大厅 1`
- `+尺寸查询 0.45 35.6`
- `+远行商人`
- `+订阅远行商人 1 国王球 棱镜球`
- `+取消订阅远行商人`
- `+查蛋 喵喵`
- `+配种 火花 喵喵`

同时兼容：

- `#洛克`
- `#洛克世界`
- `#洛克王国世界`

## 配置文件

模块默认配置：

- `defSet/config_default.yaml`

模块默认帮助：

- `defSet/rocom_help_default.yaml`

用户实际配置：

- `plugins/WeGame-plugin/config/config/games/rocom.yaml`

说明：

- `rocom.yaml` 现在只保留模块业务配置，例如分页大小
- 远行商人订阅默认监听项与轮询 cron 也在这里配置
- 远行商人订阅运行数据保存在 `data/wegame-plugin/rocom_merchant_subscriptions.json`
- 实际接口认证统一使用核心层的 `wegame.api_key`
- 如果要调用需要授权的 RoCom 接口，这把 Key 还需要获批 `game:rocom` 下的 `rocom.access`

## 目录结构

```text
rocom/
├─ apps/                  # 模块命令
├─ defSet/                # 默认配置 / 默认帮助
├─ model/                 # 模块请求层
├─ resources/             # 模块渲染资源
├─ utils/                 # 模块工具
├─ module.json            # 模块元数据
├─ Rocom-API.md           # 模块 API 文档
└─ README.md              # 当前说明
```

## 手动拉取

如果你要手动拉取本模块到：

- `plugins/WeGame-plugin/modules/rocom`

```bash
git clone -b rocom --single-branch https://github.com/Entropy-Increase-Team/WeGame-GameModules.git plugins/WeGame-plugin/modules/rocom
```
