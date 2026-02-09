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
		}
	}
};

export default config;
