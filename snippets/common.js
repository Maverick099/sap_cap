"use strict";
/* eslint-disable no-unused-vars */
/**
 * All common functions.
 */
const https = require("https");
const http = require("http");
const { finished } = require("stream");
const { promisify } = require("util");
const { assert } = require("console");

/**Proxy type that SAP BTP destinations use. */
const PROXYTYPE = { INTERNET: "Internet", ONPREMISE: "OnPremise", NONE: "none" };

/**HTTP Protocol types */
const PROTOCOL = { HTTP: "http:", HTTPS: "https:" };

/**
 * @enum {Number} HTTP_STATUS
 * @readonly
 * Standard HTTP Codes
 */
const HTTP_STATUS = {
  /** @property {Number} OK - 200: The request has succeeded */
  OK: 200,
  /** @property {Number} CREATED - 201: The request has been fulfilled and has resulted in one or more new resources being created */
  CREATED: 201,
  /** @property {Number} ACCEPTED - 202: The request has been accepted for processing, but the processing has not been completed */
  ACCEPTED: 202,
  /** @property {Number} NO_CONTENT - 204: The server has successfully fulfilled the request and there is no additional content to send in the response payload body */
  NO_CONTENT: 204,
  /** @property {Number} PARTIAL_CONTENT - 206: The server is delivering only part of the resource due to a range header sent by the client */
  PARTIAL_CONTENT: 206,
  /** @property {Number} MULTIPLE_CHOICES - 300: The request has more than one possible response */
  MULTIPLE_CHOICES: 300,
  /** @property {Number} MOVED_PERMANENTLY - 301: The URI of the requested resource has been changed permanently */
  MOVED_PERMANENTLY: 301,
  /** @property {Number} FOUND - 302: The URI of the requested resource has been changed temporarily */
  FOUND: 302,
  /** @property {Number} SEE_OTHER - 303: The response to the request can be found under another URI using a GET method */
  SEE_OTHER: 303,
  /** @property {Number} NOT_MODIFIED - 304: The resource has not been modified since the version specified by the request headers If-Modified-Since or If-None-Match */
  NOT_MODIFIED: 304,
  /** @property {Number} TEMPORARY_REDIRECT - 307: The URI of the requested resource has been changed temporarily */
  TEMPORARY_REDIRECT: 307,
  /** @property {Number} PERMANENT_REDIRECT - 308: The URI of the requested resource has been changed permanently */
  PERMANENT_REDIRECT: 308,
  /** @property {Number} BAD_REQUEST - 400: The server could not understand the request due to invalid syntax */
  BAD_REQUEST: 400,
  /** @property {Number} UNAUTHORIZED - 401: The client must authenticate itself to get the requested response */
  UNAUTHORIZED: 401,
  /** @property {Number} FORBIDDEN - 403: The client does not have access rights to the content */
  FORBIDDEN: 403,
  /** @property {Number} NOT_FOUND - 404: The server can not find the requested resource */
  NOT_FOUND: 404,
  /** @property {Number} CONFLICT - 409: The request could not be completed due to a conflict with the current state of the resource */
  CONFLICT: 409,
  /** @property {Number} IAM_A_TEAPOT - 418: The server refuses to brew coffee because it is, permanently, a teapot.*/
  IAM_A_TEAPOT: 418,
  /** @property {Number} UNPROCESSABLE_CONTENT 422: The request cannot be processed since sever understands the content type and syntax is correct but unable to process it.*/
  UNPROCESSABLE_CONTENT: 422,
  /** @property {Number} INTERNAL_SERVER_ERROR - 500: The server has encountered a situation it doesn't know how to handle */
  INTERNAL_SERVER_ERROR: 500,
  /** @property {Number} BAD_GATEWAY - 502: The server was acting as a gateway or proxy and received an invalid response from the upstream server */
  BAD_GATEWAY: 502,
  /** @property {Number} SERVICE_UNAVAILABLE - 503: The server is not ready to handle the request */
  SERVICE_UNAVAILABLE: 503,
  /** @property {Number} GATEWAY_TIMEOUT - 504: The server is acting as a gateway or proxy and did not receive a timely response from the upstream server */
  GATEWAY_TIMEOUT: 504,
};

/**
 *
 * @enum {String} HTTP_METHOD Standard HTTP methods.
 * @readonly
 */
const HTTP_METHOD = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
  HEAD: "HEAD",
  OPTIONS: "OPTIONS",
  TRACE: "TRACE",
  CONNECT: "CONNECT",
};

/**
 * A asynchronous wraper for finished used to notify if the passed
 * stream is no longer readable, writable or has experienced an error or a premature close event
 */
const finishedAsync = promisify(finished);

/**
 * Conversts UNIX time to  readable in readable format.
 * @param {Number} dateTime in UTC UNIX time format as a integer.
 * @returns {String} datetime in UTC string format.
 */
function convertUNIXToUTC(dateTime) {
  // 172800 3 days in unix time format.
  // 86399 one day in unix time format.
  return new Date(dateTime).toUTCString();
}

/**
 * This function converts the exponential number to decimal (since Db data contains exponential data)
 * @param {String} numIn exponent number in string format.
 * @returns {Number}  Returns a decimal number.
 */
function numberExponentToLarge(numIn) {
  numIn += ""; // To cater to numric entries
  var sign = ""; // To remember the number sign
  numIn.charAt(0) == "-" && ((numIn = numIn.substring(1)), (sign = "-")); // remove - sign & remember it
  var str = numIn.split(/[eE]/g); // Split numberic string at e or E
  if (str.length < 2) return sign + numIn; // Not an Exponent Number? Exit with orginal Num back
  var power = str[1]; // Get Exponent (Power) (could be + or -)
  // eslint-disable-next-line no-compare-neg-zero
  if (power == 0 || power == -0) return sign + str[0]; // If 0 exponents (i.e. 0|-0|+0) then That's any easy one

  var deciSp = (1.1).toLocaleString().substring(1, 2); // Get Deciaml Separator
  str = str[0].split(deciSp); // Split the Base Number into LH and RH at the decimal point
  var baseRH = str[1] || "", // RH Base part. Make sure we have a RH fraction else ""
    baseLH = str[0]; // LH base part.

  if (power > 0) {
    // ------- Positive Exponents (Process the RH Base Part)
    if (power > baseRH.length) baseRH += "0".repeat(power - baseRH.length); // Pad with "0" at RH
    baseRH = baseRH.slice(0, power) + deciSp + baseRH.slice(power); // Insert decSep at the correct place into RH base
    if (baseRH.charAt(baseRH.length - 1) == deciSp) baseRH = baseRH.slice(0, -1); // If decSep at RH end? => remove it
  } else {
    // ------- Negative Exponents (Process the LH Base Part)
    let num = Math.abs(power) - baseLH.length; // Delta necessary 0's
    if (num > 0) baseLH = "0".repeat(num) + baseLH; // Pad with "0" at LH
    baseLH = baseLH.slice(0, power) + deciSp + baseLH.slice(power); // Insert "." at the correct place into LH base
    if (baseLH.charAt(0) == deciSp) baseLH = "0" + baseLH; // If decSep at LH most? => add "0"
  }
  return sign + baseLH + baseRH; // Return the long number (with sign)
}

/**
 * @typedef httpresponse
 * @property {Number|undefined} status
 * @property {String|undefined} status_message
 * @property {Object|String|null} body
 * @property {https.IncomingHttpHeaders} headers
 *
 */
/**
 * Encodes a string into BASE_64
 * @param {String} clientId Client Id.
 * @param {String} secret Client Secret.
 * @returns {String} base64 encoded value as a string.
 */
function base64Encode(clientId, secret) {
  console.info("[INFO] BASE64ENCODING method invoked.");
  let buff = Buffer.from(`${clientId}:${secret}`);
  return buff.toString("base64");
}

/**
 * HTTPS request wrapped in a promise to retrun the HTTP request result.
 *
 * @param {https.RequestOptions} config HTTP request configuration with url, path, method and headers.
 * @param {String | Buffer | null} data Data in string formnat.
 * @param {boolean} captureErrorResponse Flag to capture the error respone on 1xx, 3XX, 4XX and 5XX HTTP errors. Defaults to `false`.
 * @returns {Promise.<httpresponse>} A JSON object with result or rejected promise with error message.
 */
function HTTPSRequest(config, data = null, captureErrorResponse = false) {
  return new Promise((resolve, reject) => {
    console.info(`[INFO] HTTPS ${config.method} request to ${config.hostname ?? config.host} invoked.`);
    let _res = {};
    let _data = [];
    //var callFunc = function (res) { };
    const req = https.request(config, function (res) {
      try {
        console.info(`[INFO] HTTPS call status: ${res.statusCode}| ${res.statusMessage}`);

        //checks for unsuccessful request.
        if ((res.statusCode < Number(200) || res.statusCode >= Number(300)) && !captureErrorResponse) {
          throw new Error(`{ "status_code": ${res.statusCode}, "status": "${res.statusMessage}"}`);
        }

        /// Appends recieved data chunks.
        res.on("data", (chunk) => {
          _data.push(chunk);
        });

        /// function to run on end of request.
        res.on("end", function () {
          _res.headers = res.headers;
          _res.status = res.statusCode;
          _res.status_message = res.statusMessage;
          try {
            _res.body = JSON.parse(Buffer.concat(_data).toString());
            resolve(_res);
          } catch (err) {
            if (err instanceof SyntaxError) {
              _res.body = Buffer.concat(_data).toString();
              resolve(_res);
            } else {
              throw new Error(`{"status":500, "message":"Error while decoding the HTTPS response", "response": "${err.message}"`);
            }
          }
        });

        res.on("timeout", function () {
          console.error("[ERROR] Timeout occured when requesting details from:" + config.hostname ?? config.host + config.path);
          throw new Error(`{ "status_code": 504, "status": "Gateway Timeout error" }`);
        });

        /// on error event.
        /// throw an Error passing the current err.
        res.on("error", (err) => {
          throw err;
        });
      } catch (err) {
        console.error(`[ERROR] Error while doing a HTTPS ${config.method} request to ${config.hostname ?? config.host}: ${err.message}.\nSTACKTRACE: ${err.stack}`);
        console.error(`\n[ERROR_RESPONSE] Captured Data: ${_data}.\n`);
        reject(new Error(`{ "status_code": 500, "message": "Internal_Server_Error: While doing a http ${config.method} request to ${config.host + config.path}", "error": ${err.message} }`));
      }
    });

    /// timeout event listener.
    req.on("timeout", function () {
      console.error(`[ERROR] Timeout occured when doing ${config.method} call to: ` + config.hostname ?? config.host + config.path);
      reject(new Error(`{ "status_code": 504, "message": "Gateway Timeout error on ${config.method} for url: ${config.hostname ?? config.host}." }`));
    });

    // Writing data if data prameter is not null.
    if (data !== null) {
      if (Buffer.isBuffer(data)) {
        req.write(data);
      } else {
        req.write(data, "utf-8");
      }
    }

    req.end();
  });
}

/**
 * HTTP request wrapped in a promise to retrun the HTTP request result.
 *
 * @param {https.RequestOptions} config HTTP request configuration with url, path, method and headers.
 * @param {String | Buffer | null} data Data in string formnat.
 * @param {boolean} captureErrorResponse Flag to capture the error respone on 1xx, 3XX, 4XX and 5XX HTTP errors. Defaults to `false`.
 * @returns {Promise.<httpresponse>} A JSON object with result or rejected promise with error message.
 */
function HTTPRequest(config, data = null, captureErrorResponse = false) {
  return new Promise((resolve, reject) => {
    console.info(`[INFO] HTTP ${config.method} request to ${config.hostname ?? config.host + config.path} invoked.`);
    let _res = {};
    let _data = [];

    const req = http.request(config, function (res) {
      try {
        console.info(`[INFO] HTTP call status: ${res.statusCode}| ${res.statusMessage}`);

        //checks for unsuccessful request.
        if ((res.statusCode < Number(200) || res.statusCode >= Number(300)) && !captureErrorResponse) {
          throw new Error(`{ "status_code": ${res.statusCode}, "status": "${res.statusMessage}"}`);
        }

        /// Appends recieved data chunks.
        res.on("data", (chunk) => {
          _data.push(chunk);
        });

        /// function to run on end of request.
        res.on("end", function () {
          _res.headers = res.headers;
          _res.status = res.statusCode;
          _res.status_message = res.statusMessage;
          try {
            _res.body = JSON.parse(Buffer.concat(_data).toString());
            resolve(_res);
          } catch (err) {
            if (err instanceof SyntaxError) {
              _res.body = Buffer.concat(_data).toString();
              resolve(_res);
            } else {
              throw new Error(`{"status":500, "message":"Error while decoding the HTTP response", "response": "${err.message}"`);
            }
          }
        });

        res.on("timeout", function () {
          console.error("[ERROR] Timeout occured when requesting details from:" + config.hostname ?? config.host + config.path);
          throw new Error(`{ "status_code": 504, "status": "Gateway Timeout error" }`);
        });

        /// on error event.
        /// throw an Error passing the current err.
        res.on("error", (err) => {
          throw err;
        });
      } catch (err) {
        console.error(`[ERROR] Error while doing a HTTP ${config.method} request to ${config.hostname ?? config.host}: ${err.message}.\nSTACKTRACE: ${err.stack}`);
        console.error(`\n[ERROR_RESPONSE] Captured Data: ${_data}.\n`);
        reject(new Error(`{ "status_code": 500, "message": "Internal_Server_Error: While doing a http ${config.method} request to ${config.host + config.path}", "error": ${err.message} }`));
      }
    });

    /// timeout event listener.
    req.on("timeout", function () {
      console.error(`[ERROR] Timeout occured when doing ${config.method} call to: ` + config.hostname ?? config.host + config.path);
      reject(new Error(`{ "status_code": 504, "message": "Gateway Timeout error on ${config.method} for url: ${config.hostname ?? config.host}." }`));
    });

    // Writing data if data prameter is not null.
    if (data !== null) {
      if (Buffer.isBuffer(data)) {
        req.write(data);
      } else {
        req.write(data, "utf-8");
      }
    }

    req.end();
  });
}

