import os
import sys
import json
import shutil
import tempfile
import subprocess
import traceback
from pathlib import Path
from typing import List, Dict, Tuple, Optional

import markdown
from docx2pdf import convert as docx_to_pdf_convert
try:
    import pythoncom
except ImportError:
    pythoncom = None

def convert_md_to_pdf(md_content: str, output_path: str) -> bool:
    """
    Convert Markdown content to PDF using Pandoc and docx2pdf.
    Requires Pandoc and Microsoft Word installed.
    """
    # Initialize COM for this thread if needed (required for docx2pdf in threads)
    if pythoncom:
        pythoncom.CoInitialize()

    temp_md_path = None
    temp_docx_path = None
    try:
        # Convert output_path to absolute path to avoid cwd issues
        output_path = os.path.abspath(output_path)
        base_dir = os.path.dirname(output_path)
        filename = os.path.splitext(os.path.basename(output_path))[0]
        
        # Create temp MD file
        temp_md_path = os.path.join(base_dir, f"{filename}_temp.md")
        with open(temp_md_path, "w", encoding="utf-8") as f:
            f.write(md_content)
            
        temp_docx_path = os.path.join(base_dir, f"{filename}_temp.docx")
        
        # 1. MD -> DOCX (Pandoc)
        cmd = [
            "pandoc", 
            os.path.basename(temp_md_path), 
            "-o", os.path.basename(temp_docx_path),
            "--metadata", "title=Data Analysis Report",
            "--highlight-style=tango" 
        ]
        
        # check=True ensures exception on failure
        # We use base_dir as cwd, so we must use filenames only for pandoc input/output
        subprocess.run(cmd, check=True, capture_output=True, text=True, cwd=base_dir)
        
        # 2. DOCX -> PDF (docx2pdf)
        # Note: docx2pdf on Windows opens Word in background.
        docx_to_pdf_convert(temp_docx_path, output_path)
        
        return True
        
    except FileNotFoundError:
        print("\n🚨 Error: Pandoc command not found.")
        return False
    except Exception as e:
        print(f"PDF Conversion Error: {e}")
        traceback.print_exc()
        return False
    finally:
        # Cleanup
        try:
            if temp_md_path and os.path.exists(temp_md_path):
                os.remove(temp_md_path)
            if temp_docx_path and os.path.exists(temp_docx_path):
                os.remove(temp_docx_path)
        except Exception:
            pass
        
        # Uninitialize COM
        if pythoncom:
            pythoncom.CoUninitialize()

# 简单的路径唯一化处理
def uniquify_path(path: Path) -> Path:
    if not path.exists():
        return path
    
    stem = path.stem
    suffix = path.suffix
    parent = path.parent
    counter = 1
    
    while True:
        new_path = parent / f"{stem}_{counter}{suffix}"
        if not new_path.exists():
            return new_path
        counter += 1

class WorkspaceTracker:
    """跟踪工作区文件变化并将产物收集到 static/ 目录"""

    def __init__(self, workspace_dir: str, generated_dir: str):
        self.workspace_dir = Path(workspace_dir).resolve()
        self.generated_dir = Path(generated_dir).resolve()
        self.generated_dir.mkdir(parents=True, exist_ok=True)
        self.before_state = self._snapshot()

    def _snapshot(self) -> Dict[Path, Tuple[int, int]]:
        try:
            return {
                p.resolve(): (p.stat().st_size, p.stat().st_mtime_ns)
                for p in self.workspace_dir.rglob("*")
                if p.is_file() and not str(p).startswith(str(self.generated_dir))
            }
        except Exception:
            return {}

    def diff_and_collect(self) -> List[str]:
        """计算新增/修改的文件，复制到 generated/，并返回文件名列表"""
        try:
            after_state = {
                p.resolve(): (p.stat().st_size, p.stat().st_mtime_ns)
                for p in self.workspace_dir.rglob("*")
                if p.is_file() and not str(p).startswith(str(self.generated_dir))
            }
        except Exception:
            after_state = {}

        added = [p for p in after_state.keys() if p not in self.before_state]
        modified = [
            p for p in after_state.keys()
            if p in self.before_state and after_state[p] != self.before_state[p]
        ]

        collected_files = []

        for p in added + modified:
            try:
                # 复制到 generated (static) 目录
                dest = self.generated_dir / p.name
                dest = uniquify_path(dest)
                shutil.move(str(p), str(dest))  # Move instead of copy
                collected_files.append(dest.name)
            except Exception as e:
                print(f"Error moving file {p}: {e}")

        self.before_state = after_state
        return collected_files

def execute_code_safe(code_str: str, workspace_dir: str, timeout_sec: int = 60) -> tuple[str, List[str]]:
    """在独立进程中执行 Python 代码，并返回 (output, new_artifacts)"""
    # 初始化 Tracker（这里是临时的，只是为了diff这次执行的变化）
    # 但实际上外层已经有一个 tracker 了。
    # 如果我们在 execute_code_safe 内部再搞一个，可能会冲突或者重复。
    # 用户的需求是“流式输出”。
    # 现在的逻辑是：Main 进程调用 execute_code_safe -> 等待结束 -> 获取结果 -> Diff文件 -> 发送。
    # 如果要“流式”，需要在 execute_code_safe 运行时，实时捕获 stdout/stderr 并发送。
    # 但 execute_code_safe 是 subprocess.run，是阻塞的。
    # 我们可以改用 subprocess.Popen 并实时读取 stdout。
    
    # 鉴于我们要在 utils 里改，我们先保持签名不变，但改为 generator 或者 callback 模式？
    # 或者我们简单点，先只解决“执行结果”和“文件生成”分步发送的问题。
    # 用户说：“将执行结果和文件生成实时 Streaming 给前端，而非等待全部完成后一次性发送”
    # 这意味着：
    # 1. 执行代码开始 -> 发送 <Execute>...
    # 2. 代码输出 stdout -> 实时发送内容...
    # 3. 代码结束 -> 发送 </Execute>
    # 4. 检查文件 -> 发送 <Files>...</Files>
    
    # 这需要深度修改 execute_code_safe 和 main.py 的调用逻辑。
    # 我们先不改 utils 的签名，而是新增一个 generator 版本的 execute_code_stream
    pass

def execute_code_stream(code_str: str, workspace_dir: str, timeout_sec: int = 60):
    """
    Generator that yields stdout/stderr chunks as they happen.
    """
    exec_cwd = os.path.abspath(workspace_dir)
    os.makedirs(exec_cwd, exist_ok=True)
    tmp_path = None
    
    try:
        fd, tmp_path = tempfile.mkstemp(suffix=".py", dir=exec_cwd)
        os.close(fd)
        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(code_str)

        child_env = os.environ.copy()
        child_env.setdefault("MPLBACKEND", "Agg")
        child_env.pop("DISPLAY", None)
        
        process = subprocess.Popen(
            [sys.executable, tmp_path],
            cwd=exec_cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, # Merge stderr into stdout
            text=True,
            bufsize=1, # Line buffered
            universal_newlines=True,
            env=child_env
        )
        
        # Stream output
        if process.stdout:
            for line in process.stdout:
                yield line
                
        process.wait(timeout=timeout_sec)
        
        if process.returncode != 0:
            yield f"\n[Process exited with code {process.returncode}]"

    except subprocess.TimeoutExpired:
        process.kill()
        yield f"\n[Timeout]: execution exceeded {timeout_sec} seconds"
    except Exception as e:
        yield f"\n[Error]: {str(e)}"
    finally:
        try:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass