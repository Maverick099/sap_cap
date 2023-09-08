"use strict";
/**
 * All common functions.
 */
const https = require("https");
const http = require("http");

/**Proxy type that SAP BTP destinations use. */
const PROXYTYPE = { INTERNET: "Internet", ONPREMISE: "OnPremise", NONE: "none" };

/**HTTP Protocol types */
const PROTOCOL = { HTTP: "http:", HTTPS: "https:" };


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


module.exports = {
  PROXYTYPE,
  base64Encode,
  HTTPRequest,
  HTTPSRequest,
  invertedDate,
  PROTOCOL,
  objectIsEmpty,
};
