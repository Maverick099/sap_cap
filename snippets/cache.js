const crypt = require("node:crypto");
const { EventEmitter } = require("node:stream");

const { Duration } = require("./duration");
const { ProcessQueue } = require('./queue');
const { setUnboundedTimeout } = require("./common");
const { ApplicationException } = require("./appError"); 

/**
 * Error class for the cache.
 */
class CacheException extends ApplicationException {
  /**
   *
   * @param {String|undefined} code - The error code.
   * @param {String|undefined} message - Custom message for the error.
   * @param {Error | undefined} err - The original error.
   */
  constructor(code, message, err) {
    super("CACHEERROR", `${code.toUpperCase() ?? CacheException.code.UNKNOWN_ERROR}::${message ?? "ERROR Message is unavailable"}`, err, 500);
  }

  /**
   * A set of error codes for the cache.
   */
  static get code() {
    return {
      CACHE_NOT_FOUND: "CACHE_NOT_FOUND",
      CACHE_EXPIRED: "CACHE_EXPIRED",
      CACHE_KEY_NOT_SET: "CACHE_KEY_NOT_SET",
      UNABLE_TO_SET_CACHE: "UNABLE_TO_SET_CACHE",
      UNKNOWN_ERROR: "UNKNOWN_ERROR",
      UNABLE_TO_OBFUSCATE: "UNABLE_TO_OBFUSCATE",
      READ_FAILED: "UNABLE_TO_READ_VALUE",
      NON_CACHABLE_VALUE: "NON_CACHABLE_VALUE",
    };
  }
}

/**
 * A helper class to obfuscate and de-obfuscate values using a proprietary encryption technique.
 *
 * This class uses an undisclosed encryption technique to obfuscate values. The encryption keys are automatically rotated every 90 days to enhance security.
 * If needed, the {@link Obfuscator.rotateKey}  method can be called to manually rotate the encryption key.
 *
 * Events:
 * - `key_rotated`: Emitted when the encryption key is rotated.
 * - `obfuscated` : When obfuscation is complete.
 */
class Obfuscator extends EventEmitter {
  /**The encryption type
   * @type {string}
   */
  #cryptType = "aes-256-cbc";
  /**
   * @type {string}
   */
  #fideliusCharm;

  /**
   * A default duration for key rotation.
   * @type {Duration}
   */
  #defaultKeyRotationDuration

  /**
   * A timer object for the key rotation process.
   */
  #existingRotatorTimerObject;
  constructor() {
    super();
    /**
     * A default duration for key rotation.
     * @type {Duration}
     */
    this.#defaultKeyRotationDuration = Duration.days(90);
    this.beforeHandlers = {};
    this.afterHandlers = {};
    this.#rotator();
  }


  /**
  * Gets the default key rotation duration.
  * @returns {number} The current default key rotation duration.
  */
  get defaultKeyRotationDuration() {
    return this.#defaultKeyRotationDuration;
  }

