#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { Client as SSHClient } from 'ssh2';
import { z } from 'zod';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// Example usage: node build/index.js --host=1.2.3.4 --port=22 --user=root --password=pass --key=path/to/key --timeout=5000
function parseArgv() {
  const args = process.argv.slice(2);
  const config: Record<string, string> = {};
  for (const arg of args) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      config[match[1]] = match[2];
    }
  }
  return config;
}

// Helper to get config value from CLI args or env vars
function getConfig(key: string, defaultValue?: string): string | undefined {
  const envKey = `SSH_MCP_${key.toUpperCase().replace(/-/g, '_')}`;
  return argvConfig[key] || process.env[envKey] || defaultValue;
}

const isCliEnabled = process.env.SSH_MCP_DISABLE_MAIN !== '1';
const argvConfig = isCliEnabled ? parseArgv() : {} as Record<string, string>;

const HOST = getConfig('host');
const PORT = parseInt(getConfig('port') || '22');
const USER = getConfig('user');
const PASSWORD = getConfig('password');
const KEY = getConfig('key');
const DEFAULT_TIMEOUT = parseInt(getConfig('timeout') || '60000');

// Rate limiting configuration
const RATE_LIMIT_ENABLED = getConfig('rateLimit') !== 'false';
const RATE_LIMIT_MAX = parseInt(getConfig('rateLimitMax') || '10');
const RATE_LIMIT_WINDOW = parseInt(getConfig('rateLimitWindow') || '60000');

// Simple in-memory rate limiter
class RateLimiter {
  private requests: number[] = [];

