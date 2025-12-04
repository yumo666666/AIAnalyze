import os
import sys
import asyncio
import concurrent.futures
from utils import convert_md_to_pdf

def run_conversion_in_thread(pdf_report_content, output_pdf_path):
    return convert_md_to_pdf(pdf_report_content, output_pdf_path)

async def test_conversion_async():
    md_file_path = r"d:\docker-apps\AIAnalyze\backend\output\report_1764822807.md"
    output_pdf_path = r"d:\docker-apps\AIAnalyze\backend\output\test_report_async_1764822807.pdf"

    print(f"Reading markdown file from: {md_file_path}")
    try:
        with open(md_file_path, "r", encoding="utf-8") as f:
            md_content = f.read()
    except Exception as e:
        print(f"Error reading file: {e}")
        return

    print(f"Starting async conversion to: {output_pdf_path}")
    
    abs_output_dir = os.path.abspath("output").replace("\\", "/")
    pdf_report_content = md_content.replace("http://localhost:8080/output/", f"file:///{abs_output_dir}/")
    pdf_report_content = pdf_report_content.replace("http://127.0.0.1:8080/output/", f"file:///{abs_output_dir}/")

    loop = asyncio.get_running_loop()
    # Simulate exactly what main.py does: loop.run_in_executor(None, ...)
    try:
        success = await loop.run_in_executor(None, run_conversion_in_thread, pdf_report_content, output_pdf_path)
        
        if success:
            print("Async Conversion successful!")
        else:
            print("Async Conversion failed.")
    except Exception as e:
        print(f"Async Conversion Exception: {e}")

if __name__ == "__main__":
    # Add backend directory to sys.path
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    
    # Run async test
    asyncio.run(test_conversion_async())
