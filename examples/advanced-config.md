# Advanced Configuration Examples

## Rate Limiting

Limit requests to 5 per minute:

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
        "--password=yourpassword",
        "--rateLimit=true",
        "--rateLimitMax=5",
        "--rateLimitWindow=60000"
      ]
    }
  }
}
```

## Strict Mode (Command Injection Protection)

Enable strict mode to block potentially dangerous command patterns:

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
        "--password=yourpassword",
        "--strictMode=true"
      ]
    }
  }
}
```

Strict mode will reject commands containing:
- `;` (command separator)
- `&&` / `||` (logical operators)
- `|` (pipes)
- Backticks or `$()` (command substitution)

## Connection Pooling

Reuse SSH connections for better performance:

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
        "--password=yourpassword",
        "--pool=true",
        "--poolMaxSize=5",
        "--poolTtl=300000"
      ]
    }
  }
}
```

## Audit Logging

Enable audit logging to track all executed commands:

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
        "--password=yourpassword",
        "--auditLog=true"
      ]
    }
  }
}
```

Audit logs are written to stderr in JSON format:
```json
{"timestamp":"2025-10-03T12:34:56.789Z","command":"ls -la","exitCode":0,"duration":123}
```

## Debug Mode

Enable debug mode for troubleshooting:

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
        "--password=yourpassword",
        "--debug=true"
      ]
    }
  }
}
```

## Custom Timeout

Set a custom timeout (in milliseconds):

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
        "--password=yourpassword",
        "--timeout=30000"
      ]
    }
  }
}
```

## Unlimited Command Length

By default, commands are limited to 1000 characters. To disable this limit:

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
        "--password=yourpassword",
        "--maxChars=none"
      ]
    }
  }
}
```

## Full Security Configuration

Combining multiple security features:

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
        "--key=/home/user/.ssh/id_rsa",
        "--strictMode=true",
        "--rateLimit=true",
        "--rateLimitMax=10",
        "--rateLimitWindow=60000",
        "--auditLog=true",
        "--timeout=30000",
        "--maxChars=5000"
      ]
    }
  }
}
```
