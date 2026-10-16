/** An abort closes dispatch immediately, but cleanup waits for the bounded in-flight command. */
export class BrokerQueue {
  private chain = Promise.resolve();
  private failure?: Error;
  constructor(private readonly onFailure: (error: Error) => void) {}
  enqueue(command: () => Promise<void>) {
    this.chain = this.chain
      .then(async () => {
        if (!this.failure) await command();
      })
      .catch((error: unknown) =>
        this.abort(error instanceof Error ? error : new Error(String(error))),
      );
  }
  abort(error: Error) {
    if (this.failure) return;
    this.failure = error;
    this.onFailure(error);
  }
  async drain(): Promise<void> {
    await this.chain;
    if (this.failure) throw this.failure;
  }
}