  checkLimit(): void {
    if (!RATE_LIMIT_ENABLED) return;

    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW;

    // Remove old requests outside the window
    this.requests = this.requests.filter(time => time > windowStart);

    if (this.requests.length >= RATE_LIMIT_MAX) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Rate limit exceeded: ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW}ms`
      );
    }

    this.requests.push(now);
  }
}

const rateLimiter = new RateLimiter();

// Connection pooling configuration
const POOL_ENABLED = getConfig('pool') !== 'false';
const POOL_MAX_SIZE = parseInt(getConfig('poolMaxSize') || '3');
const POOL_TTL = parseInt(getConfig('poolTtl') || '300000');

interface PooledConnection {
  conn: SSHClient;
  lastUsed: number;
}

class SSHConnectionPool {
  private pool: PooledConnection[] = [];

  async getConnection(config: any): Promise<SSHClient> {
    if (!POOL_ENABLED) {
      return this.createNewConnection(config);
    }

    // Clean up expired connections
    this.cleanupExpired();

    // Try to reuse an existing connection
    if (this.pool.length > 0) {
      const pooled = this.pool.pop()!;
      pooled.lastUsed = Date.now();
      return pooled.conn;
    }

    // Create new connection
    return this.createNewConnection(config);
  }

  returnConnection(conn: SSHClient): void {
    if (!POOL_ENABLED) {
      conn.end();
      return;
    }

    if (this.pool.length >= POOL_MAX_SIZE) {
      conn.end();
      return;
    }

    this.pool.push({
      conn,
      lastUsed: Date.now(),
    });
  }

  private cleanupExpired(): void {
    const now = Date.now();
    this.pool = this.pool.filter(pooled => {
      if (now - pooled.lastUsed > POOL_TTL) {
        pooled.conn.end();
        return false;
      }
      return true;
    });
  }

  private createNewConnection(config: any): Promise<SSHClient> {
    return new Promise((resolve, reject) => {
      const conn = new SSHClient();
      conn.on('ready', () => resolve(conn));
      conn.on('error', reject);
      conn.connect(config);
    });
  }

  shutdown(): void {
    this.pool.forEach(pooled => pooled.conn.end());
    this.pool = [];
  }
}

const connectionPool = new SSHConnectionPool();

// Audit logging configuration
const AUDIT_LOG_ENABLED = getConfig('auditLog') === 'true';

interface AuditLogEntry {
  timestamp: string;
  command: string;
  exitCode?: number;
  error?: string;
  duration: number;
}

function auditLog(entry: AuditLogEntry): void {
  if (!AUDIT_LOG_ENABLED) return;

  const logLine = JSON.stringify({
    ...entry,
    timestamp: new Date(entry.timestamp).toISOString(),
  });

  console.error(`[AUDIT] ${logLine}`);
}

// Debug mode configuration
const DEBUG_MODE = getConfig('debug') === 'true';

function debugLog(message: string, ...args: any[]): void {
  if (!DEBUG_MODE) return;
  console.error(`[DEBUG] ${message}`, ...args);
}

// Max characters configuration:
// - Default: 1000 characters
// - When set via --maxChars:
//   * a positive integer enforces that limit
//   * 0 or a negative value disables the limit (no max)
//   * the string "none" (case-insensitive) disables the limit (no max)
const MAX_CHARS_RAW = getConfig('maxChars');
const MAX_CHARS = (() => {
  if (typeof MAX_CHARS_RAW === 'string') {
    const lowered = MAX_CHARS_RAW.toLowerCase();
    if (lowered === 'none') return Infinity;
    const parsed = parseInt(MAX_CHARS_RAW);
    if (isNaN(parsed)) return 1000;
    if (parsed <= 0) return Infinity;
    return parsed;
  }
  return 1000;
})();

function validateConfig(config: Record<string, string>) {
  const errors = [];
  if (!config.host) errors.push('Missing required --host');
  if (!config.user) errors.push('Missing required --user');
  if (config.port && isNaN(Number(config.port))) errors.push('Invalid --port');
  if (errors.length > 0) {
    throw new Error('Configuration error:\n' + errors.join('\n'));
  }
}

if (isCliEnabled) {
  validateConfig(argvConfig);
}

// Command sanitization and validation
const STRICT_MODE = getConfig('strictMode') === 'true';

// Patterns that could enable command injection
const DANGEROUS_PATTERNS = [
  /;/,                    // Command separator
  /&&/,                   // Logical AND
  /\|\|/,                 // Logical OR
  /\|/,                   // Pipe
  /`/,                    // Command substitution
  /\$\(/,                 // Command substitution
  />\s*&/,                // Redirect stderr to stdout
  /&\s*>/,                // Background with redirect
];

/**
 * Sanitize and validate shell commands before execution
 *
 * @param command - The shell command to validate
 * @returns Sanitized command string (trimmed)
 * @throws McpError if command is invalid (empty, too long, contains dangerous patterns in strict mode)
 *
 * Checks performed:
 * - Type validation (must be string)
 * - Empty command check
 * - Length validation (configurable via MAX_CHARS)
 * - Dangerous pattern detection (when STRICT_MODE enabled)
 *
 * @example
 * sanitizeCommand('ls -la')  // Returns: 'ls -la'
 * sanitizeCommand('')        // Throws: 'Command cannot be empty'
 * sanitizeCommand('rm -rf / ; echo done')  // Throws in strict mode
 */
export function sanitizeCommand(command: string): string {
  if (typeof command !== 'string') {
    throw new McpError(ErrorCode.InvalidParams, 'Command must be a string');
  }

  const trimmedCommand = command.trim();
  if (!trimmedCommand) {
    throw new McpError(ErrorCode.InvalidParams, 'Command cannot be empty');
  }

  // Length check
  if (Number.isFinite(MAX_CHARS) && trimmedCommand.length > (MAX_CHARS as number)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Command is too long (max ${MAX_CHARS} characters)`
    );
  }

  // Strict mode: detect potential command chaining/injection
  if (STRICT_MODE) {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(trimmedCommand)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Command contains potentially dangerous pattern (strict mode enabled): ${pattern.source}`
        );
      }
    }
  }

  return trimmedCommand;
}

// Escape command for use in shell contexts (like pkill)
export function escapeCommandForShell(command: string): string {
  // Replace single quotes with escaped single quotes
  return command.replace(/'/g, "'\"'\"'");
}

/**
 * Expand ~ in remote paths to the remote user's home directory
 *
 * @param sftp - Active SFTP session
 * @param remotePath - Remote path that may contain ~
 * @returns Promise resolving to expanded absolute path
 *
 * @example
 * expandRemotePath(sftp, '~/Desktop/file.txt')
 * // Returns: '/home/username/Desktop/file.txt' or '/Users/username/Desktop/file.txt'
 *
 * @example
 * expandRemotePath(sftp, '/absolute/path')
 * // Returns: '/absolute/path' (unchanged)
 */