/**
 * HTTP request wrapped in a promise to retruns the response headers.
 *
 * @param {} config HTTP request configuration with url, path, method and headers.
 * @returns {Promise} A JSON object with result or rejected promise with error message.
 */
function getHTTPResponseHeaders(config) {
  return new Promise((resolve, reject) => {
    console.info(`[INFO] HTTP ${config.method} request to ${config.host + config.path} invoked.`);
    let _res;
    // let _url = new Url(url);

    const req = http.request(config, function (res) {
      console.info(`[INFO] HTTP call status: ${res.statusCode}| ${res.statusMessage}`);
      try {
        let _data = [];
        //checks for unsuccessful request.
        if (res.statusCode < 200 || res.statusCode >= 300) {
          throw new Error(`{ "status_code": ${res.statusCode}, "status": ${res.statusMessage}}`);
        }

        /// Appends recieved data chunks.
        /// techically nedded beacuse will consume time till full response is recieved and all headers can be returned.
        res.on("data", (chunk) => _data.push(chunk));

        /// function to run on end of request.
        res.on("end", function () {
          resolve(res.headers);

          /// on error event.
          /// throw an Error passing the current err.
          res.on("error", (err) => {
            throw err;
          });

          res.on("timeout", function () {
            console.error("[ERROR] Timeout occured when requesting details from:" + config.host + config.path);
            throw new Error({ status_code: 504, status: "Gateway Timeout error" });
          });
        });
      } catch (err) {
        console.error(`[ERROR] Error while retreving headers from ${config["host"]}: ${err.message}.\nSTACKTRACE: ${err.stack}`);
        reject(new Error(`{ "status_code": '500', "message": 'Internal server error: While doing a http ${config.method} request to ${config.host + config.path} - Error: ${err.message}' }`));
      }
    });

    /// timeout event listener.
    req.on("timeout", function () {
      console.error(`[ERROR] Timeout occured when doing ${config.method} call to: ` + config.host + config.path);
      reject(new Error(`{ "status_code": 504, "message": Gateway Timeout error on ${config.method} for url: ${config.host}.' }`));
    });

    req.end();
  });
}

/**
 * HTTPS request wrapped in a promise to retruns the response headers.
 *
 * @param {} config HTTP request configuration with url, path, method and headers.
 * @returns {Promise} A JSON object with result or rejected promise with error message.
 */
