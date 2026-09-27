# 双玩法行为矩阵

确认来源：用户“按照你的方案…开发”；方案中已明示的默认设计由本轮实施授权细化，选择记录见D21。M2冻结证据见09-m2-verification.md，M3验收记录见11-m3-verification.md。

|ID|基线事实|目标摘要|分类|契约|测试|状态|
|---|---|---|---|---|---|---|
|B21|V1严格单玩法|新V2文档，旧格式语义保留，按类型校验|revised|C21|adventure-document UT、旧game UT|frozen|
|B22|无两玩法模板|各三模板，M2先跑通代表样板|revised|C21|模板验证与样板通关|frozen|
|B23|旧格子只有墙/收集|探索移动、箱子机关、跨房间、任务对话、结局|revised|C22|story UT|frozen|
|B24|无实时游戏|横版跳跃/碰撞/机关/检查点|revised|C23|platform UT和真实浏览器|frozen|
|B25|符号网格|原创美术、可见机关状态、动作与声音反馈|revised|C24|浏览器视觉/输入/声音设置|frozen|
|B26|React卸载停止旧玩法|新样板生命周期和预览隔离|revised|C24|离开重进/失焦暂停/文档不变|frozen|

后续B31编辑器、B41故事编辑、B51素材、B52反馈改编、B61部署为已授权范围占位；详细边界在相应阶段确认，不能提前标tested。

### M2边界补充（D27）
- C22：同房间传送不替换房间入口；交出过的唯一物品不通过另一选项重复领取。
- C23：上升平台相对碰撞，挤压回检查点；弹簧顶部向下穿越触发；静态危险检查点不能发布，死亡帧不保存；占用中的到时门离开后关闭。
- C21：原型保留编号拒绝；NPC试玩需对话；无条件门是合法落点。

## M3（C31–C34，frozen，证据11-m3-verification.md）
|ID|目标|契约|验证|
|---|---|---|---|
|B31a|新旧文档共用API、草稿与冻结版本|C31|creative-document/server/game UT|
|B31b|分层事务、移动复制/引用保护、撤销|C32|adventure-editor/editor-component UT|
|B31c|桌面画布、属性与连线、原位试玩返回|C33|editor-component/document-play/app-draft UT + editor E2E|
|B31d|草稿损坏恢复、离线/冲突/导出导入、横版分享|C34|app-draft UT + editor/workflow E2E|

## M4（C41–C44，frozen，证据13-m4-verification.md）
|ID|目标|契约|验证|
|---|---|---|---|
|B41a|房间、门户、删除引用清理/撤销|C41|story-editor UT、story-editor-component UT、story-editor E2E|
|B41b|对话卡、顺序、选择动作、默认页|C42|story-editor UT、story-editor-component UT、story-editor E2E|
|B41c|any/all、跨房间来源、标记原子改名删除|C43|story-editor UT、story-editor-component UT|
|B41d|三模板创作与同伴完整分享|C44|story-editor E2E、旧workflow/editor回归|

## M5（frozen，D28，契约14-m5-contract.md，证据15-m5-verification.md）
|ID|基线事实/分类|目标|契约|计划验证|
|---|---|---|---|---|
|B51a|asset语法无存储/归属，revised|受限图片、不可变BLOB和版本权限|C51|assets/server-assets UT|
|B51b|导出仅文档、draft仅JSON，revised|含图移植、原子导入/离线字节缓存/恢复|C52|portable/cache/operations UT和E2E|
|B51c|Canvas忽略tint、配件未实现，revised|画板/上传选图和可见配色配件|C53|图片与组件像素UT、双玩法E2E|
|B52a|反馈已固定version，仅文字，revised|主动附位置和该版本地图|C54|server/组件/E2E|
|B52b|无改编授权或来源，revised|主动允许、独立副本与直接来源|C54|server/组件/E2E|

B56：同出口课堂登录限流，C56；12名真实账户同IP、单账号与总量阈值UT通过，反馈按用户限流。

## C71 首页选择
两类玩法/六个起点，机制摘要与实际截图；试玩不创建作品，创作保留模板全部数据，经典玩法和导入保留。详见18-m7-contract.md。C72在M7时为pending；永久删除语义现由D34/C82决定，尚未实现。

## 下一轮方案（基线f9a2030）
|行为|当前证据|目标/状态|决策|
|---|---|---|---|
|B81 地图扩展|document.ts:287上限128×32|有上限持续扩展用户已确认；512→2048×64等参数draft|D32|
|B82 初始化与归属|bootstrap无作品；GET按owner+classroom|新账号空且只展示本人创作decided；首次保存才建服务器项目draft|D33|
|B83 永久删除|无按钮/API|二次确认、不可恢复、确认后永久删除decided，尚未tested|D34 / C82|
|B84 版本演示|此前只有截图|每次版本更新约一分钟视频decided，制作细节draft|D35|

详细证据与方案单一正文：../../design/03-next-iteration-proposal.md；不是新功能已完成记录。

B82/B83/B84及首次保存目标已由D36采纳，状态decided，M8测试后更新；B81分阶段目标采纳，M9/M10进入时细化验证。

C91容量、C92视口索引、C93历史/草稿/摘要、C94性能与发布：accepted/implementing，见22-m9-contract.md。
