// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface Platform {}
	}
}

declare module '@auth/sveltekit' {
	interface Session {
		user: {
			id: string;
			email: string;
			role: 'admin' | 'user';
			oidc?: boolean;
		};
	}

	interface User {
		role?: 'admin' | 'user';
	}
}

export {};