function getHTTPSResponseHeaders(config) {
  return new Promise((resolve, reject) => {
    console.info(`[INFO] HTTP ${config.method} request to ${config.host + config.path} invoked.`);
    let _res;
    // let _url = new Url(url);

    const req = https.request(config, function (res) {
      console.info(`[INFO] HTTP call status: ${res.statusCode}| ${res.statusMessage}`);
      try {
        let _data = [];
        //checks for unsuccessful request.
        if (res.statusCode < 200 || res.statusCode >= 300) {
          throw new Error(`{ "status_code": ${res.statusCode}, "status": ${res.statusMessage}}`);
        }

        /// Appends recieved data chunks.
        /// techically nedded beacuse will consume time till full response is recieved and all headers can be returned.
        res.on("data", (chunk) => _data.push(chunk));

        /// function to run on end of request.
        res.on("end", function () {
          resolve(res.headers);

          /// on error event.
          /// throw an Error passing the current err.
          res.on("error", (err) => {
            throw err;
          });

          res.on("timeout", function () {
            console.error("[ERROR] Timeout occured when requesting details from:" + config.host + config.path);
            throw new Error({ status_code: 504, status: "Gateway Timeout error" });
          });
        });
      } catch (err) {
        console.error(`[ERROR] Error while retreving headers from ${config["host"]}: ${err.message}.\nSTACKTRACE: ${err.stack}`);
        reject(new Error(`{ "status_code": '500', "message": 'Internal server error: While doing a http ${config.method} request to ${config.host + config.path} - Error: ${err.message}' }`));
      }
    });

    /// timeout event listener.
    req.on("timeout", function () {
      console.error(`[ERROR] Timeout occured when doing ${config.method} call to: ` + config.host + config.path);
      reject(new Error(`{ "status_code": 504, "message": Gateway Timeout error on ${config.method} for url: ${config.host}.' }`));
    });

    req.end();
  });
}

/**
 * Sorts a json  array for a spcific Key-value pair.
 * @param {Array} array
 * @param {String} key
 * @returns {Array} Sorrted Array
 */
function sortJSONArray(array, key) {
  return array.sort(function (a, b) {
    var x = a[key];
    var y = b[key];
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

/**
 * Calculates the business days (number of days) between the provided start and end dates.
 *
 * **Note: The passed parameters must be date constructors**
 *
 *
 * @param {Date} startDate Start date
 * @param {Date} endDate End date.
 */
//For some reason I thought to use UTC 🤷‍♂️
function calcBusinessDaysInBetween(startDate, endDate) {
  let _bDays = 0;
  let currDate = new Date(startDate.toISOString());
  // setting UTC time as 00:00:00:0000
  currDate.setUTCHours(0, 0, 0, 0);
  endDate.setUTCHours(0, 0, 0, 0);

  while (currDate < endDate) {
    const dayOfWeek = currDate.getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      _bDays++;
    }
    currDate.setUTCDate(currDate.getUTCDate() + 1);
  }
  return _bDays;
}

/**
 * Calculates the due date by adding the days passed to current dueDate,
 * taking only business days into consideration.
 *
 * @param {Date} startDate Start date
 * @param {Integer} numberOfDays Number of days.
 * @returns {Date} Due date.
 */
function calcBusinessDaydueDate(startDate, numberOfDays) {
  const dueDate = new Date(startDate);

  dueDate.setUTCHours(0, 0, 0, 0);
  while (numberOfDays) {
    dueDate.setUTCDate(dueDate.getUTCDate() + 1);
    const dayOfWeek = dueDate.getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      numberOfDays--;
    }
  }
  return dueDate;
}

/**
 * Inverts the date by doing a 9's complement.
 *
 * A method used by sap to sort dates in few legacy and current tables, so that the latest date is always a higher number for processing.
 * This inversion will be Used for getting filtered values from odata which support invereted date format as a date filter.
 * Will remove addtion of addtional lines to the ODATA Function modules to convert and return data for the reuired date.
 *
 * **Note: The technique of manipulating the sort sequence of dates by inverting the internal date format is now rarely used.**
 *
 * @param {Date} date date object to be converted.
 * @returns {Number} passed date in inverted date format in a decimal format.
 */
function invertedDate(date) {
  //converts the date to decimal format of yyyymmdd format, a SAP orginal format.
  const _date = date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
  return 99999999 - _date;
}

/**
 * Checks if the passed object is empty or not
 * @param {{}|null|undefined} obj Object that need to be checked.
 * @returns
 */
function objectIsEmpty(obj) {
  return Object.keys(obj ?? {}).length === 0;
}

/**
 * Removes the `null` or `undefined` or `""` values from object and returns the sanitized object.
 * @param {{}} obj - Object to be sanitized.
 * @param {Array|undefined} exculde - Array of keys to exclude from sanitization.
 * @returns {{}} - Sanitized object.
 */
function sanitizeNull(obj, exclude = []) {
  if (typeof obj !== "object" || obj === null) {
    throw new TypeError("Expected a non-null object for parameter obj");
  }

  return Object.fromEntries(
    Object.entries(obj).filter(([k, v]) => (exclude && exclude.includes(k)) || (v !== null && v !== "" && v !== undefined))
  );
}

/**
 * Function returns the MIME type for the passed file name with extention.
 *
 * Function has all the common MIME types supported in MDN web docs.
 *
 * Read more about MIME types [here](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types)
 * @param {String} filename File name with extention. eg: `text.pdf`.
 * @returns {String} MIME type of the file.
 */

function getMIMEType(filename) {
  const fileExt = filename.substring(filename.lastIndexOf("."));
  const _mimeTypes = {
    ".txt": "text/plain",
    ".html": "text/html",
    ".csv": "text/csv",
    ".pdf": "application/pdf",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".png": "image/png",
    ".jpg": "image/jpg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xml": "application/xml",
    ".webp": "image/webp",
    ".zip": "application/zip",
  };
  return _mimeTypes[fileExt] ?? "application/octet-stream";
}

/**
 * Returns the Accenture's current financial year.
 *
 * Accenture's fincancial year starts from September and ends in August.
 *
 * @example
 *  Sept 2023 to Aug 2024  ---> FY 2024
 *  Sept 2024 to Aug 2025  ---> FY 2025
 * @param {Date} postingDate Posting date of the document.
 * @returns {string} Accenture financial year in format `YYYY` eg:2021
 */
const currentAccFinancialYear = (postingDate) => {
  assert(postingDate !== null, new Error("Posting date must not be null."));
  assert(postingDate instanceof Date, new Error("Posting date must be a Date object."));
  const date = new Date(postingDate);
  const year = date.getFullYear();
  const month = date.getMonth();

  // if month is less than 8 ie: september then it is in the current year.
  if (month < 8) {
    // string value
    return `${year}`;
  } else {
    return `${year + 1}`;
  }
};

/**
 * Sanitizes the error stack trace by removing full file paths and obfuscating function names.
 * @param {String} stack Error stack trace.
 * @returns {String} Sanitized error stack trace.
 */
const sanitizedTrace = function (stack) {
  /**Function names that need to be obfuscated from trace must be added here.*/
  const functionsToObfuscate = [];
  const pathMatchRegex = new RegExp(/\((?:[A-Z]:\\\\[\w\W\s\.]+\\\\|\/[\w\W\s\.]+\/)([^\\\/]+)\)$/g);
  return stack
    .split("\n")
    .map((line) => {
      // Replace full file paths with a placeholder, keep only the file name and extension
      // the regex works for both Windows and Unix(Ubuntu) paths.
      line = line.replace(pathMatchRegex, "<file-path>$1");

      // // Obfuscate function names
      functionsToObfuscate.forEach((functionName) => {
        const regex = new RegExp(`\\b${functionName}\\b`, "g");
        line = line.replace(regex, "fn");
      });
      // Remove line numbers
      line = line.replace(/:[0-9]+:[0-9]+\)/g, ":ln:col)");

      return line;
    })
    .join("\n");
};

