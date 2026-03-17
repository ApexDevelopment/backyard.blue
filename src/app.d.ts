declare global {
	namespace App {
		interface Error {
			message: string;
		}
		interface Locals {
			did?: string;
			needsOnboarding?: boolean;
			isAdmin?: boolean;
			isBanned?: boolean;
			hasPendingDeletions?: boolean;
		}
	}
}

export {};
