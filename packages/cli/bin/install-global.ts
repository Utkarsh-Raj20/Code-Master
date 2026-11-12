import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const binEntry = path.join(repoRoot, "packages", "cli", "bin", "mastercode");

if (process.platform === "win32") {
  const npmGlobalDir = path.join(os.homedir(), "AppData", "Roaming", "npm");
  if (!fs.existsSync(npmGlobalDir)) {
    fs.mkdirSync(npmGlobalDir, { recursive: true });
  }

  // Windows Command Prompt wrapper (.cmd)
  const cmdContent = `@ECHO off
GOTO start
:find_dp0
SET dp0=%~dp0
EXIT /b
:start
SETLOCAL
CALL :find_dp0
IF EXIST "%dp0%\\node_modules\\bun\\bin\\bun.exe" (
  SET "_BUN=%dp0%\\node_modules\\bun\\bin\\bun.exe"
) ELSE (
  SET "_BUN=bun"
)
"%_BUN%" "${binEntry}" %*
`;

  // PowerShell wrapper (.ps1)
  const psContent = `#!/usr/bin/env pwsh
$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent
$bun = Join-Path $basedir "node_modules\\bun\\bin\\bun.exe"
if (-not (Test-Path $bun)) {
  $bun = "bun"
}
& $bun "${binEntry}" $args
exit $LASTEXITCODE
`;

  // Git Bash / WSL / sh wrapper
  const shContent = `#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")
if [ -x "$basedir/node_modules/bun/bin/bun.exe" ]; then
  exec "$basedir/node_modules/bun/bin/bun.exe" "${binEntry.replace(/\\/g, "/")}" "$@"
else
  exec bun "${binEntry.replace(/\\/g, "/")}" "$@"
fi
`;

  const names = ["mastercode", "nightcode"];
  for (const name of names) {
    fs.writeFileSync(path.join(npmGlobalDir, `${name}.cmd`), cmdContent, "utf8");
    fs.writeFileSync(path.join(npmGlobalDir, `${name}.ps1`), psContent, "utf8");
    fs.writeFileSync(path.join(npmGlobalDir, name), shContent, "utf8");
  }

  console.log(`[SUCCESS] Installed global commands (mastercode, nightcode) into ${npmGlobalDir}`);
  console.log("You can now open ANY directory in your terminal and run 'mastercode' or 'nightcode'!");
} else {
  const targetDir = fs.existsSync("/usr/local/bin")
    ? "/usr/local/bin"
    : path.join(os.homedir(), ".local", "bin");

  for (const name of ["mastercode", "nightcode"]) {
    const symlinkPath = path.join(targetDir, name);
    try {
      if (fs.existsSync(symlinkPath)) fs.unlinkSync(symlinkPath);
      fs.symlinkSync(binEntry, symlinkPath);
      fs.chmodSync(symlinkPath, 0o755);
      console.log(`[SUCCESS] Symlinked ${name} -> ${symlinkPath}`);
    } catch (err) {
      console.warn(`Could not link ${name} to ${symlinkPath}:`, err);
    }
  }
}
