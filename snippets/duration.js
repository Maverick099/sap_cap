const assert = require("node:assert");
/**
 * `Duration` is an object that represents a duration of time.
 * It accepts an object in the constructor that can contain time in milliseconds, seconds, minutes, hours, days, and weeks.
 * Each of these is optional and defaults to 0 if not provided.
 * The class provides methods to convert the duration to different units of time.
 *
 * @example
 * // Create a duration of 2 days and 4 hours
 * const duration = new Duration({ days: 2, hours: 4 });
 *
 * // Get the duration in different units
 * console.log(duration.toMilliseconds()); // Outputs: 180000000
 * console.log(duration.toSeconds());      // Outputs: 180000
 * console.log(duration.toMinutes());      // Outputs: 3000
 * console.log(duration.toHours());        // Outputs: 50
 * console.log(duration.toDays());         // Outputs: 2.0833333333333335
 * console.log(duration.toWeeks());        // Outputs: 0.2976190476190476
 */
class Duration {
  /**
   * stores current dureation in milliseconds.
   * @type {number}
   */
  #durationInMilliseconds;
  /**
   * Create a duration.
   * @param {Object} Time - The duration parameters.
   * @param {number} Time.milliseconds - The number of milliseconds.
   * @param {number} Time.seconds - The number of seconds.
   * @param {number} Time.minutes - The number of minutes.
   * @param {number} Time.hours - The number of hours.
   * @param {number} Time.days - The number of days.
   * @param {number} Time.weeks - The number of weeks.
   */
  constructor({ milliseconds = 0, seconds = 0, minutes = 0, hours = 0, days = 0, weeks = 0 }) {
    assert(typeof milliseconds === "number", "milliseconds must be a number");
    assert(typeof seconds === "number", "seconds must be a number");
    assert(typeof minutes === "number", "minutes must be a number");
    assert(typeof hours === "number", "hours must be a number");
    assert(typeof days === "number", "days must be a number");
    assert(typeof weeks === "number", "weeks must be a number");

    this.#durationInMilliseconds = milliseconds + seconds * 1000 + minutes * 1000 * 60 + hours * 1000 * 60 * 60 + days * 1000 * 60 * 60 * 24 + weeks * 1000 * 60 * 60 * 24 * 7;
  }

  /**
   * Creates a new Duration instance representing the specified number of milliseconds.
   * @param {number} milliseconds - The number of milliseconds.
   * @returns {Duration} A new Duration instance.
   */
  static milliseconds(milliseconds) {
    return new Duration({ milliseconds });
  }

  /**
   * Creates a new Duration instance representing the specified number of seconds.
   * @param {number} seconds - The number of seconds.
   * @returns {Duration} A new Duration instance.
   */
  static seconds(seconds) {
    return new Duration({ seconds });
  }

  /**
   * Creates a new Duration instance representing the specified number of minutes.
   * @param {number} minutes - The number of minutes.
   * @returns {Duration} A new Duration instance.
   */
  static minutes(minutes) {
    return new Duration({ minutes });
  }

  /**
   * Creates a new Duration instance representing the specified number of hours.
   * @param {number} hours - The number of hours.
   * @returns {Duration} A new Duration instance.
   */
  static hours(hours) {
    return new Duration({ hours });
  }

  /**
   * Creates a new Duration instance representing the specified number of days.
   * @param {number} days - The number of days.
   * @returns {Duration} A new Duration instance.
   */
  static days(days) {
    return new Duration({ days });
  }

  /**
   * Creates a new Duration instance representing the specified number of weeks.
   * @param {number} weeks - The number of weeks.
   * @returns {Duration} A new Duration instance.
   */
  static weeks(weeks) {
    return new Duration({ weeks });
  }

  /**
   * Get the duration in milliseconds.
   * @return {number} The duration in milliseconds.
   */
  get toMilliseconds() {
    return this.#durationInMilliseconds;
  }

  /**
   * Get the duration in seconds.
   * @return {number} The duration in seconds.
   */
  get toSeconds() {
    return this.#durationInMilliseconds / 1000;
  }

  /**
   * Get the duration in minutes.
   * @return {number} The duration in minutes.
   */
  get toMinutes() {
    return this.#durationInMilliseconds / (1000 * 60);
  }

  /**
   * Get the duration in hours.
   * @return {number} The duration in hours.
   */
  get toHours() {
    return this.#durationInMilliseconds / (1000 * 60 * 60);
  }

  /**
   * Get the duration in days.
   * @return {number} The duration in days.
   */
  get toDays() {
    return this.#durationInMilliseconds / (1000 * 60 * 60 * 24);
  }

  /**
   * Get the duration in weeks.
   * @return {number} The duration in weeks.
   */
  get toWeeks() {
    return this.#durationInMilliseconds / (1000 * 60 * 60 * 24 * 7);
  }

  /**
   * Converts the duration to a string in years, months, days, hours, minutes, seconds, and milliseconds.
   * 
   * @return {string} The duration as a formatted string.
   */
  toString() {
    const duration = this.#durationInMilliseconds;
    const milliseconds = duration % 1000;
    const seconds = Math.floor(duration / 1000) % 60;
    const minutes = Math.floor(duration / (1000 * 60)) % 60;
    const hours = Math.floor(duration / (1000 * 60 * 60)) % 24;
    const days = Math.floor(duration / (1000 * 60 * 60 * 24));
    const months = Math.floor(days / 30); // Assuming 30 days in a month (approximate)
    const years = Math.floor(months / 12);

    // Build the string with conditional checks for lagging zeros
    let result = "";
    if (years > 0) {
      result += `${years}Y `;
    }
    if (months > 0) {
      result += `${months % 12}M `; // Only show remaining months after calculating years
    }
    if (days > 0) {
      result += `${days % 30}D `; // Only show remaining days after calculating months
    }
    result += `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}mil`;
    return result.trim();
  }
}

module.exports = { Duration };
