"use strict";
const assert = require("node:assert").strict;
const querystring = require("node:querystring");
const { URL } = require("node:url");
const { HTTPSRequest, PROTOCOL, HTTPRequest } = require("./common");
const { socks5Properties, timeOut } = require("./constants");

/**Platforms to implemnet platform specific authentication. */
const PLATFORM = {
  btp: "btp",
  others: "others",
};

class Authentication {
  constructor() {
    console.info("[INFO] Authencation intialised.");
    this.VCAP_SERVICES = JSON.parse(process.env.VCAP_SERVICES);
    this.debug = false;
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

    this.#appConfig = new Configuration();
  }

  /**
   * Encode the given id and secret into a base64 encoded string.
   *
   * @param {String} id Client id.
   * @param {String} sec Client secret.
   * @returns {String} base64 format encoded string.
   */
  BASE64encode(id, sec) {
    let buff = Buffer.from(id + ":" + sec);
    return buff.toString("base64");
  }

  /**
   * @typedef jwtoptions
   * @prop {String} content_type content type of request has to be made for generating auth options. defaults to `application/x-www-form-urlencoded`.
   * @prop {keyof PLATFORM} platform platfrom for which jwt token has to be generated.
   * @prop {String|Buffer|null} data data that has to be sent with the token generation request, in string format.
   * @prop {Object.<string,any>} headers Additional headers that needed to be included.
   */

  /**
   * Genrates a JWT token from POST request to OAuth url using provided client-id and client-secret.
   *
   * Client credetinals are sent in `basic` type authentication header.
   *
   * **NOTE: Do not add `Authorization` and `Content-Type` headers in `option.headers` since they are added by the function.**
   *
   * This appends `/oauth/token` to the token url if the platform specified in the options is 'btp'.
   *
   * And, `grant_type: "client_credentials"`and `response_type: "token"` is sent as `application/x-www-form-urlencoded` by default,
   * to override it pass custom data to `options.data`
   * ,to send custom custom content type  specify the respective `option.content_type`.
   *
   * @param {String} oauthUrl Oauth Url for getting the token with params, if present.
   * @param {String} clientId Client ID.
   * @param {String} clientSecret  Client secret.
   * @param {jwtoptions} options Jwt token options.
   * @returns
   */
  async getJWTToken(oauthUrl, clientId, clientSecret, options) {
    console.info("[Info] JWT token creation invoked, for client id: " + clientId);

    //appends token path when platform is btp.
    const _tknpath = PLATFORM[options.platform] === PLATFORM.btp ? "/oauth/token" : "";
    const _method = "POST";
    const _headers = {
      Authorization: "Basic " + this.BASE64encode(clientId, clientSecret),
      "Content-Type": options?.content_type ? options.content_type : "application/x-www-form-urlencoded",
    };

    // if additional headers provided by user then add that.
    // Duplicate keys will be overridden.
    // could be problematic.
    if (!!options?.headers) {
      Object.assign(_headers, options.headers);
    }

    // for non-breaking complianice changes this adds the encodes data params to querry string.
    let data = options?.data ?? querystring.encode({ grant_type: "client_credentials", response_type: "token" });

    const _url = new URL(oauthUrl + _tknpath);
    const _config = {
      hostname: _url.hostname,
      port: parseInt(_url.port),
      path: _url.pathname + _url.search,
      method: _method,
      headers: _headers,
      timeout: timeOut,
    };
    try {
      const _req = await HTTPSRequest(_config, data, true);
      if (_req.status >= Number(300)) {
        throw new Error(`UNABLE_TO_GET_TOKEN: ${_req.status}|${_req.status_message} - ${!!_req.body ? JSON.stringify(_req.body) : ""}`);
      }
      return { type: `${_req.body["token_type"]}`, token: `${_req.body["access_token"]}` };
    } catch (err) {
      console.error(`[ERROR] Error while generating token from ${oauthUrl}: ${err.message}`);
      throw new Error(`{"status": 500, "message": "Error while getting JWT Token. \nError:${err.message}"}`);
    }
  }

  /**
   * @typedef XCSRFToken
   * @property {String} token - Returned x-csrf token.
   * @property {String} cookies - Cookies appened in a single string from current request.
   */

