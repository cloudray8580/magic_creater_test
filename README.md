# magic_creater_test

创作工坊：用于小范围探索关卡创作、同伴试玩和具体反馈的 Web 应用。首版已经实现，并在 i7-11700 内部部署；尚未开展真实学生试用或验证教育效果。

## 已实现

- 横版跳跃和探索解谜＋轻故事，各三个不同机制的可玩样板，保留早期网格作品兼容。
- 横版地图最多2048×64、16384块地形、600个物体；小地图导航、视口绘制和100步撤销。
- 新账号空作品列表、首次明确保存才创建、确认后永久删除；复制/导入/改编失败重试防重。
- 拖画地图、分层框选移动/复制、机关连线、多房间、条件对话与故事结局、即时试玩。
- 绘本素材、主角配色/配件、图片上传和涂鸦、带图片的可移植作品文件。
- 本地草稿、修订冲突保护、固定版本审核、班级同伴试玩、位置反馈和作者可选改编授权。

[从这里开始使用](doc/usage/01-creative-workshop.md)。本轮自动验证为218项UT/浏览器组件、17条真实浏览器流程，新增可执行行覆盖率99.15%，新增后端四项均100%。M10已在11700部署，30分钟/89轮稳定性与实际备份恢复通过。发布、性能与稳定性证据见[M10验收记录](doc/task_plan/dual-games/25-m10-verification.md)。

[约一分钟的版本操作视频](https://github.com/cloudray8580/magic_creater_test/releases/tag/m10)；每次部署附中文演示、字幕、封面和版本说明。

## 技术与运行

TypeScript + React + Vite；一个 Fastify 应用提供网页和 API，使用 SQLite。新玩法由 Phaser 3 绘制并连接可单独测试的游戏规则；旧网格作品仍用React DOM。全部编辑、依赖、构建、UT、浏览器测试和初期部署在 **i7-11700**；Mac 仅用于 SSH 和查看结果。

初期采用 systemd 用户服务，仅监听11700的 `127.0.0.1:4173`。通过SSH转发访问：

```bash
ssh -L 4173:127.0.0.1:4173 cloudray@192.168.1.222
```

随后打开 http://127.0.0.1:4173 。老师账号初始化信息仅保存在11700本地受限文件，见运行手册，仓库不包含真实密码或数据库。

- [开发、部署、备份与 ECS 迁移手册](doc/deployment/01-runbook.md)
- [首版验收证据](doc/verification/m1-2026-09-26.md)
- [当前设计](doc/design/01-mvp-design.md)
- [实现决定](doc/decisions/0003-first-implementation.md)
- [全部调研](doc/README.md)

## 验证

在11700运行：

```bash
npm ci
npm run test:coverage
npm run test:e2e
npm run build
```

双玩法验证以[里程碑记录](doc/task_plan/dual-games/02-milestones.md)与[M10验收](doc/task_plan/dual-games/25-m10-verification.md)为准；早期M1结果保留为历史。所有测试数据独立于试用数据库。

**试用边界**：电脑键鼠优先，主要验证11700 Chromium；尚未验证真实学生课堂、Safari、移动端或班级并发容量。没有教育/医疗效果结论，也不代表满足公开游戏发行要求。Docker/ECS尚未实际部署；保留11700本机每日备份，异机备份按用户决定延期。