export async function expandRemotePath(sftp: any, remotePath: string): Promise<string> {
  // If path doesn't start with ~, return as-is
  if (!remotePath.startsWith('~')) {
    return remotePath;
  }

  return new Promise((resolve, reject) => {
    // Use realpath to resolve ~ on the remote server
    // The '.' argument gets the home directory when called on ~
    const pathToResolve = remotePath === '~' ? '~' : remotePath;

    sftp.realpath(pathToResolve, (err: any, resolvedPath: string) => {
      if (err) {
        // Fallback: if realpath fails, return original path
        // This handles edge cases where ~ might not be expandable
        debugLog('Remote path expansion failed, using original path:', err.message);
        resolve(remotePath);
      } else {
        debugLog('Remote path expanded:', remotePath, '->', resolvedPath);
        resolve(resolvedPath);
      }
    });
  });
}

/**
 * Validate and normalize a local file path for download operations
 *
 * @param localPath - The path to validate (can be relative, absolute, or contain ~)
 * @returns Object with validation result
 *
 * Validation checks:
 * - Expands ~ to user home directory
 * - Resolves relative paths (. and ..) to absolute paths
 * - Checks if parent directory exists and is writable
 * - Returns normalized absolute path
 *
 * @example
 * validateLocalDownloadPath('~/file.txt')
 * // Returns: { valid: true, normalizedPath: '/home/user/file.txt' }
 *
 * @example
 * validateLocalDownloadPath('./file.txt')
 * // Returns: { valid: true, normalizedPath: '/current/dir/file.txt' }
 *
 * @example
 * validateLocalDownloadPath('/nonexistent/dir/file.txt')
 * // Returns: { valid: false, error: 'Directory /nonexistent/dir does not exist. Create it first with: mkdir -p /nonexistent/dir', normalizedPath: '...' }
 */
export function validateLocalDownloadPath(localPath: string): {
  valid: boolean;
  normalizedPath: string;
  error?: string;
  suggestion?: string;
} {
  try {
    // Expand ~ to home directory
    let normalized = localPath;
    if (normalized.startsWith('~/')) {
      normalized = path.join(os.homedir(), normalized.slice(2));
    } else if (normalized === '~') {
      normalized = os.homedir();
    }

    // Resolve relative paths to absolute
    normalized = path.resolve(normalized);

    // Get parent directory
    const parentDir = path.dirname(normalized);

    // Check if parent directory exists
    if (!fs.existsSync(parentDir)) {
      return {
        valid: false,
        normalizedPath: normalized,
        error: `Local directory '${parentDir}' does not exist`,
        suggestion: `Create it first with: mkdir -p "${parentDir}"`
      };
    }

    // Check if parent directory is writable
    try {
      fs.accessSync(parentDir, fs.constants.W_OK);
    } catch (err) {
      return {
        valid: false,
        normalizedPath: normalized,
        error: `Local directory '${parentDir}' is not writable`,
        suggestion: `Check permissions with: ls -ld "${parentDir}"`
      };
    }

    return {
      valid: true,
      normalizedPath: normalized
    };
  } catch (err: any) {
    return {
      valid: false,
      normalizedPath: localPath,
      error: `Path validation error: ${err.message}`
    };
  }
}

/**
 * Validate and normalize a local file path for upload operations
 *
 * @param localPath - The path to validate (can be relative, absolute, or contain ~)
 * @returns Object with validation result
 *
 * Validation checks:
 * - Expands ~ to user home directory
 * - Resolves relative paths to absolute paths
 * - Checks if file exists and is readable
 * - Returns normalized absolute path
 *
 * @example
 * validateLocalUploadPath('~/file.txt')
 * // Returns: { valid: true, normalizedPath: '/home/user/file.txt' }
 */
