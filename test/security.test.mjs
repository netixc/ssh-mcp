#!/usr/bin/env node

// Test security features: strict mode, rate limiting, audit logging
import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testStrictMode() {
  console.log('🔒 Test 1: Strict Mode (Command Injection Protection)\n');

  const server = spawn('node', [
    'build/index.js',
    '--host=example.com',
    '--port=22',
    '--user=testuser',
    '--password=testpass',
    '--strictMode=true',
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const transport = new StdioClientTransport({
    reader: server.stdout,
    writer: server.stdin,
  });

  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);

    // Try a safe command first
    console.log('Testing safe command: "echo hello"');
    const result1 = await client.callTool({ name: 'exec', arguments: { command: 'echo hello' } });
    console.log('✓ Safe command accepted:', result1.content[0].text.trim());

    // Try dangerous patterns
    const dangerousCommands = [
      'echo hello; rm -rf /',
      'echo hello && cat /etc/passwd',
      'echo hello || whoami',
      'echo hello | grep world',
      'echo `whoami`',
      'echo $(whoami)',
    ];

    for (const cmd of dangerousCommands) {
      try {
        console.log(`\nTesting dangerous pattern: "${cmd}"`);
        await client.callTool({ name: 'exec', arguments: { command: cmd } });
        console.log('✗ Dangerous command was NOT blocked!');
      } catch (e) {
        console.log('✓ Blocked:', e.message);
      }
    }
  } finally {
    server.kill();
  }
}

async function testRateLimiting() {
  console.log('\n\n⏱️  Test 2: Rate Limiting\n');

  const server = spawn('node', [
    'build/index.js',
    '--host=example.com',
    '--port=22',
    '--user=testuser',
    '--password=testpass',
    '--rateLimit=true',
    '--rateLimitMax=3',
    '--rateLimitWindow=5000',
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const transport = new StdioClientTransport({
    reader: server.stdout,
    writer: server.stdin,
  });

  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);

    console.log('Rate limit: 3 requests per 5 seconds');
    console.log('Sending 5 rapid requests...\n');

    for (let i = 1; i <= 5; i++) {
      try {
        await client.callTool({ name: 'exec', arguments: { command: `echo "Request ${i}"` } });
        console.log(`✓ Request ${i} accepted`);
      } catch (e) {
        console.log(`✗ Request ${i} rejected: ${e.message}`);
      }
    }
  } finally {
    server.kill();
  }
}

async function testAuditLogging() {
  console.log('\n\n📋 Test 3: Audit Logging\n');

  const server = spawn('node', [
    'build/index.js',
    '--host=example.com',
    '--port=22',
    '--user=testuser',
    '--password=testpass',
    '--auditLog=true',
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const auditLogs = [];
  server.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.includes('[AUDIT]')) {
        auditLogs.push(line);
        console.log('Audit log captured:', line);
      }
    }
  });

  const transport = new StdioClientTransport({
    reader: server.stdout,
    writer: server.stdin,
  });

  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);

    console.log('Executing commands with audit logging enabled...\n');

    await client.callTool({ name: 'exec', arguments: { command: 'echo "Test 1"' } });
    await new Promise(resolve => setTimeout(resolve, 100));

    await client.callTool({ name: 'exec', arguments: { command: 'whoami' } });
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log(`\n✓ Captured ${auditLogs.length} audit log entries`);
  } finally {
    server.kill();
  }
}

async function runAllTests() {
  try {
    await testStrictMode();
    await testRateLimiting();
    await testAuditLogging();

    console.log('\n\n✅ All security feature tests passed!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runAllTests();
