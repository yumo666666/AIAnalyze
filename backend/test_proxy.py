import httpx
import os
import asyncio

async def test():
    url = "http://127.0.0.1:8000/v1/models"
    print(f"Testing URL: {url}")
    print(f"Env HTTP_PROXY: {os.environ.get('HTTP_PROXY')}")
    print(f"Env HTTPS_PROXY: {os.environ.get('HTTPS_PROXY')}")
    print(f"Env ALL_PROXY: {os.environ.get('ALL_PROXY')}")
    
    try:
        # Test without proxy settings explicitly
        async with httpx.AsyncClient(trust_env=False) as client:
            resp = await client.get(url)
            print(f"Status (trust_env=False): {resp.status_code}")
            print(resp.text[:200])
    except Exception as e:
        print(f"Error (trust_env=False): {e}")

    try:
        # Test with default env
        async with httpx.AsyncClient(trust_env=True) as client:
            resp = await client.get(url)
            print(f"Status (trust_env=True): {resp.status_code}")
    except Exception as e:
        print(f"Error (trust_env=True): {e}")

if __name__ == "__main__":
    asyncio.run(test())
