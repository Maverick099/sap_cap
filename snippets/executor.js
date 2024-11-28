const { EventEmitter } = require("node:events");
const { ApplicationException } = require("./appError");

/**
 * A callback function executed upon an event.
 * @callback executorCallback
 * @param {String} eventId - The event id.
 * @param {Date} datetime - The current datetime.
 * @param {any} data - The data passed to the executor.
 * @returns {any} - The return value depends on the specific callback implementation.
 */

/**
 * Class representing an exception specific to the Executor.
 */
class ExecutorException extends ApplicationException {
  /**
   * Creates a new ExecutorException.
   * @param {String} code A unique code for the error.
   * @param {String} message The error message, to understand the error.
   * @param {Error|undefined} err The original error.
   */
  constructor(code, message, err) {
    super("EXECUTORERROR", `${code.toUpperCase()}::${message}`, err, 500);
  }
}

/**
 * Class representing a collection of executors.
 *
 * Just acts as table of executors, and provides a way to register and retrieve executors.
 * then emit their events.
 */
class Executors {
  constructor(name) {
    this.executors = {};
    this.name = name;
  }

  /**
   * Registers a new executor with the given name.
   * @param {String} name The name of the executor.
   * @param {Executor} executor The executor function.
   */
  registerExecutor(name, executor) {
    // check if executor already exists
    if (this.executors[name]) {
      throw new Error(`Executor with name ${name} already exists.`);
    }
    this.executors[name] = executor;
    console.info(`[EXECUTOR][INFO] Executor ${name} registered.`);
  }

  /**
   * Retrieves the executor with the given name.
   * @param {String} name The name of the executor.
   * @returns {Executor} The executor function.
   */
  getExecutor(name) {
    // check if executor exists
    if (!this.executors[name]) {
      throw new ExecutorException("NON_EXISTENT_EXECUTOR", `Executor with name ${name} does not exist.`);
    }
    return this.executors[name];
  }
}

/**
 * GlobalExecutors is a {@link Executors} instance of to hold exector that needs to be accessed on `global` scope.
 *
 * It is used to hold Executors that need to be accessed in multiple places throughout the application.
 *
 * A {@link Executor} can be registered to global scope by passing this into the arguments.
 */
const GlobalExecutors = Object.freeze(new Executors("Global"));

/**
 * An Executor is responsible for executing tasks when they triggered to execute.
 *
 * It is used to register a callback function that is executed when an event occurs.
 */
class Executor {
  /**Event emitter object */
  #eventemitter;
  /**Executors Object */
  #exectuorTable;

  /**
   * Creates a new Executor.
   * @param {String} name The name of the Executor.
   * @param {Executors} executorTable The Executors table where this Executor should be registered.
   */
  constructor(name, executorTable) {
    this.name = name;
    this.id = this.#generateId();
    this.#eventemitter = new EventEmitter();
    this.#exectuorTable = executorTable;
    this.#exectuorTable.registerExecutor(this.id, this);
  }

  /**
   * Generates a unique ID for the Executor instance.
   * @private
   * @returns {String} The generated ID.
   */
  #generateId() {
    return `${this.name}_${Date.now()}`;
  }

  /**
   * Executes the task associated with this Executor.
   * @param {any} data The data to be passed to the task.
   */
  execute(data) {
    this.#eventemitter.emit(this.id, data);
    console.info(`[EXECUTOR][INFO] Executor ${this.id} triggered.`);
  }

  /**
   * Disposes of the Executor instance.
   * This method removes callback associated with the Executor's ID and deletes the Executor from the Executors table.
   * @throws {ExecutorException} If an error occurs while disposing of the Executor.
   */
  dispose() {
    try {
      this.#eventemitter.removeAllListeners(this.id);
      delete this.#exectuorTable?.executors[this.id];
      console.info(`[EXECUTOR][INFO] Executor ${this.id} disposed.`);
    } catch (err) {
      throw new ExecutorException("DISPOSAL_FAILED", `Unable to dispose executor ${this.id}`, err);
    }
  }

  /**
   * Executes the provided callback function when an event with the same for this executor instance occurs.
   *
   * Returns a Promise that resolves to a string "completed" after the callback has finished executing,
   * or rejects with an ExecutorException if an error occurs.
   *
   * Note: This must be used before {@link execute} is called so that an callback function is registered.
   *
   * @param {executorCallback} callback The callback function to execute. This function should accept two parameters: an id and a date.
   * @returns {Promise.<any|ExecutorException>} A Promise that resolves to "completed" after the callback has finished executing, or rejects with an ExecutorException if an error occurs.
   * @throws {ExecutorException} If unable to resolve back after execution.
   */
  async resolvesAfterExecutionComplete(callback) {
    return new Promise((resolve, reject) => {
      try {
        const executionFunction = async (data) => {
          // execute the call back
          const anyresult = await callback(this.id, new Date(), data);
          resolve(anyresult);
        };
        this.#eventemitter.on(this.id, executionFunction);
      } catch (err) {
        reject(new ExecutorException("RESOLUTION_FAILED", `Unable to resolve back after execution for ${this.id}`, err));
      }
    });
  }
}

module.exports = { Executor, Executors, GlobalExecutors };
