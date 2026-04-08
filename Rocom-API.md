# Rocom API

本文档描述洛克王国世界（RoCom / NRC）游戏模块接口。

在调用本文件中的接口前，请先参考 [WeGame-API.md](./WeGame-API.md) 完成：

- 基础认证
- WeGame 登录或凭证导入
- `frameworkToken` 获取
- 对应作用域 API Key 创建

## 前置要求

当前洛克王国世界模块统一使用：

- `/api/v1/games/rocom/*`

以下接口统一要求：

- 先完成基础认证
- 通过 `X-Framework-Token` 指定一份已保存的 WeGame 凭证
- 如果使用 `X-API-Key`，必须使用 `scope=game:rocom`
- 当前只开放 HAR 中已验证的核心查询接口
- 成功时 `data` 中会包一层上游 WeGame 响应

通用成功响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "result": {
      "error_code": 0,
      "error_message": "WG_COMM_SUCC"
    }
  }
}
```

## RoCom / NRC 代理接口

### 角色资料

- `GET /api/v1/games/rocom/profile/role`
- `GET /api/v1/games/rocom/profile/evaluation`
- `GET /api/v1/games/rocom/profile/pet-summary`
- `GET /api/v1/games/rocom/profile/collection`
- `GET /api/v1/games/rocom/profile/battle-overview`

参数说明：
以下接口都支持可选查询参数 `account_type`。
`account_type=1` 表示 QQ，`account_type=2` 表示微信。
未传 `account_type` 时，后端会根据当前 WeGame `loginType` 自动推断。

`GET /api/v1/games/rocom/profile/role` 说明：

- 对应上游 `NrcProfile/GetRoleInfo`
- `avatar` 表示头像
- `avatar_url` 表示头像图片地址，由 API 侧按 `avatar` 从已同步到本地的 `headicon_config` 映射得出，不是上游原始字段
- `create_time` 表示创建时间，时间戳格式
- `id` 表示账号 ID
- `is_online` 表示是否在线
- `level` 表示等级
- `name` 表示游戏昵称
- `openid` 表示 OpenID
- `star` 表示魔法师星级
- `star_name` 表示魔法师星级名称，由 API 侧按 `star` 映射得出，不是上游原始字段
- `enroll_days` 表示入学天数，由 API 侧按自然日计算并包含创建当日，不是上游原始字段

`star` 与 `star_name` 对应关系：

- `0` 对应 `魔法学徒`
- `1` 对应 `见习魔法生`
- `2` 对应 `精灵研究员`
- `3` 对应 `精灵学士`
- `4` 对应 `精灵博学者`
- `5` 对应 `精灵魔法师`

`GET /api/v1/games/rocom/profile/role` 响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "result": {
      "error_code": 0,
      "error_message": "WG_COMM_SUCC"
    },
    "role": {
      "avatar": "1001009",
      "avatar_url": "https://jsonschema.qpic.cn/v1_/rb5/4c8194c8827d8b6c81de052a9409800f.png",
      "create_time": "1774482937",
      "enroll_days": 12,
      "id": "704693375",
      "is_online": 0,
      "level": 52,
      "name": "BvzRays",
      "openid": "2153985996166641979",
      "star": 4,
      "star_name": "精灵博学者"
    }
  }
}
```

`GET /api/v1/games/rocom/profile/evaluation` 说明：

- 对应上游 `NrcProfile/GetDimensionEvaluation`
- `capture` 表示捉宠
- `collection` 表示收藏
- `strength` 表示战力
- `progression` 表示推进
- `score` 表示 AI 评分

