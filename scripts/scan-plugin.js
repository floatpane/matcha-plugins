#!/usr/bin/env node

// Security scanner for Lua plugins.
// Reads manifest JSON files from the matcha-plugins repo, fetches the
// actual .lua source from the author's repository, and scans it.

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

function scanPlugin(content) {
  const issues = [];
  let maxSeverity = 'safe';

  for (const { pattern, message, severity } of DANGEROUS_PATTERNS) {
    if (pattern.test(content)) {
      issues.push(message);
      if (severity === 'danger') {
        maxSeverity = 'danger';
      } else if (maxSeverity !== 'danger') {
        maxSeverity = 'warning';
      }
    }
  }

  return {
    status: maxSeverity,
    issues,
    isClean: maxSeverity === 'safe',
  };
}

function computeSHA256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'matcha-plugin-scanner',
    },
  });
  if (!response.ok) return null;
  return response.json();
}

async function main() {
  const prNumber = process.argv[2];
  const githubToken = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY || 'floatpane/matcha-plugins';
  const [owner, repoName] = repo.split('/');

  let changedManifests = [];

  if (prNumber) {
    // Get changed .json files from PR
    const files = await fetchJson(
      `https://api.github.com/repos/${owner}/${repoName}/pulls/${prNumber}/files`,
      githubToken,
    );
    if (files) {
      changedManifests = files
        .filter(f => f.filename.startsWith('plugins/') && f.filename.endsWith('.json'))
        .map(f => f.filename);
    }
  } else {
    // Get changed .json files from recent push
    const commits = await fetchJson(
      `https://api.github.com/repos/${owner}/${repoName}/commits?per_page=1`,
      githubToken,
    );
    if (commits && commits.length > 0) {
      const commit = await fetchJson(commits[0].url, githubToken);
      if (commit && commit.files) {
        changedManifests = commit.files
          .filter(f => f.filename.startsWith('plugins/') && f.filename.endsWith('.json'))
          .map(f => f.filename);
      }
    }
  }

  if (changedManifests.length === 0) {
    console.log('No manifest files changed.');
    return;
  }

  const results = [];

  for (const manifestPath of changedManifests) {
    // Read the manifest from the local checkout
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (e) {
      console.log(`Could not read manifest ${manifestPath}: ${e.message}`);
      continue;
    }

    const match = manifest.repository_url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) {
      console.log(`Invalid repository_url in ${manifestPath}: ${manifest.repository_url}`);
      continue;
    }

    const [, srcOwner, srcRepo] = match;
    const branch = manifest.source_branch || 'main';
    const pluginName = manifest.name || path.basename(manifestPath, '.json');

    // Fetch the .lua content from the author's source repo
    const fileUrl = `https://raw.githubusercontent.com/${srcOwner}/${srcRepo}/${branch}/${pluginName}.lua`;
    const contentResponse = await fetch(fileUrl);

    if (!contentResponse.ok) {
      console.log(`Could not fetch ${pluginName}.lua from ${srcOwner}/${srcRepo} (branch: ${branch})`);
      results.push({
        plugin: pluginName,
        file: manifestPath,
        status: 'danger',
        issues: [`Source file not accessible: ${fileUrl}`],
        isClean: false,
        sha256: 'unknown',
        author: manifest.author?.github_username || 'unknown',
      });
      continue;
    }

    const content = await contentResponse.text();
    const scanResult = scanPlugin(content);
    const sha256 = computeSHA256(content);

    // Verify SHA-256 matches the manifest
    const shaMatches = sha256 === manifest.sha256;

    const issues = [...scanResult.issues];
    if (!shaMatches) {
      issues.push(`SHA-256 mismatch: manifest says ${manifest.sha256.slice(0, 16)}... but source is ${sha256.slice(0, 16)}...`);
    }

    results.push({
      plugin: pluginName,
      file: manifestPath,
      status: !shaMatches ? 'danger' : scanResult.status,
      issues,
      isClean: shaMatches && scanResult.isClean,
      sha256,
      author: manifest.author?.github_username || 'unknown',
    });

    console.log(`Scanned ${pluginName}: ${scanResult.status}${!shaMatches ? ' (SHA MISMATCH!)' : ''}`);
  }

  // Save results for PR comment
  fs.writeFileSync('/tmp/scan-results.json', JSON.stringify(results, null, 2));

  // Set outputs for GitHub Actions
  const allClean = results.every(r => r.isClean);
  console.log(`::set-output name=is_clean::${allClean}`);
  console.log(`::set-output name=result_count::${results.length}`);
}

main().catch(console.error);