  /**
   * Sets the default key rotation duration and emits an event.
   * If there is an existing rotator timer, it will be cleared and a new one will be started.
   * @param {number} duration - The new default key rotation duration.
   */
  set defaultKeyRotationDuration(duration) {
    this.#defaultKeyRotationDuration = duration;
    this.emitter(this.events.rotation_duration_changed, () => {
      if (this.#existingRotatorTimerObject) {
        clearTimeout(this.#existingRotatorTimerObject);
      }
      this.#rotator();
    });
  }

  /**
   * Returns the events that this class emits
   */
  get events() {
    return {
      /**
       * This event is emitted whenever the key is rotated.
       */
      key_rotated: "key_rotated",
      /**
       * A successful obfuscation event.
       */
      obfuscated: "obfuscated",
      /**
       * when a rotation time is changed.
       */
      rotation_duration_changed: "rotation_duration_changed",
    }
  }

  /**
  * Starts the key rotation process
  * @private
  */
  #rotator() {
    const duration = this.defaultKeyRotationDuration;
    if (!this.#fideliusCharm) {
      this.#fideliusCharm = crypt.randomBytes(32);
    }
    this.#existingRotatorTimerObject = setUnboundedTimeout(() => {
      this.rotateKey();
    }, duration.toMilliseconds);
  }

  /**
   * Rotates the current encryption key.
   *
   * This method generates a new random encryption key and triggers the {@link Obfuscator.events.key_rotated} event.
   * 
   * Any event handlers registered for the 'key_rotated' event will be called during this process.
   */
  rotateKey() {
    this.emitter(this.events.key_rotated, () => {
      this.#fideliusCharm = crypt.randomBytes(32);
    });
  }

  /**
   * Emits an event. If there are any handler functions registered for this event with the before method,
   * those functions will be executed before the event is emitted.
   * @param {string} event - The name of the event.
   * @param {Function} callback -  A callback function to be executed.
   * @param {...any} args - The arguments to pass to the event handlers.
   */
  async emitter(event, callback, ...args) {
    // If there are any before handlers for this event, execute them
    if (this.beforeHandlers[event]) {
      this.beforeHandlers[event].forEach(handler => {
        // Ensure the handler is a function before executing it
        if (typeof handler === 'function') {
          try {
            // Execute the handler with the provided arguments
            handler(...args);
          } catch (error) {
            console.error(`[OBFUSCATOR][ERROR]Error in before handler for event "${event}":`, error);
          }
        }
      });
    }

    // If a callback function is provided, execute it in parallel with the event emission
    if (typeof callback === 'function') {

      try {
        await callback();
      } catch (error) {
        console.error(`[OBFUSCATOR][ERROR]Error in callback for event "${event}":`, error);
      }

      // Emit the event
      super.emit(event, ...args);

    }

    // If there are any after handlers for this event, execute them
    if (this.afterHandlers[event]) {
      this.afterHandlers[event].forEach(handler => {
        // Ensure the handler is a function before executing it
        if (typeof handler === 'function') {
          try {
            // Execute the handler with the provided arguments
            handler(...args);
          } catch (error) {
            console.error(`[OBFUSCATOR][ERROR]Error in after handler for event "${event}":`, error);
          }
        }
      });
    }
  }
  /**
   * Registers a handler function to be executed before a specific obfuscation event is emitted.
   * @param {string} event - The name of the event.
   * @param {Function} handler - The handler function to execute.
   * @see {@link Obfuscator#emitter} must be called to run the listener added via this function.
   */
  before(event, handler) {
    if (!this.beforeHandlers[event]) {
      this.beforeHandlers[event] = [];
    }
    this.beforeHandlers[event].push(handler);
  }

  /**
   * Registers a handler function to be executed after a specific obfuscation event is emitted.
   * @param {string} event - The name of the event.
   * @param {Function} handler - The handler function to execute.
   * @see {@link Obfuscator#emitter} must be called to run the listener added via this function.
   */
  after(event, handler) {
    if (!this.afterHandlers[event]) {
      this.afterHandlers[event] = [];
    }
    this.afterHandlers[event].push(handler);
  }
  /**
   * Converts a value to a string and returns its type
   * @param {string|number|boolean|object|array}  value The value to convert
   * @returns {{value:string,type:"string" | "number" | "boolean" | "bigint" | "object" | "array"}} An object with the string value and its type
   */
  converttostring(value) {
    const type = Array.isArray(value) ? "array" : typeof value;
    /**@type {string} */
    let stringValue;
    switch (type) {
      case "number":
      case "boolean":
      case "bigint":
        stringValue = value.toString();
        break;
      case "object":
      case "array":
        stringValue = JSON.stringify(value);
        break;
      default:
        stringValue = value;
    }
    return { value: stringValue, type: type };
  }

  /**
   * Converts a string back to its original type
   * @param {string} string - The string to convert
   * @param {string} type - The type to convert to
   * @returns {string|number|boolean|bigint|object|array}  The converted value
   */
  toType(string, type) {
    /**@type {string|number|boolean|bigint|object|array} */
    let _ = string;
    switch (type) {
      case "number":
        _ = Number(string);
        break;
      case "bigint":
        _ = BigInt(string)
      case "boolean":
        _ = string.toLowerCase() === "true";
        break;
      case "object":
      case "array":
        _ = JSON.parse(string);
        break;
      default:
      // If type is anything else, leave decrypted as a string
    }
    return _;
  }

  /**
  * Encodes a value
  * @param {string|number|boolean|object|array} value - The value to encode
  * @returns {string} The encoded value
  */
  encode(value) {
    let encoded;
    this.emitter(this.events.obfuscated, () => {
      const stringValue = this.converttostring(value);
      const iv = crypt.randomBytes(16);
      const cipher = crypt.createCipheriv(this.#cryptType, this.#fideliusCharm, iv);
      const encrypted = cipher.update(stringValue.value, "utf8", "hex") + cipher.final("hex");

      encoded = iv.toString('hex') + ':' + encrypted + ':' + stringValue.type;
    });
    return encoded;
  }

  /**
   * Decodes a string
   * @param {string} - string The string to decode
   * @throws {Error} - If the string is not in the correct format
   * @returns {number|string|boolean|object|array} The decoded value
   */
  decode(string) {
    // Split the stored string into IV, encrypted data, and type
    const parts = string.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid string to decode.');
    }
    // Extract the IV
    const iv = Buffer.from(parts.shift(), 'hex');
    // Extract the encrypted data
    const encryptedText = Buffer.from(parts.shift(), 'hex');
    // Extract the type
    const type = parts.shift();

    const decipher = crypt.createDecipheriv(this.#cryptType, this.#fideliusCharm, iv);
    const decrypted = decipher.update(encryptedText, 'hex', 'utf8') + decipher.final('utf8');
    return this.toType(decrypted, type);
  }

}

