import ipc from 'node-ipc';

/**
 * Connection Manager for IPC client connections.
 *
 * Tracks two separate concepts:
 * 1. connectionCount: Number of currently active workflows (goes up/down with activate/deactivate)
 * 2. registeredNodes: Which nodes have event listeners attached to the IPC socket
 *
 * KEY INSIGHT: Event listeners persist on ipc.of.bot until the socket is destroyed.
 * So we must NOT remove from registeredNodes when a workflow deactivates, because
 * the listeners are still there! Only when ALL workflows deactivate (and we disconnect IPC)
 * do the listeners get cleared.
 *
 * This solves two issues:
 * 1. Deactivating one workflow would disconnect the shared IPC socket and break all other workflows
 * 2. Reactivating a workflow would add duplicate event listeners causing duplicate events
 */
class ConnectionManager {
	private connectionCount: number = 0;
	private registeredNodes: Set<string> = new Set();

	/**
	 * Check if a node has already registered its event listeners.
	 * Use this to prevent duplicate listener registration.
	 */
	isNodeRegistered(nodeId: string): boolean {
		return this.registeredNodes.has(nodeId);
	}

	/**
	 * Register a new trigger node connection.
	 * Call this when a trigger node is activated.
	 * Returns true if listeners should be added (first time this node registers on this socket).
	 * Returns false if listeners already exist (skip adding to prevent duplicates).
	 */
	connect(nodeId: string): boolean {
		this.connectionCount++;

		if (this.registeredNodes.has(nodeId)) {
			// This node already has listeners on the socket - don't add duplicates
			console.log(
				`[ConnectionManager] Node ${nodeId} already has listeners on socket. Active: ${this.connectionCount}`,
			);
			return false;
		}

		// First time this node is registering on this socket
		this.registeredNodes.add(nodeId);
		console.log(
			`[ConnectionManager] Node ${nodeId} registered with new listeners. Active: ${this.connectionCount}`,
		);
		return true;
	}

	/**
	 * Unregister a trigger node connection.
	 * Only disconnects from IPC when the last connection is removed.
	 * IMPORTANT: Does NOT remove from registeredNodes unless IPC disconnects,
	 * because the event listeners are still attached to the socket!
	 */
	disconnect(nodeId: string): void {
		if (this.connectionCount <= 0) {
			console.log('[ConnectionManager] No active connections to disconnect.');
			return;
		}

		this.connectionCount--;
		console.log(
			`[ConnectionManager] Node ${nodeId} deactivated. Active: ${this.connectionCount}`,
		);

		if (this.connectionCount <= 0) {
			this.connectionCount = 0;
			// Only now do we clear registeredNodes - because the socket (and its listeners) will be destroyed
			this.registeredNodes.clear();
			console.log(
				'[ConnectionManager] Last connection closed. Disconnecting IPC and clearing listener registry.',
			);
			ipc.disconnect('bot');
		}
		// If connectionCount > 0, we keep registeredNodes intact because the socket
		// (and all its attached listeners) are still alive
	}

	/**
	 * Mark a node as no longer having listeners attached.
	 * Call this after the node removes its IPC event listeners.
	 */
	unregister(nodeId: string): void {
		this.registeredNodes.delete(nodeId);
		console.log(`[ConnectionManager] Node ${nodeId} listener registry cleared.`);
	}

	/**
	 * Get the current number of active connections.
	 * Useful for debugging and testing.
	 */
	getConnectionCount(): number {
		return this.connectionCount;
	}

	/**
	 * Get all registered node IDs.
	 * Useful for debugging.
	 */
	getRegisteredNodes(): string[] {
		return Array.from(this.registeredNodes);
	}
}

// Export singleton instance
export const connectionManager = new ConnectionManager();
