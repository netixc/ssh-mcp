# SSH MCP Server

[![NPM Version](https://img.shields.io/npm/v/ssh-mcp)](https://www.npmjs.com/package/ssh-mcp)
[![Downloads](https://img.shields.io/npm/dm/ssh-mcp)](https://www.npmjs.com/package/ssh-mcp)
[![Node Version](https://img.shields.io/node/v/ssh-mcp)](https://nodejs.org/)
[![License](https://img.shields.io/github/license/tufantunc/ssh-mcp)](./LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/tufantunc/ssh-mcp?style=social)](https://github.com/tufantunc/ssh-mcp/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/tufantunc/ssh-mcp?style=social)](https://github.com/tufantunc/ssh-mcp/forks)
[![Build Status](https://github.com/tufantunc/ssh-mcp/actions/workflows/publish.yml/badge.svg)](https://github.com/tufantunc/ssh-mcp/actions)
[![GitHub issues](https://img.shields.io/github/issues/tufantunc/ssh-mcp)](https://github.com/tufantunc/ssh-mcp/issues)

[![Trust Score](https://archestra.ai/mcp-catalog/api/badge/quality/tufantunc/ssh-mcp)](https://archestra.ai/mcp-catalog/tufantunc__ssh-mcp)

**SSH MCP Server** is a local Model Context Protocol (MCP) server that exposes SSH control for Linux and Windows systems, enabling LLMs and other MCP clients to execute shell commands securely via SSH.

## Contents

- [Quick Start](#quick-start)
- [Features](#features)
- [Installation](#installation)
- [Client Setup](#client-setup)
- [Testing](#testing)
- [Disclaimer](#disclaimer)
- [Support](#support)

## Quick Start

- [Install](#installation) SSH MCP Server
- [Configure](#configuration) SSH MCP Server
- [Set up](#client-setup) your MCP Client (e.g. Claude Desktop, Cursor, etc)
- Execute remote shell commands on your Linux or Windows server via natural language

## Features

- **MCP-compliant server** exposing SSH and SFTP capabilities
- **Execute shell commands** on remote Linux and Windows systems
- **File transfer via SFTP** - upload, download, and list files
- **Secure authentication** via password or SSH key
- Built with TypeScript and the official MCP SDK
- **Configurable timeout protection** with automatic process abortion
- **Graceful timeout handling** - attempts to kill hanging processes before closing connections
- **Connection pooling** for better performance on repeated operations

### Tools

#### 1. **`exec`** - Execute Shell Commands
Execute any shell command on the remote server and get the output.

- **Parameters:**
  - `command` (required): Shell command to execute
- **Use Cases:** System monitoring, file management, process control, running scripts
- **Examples:**
  - Check disk space: `df -h`
  - View logs: `tail -f /var/log/syslog`
  - Process management: `ps aux | grep nginx`
- **Configuration:**
  - Timeout: `--timeout=60000` (default: 1 minute)
  - Max length: `--maxChars=1000` (set to `none` for unlimited)
  - Strict mode: `--strictMode=true` (blocks dangerous patterns)

#### 2. **`upload`** - Upload Files to Server
Transfer files from your local machine to the remote server via SFTP.

- **Parameters:**
  - `localPath` (required): Absolute path to local file
  - `remotePath` (required): Absolute destination path on server
- **Use Cases:** Deploy configs, upload scripts, transfer data, push backups
- **Examples:**
  - Upload config: `localPath=/tmp/nginx.conf`, `remotePath=/etc/nginx/nginx.conf`
  - Deploy script: `localPath=./deploy.sh`, `remotePath=/home/user/deploy.sh`
- **Notes:** Supports files of any size, parent directory must exist

#### 3. **`download`** - Download Files from Server
Retrieve files from the remote server to your local machine via SFTP.

- **Parameters:**
  - `remotePath` (required): Absolute path to remote file
  - `localPath` (required): Absolute path where file will be saved locally
- **Use Cases:** Fetch logs, download backups, retrieve data files, pull configs
- **Examples:**
  - Download log: `remotePath=/var/log/app.log`, `localPath=/tmp/app.log`
  - Get backup: `remotePath=~/backup.tar.gz`, `localPath=./backup.tar.gz`
- **Notes:** Supports files of any size, local directory must exist

#### 4. **`listFiles`** - List Remote Directory
List all files and directories in a remote path with detailed information.

- **Parameters:**
  - `remotePath` (required): Absolute path to remote directory
- **Use Cases:** Browse filesystem, find files, verify uploads, explore directories
- **Returns:** File type (file/dir), size in bytes, last modified timestamp
- **Examples:**
  - List home: `remotePath=/home/user`
  - Browse logs: `remotePath=/var/log`

### Security Features

- **Command Sanitization**: Validates and sanitizes all commands before execution
- **Strict Mode**: Optional protection against command injection (`--strictMode=true`)
- **Rate Limiting**: Configurable request rate limiting to prevent abuse
- **Audit Logging**: Optional logging of all executed commands with timestamps and exit codes
- **Connection Pooling**: Reuse SSH connections for better performance
- **Environment Variable Support**: Configure via environment variables instead of CLI args

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/tufantunc/ssh-mcp.git
   cd ssh-mcp
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```

## Client Setup

You can configure Claude Desktop to use this MCP Server.

**Required Parameters:**
- `host`: Hostname or IP of the Linux or Windows server
- `user`: SSH username

**Optional Parameters:**
- `port`: SSH port (default: 22)
- `password`: SSH password (or use `key` for key-based auth)
- `key`: Path to private SSH key
- `timeout`: Command execution timeout in milliseconds (default: 60000ms = 1 minute)
- `maxChars`: Maximum allowed characters for the `command` input (default: 1000). Use `none` or `0` to disable the limit.
- `strictMode`: Enable command injection protection (default: false). Set to `true` to block dangerous patterns.
- `rateLimit`: Enable rate limiting (default: true). Set to `false` to disable.
- `rateLimitMax`: Maximum requests per window (default: 10)
- `rateLimitWindow`: Rate limit window in milliseconds (default: 60000ms = 1 minute)
- `auditLog`: Enable audit logging (default: false). Set to `true` to log all commands to stderr.
- `debug`: Enable debug mode (default: false). Set to `true` for verbose logging.
- `pool`: Enable connection pooling (default: true). Set to `false` to disable.
- `poolMaxSize`: Maximum pooled connections (default: 3)
- `poolTtl`: Connection pool TTL in milliseconds (default: 300000ms = 5 minutes)

**Environment Variables:**
All configuration options can be set via environment variables using the `SSH_MCP_` prefix:
- `SSH_MCP_HOST`, `SSH_MCP_PORT`, `SSH_MCP_USER`, `SSH_MCP_PASSWORD`, `SSH_MCP_KEY`
- `SSH_MCP_TIMEOUT`, `SSH_MCP_MAX_CHARS`, `SSH_MCP_STRICT_MODE`
- `SSH_MCP_RATE_LIMIT`, `SSH_MCP_RATE_LIMIT_MAX`, `SSH_MCP_RATE_LIMIT_WINDOW`
- `SSH_MCP_AUDIT_LOG`, `SSH_MCP_DEBUG`
- `SSH_MCP_POOL`, `SSH_MCP_POOL_MAX_SIZE`, `SSH_MCP_POOL_TTL`


```commandline
{
    "mcpServers": {
        "ssh-mcp": {
            "command": "npx",
            "args": [
                "ssh-mcp",
                "-y",
                "--",
                "--host=1.2.3.4",
                "--port=22",
                "--user=root",
                "--password=pass",
                "--key=path/to/key",
                "--timeout=30000",
                "--maxChars=none"
            ]
        }
    }
}
```

## Examples

See the [examples](./examples) directory for:
- [Basic Usage](./examples/basic-usage.md) - Getting started with SSH commands
- [Advanced Configuration](./examples/advanced-config.md) - All configuration options
- [Security Best Practices](./examples/security-best-practices.md) - Secure your setup

### Quick SFTP Examples

**Upload a file:**
```
"Upload /tmp/config.json to /home/user/app/config.json"
```

**Download a log file:**
```
"Download /var/log/nginx/access.log to /tmp/access.log"
```

**List files in directory:**
```
"List all files in /var/www/html"
```

**Download a screenshot (like in our tests):**
```
"Download the screenshot from ~/Desktop to /tmp/"
```

## Testing

You can use the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) for visual debugging of this MCP Server.

```sh
npm run inspect
```

Run the test suite:
```sh
npm test
```

## Troubleshooting

### Connection Timeout
**Problem:** Commands timeout before completion
**Solution:** Increase the timeout value:
```bash
--timeout=120000  # 2 minutes
```

### Authentication Failures
**Problem:** "Permission denied" or authentication errors
**Solutions:**
- Verify SSH key permissions: `chmod 600 ~/.ssh/id_rsa`
- Test SSH connection manually: `ssh -i ~/.ssh/id_rsa user@host`
- Check SSH server logs: `sudo tail -f /var/log/auth.log`
- Verify user exists on remote server
- Try password authentication to rule out key issues

### Rate Limit Exceeded
**Problem:** "Rate limit exceeded" errors
**Solution:** Increase rate limit or disable:
```bash
--rateLimitMax=20  # Allow 20 requests per minute
# or disable entirely:
--rateLimit=false
```

### Command Contains Dangerous Pattern
**Problem:** Command rejected in strict mode
**Solution:** Disable strict mode or restructure command:
```bash
# Disable strict mode:
--strictMode=false

# Or restructure command (instead of: ls | grep foo):
--strictMode=true
# Ask LLM to use: ls -la | grep foo  (will be rejected)
# Instead ask: "find files matching foo"  (LLM uses: find . -name '*foo*')
```

### Stderr Output Treated as Error
**Issue:** Some commands write to stderr but succeed
**Status:** ✅ Fixed in v1.1.0 - now only rejects on non-zero exit codes

### Connection Pool Issues
**Problem:** Stale connections or "connection closed" errors
**Solution:** Reduce pool TTL or disable pooling:
```bash
--poolTtl=60000  # 1 minute
# or disable:
--pool=false
```

### Debug Mode
Enable debug logging to troubleshoot issues:
```bash
--debug=true
```

Debug logs are written to stderr and include:
- Connection attempts
- Command sanitization
- Rate limit checks
- Pool operations

## Security Considerations

⚠️ **Important Security Notes:**

1. **Credential Storage**: Never hardcode passwords in configuration files. Use SSH keys or environment variables.

2. **Command Injection**: Enable strict mode (`--strictMode=true`) to block potentially dangerous command patterns.

3. **Rate Limiting**: Keep rate limiting enabled in production to prevent abuse.

4. **Audit Logging**: Enable audit logging (`--auditLog=true`) for compliance and security monitoring.

5. **Principle of Least Privilege**: Create a dedicated SSH user with minimal permissions for SSH MCP.

6. **Network Security**: Use firewalls, VPNs, or jump hosts to restrict SSH access.

See [Security Best Practices](./examples/security-best-practices.md) for detailed guidance.

## Disclaimer

SSH MCP Server is provided under the [MIT License](./LICENSE). Use at your own risk. This project is not affiliated with or endorsed by any SSH or MCP provider.

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](./CONTRIBUTING.md) for more information.

## Code of Conduct

This project follows a [Code of Conduct](./CODE_OF_CONDUCT.md) to ensure a welcoming environment for everyone.

## Support

If you find SSH MCP Server helpful, consider starring the repository or contributing! Pull requests and feedback are welcome. 