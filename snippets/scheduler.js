"use strict";
const cron = require("node-cron");
const cds = require("@sap/cds");
const { randomUUID } = require("node:crypto");

/**
 * @callback SchedulerCallback
 * @param {Date | String} date
 */
/**
 * JOB Properties.
 * @typedef JOB
 * @prop {String} name Name for the Job.
 * @prop {String} cronString CRON string for the job
 * @prop {SchedulerCallback} callback Function to be called
 */

/**
 * @callback JobRecreationCallback
 * @param {String} id Job id
 * @param {String} name name of the job
 * @param {String} cron Cron String of the job
 * @param  {String} entryTimeStamp when job was added to the process table.
 * @param {String|null} uploadId Upload id for the approval.
 * @param {Number|null} level team level of the approval.
 * @returns {JOB} Restored job that will be added to process table.
 */

/**
 *
 */
class JobSchdeulerError extends Error {
  /**
   * @param {String} err_string A Error keyword for the thrown error. eg: `FILE_NOT_FOUND`
   * @param {String} msg Error message string.
   * @param {Error} e Erro object if any to, provides the sacktrace.
   */
  constructor(err_string, msg, e) {
    super(`[ERROR][JOB_SCHEDULER][${err_string}]: ${msg}`);
    this.stack = e.stack;
  }
}

/**
 *
 *
 *
 *
 *  ### CRON String Syntax:
 *
 * ```
 *   ┌────────────── second (optional)
 *   │ ┌──────────── minute
 *   │ │ ┌────────── hour
 *   │ │ │ ┌──────── day of month
 *   │ │ │ │ ┌────── month
 *   │ │ │ │ │ ┌──── day of week
 *   │ │ │ │ │ │
 *   │ │ │ │ │ │
 *   * * * * * *
 * ```
 */
class SchdeulerInstance {
  #taskTable = {};

  /**utc timezone */
  #utc = "UTC";

  #db;

  /** Database Name space.*/
  #dbNamespace = "db.journal_entry";

  constructor() {
    console.info(`[INFO][JOB_SCHEDULER] Job Scheduler started in background.`);
  }

