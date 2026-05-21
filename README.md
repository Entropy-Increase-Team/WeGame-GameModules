# rocom

`rocom` 是 `WeGame-plugin` 的洛克王国世界（RoCom / NRC）游戏模块，当前模块版本见
[`module.json`](./module.json)。

它不是独立运行插件，而是挂载在 `WeGame-plugin` 核心层之上的游戏模块，负责提供洛克王国世界相关的账号、档案、家园、战绩、阵容、交换大厅、查蛋配种与远行商人能力。

## 能力概览

- WeGame 微信 / QQ 登录入口与洛克角色账号列表
- 洛克档案卡：角色资料、AI 点评、评分雷达、收藏统计、最近战绩
- UID 玩家搜索与家园信息查询
- 闪耀大赛战绩分页查询
- 精灵列表：全部、了不起、异色、炫彩
- 阵容助手列表与阵容详情
- 交换大厅海报列表与强制刷新
- 精灵尺寸反查、查蛋、配种
- 远行商人信息查询与群订阅提醒
- 模块帮助菜单与渲染卡片资源

## 对应仓库

本模块对应的上游仓库为：

- `https://github.com/Entropy-Increase-Team/WeGame-GameModules`

分支约定：

- 总仓库默认分支：`main`
- 当前模块分支：`rocom`
- 模块名与分支名保持一致

安装后模块目录通常是：

- `plugins/WeGame-plugin/modules/rocom`

对应仓库中的：

- `rocom` 分支

## 依赖关系

