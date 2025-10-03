# Basic Usage Examples

## Simple Command Execution

```json
{
  "mcpServers": {
    "ssh-mcp": {
      "command": "npx",
      "args": [
        "ssh-mcp",
        "-y",
        "--",
        "--host=192.168.1.100",
        "--user=admin",
        "--password=yourpassword"
      ]
    }
  }
}
```

Then ask your LLM:
- "List the files in /var/log"
- "Check the disk usage"
- "Show me the system uptime"

## Using SSH Key Authentication

```json
{
  "mcpServers": {
    "ssh-mcp": {
      "command": "npx",
      "args": [
        "ssh-mcp",
        "-y",
        "--",
        "--host=192.168.1.100",
        "--user=admin",
        "--key=/home/user/.ssh/id_rsa"
      ]
    }
  }
}
```

## Using Environment Variables

Instead of command-line arguments, you can use environment variables:

```json
{
  "mcpServers": {
    "ssh-mcp": {
      "command": "npx",
      "args": ["ssh-mcp", "-y"],
      "env": {
        "SSH_MCP_HOST": "192.168.1.100",
        "SSH_MCP_USER": "admin",
        "SSH_MCP_PASSWORD": "yourpassword",
        "SSH_MCP_PORT": "22"
      }
    }
  }
}
```

## Common Tasks

### System Monitoring
Ask: "What's the current CPU and memory usage?"
The LLM will execute: `top -bn1 | head -20`

### File Management
Ask: "Find all log files modified in the last hour"
The LLM will execute: `find /var/log -type f -mmin -60`

### Service Status
Ask: "Is nginx running?"
The LLM will execute: `systemctl status nginx`

### Disk Space
Ask: "Show me disk usage for all mounted filesystems"
The LLM will execute: `df -h`
