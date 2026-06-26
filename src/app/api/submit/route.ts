import { NextResponse } from 'next/server';
import { submitPlugin } from '@/lib/github-app';

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

    // Fetch the plugin file from the user's repository
    const fileUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${plugin_name}.lua`;
    const response = await fetch(fileUrl);
    
    if (!response.ok) {
      // Try master branch
      const masterUrl = `https://raw.githubusercontent.com/${owner}/${repo}/master/${plugin_name}.lua`;
      const masterResponse = await fetch(masterUrl);
      
      if (!masterResponse.ok) {
        return NextResponse.json(
          { error: `Plugin file ${plugin_name}.lua not found in repository` },
          { status: 404 }
        );
      }
      
      var content = await masterResponse.text();
    } else {
      var content = await response.text();
    }

    // Submit to our plugins repository via GitHub App
    const fileName = `${plugin_name}.lua`;
    const commitMessage = `Add plugin: ${plugin_name} by @${author_github_username || owner}`;
    
    const result = await submitPlugin(
      fileName,
      content,
      author_github_username || owner,
      commitMessage
    );

    return NextResponse.json({
      success: true,
      ...result,
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