export function validateLocalUploadPath(localPath: string): {
  valid: boolean;
  normalizedPath: string;
  error?: string;
  suggestion?: string;
} {
  try {
    // Expand ~ to home directory
    let normalized = localPath;
    if (normalized.startsWith('~/')) {
      normalized = path.join(os.homedir(), normalized.slice(2));
    } else if (normalized === '~') {
      normalized = os.homedir();
    }

    // Resolve relative paths to absolute
    normalized = path.resolve(normalized);

    // Check if file exists
    if (!fs.existsSync(normalized)) {
      return {
        valid: false,
        normalizedPath: normalized,
        error: `Local file '${normalized}' does not exist`,
        suggestion: `Check the file path and ensure the file exists`
      };
    }

    // Check if path is a file (not a directory)
    const stats = fs.statSync(normalized);
    if (!stats.isFile()) {
      return {
        valid: false,
        normalizedPath: normalized,
        error: `Path '${normalized}' is not a file`,
        suggestion: `Ensure you're specifying a file, not a directory`
      };
    }

    // Check if file is readable
    try {
      fs.accessSync(normalized, fs.constants.R_OK);
    } catch (err) {
      return {
        valid: false,
        normalizedPath: normalized,
        error: `Local file '${normalized}' is not readable`,
        suggestion: `Check permissions with: ls -l "${normalized}"`
      };
    }

    return {
      valid: true,
      normalizedPath: normalized
    };
  } catch (err: any) {
    return {
      valid: false,
      normalizedPath: localPath,
      error: `Path validation error: ${err.message}`
    };
  }
}

const server = new McpServer({
  name: 'SSH MCP Server',
  version: '1.2.0',
  capabilities: {
    resources: {},
    tools: {},
  },
});

// Helper to build SSH config
async function buildSshConfig(): Promise<any> {
  const sshConfig: any = {
    host: HOST,
    port: PORT,
    username: USER,
  };

  if (PASSWORD) {
    sshConfig.password = PASSWORD;
  } else if (KEY) {
    const fs = await import('fs/promises');
    sshConfig.privateKey = await fs.readFile(KEY, 'utf8');
  }

  return sshConfig;
}

server.tool(
  "exec",
  "Execute shell commands on the remote SSH server. Use this for system operations, file management, process control, and running scripts. Returns stdout on success. Common uses: checking system status (uptime, df -h), managing files (ls, cat, find), running services (systemctl status nginx). Example: 'ls -la /var/log' or 'ps aux | grep node'",
  {
    command: z.string().describe("Shell command to execute. Examples: 'whoami', 'ls -la /home', 'cat /etc/hosts', 'df -h'. Supports pipes and redirects unless strictMode is enabled. Max length: 1000 chars (configurable via --maxChars)"),
  },
  async ({ command }) => {
    debugLog('Received exec request for command:', command);

    // Check rate limit first
    rateLimiter.checkLimit();
    debugLog('Rate limit check passed');

    // Sanitize command input
    const sanitizedCommand = sanitizeCommand(command);
    debugLog('Command sanitized:', sanitizedCommand);

    try {
      const sshConfig = await buildSshConfig();
      const result = await execSshCommand(sshConfig, sanitizedCommand);
      return result;
    } catch (err: any) {
      // Wrap unexpected errors
      if (err instanceof McpError) throw err;
      throw new McpError(ErrorCode.InternalError, `Unexpected error: ${err?.message || err}`);
    }
  }
);

server.tool(
  "upload",
  "Upload files from the local machine to the remote SSH server via SFTP. BEST PRACTICE: Use './filename' for local file (from current directory). Remote path supports tilde expansion (~/Desktop/file.txt). The local file MUST exist.",
  {
    localPath: z.string().describe("Local file path. RECOMMENDED: './filename' (current directory). Also supports: absolute ('/tmp/file.txt'), tilde ('~/file.txt'). File must exist."),
    remotePath: z.string().describe("Remote destination path. Supports: absolute paths ('/home/user/file.txt'), tilde expansion ('~/Desktop/file.txt'). Parent directory must exist on remote server."),
  },
  async ({ localPath, remotePath }) => {
    debugLog('Received upload request:', localPath, '->', remotePath);

    // Check rate limit
    rateLimiter.checkLimit();

    try {
      const sshConfig = await buildSshConfig();
      const result = await uploadFile(sshConfig, localPath, remotePath);
      return result;
    } catch (err: any) {
      if (err instanceof McpError) throw err;
      throw new McpError(ErrorCode.InternalError, `Upload failed: ${err?.message || err}`);
    }
  }
);

