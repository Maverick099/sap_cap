"use strict";
const { EventEmitter } = require("node:stream");
const { ConnectivityService } = require("../backend/sapservice");
const { ApplicationException } = require("./appError");
const { sanitizeNull } = require("./common");
const assert = require("node:assert");

/**
 *
 * The Notification templatle to be used.
 *
 * All the properties have a specific character length mentioned in (xx Chars), to view the information please [read this.](https://help.sap.com/docs/build-work-zone-standard-edition/sap-build-work-zone-standard-edition/developing-cloud-foundry-applications-with-notifications#:~:text=Notification%20Type%20Properties%3A)
 *
 * **Refer this image to get an idea how the values passed to the will be displayed in the bell icon notification.**
 *
 * ![img](../../docs\res\sap_launchpad_notification_LowRes.png)
 *
 * @typedef NOTIFICATIONTEMPLATE
 * @prop {String} Language The following language keys, which specify the language of the notification (2 Chars).supported: AF, AR, BG, CA, ZH, ZF, HR, CS, DA, NL, EN, ET, FI, FR, KM, DE, EL, HE, HU, IS, ID, IT, HI, JA, KO, LV, LT, MS, NO, NB, PL, PT, Z1, RO, RU, SR, SH, SK, VI, SL, ES, SV, TH, TR, UK, IW, IN, ZH_HANS, ZH_HANT, ZH_CN, ZH_T
 * @prop {String} TemplatePublic The text which is used for push notifications (for example, on your mobile device). Since the push notification can pop up on your screen at any time and someone else can unintentionally see it, this text should not contain sensitive information.
 * @prop {String} TemplateSensitive This is the title of the notificaiton sent(500 Chars). ***(Refer the image tagged)***.
 * @prop {String} TemplateGrouped Lable for the notification group(500 Chars). ***(Refer the image tagged)***.
 * @prop {String} Subtitle Subtitle of the notification sent(200 Chars). ***(Refer the image tagged)***.
 * @prop {String|undefined} TemplateLanguage The template language is used to replace properties in the notification template text. Only Mustache is supported in addition to the default behaviour.
 * - Mustache: If the value is Mustache, the template texts must identify properties with double curly braces.
 * - Default behaviour is to consider single braces as the identifier for properties.
 * @prop {String|undefined} Description Describes the notification type when accessing user preferences through the consumer API(250 chars).
 * @prop {String|undefined} EmailSubject This value is used to define a custom subject for the email notifications. If EmailSubject is not specified, the value of property TemplateSensitive as email subject line is used.
 * @prop {String|undefined} EmailText A plain text format of the payload for the email notifications. If EmailText is not specified, the value of Subtiltle as email body is used.
 * @prop {String|undefined} EmailHtml An HTML format of the payload for the email notifications. `EmailHtml` is with the highest priority. If it is not specified, we ignore it and fallback to `EmailText`.
 */

/**
 * Actions data for the notifications.
 * @typedef ACTIONS
 * @prop {String} ActionId The value used to identify the action performed. When an action is performed by the user, this is the value that is sent back to the application to identify the action performed. (32Chars)
 * @prop {String} ActionText Text shown to the user.(40Chars)
 * @prop {String} GroupActionText Text shown to the user when notifications of the same type are grouped.(40Chars)
 * @prop {String|undefined} Language The following language keys, which specify the language of the notification, defaults to `en` (2 Chars). supported: AF, AR, BG, CA, ZH, ZF, HR, CS, DA, NL, EN, ET, FI, FR, KM, DE, EL, HE, HU, IS, ID, IT, HI, JA, KO, LV, LT, MS, NO, NB, PL, PT, Z1, RO, RU, SR, SH, SK, VI, SL, ES, SV, TH, TR, UK, IW, IN, ZH_HANS, ZH_HANT, ZH_CN, ZH_T
 * @prop {"NEGATIVE"|"POSITIVE"} Nature Indicating the general type of action.
 *
 */

