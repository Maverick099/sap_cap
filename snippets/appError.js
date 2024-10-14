const cds = require("@sap/cds");
const { randomUUID } = require("node:crypto");
const { sanitizeNull } = require("./common");

/**
 * Application error logs db payload.
 * @typedef APPERRORLOGSDBPAYLOAD
 * @prop {String|null} approval      Association to ABSTRACTION_MASTER_TABLE;
 * @prop {String} error         error name/code
 * @prop {String} error_message message object from the Error class.
 * @prop {String} stack_trace   Stacktrace from Error Object.
 * @prop {String|null} stack_trace2  Stacktrace 2 if stack trace size greater than 5000 chars.
 * @prop {String|null} team          current team level when error eas raised.
 * @prop {String|null} on_status     status on which the error was raised.
 * @prop {String} timestamp     error timestamp
 */

/**
 * @typedef MODULEERRORADDITIONALINFO
 * @prop {String} approval      Association to ABSTRACTION_MASTER_TABLE;
 * @prop {String} team          current team level when error eas raised.
 * @prop {String} on_status     status on which the error was raised.
 */

/**
 * App exceptions message codes
 */
const APPEXCEPTIONS = {
  REVERTCOUNTEXCEEDED: "REVERT_COUNT_EXCEDED",
  INPUTDATA: "WORNG_INPUT_DATA_RECEIVED",
  INTERNALERROR: "INTERNAL_APPLICATION_EXCEPTION",
  USERNOTFOUND: "USER_NOT_FOUND_IN_DB",
  FILEUPLOADERROR: "UNABLE_TO_UPLOAD_FILE",
  REASSIGNEDUSERNOTFOUND: "REASSIGNED_USER_NOT_FOUND_IN_DB",
  CONTRACTNOALREADYEXISTS: "CONTRACT_NO_ALREADY_EXISITS",
  NONEXISITINGUPLOADID: "UPLOAD_ID_NOT_FOUND_IN_MASTER_DB",
  UNKNOWNEXCEPTION: "UNKOWN_EXCEPTION",
  VALIDATIONERROR: "DATA_VALIDATION_FAILED",
  DOCUMENTPOSTINGERROR: "DOCUMENT_POSTING_ERROR",
  FILEHANDLERERROR: "INTERNAL_FILE_HANDLER_ERROR",
  DESKTOPNOTIFICATIONERROR: "DESKTOP_NOTIFICATION_ERROR",
  WORKFLOWTRIGGERERROR: "WORKFLOW_TRIGGER_FAILED",
  DATAVERSETABLECRUDERROR: "DATAVSERSE_CRUD_OPERATION_ERROR",
  BACKGROUNDJOBERROR: "BACKGROUND_JOB_ERROR",
  EXECUTORERROR: "EVENT_EXECUTOR_ERROR",
  CACHEERROR: "INTERNAL_CACHE_ERROR",
};

/**
 * App exceptions messages.
 * @readonly
 * @enum {String}
 */
const error_messages = {
  /**when app encounters an unknown exception, which is not handled by the app.  */
  UNKNOWNEXCEPTION: "Uh-oh! We've hit a little snag. Something is not working as expected.",
};

/**
 * Error throwed when a method of class called which is not redefined/implemented by child classes.
 */
class UnimplementedError extends Error {
  constructor(methodName = null) {
    super(`${!methodName ? "This part is unimplemeted!" : methodName + "is not implemented!"}`);
    this.name = "UnimplementedError";
  }
}

//todo: @a.bhasakra.shetty: need to send email to AMS. for some reaseon the database is rolled back when error is raised.
/**
 * Creates an entry in the database to record the error.
 * @param {keyof APPEXCEPTIONS} error_code App excelptions error codes.
 * @param {Error} error Error object.
 * @param {String|null} message Custom message that is to be stored, If null then message from error object is saved.
 * @param {MODULEERRORADDITIONALINFO|null} options Optional data for error registration.
 * @returns uuid for the error row created in the db.
 */
function _addErrorToDb(error_code, error, message, options) {
  const id = randomUUID();
  const _today = new Date();

  cds.connect
    .to("db")
    .then((db) => {
      const { APPLICATION_ERROR_LOGS } = db.entities("db.journal_entry");
      let _stack1 = "";
      let _stack2 = "";

      // create error stack entries for db.
      if (!!error.stack) {
        if (error.stack.length > 10000) {
          _stack1 = error.stack.slice(0, 5000);
          _stack2 = error.stack.slice(5000, 10000);
          console.error(`[ERROR][APP_ERROR_LOGGING] Error Stack for ${id} larger than 10,000 chars only storing 10,000 chars of data.`);
        } else if (error.stack.length > 5000) {
          _stack1 = error.stack.slice(0, 5000);
          _stack2 = error.stack.slice(5000, error.stack.length);
        } else {
          _stack1 = error.stack;
        }
      }

      // transaction object
      const tx = cds.transaction();
      // inserting into db.
      tx.run(
        INSERT.into(APPLICATION_ERROR_LOGS).entries({
          id: id,
          approval: !!options ? options.approval ?? "" : "",
          error: APPEXCEPTIONS[error_code],
          error_message: message + "::CAUSE-" + error?.message ?? "CAUSE_NOT_AVAILABLE",
          stack_trace: _stack1,
          stack_trace2: _stack2,
          team: !!options ? options.team ?? "" : "",
          on_status: !!options ? options.on_status ?? "" : "",
          timestamp: _today.toISOString(),
        })
      )
        .then(() => {
          tx.commit().catch((e) => {
            console.error(`[ERROR][APP_ERROR_LOGGING] Error logging for ${id} not commited  to db:Error ${e.message}.\nSTACKTRACE:${e.stack ?? "not_available"}`);
          });
        })
        .then(() => {
          console.info(`[INFO][APP_ERROR_LOGGING] Error logged into database for id:${id}.`);
        })
        .catch((e) => {
          console.error(`[ERROR][APP_ERROR_LOGGING] Error logging for ${id} not completed:Error ${e.message}.\nSTACKTRACE:${e.stack ?? "not_available"}`);
        });
    })
    .catch((e) => {
      console.error(`[ERROR][APP_ERROR_LOGGING] Unable to establish connection to db :Error ${e.message}.\nSTACKTRACE:${e.stack ?? "not_available"}`);
    });
  return id;
}
/**
 * Application Exception to register know exceptions and pass it to the user/client
 * with a resolvement if possible for a retry or inform userside errors/input erros or repost a internal error,
 * due to which their current request can be processed.
 */
