# SSH MCP Download Error Handling Improvements

**Date:** 2025-10-03
**Version:** 1.2.0 → 1.2.1 (Error Handling Enhanced)

## Problem Analysis

### Original Issue
The model (from the conversation trace) made **10+ failed attempts** before successfully downloading a file. The root causes were:

1. **Ambiguous error messages**: "Download failed: No such file" didn't clarify whether:
   - Remote file was missing
   - Local directory didn't exist
   - Permissions were denied

2. **No path normalization**: Paths like `~/`, `./`, and relative paths weren't handled automatically

3. **No pre-flight validation**: The tool would attempt operations without checking prerequisites first

4. **Poor LLM guidance**: Tool descriptions didn't explain path options or troubleshooting steps

### Impact
- **10 failed attempts** in the real-world conversation trace
- Wasted API calls and time
- Poor user experience
- Model confusion about what went wrong

---

## Solutions Implemented

### 1. **Path Validation Functions** (src/index.ts:308-442)

Added two validation helpers that LLMs can rely on:

#### `validateLocalDownloadPath(localPath)`
- Expands `~` to home directory
- Resolves relative paths (`./ and `..`) to absolute paths
- Checks if parent directory exists
- Checks if parent directory is writable
- Returns: `{ valid: boolean, normalizedPath: string, error?: string, suggestion?: string }`

#### `validateLocalUploadPath(localPath)`
- Expands `~` to home directory
- Resolves relative paths to absolute paths
- Checks if file exists
- Checks if path is a file (not directory)
- Checks if file is readable
- Returns: `{ valid: boolean, normalizedPath: string, error?: string, suggestion?: string }`

**Example outputs:**
```typescript
validateLocalDownloadPath('/nonexistent/dir/file.txt')
// Returns:
// {
//   valid: false,
//   error: "Local directory '/nonexistent/dir' does not exist",
//   suggestion: 'Create it first with: mkdir -p "/nonexistent/dir"'
// }

validateLocalDownloadPath('./file.txt')
// Returns:
// {
//   valid: true,
//   normalizedPath: '/root/ssh-mcp/file.txt'
// }
```

---

### 2. **Enhanced `downloadFile` Function** (src/index.ts:652-753)

**Improvements:**
- ✅ Pre-validates local path (directory exists + writable)
- ✅ Normalizes `~/`, `./`, and relative paths automatically
- ✅ Pre-flight check: verifies remote file exists using `sftp.stat()`
- ✅ Distinguishes between "remote file missing" vs "local dir missing"
- ✅ Provides actionable error messages with suggestions
- ✅ Suggests using `listFiles` tool to verify remote paths

**Error Message Examples:**
```
Before: "Download failed: No such file"

After (remote file missing):
"Remote file '/path/to/file' does not exist or is not accessible. Use the 'listFiles' tool to verify the file path."

After (local dir missing):
"Local directory '/nonexistent/dir' does not exist. Create it first with: mkdir -p '/nonexistent/dir'"
```

---

### 3. **Enhanced `uploadFile` Function** (src/index.ts:584-657)

**Improvements:**
- ✅ Pre-validates local file (exists + readable)
- ✅ Normalizes paths automatically
- ✅ Better error messages for remote path issues
- ✅ Distinguishes permission errors from "not found" errors

**Error Message Examples:**
```
Before: "Upload failed: No such file"

After (local file missing):
"Local file '/path/to/file' does not exist. Check the file path and ensure the file exists"

After (remote dir missing):
"Upload failed: Remote directory may not exist. Verify the remote path '/path' or create the parent directory first."
```

---

### 4. **Improved Tool Descriptions** (src/index.ts:525-530)

**Before:**
```typescript
"Download files from the remote SSH server to the local machine via SFTP..."
localPath: "Absolute path where file will be saved locally..."
```

**After:**
```typescript
"Download files from the remote SSH server to the local machine via SFTP.
IMPORTANT: The local directory must exist before download (the tool will NOT create it).
Supports relative paths ('./file.txt'), absolute paths ('/tmp/file.txt'), and tilde expansion ('~/file.txt').
If download fails, use 'listFiles' tool first to verify the remote file exists."

localPath: "Path where file will be saved locally. Supports:
  - relative ('./file.txt' = current directory)
  - absolute ('/tmp/file.txt')
  - tilde ('~/file.txt' = home directory)
Parent directory MUST exist. Use current directory './' if other paths fail."
```

**Key additions:**
- Explains path format options (relative, absolute, tilde)
- Warns that directory must exist
- Suggests fallback: use `./` for current directory
- Recommends using `listFiles` for troubleshooting

---

## Testing Results

### Path Validation Tests
```bash
✅ Relative path "./test.txt" → /root/ssh-mcp/test.txt (valid)
✅ Tilde path "~/test.txt" → /root/test.txt (valid)
✅ Non-existent dir → Error with suggestion to mkdir
✅ Non-existent file → Error with helpful message
✅ Existing file → Normalized successfully
```

### Expected Improvement
**Before:** 10+ trial-and-error attempts
**After:** 1-2 attempts maximum

The model will now:
1. Get immediate feedback if local directory doesn't exist
2. Get suggestion to use `./` for current directory
3. Know to use `listFiles` to verify remote paths
4. Understand path format options from the description

---

## Code Changes Summary

| File | Lines Changed | Description |
|------|---------------|-------------|
| src/index.ts | +165 lines | Added path validation helpers |
| src/index.ts | ~50 lines | Enhanced downloadFile with pre-flight checks |
| src/index.ts | ~50 lines | Enhanced uploadFile with better errors |
| src/index.ts | ~10 lines | Improved tool descriptions |

**Total:** ~275 lines added/modified

---

## Benefits for LLMs

1. **Clear error context**: Knows exactly what failed (local vs remote)
2. **Actionable suggestions**: Gets commands to fix issues (mkdir, listFiles)
3. **Path flexibility**: Can use `./`, `~/`, relative, or absolute paths
4. **Fail-fast validation**: Errors caught before SSH connection
5. **Troubleshooting guidance**: Tool descriptions explain what to do when stuck

---

## Backward Compatibility

✅ **Fully backward compatible**
- All existing absolute paths still work
- New path formats are additive (tilde, relative)
- Error messages are more helpful but API unchanged
- No breaking changes to tool signatures

---

## Recommendations for Users/LLMs

### For Download Operations:
1. **Prefer current directory**: Use `./filename.txt` when unsure
2. **Verify remote first**: Use `listFiles` to check remote path exists
3. **Check error suggestions**: Follow the mkdir commands in error messages

### For Upload Operations:
1. **Use relative paths**: `./config.json` works from current directory
2. **Verify file exists**: Error will tell you if file missing
3. **Check permissions**: Error will distinguish permission vs not-found

---

## Future Improvements (Optional)

1. **Auto-create local directories**: Add optional `createDir: boolean` parameter
2. **Batch file operations**: Support multiple files in one call
3. **Progress tracking**: For large files, report progress percentage
4. **Dry-run mode**: Validate without executing transfer

---

## Conclusion

These improvements transform the SSH MCP from a frustrating trial-and-error experience into a smooth, LLM-friendly interface. The model went from **10+ failed attempts** to an expected **1-2 attempts maximum**.

**Key takeaway:** Clear error messages + path validation + helpful suggestions = Better LLM experience.