  /**
   * Genrates X-CSRF token by doing a get request to /$metadata to fetch the token.
   * 
   * By default the XCSRF Token is fetched using a `HEAD` request to the provided url.
   * @param {URL} url URL for the entity/org agains which x-csrftoken has to be produced, should be GET capabale.
   * @param {Object.<string, string} headers Headers that needs to be passed when generating the x-csrf-token.
   * @param {URL|null} proxyUrl Proxy url with port number if any. Proxy Auth header must be passed with `headers` parameter.
   * @returns {Promise<XCSRFToken>} xcsrftoken X-CSRF token with cookies as object (key-value pair).
   */
  async generateXCSRFtToken(url, headers, proxyUrl = null) {
    console.info("[Info] Generating X-CSRF-Token for current session");
    try {
      const _method = "HEAD";
      const _url = new URL(url);

      let _config = {};
      let _headers = {
        "x-csrf-token": "Fetch",
      };

      Object.assign(_headers, headers);
      delete _headers.Accept;

      // /// extracting sap-client if exists in additonal-properties.
      // try {
      //   Object.assign(_headers, { "sap-client": destinationConfig["sap-client"] });
      //   console.info("[INFO] SAP Client header added for destination.");
      // } catch (err) {
      //   console.info("[INFO] SAP Client not found for destination.");
      // }

      if (this.debug && this.platform === "local") {
        const debugUrl = new URL(`http://msasapsbw045.ds.dev.accenture.com:8000`);
        // dev config.
        // While  running locally add DEUG env var with value as "true". In defaul-env.json in root folder.
        console.debug("[DEBUG] Using Debug http config.");
        _config = {
          host: debugUrl.hostname,
          port: parseInt(debugUrl.port),
          path: _url.pathname + _url.search,
          family: 4,
          headers: _headers,
          method: _method,
        };
      } else {
        if (!!proxyUrl) {
          _config = {
            hostname: proxyUrl.hostname,
            port: parseInt(proxyUrl.port),
            path: url.toString(),
            headers: _headers,
            method: _method,
          };
        } else {
          _config = {
            hostname: url.hostname,
            port: parseInt(url.port),
            path: url.pathname + url.search,
            headers: _headers,
            method: _method,
          };
        }
      }

      let cookies = "";
      let _req;

      if (_url.protocol === PROTOCOL.HTTPS) {
        _req = await HTTPSRequest(_config, null, true);
      } else if (_url.protocol === PROTOCOL.HTTP) {
        _req = await HTTPRequest(_config, null, true);
      } else {
        throw new Error(`Protocol '${_url.protocol}' not implemented.`);
      }

      if (!_req.headers["x-csrf-token"]) {
        throw new Error(`TOKEN_NOT_FOUND_IN_RESPONSE_HEADER::HTTP_CALL_STATUS-${_req.status}|${_req.status_message}`);
      }

      if (!!_req.headers["set-cookie"]) {
        _req.headers["set-cookie"].forEach((cookie) => {
          cookies += `${cookie};`;
        });
      }

      return { token: _req.headers["x-csrf-token"], cookies: cookies ?? "" };
    } catch (err) {
      throw new Error(`Unable to get x-csrf-token: ${err.message}`);
    }
  }
  
  /**
   * SOCKS authentication implementation for BTP. 
   * @param {*} token
   * @param {*} cloudConnectorLoacaionId
   * @returns
   */
  socksCustomAuthRequestHandler(token, cloudConnectorLoacaionId) {
    try {
      let offset = 0;
      // jwt auth method version.
      const _authMethodVersion = Buffer.from([socks5Properties.SOCKS5_JWT_AUTHENTICATION_METHOD_VERSION]);
      // jwt length. 4 bytes.
      const _jwtBufLength = Buffer.allocUnsafe(4);
      const _jwtTknBuff = Buffer.from(token, "binary");
      const _cloudConnectorLocIdBuff = Buffer.from(Buffer.from(cloudConnectorLoacaionId).toString("base64"), "binary");
      const _cloudConnectorLocIdBuffLen = Buffer.allocUnsafe(1);

      _jwtBufLength.writeInt32BE(_jwtTknBuff.length);
      _cloudConnectorLocIdBuffLen.writeUInt8(_cloudConnectorLocIdBuff.length);

      let refBuffer = Buffer.alloc(_authMethodVersion.length + _jwtBufLength.length + _jwtTknBuff.length + _cloudConnectorLocIdBuffLen.length + _cloudConnectorLocIdBuff.length);

      _authMethodVersion.copy(retBuffer, offset);
      offset += _authMethodVersion.length;

      _jwtBufLength.copy(refBuffer, offset);
      offset += _jwtBufLength.length;

      _jwtTknBuff.copy(refBuffer, offset);
      offset += _jwtTknBuff.length;

      _cloudConnectorLocIdBuffLen.copy(refBuffer, offset);
      offset += _cloudConnectorLocIdBuffLen.length;

      if (_cloudConnectorLocIdBuff.length > 0) {
        _cloudConnectorLocIdBuff.copy(refBuffer, offset);
        offset += _cloudConnectorLocIdBuff.length;
      }

      assert.equal(offset, refBuffer.length);

      return refBuffer;
    } catch (err) {}
  }

  /**
   *
   * @param {*} data
   */
  async socksCustomAuthResponseHandler(data) {
    try {
      assert.equal(data.length, socks5Properties.SOCKS5_CUSTOM_RESP_SIZE);
      const authenticationMethodVersion = data[0];
      const authenticationStatus = data[1];

      if (socks5Properties.SOCKS5_JWT_AUTHENTICATION_METHOD_VERSION !== authenticationMethodVersion) {
        throw new Error(`Unsupported authentication method version - expected ${socks5Properties.SOCKS5_JWT_AUTHENTICATION_METHOD_VERSION}, but received ${authenticationMethodVersion}`);
      }
      if (socks5Properties.SOCKS5_AUTHENTICATION_SUCCESS_BYTE !== authenticationStatus) {
        throw new Error(`Authentication failed (${authenticationStatus})!`);
      }
    } catch (err) {
      console.error(`[Error] Error raised in SOCKS Custom Auth Response Handler.\nError- ${err.message}.\nSTACKTRACE-${err.stack}.`);
      throw new Error(`[Error] Error raised in SOCKS Custom Auth Response Handler.\nError- ${err.message}.`);
    }
  }
}

module.exports = { Authentication };
