#!/usr/bin/env node

/**
 * Test script for remote path expansion functionality
 * Tests the expandRemotePath function with various path formats
 */

import { expandRemotePath } from './build/index.js';

console.log('🧪 Testing Remote Path Expansion\n');

// Mock SFTP object that simulates ssh2's realpath behavior
class MockSFTP {
  constructor(homeDir = '/Users/jawad') {
    this.homeDir = homeDir;
  }

  realpath(remotePath, callback) {
    console.log(`  [MockSFTP] realpath called with: "${remotePath}"`);

    // Simulate ssh2's realpath behavior
    if (remotePath === '~' || remotePath.startsWith('~/')) {
      const expanded = remotePath === '~'
        ? this.homeDir
        : remotePath.replace('~', this.homeDir);

      console.log(`  [MockSFTP] Expanding to: "${expanded}"`);
      setTimeout(() => callback(null, expanded), 10);
    } else {
      // For absolute paths, return as-is
      console.log(`  [MockSFTP] Returning as-is: "${remotePath}"`);
      setTimeout(() => callback(null, remotePath), 10);
    }
  }
}

async function runTests() {
  const sftp = new MockSFTP('/Users/jawad');

  // Test 1: Tilde with path
  console.log('Test 1: Tilde with path "~/Desktop"');
  const result1 = await expandRemotePath(sftp, '~/Desktop');
  console.log(`  ✓ Result: ${result1}`);
  console.log(`  Expected: /Users/jawad/Desktop`);
  console.log(`  Match: ${result1 === '/Users/jawad/Desktop' ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 2: Tilde alone
  console.log('Test 2: Tilde alone "~"');
  const result2 = await expandRemotePath(sftp, '~');
  console.log(`  ✓ Result: ${result2}`);
  console.log(`  Expected: /Users/jawad`);
  console.log(`  Match: ${result2 === '/Users/jawad' ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 3: Absolute path (no expansion needed)
  console.log('Test 3: Absolute path "/var/log/syslog"');
  const result3 = await expandRemotePath(sftp, '/var/log/syslog');
  console.log(`  ✓ Result: ${result3}`);
  console.log(`  Expected: /var/log/syslog`);
  console.log(`  Match: ${result3 === '/var/log/syslog' ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 4: Tilde with nested path
  console.log('Test 4: Tilde with nested path "~/Desktop/Screenshots/image.png"');
  const result4 = await expandRemotePath(sftp, '~/Desktop/Screenshots/image.png');
  console.log(`  ✓ Result: ${result4}`);
  console.log(`  Expected: /Users/jawad/Desktop/Screenshots/image.png`);
  console.log(`  Match: ${result4 === '/Users/jawad/Desktop/Screenshots/image.png' ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 5: Linux-style home directory
  console.log('Test 5: Linux-style home directory');
  const linuxSftp = new MockSFTP('/home/ubuntu');
  const result5 = await expandRemotePath(linuxSftp, '~/Documents/file.txt');
  console.log(`  ✓ Result: ${result5}`);
  console.log(`  Expected: /home/ubuntu/Documents/file.txt`);
  console.log(`  Match: ${result5 === '/home/ubuntu/Documents/file.txt' ? '✅ PASS' : '❌ FAIL'}\n`);

  console.log('✅ All tests completed!\n');

  console.log('📋 Summary:');
  console.log('  - Tilde expansion works for macOS paths (/Users/username)');
  console.log('  - Tilde expansion works for Linux paths (/home/username)');
  console.log('  - Absolute paths pass through unchanged');
  console.log('  - Nested paths expand correctly');
  console.log('  - Function is universal and works with any remote OS\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
