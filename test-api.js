/**
 * API Test Script
 * 
 * This script tests the API endpoints of the server including OpenAI integration
 */

const http = require('http');

// API endpoint to test
const testEndpoints = [
  { path: '/api/test', method: 'GET', name: 'API Test Endpoint' },
  { path: '/api/test-openai', method: 'GET', name: 'OpenAI Config Test' },
  { path: '/api/direct-chat', method: 'POST', name: 'OpenAI Chat Test', 
    body: JSON.stringify({
      message: 'Hello, this is a test message to check if OpenAI integration is working.'
    })
  },
  { path: '/api/auth/register', method: 'POST', name: 'Auth Register', 
    body: JSON.stringify({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123'
    })
  },
  { path: '/', method: 'GET', name: 'Root Path (index.html)' },
  { path: '/test.html', method: 'GET', name: 'Test HTML Page' }
];

// Function to make HTTP request
const makeRequest = (endpoint) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: endpoint.path,
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data.length > 0 ? data.substring(0, 500) + (data.length > 500 ? '... (truncated)' : '') : 'No data',
          endpoint: endpoint
        });
      });
    });
    
    req.on('error', (error) => {
      reject({
        error: error.message,
        endpoint: endpoint
      });
    });
    
    if (endpoint.body) {
      req.write(endpoint.body);
    }
    
    req.end();
  });
};

// Run all tests
async function runTests() {
  console.log('Starting API tests...\n');
  
  let openaiStatus = 'unknown';
  
  for (const endpoint of testEndpoints) {
    try {
      console.log(`Testing: ${endpoint.name} (${endpoint.method} ${endpoint.path})`);
      const result = await makeRequest(endpoint);
      console.log(`  Status: ${result.statusCode}`);
      console.log(`  Response: ${result.data}`);
      
      // Analyze OpenAI test results
      if (endpoint.name === 'OpenAI Chat Test') {
        try {
          const responseData = JSON.parse(result.data);
          if (responseData.success) {
            if (responseData.result && responseData.result.model) {
              if (responseData.result.model === 'fallback' || responseData.result.model === 'error-fallback') {
                openaiStatus = 'fallback';
                console.log('  ⚠️ OpenAI is using FALLBACK response generation');
              } else {
                openaiStatus = 'working';
                console.log('  ✅ OpenAI integration is WORKING with real API');
              }
            }
          } else {
            openaiStatus = 'failed';
            console.log('  ❌ OpenAI chat test FAILED');
          }
        } catch (e) {
          console.log('  Could not parse OpenAI test results');
        }
      }
      
      console.log('');
    } catch (error) {
      console.error(`  ERROR: ${error.error}`);
      console.log('');
      
      if (endpoint.name === 'OpenAI Chat Test') {
        openaiStatus = 'connection-error';
      }
    }
  }
  
  console.log('Tests completed.');
  
  // Show OpenAI status summary
  console.log('\n--- OpenAI Integration Status ---');
  switch (openaiStatus) {
    case 'working':
      console.log('✅ OpenAI API integration is working correctly with a real API key!');
      break;
    case 'fallback':
      console.log('⚠️ OpenAI is using fallback responses - no valid API key');
      console.log('Update api/config.js with a valid OpenAI key to use real AI responses.');
      break;
    case 'failed':
      console.log('❌ OpenAI integration test failed - check server logs for details');
      break;
    case 'connection-error':
      console.log('❌ Could not connect to OpenAI test endpoint - is the server running?');
      break;
    default:
      console.log('❓ OpenAI status could not be determined');
  }
}

runTests();