/**
 * Helper function to format a date in YYYY-MM-DD format.
 * @param {Date} date The date to format.
 * @returns {string} The formatted date.
 */
function dateInYYYMMDDFormat(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${year}-${month}-${day}`;
}

/**
 * Removes =duplicates from the list. works only for non-nested lists.
 *
 * Works for only primitive data types.
 * @param {Array} list List of elements.
 */
function removeDuplicatesFromList(list) {
  return [...new Set(list)];
}

/**
 * This function is used to group the objects based on the field data.
 * @param {Array} objects - Array of objects.
 * @param {String} field - Field Name to group by.
 * @returns {Object} - Grouped object based on the field.
 * @throws {ApplicationException} - If any error occurs while grouping the approvals based on the field.
 */
function groupByField(objects, field) {
  try {
    if (!Array.isArray(objects)) {
      throw new TypeError("Expected an array for parameter objects");
    }

    if (typeof field !== "string") {
      throw new TypeError("Expected a string for parameter field");
    }

    return objects.reduce((acc, object) => {
      const key = object?.[field];
      // check if key is not present in the object.
      if (!key) {
        return acc;
      }
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(object);
      return acc;
    }, {});
  } catch (err) {
    console.error(`[ERROR] Unable to group the objects based on the field:${field}.\nSTACK: ${err?.stack ?? "ERROR_STACK_NOT_AVAILABLE"}`);
    throw new AppModuleError("common", "groupByField", err);
  }
}

/**
 * Removes all HTML, XML, CSS and JS tags and scripts from the provided text.
 * @param {String} text
 */
function plainTextDigger(text) {
  const patterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gim, // Script tags and their contents
    /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gim, // Style tags and their contents
    // Removing individual tags after removing the scripts and styles tags.
    /<[^>]*?>/g, // HTML, XML, CSS and JS tags
    /&[\w!@#$%]+;/g, // HTML entities, e.g. '&nbsp;'
    // adding individual whitespace characters as is instead of using '\s' since we need to preserve spaces. 🫡
    /[\n\t\r\v\f]/g, // Newline, tab, and carriage return characters
  ];

  patterns.forEach((pattern) => {
    text = text.replace(pattern, "");
  });

  return text;
}

/**
 * Converts a string in the format /Date(timestamp)/ to a JavaScript Date object.
 * @param {string} dateString - The date string to convert.
 * @returns {Date} The converted Date object.
 */
function convertTodateStringToDate(dateString) {
  return new Date(parseInt(dateString?.replace(/\D/g, "")));
}

/**
 * Sleep function to wait for a given time.
 * @param {Number} ms Time in milliseconds.
 * @returns {Promise<void>}
 * @async
 */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Sets a timeout that can handle delays longer than the maximum delay value of setTimeout.
 *
 * This function addresses the limitation of `setTimeout` by recursively using `setTimeout`
 * with the maximum delay value supported by Node.js. It ensures the callback is invoked only
 * once and incorporates error handling within the callback.
 * 
 * If you attempt to set a delay exceeding the maximum total delay (roughly 31,688 years!),
 * you'll receive a lighthearted error message reminding you of the limitations of time
 * itself. 
 * 
 * @example
 * // Example usage:
 * const clear = setUnboundedTimeout(() => console.log('Hello, world!'), 3000);
 * // This will log 'Hello, world!' to the console after 3 seconds.
 *
 * @example
 * // Example usage with timeout cancellation:
 * const clear = setUnboundedTimeout(() => console.log('Hello, world!'), 3000);
 * clear();
 * // This will cancel the timeout, so 'Hello, world!' will never be logged.
 *
 * @param {Function} callback - The function to execute after the delay.
 * @param {number} delay - The delay before executing the callback, in milliseconds.
 * @returns {Function} A function that can be used to clear the timeout.
 * @throws { Error } If an error occurs during the callback execution or if you attempt to set a delay exceeding the maximum total delay.
 */
function setUnboundedTimeout(callback, delay) {
  /** Maximum delay value for setInterval is 2147483647 milliseconds (24.8 days) */
  const maxDelay = 2147483647;
  /** Limit to 1 trillion milliseconds (~31,688 years) */
  const maxTotalDelay = 1e12;
  // check if the delay is greater than the maximum delay value
  if (delay > maxTotalDelay) {
    throw new Error(
      `Whoa there, time traveler! Even the most patient code can't wait ${delay} milliseconds.  Consider a shorter delay (under 1 trillion milliseconds) to avoid warping the space-time continuum.`
    );
  }

  let timeoutId;
  let clearNextTimeout = null;

  if (delay > maxDelay) {
    timeoutId = setTimeout(() => {
      clearNextTimeout = setUnboundedTimeout(callback, delay - maxDelay);
    }, maxDelay);
  } else {
    timeoutId = setTimeout(async () => {
      try {
        await callback();
      } catch (err) {
        throw err;
      }
    }, delay);
  }


  return () => {
    clearTimeout(timeoutId);
    if (clearNextTimeout) {
      clearNextTimeout();
    }
  };
}

module.exports = {
  calcBusinessDaysInBetween,
  calcBusinessDaydueDate,
  PROXYTYPE,
  getHTTPSResponseHeaders,
  getHTTPResponseHeaders,
  numberExponentToLarge,
  convertUNIXToUTC,
  base64Encode,
  HTTPRequest,
  HTTPSRequest,
  sortJSONArray,
  invertedDate,
  finishedAsync,
  objectIsEmpty,
  sanitizeNull,
  getMIMEType,
  currentAccFinancialYear,
  sanitizedTrace,
  dateInYYYMMDDFormat,
  HTTP_METHOD,
  HTTP_STATUS,
  PROTOCOL,
  removeDuplicatesFromList,
  groupByField,
  plainTextDigger,
  convertTodateStringToDate,
  sleep,
  setUnboundedTimeout
};
