/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_FIREBASE_API_KEY: string;
	readonly VITE_FIREBASE_AUTH_DOMAIN: string;
	readonly VITE_FIREBASE_PROJECT_ID: string;
	readonly VITE_FIREBASE_STORAGE_BUCKET: string;
	readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
	readonly VITE_FIREBASE_APP_ID: string;
	readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
	readonly VITE_FIREBASE_VAPID_KEY: string;
	readonly VITE_METERED_TURN_API_URL?: string;
	readonly VITE_METERED_TURN_API_KEY?: string;
	readonly VITE_TURN_URLS?: string;
	readonly VITE_TURN_URL?: string;
	readonly VITE_TURN_USERNAME?: string;
	readonly VITE_TURN_CREDENTIAL?: string;
	readonly VITE_MEDIA_PROVIDER?: 'r2' | 'cloudinary';
	readonly VITE_CLOUDINARY_CLOUD_NAME?: string;
	readonly VITE_CLOUDINARY_UPLOAD_PRESET?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