`GET /api/v1/games/rocom/profile/evaluation` 响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "capture": 77,
    "collection": 75,
    "progression": 85,
    "result": {
      "error_code": 0,
      "error_message": "WG_COMM_SUCC"
    },
    "score": "8.9",
    "strength": 75
  }
}
```

`GET /api/v1/games/rocom/profile/pet-summary` 说明：

- 对应上游 `NrcProfile/GetPetSummary`
- `best_pet_id` 为本期摘要对应的精灵 ID
- `best_pet_name` 为本期摘要对应的精灵名称
- `summary_title` 为本期精灵摘要标题
- `summary_content` 为本期精灵摘要文案
- `summary_time` 为本期摘要统计时间范围
- 当上游未返回有效 `best_pet_name` 且 `best_pet_id` 有效时，后端会从 `sprite_base_info` 表回填 `best_pet_name`
- 当 `best_pet_id` 有效时，后端会补充 `best_pet_img_url`
- `best_pet_img_url` 为 API 侧按 `best_pet_id` 拼出的精灵图片地址，不是上游原始字段

`GET /api/v1/games/rocom/profile/pet-summary` 响应示例：

响应补充：
当 `best_pet_id` 有效时，后端会补充 `best_pet_img_url` 字段，规则为
`https://game.gtimg.cn/images/rocom/rocodata/jingling/{best_pet_id}/image.png`。

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "best_pet_id": "3117",
    "best_pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3117/image.png",
    "best_pet_name": "彩蝶鲨",
    "result": {
      "error_code": 0,
      "error_message": "WG_COMM_SUCC"
    },
    "summary_content": "它站在哪里，哪里就是舞台。各种搞怪动作层出不穷，简直是队伍里的显眼包，你的快乐源泉。",
    "summary_time": "2026-03-30 - 2026-04-03",
    "summary_title": "显眼包包 快乐源泉"
  }
}
```

`GET /api/v1/games/rocom/profile/collection` 说明：

- 对应上游 `NrcProfile/GetMyCollection`
- `total_collection_count` 表示图鉴总数
- `current_collection_count` 表示当前收藏数
- `amazing_sprite_count` 表示了不起精灵数量
- `shiny_sprite_count` 表示异色精灵数量
- `colorful_sprite_count` 表示炫彩精灵数量
- `fashion_collection_count` 表示时装数量
- `item_count` 表示道具数量

`GET /api/v1/games/rocom/profile/collection` 响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "amazing_sprite_count": 48,
    "colorful_sprite_count": 10,
    "current_collection_count": 201,
    "fashion_collection_count": 4,
    "item_count": 15016,
    "result": {
      "error_code": 0,
      "error_message": "WG_COMM_SUCC"
    },
    "shiny_sprite_count": 0,
    "total_collection_count": 340
  }
}
```

`GET /api/v1/games/rocom/profile/battle-overview` 说明：

- 对应上游 `NrcBattle/GetBattleOverview`
- `tier` 表示段位 ID
- `tier_icon_url` 表示段位图标地址，由 API 侧按 `tier` 从已同步到本地的 `file_config.rank_big` 映射得出，不是上游原始字段
- `total_match` 表示对战场次
- `total_win` 表示对战胜利场次
- `win_rate` 表示胜率百分比，由 API 侧按 `total_win / total_match * 100` 计算并保留两位小数，不是上游原始字段

