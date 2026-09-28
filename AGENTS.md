# 项目工作约定

- 权威设计：doc/design/01-mvp-design.md、doc/decisions/0002-small-scale-web-app.md；本轮行为与验证见 doc/task_plan/。
- 所有文件编辑、依赖安装、构建、自动测试和初期部署均在 i7-11700 的 /home/cloudray/projects/magic_creater_test 执行。Mac仅作SSH控制与结果查看，不在Mac运行项目开发/测试进程。
- 单应用、SQLite；2026-09-27用户已授权横版跳跃与探索故事两种新玩法，保留V1格子作品兼容。本轮计划/契约见doc/task_plan/dual-games/。2026-09-28新增雪人回家(schemaVersion3)，本轮见doc/task_plan/snowman/02-milestones.md和04-component-contracts.md。不引入微服务、任意脚本执行、通用规则引擎或复杂权限平台。
- 后端增量UT行/语句/函数/分支覆盖最低70%，不能用E2E覆盖代替UT，不能排除业务文件以达标。
- 测试使用内存或独立临时数据，禁止连接或清空试用数据库。凭据、数据库、浏览器trace和含隐私的日志不入Git。
- 完整创作/审核/同伴试玩/反馈闭环必须用真实浏览器验证；声明部署完成必须检查实际服务和恢复证据。
- 本轮修改完成后，由独立只读子agent复查设计一致性、测试与过度设计；解决有效问题后才交付。
- 任何commit遵循用户提供的AI贡献记录：Co-Authored-By: Codex <noreply@anthropic.com>，实际AI-Model，Feature/UT独立numstat，UT行最后；先写.git/.cr-ai-session标记。

- 每个正式部署版本都要在11700使用临时虚构数据录制55–75秒真实浏览器操作视频，附中文字幕、封面、版本说明与提交/SHA256清单；视频随GitHub Release发布，首页“本次更新”指向该版本。预览素材必须与实际玩法对应，不能使用试用库或展示真实凭据。
