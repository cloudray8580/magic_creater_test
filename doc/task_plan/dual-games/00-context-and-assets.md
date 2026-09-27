# 双玩法升级：上下文

日期：2026-09-27。来源：用户要求按双玩法详细方案开发，增量UT≥70%，独立子agent review，跑通完整游戏链路。

基线：main / 82c1c2d48ddc79b33f0a6e6fef7e6a29e47d1510。当前分支 feature/m2-dual-game-samples；所有编辑、依赖、测试、构建、初期部署在11700。Mac仅SSH与结果查看。

已只读探索：dual_game_baseline 检查App、Play、drafts、shared/game、UT/E2E；dual_game_server_audit 检查API、DB、备份和部署。事实：V1严格固定单格子玩法和128KiB；App编辑器耦合，但作品/版本/审核/反馈存完整JSON可复用。部署release与工作区隔离。

现有资产：src/shared/game.ts、src/client/App.tsx/Play.tsx、src/server/app.ts/db.ts；tests/unit与tests/e2e；doc/verification/m1-2026-09-26.md。M1历史冻结结论保留。

目标扩大来源：本轮用户明确授权两个新玩法，覆盖AGENTS的旧单玩法限制。旧作品保持原语义；新玩法不自动改写旧作品。

风险：实时手感、机关组合、素材版本/权限、草稿生命周期、图片导出兼容、视觉质量、覆盖率虚高。首批年龄和真实课堂设备未知，先电脑浏览器，实际课堂试用不得用自动化结果冒充。
