#!/usr/bin/env node

import { uploadFile, downloadFile, listRemoteFiles } from './build/index.js';
import { writeFile, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const sshConfig = {
  host: 'example.com',
  port: 22,
  username: 'testuser',
  password: 'testpass',
};

async function testSFTP() {
  console.log('🧪 Testing SFTP Features...\n');

  try {
    // Test 1: List files in home directory
    console.log('📂 Test 1: List files in remote home directory');
    const listResult = await listRemoteFiles(sshConfig, '/home/testuser');
    console.log(listResult.content[0].text);
    console.log('✓ List files successful\n');

    // Test 2: Upload a file
    console.log('📤 Test 2: Upload a test file');
    const testContent = `Test file created at ${new Date().toISOString()}\nHello from SSH MCP SFTP!\n`;
    const localTestFile = join(tmpdir(), 'ssh-mcp-test-upload.txt');
    await writeFile(localTestFile, testContent);
    console.log(`Created local test file: ${localTestFile}`);

    const remoteTestFile = '/home/testuser/ssh-mcp-test-upload.txt';
    const uploadResult = await uploadFile(sshConfig, localTestFile, remoteTestFile);
    console.log(uploadResult.content[0].text);
    console.log('✓ Upload successful\n');

    // Test 3: Download the file back
    console.log('📥 Test 3: Download the uploaded file');
    const localDownloadFile = join(tmpdir(), 'ssh-mcp-test-download.txt');
    const downloadResult = await downloadFile(sshConfig, remoteTestFile, localDownloadFile);
    console.log(downloadResult.content[0].text);

    // Verify content
    const downloadedContent = await readFile(localDownloadFile, 'utf8');
    if (downloadedContent === testContent) {
      console.log('✓ Download successful - content matches!\n');
    } else {
      console.log('✗ Downloaded content does not match');
      console.log('Expected:', testContent);
      console.log('Got:', downloadedContent);
    }

    // Test 4: List files again to see the uploaded file
    console.log('📂 Test 4: Verify uploaded file appears in listing');
    const listResult2 = await listRemoteFiles(sshConfig, '/home/testuser');
    if (listResult2.content[0].text.includes('ssh-mcp-test-upload.txt')) {
      console.log('✓ Uploaded file found in directory listing\n');
    } else {
      console.log('✗ Uploaded file not found in directory listing\n');
    }

    // Cleanup
    console.log('🧹 Cleaning up test files...');
    await unlink(localTestFile);
    await unlink(localDownloadFile);
    console.log('✓ Local files cleaned up');
    console.log('Note: Remote file left at', remoteTestFile, 'for manual cleanup\n');

    console.log('✅ All SFTP tests passed!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testSFTP();