`GET /api/v1/games/rocom/profile/battle-overview` 响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "result": {
      "error_code": 0,
      "error_message": "WG_COMM_SUCC"
    },
    "tier": "107",
    "tier_icon_url": "https://jsonschema.qpic.cn/v1_/rb5/355c48f831d151102bc4761cffcb074b.png",
    "total_match": 194,
    "total_win": 85,
    "win_rate": 43.81
  }
}
```

### 对战记录

- `GET /api/v1/games/rocom/battle/list`

说明：
对应上游 `NrcBattle/GetBattles`。

参数说明：
`zone` 用于区分登录来源对应的战斗分区，`zone=0` 表示 QQ，`zone=1` 表示微信。
未传 `zone` 时，后端会根据当前 WeGame `loginType` 自动推断。
`after_time` 为分页游标时间，建议使用 RFC3339 格式。
未传 `after_time` 时，后端会自动使用当前 UTC 时间后再请求上游。
`page_size` 默认为 `4`。

响应补充：
后端会为每条对战记录补充 `avatar_url` 和 `enemy_avatar_url`，由 API 侧按头像 ID 从已同步到本地的 `headicon_config` 映射得出，不是上游原始字段。
后端会为每条对战记录补充 `tier_url` 和 `enemy_tier_url`，由 API 侧按段位 ID 从已同步到本地的 `file_config.rank_big` 映射得出，不是上游原始字段。
后端会保留上游原始 `pet_base_id` 和 `enemy_pet_base_id` 数组，同时追加 `pet_base_info` 和 `enemy_pet_base_info`。
`battle_time` 表示挑战时间。
`pet_base_info` 和 `enemy_pet_base_info` 中每一项都包含：
`pet_base_id` 精灵 ID。
`pet_name` 从本地 `sprite_base_info` 表映射得到的精灵名称。
`pet_img_url` 按 `https://game.gtimg.cn/images/rocom/rocodata/jingling/{pet_base_id}/image.png` 拼出的精灵图片地址。

示例：
`GET /api/v1/games/rocom/battle/list?zone=0&after_time=2026-04-08T00:47:46.498Z&page_size=4`

`GET /api/v1/games/rocom/battle/list` 响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "result": {
      "error_code": 0,
      "error_message": "WG_COMM_SUCC"
    },
    "battles": [
      {
        "roleid": "704693375",
        "nickname": "BvzRays",
        "avatar": "1001009",
        "avatar_url": "https://jsonschema.qpic.cn/v1_/rb5/4c8194c8827d8b6c81de052a9409800f.png",
        "tier": "35",
        "tier_url": "https://jsonschema.qpic.cn/v1_/rb5/ad415107f20449ed002b4b8d9a7a0f36.png",
        "pet_base_id": [
          "3011",
          "3182",
          "3210",
          "3528",
          "3332",
          "3383"
        ],
        "pet_base_info": [
          {
            "pet_base_id": "3011",
            "pet_name": "恶魔狼",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3011/image.png"
          },
          {
            "pet_base_id": "3182",
            "pet_name": "龙息帕尔",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3182/image.png"
          },
          {
            "pet_base_id": "3210",
            "pet_name": "翼龙",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3210/image.png"
          },
          {
            "pet_base_id": "3528",
            "pet_name": "熔岩布丁",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3528/image.png"
          },
          {
            "pet_base_id": "3332",
            "pet_name": "千棘盔",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3332/image.png"
          },
          {
            "pet_base_id": "3383",
            "pet_name": "利灯鱼",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3383/image.png"
          }
        ],
        "enemy_roleid": "637827243",
        "enemy_nickname": "迪克",
        "enemy_avatar": "1001009",
        "enemy_avatar_url": "https://jsonschema.qpic.cn/v1_/rb5/4c8194c8827d8b6c81de052a9409800f.png",
        "enemy_tier": "30",
        "enemy_tier_url": "https://jsonschema.qpic.cn/v1_/rb5/eeeb652a049778568bcb3b3088d06d49.png",
        "enemy_pet_base_id": [
          "3167",
          "3177",
          "3377",
          "3609",
          "3147",
          "3171"
        ],
        "enemy_pet_base_info": [
          {
            "pet_base_id": "3167",
            "pet_name": "巨噬针鼹",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3167/image.png"
          },
          {
            "pet_base_id": "3177",
            "pet_name": "咔咔鸟",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3177/image.png"
          },
          {
            "pet_base_id": "3377",
            "pet_name": "风滚暮虫",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3377/image.png"
          },
          {
            "pet_base_id": "3609",
            "pet_name": "画间沉铁兽",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3609/image.png"
          },
          {
            "pet_base_id": "3147",
            "pet_name": "幻影灵菇",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3147/image.png"
          },
          {
            "pet_base_id": "3171",
            "pet_name": "巨灵石",
            "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3171/image.png"
          }
        ],
        "battle_time": "2026-04-07T16:40:50+08:00",
        "result": 1
      }
    ],
    "finish": true
  }
}
```

### 精灵列表

- `GET /api/v1/games/rocom/battle/pets`

说明：
虽然路径是 `/api/v1/games/rocom/battle/pets`，但该接口实际用于查询精灵列表，对应上游 `NrcBattle/GetMyPets`。

参数说明：
`zone` 用于区分登录来源对应的战斗分区，`zone=0` 表示 QQ，`zone=1` 表示微信。
未传 `zone` 时，后端会根据当前 WeGame `loginType` 自动推断。
`pet_subset=0` 全部精灵列表。
`pet_subset=1` 了不起精灵列表。
`pet_subset=2` 异色精灵列表。
`pet_subset=3` 炫彩精灵列表。
`pet_type` 用于按属性筛选，默认 `0` 表示不过滤。
`page_no` 默认为 `1`。
`page_size` 默认为 `10`。

响应补充：
后端会为每个精灵项补充 `pet_img_url` 字段，规则为
`https://game.gtimg.cn/images/rocom/rocodata/jingling/{pet_base_id}/image.png`。
后端会移除上游原始 `pet_types` 字段，并追加 `pet_types_info` 字段。
`pet_types_info` 中每一项都来自已同步到本地的 `file_config.department`，格式为 `id`、`name`、`icon`。

