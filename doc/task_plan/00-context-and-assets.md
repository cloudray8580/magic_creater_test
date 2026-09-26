# 实施上下文

- 主机：i7-11700；所有源码、依赖、构建、测试与试用服务均在该机。
- 仓库：/home/cloudray/projects/magic_creater_test；主分支 main。
- 开发分支：feature/m1-creative-game；基线 a35c385ddfb26af0061a63aa0b450e8925b6ca2f。
- 已核验：基线仅15篇Markdown，无生产代码或测试；Node 22.22.1，npm 10.9.4，Linux x86_64；工作区初始干净。
- 权威范围：[首版设计](../design/01-mvp-design.md)、[ADR 0002](../decisions/0002-small-scale-web-app.md)，以及用户最新要求全在11700执行、后端增量UT≥70%、完整跑通和子agent复查。
- 只读探索：requirements_audit 提取完整验收；deployment_audit 确认 systemd 用户管理器运行、Linger=yes、Docker socket 无权限、常用应用端口未占用。
- Mac仅作为SSH控制和结果查看终端，不在Mac安装项目依赖或运行测试。
- 技术风险：本地/服务端草稿冲突、固定版本与撤回权限、持久数据隔离；初期部署已采用systemd用户服务，无需Docker提权；异机备份按用户2026-09-26决定移至后续，不属于第一版。
