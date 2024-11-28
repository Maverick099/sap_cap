const assert = require('node:assert');

/**
 * A helper class with functions to complete process/executions of code in a particular way.
 */
class Process {
    /**
    * A function that executes an array of promises concurrently with a specified limit.
    * 
    * It uses Promise.all() to execute a batch of promises concurrently, and it manages the concurrency limit by dividing the promises into batches.
    * Each batch contains a number of promises equal to the concurrency limit.
    * 
    * The function executes each batch sequentially, waiting for the current batch to finish before starting the next one.
    * 
    * **Note:The input array should contain functions that return promises, not the promises themselves. 
    * Each function is called when its batch is processed. If you pass in promises directly, they will all start executing immediately, 
    * not in batches. Example: Instead of `const promises = [asyncFunction()]`, use `const promises = [() => asyncFunction()]`.**
    * 
    * 
    * @param {Array.<Promise>} promises - An array of promises to execute.
    * @param {number} [batchSize=10] - The number of promises to execute concurrently.
    * @param {number} [delay=0] - The delay in milliseconds to wait between each batch of promises.
    * @returns {Promise.<Array>} A promise that resolves to an array of results. The order of the results corresponds to the order of the input promises.
    * 
    *@example
    * 
    * async function asyncFunction(i) {
    *   return new Promise((resolve) => {
    *     setTimeout(() => resolve(i), 1000);
    *   });
    * }
    * 
    * const promises = Array.from({ length: 20 }, (_, i) => () => asyncFunction(i));
    * 
    * Process.promiseInBatches(promises, 5, 2000)
    *   .then(results => console.log(results))
    *   .catch(error => console.error(error));
    *
    */
    static async promiseInBatches(promises, batchSize = 10, delay = 0) {
        const results = []; // This array will hold the results of all promises.
        const promisesCopy = [...promises]; // Create a copy of the promises array so we can modify it without affecting the original array.

        // While there are still promises left to execute...
        while (promisesCopy.length) {
            const batch = promisesCopy.splice(0, batchSize);

            // run all promises in parallel.
            const batchResults = await Promise.all(batch.map(func => func()));

            // Add the results of the current batch to the results array.
            results.push(...batchResults);
            // Wait for the specified delay before starting the next batch.
            await new Promise((resolve) => setTimeout(resolve, delay));
        }

        // Return a promise that resolves to the array of results.
        return results;
    }


    /**
    * Executes an array of promises with a constant concurrency limit.
    * 
    * This function is not "fail-fast", unlike Promise.all. If one promise rejects, 
    * the function continues to process the remaining promises. The error thrown by a 
    * rejected promise is stored in the results array at the corresponding index.
    * 
    * @example
    * const promises = [
    *   new Promise((resolve) => setTimeout(() => resolve('result1'), 1000)),
    *   new Promise((resolve) => setTimeout(() => resolve('result2'), 500)),
    *   new Promise((resolve) => setTimeout(() => resolve('result3'), 2000))
    * ];
    *
    * Process.promiseWithConstantConcurrency(promises, 2).then(console.log);
    * // Logs ['result1', 'result2', 'result3'] after approximately 2.5 seconds.
    * 
    * @param {Array<Promise>} promises - An array of promises to be executed.
    * @param {number} concurrency - The maximum number of promises to be executed concurrently.
    * @returns {Promise<Array>} A promise that resolves to an array of the results of the input promises, in the same order as the input array.
    */
    static async promiseWithConstantConcurrency(promises, concurrency) {
        const results = new Array(promises.length);
        // making a copy of the promises array to avoid modifying the original array
        const promisesCopy = [...promises];

        // array to store the running promises
        const pool = [];

        // function to remove current promise from running pool.
        const removePromise = (promise) => {
            const index = pool.indexOf(promise);
            pool.splice(index, 1);
        };

        // Loop until all promises have been processed
        while (promisesCopy.length || pool.length) {
            if (pool.length < concurrency && promisesCopy.length) {
                // Get the index of the current promise
                const currentIndex = promises.length - promisesCopy.length;
                // Get the next promise to execute
                const promise = promisesCopy.shift();
                // Execute the promise and store the result
                const promiseWithIndex = promise.then(result => {
                    results[currentIndex] = result;
                    return;
                }).catch(err => {
                    results[currentIndex] = err;
                    return;
                }).finally(() => {
                    // splice the promise from the running promises array
                    removePromise(promiseWithIndex);
                });

                pool.push(promiseWithIndex);
            }
            // Wait for the next promise to resolve or reject
            await Promise.race(pool);
        }

        return results;
    }


