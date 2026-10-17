# 3D 卡通形象 · 制作 brief

> 照片存放：`photos/`（已在 `.gitignore` 中，**不会入库、不会部署**。做完可自行删除）

## 一、照片评估结论：够用，不用再拍

常见的误解是"需要一张真人 A 字站姿全身照"。**不需要**——那张图正是第一步要生成出来的产物。
图生 3D 真正需要的输入是"一张清晰正脸"，而你有两张证件照级别的。

文件名形如 `微信图片_20261016144825_40_2.jpg`，下表用结尾编号 `_40_2` 指代。

| 用途 | 文件 | 说明 |
|---|---|---|
| **脸模首选** | `_40_2`（…144825_40_2） | 白底、正面、光线均匀、不戴眼镜、3006×3007 |
| **脸模次选** | `_27_2`（…144723_27_2） | 白底、正面、不戴眼镜、发型偏短、3500×3500 |
| **身形比例** | `_42_2`（…145147_42_2） | 唯一一张正面全身站姿（仓库），可参考头身比 |
| 五官补充 | `_32_` `_34_` `_36_` `_37_` `_39_` `_43_` | 半身近景，表情自然 |
| 后脑发型 | `_28_2` | 背面，能看到后脑轮廓 |
| 未采用 | `_41_2` | 卫生间镜面自拍，手机遮脸、背景杂乱 |

## 二、已定的方案（2026-10-15 本人确认）

1. **眼镜**：**两版都做**，生成后对比
   - A 版：不戴眼镜
   - B 版：戴**只有镜框、没有镜片**的眼镜
2. **发型**：以 `_40_2` 为准（中分稍长）
3. **服装**：素色 T 恤，无图案、无文字、无商标

## 三、第一步提示词（可直接复制）

参考图用 `_40_2`。每版建议一次生成 4 张挑一张。

### A 版 · 不戴眼镜

**中文**
```
把参考照片里的人做成 3D 卡通角色设定图。
风格：皮克斯 / 黏土动画，圆润干净，面部特征可辨认，像本人。
姿态：正面站立面向镜头，双臂自然微微张开成 A 字（不要贴身，也不要举起来），
      双脚并拢，表情平静友好地微笑。
服装：素色纯色 T 恤，无图案、无文字、无 logo。
发型：参考照片中的中分短发。
背景：纯白色，干净，无阴影、无地面、无道具。
不要：眼镜、手持物品、背包、帽子、首饰。
方形构图 1:1，人物居中，全身完整入镜，弱透视（接近正交），不要广角变形。
```

**English**
```
Turn the person in the reference photo into a 3D cartoon character reference sheet.
Style: Pixar / claymation — rounded, clean, clearly recognizable as this person.
Pose: standing, facing the camera directly, arms slightly away from the body in an A-pose
      (not glued to the sides, not raised), feet together, calm friendly smile.
Clothing: plain solid-color t-shirt, no patterns, no text, no logos.
Hair: the center-parted short hair from the reference photo.
Background: pure white, clean, no shadow, no floor, no props.
Do NOT include: glasses, handheld objects, backpacks, hats, jewelry.
Square 1:1 framing, character centered, full body in frame,
near-orthographic (minimal perspective distortion), no wide-angle warping.
```

### B 版 · 戴镜框（无镜片）

与 A 版完全相同，只把"不要眼镜"换成下面这段：

**中文**
```
眼镜：戴一副黑色粗框眼镜，只要镜框，完全不要镜片
      （镜片区域必须完全透明、不存在），
      镜框不能遮挡或变形眼睛，线条干净、不反光。
```

**English**
```
Glasses: black thick-rimmed glasses, FRAME ONLY — no lenses at all
         (the lens area must be fully transparent / nonexistent).
         The frame must not cover or distort the eyes, clean lines, no reflections.
```

**为什么"只要镜框"**：低模 3D 里透明镜片很容易变成一块发白的板子或产生怪反射，反而把眼睛挡住。
只留镜框，既有辨识度又不遮眼睛。

**为什么卡这么多细节**：图生 3D 最吃"轮廓干净 + 正面 + 弱透视"。
手臂贴身会导致腋下和身体粘连成一坨；强透视会让比例失真；背景有杂物会被一起建模进去。

## 四、本机网络实测（2026-10-15）

**直连**：OpenAI、Gemini、Meshy、Tripo、github.com 全部**不可达**；
腾讯云（`ai3d`、`hunyuan`）、阿里云百炼、火山引擎、npm **可达**。

**走本机代理** `http://127.0.0.1:7892`：OpenAI、Meshy、Tripo、GitHub **全部可达**。

两条路都通，所以两套方案都能用：

