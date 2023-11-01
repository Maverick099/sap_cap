"use strict";
const { URL } = require("node:url");
const { Authentication } = require("./common_auth");
const { HTTPSRequest, PROXYTYPE, HTTPRequest, objectIsEmpty, PROTOCOL } = require("./common");
const { timeOut } = require("./constants");
const { ApplicationException } = require("../util/appError");
const querystring = require("node:querystring");

/**
 * Destination config.
 * @typedef {object} DESTINATION
 * @property {String}Name destination name,
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
 * @typedef AUTHOPTIONS
 * @prop {String} content_type content type of request has to be made for generating auth options. defaults to `application/x-www-form-urlencoded`.
 * @prop {Buffer|String|Null} data data that has to be sent with the token generation request.
 * @prop {Object.<string,any>} headers Additional headers that needed to be included.`
 * @prop {Array.<String>|Null} includeHeaders additional details name from destiation that needs to be included as headers in the request.
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
const PLATFORM = {
  btp: "btp",
  others: "others",
};

/**
 * HTTP Request methods.
 */
// Whoever updating/adding new methods make sure the slide/right angled triangle (📐) pattern is followed.
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
  destination: "DESTINATION",
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
    super("INTERNALERROR", `[SAPSERVICE][${SERVICETYPES[service]} ${error.message}`, error, 500);
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
    this.VCAP_SERVICES = JSON.parse(process.env.VCAP_SERVICES);
    this.debug = false;
    this.platform = "none";
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
  }

  /**
   * Returns the configuration and details for the binded connectivity service specified.
   * @param {String} connectivity_service
   * @returns Details of the requested connectivity service from VCAP_SERVICES env variable as a json object.
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
    this.#user_token = token;
  }

  /**User token obtained from client for passing to destination service. */
  get USER_TOKEN() {
    return this.#user_token;
  }
}

/**
 * Handlers for handling the destination serivces added to the SAP BTP.
 */
class DestinationService extends SAPService {
  constructor() {
    super();
    console.info("[INFO] Destinaiton service initalised");
  }

  /**
   * Gets the destination configuration, which is configured and added in the SAP BTP-> Connectivity-> Destinations tab.
   *
   * @param {String} destination Name of the destination for which the configuration has to be fetched.
   * @returns {DESTINATION} Destination confuguration which is configired in the destination page.
   */
  async getDestinationConfiguration(destination) {
    console.info("[INFO] Geting destination service config for:" + destination + ".");
    const _credentials = this.VCAP_SERVICES.destination[0].credentials;
    // let __destinaitonNotFoundFlag = false;
    // if(this.platform === 'local'){
    //   const envDestinations = JSON.parse(process.env?.destinations);
    //   const destination = envDestinations.filter((dest)=> dest?.name)
    //   return {

    //   }
    // }
    const jwtTkn = await this.auth.getJWTToken(_credentials.url, _credentials.clientid, _credentials.clientsecret, { platform: "btp" });
    const _path = "/destination-configuration/v1/destinations/" + destination;
    const _headers = { Authorization: `${jwtTkn.type} ${jwtTkn.token}` };
    const _method = "GET";
    const _url = new URL(_credentials.uri + _path);

    const _config = {
      hostname: _url.hostname,
      port: parseInt(_url.port),
      path: _url.pathname + _url.search,
      method: _method,
      headers: _headers,
      timeout: timeOut,
    };
    try {
      const req = await HTTPSRequest(_config).catch((err) => {
        throw err;
      });
      return req.body.destinationConfiguration;
    } catch (err) {
      console.error(`[ERROR] Error while geting destination configuration for ${this.DESTINATION}: ${err.message}.`);
      throw new SapServiceException("destination", err);
    }
  }
}

/**
 * Handlers for requesting and posting data to the destination.
 */
class ConnectivityService extends SAPService {
  #destConfig;
  /**
   * @param {String} destination  Destination name.
   */
  constructor(destination) {
    super();
    console.info("[INFO] Connectivity service initalised for destiantion: " + destination + ".");
    this.destService = new DestinationService();
    this.destination_name = destination;
  }

