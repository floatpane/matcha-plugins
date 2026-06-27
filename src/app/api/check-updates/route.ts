import { NextResponse } from 'next/server';
import { checkPluginUpdates } from '@/lib/github-app';

export async function POST() {
  try {
    const results = await checkPluginUpdates();
    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Update check failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Update check failed' },
      { status: 500 }
    );
  }
}
