import { NextResponse } from 'next/server';
import { savePushSubscription, removePushSubscription } from '@/lib/redis';

export async function POST(req: Request) {
  try {
    const { clientId, subscription } = await req.json();

    if (!clientId || !subscription) {
      return NextResponse.json({ error: 'Missing clientId or subscription' }, { status: 400 });
    }

    await savePushSubscription(clientId, subscription);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Failed to save push subscription:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const clientId = url.searchParams.get('clientId');

    if (!clientId) {
      return NextResponse.json({ error: 'Missing clientId' }, { status: 400 });
    }

    await removePushSubscription(clientId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Failed to delete push subscription:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