| 方案 | 第一步 照片→卡通 | 第二步 卡通→3D | 成本 |
|---|---|---|---|
| **国内**（无需代理） | 腾讯云混元生图 | 腾讯云 `ai3d` 混元生3D | 开通送 100 积分，之后约 0.1 元/积分 |
| **海外**（走代理） | OpenAI `gpt-image-1` / Gemini 图像 | Meshy 或 Tripo | Meshy 免费 100 credits/月（CC BY 4.0 需署名）；约 $20/月 |

## 五、执行步骤

| 步骤 | 谁做 |
|---|---|
| 1. 照片 → 卡通二维图（A/B 两版，各若干张） | **我**（脚本） |
| 2. 卡通图 → 3D GLB | **我**（脚本） |
| 3. 压缩到 ≤ 5 MB（gltf-transform） | **我** |
| 4. 接进网站、调取景、出对比截图 | **我** |

**绑骨第一版不需要**：网站上的"转头看鼠标 / 滚动转身"是整个模型在旋转（见 `Rig` 组件），
不是骨骼动画。静态 GLB 就够用。想要挥手动作时再说。

### 腾讯混元生3D 关键参数（已查文档）
- 接口 `SubmitHunyuanTo3DProJob`，Version `2025-05-13`，必须带 `Region`
- 输入 `ImageBase64`（≤6 MB，单边 128–5000 px）或 `ImageUrl`（≤8 MB）
- 输出默认同时返回 **obj + glb**
- `GenerateType=LowPoly` → 智能拓扑，适合网页（此时 `FaceCount` 不生效）
- `EnablePBR=true` → 生成 PBR 材质
- 支持 `MultiViewImages`（正/左/右/后/左前45°/右前45°），多视角能明显提升还原度
- 另有独立计费接口「3D 人物生成」「智能拓扑」「纹理生成」「文生动作」

### 腾讯云计费
- 首次开通在控制台**手动领取 100 免费积分**（1 年有效）——不领会直接报错
- 之后约 **0.1 元/积分**（1000 积分 = 100 元）
- 免费额度耗尽后**不会自动转后付费**，需手动开通，不会意外扣费

## 六、当前阻塞：需要可用的密钥

本人 2026-10-15 给了一个 `sk-` 开头的 key，实测在以下服务上**全部返回 401**：

| 服务 | 结果 |
|---|---|
| api.openai.com/v1/models | 401（响应体为空） |
| api.deepseek.com/models | 401 |
| api.moonshot.cn/v1/models | 401 |
| api.siliconflow.cn/v1/models | 401 |
| api.meshy.ai/openapi/v1/balance | 401 |

**推测是中转站 / 聚合服务的 key**，这类 key 必须配它自己的 Base URL 才能用。
需要本人提供：服务名称 + 接口地址（形如 `https://xxx.com/v1`）。

还缺的凭据（任选一条路走完即可）：

| 路线 | 需要的凭据 | 状态 |
|---|---|---|
| 海外（走代理） | OpenAI / Gemini / 中转站 key（生图） | ⏳ 待确认 Base URL |
| 海外（走代理） | Meshy 或 Tripo key（生 3D） | ⏳ 未提供 |
| 国内（直连） | 腾讯云 SecretId + SecretKey | ⏳ 未提供 |

密钥只放本地 `.env`（已在 `.gitignore`），不提交、不打印。

## 七、其他注意
- **隐私**：上传照片前看清服务条款。`_40_2` 是证件照，若在意可改用 `_27_2`
- **不要**本地部署 Hunyuan3D（需 10–32 GB 显存；社区许可证排除欧盟/英国/韩国）。
  走腾讯云托管 API 是另一回事——受腾讯云服务条款约束，公开前建议看一眼条款
- 贴进对话的 key 已经留在聊天记录里，**以后充了钱记得轮换**

---

## 八、实测进展（2026-10-15，密钥打通）

### 密钥可用的接入点（同一个 sk- key，两种写法都行：裸放或加 Bearer）

| 服务 | Base URL | 鉴权 | 状态 |
|---|---|---|---|
| 混元生3D | `https://api.ai3d.cloud.tencent.com/v1/ai3d` | `Authorization: sk-...` | ✅ 已跑通 |
| 混元生图 | `https://api.cloudai.tencent.com/v1/aiart` | `Authorization: sk-...` | ⚠️ 认证通过，但**服务未开通** |

**教训**：官方文档写的 `base_url` 不是 `api.hunyuan.cloud.tencent.com`。生3D 用 `api.ai3d.cloud.tencent.com`，
生图用 `api.cloudai.tencent.com`。拿错域名会得到误导性的 401。

### 提交接口的请求体（实测定下来的）