server.tool(
  "download",
  "Download files from the remote SSH server to the local machine via SFTP. BEST PRACTICE: Use './filename' for local path (saves to current directory - most reliable). Remote path supports tilde expansion (~/Desktop/file.txt). Use 'listFiles' to verify remote file exists first if unsure.",
  {
    remotePath: z.string().describe("Remote file path. Supports: absolute paths ('/var/log/syslog'), tilde expansion ('~/Desktop/file.txt'). Use 'listFiles' to verify path first."),
    localPath: z.string().describe("Local save path. RECOMMENDED: './filename' (current directory). Also supports: absolute ('/tmp/file.txt'), tilde ('~/file.txt'). Parent directory must exist."),
  },
  async ({ remotePath, localPath }) => {
    debugLog('Received download request:', remotePath, '->', localPath);

    // Check rate limit
    rateLimiter.checkLimit();

    try {
      const sshConfig = await buildSshConfig();
      const result = await downloadFile(sshConfig, remotePath, localPath);
      return result;
    } catch (err: any) {
      if (err instanceof McpError) throw err;
      throw new McpError(ErrorCode.InternalError, `Download failed: ${err?.message || err}`);
    }
  }
);

server.tool(
  "listFiles",
  "List all files and directories in a remote directory via SFTP. Returns detailed information including file type (file/dir), size in bytes, and last modified timestamp. Supports tilde expansion (~/Desktop). Use this to explore remote filesystem, find files, or verify uploads/downloads. Common uses: browsing directories, finding specific files, checking if upload succeeded.",
  {
    remotePath: z.string().describe("Path to remote directory. Supports: absolute paths ('/home/user', '/var/log'), tilde expansion ('~/Desktop', '~/Documents'). Directory must exist and be readable. Returns list of files with sizes and timestamps."),
  },
  async ({ remotePath }) => {
    debugLog('Received listFiles request:', remotePath);

    // Check rate limit
    rateLimiter.checkLimit();

    try {
      const sshConfig = await buildSshConfig();
      const result = await listRemoteFiles(sshConfig, remotePath);
      return result;
    } catch (err: any) {
      if (err instanceof McpError) throw err;
      throw new McpError(ErrorCode.InternalError, `List files failed: ${err?.message || err}`);
    }
  }
);

/**
 * Upload a file to the remote SSH server via SFTP
 *
 * @param sshConfig - SSH connection configuration object
 * @param localPath - Path to the local file (supports relative paths like './', absolute paths, and ~ expansion)
 * @param remotePath - Absolute destination path on remote server (e.g., '/home/user/file.txt')
 * @returns Promise with upload result and duration
 * @throws McpError if upload fails (file not found, permission denied, connection error)
 *
 * @example
 * uploadFile(config, '/tmp/data.csv', '/home/user/data.csv')
 * // Returns: { content: [{ type: 'text', text: 'File uploaded successfully: ... (duration ms)' }] }
 */
export async function uploadFile(sshConfig: any, localPath: string, remotePath: string): Promise<{ [x: string]: unknown; content: ({ [x: string]: unknown; type: "text"; text: string; } | { [x: string]: unknown; type: "image"; data: string; mimeType: string; } | { [x: string]: unknown; type: "audio"; data: string; mimeType: string; } | { [x: string]: unknown; type: "resource"; resource: any; })[] }> {
  return new Promise(async (resolve, reject) => {
    const startTime = Date.now();
    debugLog('Starting SFTP upload:', localPath, '->', remotePath);

    // Validate and normalize local path
    const localPathValidation = validateLocalUploadPath(localPath);
    if (!localPathValidation.valid) {
      const errorMsg = `${localPathValidation.error}. ${localPathValidation.suggestion || ''}`.trim();
      debugLog('Local path validation failed:', errorMsg);
      return reject(new McpError(ErrorCode.InvalidParams, errorMsg));
    }

    const normalizedLocalPath = localPathValidation.normalizedPath;
    debugLog('Normalized local path:', normalizedLocalPath);

    try {
      const conn = await connectionPool.getConnection(sshConfig);

      conn.sftp(async (err, sftp) => {
        if (err) {
          connectionPool.returnConnection(conn);
          return reject(new McpError(ErrorCode.InternalError, `SFTP session error: ${err.message}`));
        }

        // Expand ~ in remote path
        const expandedRemotePath = await expandRemotePath(sftp, remotePath);
        debugLog('Using expanded remote path for upload:', expandedRemotePath);

        sftp.fastPut(normalizedLocalPath, expandedRemotePath, (err) => {
          const duration = Date.now() - startTime;
          connectionPool.returnConnection(conn);

          if (err) {
            auditLog({
              timestamp: new Date().toISOString(),
              command: `upload ${normalizedLocalPath} -> ${expandedRemotePath}`,
              error: err.message,
              duration,
            });

            // Provide helpful error message for remote path issues
            let errorMessage = `Upload failed: ${err.message}`;
            if (err.message.includes('No such file') || err.message.includes('not found')) {
              errorMessage = `Upload failed: Remote directory may not exist. Verify the remote path '${expandedRemotePath}' or create the parent directory first.`;
            } else if (err.message.includes('Permission denied')) {
              errorMessage = `Upload failed: Permission denied for remote path '${expandedRemotePath}'. Check file permissions on remote server.`;
            }

            reject(new McpError(ErrorCode.InternalError, errorMessage));
          } else {
            auditLog({
              timestamp: new Date().toISOString(),
              command: `upload ${normalizedLocalPath} -> ${expandedRemotePath}`,
              exitCode: 0,
              duration,
            });
            resolve({
              content: [{
                type: 'text',
                text: `File uploaded successfully: ${normalizedLocalPath} -> ${expandedRemotePath} (${duration}ms)`,
              }],
            });
          }
        });
      });
    } catch (err: any) {
      const duration = Date.now() - startTime;
      auditLog({
        timestamp: new Date().toISOString(),
        command: `upload ${normalizedLocalPath} -> ${remotePath}`,
        error: err.message,
        duration,
      });
      reject(new McpError(ErrorCode.InternalError, `Upload connection error: ${err.message}`));
    }
  });
}