    /**
    * Resolves an array of promises or async functions either in parallel or in sequence.
    *
    * @param {Array<Promise|Function>} promises - An array of Promise objects or async functions.
    * @param {boolean} [parallel=false] - If true, resolves all promises or async functions in parallel. If false or not provided, resolves promises or async functions in sequence.
    * @returns {Promise<Array>} A Promise that resolves to an array of results of the input promises or async functions. The order of the results matches the order of the input promises or async functions. In sequential mode, it does not follow the fail-fast behavior, but the array contains the error object for the failed promise or async function which can be evaluated if needed.
    *
    * @example
    * // Parallel execution
    * let promise1 = Promise.resolve(3);
    * let promise2 = 42;
    * let asyncFunc = async () => 'foo';
    * 
    * Process.all([promise1, promise2, asyncFunc], true).then(console.log); // [3, 42, 'foo']
    *
    * @example
    * // Sequential execution
    * let promise1 = new Promise((resolve, reject) => {
    *   setTimeout(resolve, 300, 'first');
    * });
    * let promise2 = new Promise((resolve, reject) => {
    *   setTimeout(resolve, 200, 'second');
    * });
    * let asyncFunc = async () => {
    *   throw new Error('third async function failed');
    * };
    * 
    * Process.all([promise1, promise2, asyncFunc]).then(console.log); // ['first', 'second', Error: 'third async function failed']
    */
    static async all(promises, parallel = false) {
        if (parallel) {
            return await Promise.all(promises.map(promise => typeof promise === 'function' ? promise() : promise));
        } else {
            return await promises.reduce(async (chainedResultsPromise, currentTask) => {
                const chainedResults = await chainedResultsPromise;
                try {
                    const currentResult = typeof currentTask === 'function' ? await currentTask() : await currentTask;
                    chainedResults.push(currentResult);
                    return chainedResults;
                } catch (err) {
                    chainedResults.push(err);
                    return chainedResults;
                }
            }, Promise.resolve([]));
        }
    }

    /**
     * Awaits and returns the value of the first promise in the provided list.
     * 
     * Then, asynchronously executes the remaining promises using `Promise.all`, which allows them to resolve
     * or reject independently. However, `Promise.all` follows a fail-fast behavior, meaning if any of the remaining promises
     * rejects, `Promise.all` immediately rejects with the reason of the first promise that rejects, and reject reason is passed to the {@link errorCallback}.
     * 
     * If the first promise fails, the execution of the next promises
     * will be canceled, aligning with the fail-fast principle by immediately rejecting the whole operation.
     * 
     * If {@link errorCallback} is undefined, then an error is thrown for the first promise's rejection, else it's not thrown since it expects the user to handle it using the error callback.
     * 
     * Optional callback functions can be provided to handle
     * the results ({@link callback}) or errors ({@link errorCallback}) of the remaining promises.
     *
     * @param {Promise<any>[]} promises An array of promises to be executed. The array must not be empty.
     * @param {Function|undefined} callback An optional callback function that receives an array containing the results (values or rejection reasons) of all promises after the first one (in the same order). This function is called only if all promises resolve successfully.
     * @param {Function|undefined} errorCallback An optional error callback function that receives the reason for any rejection encountered during the asynchronous execution of the remaining promises. This function is called immediately when any of the promises in `Promise.all` rejects.
     * @returns {Promise<any>} A promise that resolves with the value of the first promise. If the first promise rejects, the function will return a rejected promise with the same rejection reason, and the execution of subsequent promises will be canceled.
     * 
     * @example
     * // Example with promises that resolve successfully
     * const promises = [
     *   Promise.resolve('first'),
     *   Promise.resolve('second'),
     *   Promise.resolve('third')
     * ];
     * resolveFirstAndThenRest(promises, (results) => {
     *   console.log('All promises resolved:', results);
     * }, (error) => {
     *   console.error('A promise failed:', error);
     * }).then(firstResult => console.log('First promise result:', firstResult));
     * 
     * @example
     * // Example where the first promise rejects
     * const promises = [
     *   Promise.reject(new Error('First failed')),
     *   Promise.resolve('second'),
     *   Promise.resolve('third')
     * ];
     * resolveFirstAndThenRest(promises, (results) => {
     *   console.log('This will not be called');
     * }, (error) => {
     *   console.error('Error handling:', error);
     * }).catch(error => console.error('First promise failed:', error));
     */
    static async resolveFirstAndThenRest(promises, callback, errorCallback) {
        assert(promises.length > 0, new Error('promises must be a valid array of functions or promises.'));
        const promisesCopy = [...promises];
        // extract the first promise
        const firstPromise = promisesCopy.shift();

        try {
            // Correctly await the first promise
            const firstResult = await (typeof firstPromise === 'function' ? firstPromise() : firstPromise);

            // Asynchronously handle the rest of the promises
            if (promisesCopy.length > 0) {
                Promise.all(promisesCopy.map(promise => typeof promise === 'function' ? promise() : promise))
                    .then(results => callback && callback([firstResult, ...results]))
                    .catch(err => {
                        if (errorCallback) {
                            errorCallback(err);
                        }
                    });
            }

            // Return the first promise result
            return firstResult;
        } catch (err) {
            // Handle errors from the first promise
            if (errorCallback) {
                await errorCallback(err);
                return;
            }
            // Rethrow the error to maintain the function's promise rejection behavior
            throw err;
        }
    }
}


module.exports = { Process }