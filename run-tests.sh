#!/bin/bash

# Super Wings Simulator - Automated Test Runner
# This script tests all backend API endpoints

echo "🧪 Super Wings Simulator - API Test Suite"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
TOTAL=0

# Test function
test_api() {
    local name=$1
    local method=${2:-GET}
    local endpoint=$3
    local data=$4

    TOTAL=$((TOTAL + 1))
    echo -n "Testing: $name ... "

    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "http://localhost:8000$endpoint" 2>/dev/null)
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "http://localhost:8000$endpoint" 2>/dev/null)
    fi

    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | head -n -1)

    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗ FAIL${NC} (HTTP $http_code)"
        FAILED=$((FAILED + 1))
        if [ ! -z "$body" ]; then
            echo "  Response: $(echo $body | head -c 100)"
        fi
    fi
}

# Check if backend is running
echo "Checking backend connection..."
if ! curl -s http://localhost:8000/api/v1/health > /dev/null 2>&1; then
    echo -e "${RED}❌ Backend is not running!${NC}"
    echo ""
    echo "Please start the backend first:"
    echo "  cd backend"
    echo "  python -m uvicorn main:app --reload --port 8000"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ Backend is running${NC}"
echo ""

# ==========================================
# Characters API Tests
# ==========================================
echo "📚 Testing Characters API..."
echo "----------------------------------------"

test_api "Get all characters" GET "/api/v1/characters"
test_api "Search characters" GET "/api/v1/characters/search/semantic?query=flight"
test_api "Get character by ID" GET "/api/v1/characters/jett"
test_api "Get character abilities" GET "/api/v1/characters/jett/abilities"
test_api "Get character visual config" GET "/api/v1/characters/jett/visual"
test_api "Filter by ability" GET "/api/v1/characters/by-ability/Speed%20Delivery"
test_api "Get best character for mission" GET "/api/v1/dispatch/best-for/delivery"

echo ""

# ==========================================
# Missions API Tests
# ==========================================
echo "🎯 Testing Missions API..."
echo "----------------------------------------"

test_api "Generate mission" POST "/api/v1/missions/generate" '{"level": 1}'
test_api "Get active missions" GET "/api/v1/missions/active"

# Start a mission session for testing
echo -n "Creating test mission session... "
session_response=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d '{"mission_type":"delivery","location":"Paris","problem_description":"Test mission","character_id":"jett"}' \
    "http://localhost:8000/api/v1/missions/start" 2>/dev/null)

session_id=$(echo "$session_response" | grep -o '"session_id":"[^"]*"' | cut -d'"' -f4)

if [ ! -z "$session_id" ]; then
    echo -e "${GREEN}✓${NC} Session: $session_id"

    test_api "Get mission progress" GET "/api/v1/missions/progress/$session_id"
    test_api "Advance mission phase" POST "/api/v1/missions/advance/$session_id" '{}'
    test_api "Delete mission session" DELETE "/api/v1/missions/$session_id"
else
    echo -e "${RED}✗ Failed to create session${NC}"
    FAILED=$((FAILED + 3))
    TOTAL=$((TOTAL + 3))
fi

echo ""

# ==========================================
# Content API Tests
# ==========================================
echo "✨ Testing Content API..."
echo "----------------------------------------"

test_api "Generate mission content" POST "/api/v1/content/mission" \
    '{"mission_type":"delivery","location":"Paris","difficulty":"easy"}'

test_api "Generate location" POST "/api/v1/content/location" \
    '{"location_name":"Paris","context":"mission"}'

test_api "Generate event" POST "/api/v1/content/event" \
    '{"context":"in_flight","difficulty":1}'

test_api "Get mission types" GET "/api/v1/content/mission-types"

echo ""

# ==========================================
# Tutorial API Tests
# ==========================================
echo "📖 Testing Tutorial API..."
echo "----------------------------------------"

test_api "Get character tutorial" GET "/api/v1/tutorial/character/jett"
test_api "Get mission type tutorial" GET "/api/v1/tutorial/mission-type/delivery"

test_api "Explain concept" POST "/api/v1/tutorial/explain" \
    '{"topic":"fuel_management","language":"en"}'

test_api "Get hint" POST "/api/v1/tutorial/hint" \
    '{"topic":"mission_board","current_situation":"stuck","language":"en"}'

test_api "Get tutorial types" GET "/api/v1/tutorial/types"

echo ""

# ==========================================
# Assets API Tests
# ==========================================
echo "🎨 Testing Assets API..."
echo "----------------------------------------"

test_api "Get asset status" GET "/api/v1/assets/status"
test_api "Get available characters" GET "/api/v1/assets/characters"
test_api "Get available locations" GET "/api/v1/assets/locations"
test_api "Get quality levels" GET "/api/v1/assets/quality-levels"
test_api "Get mission icons" GET "/api/v1/assets/mission-icons"
test_api "Get sky types" GET "/api/v1/assets/sky-types"
test_api "Get generation progress" GET "/api/v1/assets/progress"

echo ""

# ==========================================
# Sound API Tests
# ==========================================
echo "🔊 Testing Sound API..."
echo "----------------------------------------"

test_api "Get sound status" GET "/api/v1/sound/status"
test_api "Get sound categories" GET "/api/v1/sound/categories"
test_api "Get UI sound types" GET "/api/v1/sound/types/ui"

echo ""

# ==========================================
# Results Summary
# ==========================================
echo "=========================================="
echo "📊 TEST RESULTS SUMMARY"
echo "=========================================="
echo ""
echo "Total Tests:  $TOTAL"
echo -e "Passed:       ${GREEN}$PASSED${NC}"
echo -e "Failed:       ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed!${NC}"
    SUCCESS_RATE=100
else
    SUCCESS_RATE=$((PASSED * 100 / TOTAL))
    echo -e "${YELLOW}⚠️  $FAILED test(s) failed${NC}"
fi

echo "Success Rate: ${SUCCESS_RATE}%"
echo ""

# Exit with appropriate code
if [ $FAILED -eq 0 ]; then
    exit 0
else
    exit 1
fi
