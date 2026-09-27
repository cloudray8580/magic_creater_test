# M6 验收与发布证据

日期：2026-09-27。当前状态：**M6 frozen，双玩法交付门槛达到**。实现、自动验证、独立复查、11700部署与恢复均完成。

## 范围

完整双玩法范围见01-goals-and-non-goals.md。M2内核/绘本呈现、M3横版编辑、M4探索故事、M5个人图片/涂鸦/改编/位置反馈均已冻结，详见09/11/13/15各阶段验收。
M6补齐C61框选分层批量编辑、C62小屋背景/地图贴图一致、C63所有模板普通通关证据，C64本机升级恢复与使用文档。

## 最终代码验证

- 11700运行Node22.22.1、真实Linux Chromium。Mac仅SSH/查看截图。
- `npm run typecheck`、`npm run format:check`退出0。
- `npm run test:coverage`：**171 UT /32文件通过**；含直接浏览器组件/Canvas单元测试，不把Playwright E2E计入UT。
- M6相对816966ce37df674bc41228d24875d611fb5c5c74新增可执行行174/176＝**98.86%**。
- 整轮相对82c1c2d48ddc79b33f0a6e6fef7e6a29e47d1510新增可执行行2002/2110＝**94.88%**。
- 整轮新增后端：行139/140＝99.29%，语句150/155＝96.77%，涉及函数29/29＝100%，涉及分支臂91/97＝93.81%，均≥70%。M6本身无新增后端业务。
- 后端全量：行402/431＝93.27%，语句428/467＝91.65%，函数78/85＝91.76%，分支244/272＝89.71%。server＋shared四项96.75%/95.80%/96.78%/92.93%。没有排除业务文件。
- **11条完整E2E全过（1.2分钟）**：两玩法创作/老师审核/同伴通关/反馈、个人图与涂鸦/改编/位置/带图导出导入、离线草稿/冲突、V1兼容/账户切换。
- 最后美术调整仅SVG侧边窗景；补真实secret-home Canvas失败回归0>400后转绿，受影响故事E2E重新通过（8.8秒），其余10条沿用已通过且未受改动的完整回归。
- 六个原始模板由7条普通输入内核路径证明可完成（小屋两选择）。浏览器：云间/来信样板真实UI，移动桥/屋顶为真实Chromium运行适配器正常按键，灯塔/小屋两选择为真实UI。没有修改状态、辅助模式、指定起点或篡改模板证明普通通关。
- 部署前副本演练：schema2→3、原表旧列内容摘要一致，临时V2图片字节/来源/坐标备份恢复、旧程序配对旧DB回滚通过；源DB只读。
- 临时HOME/假systemctl故障注入：stop返回18、backup返回19时，原DB/config/unit保持，旧服务恢复命令执行。没有用此测试声称实际systemd异常路径已执行。

日志留在11700 `/tmp/magic-m6-final-coverage.log`、`/tmp/magic-m6-final-total.log`、`/tmp/magic-m6-full-e2e.log`、`/tmp/magic-m6-cottage-final.log`；凭据/数据库/trace不入Git。

## 独立只读复查

|复查|发现与处理|结果|
|---|---|---|
|m6_scope_audit|识别框选、主题、四模板证据缺口，列入C61–C64补齐|范围已对应实现|
|m6_group_review|复制选区使用聚焦属性提交前的历史；失败回归复现后改用latest.onChange|复核关闭，无未处理Important/Blocker|
|m6_visual_paths_review|故事地板挡住小屋中央窗景；补可见侧边窗/书架与实际story像素回归|复核截图和代码后关闭|
|m6_release_review|停服与恢复handler安装间的失败窗口；handler前置，分阶段恢复，新增故障注入|复核关闭|

未增加规则脚本引擎、微服务、消息队列、协作编辑平台或缓存服务；仍是单Fastify＋SQLite。复查均未修改代码或运行测试，验证由主代理在11700执行。

## 画面检查

目视检查框选、地图层次、角色、侧边窗景、结局文字和按钮；未发现遮挡可操作区域。截图来自隔离测试账户，不包含真实学生：

- [框选与复制](evidence/m6-group-editor.png)
- [小屋实际画面](evidence/m6-cottage-start.png)
- [小屋看星星](evidence/m6-cottage-stars.png)
- [小屋留下信](evidence/m6-cottage-letter.png)
- [灯塔交付结局](evidence/m6-lighthouse-finished.png)

## 发布结果

- 部署源码提交：`2ac7a853004bd97bd4eb50704ffb947972aab61c`。commit完成后重新执行npm run build退出0，再执行deploy-user.sh；随后只补文档验收提交。main中的发布代码与此提交一致。
- 实际release：`/home/cloudray/.local/share/magic-creater/releases/20260927T070859Z`，systemd用户服务active，监听127.0.0.1:4173。
- 成对回滚材料：`/home/cloudray/.local/share/magic-creater/upgrades/20260927T070859Z`，包含schema2迁移前快照及旧配置/unit/release指针。原release为20260926T135402Z。
- `verify-deployment.mjs`退出0：release commit与当前发布代码一致，schema3，实际首页和引用资源字节一致，重启后会话有效，退出成功。
- 真实每日备份 `magic-20260927T070919Z.sqlite` 的独立临时恢复副本通过登录、integrity_check、foreign_key_check。用户/班级/作品/版本/反馈的原列摘要与迁移前一致。
- 原业务数量：users3、classrooms1、projects5、versions2、feedback0、assets0。没有向生产添加测试学生/作品/图片；有图/来源/反馈位置的恢复在临时副本及M5隔离测试中验证。
- 实际已部署页面使用11700 headless Chromium登录、进入横版/故事、方向键移动、切换场景、退出通过，单Canvas生命周期正常，无pageerror。所有3个JS/CSS资源包括延迟加载renderer均与release字节一致。此检查只产生登录/退出会话写入。
- 每日backup timer active，Linger=yes；仅保留本机备份。升级故障注入是隔离测试，未在生产人为制造失败或实际回滚。
- 最终使用入口与创作步骤见[使用指南](../../usage/01-creative-workshop.md)，运维命令见[运行手册](../../deployment/01-runbook.md)。

## 验证边界

用户确认电脑＋键盘鼠标优先。本次主要验证Linux Chromium桌面；未进行真实课堂、年龄适配、学生审美、持续参与或厌学改善试验。音频合成和开关有自动化验证，未作真实扬声器/耳机主观听感评价。未证明Safari/移动端/班级并发容量、Docker和ECS部署；单机每日备份不覆盖整机磁盘损坏，异机备份按用户决定后置。未开放公网，不声称已满足公开游戏发行合规。

发布源码/测试/素材/脚本指纹（按路径排序，逐文件SHA256再汇总，排除验收文档）：`9edd5349dd9ceed6c807d41f73cc1241bfcb2e712b24a61615ad94eb18bf98ce`。
