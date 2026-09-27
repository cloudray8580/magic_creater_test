# M7 首页选择验收

基线16b0fcb；首页C71已实现，C72作品删除仍待用户选择永久删除或归档，不宣称已实现。六入口是两种玩法的六个起始模板，来信与灯塔确实共用解谜地图。

## 实现
- 两玩法分组，各一句玩法概述；六卡片各有实际样板截图、机制摘要、开始创作和先玩一玩。
- 试玩不创建作品；同类模板共享编辑工具。旧格子玩法/导入折叠为次级入口，并新增我的作品锚点。
- 六张WebP约95KiB，来自11700隔离样板Canvas，首页无运行中游戏实例；无需新依赖/服务/数据库字段。

## 验证
- npm run typecheck通过。
- npm run test:coverage：32文件172 UT通过；本轮可执行新增行13/13=100%。未修改backend；既有backend lines93.27%、statements91.65%、functions91.76%、branches89.71%。
- 受影响E2E 6/6：新首页六模板试玩、旧玩法完整创作/审核/同伴反馈/撤回、离线/冲突/账号切换、横版创作审核试玩闭环。
- 新首页实际Canvas和图片加载成功；试玩前后作品数据相同；返回首页销毁Canvas；键盘激活我的作品锚点成功；1024无横向溢出。
- 图片目视检查：1440及1024截图；文字/按钮完整，素材与玩法真实，无个人数据。
- 独立只读review home_delete_discovery无Blocker/Important。一项Minor：按钮aria-label未含完整可见文字，已调整为开始创作+名称、先玩一玩+名称；修正后9个组件UT和1条真实首页E2E重验通过。
- 最初E2E未启动，因为截图采集的隔离服务仍占4273；停止该已知临时进程后正常完成。未触及正式服务或生产业务数据。

[桌面首页](evidence/m7-home-desktop.png) · [1024首页](evidence/m7-home-1024.png)

## 发布
- 发布源码020d5fd7a59ddda6673dd12f1e560018faff5426；commit后重新build通过再部署。实际release：/home/cloudray/.local/share/magic-creater/releases/20260927T120733Z。
- verify-deployment退出0：schema3、服务active、源码与release资源一致、已有业务内容摘要与切换前一致、会话重启保留、备份恢复和FK/integrity通过。
- 切换前快照：/home/cloudray/.local/share/magic-creater/upgrades/20260927T120733Z/app.sqlite。实际备份magic-20260927T120748Z.sqlite。验收时users3、classrooms1、projects16、versions2、feedback0、assets0；未写生产测试作品。
- 正式Chromium登录后六张图片加载且字节与源码一致，移动桥试玩成功，前后作品API数据相同，退出登录成功，无pageerror。首次临时验收脚本缺baseURL导致相对图片地址请求Invalid URL，补正确baseURL后通过；应用本身无故障。
- review的Minor已由独立reviewer复核关闭。首页C71冻结交付；C72保持pending，不属于本次已完成能力。
