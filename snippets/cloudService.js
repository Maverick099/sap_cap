"use strict";
const querystring = require("node:querystring");
const { URL } = require("node:url");

const { executeHttpRequest } = require("@sap-cloud-sdk/http-client");
const { getDestination } = require("@sap-cloud-sdk/connectivity");
const { ErrorWithCause } = require("@sap-cloud-sdk/util");
const { OpenApiRequestBuilder } = require("@sap-cloud-sdk/openapi");

const { Authentication } = require("./common_auth");
const { HTTPSRequest, PROXYTYPE, HTTPRequest, objectIsEmpty, PROTOCOL } = require("./common");
const { timeOut } = require("./constants");
const { ApplicationException } = require("../util/appError");

/**
 * Destination config.
 * @typedef {object} DESTINATION
 * @property {String}Name destination name
 * @property {String}Type Destination type
 * @property {String}URL Destination Url
 * @property {String}Authentication Authentication type
 * @property {String}ProxyType Proxy type
 * @property {String|undefined}tokenServiceURLType  Token service type
 * @property {String|undefined}clientId Clinet id for destination
 * @property {String|undefined}Description Descritption
 * @property {String|undefined}scope
 * @property {String|undefined}clientSecret
 * @property {String|undefined}tokenServiceURL
 * @property {String|undefined}Password
 * @property {String|undefined}User
 */

/**
 * @typedef CACHEOPTIONS
 * @prop {Duration|'never'} [duration='never'] - Time duration till when the cache should be alive.
 * @prop {boolean} [obfuscate=false] - Obfuscate the cache data and then store.
 * @prop {string|undefined} identifier - A unique identifier appended to the key to differentiate between requests with the same URL but different payloads, ensuring unique caching for each request-response pair.
 */

/**
 * @typedef AUTHOPTIONS
 * @prop {String} content_type content type of request has to be made for generating auth options. defaults to `application/x-www-form-urlencoded`.
 * @prop {Buffer|String|Null} data data that has to be sent with the token generation request.
 * @prop {Object.<string,any>} headers Additional headers that needed to be included.`
 * @prop {Array.<String>|Null} includeHeaders additional details name from destiation that needs to be included as headers in the request.
 */

/**
 * Additional Options for the request.
 * @typedef REQUESTOPTIONS
 * @prop {Object.<string, any} headers Any additional headers excluding `Autoraization`, `x-csrf-token`, `Cookie` must be added here as a key-value pair.
 * @prop {Array.<String>|Null} includeHeaders additional details name from destiation that needs to be included as headers in the request.
 * @prop {boolean | null} needsxcsrfToken Flag if the request needs an x-csrf-token header to be added.
 * @prop {String|null} xcsrfTokenPath URL to be used when generating the xcsrf token.
 * @prop {CACHEOPTIONS} cacheOptions - Cache options for the current request, for this cache prop must be true.
 */


/**Authentication types*/
const AUTHTYPE = {
  noAuth: "NoAuthentication",
  basic: "BasicAuthentication",
  clientCertAuth: "ClientCertificateAuthentication",
  principal: "PrincipalPropagation",
  oAuthClientCredentials: "OAuth2ClientCredentials",
  app2appSSO: "AppToAppSSO",
  sapAssertSSO: "SAPAssertionSSO",
};

/**Platforms to implemnet platform specific authentication. */
// eslint-disable-next-line no-unused-vars
const PLATFORM = {
  btp: "btp",
  others: "others",
};

/**
 * HTTP Request methods.
 */
// Whoever updating/adding new methods make sure the slide/right angled triangle (📐) pattern is followed.
// eslint-disable-next-line no-unused-vars
const HTTPMETHODS = {
  GET: "GET",
  PUT: "PUT",
  POST: "POST",
  HEAD: "HEAD",
  PATCH: "PATCH",
  DELETE: "DELETE",
  OPTIONS: "OPTIONS",
};

/**Avalailable service Types */
const SERVICETYPES = {
  connectivity: "CONNECTIVITY",
};

