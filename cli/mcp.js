#!/usr/bin/env node
// Keep protocol stdout free of diagnostics, including module-load failures.
try {
  const [{ boot }, command] = await Promise.all([
    import('../payload/engine/lib/boot.js'), import('./commands/mcp.js'),
  ]);
  process.exitCode = await boot('unknown-knowledge-mcp', command);
} catch (error) {
  process.stderr.write(`unknown-knowledge-mcp: internal failure\n${error?.stack ?? error}\n`);
  process.exitCode = 2;
}
