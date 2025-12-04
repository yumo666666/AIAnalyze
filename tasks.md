# DataSight Agent 项目任务清单

## 1. 项目初始化
- [x] 创建项目目录结构 (frontend, backend)
- [x] 创建虚拟环境并安装后端依赖
- [x] 初始化前端项目

## 2. 后端开发 (FastAPI + Agent)
- [x] 搭建 FastAPI 基础框架
- [x] 实现模型列表获取接口 (对接 127.0.0.1:8000)
- [x] 实现 Agent 核心逻辑 (ReAct Loop)
- [x] 实现 MCP 工具层 (文件读写, 代码执行)
- [x] 实现 WebSocket/SSE 流式通信
- [x] 修复代理导致无法连接本地模型的问题
- [x] 优化 System Prompt，增强路径处理能力
- [x] 修复代码执行路径找不到的问题
- [x] 实现文件删除接口 (DELETE /files/{filename})
- [x] 更改产物保存目录为 output，并自动保存报告 (MD)
- [x] 实现产物列表接口 (GET /outputs)
- [x] 优化代码执行产物展示，引入 `<Files>` 标签
- [x] 实现分析产物删除接口 (DELETE /outputs/{filename})
- [x] 重构配置：System Prompt 和 Max Tokens 移至 .env
- [x] 优化后端逻辑：分离 `<Files>` 标签发送
- [x] 增强数据分析能力：Prompt 增加 scipy, statsmodels 支持 (SPSS风格)
- [x] 优化代码执行：实现实时流式输出 (Streaming Execution Output)
- [x] 修复 Matplotlib 中文乱码问题 (System Prompt 强制注入配置)
- [x] 优化流式传输：减少不必要的 WebSocket 消息开销

## 3. 前端开发 (WebUI)
- [x] 搭建页面布局 (左侧资源, 右侧对话)
- [x] 实现文件上传与管理组件 (支持拖拽，固定高度)
- [x] 实现对话流组件 (5种原子步骤渲染)
- [x] 对接后端 API 和 WebSocket
- [x] 实现动态模型列表下拉框
- [x] 修复流式渲染重复问题
- [x] 优化标签解析逻辑
- [x] 实现文件删除功能
- [x] 前端左侧增加产物 (output) 文件展示和管理
- [x] 实现对话历史自动保存与加载 (localStorage)
- [x] 实现对话中断功能
- [x] 优化 UI 响应速度 (点击发送即反馈)
- [x] 实现代码执行产物 (图片/文件) 的实时预览
- [x] 实现分析产物的删除功能
- [x] 实现上传文件的查看/下载功能
- [x] 实现对话步骤自动折叠/展开 (智能跟随)
- [x] 优化 `<Files>` 标签渲染展示
- [x] 修复代码块过长导致页面横向溢出的问题 (使用自动换行)

## 4. 联调与测试
- [x] 测试 Agent 对话流程
- [x] 测试文件上传与代码执行
- [x] 验证最终报告生成

## 5. 优化与交付
- [ ] 优化 UI 交互 (自动滚动, 高亮)
- [ ] 编写使用文档