使用本模块前，需要先安装并配置 [`WeGame-plugin`](https://github.com/Entropy-Increase-Team/WeGame-plugin)。

本模块依赖 WeGame 核心层提供：

- 模块自动发现与加载
- WeGame 登录能力
- 账号绑定管理
- `frameworkToken` 获取

部分命令还依赖外置服务：

- `+uid`、`+家园` 使用 `/api/v1/games/rocom/ingame/*`
- `+尺寸查询` 使用精灵尺寸外置查询服务
- `+远行商人` 与订阅检查使用远行商人外置数据源

详细接口、认证和权限说明见 [`Rocom-API.md`](./Rocom-API.md)。

## 命令前缀

模块支持以下前缀：

- `+`
- `#洛克王国世界`
- `#洛克世界`
- `#洛克`

README 中统一使用 `+` 举例。其他前缀等价，例如 `#洛克 档案` 和 `+档案` 对应同一命令。

## 命令列表

### 登录与账号

| 命令 | 说明 |
| --- | --- |
| `+wx登陆` | 使用微信扫码登录 WeGame |
| `+qq登陆` | 使用 QQ 扫码登录 WeGame |
| `+wg账号列表` | 查看当前已绑定的 WeGame 账号 |
| `+wg切换账号 1` | 切换默认 WeGame 账号 |
| `+wg删除账号 1` | 删除指定 WeGame 绑定 |
| `+账号列表` | 查询当前可识别的洛克王国世界角色账号 |

为了避免和游戏模块命令冲突，WeGame 绑定账号管理使用 `wg` 命名空间。

### 档案与玩家

| 命令 | 说明 |
| --- | --- |
| `+帮助` / `+help` / `+菜单` | 查看模块帮助 |
| `+档案` | 生成洛克档案卡 |
| `+uid` | 搜索当前绑定角色 UID |
| `+uid 437023912` | 搜索指定 UID |

### 家园

| 命令 | 说明 |
| --- | --- |
| `+家园` | 查询当前绑定角色家园信息 |
| `+家园 437023912` | 查询指定 UID 的家园信息 |
| `+刷新家园 437023912` | 强制刷新指定 UID 的家园信息 |
| `+home 437023912` | `+家园` 的英文别名 |
| `+rehome 437023912` | `+刷新家园` 的英文别名 |

家园查询可能进入 gateway 队列，模块会等待任务完成并返回渲染卡片。

### 战绩与精灵

| 命令 | 说明 |
| --- | --- |
| `+战绩` | 查询闪耀大赛战绩第一页 |
| `+战绩 2` | 查询闪耀大赛战绩第 2 页 |
| `+大赛战绩 2` | `+战绩 2` 的别名 |
| `+精灵列表` | 查询全部精灵第一页 |
| `+精灵列表 2` | 查询全部精灵第 2 页 |
| `+精灵列表 了不起 2` | 查询了不起精灵第 2 页 |
| `+精灵列表 异色 1` | 查询异色精灵第 1 页 |
| `+精灵列表 炫彩 1` | 查询炫彩精灵第 1 页 |

精灵列表每页数量和最大页码由 `rocom.page_size`、`rocom.max_page` 控制。

### 阵容与交换大厅

| 命令 | 说明 |
| --- | --- |
| `+阵容` | 查询阵容助手默认分类第一页 |
| `+阵容 闪耀大赛 1` | 查询指定分类和页码 |
| `+查看阵容 59` | 查看指定阵容详情 |
| `+阵容详情 59` | `+查看阵容 59` 的别名 |
| `+交换大厅` | 查询交换大厅第一页 |
| `+交换大厅 2` | 查询交换大厅第 2 页 |
| `+交换大厅 1 刷新` | 强制刷新交换大厅第 1 页 |
| `+大厅 2` | `+交换大厅 2` 的别名 |

### 工具、查蛋与远行商人

| 命令 | 说明 |
| --- | --- |
| `+尺寸查询 0.45 35.6` | 按直径米与体重千克反查精灵候选 |
| `+精灵尺寸 0.45 35.6` | `+尺寸查询` 的别名 |
| `+查蛋 喵喵` | 查询精灵蛋组和可配种精灵 |
| `+精灵查蛋 喵喵` | `+查蛋` 的别名 |
| `+查蛋 0.29 3.294` | 按直径和体重反查精灵 |
| `+查蛋 直径0.29 体重3.294` | 带字段名的尺寸反查写法 |
| `+配种 喵喵` | 查看想要该精灵时的父体候选 |
| `+配种 火花 喵喵` | 判断两只精灵是否可以配种 |
| `+远行商人` | 查询远行商人活动信息 |
| `+旅行商人` / `+商人信息` | `+远行商人` 的别名 |
| `+订阅远行商人` | 群内订阅默认商品提醒 |
| `+订阅远行商人 1 国王球 棱镜球` | 群内订阅指定商品，`1` 表示命中后尝试 @全体 |
| `+取消订阅远行商人` | 取消本群远行商人订阅 |

远行商人订阅命令仅支持群聊，并需要管理员权限。

## 配置文件

模块默认配置：

- `defSet/config_default.yaml`

模块默认帮助：

- `defSet/rocom_help_default.yaml`

用户实际配置：

- `plugins/WeGame-plugin/config/config/games/rocom.yaml`

当前配置项：

| 配置 | 说明 |
| --- | --- |
| `rocom.page_size` | 精灵列表每页数量 |
| `rocom.max_page` | 精灵列表允许查询的最大页码 |
| `lineup.detail_search_pages` | 查看阵容详情时最多翻找的页数 |
| `merchant.subscription_cron` | 远行商人订阅检查 cron |
| `merchant.subscription_default_items` | 群订阅默认监听的商品 |

远行商人订阅运行数据保存在：

- `data/wegame-plugin/rocom_merchant_subscriptions.json`

## 认证与权限

实际接口认证统一使用核心层的 `wegame.api_key`、匿名令牌或 Web 登录态，具体取决于接口类型。

调用需要授权的 RoCom 游戏数据接口时，需要：

- 已保存的 WeGame 凭证与可用 `frameworkToken`
- 开发者 API Key 已获批 `game:rocom` 下的 `rocom.access`
- 若凭证绑定了第三方用户作用域，请继续携带同一个 `user_identifier`

更完整的请求头、参数和响应结构请以 [`Rocom-API.md`](./Rocom-API.md) 为准。

## 目录结构

```text
rocom/
├─ apps/                  # 模块命令入口
├─ defSet/                # 默认配置 / 默认帮助
├─ model/                 # RoCom 请求层与业务服务
├─ resources/             # 渲染模板、图片、字体与静态数据
├─ utils/                 # 命令前缀、配置、图鉴与映射工具
├─ module.json            # 模块元数据
├─ Rocom-API.md           # 模块 API 文档
└─ README.md              # 当前说明
```

## 安装或更新

推荐通过 `WeGame-plugin` 核心命令安装：

```text
#wg模块下载 rocom
```

更新已安装模块：

```text
#wg更新 rocom
```

如果需要手动拉取本模块到 `plugins/WeGame-plugin/modules/rocom`：

```bash
git clone -b rocom --single-branch https://github.com/Entropy-Increase-Team/WeGame-GameModules.git plugins/WeGame-plugin/modules/rocom
```

如果目录已经存在并且是模块 Git 仓库：

```bash
cd plugins/WeGame-plugin/modules/rocom
git pull
```
