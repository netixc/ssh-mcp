# Security Best Practices

## Authentication

### ✅ DO: Use SSH Key Authentication
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

### ❌ DON'T: Hardcode Passwords in Configuration
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
        "--password=MyP@ssw0rd"  // ❌ Avoid this!
      ]
    }
  }
}
```

### ✅ DO: Use Environment Variables for Sensitive Data
```json
{
  "mcpServers": {
    "ssh-mcp": {
      "command": "npx",
      "args": ["ssh-mcp", "-y"],
      "env": {
        "SSH_MCP_HOST": "192.168.1.100",
        "SSH_MCP_USER": "admin",
        "SSH_MCP_KEY": "/home/user/.ssh/id_rsa"
      }
    }
  }
}
```

## Network Security

### Use Non-Standard SSH Ports
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
        "--port=2222",
        "--user=admin",
        "--key=/home/user/.ssh/id_rsa"
      ]
    }
  }
}
```

### Use Jump Hosts for Production Servers
Instead of connecting directly to production servers, use a bastion/jump host with strict access controls.

## Command Safety

### Enable Strict Mode
Prevent command injection by blocking dangerous patterns:
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
        "--strictMode=true"
      ]
    }
  }
}
```

### Limit Command Length
Prevent buffer overflow attacks:
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
        "--maxChars=2000"
      ]
    }
  }
}
```

## Access Control

### Use Dedicated SSH User with Limited Permissions
Create a dedicated user with minimal privileges:
```bash
# On the SSH server
sudo adduser ssh-mcp-user
sudo usermod -s /bin/rbash ssh-mcp-user  # Restricted bash
```

### Implement Rate Limiting
Prevent abuse and brute-force attempts:
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
        "--user=ssh-mcp-user",
        "--key=/home/user/.ssh/id_rsa",
        "--rateLimit=true",
        "--rateLimitMax=10",
        "--rateLimitWindow=60000"
      ]
    }
  }
}
```

## Monitoring and Auditing

### Enable Audit Logging
Track all commands executed via SSH MCP:
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
        "--auditLog=true"
      ]
    }
  }
}
```

Redirect audit logs to a file:
```bash
ssh-mcp --host=... --auditLog=true 2>> /var/log/ssh-mcp-audit.log
```

### Set Appropriate Timeouts
Prevent hanging connections:
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
        "--timeout=30000"
      ]
    }
  }
}
```

## File Permissions

### Protect SSH Keys
```bash
# Ensure private key has correct permissions
chmod 600 ~/.ssh/id_rsa
chmod 644 ~/.ssh/id_rsa.pub
chmod 700 ~/.ssh
```

### Protect Configuration Files
```bash
# Ensure MCP configuration has correct permissions
chmod 600 ~/.config/claude/claude_desktop_config.json
```

## Server-Side Security

### Configure SSH Server
Edit `/etc/ssh/sshd_config`:
```
# Disable root login
PermitRootLogin no

# Disable password authentication (use keys only)
PasswordAuthentication no

# Limit users
AllowUsers ssh-mcp-user

# Enable key-based authentication only
PubkeyAuthentication yes

# Disable empty passwords
PermitEmptyPasswords no

# Set login timeout
LoginGraceTime 30

# Limit max authentication attempts
MaxAuthTries 3
```

Then restart SSH:
```bash
sudo systemctl restart sshd
```

## Checklist

- [ ] Use SSH key authentication instead of passwords
- [ ] Store credentials in environment variables, not config files
- [ ] Enable strict mode to prevent command injection
- [ ] Set appropriate rate limits
- [ ] Enable audit logging
- [ ] Use dedicated SSH user with limited permissions
- [ ] Set appropriate command timeouts
- [ ] Limit command length
- [ ] Use non-standard SSH port
- [ ] Protect SSH keys with correct file permissions
- [ ] Configure SSH server with security best practices
- [ ] Monitor and review audit logs regularly
- [ ] Use connection pooling carefully (shorter TTL for production)
- [ ] Keep SSH MCP and dependencies up to date
