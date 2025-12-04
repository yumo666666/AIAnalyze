import os
import json
import asyncio
import logging
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import httpx
from openai import AsyncOpenAI
from dotenv import load_dotenv
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import io
import base64
import traceback
import sys

# 加载环境变量
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(root_dir, '.env')
load_dotenv(dotenv_path=env_path)

BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8080"))

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="DataSight Agent API")

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载静态文件目录，用于访问生成的图表和报告
os.makedirs("output", exist_ok=True)
os.makedirs("uploads", exist_ok=True)
app.mount("/output", StaticFiles(directory="output"), name="output")

# 初始化 OpenAI 客户端
# 创建一个不使用系统代理的 httpx 客户端，并设置超时
http_client = httpx.AsyncClient(trust_env=False, timeout=httpx.Timeout(60.0, connect=10.0))

client = AsyncOpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    base_url=os.getenv("OPENAI_BASE_URL"),
    http_client=http_client
)

# 全局状态存储（简化版，实际应使用数据库或 Redis）
chat_history: List[Dict[str, Any]] = []

class ModelListResponse(BaseModel):
    id: str
    object: str = "model"
    created: int = 1677610602
    owned_by: str = "openai"

class ModelsResponse(BaseModel):
    object: str = "list"
    data: List[ModelListResponse]

