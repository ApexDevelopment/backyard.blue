import type { RequestHandler } from './$types.js';
import { subscribeNotifications } from '$lib/server/notifications.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.did) {
		return new Response('Authentication required', { status: 401 });
	}

	const did = locals.did;
	const encoder = new TextEncoder();

	let unsubscribe: (() => void) | null = null;
	let heartbeat: ReturnType<typeof setInterval> | null = null;
	let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

	function cleanup() {
		if (heartbeat) {
			clearInterval(heartbeat);
			heartbeat = null;
		}
		if (unsubscribe) {
			unsubscribe();
			unsubscribe = null;
		}
		controllerRef = null;
	}

	function enqueue(text: string) {
		try {
			controllerRef?.enqueue(encoder.encode(text));
		} catch {
			cleanup();
		}
	}

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controllerRef = controller;

			// Send initial comment so the HTTP response headers are flushed immediately
			enqueue(': ok\n\n');

			heartbeat = setInterval(() => {
				enqueue(': heartbeat\n\n');
			}, 15_000);

			unsubscribe = subscribeNotifications(did, (event) => {
				enqueue(`event: notification\ndata: ${JSON.stringify(event)}\n\n`);
			});
		},
		cancel() {
			cleanup();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no',
			'Content-Encoding': 'none'
		}
	});
};
