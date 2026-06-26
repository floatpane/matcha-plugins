#!/usr/bin/env node

// Security scanner for Lua plugins
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DANGEROUS_PATTERNS = [
  { pattern: /os\.execute/i, message: 'Uses os.execute - can run system commands', severity: 'danger' },
  { pattern: /io\.popen/i, message: 'Uses io.popen - can execute shell commands', severity: 'danger' },
  { pattern: /debug\./i, message: 'Accesses debug library', severity: 'danger' },
  { pattern: /loadstring/i, message: 'Uses loadstring - dynamic code execution', severity: 'danger' },
  { pattern: /dofile/i, message: 'Uses dofile - executes external files', severity: 'danger' },
  { pattern: /assert\(load/i, message: 'Dynamic code execution via assert(load)', severity: 'danger' },
  { pattern: /os\.remove/i, message: 'Can delete files', severity: 'warning' },
  { pattern: /io\.open/i, message: 'File system access', severity: 'warning' },
  { pattern: /require\s*\(\s*["']socket["']/i, message: 'Network access via socket', severity: 'warning' },
];

const TRUSTED_MAINTAINERS = ['floatpane'];

function scanPlugin(content) {
  const issues = [];
  let maxSeverity = 'safe';

  for (const { pattern, message, severity } of DANGEROUS_PATTERNS) {
    if (pattern.test(content)) {
      issues.push(message);
      if (severity === 'danger') maxSeverity = 'danger';
      else if (maxSeverity !== 'danger') maxSeverity = 'warning';
    }
  }

  return {
    status: maxSeverity,
    issues,
    isClean: maxSeverity === 'safe',
  };
}

function computeSHA256(content) {
  return crypto.createHash('sha256').update(content).toString('hex');
}

async function main() {
  const prNumber = process.argv[2];
  
  // Get changed files from PR or recent commit
  const githubToken = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY || 'floatpane/matcha-plugins';
  const [owner, repoName] = repo.split('/');

  let changedFiles = [];
  
  if (prNumber) {
    // Get files from PR
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/pulls/${prNumber}/files`,
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );
    const files = await response.json();
    changedFiles = files.filter(f => f.filename.endsWith('.lua'));
  } else {
    // Get files from recent push
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/commits?per_page=1`,
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );
    const commits = await response.json();
    if (commits.length > 0) {
      const commitResponse = await fetch(commits[0].url, {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });
      const commit = await commitResponse.json();
      changedFiles = commit.files?.filter(f => f.filename.endsWith('.lua')) || [];
    }
  }

  const results = [];
  
  for (const file of changedFiles) {
    const contentResponse = await fetch(file.raw_url);
    const content = await contentResponse.text();
    
    const scanResult = scanPlugin(content);
    const sha256 = computeSHA256(content);
    
    // Extract author from commit
    const authorMatch = file.patch?.match(/\+\+.*@author\s+(.+)/i);
    const author = authorMatch ? authorMatch[1].trim() : 'unknown';
    const isTrusted = TRUSTED_MAINTAINERS.includes(author);
    
    results.push({
      file: file.filename,
      ...scanResult,
      sha256,
      author,
      isTrusted,
    });
    
    console.log(`Scanned ${file.filename}: ${scanResult.status}`);
  }

  // Set outputs for GitHub Actions
  if (results.length > 0) {
    const result = results[0];
    console.log(`::set-output name=is_clean::${result.isClean}`);
    console.log(`::set-output name=is_trusted::${result.isTrusted}`);
    
    // Save full results for PR comment
    fs.writeFileSync('/tmp/scan-results.json', JSON.stringify(result));
    console.log(`::set-env name=SCAN_RESULT::${JSON.stringify(result)}`);
  }
}

main().catch(console.error);