/**
 * Exception raised when using sap services.
 */
class SapServiceException extends ApplicationException {
  /**
   * @param {keyof SERVICETYPES} service Service type from which the error occured.
   * @param {Error} error Error object that was caugth, if any.
   */
  constructor(service, error) {
    // if error is a type of ErrorWithCause
    if (error instanceof ErrorWithCause) {
      super("INTERNALERROR", `[SAPCLOUDSDK] Error: ${error.message}::Cause-${error.cause?.message ?? "CAUSE_UNDEFINED"}`, error, 500);
    } else {
      super("INTERNALERROR", `[SAPSERVICE][${SERVICETYPES[service]}] ${error.message}`, error, 500);
    }
    this.name = "SAP_SERVICE_ERROR";
    this.stack = error.stack;
  }
}
/**
 * SAP services top level class.
 */
class SAPService {
  /** User token for current session. */
  #user_token;
  constructor() {
    this.auth = new Authentication();
    /**
    * Current sap service cache object.
    */
    this.sapServiceCache = new ApplicationCache();
    this.VCAP_SERVICES = JSON.parse(process.env.VCAP_SERVICES);
    this.debug = false;
    this.platform = "none";
    /**Middlewares to be added to http request */
    this.middlewares = [];

    try {
      this.debug = ["true"].includes(process.env.DEBUG.toLowerCase());
    } catch {
      this.debug = false;
    }

    try {
      this.platform = process.env.PLATFORM.toLowerCase();
    } catch {
      this.platform = "none";
    }

    /**
     * A default cache options for a request has `cache` flag set to `true`
     * @type {CACHEOPTIONS}
     */
    this.defaultCacheOptions = { duration: Duration.hours(24), obfuscate: 'never' }
  }

  /**
   * Returns the configuration and details for the binded connectivity service specified.
   * @param {String} connectivity_service
   * @returns {*} Details of the requested connectivity service from VCAP_SERVICES env variable as a json object.
   */
  getVCAPConnectivityServiceDetails(connectivity_service) {
    try {
      let connServices = this.VCAP_SERVICES.connectivity;
      let details = connServices.filter((srvDetail) => {
        return srvDetail.name === connectivity_service;
      });
      if (details.length == 0) {
        throw new Error(`Detials for Connectivity service- ${connServices} not found.`);
      }

      return details[0];
    } catch (err) {
      console.error(`[Error] Error while retreving details for connectivity service- ${connectivity_service}. Error: ${err.name}-${err.message}.\nSTACKTRACE:${err.stack}`);
      throw new SapServiceException("connectivity", err);
    }
  }

  /**
   * User token obtained from client for passing to destination service.
   * @param {String} token token that has to be set as the user token for principal authentication.
   */
  set USER_TOKEN(token) {
    if (token) {
      this.#user_token = token;
    }
  }

  /**User token obtained from client for passing to destination service.
  * @param {CDS.Request} req the orginal request object.
  */
  get USER_TOKEN(req) {
    return this.#user_token || req._.req?.authInfo?.getTokenInfo()?.getTokenValue() ?? null;;
    
  }

  //WIP: Add more logic to run this using cloud sdk for on-premise system as well.
  /**
   *  XCSRF token middleware for adding xcsrf token to the request.
   */
  async xcsrfTokenMiddleware(options) {
    return async (requestConfig) => {
      const requestConfigCsrf = {
        method: "head",
        headers: {
          ...requestConfig.headers, //Authentication headers are in here
          "x-csrf-token": "Fetch",
          "content-length": 0,
        },
        url: requestConfig.url.replace(/\/$/, ""),
      };

      requestConfigCsrf;

      // requestConfig.headers["x-csrf-token"] = response.headers["x-csrf-token"];
      return options.fn(requestConfig);
    };
  }

  /**
   * Middleware to add the status text to the response.
   */
  getStatusTextMiddleware = (options) => {
    return (requestConfig) => {
      return options.fn(requestConfig).then((response) => {
        return response.text().then((text) => {
          return { ...response, status_message: text };
        });
      });
    };
  };


