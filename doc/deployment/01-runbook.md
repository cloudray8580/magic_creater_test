# 开发、初期部署与迁移

所有 npm、构建、UT、Playwright 浏览器、发布进程都在 i7-11700 执行。Mac 只作为 SSH 控制端，不复制 node_modules，不运行项目服务。

## 开发与验证

仓库：`/home/cloudray/projects/magic_creater_test`。Node 22.22.1，依赖由 package-lock.json 锁定。

```bash
npm ci
npm run typecheck
npm run test:coverage
npm run test:e2e
npm run build
```

E2E 在11700启动真实Chromium和独立临时数据库，退出时清理；运行端口4273。覆盖统计包括所有src/server和src/shared文件（包括未导入模块），另独立计算后端指标。初始main只有文档，新增后端全量即本次增量。

开发时分别运行 `npm run dev:server`（配置环境变量）和 `npm run dev`。Vite仅用于开发，部署运行dist中的产物。

## 初期运行

采用 systemd 用户服务，无需sudo。Docker当前账号无权限；保留Dockerfile用于后续迁移，未声称容器已构建通过。生产产物复制到独立release，测试重建dist不会影响正在运行的服务。

```bash
npm run build
bash scripts/deploy-user.sh
systemctl --user status magic-creater.service
journalctl --user -u magic-creater.service --since today
```

- release：`~/.local/share/magic-creater/releases/`
- 数据：`~/.local/share/magic-creater/data/app.sqlite`
- 配置：`~/.config/magic-creater/app.env`
- 首次随机老师账号：`~/.config/magic-creater/bootstrap.env`，仅主机账号可读；不得提交到Git。
- 默认仅监听11700的127.0.0.1:4173。主机上的浏览器打开 http://127.0.0.1:4173 即可。
- Mac只需SSH隧道：`ssh -L 4173:127.0.0.1:4173 cloudray@192.168.1.222`，再在浏览器打开 http://127.0.0.1:4173。应用仍运行于11700。
- systemd用户Linger需启用；本机已经启用。关闭用户登录不会停止服务。
- 老师登录后在管理页创建学生。不存在公开注册、默认通用密码、真实学生预填数据。
- 如启动失败，查看日志；不要删除数据库“修复”。

初期未开放公网/LAN明文密码登录。课堂设备接入前配置HTTPS入口、域名和APP_ORIGINS，再调整HOST；HTTPS来源启用Secure会话Cookie。正式发行的法律评估仍参考调研文档，本原型不代表已满足公开发行要求。

## 备份和恢复

SQLite使用WAL；不要在运行时只复制主sqlite文件。在线一致性备份：

```bash
APP_DATABASE="$HOME/.local/share/magic-creater/data/app.sqlite" \
node dist/server/backup.js "$HOME/.local/share/magic-creater/backups/backup-$(date -u +%Y%m%dT%H%M%SZ).sqlite"
```

备份函数拒绝覆盖文件、源与目标相同及不存在的源；输出权限600。部署脚本安装每日用户timer：magic-creater-backup.timer，保留最近14天日备份。可用systemctl --user start magic-creater-backup.service手动运行，备份失败可通过journalctl检查。

恢复必须先停止服务并备份当前数据，把选定备份恢复到独立新目录，用对应版本应用执行 integrity_check、foreign_key_check、账号/作品/审核/反馈读回验证，再切换APP_DATABASE并启动。不要覆盖运行中的数据库或遗留WAL文件。回退代码前确认数据库schema兼容；若不兼容，使用与旧release对应的备份副本。

单机备份不防磁盘损坏。异机备份目标待用户选择；在确定目标并完成恢复演练前，不应承载唯一一份真实学生资料。不得将数据库或备份提交到当前公开仓库。

## 迁往阿里云ECS

保持单实例和独立持久化目录；同架构Linux可以复用构建流程，容器部署使用仓库Dockerfile。不同CPU架构需重新构建better-sqlite3原生依赖，不能复制Mac的node_modules。迁移步骤：

1. 配置ECS、域名、HTTPS入口；按实际对外方式处理备案及游戏发行合规。
2. 在目标机/CI构建镜像并测试，挂载只有应用用户可写的数据目录；外部设置APP_ORIGINS。
3. 暂停11700写入，制作一致性备份，传输到ECS后检查完整性与业务数据。
4. 在新地址验收登录、创作、审核、试玩、反馈、备份，再切换用户入口。
5. 保留原机数据与release用于回退；不得双机并发写同一SQLite文件。

不引入Redis、Kubernetes、微服务或多个数据库实例。Docker可移植性待实际构建和ECS验收，不能将“技术可迁移”写成“已无缝验证”。
