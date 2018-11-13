"use strict";

const fs = require("fs-extra");

const {
  WORKER_SCRIPT,

  BUILD_WORKER,

  BUILD_DATA_JOBS,
  BUILD_DATA_FILTERS,

  BUILD_DATA_COMBINED,
  ENV_WORKER_PAGE,
  ENV_WORKER_DATA,
} = require("./const");

const data = {
  JOBS: fs.readJSONSync(BUILD_DATA_JOBS),
  FILTERS: fs.readJSONSync(BUILD_DATA_FILTERS),
};

fs.writeJSONSync(BUILD_DATA_COMBINED, data);
console.log(`Generated combined data`);

fs.readFile(WORKER_SCRIPT, "utf8")
  .then(js => js.replace(/{{{{{ (.*?) }}}}}/g, (_, param) => {
    switch (param) {
    case "DATA_URL":
      return ENV_WORKER_DATA;
    case "PAGE_URL":
      return ENV_WORKER_PAGE;
    default:
      throw new ReferenceError(`Unknown parameter ${param}`);
    }
  }))
  .then(js => fs.writeFile(BUILD_WORKER, js))
  .catch(console.error)
;