/**
 * Download a file from the remote SSH server via SFTP
 *
 * @param sshConfig - SSH connection configuration object
 * @param remotePath - Absolute path to remote file (e.g., '/var/log/app.log')
 * @param localPath - Path where file will be saved (supports relative paths like './', absolute paths, and ~ expansion)
 * @returns Promise with download result and duration
 * @throws McpError if download fails (file not found, permission denied, connection error)
 *
 * @example
 * downloadFile(config, '/var/log/syslog', '/tmp/syslog')
 * // Returns: { content: [{ type: 'text', text: 'File downloaded successfully: ... (duration ms)' }] }
 */
export async function downloadFile(sshConfig: any, remotePath: string, localPath: string): Promise<{ [x: string]: unknown; content: ({ [x: string]: unknown; type: "text"; text: string; } | { [x: string]: unknown; type: "image"; data: string; mimeType: string; } | { [x: string]: unknown; type: "audio"; data: string; mimeType: string; } | { [x: string]: unknown; type: "resource"; resource: any; })[] }> {
  return new Promise(async (resolve, reject) => {
    const startTime = Date.now();
    debugLog('Starting SFTP download:', remotePath, '->', localPath);

    // Validate and normalize local path
    const localPathValidation = validateLocalDownloadPath(localPath);
    if (!localPathValidation.valid) {
      const errorMsg = `${localPathValidation.error}. ${localPathValidation.suggestion || ''}`.trim();
      debugLog('Local path validation failed:', errorMsg);
      return reject(new McpError(ErrorCode.InvalidParams, errorMsg));
    }

    const normalizedLocalPath = localPathValidation.normalizedPath;
    debugLog('Normalized local path:', normalizedLocalPath);

    try {
      const conn = await connectionPool.getConnection(sshConfig);

      conn.sftp(async (err, sftp) => {
        if (err) {
          connectionPool.returnConnection(conn);
          return reject(new McpError(ErrorCode.InternalError, `SFTP session error: ${err.message}`));
        }

        // Expand ~ in remote path
        const expandedRemotePath = await expandRemotePath(sftp, remotePath);
        debugLog('Using expanded remote path for download:', expandedRemotePath);

        // Pre-flight check: verify remote file exists
        debugLog('Checking if remote file exists:', expandedRemotePath);
        sftp.stat(expandedRemotePath, (statErr, stats) => {
          if (statErr) {
            connectionPool.returnConnection(conn);
            const duration = Date.now() - startTime;
            auditLog({
              timestamp: new Date().toISOString(),
              command: `download ${expandedRemotePath} -> ${normalizedLocalPath}`,
              error: `Remote file not found: ${statErr.message}`,
              duration,
            });
            return reject(new McpError(
              ErrorCode.InvalidParams,
              `Remote file '${expandedRemotePath}' does not exist or is not accessible. Use the 'listFiles' tool to verify the file path.`
            ));
          }

          if (!stats.isFile()) {
            connectionPool.returnConnection(conn);
            const duration = Date.now() - startTime;
            auditLog({
              timestamp: new Date().toISOString(),
              command: `download ${expandedRemotePath} -> ${normalizedLocalPath}`,
              error: 'Remote path is not a file',
              duration,
            });
            return reject(new McpError(
              ErrorCode.InvalidParams,
              `Remote path '${expandedRemotePath}' is not a file (it's a directory). Specify a file path instead.`
            ));
          }

          debugLog('Remote file exists, proceeding with download');

          // Proceed with download
          sftp.fastGet(expandedRemotePath, normalizedLocalPath, (err) => {
            const duration = Date.now() - startTime;
            connectionPool.returnConnection(conn);

            if (err) {
              auditLog({
                timestamp: new Date().toISOString(),
                command: `download ${expandedRemotePath} -> ${normalizedLocalPath}`,
                error: err.message,
                duration,
              });
              reject(new McpError(ErrorCode.InternalError, `Download failed: ${err.message}`));
            } else {
              auditLog({
                timestamp: new Date().toISOString(),
                command: `download ${expandedRemotePath} -> ${normalizedLocalPath}`,
                exitCode: 0,
                duration,
              });
              resolve({
                content: [{
                  type: 'text',
                  text: `File downloaded successfully: ${expandedRemotePath} -> ${normalizedLocalPath} (${duration}ms)`,
                }],
              });
            }
          });
        });
      });
    } catch (err: any) {
      const duration = Date.now() - startTime;
      auditLog({
        timestamp: new Date().toISOString(),
        command: `download ${remotePath} -> ${normalizedLocalPath}`,
        error: err.message,
        duration,
      });
      reject(new McpError(ErrorCode.InternalError, `Download connection error: ${err.message}`));
    }
  });
}

