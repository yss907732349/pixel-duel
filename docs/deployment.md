# 房间联机与部署

游戏网页和房间服务是两个部分。GitHub Pages 免费托管网页，但不能运行 Node.js 房间服务。此项目提供两种可用部署方式：

- 同一局域网：一台电脑运行全部服务，其他电脑直接打开它的局域网地址。
- 公网：GitHub Pages 托管网页，Render Free Web Service 运行同一个项目里的房间服务。也可以只用 Render，同时托管网页和房间服务。

## 先在局域网使用

1. 安装 Node.js 22 或更高版本，在项目目录执行 `npm ci`，然后执行 `npm start`。
2. 在运行服务的电脑上执行 `ipconfig`，找到当前有线网卡或 Wi-Fi 网卡的 IPv4 地址，例如 `192.168.1.10`。
3. 所有玩家打开 `http://192.168.1.10:4173`。不要在其他电脑上使用 `127.0.0.1`，它表示各自的电脑。
4. 打开房间联机入口，一人创建房间并设置 4–32 位密码，另一人输入房间号和密码加入。双方准备后开始。
5. 如果其他电脑打不开网页，在 Windows 防火墙中允许 Node.js 的“专用网络”访问，确认电脑处于同一网络且没有启用访客网络隔离。代理软件应绕过局域网地址。

默认监听所有网卡，端口为 `4173`。可用 `PORT` 或 `PIXEL_DUEL_PORT` 修改端口；只想本机使用时设置 `HOST=127.0.0.1`。无需公网端口映射。

同一局域网访问公网网页和公网房间服务，流量仍会经过互联网。想要内网低延迟，所有玩家应直接打开上面的局域网地址。

## 上传到 GitHub

1. 在 GitHub 创建用于本项目的仓库。使用 GitHub Free 发布 Pages 时，应选择公开仓库；公开仓库里的代码任何人都能查看。
2. 将项目提交并推送到仓库的 `main` 分支。不要上传 `node_modules`、测试产物、账号密钥或本机配置。项目已提供 `.gitignore`。
3. 房间密码由玩家创建房间时输入，不需要写入仓库、工作流或 Render 环境变量。

本项目不包含 GitHub 或 Render 账号凭据。发布需要在自己的账号中创建仓库并授权 Render 读取该仓库。

## 部署免费房间服务

1. 打开 [Render 控制台](https://dashboard.render.com/)，登录并连接 GitHub 仓库。
2. 选择 **New → Blueprint**，从项目根目录的 `render.yaml` 创建服务；确认套餐是 **Free**，不要选择付费实例。
3. 蓝图已为本仓库设置 `ALLOWED_ORIGINS=https://yss907732349.github.io`。若迁移账号或使用自定义域名，修改为实际网页来源，例如 `https://your-name.github.io`。这里只填写协议和域名，不包含仓库路径，不加末尾斜杠。多个来源用英文逗号分隔。
4. 部署成功后记录 Render 地址，例如 `https://pixel-duel-example.onrender.com`。
5. 打开该地址的 `/health`，应返回健康状态 JSON。再打开 Render 根地址，它也能直接显示游戏并连接同源房间服务。

不用 Blueprint 时也可以创建 **Web Service**：Runtime 为 Node，Build Command 为 `npm ci --omit=dev`，Start Command 为 `npm start`，Health Check Path 为 `/health`，设置 `NODE_VERSION=22`、`HOST=0.0.0.0`、`TRUST_PROXY=1` 和上面的 `ALLOWED_ORIGINS`。端口使用 Render 提供的 `PORT`，不需要手动填写。运行一个实例即可；房间保存在单个进程内存里，不支持多实例之间共享房间。

若只使用 Render 根地址游玩，不需要部署 GitHub Pages，也不需要设置网页的 `DUEL_SERVER_URL`。

## 发布 GitHub Pages 网页

1. 在 GitHub 仓库中打开 **Settings → Secrets and variables → Actions → Variables**。
2. 添加 **Repository variable**：名称为 `DUEL_SERVER_URL`，值为上面的 Render HTTPS 根地址，例如 `https://pixel-duel-example.onrender.com`。这是公开的服务地址，应使用变量而不是密钥。不要填写房间密码、账号令牌或 `ws://` 地址。
3. 打开 **Settings → Pages**，将 **Build and deployment → Source** 设置为 **GitHub Actions**。
4. 打开 **Actions → Publish game to GitHub Pages → Run workflow**，选择 `main`。之后推送到 `main` 也会自动发布。
5. 工作流通过检查后，打开 Pages 提供的网页地址，一般为 `https://your-name.github.io/repository-name/`。
6. 两个独立浏览器或两台电脑进入该网页，创建加密房间、加入并准备，确认移动、技能和血量同步。

工作流只发布 `index.html`、`animation-preview.html`、`style.css`、`js/` 和 `vendor/`，不会把后端、测试、技能文档或账号配置放到网页目录。它会从仓库变量生成 `js/deploy-config.js`，为网页指定房间服务地址。更改变量后必须重新运行工作流，网页配置才会更新。

## 免费方案的实际限制

- Render 免费服务连续 15 分钟没有收到 HTTP 请求或 WebSocket 消息时会休眠，再次访问通常需要约一分钟启动；首次连接时请等待服务唤醒后重试。
- 免费实例的每月运行时数、流量和其他额度受平台政策限制。Render 当前每个工作区每月提供 750 免费实例小时，由该工作区内所有免费服务共享。额度用尽或服务被暂停时，网页仍可能打开，但联机不可用。
- Render 重启、重新部署或实例休眠会清空内存房间。房间不永久保存，双方需要重新创建并加入。
- 免费服务的机房可能离玩家较远，局域网里的玩家访问公网服务同样会受网络和代理影响。180ms 格挡、220ms 完美闪避对网络延迟敏感；局域网直连手感通常更好。
- 免费额度、地区可用性和账号要求可能变化。此配置不会主动开通付费套餐；发布时仍需核对平台界面显示的套餐。

官方说明：[Render 免费实例](https://render.com/docs/free)、[Render WebSocket](https://render.com/docs/websocket)、[GitHub Pages 发布源](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

## 排查

| 现象 | 检查 |
| --- | --- |
| 网页能开，创建房间失败 | 打开 Render `/health` 确认服务已启动；检查仓库变量并重新发布 Pages。 |
| Render 网页能联机，GitHub Pages 不行 | 检查 `ALLOWED_ORIGINS` 是否包含实际 Pages 来源；包含域名即可，不要填写仓库路径。 |
| GitHub Pages 使用 HTTPS，但联机被阻止 | `DUEL_SERVER_URL` 必须是 `https://` 地址，客户端会使用安全 WebSocket 连接。 |
| 其他局域网电脑打不开 | 检查内网 IP、端口、防火墙、Wi-Fi 访客隔离和代理绕过规则。 |
| 密码正确但找不到房间 | 确认双方连接同一个房间服务；检查服务是否重启、房间是否过期或房间号输入错误。 |
| 切换窗口后暂停 | 返回游戏，双方重新准备后继续；断线时等待重连，超时后重新加入。 |