  /**
   * Method to connect the current applicaiton instance to primary database as per the configuration.
   *
   * All methods inside the {@link DatabaseHandler} call/must call this function explicity.
   *
   */
  /**
   * Method to connect the current applicaiton instance to primary database as per the configuration.
   *
   * All methods inside the {@link DatabaseHandler} call/must call this function explicity.
   *
   */
  async #connect() {
    try {
      this.#db = await cds.connect.to("db");
      console.info(`[INFO][JOB_SCHEDULER] Database connection established.`);
      return this.#db;
    } catch (err) {
      console.error(`[ERROR] Error while connecting to primary database.`);
      throw new AppModuleError("DatabaseHandler", "#connect", err);
    }
  }

  /**
   * Function recreates all the process table that is stored in the Database.
   */
  async recreateProcessTable() {
    try {
      console.info(`[INFO][JOB_SCHEDULER] Recreating exsisting process tables.`);
      const db = await this.#connect();
      const { BACKGROUND_PROCESSES } = db.entities(this.#dbNamespace);
      const processes = await cds.run(SELECT.from(BACKGROUND_PROCESSES));
      if (!!processes && processes.length > 0) {
        for (let _process of processes) {
          const process = {
            [_process.id]: {
              name: _process.process,
              timezone: _process.timezone,
              jobs: [],
            },
          };
          Object.assign(this.#taskTable, process);
        }
      } else {
        console.info(`[INFO][JOB_SCHEDULER] NO PROCESS TABLES FOUND IN DB.`);
      }
      return;
    } catch (err) {
      throw new JobSchdeulerError("UNABLE_TO_ADD_PROCESS_TO_DB", err.message, err);
    }
  }

  /**
   *
   * @param {String} id
   * @param {String} name
   * @param {String} timezone
   * @returns
   */
  #addProcessTableToDB(id, name, timezone = this.#utc) {
    try {
      return new Promise((resolve, reject) => {
        this.#connect().then(() => {
          const { BACKGROUND_PROCESSES } = this.#db.entities(this.#dbNamespace);
          cds
            .run(INSERT.into(BACKGROUND_PROCESSES).entries({ id: id, process: name, timezone: timezone }))
            .then((_) => {
              resolve(_);
            })
            .catch((err) => {
              reject(`Error: ${err.message}`);
            });
        });
      });
    } catch (err) {
      throw new JobSchdeulerError("UNABLE_TO_ADD_PROCESS_TO_DB", err.message, err);
    }
  }

  async #addJobToDB(id, process_id, name, cron_string, entry_timestamp, isScheduled = true, timezone = this.#utc, uploadId = null, level = null) {
    try {
      await this.#connect();
      const { BACKGROUND_JOBS } = this.#db.entities(this.#dbNamespace);
      await cds.run(
        INSERT.into(BACKGROUND_JOBS).entries({ id: id, name: name, process_id: process_id, timezone: timezone, cron_string: cron_string, entrytimestamp: entry_timestamp, isScheduled: isScheduled, approval_id: uploadId, teamlevel: level })
      );
    } catch (err) {
      throw new JobSchdeulerError("UNABLE_TO_ADD_JOB_TO_DB", err.message, err);
    }
  }

  async #removeJobFromDB(job_id) {
    try {
      await this.#connect();
      const { BACKGROUND_JOBS } = this.#db.entities(this.#dbNamespace);
      await cds.run(DELETE.from(BACKGROUND_JOBS).where({ id: job_id }));
    } catch (err) {
      throw new JobSchdeulerError("UNABLE_TO_REMOVE_JOB_FROM_DB", err.message, err);
    }
  }

  get taskTable() {
    return this.#taskTable;
  }
  /**
   *
   * @param {String} name
   * @param {String} timezone IANA valid timmezone string. e.g.:  `Asia/Kolkata`.
   * @returns {{id:String}}
   */
  createProcessTable(name, timezone = this.#utc) {
    try {
      // get previous id.
      const _ = Object.keys(this.#taskTable).find((id) => this.#taskTable[id].name === name);
      // create new id or assign previous id.
      const _id = _ ?? randomUUID();

      if (!_) {
        const process = {
          [_id]: {
            name: name,
            timezone: timezone,
            jobs: [],
          },
        };

        Object.assign(this.#taskTable, process);
        this.#addProcessTableToDB(_id, name, timezone).then(() => {
          console.info(`[INFO][JOB_SCHEDULER] Process table ${name} added to database.`);
        });
        console.info(`[INFO][JOB_SCHEDULER] ${name} Process table created.`);
      } else {
        console.info(`[INFO][JOB_SCHEDULER] ${name} Process table already exists, Not creating new.`);
      }
      return { id: _id };
    } catch (err) {
      throw new JobSchdeulerError("UNABLE_TO_CREATE_NEW_PROCESS_TABLE", err.message, err);
    }
  }

  /**
   * Fetches the jobs from background jobs table and then restores back to its previous state.
   * @param {String} process_table Process table id.
   * @param {JobRecreationCallback} restoreFunction Restoration function that will return the a job for sent exisiting details to be added to the process table.
   */
  async restoreExistingJobs(process_table, restoreFunction) {
    try {
      console.info(`[INFO][JOB_SCHEDULER] Restoring jobs for process table: ${process_table}`);
      await this.#connect();
      const { BACKGROUND_JOBS } = this.#db.entities(this.#dbNamespace);
      const _existingJobs = await cds.run(SELECT("*").from(BACKGROUND_JOBS).where({ process_id: process_table }));

      if (!_existingJobs || _existingJobs.length !== 0) {
        try {
          for (let job of _existingJobs) {
            const _restoredJob = restoreFunction(job.id, job.name, job.cron_string, job.entrytimestamp, job.approval_uploadId, job.teamlevel);
            const _ = {
              id: job.id,
              name: job.name,
              cron: job.cron_string,
              entry_timeStamp: job.entrytimestamp,
              uploadId: job?.approval_uploadId,
              level: job?.teamlevel,
              isScheduled: job.isScheduled,
              scheduledJob: cron.schedule(job.cron_string, _restoredJob.callback, { scheduled: job.isScheduled, timezone: job.timezone }),
            };
            this.#taskTable[process_table].jobs.push(_);
            console.info(`[INFO][JOB_SCHEDULER] Job: ${job.name} restored.`);
          }
        } catch (err) {
          console.error(`[JOB][JOB_SCHEDULER] Unable to restore to process table ${process_table}- ${err.message}`);
        }
      } else {
        console.info(`[INFO][JOB_SCHEDULER] No jobs to be restored for ${process_table}.`);
      }
    } catch (err) {
      throw new JobSchdeulerError("UNABLE_TO_RESTORE_JOB", `unable to restore jobs to process table- ${process_table} due to Error: ${err.message}`, err);
    }
  }

  /**
   * Recreates the specific job that is stored in the database for the provided process table.
   *
   * **NOTE:** This function is case sensitive. and must be called after all the process tables are restored. using {@link recreateProcessTable} function.
   * @param {String} process_table Process table id.
   * @param {String} job_name Job id.
   * @param {JobRecreationCallback} restoreFunction Restoration function that will return the a job for sent exisiting details to be added to the process table.
   * @returns {JOB|undefined} Restored job that will be added to process table in memory. Returns `undefined` if no job is found.
   * @throws {JobSchdeulerError} If two or more instances of the same job is found in the database.
   */
  async recreateASpecificJob(process_table, job_name, restoreFunction) {
    try {
      console.info(`[INFO][JOB_SCHEDULER] Restoring jobs for process table: ${process_table}`);
      await this.#connect();
      const { BACKGROUND_JOBS } = this.#db.entities(this.#dbNamespace);
      const _existingJobs = await cds.run(SELECT("*").from(BACKGROUND_JOBS).where({ process_id: process_table }));

      // check if job is already present in the process table.
      if (this.jobExists(process_table, job_name)) {
        console.warn(`[WARN][JOB_SCHEDULER] Job with name: ${job_name} already exists in process table: ${process_table}. Not Recreating...`);
        return undefined;
      }

      if (!_existingJobs || _existingJobs.length !== 0) {
        // find the number of jobs with the same name and the index of the job to be restored.
        const { jobCount, index } = _existingJobs.reduce(
          (acc, job, index) => {
            if (job.name === job_name) {
              acc.jobCount++;
              acc.index = index;
            }
            return acc;
          },
          { jobCount: 0, index: -1 }
        );

        if (jobCount > 1) {
          throw new JobSchdeulerError("MULTIPLE_JOBS_FOUND", `Multiple jobs with name: ${job_name} found in process table: ${process_table}.`);
        } else if (jobCount === 0) {
          console.info(`[INFO][JOB_SCHEDULER] Job with name: ${job_name} not found in database job table: ${process_table}.Plesae create a new job.`);
          return undefined;
        }

        const job = _existingJobs[index];
        if (job.name === job_name) {
          const _restoredJob = restoreFunction(job.id, job.name, job.cron_string, job.entrytimestamp, job.approval_uploadId, job.teamlevel);
          const _ = {
            id: job.id,
            name: job.name,
            cron: job.cron_string,
            entry_timeStamp: job.entrytimestamp,
            uploadId: job?.approval_uploadId ?? null,
            level: job?.teamlevel ?? null,
            isScheduled: job.isScheduled,
            scheduledJob: cron.schedule(job.cron_string, _restoredJob.callback, { scheduled: job.isScheduled, timezone: job.timezone }),
          };
          this.#taskTable[process_table].jobs.push(_);
          console.info(`[INFO][JOB_SCHEDULER] Job: ${job.name} with id:${job.id} restored.`);
          return _;
        }
      }
      console.info(`[INFO][JOB_SCHEDULER] No jobs to be restored for ${process_table}. Since Table found empty.`);
      return undefined;
    } catch (err) {
      throw new JobSchdeulerError("UNABLE_TO_RESTORE_JOB", `unable to restore job ${job_name} to process table- ${process_table} due to Error: ${err.message}`, err);
    }
  }

  /**
   * Adds A Job to the specified process table.
   * @param {String} process_id Process table id in which this job has to be included.
   * @param {JOB} job Job that has to be added to the process table.
   * @param {boolean} isScheduled When `true`, job will be scheduled automatically as soon as the job is added to the process table. `true` by default.
   * @param {String} timezone Timezone for the current job to be executed defaults to UTC or takes process table timezone.
   * @param {String} uploadId Upload id for the current approval.
   * @param {String} level Team level.
   */
  addJob(process_id, job, isScheduled = true, timezone = this.#utc, uploadId = null, level = null) {
    try {
      const id = randomUUID();
      const _today = new Date();
      //valdate cron
      if (!cron.validate(job.cronString)) {
        throw new Error("cron string is invalid.");
      }

      //check if process table is present;
      if (!this.#taskTable.hasOwnProperty(process_id)) {
        throw new Error(`Process table with id: ${process_id} not found`);
      }

      // checks if process table has a timezone specified.
      let _timezone = timezone === this.#utc && this.#taskTable[process_id].timezone !== this.#utc ? this.#taskTable[process_id].timezone : timezone;

      let _ = {
        id: id,
        name: job.name,
        cron: job.cronString,
        entry_timeStamp: _today.toISOString(),
        uploadId: uploadId,
        level: level,
        isScheduled: isScheduled,
        scheduledJob: cron.schedule(job.cronString, job.callback, { scheduled: isScheduled, timezone: _timezone }),
      };

      this.#taskTable[process_id].jobs.push(_);
      this.#addJobToDB(id, process_id, job.name, job.cronString, _today.toISOString(), isScheduled, _timezone, uploadId, level).then(() => {
        console.info(`[INFO][JOB_SCHEDULER] JOB ${job.name} added to database.`);
      });
      console.info(`[INFO][JOB_SCHEDULER] Job:${job.name} added to process table- ${process_id}`);
      return { id: id, scheduledJob: _.scheduledJob };
    } catch (err) {
      throw new JobSchdeulerError("UNABLE_TO_ADD_JOB", `unable to add ${job.name} job to process table- ${process_id} due to Error: ${err.message}`, err);
    }
  }

  /**
   * Removes a particular job from the process table.
   *
   * The job is first stopped and then removed from the process table.
   * @param {String} process_id
   * @param {String} job_id
   */
  removeJob(process_id, job_id) {
    try {
      //check if process table is present;
      if (!this.#taskTable.hasOwnProperty(process_id)) {
        throw new Error(`Process table with id: ${process_id} not found`);
      }

      const job = this.#taskTable[process_id].jobs.filter((job) => job.id === job_id);
      // job id validation.
      if (!job || job.length === 0) {
        throw new Error(`Job with job id: ${job_id} not found in process table: ${process_id}.`);
      }
      //stopping the job before deleting.
      job[0].scheduledJob.stop();
      this.#taskTable[process_id].jobs = this.#taskTable[process_id].jobs.filter((job) => job.id !== job_id);
      // remove the same job from database too.
      this.#removeJobFromDB(job_id)
        .then(() => {
          console.info(`[INFO][JOB_SCHEDULER] Job- ${job_id} deleted from DB.`);
        })
        .catch((err) => {
          throw err;
        });
      console.info(`[INFO][JOB_SCHEDULER] Job- ${job_id} deleted from process table- ${process_id}`);
    } catch (err) {
      throw new JobSchdeulerError("UNABLE_TO_REMOVE_JOB", `Unable to remove ${job_id} job from process table- ${process_id} due to Error: ${err.message}`, err);
    }
  }

  /**
   * Safely deletes the process table.
   * @param {String} id Id for the process table.
   */
  deleteProcessTable(id) {
    try {
      //check if process table is present;
      if (!this.#taskTable.hasOwnProperty(id)) {
        throw new Error(`Process table with id: ${process_id} not found`);
      }

      //remove each jon.
      this.#taskTable[id].jobs.forEach((job) => {
        this.removeJob(id, job.id);
        this.#removeJobFromDB(job.id)
          .then(() => {
            console.info(`[INFO][JOB_SCHEDULER] Job- ${job_id} deleted from DB.`);
          })
          .catch((err) => {
            throw err;
          });
      });

      delete this.#taskTable[id];
      console.info(`[INFO][JOB_SCHEDULER] Process table deleted.`);
      return;
    } catch (err) {
      throw new JobSchdeulerError("UNABLE_TO_DELETE_PROCESS_TABLE", `Unable to remove process table- ${id} due to Error: ${err.message}`, err);
    }
  }

  /**
   * If Job with the same name exists in the proided process tables or not.
   * **NOTE:** This function is case sensitive. and must be called after all the jobs are restored using {@link restoreExistingJobs} function.
   * @param {String} process_id
   * @param {String} job_name
   * @returns {boolean} `true` if job with the same name exists in the process table.
   */
  jobExists(process_id, job_name) {
    try {
      //check if process table is present;
      if (!this.#taskTable.hasOwnProperty(process_id)) {
        throw new Error(`Process table with id: ${process_id} not found`);
      }

      const _ = this.#taskTable[process_id].jobs.filter((job) => job.name === job_name);
      return !!_ && _.length > 0;
    } catch (err) {
      throw new JobSchdeulerError("UNABLE_TO_CHECK_JOB_EXISTENCE", `Unable to check if job with name: ${job_name} exists in process table- ${process_id} due to Error: ${err.message}`, err);
    }
  }
}
/**
 *  ### CRON String Syntax:
 *
 * ```
 *   ┌────────────── second (optional)
 *   │ ┌──────────── minute
 *   │ │ ┌────────── hour
 *   │ │ │ ┌──────── day of month
 *   │ │ │ │ ┌────── month
 *   │ │ │ │ │ ┌──── day of week
 *   │ │ │ │ │ │
 *   │ │ │ │ │ │
 *   * * * * * *
 * ```
 */
const JobSchdeuler = new SchdeulerInstance();

/**
 * Object freezed to create a singleton class.
 */
Object.freeze(JobSchdeuler);

module.exports = JobSchdeuler;
