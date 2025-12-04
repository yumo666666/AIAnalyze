import asyncio
import websockets
import json
import requests

async def test_ws():
    uri = "ws://127.0.0.1:8080/ws/chat"
    try:
        async with websockets.connect(uri) as websocket:
            print("WS Connected")
            await websocket.send(json.dumps({"message": "Test message", "model": "test-model"}))
            
            while True:
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=5)
                    data = json.loads(message)
                    print(f"Received: {data.get('type')}")
                    if data.get('type') == 'done':
                        break
                    if data.get('type') == 'stream_end':
                        # Break early for test
                        pass
                except asyncio.TimeoutError:
                    print("Timeout waiting for response")
                    break
    except Exception as e:
        print(f"WS Error: {e}")

def test_api():
    try:
        res = requests.get("http://127.0.0.1:8080/v1/models")
        print(f"Models API: {res.status_code}")
        
        res = requests.get("http://127.0.0.1:8080/files")
        print(f"Files API: {res.status_code}")
    except Exception as e:
        print(f"API Error: {e}")

if __name__ == "__main__":
    test_api()
    # WS test might fail if LLM is not running on port 8000, but we can check connection at least
    # asyncio.run(test_ws())