/**
 * List all files and directories in a remote directory via SFTP
 *
 * @param sshConfig - SSH connection configuration object
 * @param remotePath - Absolute path to remote directory (e.g., '/home/user/Documents')
 * @returns Promise with formatted list of files including type, size, and modification time
 * @throws McpError if listing fails (directory not found, permission denied, connection error)
 *
 * @example
 * listRemoteFiles(config, '/home/user')
 * // Returns: { content: [{ type: 'text', text: 'Files in /home/user:\n[dir] Documents (4096 bytes)...' }] }
 */
export async function listRemoteFiles(sshConfig: any, remotePath: string): Promise<{ [x: string]: unknown; content: ({ [x: string]: unknown; type: "text"; text: string; } | { [x: string]: unknown; type: "image"; data: string; mimeType: string; } | { [x: string]: unknown; type: "audio"; data: string; mimeType: string; } | { [x: string]: unknown; type: "resource"; resource: any; })[] }> {
  return new Promise(async (resolve, reject) => {
    const startTime = Date.now();
    debugLog('Listing remote files:', remotePath);

    try {
      const conn = await connectionPool.getConnection(sshConfig);

      conn.sftp(async (err, sftp) => {
        if (err) {
          connectionPool.returnConnection(conn);
          return reject(new McpError(ErrorCode.InternalError, `SFTP session error: ${err.message}`));
        }

        // Expand ~ in remote path
        const expandedRemotePath = await expandRemotePath(sftp, remotePath);
        debugLog('Using expanded remote path for listFiles:', expandedRemotePath);

        sftp.readdir(expandedRemotePath, (err, list) => {
          const duration = Date.now() - startTime;
          connectionPool.returnConnection(conn);

          if (err) {
            auditLog({
              timestamp: new Date().toISOString(),
              command: `listFiles ${expandedRemotePath}`,
              error: err.message,
              duration,
            });
            reject(new McpError(ErrorCode.InternalError, `List files failed: ${err.message}`));
          } else {
            auditLog({
              timestamp: new Date().toISOString(),
              command: `listFiles ${expandedRemotePath}`,
              exitCode: 0,
              duration,
            });

            const fileList = list.map(file => {
              const type = file.attrs.isDirectory() ? 'dir' : 'file';
              const size = file.attrs.size;
              const modified = new Date(file.attrs.mtime * 1000).toISOString();
              return `[${type}] ${file.filename} (${size} bytes, modified: ${modified})`;
            }).join('\n');

            resolve({
              content: [{
                type: 'text',
                text: `Files in ${expandedRemotePath}:\n${fileList}`,
              }],
            });
          }
        });
      });
    } catch (err: any) {
      const duration = Date.now() - startTime;
      auditLog({
        timestamp: new Date().toISOString(),
        command: `listFiles ${remotePath}`,
        error: err.message,
        duration,
      });
      reject(new McpError(ErrorCode.InternalError, `List files connection error: ${err.message}`));
    }
  });
}

