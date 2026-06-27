import { NextResponse } from 'next/server';
import { submitPlugin, isTrustedMaintainer } from '@/lib/github-app';
import { PluginSubmissionInput } from '@/lib/types';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { repository_url, plugin_name, author_github_username, author_display_name } = body;

    // Validate required fields
    if (!repository_url || !plugin_name) {
      return NextResponse.json(
        { error: 'Missing required fields: repository_url and plugin_name' },
        { status: 400 }
      );
    }

    // Extract GitHub username and repo from URL
    const match = repository_url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      return NextResponse.json(
        { error: 'Invalid GitHub repository URL' },
        { status: 400 }
      );
    }

    const [, owner, repo] = match;

    // Look up the repository's default branch dynamically
    const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
    if (!repoResponse.ok) {
      return NextResponse.json(
        { error: 'Repository not found. Please check the URL.' },
        { status: 404 }
      );
    }
    const repoData = await repoResponse.json();
    const defaultBranch = repoData.default_branch || 'main';

    // Fetch the plugin file from the user's repository on its default branch
    const fileUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${plugin_name}.lua`;
    const fileResponse = await fetch(fileUrl);

    if (!fileResponse.ok) {
      return NextResponse.json(
        { error: `Plugin file ${plugin_name}.lua not found in repository (branch: ${defaultBranch})` },
        { status: 404 }
      );
    }
    const content = await fileResponse.text();

    // Get the current HEAD commit SHA of the source repo's default branch
    const branchResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches/${defaultBranch}`);
    let sourceSha = 'unknown';
    if (branchResponse.ok) {
      const branchData = await branchResponse.json();
      sourceSha = branchData.commit?.sha || 'unknown';
    }

    const sha256 = crypto.createHash('sha256').update(content).digest('hex');
    const author = author_github_username || owner;
    const trusted = isTrustedMaintainer(author);

    const input: PluginSubmissionInput = {
      plugin_name,
      repository_url,
      author_github_username: author,
      author_display_name: author_display_name || author,
      file_content: content,
      source_branch: defaultBranch,
      source_sha: sourceSha,
      sha256,
    };

    const result = await submitPlugin(input);

    return NextResponse.json({
      success: true,
      ...result,
      trusted,
      message: result.merged
        ? 'Plugin submitted and merged successfully'
        : `Plugin submitted. PR #${result.pr_number} created for review.`,
    });
  } catch (error) {
    console.error('Submission failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Submission failed' },
      { status: 500 }
    );
  }
}
