import { NextResponse } from 'next/server';
import { listPlugins, fetchPluginContent, getPluginMetadata } from '@/lib/github-app';
import { Plugin } from '@/lib/types';

const TRUSTED_MAINTAINERS = new Set(['floatpane']);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      // Get specific plugin
      const content = await fetchPluginContent(id);
      if (!content) {
        return NextResponse.json({ error: 'Plugin not found' }, { status: 404 });
      }

      const metadata = await getPluginMetadata(id);
      
      const plugin: Plugin = {
        id,
        name: id,
        title: metadata?.title || formatTitle(id),
        description: metadata?.description || 'No description',
        version: metadata?.version || '1.0.0',
        author: {
          github_username: metadata?.author || 'unknown',
          display_name: metadata?.author_display_name || metadata?.author || 'Unknown',
          is_verified: metadata?.author ? TRUSTED_MAINTAINERS.has(metadata.author) : false,
        },
        maintainer: {
          github_username: metadata?.author || 'unknown',
          display_name: metadata?.author_display_name || metadata?.author || 'Unknown',
          is_verified: metadata?.author ? TRUSTED_MAINTAINERS.has(metadata.author) : false,
        },
        repository_url: `https://github.com/floatpane/matcha-plugins/tree/main/plugins`,
        file_url: `https://raw.githubusercontent.com/floatpane/matcha-plugins/main/plugins/${id}.lua`,
        sha256: computeSHA256(content),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        downloads: 0,
        status: 'approved',
        verification_status: metadata?.author && TRUSTED_MAINTAINERS.has(metadata.author) ? 'clean' : 'unverified',
        tags: metadata?.tags || [],
      };

      return NextResponse.json(plugin);
    }

    // List all plugins
    const githubPlugins = await listPlugins();
    const plugins: Plugin[] = [];

    for (const ghPlugin of githubPlugins) {
      try {
        const content = await fetchPluginContent(ghPlugin.name);
        if (!content) continue;

        const metadata = await getPluginMetadata(ghPlugin.name);
        const isTrusted = metadata?.author ? TRUSTED_MAINTAINERS.has(metadata.author) : false;

        plugins.push({
          id: ghPlugin.name,
          name: ghPlugin.name,
          title: metadata?.title || formatTitle(ghPlugin.name),
          description: metadata?.description || 'No description',
          version: metadata?.version || '1.0.0',
          author: {
            github_username: metadata?.author || 'unknown',
            display_name: metadata?.author_display_name || metadata?.author || 'Unknown',
            is_verified: isTrusted,
          },
          maintainer: {
            github_username: metadata?.author || 'unknown',
            display_name: metadata?.author_display_name || metadata?.author || 'Unknown',
            is_verified: isTrusted,
          },
          repository_url: `https://github.com/floatpane/matcha-plugins/tree/main/plugins`,
          file_url: `https://raw.githubusercontent.com/floatpane/matcha-plugins/main/plugins/${ghPlugin.name}.lua`,
          sha256: computeSHA256(content),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          downloads: 0,
          status: 'approved',
          verification_status: isTrusted ? 'clean' : 'unverified',
          tags: metadata?.tags || [],
        });
      } catch (error) {
        console.error(`Failed to process plugin ${ghPlugin.name}:`, error);
      }
    }

    return NextResponse.json(plugins);
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function formatTitle(name: string): string {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function computeSHA256(content: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content).digest('hex');
}
