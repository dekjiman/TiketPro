# War Ticket Load Test (k6)

Load test script untuk mensimulasikan war tiket dengan k6.

## Prerequisites

1. Install k6: https://k6.io/docs/getting-started/installation/
2. Environment variables tersedia:
   - `BASE_URL` - API base URL
   - `CATEGORIES` - JSON array of category IDs
   - `EVENT_ID` - Event ID
   - `QUOTA` - Jumlah quota tiket

## Quick Start

### Command:

```bash
k6 run tests/k6/war-ticket.test.js \
  -e BASE_URL=http://localhost:4000 \
  -e CATEGORIES='["category-cuid-123"]' \
  -e EVENT_ID="event-cuid-456" \
  -e QUOTA=100 \
  -e RATE=500 \
  -e DURATION=10 \
  -e VUS=600
```

### Environment Variables:

| Variable | Default | Description |
|---------|---------|-------------|
| BASE_URL | http://localhost:4000 | API URL |
| CATEGORIES | [] | JSON array of category IDs |
| EVENT_ID | - | Event ID |
| QUOTA | 100 | Expected quota |
| RATE | 500 | Requests per second |
| DURATION | 10s | Test duration |
| VUS | 600 | Pre-allocated VUs |
| MAX_VUS | 700 | Max VUs |
| API_KEY | test-api-key | Admin API key |

## Test Scenario

- **Total VUs**: 600-700 concurrent users
- **Rate**: 500 requests/second
- **Duration**: 10 seconds
- **Total Requests**: ~5000

## Expected Results

| Metric | Target |
|--------|--------|
| Error rate | < 1% |
| P95 latency | < 500ms |
| P99 latency | < 1000ms |
| Ticket sold | ≤ quota (100) |

## Example Output

```
=== War Ticket Load Test Summary ===
Total Requests: 5000
Successful (201): 100 (2.00%)
Sold Out (409): 4899
Other Errors: 1 (0.02%)
Response Time - P50: 45ms, P95: 234ms, P99: 567ms
✅ Anti-oversell: PASS (100 <= 100)
```

## After Test Verification

1. Check database: `SELECT COUNT(*) FROM orders WHERE status = 'PAID'`
2. Compare dengan quota - harus ≤ quota
3. Check Redis: `GET tiket_quota:{categoryId}` - harus 0 atau negative

## Troubleshooting

### "No categories provided"
Pastikan CATEGORIES diisi dengan category ID yang valid.

### Token errors
Pastikan user test sudah terdaftar di sistem.

### Stock not resetting
Cek endpoint admin/stock/reset tersedia atau手动 reset via Redis:
```
SET tiket_quota:{categoryId} 100
SET Tiket_quota_max:{categoryId} 100
```