/**
 * A simple cache map to cache some data which is expensive to fetch.
 *
 * @example
 * // Create a new cache
 * const cache = new Cache();
 *
 * // Add a value to the cache
 * cache.set('key', 'value', 60000); // The value will be removed from the cache after 60 seconds
 *
 * // Get a value from the cache
 * const value = cache.get('key'); // Returns 'value'
 *
 * // Check if a key is in the cache
 * const hasKey = cache.has('key'); // Returns true
 */
class Cache {
  /**
   * A Map to store the cache data. The keys are hashed keys and the values are objects containing the actual value and a timestamp.
   * @type {Map<number, {value: string, expiresOn: number|undefined,isObfusacated:boolean, type:String}>}
   */
  #data;

  /**
   * A flag to check if there is any reading going on
   * @type {boolean}
   */
  #isPaused = false;
  /**
 * A Map to store the cache temporarily data.
 * @type {Map<number, {value: string, expiresOn: number|undefined,isObfusacated:boolean, type:String, checksum: string}>}
 */
  #temp;

  /**
   * A write Queue, to queue the write operations, so that everything is in sync FIFO.
   */
  #writeQueue = new ProcessQueue(5000);

  /**
  * The number of milliseconds to wait between checks of the `isPaused` flag in a while loop.
  * 
  * A higher value reduces the frequency of checks, potentially improving performance, but
  * might increase the delay in responding to changes in the `isPaused` flag.
  * 
  *  @type {number}
  */
  #pauseCheckInterval = 10;


  /**
   * Constructs a new Cache object.
   * 
   * The constructor initializes a new Map to store the cache data and a new Obfuscator object.
   * It also sets up event handlers for the 'key_rotated' event of the Obfuscator.
   * 
   * When the 'key_rotated' event is emitted, the constructor does the following:
   * 1. Before the key is rotated, it decodes all data in the cache and copies it to a temporary Map.
   * 2. After the key is rotated, it pauses any read operations, re-encodes all data in the temporary Map using the new key, and copies it back to the cache. Then it resumes read operations and clears the temporary Map.
   * 
   * ## Collisions and Data Integrity:
  *
  * If URL strings are very long or contain special characters, the provided hashing function might not distribute hash values well. This could lead to increased collisions (multiple keys producing * * the same hash).
  *
  * Collisions can compromise data integrity in your cache, as different keys might overwrite each other.
   */
  constructor() {
    this.#data = new Map();
    /**  */
    this.obfuscate = new Obfuscator();
    /// before call back when the key is rotated.
    // Then, in your constructor or initialization method:
    this.obfuscate.before(this.obfuscate.events.key_rotated, this.#handleBeforeKeyRotated);
    this.obfuscate.on(this.obfuscate.events.key_rotated, this.#handleKeyRotated);
  }

  /**
   * Current Cache object as JSON object.
    * @returns {{[k: number]: {value: string, expiresOn: number | undefined, isObfusacated: boolean, type: string,checksum: string}}}
   */
  get table() {
    return Object.fromEntries(this.#data.entries());
  }

  /**
   * If read or write operations is paused.
   */
  get isPaused() {
    return this.#isPaused;
  }

  #handleBeforeKeyRotated = () => {
    // decode and copy all data to temp
    this.#temp = new Map(this.#data);
    this.#temp.forEach((object, key) => {
      object.value = this.obfuscate.decode(object.value);
    });
  }