生3D `POST /v1/ai3d/submit`：
- 图片字段是**扁平字符串** `ImageBase64`，接受 `data:image/jpeg;base64,...` 或裸 base64
- ❌ 嵌套写法 `{"ImageUrl":{"Url":...}}` → HTTP 400 Invalid param
- ❌ `ImageUrl` 只认**真实公网 URL**，传 data URI 会报 `InvalidParameterValue.UrlIllegal`
- 查询：`POST /v1/ai3d/query`，body `{"JobId":"..."}`

生图 `POST /v1/aiart/submit`：
- body：`{"model":"HY-Image-V3.0","prompt":"...","size":"1024:1024","images":[参考图],"extra_body":{"revise":0}}`
- 查询：`POST /v1/aiart/query`，body `{"job_id":"..."}`，返回 `{"status":"5","data":[{"url":...}]}`

### 第一次生3D的结果（用 `_40_2` 直接喂照片）

- 耗时约 **115 秒**，消耗 **20 积分**（`ResultCreditDetails: {"GenerateType-Normal":20}`）
- 输出：GLB 27.7 MB + OBJ 的 zip + 一张预览图
- **质量不达标**：出来是**半身像**（输入照片只有头肩）、风格偏写实、头发糊成一坨、西装边缘破碎
- 网格数据：**498,304 三角面 / 277,909 顶点**，网格本体 14.87 MB，其余是贴图
  → 网页要 ≤5 MB，压缩这步必须做（simplify + 纹理压缩 + Draco/Meshopt）

**结论：不能跳过生图那一步**。直接用照片喂生3D 得到的是写实残缺半身像，
必须先用图像模型做出「卡通 + 全身 + A 字站姿」的图，再喂给生3D。

### 积分消耗（重要）
- 100 免费积分，**每次生3D（Normal）扣 20 分** → 只有 5 次机会
- 已用 **40 分**（其中 20 分是我探测请求体格式时误提交了第二个任务，重复输入，浪费了）
- **剩余 60 分 = 3 次**

### 当前阻塞
**「腾讯混元生图」服务未开通**。提交时报：
`ResourceUnavailable.NotExist：计费状态未知，服务未开通，请登录控制台确认是否已开通服务。`

需要在腾讯云控制台开通该服务后，同一个密钥即可使用。

### 工具
- `tools/ai3d.mjs` —— 生3D 的 submit / query / wait（自动下载 GLB）
- `tools/aiart.mjs` —— 生图的 submit / query / wait（自动下载 PNG）
- `tools/prompts.mjs` —— A / B 两版提示词
- 三者都从 `.env` 的 `API_KEY` 读密钥，不硬编码

### 腾讯云生图的两套体系（密钥不通用，2026-10-15 实测）

腾讯云正在把混元从旧控制台迁到 TokenHub，导致**同时存在两套接口和两类密钥**：

