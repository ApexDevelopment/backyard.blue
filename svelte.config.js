import adapter from '@sveltejs/adapter-node';

const config = {
	kit: {
		adapter: adapter({
			out: 'build'
		}),
		alias: {
			'$components': 'src/lib/components',
			'$server': 'src/lib/server',
			'$stores': 'src/lib/stores'
		},
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'https:', 'data:', 'blob:'],
				'font-src': ['self'],
				'connect-src': ['self'],
				'frame-src': ['self', 'https:'],
				'frame-ancestors': ['none'],
				'base-uri': ['self'],
				'form-action': ['self']
			}
		}
	}
};

export default config;
