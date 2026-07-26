/**
 * Yield one real host task.
 *
 * `MessageChannel` rather than `setTimeout` because the tests that need this have faked the
 * timer functions, and a faked `setTimeout` never lets IndexedDB or the fetch transport make
 * progress. `MessageChannel` is not faked by `vi.useFakeTimers`, so it still schedules a
 * genuine macrotask.
 */
export function yieldHostTask(): Promise<void> {
	return new Promise((resolve) => {
		const channel = new MessageChannel();
		channel.port1.onmessage = () => {
			channel.port1.close();
			resolve();
		};
		channel.port2.postMessage(null);
	});
}