  /**
   * Retrieves data from the cache for a given URL.
   *
   * @param {string} url - The URL for which to retrieve the cached data.
   * @returns {Promise.<any>|undefined} - A promise that resolves to the cached data, or undefined if no data is cached for the given URL.
   * @throws {Error} - Throws an error if the read operation fails.
   */
  async getCachedData(url) {
    const isCacheAvailable = this.sapServiceCache.cache.has(url);
    if (!isCacheAvailable) {
      return undefined;
    } else {
      return await this.sapServiceCache.cache.read(url);
    }
  }
}

/**
 * Handlers for sending requests to destination.
 */
class ConnectivityService extends SAPService {
  #destConfig;
  /**
   * @param {String} destination  Destination name.
   */
  constructor(destination) {
    super();
    this.destination_name = destination;
  }

  /**
   * Returns the destination details for the current destination.
   * @returns
   */
  get DESTINATION() {
    return (async () => {
      try {
        if (!this.#destConfig) {
          this.#destConfig = await getDestination({ destinationName: this.destination_name });
        }
        return this.#destConfig;
      } catch (error) {
        return error;
      }
    })();
  }

  /**
  * Executes an HTTP request using the SAP Cloud SDK.
  *
  * @param {string} [path] - The path to which data has to be posted. The path should start with '/'.
  * @param {keyof HTTPMETHODS} method - The HTTP method for the request.
  * @param {Object} data - The data that needs to be sent as payload in JSON format.
  * @param {REQUESTOPTIONS} [options=null] - The options to be included with the request.
  * @param {boolean} [cache=false] - A flag indicating whether the request should be cached.
  * @returns {Promise.<{status: number, body: any, headers: any}>} - A promise that resolves to an object containing the HTTP response status, body, and headers.
  * @throws {SapServiceException} - Throws an error if the request fails.
  */
  async request(path, method, data, options = null, cache = false) {
    try {
      console.info(`[INFO] Doing a ${method} request: ` + this.destination_name + ".dest" + path);
      const _ = {};
      const _headers = options?.headers ?? {};
      const identifier = !options?.cacheOptions?.identifier ? "" : `:${options?.cacheOptions?.identifier}`;
      const cacheKey = `${this.destination_name}.dest${path}${identifier}`.replace(/\s+/g, "");
      // check if data is already cached.
      if (cache) {
        const cachedData = await this.getCachedData(cacheKey);
        if (cachedData) {
          console.info(`[INFO] Reading from Cached results for ${method}-${this.destination_name}.dest${path}`);
          return cachedData;
        }
      }

      // destination config to be passed to the http client.
      const destinationConfig = {
        destinationName: this.destination_name,
      };

      //A middle ware to modify the current request config. add to middlewares if only path is defined.
      const modifyRequestParameters = (options) => {
        return (requestConfig) => {
          requestConfig.url = path;
          // requestConfig.timeout = timeOut;
          return options.fn(requestConfig);
        };
      };

      // A custom xcrf token middleware to add xcsrf token to the request from specified token url in options.
      // if (options.needsxcsrfToken && options.xcsrfTokenPath) {}

      // add the modify if path exists
      if (path) {
        this.middlewares.push(modifyRequestParameters);
      }

      // if user token exisits add user token to destination config.
      if (this.USER_TOKEN) {
        Object.assign(destinationConfig, { jwt: this.USER_TOKEN });
      }

      // Note all after middleware should be added after this line;
      // this.middlewares.push(this.getStatusTextMiddleware);
      try {
        // adding connection header to improve repeated requests performance to same URL's/API's.
        _headers.Connection = "keep-alive";

        const res = await executeHttpRequest(destinationConfig, { method: method, data: data, headers: _headers, middleware: this.middlewares }, { fetchCsrfToken: options?.needsxcsrfToken ?? false });
        _.status = res.status;
        _.body = res.data;
        _.headers = res.headers;

        // check if it needs to be cached
        if (cache) {
          // check if there is cache options available
          const expiration = options?.cacheOptions?.duration ?? this.defaultCacheOptions.duration;
          const obfuscate = options?.cacheOptions?.obfuscate ?? this.defaultCacheOptions.obfuscate;
          // write to cache asynchronously.
          this.sapServiceCache.cache.write(cacheKey, _, expiration, obfuscate).then(() => {
            console.info(`[INFO] Cached results for ${method}-${this.destination_name}.dest/${path}`);
          }).catch((err) => {
            console.error(`[ERROR] Error when caching for ${method}-${this.destination_name}.dest/${path} `, err);
          });
        }
      } catch (err) {
        console.error(`[ERROR] Error while requesting data from Connection ${this.destination_name}: ${err.message}.`);
        // throws error if status is not found the the error object.
        if (!err.response?.status) {
          throw new SapServiceException(`connectivity`, err);
        }
        _.body = err.response?.data;
        _.status = err.response?.status;
        _.status_message = err.response?.statusText;
        _.headers = err.response?.headers;
      }
      return _;
    } catch (err) {
      console.error(`[ERROR] Error while requesting data from Connection ${this.destination_name}: ${err.message}.`);
      throw err;
    }
  }

