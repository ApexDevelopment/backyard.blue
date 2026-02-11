import type { RequestHandler } from './$types.js';
import { Readable } from 'node:stream';
import { subscribeNotifications } from '$lib/server/notifications.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.did) {
		return new Response('Authentication required', { status: 401 });
	}

	const did = locals.did;

	let unsubscribe: (() => void) | null = null;
	let heartbeat: ReturnType<typeof setInterval> | null = null;

	const nodeStream = new Readable({
		read() {}
	});

	function cleanup() {
		if (heartbeat) {
			clearInterval(heartbeat);
			heartbeat = null;
		}
		if (unsubscribe) {
			unsubscribe();
			unsubscribe = null;
		}
	}

	nodeStream.on('close', cleanup);

	// Initial comment to flush headers
	nodeStream.push(': ok\n\n');

	heartbeat = setInterval(() => {
		if (!nodeStream.destroyed) {
			nodeStream.push(': heartbeat\n\n');
		} else {
			cleanup();
		}
	}, 15_000);

	unsubscribe = subscribeNotifications(did, (event) => {
		if (!nodeStream.destroyed) {
			nodeStream.push(`event: notification\ndata: ${JSON.stringify(event)}\n\n`);
		}
	});

	// Convert the Node Readable into a Web ReadableStream for the Response constructor
	const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

	return new Response(webStream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
