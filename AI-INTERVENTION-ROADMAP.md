# AI辅助干预功能开发路线图

## 📋 功能需求概述

用户批准的AI辅助玩家干预功能包含5个主要模块：

1. ✅ **分离故事AI vs 干预AI配置** - 已完成
2. ⏳ **上下文化干预工作流** - 进行中
3. ⏳ **基于实际状态的解释+建议** - 待开发
4. ⏳ **真实预览对比** - 待开发
5. ⏳ **条件干预规则** - 待开发

## ✅ 模块1：AI角色配置分离（已完成）

### 实现内容
- 新增 `AiRole` 类型：`'story' | 'intervention'`
- 每个角色独立配置provider/model/参数
- 支持 `'inherit'` 继承默认配置
- 自动迁移旧格式配置

### 关键文件
- `src/ai/settings.ts` - 扩展配置结构
- `tests/ai-role-config.test.ts` - 配置迁移测试

### 测试结果
✅ **5/5 通过** (100%)
- 旧格式配置迁移
- 新格式配置保留
- inherit选项处理
- 指定provider处理
- 无效配置清理

### 配置结构
```typescript
interface AiSettings {
  story: {
    provider: 'inherit' | AiProviderKind | null;
    deepseek: { model: string; thinking: boolean };
    bailian: { model: string; region: BailianRegion; thinking: boolean };
    openai: { baseUrl: string; model: string };
  };
  intervention: {
    // 同上，默认使用更强模型+思考模式
  };
}
```

## ⏳ 模块2：上下文化干预工作流（规划中）

### 需求分析
- 从地图选中的国家/地区携带上下文
- 用户表达目标（如"让帝国逐步衰落"）
- AI提议有效的结构化干预
- 验证ID/年份/动作
- 处理已灭国家/无效目标

### 技术方案
1. **上下文传递**
   - 扩展 `assistantStore` 携带 `MapSelection`
   - 添加 `getSelectionContext()` 提取国家/地区信息

2. **干预提议系统**
   - 新增 `proposeIntervention` 工具
   - 调用 intervention AI (非 story AI)
   - 返回验证过的干预列表

3. **验证机制**
   - 检查polity/region/settlement稳定键有效性
   - 验证year在合法范围
   - 检查干预kind支持的字段

### 涉及文件（待修改）
- `src/ui/assistantStore.ts` - 添加selection context
- `src/ai/agent/tools.ts` - 添加intervention工具
- `src/gen/civ/interventions.ts` - 验证逻辑复用

### 实现步骤
1. [ ] 扩展assistant state包含selection
2. [ ] 添加intervention角色的tool集合
3. [ ] 实现干预验证函数
4. [ ] UI确认流程
5. [ ] 测试覆盖

## ⏳ 模块3：基于实际状态的解释+建议（待开发）

### 需求
- 问题如"为什么这个国家能平叛成功"应引用实际state/rules
- 避免虚构隐藏原因或不支持的精确结果
- 解释不mutate状态
- 建议保持为提议

### 技术方案
1. **状态查询工具**
   - `queryPolityState(pid, year)` - 国家状态
   - `queryRegionOwnership(region, year)` - 州归属
   - `queryEventHistory(year)` - 史事记录

2. **规则引用系统**
   - 引用 `civ/knobs` 中的实际参数
   - 链接到 `civ/wars.ts` / `unrest.ts` 等逻辑

3. **解释模式**
   - 只读历史数据
   - 不调用干预工具
   - 明确区分"已发生"vs"可能发生"

## ⏳ 模块4：真实预览对比（待开发）

### 需求
- 从相同seed/当前state运行baseline vs intervention
- 显示实际sim结果（领土/国家数等）
- 区分预测vs保证效果
- 预览不mutate已提交历史
- 取消保留原始状态

### 技术挑战
- 需要fork simulation state
- 运行到一致horizon
- 对比机制
- undo/restore路径设计

### 可能方案
1. **临时fork机制**
   - 复制current WorldEdits
   - 添加proposed interventions
   - 重新生成到相同endYear
   - 对比结果

2. **快照系统**
   - 保存pre-intervention state
   - 应用后可restore
   - 或使用git-like分支

3. **UI展示**
   - 并排对比：baseline | intervention
   - 高亮差异：领土变化、国家存亡
   - 时间轴可切换

## ⏳ 模块5：条件干预规则（待开发）

### 需求
- 事件触发器：如"当帝国下次大叛乱时"
- 动作执行：如"让边疆势力独立"
- 确定性、one-shot默认
- 可检视/取消
- 不在每个tick调用model

### 技术方案
1. **触发器词汇表**
   ```typescript
   interface ConditionalIntervention {
     id: string;
     trigger: {
       kind: 'collapse' | 'war_declared' | 'policy_changed';
       target: PolityKey;
       conditions?: Record<string, any>;
     };
     action: Intervention; // 现有干预类型
     armed: boolean;
     fired: boolean;
     author: number; // 作者ID
   }
   ```

2. **执行机制**
   - 在simulation事件发生时检查
   - 匹配trigger条件
   - 插入action到interventions队列
   - 标记fired阻止重复

3. **持久化**
   - 存储在 `WorldEdits.conditionalInterventions`
   - UI列表显示armed/fired状态
   - 可取消未fired的规则

### 限制说明
- 有限的trigger词汇（不支持任意条件）
- 不支持动态脚本执行
- one-shot为主（avoid无限循环）
- 需要author确认才armed

## 📊 当前整体进度

```
模块1: AI角色配置分离     ████████████████████ 100% ✅
模块2: 上下文化干预工作流  ████░░░░░░░░░░░░░░░░  20% ⏳ (规划完成)
模块3: 基于状态的解释      ░░░░░░░░░░░░░░░░░░░░   0% ⏳
模块4: 真实预览对比        ░░░░░░░░░░░░░░░░░░░░   0% ⏳
模块5: 条件干预规则        ░░░░░░░░░░░░░░░░░░░░   0% ⏳
----------------------------------------
总进度:                    ████░░░░░░░░░░░░░░░░  24%
```

## 🎯 下一步行动

1. **立即开始**：实现模块2的step 1-3
   - 扩展assistantStore
   - 添加intervention tools
   - 干预验证函数

2. **测试优先**：每个子功能都写测试
   - 单元测试：validation logic
   - 集成测试：assistant flow
   - E2E测试：完整workflow

3. **增量提交**：功能完成一个提交一个
   - 保持PR可审查
   - 每个commit可独立验证
   - 清晰的commit message

## ⚠️ 已知限制与约束

1. **不在本scope**：
   - ❌ 自治国家AI
   - ❌ 联邦模拟机制
   - ❌ 叛乱平衡调整

2. **技术约束**：
   - Core sim必须在AI disabled时工作
   - 不在repo外购买API服务
   - 测试使用mock provider
   - 不收集新credentials

3. **时间预估**（仅作参考）：
   - 模块2：高复杂度，需深度集成
   - 模块3：中等复杂度，主要是查询层
   - 模块4：高复杂度，需fork/compare机制
   - 模块5：高复杂度，需新持久化系统

## 📝 验证清单

每个模块完成需满足：
- [ ] 功能实现并typecheck通过
- [ ] 单元测试覆盖核心逻辑
- [ ] 集成测试验证end-to-end
- [ ] 提供真实rendered截图（如适用）
- [ ] 明确文档化入口点和用法
- [ ] 报告实际limitations
- [ ] 可复现测试场景