/**
 * Execute a shell command on the remote SSH server
 *
 * @param sshConfig - SSH connection configuration object
 * @param command - Shell command to execute (e.g., 'ls -la /var/log')
 * @returns Promise with command stdout output
 * @throws McpError if command fails (non-zero exit code, timeout, connection error)
 *
 * @example
 * execSshCommand(config, 'whoami')
 * // Returns: { content: [{ type: 'text', text: 'root\n' }] }
 *
 * @example
 * execSshCommand(config, 'df -h')
 * // Returns filesystem usage information in stdout
 */
export async function execSshCommand(sshConfig: any, command: string): Promise<{ [x: string]: unknown; content: ({ [x: string]: unknown; type: "text"; text: string; } | { [x: string]: unknown; type: "image"; data: string; mimeType: string; } | { [x: string]: unknown; type: "audio"; data: string; mimeType: string; } | { [x: string]: unknown; type: "resource"; resource: any; })[] }> {
  return new Promise(async (resolve, reject) => {
    const startTime = Date.now();
    debugLog('Attempting SSH connection to', sshConfig.host);
    let conn: SSHClient;
    let isPooled = false;

    try {
      conn = await connectionPool.getConnection(sshConfig);
      isPooled = true;
      debugLog('SSH connection established (pooled:', isPooled, ')');
    } catch (err: any) {
      const duration = Date.now() - startTime;
      auditLog({
        timestamp: new Date().toISOString(),
        command,
        error: `Connection error: ${err.message}`,
        duration,
      });
      return reject(new McpError(ErrorCode.InternalError, `SSH connection error: ${err.message}`));
    }

    let timeoutId: NodeJS.Timeout;
    let isResolved = false;

    // Set up timeout
    timeoutId = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        // Try to abort the running command before closing connection
        const abortTimeout = setTimeout(() => {
          // If abort command itself times out, force close connection
          connectionPool.returnConnection(conn);
        }, 5000); // 5 second timeout for abort command

        conn.exec('timeout 3s pkill -f \'' + escapeCommandForShell(command) + '\' 2>/dev/null || true', (err, abortStream) => {
          if (abortStream) {
            abortStream.on('close', () => {
              clearTimeout(abortTimeout);
              connectionPool.returnConnection(conn);
            });
          } else {
            clearTimeout(abortTimeout);
            connectionPool.returnConnection(conn);
          }
        });
        reject(new McpError(ErrorCode.InternalError, `Command execution timed out after ${DEFAULT_TIMEOUT}ms`));
      }
    }, DEFAULT_TIMEOUT);

    conn.exec(command, (err, stream) => {
      if (err) {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);
          connectionPool.returnConnection(conn);
          reject(new McpError(ErrorCode.InternalError, `SSH exec error: ${err.message}`));
        }
        return;
      }
      let stdout = '';
      let stderr = '';
      stream.on('close', (code: number, signal: string) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);
          connectionPool.returnConnection(conn);
          const duration = Date.now() - startTime;

          // Only reject on non-zero exit code
          // Many commands write informational output to stderr even on success
          if (code !== 0) {
            const errorMsg = stderr || stdout || 'Command failed';
            auditLog({
              timestamp: new Date().toISOString(),
              command,
              exitCode: code,
              error: errorMsg,
              duration,
            });
            reject(new McpError(ErrorCode.InternalError, `Command failed (exit code ${code}):\n${errorMsg}`));
          } else {
            auditLog({
              timestamp: new Date().toISOString(),
              command,
              exitCode: code,
              duration,
            });
            resolve({
              content: [{
                type: 'text',
                text: stdout,
              }],
            });
          }
        }
      });
      stream.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
    });
  });
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SSH MCP Server running on stdio");
}

if (process.env.SSH_MCP_DISABLE_MAIN !== '1') {
  main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
  });
}

export { parseArgv, validateConfig };