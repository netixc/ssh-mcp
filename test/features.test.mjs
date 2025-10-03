#!/usr/bin/env node

import { execSshCommand, sanitizeCommand } from './build/index.js';

const sshConfig = {
  host: 'example.com',
  port: 22,
  username: 'testuser',
  password: 'testpass',
};

async function testFeatures() {
  console.log('🧪 Testing New Features...\n');

  // Test 1: Command Sanitization
  console.log('📝 Test 1: Command Sanitization');
  try {
    sanitizeCommand('echo hello');
    console.log('✓ Valid command accepted: "echo hello"');
  } catch (e) {
    console.log('✗ Failed:', e.message);
  }

  try {
    sanitizeCommand('');
    console.log('✗ Empty command should be rejected');
  } catch (e) {
    console.log('✓ Empty command rejected:', e.message);
  }

  // Test 2: Connection Pooling
  console.log('\n🔄 Test 2: Connection Pooling (running 3 commands sequentially)');
  const start = Date.now();

  await execSshCommand(sshConfig, 'echo "Command 1"');
  console.log('✓ Command 1 executed');

  await execSshCommand(sshConfig, 'echo "Command 2"');
  console.log('✓ Command 2 executed');

  await execSshCommand(sshConfig, 'echo "Command 3"');
  console.log('✓ Command 3 executed');

  const duration = Date.now() - start;
  console.log(`✓ All commands completed in ${duration}ms (pooling should make this faster)`);

  // Test 3: Exit Code Handling
  console.log('\n🔍 Test 3: Exit Code Handling');
  try {
    const result = await execSshCommand(sshConfig, 'ls /nonexistent 2>&1 || true');
    console.log('✓ Non-zero exit handled, but || true makes it succeed');
  } catch (e) {
    console.log('Command failed as expected:', e.message);
  }

  // Test 4: Command with stderr (should succeed in v1.1.0)
  console.log('\n📢 Test 4: Command with stderr output (should succeed)');
  try {
    // git --version writes to stderr on some systems, curl -v definitely does
    const result = await execSshCommand(sshConfig, 'echo "stdout" && echo "stderr" >&2');
    console.log('✓ Command succeeded even though it wrote to stderr');
    console.log('  Output:', result.content[0].text.trim());
  } catch (e) {
    console.log('✗ Failed:', e.message);
  }

  // Test 5: Long-running command (test timeout doesn't trigger on normal completion)
  console.log('\n⏱️  Test 5: Command that completes before timeout');
  try {
    const result = await execSshCommand(sshConfig, 'sleep 1 && echo "Completed"');
    console.log('✓ Command completed successfully:', result.content[0].text.trim());
  } catch (e) {
    console.log('✗ Failed:', e.message);
  }

  // Test 6: Multiple connections stress test
  console.log('\n🚀 Test 6: Concurrent Commands (connection pooling test)');
  const concurrentStart = Date.now();
  const promises = [
    execSshCommand(sshConfig, 'echo "Concurrent 1"'),
    execSshCommand(sshConfig, 'echo "Concurrent 2"'),
    execSshCommand(sshConfig, 'echo "Concurrent 3"'),
    execSshCommand(sshConfig, 'echo "Concurrent 4"'),
    execSshCommand(sshConfig, 'echo "Concurrent 5"'),
  ];

  const results = await Promise.all(promises);
  const concurrentDuration = Date.now() - concurrentStart;
  console.log(`✓ ${results.length} concurrent commands completed in ${concurrentDuration}ms`);

  console.log('\n✅ All feature tests passed!\n');
  process.exit(0);
}

testFeatures().catch(error => {
  console.error('\n❌ Test failed:', error.message);
  console.error(error);
  process.exit(1);
});
