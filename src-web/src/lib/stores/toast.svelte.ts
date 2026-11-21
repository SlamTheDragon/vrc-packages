export type ToastVariant = 'info' | 'success' | 'warning' | 'danger';

export interface ToastItem {
	id: string;
	message: string;
	title?: string;
	variant: ToastVariant;
	durationMs: number;
	dismissible: boolean;
}

class ToastStore {
	items = $state<ToastItem[]>([]);
	private seq = 0;

	show(
		message: string,
		options: {
			title?: string;
			variant?: ToastVariant;
			durationMs?: number;
			dismissible?: boolean;
		} = {}
	): string {
		const id = `vrcp-toast-${++this.seq}`;
		const entry: ToastItem = {
			id,
			message,
			title: options.title,
			variant: options.variant ?? 'info',
			durationMs: options.durationMs ?? 3800,
			dismissible: options.dismissible ?? true
		};
		this.items = [...this.items.slice(-3), entry];
		return id;
	}

	success(message: string, title = 'Updated'): string {
		return this.show(message, { title, variant: 'success' });
	}

	info(message: string, title?: string): string {
		return this.show(message, { title, variant: 'info' });
	}

	warning(message: string, title = 'Warning'): string {
		return this.show(message, { title, variant: 'warning', durationMs: 5000 });
	}

	error(message: string, title = 'Request Failed'): string {
		return this.show(message, { title, variant: 'danger', durationMs: 6000 });
	}

	dismiss(id: string): void {
		this.items = this.items.filter((item) => item.id !== id);
	}
}

export const toastStore = new ToastStore();
