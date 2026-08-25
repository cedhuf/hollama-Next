import { createServer, type Server } from 'node:http';

/**
 * A provider, for the length of one test file.
 *
 * The turn runs in our server now, not in the browser, which is what makes
 * `page.route()` useless for this: the request the app makes never passes
 * through the page. So the tests give the app a real endpoint to talk to, and it
 * answers the way an OpenAI-compatible one does.
 *
 * It is deliberately dumb. What is being tested is the app's half of the
 * conversation: that a connection can be made, that a model is offered, that a
 * turn is sent and that what streams back arrives on screen. A provider that
 * did anything clever would be a second thing under test.
 */
export interface FakeProvider {
	url: string;
	/** Every chat request the app has made, in order. */
	requests: unknown[];
	close: () => Promise<void>;
}

export const FAKE_MODEL = 'fake-model';

export async function startFakeProvider(
	reply = 'Hello from the fake provider.'
): Promise<FakeProvider> {
	const requests: unknown[] = [];

	const server: Server = createServer((request, response) => {
		const url = request.url ?? '';

		if (url.endsWith('/models')) {
			response.writeHead(200, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ data: [{ id: FAKE_MODEL, object: 'model' }] }));
			return;
		}

		if (url.endsWith('/chat/completions')) {
			let body = '';
			request.on('data', (chunk) => (body += chunk));
			request.on('end', () => {
				try {
					requests.push(JSON.parse(body));
				} catch {
					requests.push(body);
				}

				// Server-sent events, one word at a time, because streaming is the path
				// the app actually takes and a single blob would not exercise it.
				response.writeHead(200, {
					'content-type': 'text/event-stream',
					'cache-control': 'no-cache'
				});
				for (const word of reply.split(' ')) {
					const delta = { choices: [{ delta: { content: `${word} ` }, index: 0 }] };
					response.write(`data: ${JSON.stringify(delta)}\n\n`);
				}
				response.write('data: [DONE]\n\n');
				response.end();
			});
			return;
		}

		response.writeHead(404).end();
	});

	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	const port = typeof address === 'object' && address ? address.port : 0;

	return {
		url: `http://127.0.0.1:${port}/v1`,
		requests,
		close: () => new Promise<void>((resolve) => server.close(() => resolve()))
	};
}