/**
 * Launchpad delivery channels
 * @typedef DELIVERYCHANNELS
 * @prop {"MAIL"|"WEB"|"MOBILE"} Type The type of the delivery channel. The value might be `MAIL`, `WEB` or `MOBILE`.
 * @prop {Boolean|undefined} Enabled Defines if the channel is enabled. If not provided, the default value is true for all channel types.
 * @prop {Boolean|undefined} DefaultPreference Defines if the channel is the default preference for the given delivery channel. If not presented, the default value is true for `WEB` and `MOBILE` channels, and false for `MAIL`.
 * @prop {Boolean|undefined} EditablePreference Defines if the channel preference is editable. If not presented, the default value is true for all channel types
 */

/**
 * A user details who will be sending the notifications
 * @typedef ACTOR
 * @prop {String|undefined} id User id to identify this user.(20Chars)
 * @prop {String|undefined} type User type.(20Chars)
 * @prop {String|undefined} displayText Text to be displayed in the notificatons.(120Chars)
 * @prop {String|undefined} imageUrl Avatar or a image url for his user.
 */

/**
 * Data to be sent to the notification as properties.
 * @typedef NOTIFYPROPERTIES
 * @prop {String} Key Key used as a placeholder for properties in the template.(32Chars)
 * @prop {String} Value Value that replaces the property placeholder in the template.(255Chars)
 * @prop {String} Language The following language keys, which specify the language of the notification, are supported: AF, AR, BG, CA, ZH, ZF, HR, CS, DA, NL, EN, ET, FI, FR, KM, DE, EL, HE, HU, IS, ID, IT, HI, JA, KO, LV, LT, MS, NO, NB, PL, PT, Z1, RO, RU, SR, SH, SK, VI, SL, ES, SV, TH, TR, UK, IW, IN, ZH_HANS, ZH_HANT, ZH_CN, ZH_TW
 * @prop {keyof EDMTYPES } Type EDM type of data sent in the Value field. (20Chars)
 * @prop {boolean|undefined} IsSensitive Identifies if the data is sensitive. If the data is sensitive, the data will be encrypted and stored in the database.
 */

/**
 * Name value pairs that are forwarded to the target application specified in the NavigationTargetObject property.
 * @typedef  TARGETPARAMETERS
 * @prop {String} Key
 * @prop {String} Value
 */

/**
 * Payload to send the notification to launchpad.
 * @typedef NOTIFICATION
 * @prop {String|undefined} Id UUID used to identify notifications if actions are performed. If the ID isn't provided, it will be generated by the notification service.(32Chars)
 * @prop {String|undefined} OriginId When actions are performed by users on notifications, these actions may result in some side effects on the application that sent the notification in the first place. The notification service searches for the SAP BTP destination with the name provided in this field and performs a POST call on that destination. If no actions are expected to be done by users, then this field can be ignored. (200Chars)
 * @prop {String|undefined} NavigationTargetAction Used when navigation is required from the notification to the application.(500Chars)
 * @prop {String|undefined} NavigationTargetObject Used when navigation is required from the notification to the application.(500Chars)
 * @prop {"High"|"Medium"|"Neutral"|"Low"} Priority Indicates the priority of the notification.
 * @prop {ACTOR|undefined} actor Details about the actor initiating the notification. In the example, the actor is a user whose details are provided in these fields.
 * @prop {Array.<NOTIFYPROPERTIES>|undefined} Properties
 * @prop {Array.<String>} recipients The intended recipents of this notifications.
 * @prop {Array.<TARGETPARAMETERS>} targetParameters Name value pairs that are forwarded to the target application specified in the NavigationTargetObject property.
 */

const destinationName = process.env?.DESKTOP_NOTIFICATION_DESTINATION ?? "";

/**
 * Primitive data types available in Odata.
 */
const EDMTYPES = {
  binary: "Binary",
  boolean: "Boolean",
  byte: "Byte",
  datetime: "DateTime",
  decimal: "Decimal",
  double: "Double",
  single: "Single",
  guid: "Guid",
  int16: "Int16",
  int32: "Int32",
  int64: "Int64",
  sbyte: "SByte",
  string: "String",
  time: "Time",
  datetimeoffset: "DateTimeOffset",
};

