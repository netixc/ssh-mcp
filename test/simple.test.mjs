#!/usr/bin/env node

import { execSshCommand } from './build/index.js';

const sshConfig = {
  host: 'example.com',
  port: 22,
  username: 'testuser',
  password: 'testpass',
};

async function runTests() {
  console.log('🧪 Testing SSH MCP Server Connection...\n');
  console.log(`Connecting to: ${sshConfig.username}@${sshConfig.host}:${sshConfig.port}\n`);

  try {
    // Test 1: whoami
    console.log('Test 1: Running "whoami"...');
    const result1 = await execSshCommand(sshConfig, 'whoami');
    console.log('✓ Result:', result1.content[0].text.trim());

    // Test 2: hostname
    console.log('\nTest 2: Running "hostname"...');
    const result2 = await execSshCommand(sshConfig, 'hostname');
    console.log('✓ Result:', result2.content[0].text.trim());

    // Test 3: uname -a
    console.log('\nTest 3: Running "uname -a"...');
    const result3 = await execSshCommand(sshConfig, 'uname -a');
    console.log('✓ Result:', result3.content[0].text.trim());

    // Test 4: pwd
    console.log('\nTest 4: Running "pwd"...');
    const result4 = await execSshCommand(sshConfig, 'pwd');
    console.log('✓ Result:', result4.content[0].text.trim());

    // Test 5: ls -la (current directory)
    console.log('\nTest 5: Running "ls -la | head -5"...');
    const result5 = await execSshCommand(sshConfig, 'ls -la | head -5');
    console.log('✓ Result:\n', result5.content[0].text);

    // Test 6: uptime
    console.log('Test 6: Running "uptime"...');
    const result6 = await execSshCommand(sshConfig, 'uptime');
    console.log('✓ Result:', result6.content[0].text.trim());

    console.log('\n✅ All tests passed! SSH MCP Server is working correctly.\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  }
}

runTests();