  /**
   * Gets the detination configuration/detials for the passed.
   * @returns {DESTINATION}
   */
  async #getDestinationDetails() {
    const _destinationConfig = await this.destService.getDestinationConfiguration(this.destination_name);
    return _destinationConfig;
  }

  /**
   * Returns the destination details for the current destination.
   * @returns {DESTINATION} Destination configuration.
   */
  get DESTINATION() {
    return (async () => {
      try {
        if (!this.#destConfig) {
          this.#destConfig = await this.#getDestinationDetails();
        }
        return this.#destConfig;
      } catch (error) {
        return undefined;
      }
    })();
  }

  /**
   * Generates the Auth type depending on the type of authentication of the destination.
   * @param {AUTHOPTIONS} options
   * @returns
   */
  async #generateAuthHeaders(options) {
    try {
      let _headers = options?.headers ?? {};

      // add the headers from destination config
      if (!!options?.includeHeaders) {
        for (let header of options.includeHeaders) {
          try {
            Object.assign(_headers, { [header]: this.#destConfig[header] });
          } catch (err) {
            console.warn(`[WARNING] Was unable to include ${header} due to: ${err.message}.`);
          }
        }
      }

      switch (this.#destConfig.Authentication) {
        // no auth.
        case AUTHTYPE.noAuth:
          return {};
        // basic authentication.
        case AUTHTYPE.basic:
          return { Authorization: "BASIC " + this.auth.BASE64encode(this.#destConfig.User, this.#destConfig.Password) };
        // oAuth2 client credentials
        case AUTHTYPE.oAuthClientCredentials:
          const token = await this.auth.getJWTToken(this.#destConfig.tokenServiceURL, this.#destConfig.clientId, this.#destConfig.clientSecret, {
            content_type: options?.content_type,
            data: options?.data,
            headers: objectIsEmpty(_headers) ? null : _headers,
            platform: "others",
          });
          return { Authorization: `${token.type} ${token.token}` };
        // principal propagation.
        case AUTHTYPE.principal:
          if (!!this.USER_TOKEN) {
            // const form_data = {
            //   grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            //   token_format: "jwt",
            //   response_type: "token",
            //   assertion: this.USER_TOKEN,
            // };
            // const userExchangeToken = await this.auth.getJWTToken(_credentials.url, _credentials.clientid, _credentials.clientsecret, { platform: "btp", data: querystring.encode(form_data), headers: objectIsEmpty(_headers) ? null : _headers });
            console.info(`[INFO] User Exchange Token header added.`);
            return { "SAP-Connectivity-Authentication": `Bearer ${this.USER_TOKEN}` };
          } else {
            throw new Error("Propagated user  token variable found null");
          }
      }
    } catch (err) {
      throw new SapServiceException("AUTHHEADERS", err);
    }
  }

  /**
   * @typedef CONFIGOPTIONS
   *  @prop {Object.<string,any> | null} headers Any specific headers
   *  @prop {Array.<string> | null} includeHeaders Headers names that will be included from the destination config.
   *  @prop {Boolean|null} needsxcsrfToken Flag if the request needs an x-csrf-token header to be added.
   *  @prop {String|null} xcsrfTokenPath URL to use `GET` request to get the xcsrf-token.
   */
  /**
   * Generates the request configs for the HTTP request.
   * @param {string} endpoint Url endpoint to which the request will be made.
   * @param {String} method HTTP method.
   * @param {CONFIGOPTIONS | null} options additinal options for the request.
   * @param {AUTHOPTIONS} authOptions additional authentication options for the request.
   */
  async #generateRequestConfig(endpoint, method, options = null, authOptions = null) {
    try {
      const _credentials = this.VCAP_SERVICES.connectivity[0].credentials;
      let _ = { method: method, timeout: timeOut };
      let _headers = {};

      // checks if destination config variable is empty for current destination connectivity.
      if (!this.#destConfig) {
        this.#destConfig = await this.#getDestinationDetails();
      }

      const url = new URL(this.#destConfig.URL + endpoint);
      // add any additional headers.
      if (!!options?.headers) {
        Object.assign(_headers, options.headers);
      }
      // add the headers from destination config
      if (!!options?.includeHeaders) {
        for (let header of options.includeHeaders) {
          try {
            Object.assign(_headers, { [header]: this.#destConfig[header] });
          } catch (err) {
            console.warn(`[WARNING] Was unable to include ${header} due to: ${err.message}.`);
          }
        }
      }

      const authHeader = await this.#generateAuthHeaders(authOptions);
      // add auth headers
      Object.assign(_headers, authHeader);
      // check for proxy-type
      switch (this.#destConfig.ProxyType) {
        case PROXYTYPE.INTERNET:
          console.info(`[INFO] ${PROXYTYPE.INTERNET} detected as proxy type for ${this.#destConfig.Name}`);
          // add the http config
          Object.assign(_, { hostname: url.hostname, port: parseInt(url.port), path: url.pathname + url.search, headers: _headers });
          // add x-csrf token for methods other than `GET`
          if (method.toLowerCase() !== HTTPMETHODS.HEAD.toLowerCase() && method.toLowerCase() !== HTTPMETHODS.GET.toLowerCase() && !!options?.needsxcsrfToken) {
            const xtknurl = new URL(`${this.#destConfig.URL}${options?.xcsrfTokenPath ?? endpoint}`);
            const xcsrf_token = await this.auth.generateXCSRFtToken(xtknurl, objectIsEmpty(_headers) ? null : _headers);
            Object.assign(_headers, { "x-csrf-token": xcsrf_token.token, Cookie: xcsrf_token.cookies });
          }
          return _;
        case PROXYTYPE.ONPREMISE:
          console.info(`[INFO] ${PROXYTYPE.ONPREMISE} detected as proxy type for ${this.#destConfig.Name}`);
          //**Note: On premise SAP system port and protocol is being overrided here to HTTPS port 443, since production/testing only https protocol is allowed.**
          url.port = "443";
          url.protocol = PROTOCOL.HTTPS.slice(0, -1);

          // checks for the env variable if the platform is local
          // this is an dev check to use run this module localy without generating the proxy auth and config for onPremise proxy type
          if (this.platform === "local") {
            Object.assign(_, { hostname: url.hostname, port: parseInt(url.port), path: url.pathname + url.search });
          } else {
            Object.assign(_, { hostname: _credentials.onpremise_proxy_host, port: parseInt(_credentials.onpremise_proxy_http_port), path: url.toString() });

            // get the proxy auth for connectivity service.
            const proxy_token = await this.auth.getJWTToken(_credentials.url, _credentials.clientid, _credentials.clientsecret, { platform: "btp" });
            Object.assign(_headers, { "Proxy-Authorization": `${proxy_token.type} ${proxy_token.token}` });
          }
          // add x-csrf token for methods other than `GET`
          if (method.toLowerCase() !== HTTPMETHODS.HEAD.toLowerCase() && method.toLowerCase() !== HTTPMETHODS.GET.toLowerCase() && !!options?.needsxcsrfToken) {
            // xcsrf token url will be same url or patch will be change if options.xscrfTokenPath is passed.
            const xtknurl = new URL(`${url.protocol}//${url.hostname}:${url.port}${options?.xcsrfTokenPath ?? endpoint}`);
            const xtknProxyUrl = new URL(`https://${_credentials.onpremise_proxy_host}:${_credentials.onpremise_proxy_http_port}`);
            const xcsrf_token = await this.auth.generateXCSRFtToken(xtknurl, objectIsEmpty(_headers) ? null : _headers, this.platform === "local" ? null : xtknProxyUrl);
            Object.assign(_headers, { "x-csrf-token": xcsrf_token.token, Cookie: xcsrf_token.cookies });
          }
          /// add all headers to the congfig
          Object.assign(_, { headers: _headers });
          return _;
        default:
          // By Deafault it is same as INTERNET Proxy type.
          // add x-csrf token for methods other than `GET`
          if (method.toLowerCase() !== HTTPMETHODS.GET.toLowerCase() && !!options?.needsxcsrfToken) {
            const xtknurl = new URL(`${this.#destConfig.URL}${options?.xcsrfTokenPath ?? endpoint}`);
            const xcsrf_token = await this.auth.generateXCSRFtToken(xtknurl, objectIsEmpty(_headers) ? null : _headers);
            Object.assign(_headers, { "x-csrf-token": xcsrf_token.token, Cookie: xcsrf_token.cookies });
          }
          Object.assign(_, { hostname: url.hostname, port: parseInt(url.port), path: url.pathname + url.search, headers: _headers });
          return _;
      }
    } catch (err) {
      throw new SapServiceException("connectivity", err);
    }
  }

  /**
   * Additional Options for the request.
   * @typedef REQUESTOPTIONS
   * @prop {Object.<string, any} headers Any additional headers excluding `Autoraization`, `x-csrf-token`, `Cookie` must be added here as a key-value pair.
   * @prop {Array.<String>|Null} includeHeaders additional details name from destiation that needs to be included as headers in the request.
   * @prop {boolean | null} needsxcsrfToken Flag if the request needs an x-csrf-token header to be added.
   * @prop {String|null} xcsrfTokenPath URL to be used when generating the xcsrf token.
   */
  /**
   * Posts the data to the on premise system.
   * @param {String} path path to which data has to be posted. Path should start with '/'.
   * @param {keyof HTTPMETHODS} method HTTP method for the request.
   * @param {*} data Data that needs to be sent as payload in json format.
   * @param {REQUESTOPTIONS} options Options to be included with the request.
   * @param {AUTHOPTIONS} auth_options Authentication options that will be included with authentication request.
   * @returns  returns HTTP type json string with success or reject status and messages.
   */
  async request(path, method, data, options = null, auth_options = null) {
    try {
      console.info("[INFO] Posting data into: " + this.destination_name + ".dest" + path);
      let _config = await this.#generateRequestConfig(
        path,
        HTTPMETHODS[method],
        { headers: options?.headers, includeHeaders: options?.includeHeaders, needsxcsrfToken: options?.needsxcsrfToken, xcsrfTokenPath: options?.xcsrfTokenPath },
        auth_options
      );

      let req;
      const _url = new URL(this.#destConfig.URL);
      //**Note: for destiantion proxy type on-oremise overriding the protocol to https**/
      if (this.#destConfig.ProxyType === PROXYTYPE.ONPREMISE) {
        _url.protocol = PROTOCOL.HTTPS.slice(0, -1);
      }

      if (_url.protocol === PROTOCOL.HTTPS && this.#destConfig.Type === "HTTP") {
        req = await HTTPSRequest(_config, JSON.stringify(data), true);
      } else if (_url.protocol === PROTOCOL.HTTP && this.#destConfig.Type === "HTTP") {
        req = await HTTPRequest(_config, JSON.stringify(data), true);
      } else {
        throw new Error(`Protocol '${this.#destConfig.Type.protocol}' not implemented.`);
      }

      return req;
    } catch (err) {
      console.error(`[ERROR] Error while requesting data from Connection ${this.destination_name}: ${err.message}.`);
      throw err;
    }
  }
}

module.exports = { DestinationService, ConnectivityService, AUTHTYPE, SapServiceException };