| | 旧异步接口 | TokenHub（MaaS） |
|---|---|---|
| 地址 | `api.cloudai.tencent.com/v1/aiart` | `tokenhub.tencentmaas.com/v1/images/generations` |
| 密钥来源 | [接入管理页](https://hunyuan.cloud.tencent.com/#/app/apiKeyManage) | [TokenHub API Key](https://console.cloud.tencent.com/tokenhub/apikey) |
| 现有密钥 | ✅ 认证通过，但报**服务未开通** | ❌ `401002` API Key 不存在 |
| 开通入口 | [旧控制台](https://console.cloud.tencent.com/aiart)（**逐步下线，需联系工作人员加白**） | [TokenHub 模型页](https://console.cloud.tencent.com/tokenhub/models) → 同意条款 → 立即开通 |

**结论**：现在给的这个 `sk-` key 是旧体系的，能生3D、能通过生图的认证，但生图服务未开通。
旧控制台在逐步下线，**新开通建议直接走 TokenHub**，但那样需要**另外建一个 TokenHub 的 key**。

### 备选生图路线（都不需要代理，直连可达）
- **火山引擎 Seedream 4.0**（豆包）——`ark.cn-beijing.volces.com`，图生图 / 多图参考能力强
- **阿里云百炼 Qwen-Image-Edit**——`dashscope.aliyuncs.com`，按指令改图，新用户常有免费额度
- OpenAI / Gemini——需走代理 `127.0.0.1:7892`，且 Gemini 对中国区账号开项目会失败

> 以上「当前阻塞」已在下一节解决。

---

## 九、已走通全流程（2026-10-15）

### 两个密钥（都放 `.env`，都不提交）

| 变量 | 来源 | 用途 |
|---|---|---|
| `API_KEY` | 腾讯云混元「接入管理」页 | 生3D `api.ai3d.cloud.tencent.com` |
| `TOKENHUB_API_KEY` | [TokenHub API Key 页](https://console.cloud.tencent.com/tokenhub/apikey) | 生图，可访问 121 个模型 |

**两把钥匙不通用**，别搞混。

### 生图的正确接入点（踩过的坑）

- ❌ `POST /v1/images/generations`（旧文档写法）→ **404**
- ✅ `POST https://tokenhub.tencentmaas.com/v1/wand/si-image/generation`
- model：`seedream-image-v5.0-pro`（另有 lite / flash）
- body：`{ model, prompt, images: ["data:image/jpeg;base64,..."], size: "2K", output_format: "png" }`
- `size` 可传档位（1K / 1.5K / 2K）或具体像素 `宽x高`
- pro 版支持 `background: "transparent"` 输出透明背景
- 单张耗时 47–155 秒

**前提**：必须在 [在线推理服务](https://console.cloud.tencent.com/tokenhub/inference) 开启后付费。
未开启时**所有**图像模型都返回 `402 服务无可用免费体验额度`——不是模型的问题，是总开关。

### 生图提示词的两轮迭代

第一轮的问题（已修）：**大头娃娃儿童比例**、**B 版脚被裁掉且光脚**、**白 T 恤在白色背景上对比度不足**。
第二轮加入「成年人头身比 1:6.5」「头顶到鞋底全部可见」「穿白色运动鞋」「深藏青上衣」后合格。

### 生3D 参数与消耗

- 每次 **20 积分**（`GenerateType-Normal`），耗时约 **115 秒**
- 免费额度 100 分，**已用 80 分，剩 20 分（还能跑 1 次）**
- 输出 GLB 约 27 MB + OBJ 的 zip + 一张预览图

### 压缩方案（可复用）

```bash
npx gltf-transform optimize 原始.glb public/models/avatar-x.glb \
  --compress quantize --texture-compress webp --texture-size 1024 --simplify-ratio 0.08
```

- 原始：499,882 面、4096×4096 PNG 贴图、27.8 MB
- 结果：**164,058 面、1024 WebP 贴图、4.26 MB**（A）/ 4.76 MB（B）
- 选 `quantize` 而不是 Draco / Meshopt：**网页端不需要额外挂解码器**。
  three.js 原生支持 `KHR_mesh_quantization` 和 `EXT_texture_webp`

### 模型实际尺寸（取景用）

| 模型 | 高 | 原点 | `yOffset` | `cameraZ` |
|---|---|---|---|---|
| `avatar-a.glb`（不戴眼镜） | 1.1567 | 脚底 | -0.578 | 1.95 |
| `avatar-b.glb`（戴镜框） | 1.1350 | 脚底 | -0.567 | 1.91 |

用 `node tools/glb-bbox.mjs public/models/avatar-a.glb` 随时重算。
**坑**：不能直接读 accessor 的 min/max——顶点被量化过，且模型绕 X 轴转了 90°、Y 轴才是高度。
工具里已处理节点变换。

### 待本人决定
**A 版（不戴眼镜）还是 B 版（戴镜框）**。两版都已接进网站并截图，
切换只需改 `src/three/AvatarScene.tsx` 里的 `MODEL`（注释里写了两个版本的参数）。

### 工具一览
| 文件 | 用途 |
|---|---|
| `tools/seedream.mjs` | TokenHub 生图（参考生图） |
| `tools/ai3d.mjs` | 混元生3D 的 submit / query / wait，自动下载 |
| `tools/aiart.mjs` | 旧体系异步生图（当前未开通，留作备用） |
| `tools/prompts.mjs` | A / B 两版提示词（两轮迭代后的终版） |
| `tools/glb-bbox.mjs` | 算模型世界包围盒，直接输出取景参数 |

---

## 十、换装迭代与最终定稿（2026-10-15）

本人反馈「衣服太素」，于是按照片里的真实穿搭做了四套候选（2D 图存在 `refs/outfits/`）：

| 文件 | 对应照片 | 结论 |
|---|---|---|
| `01-hoodie-corduroy.png` | `_34` `_36` | ✅ **选定** |
| `02-knit-sweater.png` | `_39` | 最有个性，但针织图案在低模贴图上易糊 |
| `03-stripe-shirt.png` | `_43` | 条纹太细，压到 1024 贴图会摩尔纹 |
| `04-linen-suit.png` | `_28`–`_33` | 招牌穿搭，但米白与浅色纸背景明度几乎相同，人物会「飘」 |

**选定灰连帽卫衣 + 卡其灯芯绒夹克**，理由：两层结构给 3D 模型真实体积感；
灯芯绒是「材质」不是「图案」，烘焙成贴图能自然保留；暖卡其在纸感浅背景上够跳。

最终模型：`public/models/avatar.glb`，高 1.147，`yOffset -0.573`，`cameraZ 1.93`。

### 压缩的关键教训（重要）

**`--simplify-ratio` 基本不起作用，真正控制面数的是 `--simplify-error`。**
ratio 从 0.08 调到 0.18，面数纹丝不动（都是 218k）。改用 error 才有效：

| `--simplify-error` | 面数 | 文件大小 |
|---|---|---|
| 默认（约 0.0001） | 218,476 | 5.51 MB ❌ 超限 |
| 0.0002 | 121,964 | **3.35 MB** ✅ 采用 |
| 0.0003 | 81,340 | 2.35 MB |
| 0.0005 | 47,612 | 1.19 MB |
| 0.001 | 22,634 | 0.64 MB |
| 0.01 | 7,680 | 0.31 MB（模型会废） |

跨度极大，**必须实测挑选**。最终用的完整命令：

```bash
npx gltf-transform optimize 原始.glb public/models/avatar.glb \
  --compress quantize --texture-compress webp --texture-size 1024 \
  --simplify true --simplify-error 0.0002
```

另外注意：顶点数要降到 65536 以下才能用 u16 索引（否则 u32 索引白占一倍体积），
所以面数和体积不是线性关系，压到某个点会突然掉一大截。

---

## 十一、让它动起来：绑骨 + 自写骨骼动画（2026-10-15）

### TokenHub 3D 服务的统一接入点

之前猜的 `/v1/wand/3d/rigging` 之类全部是错的（返回「接口不存在」）。正确地址是：

```
POST https://tokenhub.tencentmaas.com/v1/api/3d/submit
POST https://tokenhub.tencentmaas.com/v1/api/3d/query
```

**用 `model` 字段区分服务**：`hy-3d-rigging`、`hy-3d-motion`、`hy-3d-format`、`hy-3d-uv`、`hy-3d-retopology` …

排查技巧：拿一个**已知可用**的路径配一个故意写错的子路径做对照，就能判断错误信息
「接口不存在」到底是路径错还是服务没开。这里是路径错。

### 输入必须是公网 URL（重要）

- ❌ `file_3d` 不接受 base64；`{base64:...}`、`{glb:...}` 都报「file_3d is required」
- ❌ 传 data URI 报「URL格式不合法」
- ❌ 没有独立的上传接口（`/v1/api/3d/upload` 等全是 404）
- ✅ 正确写法：`file_3d: { url: "https://..." }`
  （注意 `hy-3d-format` 的字段名是 `file`，不是 `file_3d`）

**免上传的办法**：混元生3D 的输出本身就在腾讯云 COS 上，是带签名的 URL（24 小时有效），
直接拿它当输入即可。用 `node tools/ai3d.mjs query <JobId>` 可以随时重新取到新鲜地址。

**鉴权**：TokenHub 必须带 `Bearer` 前缀；旧 ai3d 密钥**不能**带。两把钥匙在这一步很容易搞混。

### 完整链路

```bash
# 1) 绑骨 + 指定预设动作（26=待机-1，27=待机-2，还有走路/慢跑等 48 个）
node tools/tokenhub3d.mjs submit hy-3d-rigging --url "<生3D输出的GLB地址>" --motion-type 26
node tools/tokenhub3d.mjs wait   hy-3d-rigging <id> --outdir .tmp-tools/rigged

# 2) 输出是 FBX，转成 GLB（字段名是 file，不是 file_3d）
node tools/tokenhub3d.mjs submit hy-3d-format --field file --url "<上一步的FBX地址>" --format GLB
node tools/tokenhub3d.mjs wait   hy-3d-format <id> --outdir .tmp-tools/rigged

# 3) 压缩（骨骼和蒙皮能完整保留）
npx gltf-transform optimize in.glb out.glb --compress quantize \
  --texture-compress webp --texture-size 1024 --simplify true --simplify-error 0.0002
```

绑骨约 80 秒，格式转换约 10 秒。

### 结论：服务返回的动画不能用，改成自己驱动骨骼

**服务重定向过来的动作会把模型扭变形**（头变大、身体折叠）。
用 `prefers-reduced-motion` 关掉动画看**绑定姿势**是完好的，所以：
骨骼、蒙皮、绑定都没问题，**坏的只是那段动画数据**——动画名带 `_remap` 后缀，
说明服务把通用动作重定向到这套只有 28 根骨骼的模型上，重定向失败了。

于是改成在 `AvatarScene.tsx` 里**自己驱动骨骼**（更可控，且不增加任何文件体积）：

- 从模型里按名字取骨骼：`Head` / `Neck` / `Spine1` / `Spine2` / `LeftArm` / `RightArm`
- 记录绑定姿势的四元数，每帧在上面**后乘**一个小偏移
- 头部朝向光标（阻尼平滑）+ 很慢的自主摆动 + 呼吸 + 手臂微摆
- 骨骼局部 Y 沿骨长方向，所以绕 Y 转 = 左右转头

**顺带把那段坏动画从 GLB 里删掉了**（`tools/` 里没留脚本，需要时用
`@gltf-transform/core` 的 `root.listAnimations().forEach(a => a.dispose())`）。
体积几乎没变（4.56 → 4.55 MB），但能防止以后有人误播它又把模型扭坏。

### 带蒙皮模型的取景（踩过的坑）

`tools/glb-bbox.mjs` 对**带蒙皮的模型算不对**——顶点由骨骼矩阵决定，
根节点 `Armature` 还有 0.01 缩放，静态包围盒没意义（算出来只有 0.02 高）。

改成在**运行时**归一化：`GltfAvatar` 加载后遍历场景，对 `SkinnedMesh` 调
`computeBoundingBox()`（它会应用骨骼变换），量出真实包围盒，
缩放到 `AVATAR_HEIGHT` 并把身体中心移到世界原点。
**这样换任何模型都不用再调相机参数。**

### 最终模型
`public/models/avatar.glb`：135,775 面、4.55 MB、28 根骨骼、无动画数据（程序化驱动）。

---

## 十五、挥手穿模的真实原因（第五轮）

线上截图里挥手时腋下被拉出一大片薄网，看着像"穿模"。逐个排除后定位到：

**腋下有几个顶点被错绑到了大臂骨上**，所以一抬臂就被拉成长条。
证据是**左右不对称**：同样的姿势，人物**左**臂（画面右侧）完全干净，
**右**臂（画面左侧）必定拉丝——同一套骨骼同一组参数，唯一变量就是网格权重。

试过的手段和效果：

| 手段 | 效果 |
|---|---|
| 上臂张开角 82° → 62° → 48° | 大片薄网 → 细丝（按比例缩小，但不会消失） |
| 肩骨分担 0.25 → 0.45 → 0.72 | 无明显改善，说明不是肩/臂分工问题 |
| 改成**屈肘举手**：上臂几乎不动，只抬前臂 | 网格最干净；姿势读作「抬手打招呼」 |

最终采用：上臂小幅外展 + 屈肘抬前臂（`WAVE_UPPER` / `WAVE_FORE`），
肩骨分担 0.5。

### 那条细丝到底修不修得掉（结论：修不掉）

后来又系统试了 7 种办法，**细丝纹丝不动**：

| 试的办法 | 结果 |
|---|---|
| 大臂张开角 82° → 62° → 48° | 大片薄网缩小成细丝，但不消失 |
| 肩骨分担 0.25 / 0.45 / 0.5 / 0.72 | 无变化 |
| 肘部弯角 141° → 118° | 无变化 |
| 大臂完全不动，只抬前臂 | 无变化（说明不是大臂） |
| 按高度修权重（低于肘部却受大臂驱动 → 改给脊椎） | 改了 10233 处，**无变化** |
| 按几何距离诊断权重（离骨段超过中位数 2.2 倍） | **命中 0 处** → 权重其实是合理的 |
| 材质改双面渲染（怀疑是裂缝透背景） | 无变化 |

**结论**：权重没问题，是**袖子与躯干两片壳之间的接缝几何**在抬臂时裂开，
属于生成模型本身的缺陷。代码层面到此为止，根治要重新生模型或手动补拓扑。

细丝只在人物**右臂**（画面左侧）出现，左臂干净——同一套参数，唯一差异是网格本身。

## 十六、加载太慢：几何占了 89%

线上首屏人物要好几秒才出来。量了一下 GLB 的构成：

```
文件总 4.55 MB
  贴图        0.09 MB  (2%)
  几何 accessor 4.04 MB  (89%)   ← 问题在这
```

所以压贴图没用，要压**几何**。用 gltf-transform 的 meshopt：

```bash
npx gltf-transform meshopt public/models/avatar.glb out.glb --level high
```

**4.55 MB → 1.26 MB（省 72%）**，外观和骨骼完全无损
（压缩后实测转头动画正常、0 报错；日志里 `prune: Removed ... Skin (1)` 是虚惊）。

运行端不需要改代码：drei 的 `useGLTF` 默认 `useMeshopt = true`，解码器本来就在包里。

另外两处加载优化：

1. `requestIdleCallback` 的 timeout 从 **1500ms 降到 400ms**，早点开始加载
2. 在开始加载 3D 时插一个 `<link rel="preload" as="fetch" crossorigin>`，
   让**模型和 3D 代码包并行下载**——否则要等代码包下载+执行完才发模型请求，
   实测模型开始下载从 3529ms 提前到 1804ms，且只发一次请求（preload 正常命中）

4G 限速（1.6 Mbps / 150 ms RTT / CPU 4×）实测：

```
首屏首次绘制 FCP   420 ms
3D 代码包          258 KB（gzip），完成于 4497 ms
模型 avatar.glb    1290 KB，1804 ms 开始 → 9517 ms 完成
```

## 十五、挥手穿模的真实原因（第五轮）

同时把头跟随光标的幅度调大了（`LOOK` 0.4/0.24/0.04 → 0.58/0.30/0.10），
左右转头约 33°，视线跟随明显了。

## 十四、第四轮：量出真正的低头量 / 挥手穿模 / 前倾

不再凭感觉调参数，先写脚本读 GLB 绑定姿势下各骨骼的世界坐标（gltf-transform 的
`node.getWorldMatrix()`），量出侧面（y-z 平面）每段骨头的倾角：

```
Neck → Head      22.8°   ← 头默认前倾这么多，这就是"一直低着头"的真正原因
Spine2 → Neck    -3.1°
Hips → Spine2    -1.7°   ← 躯干其实基本是直的
LeftFoot → Hips   3.1°
```

- **低头**：之前只补了 0.18 rad（10.3°），剩 12° 当然还低着。`HEAD_LIFT` 改到 **0.42 rad ≈ 24°**
- **前倾**：躯干本身只偏 1.7°，视觉上的"前倾"主要是**头探在胸前**。
  让脖子多分担俯仰（`NECK_SHARE` 0.4 → 0.62），头骨的**位置**会被脖子带着往后挪，
  而头的**朝向**由 `HEAD_LIFT` 单独决定、不会跟着后仰。侧面轮廓前倾量少了约 26%
  （用截图轮廓逐层中点算的：-12.5px → -9.2px）
- ⚠️ 试过直接平移头骨把脑袋挪到肩膀上方：**骨骼的 position 写进去了，网格却没动**
  （同一根骨头改 scale 会明显生效，说明骨头选对了、是位置写入被覆盖）。
  这条路不通，已撤掉。剩下的"头略探前"是模型本身的造型，
  要彻底改得重新雕或换一次生3D
- **挥手穿模**：上臂原来主要往**前**抬（`WAVE_UPPER` 的 z 分量 0.9），手就停在脸前面。
  改成主要往**外**抬（x 0.82 / z 0.4），并把前臂也往外偏、摆幅从 0.42 收到 0.32，
  手就明确地在头的外侧了

### 另外记一笔：别用 PowerShell 改这份源码

`(Get-Content ...) -replace ... | Set-Content` 会把 UTF-8 的中文变成乱码、
还会吃掉换行，整个文件语法错乱。改代码一律用编辑工具，别走 shell 管道。

## 十三、第三轮修正（低头 / 一直摇头 / 挥手不像 / 去掉眨眼）

根因都是同一个：**直接绕骨骼的局部轴转**。这套骨骼的局部轴是斜的，
绕头骨局部 X"点头"会混进歪头和摇头；手臂局部 Z 也不是"往上抬"的方向。

改法：所有转动都在**模型空间**里定义（X=人物左手方向，Y=上，Z=朝镜头），
再换算成局部旋转：`局部 = parentWorld⁻¹ · parentDelta⁻¹ · delta · parentWorld · restLocal`
（`AvatarScene.tsx` 里的 `drive()`）。手臂不用欧拉角，而是算"上臂/前臂当前指向 → 目标指向"
的最小旋转（`setFromUnitVectors`），完全不依赖局部轴。

- **低头**：基础抬头量 0.10 → 0.18；光标往下看的幅度单独压到 0.05，
  光标停在下方文字区时也不低头。减少动态效果模式下也会抬头
- **一直摇头**：悬停圆球原来挂在骨骼上，一点头圆球就从光标下移开又移回 → 反复触发。
  改为挂在 scene 根节点、固定在绑定姿势的位置；停着不动只触发一次
- **挥手**：上臂主要**往前**抬（只略外展），前臂竖直举到头旁、左右摆。
  上臂往两侧张开会把腋下网格拉出丝
- 绑定姿势缓存在 `scene.userData.rigging`：`useGLTF` 复用同一个 scene，
  重新挂载时骨骼已被动画改过，不能再当绑定姿势记录
- 眨眼整套（眼皮椭球、肤色采样）已删除

## 十二、加眼皮 / 手势 / 拖动（2026-10-15 第二轮）

> 眼皮部分已在第十三节删除，留作记录。

### 最坑的一个：文字层把指针事件全吃掉了

悬停手势和拖动一开始**完全没反应**。查下来是：

```
(p625,545) 处最上层元素 → DIV.hero-inner.hero-copy  ← 不是 canvas
```

`.hero-stage` 虽然写了 `pointer-events: none`，但 `.hero-inner`（文字层，`z-index: 2`）在画布上面，
它默认是 `auto`，把整个 hero 区域的指针事件都截走了。R3F 的 `state.pointer` 一直是 `(0,0)`。

**修法**：文字层整层 `pointer-events: none`，只给真正可点的元素单独打开：

```css
.hero-inner, .hero-foot { pointer-events: none; }
.hero-inner a, .hero-inner button,
.hero-foot a, .hero-foot button { pointer-events: auto; }
```

**排查手法值得记**：`document.elementFromPoint(x, y)` 拿到最上层元素，再沿 `parentElement`
把整条链的 `getComputedStyle(el).pointerEvents` 打出来——一眼就看出是谁挡的。

### 眼皮：怎么把一块"肉"精确放到眼球上

眼睛是贴图的一部分，没有眼球/眼皮骨骼，也没表情（blendshape），所以只能自己加几何体。

1. **定位**：从相机往眼睛的 NDC 打射线，命中点就是眼球表面，再 `headBone.worldToLocal()` 
   转成骨骼局部坐标挂上去，这样眼皮会跟着头一起转
2. **射线要在"归一化之前"的模型空间里打**：把射线起点按 `(p - offset) / scale` 还原，
   方向不变（等比缩放不影响方向）。因为贴眼皮是在归一化之前做的
3. ⚠️ **瞳孔 NDC 必须在"绑定姿势"下量**（开 `prefers-reduced-motion` 截图）。
   如果拿动画中的截图去量，头的俯仰/偏航会让坐标对不上，眼皮就飘了——
   我第一次就栽在这，眼皮整整偏高了 0.03 NDC，贴在眉毛上
4. ⚠️ **眼球是凹在眼窝里的**，球心放在表面时有一半陷进去。球太小 → 可见的只有一小帽，
   盖不住眼白。最后用了 `x 0.048 / y 0.041 / z 0.030`（模型高 1.147，眼睛开口只有约 0.035）
5. ⚠️ **颜色别"取最亮点"**——会采到眼白，变成两块白球。改成在脸上试多个点，
   用**暖色判据**（`r - b > 0.06`）排除眼白（中性偏冷）和镜框、头发（很暗），再取最亮的
6. 睁眼时 `visible = false`，否则会在眼球正中留一个小点

### 头的俯仰方向：正角度是"低头"

**实测**（`shots/pitch-top.png` vs `pitch-bottom.png`）：鼠标在屏幕最上时头低下去、最下时抬起来，
说明原代码 `-py * 0.18` 写反了。正确的映射：

```js
aimPitch = py * 0.20 - HEAD_LIFT   // py<0（鼠标在上）→ 负角度 → 抬头
```

另外**绑定姿势本身就是低头的**，所以加了 `HEAD_LIFT = 0.10` 做基础抬头量。
（头骨和颈骨都转，合成约 1.45 倍。）

### 悬停手势：整块网格是合并的，没法直接判断"鼠标在手上还是头上"

解法：在头骨和两只手骨上各挂一个**不可见圆球**，每帧打射线检测。

- `proxy.visible = false` 不影响射线检测——three.js 的 `intersectObject`
  只看 `layers`，不看 `visible`（用显式对象引用传入即可）
- 手骨在**手腕**上，可见的手在更下方；骨骼局部 +Y 指向指尖，所以往那个方向偏移 0.05
- 手势是"进入时才触发"：记录上一帧的命中目标，变了才启动，完成后加 0.5s 冷却，
  否则一直悬停会疯狂重复
- 挥手一开始只抬上臂 → 变成"平举指人"。要**加屈肘把前臂竖起来**才像打招呼

### 拖动看全身

`gl.domElement` 上监听 `pointerdown/move/up`。`pointerdown` 时先打一条射线，
**只有真的点到模型才起拖**，这样画布内、人物外的空白区域不会误触。
松开后阻尼缓回待机姿态。`touch-action: pan-y` 让手机上竖划仍然滚页面。

### 取景：鞋子被切是因为余量只有 1.4%

可见高度 `2·z·tan(fov/2)`，原来 `z = 1.93` → 1.18，而模型归一化后高 1.147，
上下各只剩 1.4% 余量，鞋底正好压在画布下沿上；再加上那个 `sin` 上下浮动，就被切了。

改成 `CAMERA_Z = 2.16`（余量 7%）并**删掉上下浮动**。另外原来那个 `ContactShadows`
在浅色纸感背景上看起来就是"地上有一块地板"，也一并删了。