  /**
   * Open API request funtion. Uses the @link {OpenApiRequestBuilder}
   * @param {String} path Path to which request has to be made.
   * @param {"GET"|"POST"|"HEAD"|"PATCH"|"PUT"|"DELETE"|"OPTIONS"} method HTTP method for the request.
   * @param {*|undefined} data Data that needs to be sent as payload in json format.
   * @param {REQUESTOPTIONS | undefined} options Options to be included with the request.
   * @param {Object.<string,string>|undefined} additionalConfig Add custom request configuration to the request. Typically, this is used when specifying response type for downloading files.
   */
  async openApiRequest(path, method, data, options = {}, additionalConfig = null) {
    try {
      console.info(`[INFO] Doing a ${method} request: ` + this.destination_name + ".dest" + path);
      const _ = {};
      const _headers = options?.headers ?? {};

      // destination config to be passed to the http client.
      const destinationConfig = {
        destinationName: this.destination_name,
      };

      //A middle ware to modify the current request config. add to middlewares if only path is defined.
      const modifyRequestParameters = (options) => {
        return (requestConfig) => {
          requestConfig.url = path;
          // requestConfig.timeout = timeOut;
          return options.fn(requestConfig);
        };
      };
      // add the modify if path exists
      if (path) {
        this.middlewares.push(modifyRequestParameters);
      }

      // Note all after middleware should be added after this line;
      // this.middlewares.push(this.getStatusTextMiddleware);
      try {
        // adding connection header to improve repeated requests performance to same URL's/API's.
        Object.assign(_headers, { Connection: "keep-alive" });

        // create request builder and add custom headers.
        const request = new OpenApiRequestBuilder(method, path, { body: data }).addCustomHeaders(_headers).middleware(...this.middlewares);
        // skips fetching xcsrf token if needsxcsrfToken is false.
        if (options && !options.needsxcsrfToken) {
          request.skipCsrfTokenFetching();
        }

        // pass additional config if exists.
        if (additionalConfig) {
          request.addCustomRequestConfiguration(additionalConfig);
        }

        // exectute
        const res = await request.executeRaw(destinationConfig);

        _.status = res.status;
        _.body = res.data;
        _.headers = res.headers;
      } catch (err) {
        console.error(`[ERROR] Error while requesting data from Connection ${this.destination_name}: ${err.message}.`);
        // throws error if status is not found the the error object.
        if (!err.response?.status) {
          throw new SapServiceException(`connectivity`, err);
        }
        _.body = err.response?.data;
        _.status = err.response?.status;
        _.status_message = err.response?.statusText;
        _.headers = err.response?.headers;
      }
      return _;
    } catch (err) {
      console.error(`[ERROR] Error while requesting data from Connection ${this.destination_name}: ${err.message}.`);
      throw err;
    }
  }
}

module.exports = { ConnectivityService, AUTHTYPE, SapServiceException };