/**
 * @readonly
 * @enum {String} MESSAGE_PRIORITY - Available priority options for notifications.
 */
const MESSAGE_PRIORITY = {
  HIGH: "High",
  MEDIUM: "Medium",
  NEUTRAL: "Neutral",
  LOW: "Low",
};

/**
 * @readonly
 * @enum {String} TEMPLATE_LANGUAGE - Available Template language options for notifications.
 */
const TEMPLATE_LANGUAGE = {
  Mustache: "Mustache",
  Default: "Default",
};

/**
 * @readonly
 * @enum {String} LANGUAGECODE -
 * Available Language codes for notifications.
 *
 * **☢️Note: When creating a template for notification types, only 2-character language codes are supported as languages keys.**
 */
const LANGUAGECODE = {
  AF: "AF",
  AR: "AR",
  BG: "BG",
  CA: "CA",
  ZH: "ZH",
  ZF: "ZF",
  HR: "HR",
  CS: "CS",
  DA: "DA",
  NL: "NL",
  EN: "EN",
  ET: "ET",
  FI: "FI",
  FR: "FR",
  KM: "KM",
  DE: "DE",
  EL: "EL",
  HE: "HE",
  HU: "HU",
  IS: "IS",
  ID: "ID",
  IT: "IT",
  HI: "HI",
  JA: "JA",
  KO: "KO",
  LV: "LV",
  LT: "LT",
  MS: "MS",
  NO: "NO",
  NB: "NB",
  PL: "PL",
  PT: "PT",
  Z1: "Z1",
  RO: "RO",
  RU: "RU",
  SR: "SR",
  SH: "SH",
  SK: "SK",
  VI: "VI",
  SL: "SL",
  ES: "ES",
  SV: "SV",
  TH: "TH",
  TR: "TR",
  UK: "UK",
  IW: "IW",
  IN: "IN",
  ZH_HANS: "ZH_HANS",
  ZH_HANT: "ZH_HANT",
  ZH_CN: "ZH_CN",
  ZH_TW: "ZH_TW",
};

/**
 * Excecption class for errors raised in this module.
 */
class NotificationApiException extends ApplicationException {
  /**
   * @param {String} code ALL_CAPS_WITH_UNDERSCORE_ERROR_STRING
   * @param {String} message Message to be accompanied with error.
   */
  constructor(code, message) {
    super("INTERNALERROR", `[NOTIFICATION_API]${code}::${message}`, null, 500);
  }
}

/**
 * SAP BTP lanunchpad Site notification implemnatation i.e.: Bell icon notifications.
 *
 * This has all the api's and functions that will be used to send a notification to the bell icon of the app deployed to lanuchpad.
 *
 * **Note: Notificaitons must be enabled before using this from the Site setting in launchpad**
 *
 * @see {@link https://help.sap.com/docs/build-work-zone-standard-edition/sap-build-work-zone-standard-edition/developing-cloud-foundry-applications-with-notifications |Read more: Developing Cloud Foundry Applications With Notifications}
 */
class LaunchpadNotification extends EventEmitter {
  /**Notification publish endpoint */
  #notificationEndpoint = "v2/Notification.svc";
  /**Notification Types endpoint */
  #notificationTypesEndpoint = "v2/NotificationType.svc";

  /** Static list to hold actions id's for a notification type*/
  #actions = [];

  #notitfyEvent = new EventEmitter();
  /**
   *
   * @param {String} key Notification key name.
   */
  constructor(key) {
    super();
    /**Key for notification to be used when publishing notifications or fetch from BTP.*/
    this.notificationTypeKey = key;
    /**Request body for the notification type that will be used to create a notificaiton type of key. */
    this.notificationType = {};
    /**Notification version.*/
    this.notificationTypeVersion = "3.0";

    // check if destination name is empty
    if (!destinationName) {
      throw new NotificationApiException("DESKTOP_NOTIFICATION_DESTINATION_NOT_FOUND", "Set the DESKTOP_NOTIFICATION_DESTINATION environment variable with destination before running/deploying the app.");
    }
    /** Connectivity service for Notifications Destination */
    this.connSrv = new ConnectivityService(destinationName);
  }

