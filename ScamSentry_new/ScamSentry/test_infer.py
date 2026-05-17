import requests
import time

start_time = time.time()
print("Starting request...")

try:
    response = requests.post(
        "http://localhost:5000/check",
        json={"url": "http://example.com/login", "text": "Please enter your password to continue."},
        timeout=100
    )
    print("Status Code:", response.status_code)
    print("Response:", response.text)
except Exception as e:
    print("Error:", e)

end_time = time.time()
print(f"Elapsed Time: {end_time - start_time:.2f} seconds")
