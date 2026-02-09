declare global {
	namespace App {
		interface Error {
			message: string;
		}
		interface Locals {
			did?: string;
		}
	}
}

export {};
