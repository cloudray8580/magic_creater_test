# magic_creater_test

创作工坊：用于小范围探索关卡创作、同伴试玩和具体反馈的 Web 应用。首版已经实现，并在 i7-11700 内部部署；尚未开展真实学生试用或验证教育效果。

## 已实现

- 两个网格模板，起点/终点/石墙/花朵编辑，撤销重做，独立试玩及重新开始。
- IndexedDB 草稿、短暂断网编辑、服务器修订冲突、作品复制与 JSON 导入导出。
- 师生身份、学生账号管理、固定版本审核/退回/撤回、同伴反馈及隐藏处理。
- 作者历史试玩、反馈修订标识、单作品单浏览器编辑锁，防止多个标签覆盖草稿。

## 技术与运行

TypeScript + React + Vite；一个 Fastify 应用提供网页和 API，使用 SQLite。固定网格玩法无需 Phaser。全部编辑、依赖、构建、UT、浏览器测试和初期部署在 **i7-11700**；Mac 仅用于 SSH 和查看结果。

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

当前：27项UT、3条真实Chromium流程通过；后端增量行覆盖90.48%，四项覆盖均高于70%。已完成两位独立子agent审查及修复复核。

**试用边界**：仅验证Linux Chromium与390/1440px视口，未验证真实平板/Safari或班级容量；需安全上下文支持Web Locks。Dockerfile未实际构建，ECS未部署。按用户2026-09-26确认，第一版暂不做异机备份，保留11700本机每日备份与已验证的恢复流程；M1验收通过。
