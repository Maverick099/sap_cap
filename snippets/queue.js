const assert = require('node:assert');

/**
 * @callback processCompleteCallback
 * @param {*|undefined|error} result - The result of when the queued function execution is completed.
 */


/**
 * A simple queue implementation to overcome the randomess of js async funcitions calls for  particlar class object.
 * 
 * So that the first call can be processed first and then the second call and so on.
 * 
 * @example
 * const queue = new Queue(3);
 * queue.enqueue(1);
 * queue.enqueue(2);
 * queue.enqueue(3);
 * queue.dequeue(); // 1
 * queue.dequeue(); // 2
 * queue.dequeue(); // 3
 * 
 * @class
 */
class Queue {
    /**
     * Create a queue.
     * @param {number} capacity - Maximum size of the queue.
     */
    constructor(capacity) {
        this.capacity = capacity; // Maximum size of the queue
        this.items = new Array(capacity); // Initialize array to hold items
        this.front = this.size = 0; // Indices for front and size
        this.rear = capacity - 1; // Initialize rear index to the end
    }

    /**
     * Add an item to the end of the queue.
     * @param {*} item - The item to add.
     * @throws {Error} If the queue is full.
     */
    enqueue(item) {
        if (this.isFull()) {
            throw new Error("Queue is full");

        }
        this.rear = (this.rear + 1) % this.capacity; // Circular array approach
        this.items[this.rear] = item; // Add the item at the rear
        this.size++; // Increment the size
    }

    /**
     * Remove an item from the front of the queue.
     * @returns {*} The removed item.
     * @throws {Error} If the queue is empty.
     */
    dequeue() {
        if (this.isEmpty()) {
            throw new Error("Queue is empty");
        }
        const item = this.items[this.front]; // Get the front item
        this.items[this.front] = undefined; // Clear the front element
        this.front = (this.front + 1) % this.capacity; // Circular array approach
        this.size--; // Decrement the size
        return item; // Return the removed item
    }

    /**
     * Check if the queue is empty.
     * @returns {boolean} True if the queue is empty, false otherwise.
     */
    isEmpty() {
        return this.size === 0;
    }

    /**
     * Check if the queue is full.
     * @returns {boolean} True if the queue is full, false otherwise.
     */
    isFull() {
        return this.size === this.capacity;
    }

    /**
     * Get the item at the front of the queue without removing it.
     * @returns {*} The item at the front of the queue.
     * @throws {Error} If the queue is empty.
     */
    peek() {
        if (this.isEmpty()) {
            throw new Error("Queue is empty");
        }
        return this.items[this.front]; // Return the front item
    }
}






/**
 * A queue class that manages the asynchronous execution of functions in a sequential manner.
 *
 * @example
 * // Example Usage
 * const queue = new ProcessQueue(3);
 *
 * function function1() {
 *  return new Promise((resolve) => setTimeout(() => resolve('Function 1 result'), 1000));
 * }
 *
 * function function2(data) {
 *  console.log('Function 2 processing data:', data);
 * }
 *
 * queue.enqueue(function1, function2);
 * 
 * queue.enqueue(async () => {
 *  const data = await fetch('https://api.example.com/data');
 *  return data.json();
 * });
 *
 * queue.enqueue(() => {
 *  console.log('Function 3 execution');
 * });
 *
 * queue.process();
 *
 * @extends Queue
 */
class ProcessQueue extends Queue {
    /**
     * Creates a new ProcessQueue instance with the specified capacity.
     *
     * @param {number} capacity - The maximum number of functions that can be held in the queue.
     */
    constructor(capacity) {
        super(capacity);
        /**
         * @private {boolean}
         */
        this.isExecuting = false;
    }

    /**
     * Adds the provided function to the queue for asynchronous execution.
     *
     * @param {Function} item - The function to be added to the process queue.
     * @param {processCompleteCallback| undefined} [processCompleteCallback=null] - The optional callback function to be called when the function is completed.
     * @throws {Error} - If the provided item is not a function.
     * @override
     */
    enqueue(item, processCompleteCallback = null) {
        assert(typeof item === 'function', new Error('Passed itemNo to enqueue must be a function'))
        assert(!processCompleteCallback || typeof processCompleteCallback === 'function', new Error('processCompleteCallback must be a function.'));
        super.enqueue({ function: item, callback: processCompleteCallback });

        // Call process if not already processing
        if (!this.isExecuting) {
            this.execute();
        }
    }

    /**
     * Starts processing the queue asynchronously, one function at a time.
     */
    async execute() {
        if (this.isEmpty() || this.isExecuting) {
            return;
        }

        this.isExecuting = true;

        try {
            while (!this.isEmpty()) {
                const { function: item, callback } = this.dequeue();

                if (!item) {
                    console.warn('[PROCESS_QUEUE][WARN]Skipping empty item in queue');
                    continue;
                }

                const result = await item();
                if (callback) {
                    await callback(result);
                }
            }
        } catch (error) {
            console.error('[PROCESS_QUEUE][ERROR] Error during completing current process queue:', error);
        } finally {
            this.isExecuting = false;
        }
    }
}


module.exports = { Queue, ProcessQueue }