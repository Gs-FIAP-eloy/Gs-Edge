"""
Test script for IoT Band Data API
Run this after starting the API to test all endpoints.
"""

import requests
import json
import time

BASE_URL = "http://localhost:8000"

def print_response(title: str, response: requests.Response):
    """Pretty print API response."""
    print(f"\n{'='*60}")
    print(f"📌 {title}")
    print(f"{'='*60}")
    print(f"Status: {response.status_code}")
    try:
        print(json.dumps(response.json(), indent=2))
    except:
        print(response.text)

def test_health():
    """Test health endpoint."""
    response = requests.get(f"{BASE_URL}/health")
    print_response("Health Check", response)
    return response.status_code == 200

def test_status():
    """Test status endpoint."""
    response = requests.get(f"{BASE_URL}/status")
    print_response("MQTT Status", response)
    return response.status_code == 200

def test_current_state():
    """Test current state endpoint."""
    response = requests.get(f"{BASE_URL}/api/band/current")
    print_response("Current Band State", response)
    return response.status_code == 200

def test_statistics():
    """Test statistics endpoint."""
    response = requests.get(f"{BASE_URL}/api/band/statistics")
    print_response("Band Statistics", response)
    return response.status_code == 200

def test_alerts():
    """Test alerts endpoint."""
    response = requests.get(f"{BASE_URL}/api/band/alerts")
    print_response("Current Alerts", response)
    return response.status_code == 200

def test_alert_history():
    """Test alert history endpoint."""
    response = requests.get(f"{BASE_URL}/api/band/alerts/history")
    print_response("Alert History", response)
    return response.status_code == 200

def test_reset():
    """Test reset endpoint."""
    response = requests.post(f"{BASE_URL}/api/band/reset")
    print_response("Reset Data", response)
    return response.status_code == 200

def test_root():
    """Test root endpoint."""
    response = requests.get(f"{BASE_URL}/")
    print_response("API Info", response)
    return response.status_code == 200

def main():
    """Run all tests."""
    print("\n🧪 Starting API Tests...")
    print(f"📍 Base URL: {BASE_URL}")
    
    tests = [
        ("Root Endpoint", test_root),
        ("Health Check", test_health),
        ("MQTT Status", test_status),
        ("Current Band State", test_current_state),
        ("Band Statistics", test_statistics),
        ("Current Alerts", test_alerts),
        ("Alert History", test_alert_history),
        ("Reset Data", test_reset),
    ]
    
    results = []
    for name, test_func in tests:
        try:
            result = test_func()
            results.append((name, "✅ PASS" if result else "❌ FAIL"))
            time.sleep(0.5)  # Small delay between requests
        except requests.exceptions.ConnectionError:
            print(f"\n❌ Connection Error: Cannot connect to {BASE_URL}")
            print("Make sure the API is running: python api.py")
            return
        except Exception as e:
            results.append((name, f"❌ ERROR: {str(e)}"))
    
    # Summary
    print(f"\n{'='*60}")
    print("📊 Test Summary")
    print(f"{'='*60}")
    for name, result in results:
        print(f"{name:.<40} {result}")
    
    passed = sum(1 for _, r in results if "PASS" in r)
    total = len(results)
    print(f"\n✅ Passed: {passed}/{total}")

if __name__ == "__main__":
    main()
