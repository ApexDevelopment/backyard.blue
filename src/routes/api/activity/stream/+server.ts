import type { RequestHandler } from './$types.js';
import { subscribeNotifications } from '$lib/server/notifications.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.did) {
		return new Response('Authentication required', { status: 401 });
	}

	const did = locals.did;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			const send = (event: string, data: unknown) => {
				try {
					controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
				} catch {
					// Stream closed
				}
			};

			// Send a heartbeat every 30s to keep the connection alive
			const heartbeat = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': heartbeat\n\n'));
				} catch {
					clearInterval(heartbeat);
				}
			}, 30_000);

			const unsubscribe = subscribeNotifications(did, (event) => {
				send('notification', event);
			});

			// Clean up when the client disconnects
			const cleanup = () => {
				clearInterval(heartbeat);
				unsubscribe();
			};

			// ReadableStream cancel is called when the client closes the connection
			// We store cleanup so the cancel callback can call it
			(controller as any)._cleanup = cleanup;
		},
		cancel(controller: any) {
			controller._cleanup?.();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
