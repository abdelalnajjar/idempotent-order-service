
curl -X POST "http://localhost:3000/orders" ^
 -H "Content-Type: application/json" ^
 -H "Idempotency-Key: test-123" ^
 -d "{\"customer_id\":\"cust1\",\"item_id\":\"item1\",\"quantity\":1}"