class ApplicationException extends Error {
  /**
   *
   * @param {keyof APPEXCEPTIONS} messageId message id for the exception should be one of {@link APPEXCEPTIONS}
   * @param {String} message Error/Resolvement message.
   * @param {(Error | null)} error Error object to pass the stack trace if any.
   * @param {Number} status_code Status code that needs to be passed with the response body of request. Defaults to 500.
   */
  constructor(messageId, message, error = null, status_code = 500) {
    super(`${error?.message ?? "ERROR_MESSAGE_NOT_AVAILABLE"}`);
    this.status_code = status_code;
    this.id = APPEXCEPTIONS[messageId];
    this.exception_message = message;
    this.stack = !!error ? error.stack : undefined;
    this.name = "APPLICATION_EXCEPTION";
  }

  responsePayload() {
    return sanitizeNull({ code: this.status_code.toString(), message: this.exception_message, innererror: this?.message ?? undefined });
  }
}
/**
 * Exception raised when an approval cannot be edited more than the allowed number of times.
 */
class RevertCountExceededException extends ApplicationException {
  constructor(uploadId) {
    super("REVERTCOUNTEXCEEDED", `Edit/Revert Count exceeded more than allowed 5 times for uploadId ${uploadId}`, null, 422);
    this.maxCount = 5;
  }
}

/**
 * Error to be raised when a user is not found.
 */
class UserNotFoundError extends ApplicationException {
  constructor(username) {
    super("USERNOTFOUND", `User ${username} not found in user database.`, null, 400);
  }
}

/**
 * Error to capture the module [FILE_NAME][FUNCTION_NAME] into the error messsage when
 */
class AppModuleError extends ApplicationException {
  /**
   * @param {String} module Moudle name from where the error is thrown.
   * @param {String} method Method name from where the error is thrown.
   * @param {Error} e Error object captured from the low level module.
   * @param {MODULEERRORADDITIONALINFO|null} options Additional info for this error.
   */
  constructor(module, method, e, options = null) {
    const eId = _addErrorToDb("INTERNALERROR", e, `[${module}][${method}]: ${e.message}`, options);
    super(
      "INTERNALERROR",
      `Uh-oh! We've hit a little snag.${
        e.message
          ? "Something is not working as expected. Error has been captured with id:" + eId
          : `We're not quite sure what went wrong. You can go back, or try reloading the app. Please take a note of this error id: '${eId}', to help our us identify and resolve this issue quickly.`
      }`,
      e,
      500
    );
  }
}

class FileUploadError extends ApplicationException {
  constructor(uploadId, message) {
    super("FILEUPLOADERROR", `Unable to upload files for upload Id- ${uploadId}: Error- ${message}`, null, 500);
  }
}

/**
 * Exception raised when the received client data is incorrect or not processable.
 */
class InputError extends ApplicationException {
  /**
   *
   * @param {String | null} uploadId upload id for the current approval.
   * @param {Error | String |null} err Can be an error message or the error object.
   * @param {Array.<string>} fields Fields which have incorect data/issues with the data format.
   */
  constructor(uploadId, err, fields = []) {
    if (typeof err === "string") {
      super("INPUTDATA", `Error: ${err}`, null, 400);
    } else {
      super("INPUTDATA", `Received data for not processable for upload id: ${uploadId} beacuse: ${err.message}. ${fields.length === 0 ? "" : "Fields causing error: " + fields.toString()}`, err, 400);
    }
  }
}

/**
 * A class to contain custom known error, when due to which validation cannot be completed.
 * Not to be confused with errors to be thrown when a data validation failed, that will be handled seperately as per requirements.
 */
class ValidationError extends ApplicationException {
  /**
   *
   * @param {String} code - A Short code to identify the error.
   * @param {String} message - A message to be displayed to the user.
   * @param {Error | undefined} err - Error object if any.
   */
  constructor(code, message, err) {
    super("INTERNALERROR", `${code}::${message}`, err, 500);
  }
}

module.exports = {
  ValidationError,
  InputError,
  UnimplementedError,
  AppModuleError,
  RevertCountExceededException,
  FileUploadError,
  APPEXCEPTIONS,
  ApplicationException,
  UserNotFoundError,
  _addErrorToDb,
  error_messages,
};
