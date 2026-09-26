# 行为矩阵

当前基线均为“设计已确认、尚无实现”，来源为首版设计及用户本轮实施委托。具体可调整实现选择见决策记录；下表起始状态为 decided，不代表已测试。

| ID | 场景/目标 | 基线 | 契约 | 测试映射 | 状态 |
|---|---|---|---|---|---|
| B01 | 模板与素材编辑；草稿可不完整，试玩/提交要求起终点完整 | confirmed | C01 | shared unit / editor E2E | decided |
| B02 | 撤销重做；新编辑清空重做分支；试玩不改变文档 | confirmed | C01 | history/runtime unit | decided |
| B03 | 边界与墙阻挡，收集后到终点通关，重开恢复 | confirmed | C01 | runtime unit / play E2E | decided |
| B04 | 独立账号、固定角色、会话与来源校验 | confirmed | C02 | auth/app unit / login E2E | decided |
| B05 | 用户隔离的IndexedDB草稿、断网可编辑、文件往返 | confirmed | C03 | draft unit / offline/import E2E | decided |
| B06 | 作者权限、事务修订检查、冲突保留草稿与另存副本 | confirmed | C03 | app/db unit / conflict E2E | decided |
| B07 | 固定提交版本与老师确认、退回、撤回；修改不改已发布内容 | confirmed | C04 | version unit / teacher E2E | decided |
| B08 | 班级内获准版本才可读取；撤回禁止学生直读 | confirmed | C04 | API permission unit / shelf E2E | decided |
| B09 | 反馈绑定版本；作者查看、老师隐藏、普通用户不可读隐藏反馈 | confirmed | C04 | feedback unit / peer loop E2E | decided |
| B10 | 生产单应用、独立数据、重启持久化、备份恢复、运维记录 | confirmed | C05 | config/db unit / live smoke & restore | decided |

延期项遵循目标与非目标页，不用未实施能力支撑验收。