  // /**
  //  * Sets the notification type version, this is defaulted to `3.0`.
  //  * @param {String} version Version of notification to be used when publishing notifications.
  //  */
  // //BUG: setters cannot be same name as variable name. goes into endless recurrsion.
  // set notificationTypeVersion(version) {
  //   this.notificationTypeVersion = version ?? "3.0";
  // }

  /**
   * Sets the Type data for the notification current notification type.
   *
   * Also this data is used as payload to create the notification type if it is not present in BTP.
   * @param {Array.<NOTIFICATIONTEMPLATE>} templates
   * @param {Array.<ACTIONS> | undefined} actions
   * @param {Array.<DELIVERYCHANNELS>|undefined} deliveryChannels
   */
  type(templates, actions, deliveryChannels) {
    // check for template mandatory fields.
    templates.forEach((template, index) => {
      // set Language an 'en' for templates with unspecified language.
      template.Language = !!template.Language ? template.Language.toLowerCase() : "en";
      assert(!!template.TemplateSensitive, new NotificationApiException("TEMPLATE_SENSITIVE_MANDOTARY", `TemplateSensitive field is mandatory in templates at ${index}.`));
      assert(!!template.TemplatePublic, new NotificationApiException("TEMPLATE_PUBLIC_MANDOTARY", `TemplatePublic field is mandatory in templates at ${index}.`));
      assert(!!template.TemplateGrouped, new NotificationApiException("TEMPLATE_GROUPED_MANDOTARY", `TemplateGrouped	 field is mandatory in templates at ${index}.`));
      assert(!!template.Subtitle, new NotificationApiException("SUBTITLE_MANDOTARY", `Subtitle	 field is mandatory in templates at ${index}.`));
    });

    // checks for actions mandatory fields.
    if (!!actions) {
      actions.forEach((action, index) => {
        assert(!!action.ActionId, new NotificationApiException("ACTION_ID_MANDOTARY", `ActionId field is mandatory in actions at ${index}.`));
        assert(!!action.ActionText, new NotificationApiException("ACTION_TEXT_MANDOTARY", `ActionText field is mandatory in actions at ${index}.`));
        assert(!!action.GroupActionText, new NotificationApiException("ACTION_GROUP_TEXT_MANDOTARY", `GroupActionText field is mandatory in actions at ${index}.`));
        assert(!this.#actions.includes(action.ActionId), new NotificationApiException("ACTION_ID_MUST_BE_UNIQUE", `Action Id: ${action.ActionId} already exists. Action Id must be unique for a notification type.`));
        this.#actions.push(action.ActionId);
      });
    }

    // checks for delivery channels mandatory fields.
    if (!!deliveryChannels) {
      deliveryChannels.forEach((channel, index) => {
        assert(!!channel.Type, new NotificationApiException("DELIVERY_CHANNELS_TYPE_MANDOTARY", `Type field is mandatory in deliveryChannels at ${index}.`));
      });
    }

    this.notificationType = {
      NotificationTypeKey: this.notificationTypeKey,
      NotificationTypeVersion: this.notificationTypeVersion,
      Templates: templates,
      Actions: actions,
      DeliveryChannels: deliveryChannels,
    };
    return;
  }
  /**
   * Enusres that the notification type exisits or creates the notification type.
   *
   * **Note: This function must be called before every notification  post call.**
   * @param {String} notification_type Notificaiton type name.
   * @returns {Promise<void>}
   */
  async notificationTypeEnsureExists() {
    console.info(`[INFO] Checking if the notification type of key ${this.notificationTypeKey} and version ${this.notificationTypeVersion} exists.`);
    let request = await this.connSrv.request(`${this.#notificationTypesEndpoint}/NotificationTypes`, "GET");
    if (request?.status !== 200) {
      throw new NotificationApiException(`UNABLE_TO_FETCH_NOTIFICATION_TYPES`, `${request?.status}|${request?.status_message} - ${request?.body ?? ""}`);
    }

    // check if the notification type exisits for the specific version.
    const notifType = request.body?.d?.results?.find((type) => type.NotificationTypeKey === this.notificationTypeKey && type.NotificationTypeVersion === this.notificationTypeVersion);
    if (!notifType) {
      const headers = {
        Accept: "application/json",
        "Content-type": "application/json",
      };
      console.info(`[INFO] Notification Type of key ${this.notificationTypeKey} and version ${this.notificationTypeVersion} was not found. Creating it...`);
      assert(
        Object.keys(this.notificationType),
        new NotificationApiException("NOTIFICATION_TYPE_FOUND_EMPTY", `Unable to create a notification type for the current ${this.notificationTypeKey}. Please set the notification type using 'type()' function.`)
      );
      request = await this.connSrv.request(`${this.#notificationTypesEndpoint}/NotificationTypes`, "POST", this.notificationType, { needsxcsrfToken: true, headers: headers });
      if (request.status !== 201) {
        throw new NotificationApiException(`UNABLE_TO_CREATE_NOTIFICATION_TYPE`, `KEY-${this.notificationTypeKey}::${request?.status}|${request?.status_message} - ${JSON.stringify(request?.body) ?? "ERROR_BODY_UNAVAILABLE"}`);
      }
    }

    return;
  }

  /**
   * Publishes the notification to the Launchpad for the current notificaiton type.
   * @param {NOTIFICATION} notification
   */
  async publish(notification) {
    const headers = {
      Accept: "application/json",
      "Content-type": "application/json",
    };

    notification?.Properties.forEach((prop) => {
      assert(prop.Key, new NotificationApiException("PROPERTY_KEY_VALUE_EMPTY", `Notification.Propeties must have a 'Key' key with non-null value.`));
      assert(prop.Value, new NotificationApiException("PROPERTY_KEY_VALUE_FOUND_EMPTY", `Notification.Propeties.${prop.Key} must have a 'Value' key with non-null value.`));
    });
    let payload = {
      Id: notification?.Id ?? "",
      OriginId: notification.OriginId ?? "",
      NotificationTypeKey: this.notificationTypeKey,
      NotificationTypeVersion: this.notificationTypeVersion,
      NavigationTargetAction: notification?.NavigationTargetAction,
      NavigationTargetObject: notification?.NavigationTargetObject,
      Priority: notification.Priority,
      ActorId: notification?.actor?.id,
      ActorType: notification?.actor?.type,
      ActorDisplayText: notification?.actor?.displayText,
      Properties: notification?.Properties,
      TargetParameters: notification?.targetParameters ?? null,
      Recipients: notification.recipients.map((recipient) => ({ RecipientId: recipient })),
    };

    payload = sanitizeNull(payload);
    // checks if type is available.
    await this.notificationTypeEnsureExists();
    const response = await this.connSrv.request(`${this.#notificationEndpoint}/Notifications`, "POST", payload, { needsxcsrfToken: true, headers: headers });
    if (response.status !== 201) {
      throw new NotificationApiException("NOTIFICATION_NOT_PUBLISHED", `POST call error: ${response.status}|${JSON.stringify(request?.body) ?? "ERROR_BODY_UNAVAILABLE"}`);
    }
    console.info(`[INFO] Notification published for ${this.notificationTypeKey} with version ${this.notificationTypeVersion}.`);

    return;
  }

  /**
   * A input for notifications to be handled by the api's.
   *
   * This will emit the actions key as events, which will be handled by the registered function if any.
   * @param {import("@sap/cds/apis/services").Request} req Request Object rece
   */
  handle(req) {}

  /**
   * Handler to register when there is a notification action has been taken by user.
   * @param {string|Array.<string>} actionid
   * @param {CallableFunction} callback
   */
  on(actionid, callback) {
    this.#notitfyEvent.on(actionid, (_) => callback);
  }
}

module.exports = { LaunchpadNotification, MESSAGE_PRIORITY, LANGUAGECODE, EDMTYPES, TEMPLATE_LANGUAGE };
