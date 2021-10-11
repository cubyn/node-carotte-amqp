/**
 * A simple tool to register message starts & finishes
 * and wait for all messages to be finished
 */

class MessageWaitTimeoutError extends Error {
  constructor(awaitedMessages, timeoutedMessages, timeout) {
    super(`Timeout while waiting for ${timeoutedMessages.length} to finish`);
    this.awaitedMessages = awaitedMessages;
    this.timeoutedMessages = timeoutedMessages;
    this.timeout = timeout;
  }
}

module.exports = class MessageRegister {
  constructor() {
    this.currentMessages = [];
    this.waitResolve = null;
  }

  /**
     * get current total of messages being consumed
     * @return {Number}
     */
  total() {
    return this.currentMessages.length;
  }

  /**
     * register message consumption start
     * @param  {String} qualifier
     */
  start(qualifier) {
    this.currentMessages.push(qualifier);
  }

  /**
     * register message consumption finish
     * @param  {String} qualifier
     */
  finish(qualifier) {
    const index = this.currentMessages.indexOf(qualifier);
    this.currentMessages.splice(index, 1);

    if (this.waitResolve && !this.total()) {
      this.waitResolve();
      this.waitResolve = null;
    }
  }

  /**
     * Wait for all current messages to be finished with
     * optional timeout
     *
     * @param  {Number} timeout disabled when 0
     * @return {Promise<Array<String>, MessageWaitTimeoutError>}
     *         On success: resolved with messages awaited
     *         On error: rejected with MessageWaitTimeoutError
     */
  wait(timeout = 0) {
    return new Promise((resolve, reject) => {
      if (this.total() === 0) {
        resolve([]);
        return;
      }

      // make a copy of current messages to be awaited
      const awaitedMessages = this.currentMessages.slice(0);

      const timeoutId = timeout && setTimeout(
        () => reject(new MessageWaitTimeoutError(
          awaitedMessages, this.currentMessages, timeout,
        )),
        timeout,
      );

      this.waitResolve = () => {
        resolve(awaitedMessages);
        timeoutId && clearTimeout(timeoutId);
      };
    });
  }
};
