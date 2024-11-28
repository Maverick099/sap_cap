const assert = require("node:assert");
const { Duration } = require("./duration");

/**
 * @typedef {Object} PoolOptions - Additional options for the pool.
 * @property {boolean} typeStrict - Determines if the pool should enforce a strict type check for its items.
 * @property {Duration} drainAfter - A TTL (time-to-live) for the pool, if null its never drained, else after the duration the whole pool is drained.
 */

/**
 * Abstract class representing a pool of objects.
 * This class defines the structure for a pool and requires subclasses to implement specific methods.
 */
class Pool {
    constructor(name) {
        // Ensure that the Pool class has a name
        if (name === undefined) {
            throw new Error("Pool must have a name");
        }
        /**
         * The name of the pool, unique to the pool.
         * @type {String}
         */
        this.name = name;
        // Prevent direct instantiation of the Pool class
        if (new.target === Pool) {
            throw new TypeError("Cannot construct Pool instances directly");
        }
        // Ensure that subclasses implement the required methods
        if (this.read === undefined) {
            throw new TypeError("Must override read");
        }
        if (this.remove === undefined) {
            throw new TypeError("Must override remove");
        }
        if (this.drain === undefined) {
            throw new TypeError("Must override drain");
        }
        if (this.add === undefined) {
            throw new TypeError("Must override add");
        }
    }

    /**
     * Adds an object to the pool.
     */
    add() {
        throw new Error("Method 'add()' must be implemented.");
    }

    /**
     * Reads an object from the pool.
     */
    read() {
        throw new Error("Method 'read()' must be implemented.");
    }

    /**
     * Removes an object from the pool.
     */
    remove() {
        throw new Error("Method 'remove()' must be implemented.");
    }

    /**
     * Drains all objects from the pool.
     */
    drain() {
        throw new Error("Method 'drain()' must be implemented.");
    }
}

/**
 * ScalablePool is a class that manages a pool of items. It supports adding, reading, and removing items from the pool.
 * It can operate in a type-strict mode where all items must be of the same type.
 * 
 * **Note: Continuously adding items to the pool without draining can have an adverse effect on memory usage.
 * Consider using the {@link drainAfter} parameter to automatically drain the pool after a certain duration,
 * or use a {@link Fixedpool} with a large size.**
 * 
 * @example
 * const pool = new ScalablePool(true); // Creates a pool with type-strict mode enabled
 * const id = pool.add("Hello, World!"); // Adds an item to the pool and returns its ID
 * console.log(pool.read(id)); // Reads the item from the pool using its ID
 * pool.drain(); // Removes all items from the pool
 */
class ScallablePool extends Pool {
    /**
     * contains all the 
     * @type {Array.<{value:any, id: String, createdAt:Date}}
     */
    #poolList;
    /**
     * @type {Map<string, any>}
     */
    #poolMap;

    /**
     * If the pool allows 
     * @type {boolean}
     */
    #isTypeStrict;


    /**
    * Constructs a new ScalablePool instance.
    * @param {String} name - The name of the pool, acts as a unique identifier.
    * @param {PoolOptions} [options={ typeStrict: false, drainAfter: undefined }] - Additional options for the pool.
    */
    constructor(name, options = { typeStrict: false, drainAfter: undefined }) {
        super(name);
        // duration must be undfined (a falsy value is accepted) or a duration instance
        assert(!options?.drainAfter || options?.drainAfter instanceof Duration, new Error('drainAfter must be a Duration instance or null'));
        this.#poolList = [];
        this.#poolMap = new Map();
        this.#isTypeStrict = options?.typeStrict;
        if (options?.drainAfter) {
            setTimeout(() => {
                this.drain();
                console.info(`Pool ${this.name} drained after`, options?.drainAfter.toString());
            }, options?.drainAfter.toMilliseconds);
        }
    }

    /**
   * Returns the number of items in the pool.
   * @returns {number} The number of items in the pool.
   */
    get size() {
        return this.#poolList.length;
    }


    /**
     * Adds a new item to the pool.
     * @param {any} data - The item to add to the pool.
     * @returns {String} The unique ID assigned to the added item.
     */
    add(data) {
        if (this.#isTypeStrict) {
            assert(this.#poolList.length === 0 || typeof this.#poolList[0].value === typeof data, new Error('type of data must be the same as existing data in the pool, or set typeStrict as false.'));
        }
        const id = crypto.randomUUID();
        this.#poolList.push({ value: data, id: id, createdAt: new Date() });
        this.#poolMap.set(id, data);
        return id;
    }

    /**
     * Reads an item from the pool by its ID.
     * @param {String} id - The ID of the item to read.
     * @returns {any} The item associated with the given ID.
     */
    read(id) {
        return this.#poolMap.get(id);
    }

    /**
     * Removes all items from the pool.
     */
    drain() {
        this.#poolList = [];
        this.#poolMap.clear();
    }

    /**
     * Returns a copy of the pool's items along with their metadata.
     * Optionally drains the pool.
     * @param {boolean} shouldDrain - Whether to drain the pool after piping its data.
     * @returns {Array.<{id: String, createdAt: Date, data: any}>} The items in the pool.
     */
    pipe(shouldDrain = false) {
        const pooleddata = this.#poolList.map((item) => ({ id: item.id, createdAt: item.createdAt, data: item.value }));
        if (shouldDrain) {
            this.drain();
        }
        return pooleddata;
    }

    /**
     * Removes and returns the last item added to the pool.
     * @returns {any} The value of the last item added to the pool, or undefined if the pool is empty.
     */
    pop() {
        const data = this.#poolList.pop();
        if (data) {
            this.#poolMap.delete(data.id);
        }
        return data?.value;
    }

    /**
     * Returns the first item in the pool without removing it.
     * @returns {any} The value of the first item in the pool, or undefined if the pool is empty.
     */
    first() {
        return this.#poolList[0]?.value;
    }

    /**
     * Returns the last item in the pool without removing it.
     * @returns {any} The value of the last item in the pool, or undefined if the pool is empty.
     */
    last() {
        return this.#poolList[this.#poolList.length - 1]?.value;
    }

    /**
     * Executes a provided function once for each pool item.
     * @param {Function} callback - Function to execute for each element, taking two arguments: value and index.
     */
    forEach(callback) {
        this.#poolList.forEach((item, index) => callback(item.value, index, item.createdAt));
    }

    /**
     * Symbol.iterator makes the ScalablePool iterable using the for...of loop.
     * @returns {Iterator} An iterator that allows the pool to be iterated over.
     */
    [Symbol.iterator]() {
        let index = 0;
        // making a shallow copy.
        const poolList = [...this.#poolList];
        return {
            next: function () {
                if (index < poolList.length) {
                    return { value: poolList[index++].value, done: false };
                } else {
                    return { done: true };
                }
            }
        };
    }

}


class FixedPool extends Pool {

}

module.exports = { ScallablePool, FixedPool }