  #handleKeyRotated = () => {
    // re encode all the cache back to
    this.#isPaused = true;
    this.destroy();
    this.#temp.forEach((object, key) => {
      object.value = this.obfuscate.encode(object.value);
    });
    this.#data = new Map(this.#temp);
    this.#isPaused = false;
    this.#temp.clear();
  }

  /**
   * Creates a hash key for the cache.
   *
   * Note: This algorithm is not cryptographically secure,
   * but it's simple and good enough for many non-security related purposes,
   * such as creating a hash key for a cache.
   * @private
   * @param {String} key - The key to hash.
   * @returns {number} - The hashed key.
   */
  #createHashKey(key) {
    /**@type {number} */
    let hash = parseInt(process.env?.CACHE_HASH_KEY_INITALIZER);
    // remove space from keys
    key = key.replace(/\s/g, '');
    if (!hash) {
      throw new Error("Cache hash key is not set.");
    }
    for (let i = 0; i < key.length; i++) {
      hash = (hash << 5) + hash + key.charCodeAt(i);
    }
    return hash;
  }


  /**
   * Function to start the cron or schedule the cache cleanup.
   *
   * @param {string} key - The key to associate with the value.
   * @param {Duration | null} expiration - The expiration cron string for the cache. If null, the cache will have the same lifespan as the application.
   * @throws {CacheException} - If the expiration is not a valid cron string.
   */
  #runCacheCleanup(key, expiration) {
    /// check if expiration is a string or number
    if (expiration) {
      const _timer = setUnboundedTimeout(() => {
        // delete cache.
        this.#data.delete(key);
        // clear the timer
        clearTimeout(_timer);
        console.info(`[INFO] Cache with key ${key} has been expired as per set duration ${expiration.toMilliseconds}.`);
      }, expiration.toMilliseconds);
    }
  }

  /**
   * Creates a checksum for the key
   * @param {string} key - The key for which checksum must be created.
   * @return {string} The checksum hex string
   */
  #createCheckSum(key) {
    const hash = crypt.createHash('sha256');
    hash.update(key);
    return hash.digest('hex');
  }

  /**
 * verifies a the checksum when there for similar keys, to 
 * @param {number} key - the key for which the checksum has to be validated, this is the hashed key.
 * @param {string} current_checksum - The current checksum.
 * @return {boolean} `true` if checksum is matching.
 * @private
 */
  #validateKeyCheckSum(key, current_checksum) {
    // for non-exsiting key return true.
    if (!this.#data.has(key)) {
      return true;
    }

    return this.#data.get(key).checksum === current_checksum;
  }

  /**
   * Pauses the execution of the current function if the cache is in a paused state.
   * It checks the paused state every `#pauseCheckInterval` milliseconds.
   * Execution resumes once the cache is no longer in a paused state.
   * 
   * @private
   * @async
   */
  async #pauseUntilOperationsResumed() {
    while (this.#isPaused) {
      await new Promise(resolve => setTimeout(resolve, this.#pauseCheckInterval)); // wait for 50ms before checking again
    }
    return;
  }

  /**
   * Retrieves a value from the cache.
   * @param {string} key - The key associated with the value to retrieve.
   * @returns {string|number|boolean|object|array|null} - The value associated with the key, or null if the key is not in the cache.
   */
  async read(key) {
    // if there is an read write operation block, this will awit until its unblocked.
    await this.#pauseUntilOperationsResumed();

    const cacheItem = this.#data.get(this.#createHashKey(key));
    if (!cacheItem) {
      return null;
    }

    if (cacheItem.isObfusacated) {
      return this.obfuscate.decode(cacheItem.value);
    }
    return cacheItem.value;
  }

  /**
   * Stores a value in the cache.
   *
   * **Note: Exisiting keys data will be updated/overwritten.**
   * 
   * 
   * @param {string} key - The key to associate with the value.
   * @param {any} value - The value to store.
   * @param {Duration|null} [expiration="never"] - The duration for which the cache is valid. If a Duration object is provided, the cache will expire after that duration. If null, the cache will not expire and will have the same lifespan as the application.
   * @param {boolean} [obfuscate=false] - Obfuscate the value before storing it in the cache, `false` by default.
   * @returns {Promise.<void>}
   */
  async write(key, value, expiration = "never", obfuscate = false) {
    let _value = value;
    /// set the type of value.
    const typeOfValue = Array.isArray(value) ? "array" : typeof value;
    // create hashed key.
    const hKey = this.#createHashKey(key);

    /// check the type of passed value
    if (typeOfValue === "function" || typeOfValue === "undefined" || typeOfValue === "symbol") {
      throw new CacheException(CacheException.code.NON_CACHABLE_VALUE, "Invalid value. Functions, undefined, and symbols cannot be stored in cache.", new Error(`${typeOfValue} cannot be stored as cache.`));
    }

    // if there is an read write operation block, this will awit until its unblocked.
    await this.#pauseUntilOperationsResumed();

    // check if the value needs to be obfuscated.
    if (obfuscate) {
      try {
        _value = this.obfuscate.encode(_value);
      } catch (err) {
        throw new CacheException(CacheException.code.UNABLE_TO_OBFUSCATE, "Failed to obfuscate value.", err);
      }
    }


   // add to write queue.
    this.#writeQueue.enqueue(() => {
      // Create the checksum for the key
      const keyCheckSum = this.#createCheckSum(key);

      // Validate the checksum for the existing key. For new keys, this function will return true.
      if (this.#validateKeyCheckSum(hKey, keyCheckSum)) {
        // If the checksum is valid, set the new data and schedule cache cleanup if necessary
        this.#data.set(hKey, { value: _value, expiresOn: expiration, isObfusacated: obfuscate, type: typeOfValue, checksum: keyCheckSum });
        // check if cache has expiration task.
        if (expiration !== "never") {
          this.#runCacheCleanup(hKey, expiration);
        }
      } else {
        // If the checksum validation fails, warn about a key collision, delete the existing cache, and do not store the new cache
        console.warn(`[WARNING] Key collision detected. The existing cache will be deleted and the new cache will not be stored.`);
        this.delete(key);
      }
    });
  }

  /**
   * Checks if a key is in the cache, could be used to check if a cache is expired.
   * @param {string} key - The key to check.
   * @returns {boolean} True if the key is in the cache, false otherwise.
   */
  has(key) {
    return this.#data.has(this.#createHashKey(key));
  }

  /**
 * Deletes a key from the cache.
 * 
 * If the key does not exist in the cache, this method will do nothing.
 * 
 * @param {string} key - The key to delete from the cache.
 * @returns {boolean} - Returns true if an element in the cache existed and has been removed, 
 * or false if the element does not exist.
 */
  delete(key) {
    return this.#data.delete(this.#createHashKey(key));
  }
  /**
   * Destroys the cache.
   *
   * This method pauses the cache, clears all data, and then unpauses the cache.
   * While the cache is paused, no operations can be performed on it.
   */
  destroy() {
    this.#isPaused = true;
    this.#data.clear();
    this.#isPaused = false;
  }
}


/**
 * A cache instance.
 */
const _kMasterCacheInstance = new Cache();
/**
 * This is the primary cache object used across the application.
 * It should be utilized unless a specific use case necessitates a different cache object.
 *
 * @example
 * // Utilizing the primary cache
 * MasterCache.set('key', 'value', 60000); // Sets 'key' to 'value' with a TTL of 60000 milliseconds
 * const value = MasterCache.get('key'); // Retrieves the value of 'key', which is 'value'
 */
const MasterCache = Object.freeze(_kMasterCacheInstance);

module.exports = { Cache, MasterCache, CacheException };