@app.get("/v1/models", response_model=ModelsResponse)
async def list_models():
    """
    获取可用模型列表
    """
    try:
        # 尝试从上游获取，如果失败则返回默认
        models = await client.models.list()
        return models
    except Exception as e:
        logger.error(f"获取模型列表失败: {e}")
        # 返回默认模型用于测试
        return ModelsResponse(data=[
            ModelListResponse(id="deepseek-ai/DeepSeek-V3.1-Terminus"),
            ModelListResponse(id="gpt-4o"),
            ModelListResponse(id="claude-3-5-sonnet")
        ])

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    上传文件接口
    """
    file_path = f"uploads/{file.filename}"
    with open(file_path, "wb") as f:
        f.write(await file.read())
    return {"filename": file.filename, "path": file_path}

@app.get("/uploads/{filename}")
async def get_upload(filename: str):
    """
    获取/下载上传的文件
    """
    file_path = os.path.join("uploads", filename)
    if os.path.exists(file_path):
        return FileResponse(file_path, filename=filename)
    else:
        raise HTTPException(status_code=404, detail="File not found")

@app.delete("/files/{filename}")
async def delete_file(filename: str):
    """
    删除上传的文件
    """
    file_path = os.path.join("uploads", filename)
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
            return {"message": f"File {filename} deleted"}
        except Exception as e:
            logger.error(f"Failed to delete file {filename}: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    else:
        raise HTTPException(status_code=404, detail="File not found")

@app.get("/files")
async def list_files():
    """
    列出上传的文件
    """
    files = []
    for filename in os.listdir("uploads"):
        file_path = os.path.join("uploads", filename)
        if os.path.isfile(file_path):
            files.append({
                "name": filename,
                "size": os.path.getsize(file_path),
                "path": file_path
            })
    return files

@app.delete("/outputs/{filename}")
async def delete_output(filename: str):
    """
    删除生成的产物文件
    """
    file_path = os.path.join("output", filename)
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
            return {"message": f"Output {filename} deleted"}
        except Exception as e:
            logger.error(f"Failed to delete output {filename}: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    else:
        raise HTTPException(status_code=404, detail="Output not found")

@app.get("/outputs")
async def list_outputs():
    """
    列出生成的产物文件
    """
    files = []
    if os.path.exists("output"):
        for filename in os.listdir("output"):
            file_path = os.path.join("output", filename)
            if os.path.isfile(file_path):
                files.append({
                    "name": filename,
                    "size": os.path.getsize(file_path),
                    "path": file_path,
                    "url": f"http://127.0.0.1:{BACKEND_PORT}/output/{filename}"
                })
    # 按时间倒序排序
    files.sort(key=lambda x: os.path.getmtime(x["path"]), reverse=True)
    return files

from utils import execute_code_stream, WorkspaceTracker, convert_md_to_pdf

# Agent 系统提示词 (从环境变量加载)
SYSTEM_PROMPT = os.getenv("SYSTEM_PROMPT", "You are DataSight Agent.")
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "160000"))

@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket 聊天接口，实现 Agent 自主循环
    """
    await websocket.accept()
    
    # 初始化工作区跟踪器
    workspace_dir = "uploads"  # 或者使用单独的 workspace 目录，这里复用 uploads 以便读取文件
    # 实际上代码执行目录应该是 uploads，generated 是 output
    tracker = WorkspaceTracker("uploads", "output")
    
    try:
        # 获取当前文件列表 (for initial context)
        current_files = []
        if os.path.exists("uploads"):
             current_files = [f for f in os.listdir("uploads") if os.path.isfile(os.path.join("uploads", f))]
        
        file_context_str = "\n当前系统已上传的文件列表 (位于当前目录):\n" + "\n".join([f"- {f}" for f in current_files]) if current_files else "\n当前暂无已上传文件。"
        
        # 初始化对话历史
        # 注意：这里不再把 file_context_str 放到 system prompt，而是作为 system prompt 的补充，或者 user message 的一部分
        # 为了简单，我们还是放在 system prompt，或者追加到 system prompt
        messages = [{"role": "system", "content": SYSTEM_PROMPT + file_context_str}]
        
        while True:
            # 接收用户消息
            data = await websocket.receive_text()
            user_input = json.loads(data)
            user_message = user_input.get("message", "")
            selected_model = user_input.get("model", "deepseek-ai/DeepSeek-V3.1-Terminus")
            max_steps = int(user_input.get("max_steps", 30))
            
            # 添加用户消息到历史
            # 每次用户发消息，我们都重新扫描一下文件列表，确保最新
            # 也可以把文件列表附在用户消息后面，类似 DeepAnalyze 的 # Data
            current_files = []
            if os.path.exists("uploads"):
                 current_files = [f for f in os.listdir("uploads") if os.path.isfile(os.path.join("uploads", f))]
            
            file_context_update = "\n\n# Data (Current Files):\n(注意：读取文件时请直接使用文件名，不要加 uploads/ 前缀)\n" + "\n".join([f"- {f}" for f in current_files])
            
            full_user_message = f"# Instruction\n{user_message}{file_context_update}"
            
            messages.append({"role": "user", "content": full_user_message})
            
            # Agent 自主循环 (ReAct Loop)
            step_count = 0
            
            while step_count < max_steps:
                step_count += 1
                
                # Notify frontend of step progress
                await websocket.send_json({"type": "step_update", "current": step_count, "max": max_steps})
                
                # ---------------- NEW: Refresh Output Files Context ----------------
                # 在每一步调用 AI 前，先扫描 output 目录，告诉 AI 已经生成了哪些图表
                # 这样 AI 就知道它已经画了什么，可以在报告中引用
                current_outputs = []
                if os.path.exists("output"):
                     current_outputs = [f for f in os.listdir("output") if os.path.isfile(os.path.join("output", f)) and not f.startswith("report_")]
                
                output_context = ""
                if current_outputs:
                    output_context = "\n\n[System Update] 目前已生成的产物文件 (位于 output/ 目录):\n" + "\n".join([f"- {f}" for f in current_outputs])
                    # 将这个上下文临时追加到最后一条消息，或者作为一条新的 system 消息（但 OpenAI 不建议频繁插 system）
                    # 这里我们选择追加到最后一条 user 消息（如果是 user）或者 assistant 消息后面（稍微 hacky）
                    # 最稳妥的方式是追加到 messages 列表里作为一条临时 system 消息，但在发送后移除？
                    # 或者直接 append 到 messages，反正 history 越来越长也没关系，这正是 context。
                    messages.append({"role": "system", "content": output_context})
                # -------------------------------------------------------------------
                
                # If we are nearing the limit, prompt the agent to wrap up
                if step_count == max_steps - 2:
                    messages.append({"role": "user", "content": "Please finish your analysis and generate the final report now using <Answer> tag."})

                logger.info(f"Step {step_count}: Sending request to LLM...")
                # 调用 LLM
                try:
                    response = await client.chat.completions.create(
                        model=selected_model,
                        messages=messages,
                        temperature=0.1,
                        max_tokens=MAX_TOKENS,
                        stream=True
                    )
                except Exception as e:
                    logger.error(f"LLM request failed: {e}")
                    await websocket.send_json({"type": "error", "content": f"LLM request failed: {str(e)}"})
                    break

                logger.info(f"Step {step_count}: Received LLM response stream")
                
                full_content = ""
                # We do NOT send stream_start here anymore, to reduce noise.
                # Instead, we will stream tokens directly, but maybe wrap them in a generic "thinking" or "response" block if needed?
                # But the frontend expects <Tag>... structure.
                # So we just stream the raw tokens, and the frontend parser handles it.
                # However, to support "status=busy", we sent stream_start before.
                # Let's keep sending stream_start ONCE at the beginning of the turn?
                # Actually, the previous loop logic sent stream_start for every chunk? No.
                
                await websocket.send_json({"type": "stream_start"})
                
                async for chunk in response:
                    if chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        full_content += content
                        await websocket.send_json({"type": "stream_token", "content": content})
                
                await websocket.send_json({"type": "stream_end"})
                messages.append({"role": "assistant", "content": full_content})
                
                # 解析 Agent 意图
                tag_type = None
                content_body = ""
                
                # Check for Answer first, as it might be the last step
                if "<Answer>" in full_content:
                     tag_type = "report"
                elif "<Code>" in full_content and "</Code>" in full_content:
                     tag_type = "code"
                     try:
                        start = full_content.find("<Code>") + 6
                        # Handle potential language attribute (though prompt says <Code>)
                        if 'language="python"' in full_content:
                             # ... (This case might be deprecated if we strictly use <Code>)
                             pass
                        end = full_content.find("</Code>")
                        content_body = full_content[start:end].strip()
                     except:
                        content_body = ""
                
                if tag_type == "code" and content_body:
                    # ... (existing code execution logic)
                    await websocket.send_json({"type": "step", "step_type": "executing"})
                    
                    # 使用新的 execute_code_stream 实时流式传输执行结果
                    # 注意：uploads 目录作为 workspace，这样代码可以直接读取 uploads 里的文件
                    
                    # 1. 发送 <Execute> 标签开始
                    await websocket.send_json({"type": "stream_start"})
                    await websocket.send_json({"type": "stream_token", "content": "\n<Execute>\n```\n"})
                    
                    full_execution_output = ""
                    
                    # 2. 实时流式传输 stdout/stderr
                    # 优化：不要每行都发 stream_start/end，只发 token
                    for line in execute_code_stream(content_body, "uploads"):
                        full_execution_output += line
                        await websocket.send_json({"type": "stream_token", "content": line})
                    
                    # 3. 发送 <Execute> 标签结束
                    await websocket.send_json({"type": "stream_token", "content": "\n```\n</Execute>\n"})
                    await websocket.send_json({"type": "stream_end"})
                    
                    # 4. 收集生成的文件并发送 <Files> 标签
                    new_artifacts = tracker.diff_and_collect()
                    files_xml = ""
                    if new_artifacts:
                        files_xml = "\n<Files>\n" + "\n".join([f"output/{f}" for f in new_artifacts]) + "\n</Files>\n"
                        await websocket.send_json({"type": "stream_start"})
                        await websocket.send_json({"type": "stream_token", "content": files_xml})
                        await websocket.send_json({"type": "stream_end"})
                        
                        # --- NEW: Notify frontend to refresh outputs list immediately ---
                        await websocket.send_json({"type": "files_updated"})
                        # ----------------------------------------------------------------
                    
                    # 构建完整的步骤内容用于历史记录
                    full_step_content = f"\n<Execute>\n```\n{full_execution_output}\n```\n</Execute>\n{files_xml}"
                    
                    messages.append({"role": "assistant", "content": full_step_content})
                    
                    # 仅把 execute 部分作为用户反馈（模拟环境输出）
                    # files 部分其实是 system 告知产生的文件，也可以包含
                    messages.append({
                        "role": "user", 
                        "content": full_step_content
                    })
                
                elif tag_type == "report":
                    # 任务完成，保存报告
                    # 即使没有闭合标签，只要有 <Answer> 也尝试提取
                    start = full_content.find("<Answer>") + 8
                    end = full_content.find("</Answer>")
                    
                    if start >= 8:
                        try:
                            if end != -1:
                                report_content = full_content[start:end].strip()
                            else:
                                report_content = full_content[start:].strip() # 提取到最后
                            
                            # ----------------------------
                            # Code Injection Logic
                            # ----------------------------
                            # 1. 收集所有代码片段
                            all_code_snippets = []
                            for msg in messages:
                                if msg.get("role") == "assistant":
                                    content = msg.get("content", "")
                                    if "<Code>" in content and "</Code>" in content:
                                        try:
                                            c_start = content.find("<Code>") + 6
                                            c_end = content.find("</Code>")
                                            code_snippet = content[c_start:c_end].strip()
                                            if code_snippet:
                                                all_code_snippets.append(code_snippet)
                                        except:
                                            pass
                            
                            # 2. 去重：保留顺序
                            unique_code_snippets = list(dict.fromkeys(all_code_snippets))
                            
                            # 3. 注入或追加
                            if unique_code_snippets:
                                full_code = "\n\n# --- Step Code ---\n".join(unique_code_snippets)
                                if "[analysis_code.py]" in report_content:
                                    report_content = report_content.replace("[analysis_code.py]", full_code)
                                else:
                                    # 如果没有占位符，则追加到文件末尾
                                    report_content += "\n\n## 附录：分析代码\n\n```python\n" + full_code + "\n```\n"
                            # ----------------------------

                            import time
                            timestamp = int(time.time())
                            report_filename = f"report_{timestamp}.md"
                            report_path = os.path.join("output", report_filename)
                            
                            with open(report_path, "w", encoding="utf-8") as f:
                                f.write(report_content)
                                
                            # 生成 PDF (防止死锁：替换本地图片路径，并在线程池中运行)
                            pdf_filename = f"report_{timestamp}.pdf"
                            pdf_path = os.path.join("output", pdf_filename)
                            
                            # 替换图片 URL 为本地绝对路径，避免 xhtml2pdf 发起 HTTP 请求导致死锁
                            # 假设 URL 格式为 http://localhost:8080/output/filename.png
                            # 或者 http://127.0.0.1:8080/output/filename.png
                            abs_output_dir = os.path.abspath("output").replace("\\", "/")
                            
                            # 简单的字符串替换
                            pdf_report_content = report_content.replace(f"http://localhost:{BACKEND_PORT}/output/", f"file:///{abs_output_dir}/")
                            pdf_report_content = pdf_report_content.replace(f"http://127.0.0.1:{BACKEND_PORT}/output/", f"file:///{abs_output_dir}/")
                            
                            # 在线程池中运行同步的 convert_md_to_pdf，避免阻塞 Event Loop
                            loop = asyncio.get_event_loop()
                            success = await loop.run_in_executor(None, convert_md_to_pdf, pdf_report_content, pdf_path)
                            
                            if success:
                                logger.info(f"Generated PDF report: {pdf_path}")
                            else:
                                logger.error("Failed to generate PDF report")

                            # 通知前端有新文件
                            await websocket.send_json({"type": "files_updated"})
                        except Exception as e:
                            logger.error(f"Failed to save report: {e}")
                            traceback.print_exc()

                    # 任务完成，跳出所有循环
                    await websocket.send_json({"type": "done"})
                    return # 退出 websocket_endpoint 函数中的 while True 循环 (实际上是 return out of the function, which closes the socket)
                    # 或者 break 到外层循环?
                    # 如果 break 到外层，外层是 while True (等待用户输入)。
                    # 但如果是 report，通常意味着一次任务结束。用户可以继续发消息，所以应该是 break 内层循环。
                    break 
                
                else:
                    # 如果不是 report 也不是 code，可能是 analyze 或 think，让它继续
                    # 但要防止死循环，如果它一直 think 不输出 code
                    if step_count < max_steps:
                         pass
                         # 这里不自动发消息，让 LLM 自己决定是否继续？
                         # 不，LLM 已经停止输出了。我们需要 prompt 它继续。
                         # 除非它在最后输出了 </report> (已经 break 了)
                         # 如果它输出了 </think>，我们需要它继续。
                         # 但在 DeepAnalyze 模式下，如果 LLM 输出了 <Understand>...</Understand>，
                         # 它通常会紧接着输出 <Code> 或者 <Answer>。
                         # 如果它停了，我们必须 nudge 它。
                         # 使用一个空内容的 user message 或者 "Continue"
                         messages.append({"role": "user", "content": "Continue"})
            
            # 如果 max_steps 到了还没 break (report)，也会走到这里
            # 发送 done 信号，告诉前端这一轮 turn 结束了
            await websocket.send_json({"type": "done"})

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await websocket.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=BACKEND_PORT)
