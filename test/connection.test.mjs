#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

const serverProcess = spawn('node', [
  'build/index.js',
  '--host=example.com',
  '--port=22',
  '--user=testuser',
  '--password=testpass',
  '--debug=true'
]);

const transport = new StdioClientTransport({
  command: serverProcess,
});

const client = new Client(
  {
    name: 'ssh-mcp-test-client',
    version: '1.0.0',
  },
  {
    capabilities: {},
  }
);

async function test() {
  try {
    console.log('Connecting to SSH MCP Server...');
    await client.connect(transport);
    console.log('✓ Connected to SSH MCP Server');

    console.log('\nListing available tools...');
    const tools = await client.listTools();
    console.log('✓ Available tools:', tools.tools.map(t => t.name).join(', '));

    console.log('\nTesting basic command: whoami');
    const result = await client.callTool({
      name: 'exec',
      arguments: {
        command: 'whoami'
      }
    });
    console.log('✓ Command result:', result.content[0].text.trim());

    console.log('\nTesting command: uname -a');
    const result2 = await client.callTool({
      name: 'exec',
      arguments: {
        command: 'uname -a'
      }
    });
    console.log('✓ System info:', result2.content[0].text.trim());

    console.log('\nTesting command: pwd');
    const result3 = await client.callTool({
      name: 'exec',
      arguments: {
        command: 'pwd'
      }
    });
    console.log('✓ Current directory:', result3.content[0].text.trim());

    console.log('\n✅ All tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

test();