示例：
`GET /api/v1/games/rocom/battle/pets?zone=1&pet_subset=0&page_no=1&page_size=10`
`GET /api/v1/games/rocom/battle/pets?zone=1&pet_subset=1&page_no=1&page_size=10`
`GET /api/v1/games/rocom/battle/pets?zone=1&pet_subset=2&page_no=1&page_size=10`
`GET /api/v1/games/rocom/battle/pets?zone=1&pet_subset=3&page_no=1&page_size=10`

`GET /api/v1/games/rocom/battle/pets` 响应示例：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "average_pet_level": 28,
    "dazzling_pet_count": 4,
    "great_pet_count": 54,
    "pets": [
      {
        "pet_base_id": "3350",
        "pet_img_url": "https://game.gtimg.cn/images/rocom/rocodata/jingling/3350/image.png",
        "pet_level": 60,
        "pet_mutation": 0,
        "pet_name": "红绒十字&红绒十字",
        "pet_talent_level": 4,
        "pet_types_info": [
          {
            "id": 4,
            "name": "火系",
            "icon": "https://jsonschema.qpic.cn/v1_/rb5/882d0b03e083b37978da7359fb1da277.png"
          },
          {
            "id": 16,
            "name": "",
            "icon": ""
          }
        ]
      }
    ],
    "result": {
      "error_code": 0,
      "error_message": "WG_COMM_SUCC"
    },
    "shiny_pet_count": 0,
    "total": 167,
    "weekly_pet": "3005",
    "weekly_pet_update_time": "0"
  }
}
```

### 手动同步本地配置

- `POST /api/v1/games/rocom/config/sync`

说明：

- 该接口用于手动触发一次 RoCom 配置同步任务
- 需要 `Authorization: Bearer <web-jwt>`
- 调用者必须是后端管理员角色，普通 Web 用户无权调用
- 会拉取并覆盖写入 RoCom 本地配置表
- 当前同步资源包括：
  - `file_config`
  - `LineupData`
  - `headicon_config`
  - `videoList`
  - `config_info`
  - `base_info.json`
  - `skill.json`

响应示例：

```json
{
  "code": 0,
  "message": "RoCom 配置同步完成",
  "data": {
    "schema": "game_rocom",
    "synced_at": "2026-04-07T20:30:00+08:00",
    "resources": [
      "file_config",
      "LineupData",
      "headicon_config",
      "videoList",
      "config_info",
      "base_info.json",
      "skill.json"
    ],
    "triggered_by": "web_jwt"
  }
}
```
