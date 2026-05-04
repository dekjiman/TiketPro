import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const API_KEY = __ENV.API_KEY || 'test-api-key';

const totalRequests = new Counter('total_requests');
const successfulOrders = new Counter('successful_orders');
const soldOutErrors = new Counter('sold_out_errors');
const otherErrors = new Counter('other_errors');
const responseTime = new Trend('response_time');

const errorRate = new Rate('error_rate');
const soldOutRate = new Rate('sold_out_rate');

export const options = {
  scenarios: {
    war_tiket: {
      executor: 'constant-arrival-rate',
      rate: parseInt(__ENV.RATE || '500'),
      timeUnit: '1s',
      duration: parseInt(__ENV.DURATION || '10s'),
      preAllocatedVUs: parseInt(__ENV.VUS || '600'),
      maxVUs: parseInt(__ENV.MAX_VUS || '700'),
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    'ticket_sold_out': ['count>0'],
  },
};

const categories = JSON.parse(__ENV.CATEGORIES || '[]');
const eventId = __ENV.EVENT_ID || '';
const quota = parseInt(__ENV.QUOTA || '100');

const requestBody = {
  categoryId: '',
  quantity: 1,
  holders: [{ name: '' }],
  idempotencyKey: '',
};

export function setup() {
  console.log('=== War Ticket Load Test Setup ===');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Categories: ${categories.join(', ')}`);
  console.log(`Expected quota: ${quota}`);

  if (categories.length === 0) {
    throw new Error('No categories provided. Set CATEGORIES env var.');
  }

  const categoryId = categories[0];
  console.log(`Testing with category: ${categoryId}`);

  const tokens = [];
  const userCount = 500;
  
  console.log(`Creating ${userCount} test users...`);
  
  for (let i = 0; i < userCount; i++) {
    const email = `loadtest_${i}@test.com`;
    const password = 'Test1234!';
    
    const registerRes = http.post(`${BASE_URL}/api/auth/register`, {
      email,
      name: `Load Test User ${i}`,
      password,
      confirmPassword: password,
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
    });

    if (registerRes.status === 200 || registerRes.status === 201) {
      const loginRes = http.post(`${BASE_URL}/api/auth/login`, {
        email,
        password,
      }, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (loginRes.status === 200) {
        const token = JSON.parse(loginRes.body)?.token;
        if (token) {
          tokens.push(token);
        }
      }
    } else if (registerRes.status === 409) {
      const loginRes = http.post(`${BASE_URL}/api/auth/login`, {
        email,
        password,
      }, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (loginRes.status === 200) {
        const token = JSON.parse(loginRes.body)?.token;
        if (token) {
          tokens.push(token);
        }
      }
    }

    sleep(0.01);
  }

  console.log(`Created ${tokens.length} test users`);

  console.log(`Resetting Redis stock for category ${categoryId} to ${quota}...`);

  const resetRes = http.post(`${BASE_URL}/api/admin/stock/reset`, {
    categoryId,
    quota,
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokens[0]}`,
      'x-api-key': API_KEY,
    },
  });

  console.log(`Stock reset response: ${resetRes.status}`);

  return {
    tokens,
    categoryId,
    eventId,
    quota,
  };
}

export default function (data) {
  const categoryId = data.categoryId;
  const token = data.tokens[Math.floor(Math.random() * data.tokens.length)];
  
  if (!token) {
    console.error('No tokens available');
    return;
  }

  const body = JSON.stringify({
    categoryId,
    quantity: 1,
    holders: [{
      name: `User ${Math.floor(Math.random() * 10000)}`,
    }],
    idempotencyKey: `loadtest_${Date.now()}_${Math.random().toString(36).substring(7)}`,
  });

  const startTime = Date.now();
  
  const res = http.post(`${BASE_URL}/api/orders/create`, body, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  const duration = Date.now() - startTime;
  responseTime.add(duration);
  totalRequests.add(1);

  const status = res.status;

  if (status === 201) {
    successfulOrders.add(1);
    errorRate.add(0);
    soldOutRate.add(0);
  } else if (status === 409) {
    const body = JSON.parse(res.body);
    if (body.error === 'TICKET_SOLD_OUT' || body.message?.includes('sold out')) {
      soldOutErrors.add(1);
      soldOutRate.add(1);
      errorRate.add(0);
    } else {
      otherErrors.add(1);
      errorRate.add(1);
    }
  } else {
    otherErrors.add(1);
    errorRate.add(1);
  }

  check(res, {
    'status is 201 or 409': (r) => r.status === 201 || r.status === 409,
  }) || console.error(`Unexpected status ${status}: ${res.body}`);
}

export function handleSummary(data) {
  const successful = data.metrics.successful_orders?.values?.count || 0;
  const soldOut = data.metrics.sold_out_errors?.values?.count || 0;
  const otherErrors = data.metrics.other_errors?.values?.count || 0;
  const total = data.metrics.total_requests?.values?.count || 0;
  
  const errorPct = total > 0 ? ((otherErrors / total) * 100).toFixed(2) : '0';
  const successPct = total > 0 ? ((successful / total) * 100).toFixed(2) : '0';
  
  const p50 = data.metrics.response_time?.values?.['p(50)']?.toFixed(0) || 'N/A';
  const p95 = data.metrics.response_time?.values?.['p(95)']?.toFixed(0) || 'N/A';
  const p99 = data.metrics.response_time?.values?.['p(99)']?.toFixed(0) || 'N/A';

  console.log('\n=== War Ticket Load Test Summary ===');
  console.log(`Total Requests: ${total}`);
  console.log(`Successful (201): ${successful} (${successPct}%)`);
  console.log(`Sold Out (409): ${soldOut}`);
  console.log(`Other Errors: ${otherErrors} (${errorPct}%)`);
  console.log(`Response Time - P50: ${p50}ms, P95: ${p95}ms, P99: ${p99}ms`);
  
  const expectedQuota = parseInt(__ENV.QUOTA || '100');
  if (successful <= expectedQuota) {
    console.log(`✅ Anti-oversell: PASS (${successful} <= ${expectedQuota})`);
  } else {
    console.log(`❌ Anti-oversell: FAIL (${successful} > ${expectedQuota})`);
  }
  
  return {
    'text': `\nWar Ticket Test Results\nTotal: ${total}\nSuccess: ${successful}\nSold Out: ${soldOut}\nErrors: ${otherErrors}\nP50: ${p50}ms\nP95: ${p95}ms\nP99: ${p99}ms`,
  };
}