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


```commandline
{
    "mcpServers": {
        "ssh-mcp": {
            "command": "node",
            "args": [
                "/path/to/ssh-mcp/build/index.js",
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

## Client Setup

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
