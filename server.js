"use strict";

const fs = require("fs-extra");
const path = require("path");
const https = require("https");
const express = require("express");
const moment = require("moment");
const handlebars = require("handlebars");
const redis = require("redis");
const minimist = require("minimist");
const {promisify} = require("util");
const compression = require("compression");
const crypto = require("crypto");
const url = require("url");

const ARGS = minimist(process.argv.slice(2));
const FIELDS = ["title", "location"];
const MODES = ["require", "contain", "exclude"];
const JOBS = fs.readJSONSync(path.join(__dirname, "data-processed.json"));
const WORD_FILTERS = fs.readJSONSync(path.join(__dirname, "data-filters.json"));
const MAX_RESULTS = 200;

const db = redis.createClient({
  return_buffers: true,
});
const db_random_key = () => crypto.randomBytes(16).toString("base64");
const db_word_filter_key = (field, word) => `${field}_${word}`;
const db_cmd = promisify(db.send_command).bind(db);
const db_multi = cmds => new Promise((resolve, reject) => db.multi(cmds)
  .exec((err, results) => err ? reject(err) : resolve(results)));

const server = express();
server.use(compression());

let Page;
let Analytics;

if (ARGS.analytics) {
  Analytics = handlebars.compile(fs.readFileSync(path.join(__dirname, "src", "page.analytics.hbs"), "utf8"))({
    trackingID: ARGS.analytics,
  });
}

if (ARGS.hot) {
  console.log(`Hot reloading mode`);
  const PAGE_TEMPLATE_PATH = path.join(__dirname, "src", "page.hbs");
  const PAGE_RESOURCES_TEMPLATE_PATH = path.join(__dirname, "src", "page.resources.hbs");
  const compiler = () => {
    const compiled = handlebars.compile(fs.readFileSync(PAGE_TEMPLATE_PATH, "utf8"));
    let compiled_resources = handlebars.compile(fs.readFileSync(PAGE_RESOURCES_TEMPLATE_PATH, "utf8"));
    Page = ctx => compiled({
      ...ctx,
      analytics: Analytics,
      externalResources: compiled_resources,
    });
    console.log(moment().format("MMMM Do YYYY, HH:mm:ss"), "Loaded");
  };
  compiler();
  fs.watchFile(PAGE_TEMPLATE_PATH, compiler);
  fs.watchFile(PAGE_RESOURCES_TEMPLATE_PATH, compiler);
  server.use("/static", express.static(path.join(__dirname, "src", "static"), {
    dotfiles: "allow",
    extensions: false,
    fallthrough: false,
    index: false,
    redirect: false,
  }));
} else {
  const compiled = handlebars.compile(fs.readFileSync(path.join(__dirname, "build", "page.hbs"), "utf8"));
  Page = ctx => compiled({
    ...ctx,
    analytics: Analytics,
  });
  server.use("/static", express.static(path.join(__dirname, "build", "static"), {
    dotfiles: "allow",
    extensions: false,
    fallthrough: false,
    immutable: true,
    index: false,
    lastModified: false,
    maxAge: moment.duration(2, "hours").asMilliseconds(),
    redirect: false,
  }));
}

(async function () {
  const db_commands = [];
  for (const field of FIELDS) {
    for (const word of Object.keys(WORD_FILTERS[field])) {
      const filter = WORD_FILTERS[field][word];
      // Can't directly create from Int32Array due to endianness of TypedArrays
      const buffer = Buffer.alloc(filter.length * 4);
      for (const [idx, num] of filter.entries()) {
        buffer.writeInt32BE(num, idx * 4);
      }
      db_commands.push(["SET", db_word_filter_key(field, word), buffer]);
    }
  }
  await db_multi(db_commands);

  if (ARGS["https-key"]) {
    // Redirect all HTTP requests to HTTPS server
    const redirect = express();
    redirect.use((req, res) => res.redirect(`https://${req.headers.host}${req.url}`));
    redirect.listen(80);

    https.createServer({
      key: await fs.readFile(ARGS["https-key"], "utf8"),
      cert: await fs.readFile(ARGS["https-cert"], "utf8"),
      ca: ARGS["https-ca"] && await fs.readFile(ARGS["https-ca"], "utf8"),
    }, server).listen(443, () => console.log(`HTTPS server has started`));
  } else {
    server.listen(3001, () => console.log(`Server has started`));
  }
})();

const valid_word = str => {
  // TODO Need to require only known words as otherwise bitfield operations may not work on non-existent keys
  return /^[\x20-\x7e]{1,50}$/.test(str);
};

const parse_query = params => {
  let parsed = {
    rules: FIELDS.map(field => ({
      field: field,
      terms: [],
    })),
  };

  for (const part of (params.q || "").trim().split("|")) {
    const mode = part.startsWith("!") ? "exclude" :
                 part.startsWith("~") ? "contain" :
                 "require";

    const [field, words_raw] = part.slice(mode != "require").split(":", 2);

    if (FIELDS.includes(field)) {
      const words = words_raw.replace(/[;:,]/g, " ")
        .trim()
        .split(/\s+/)
        .filter(w => valid_word(w))
        .map(w => w.toLowerCase());
      if (words.length) {
        parsed.rules.find(r => r.field == field).terms.push({mode, words});
      }
    }
  }
  return parsed;
};

server.get("/", (req, res) => res.redirect("/jobs"));

server.get("/jobs", async (req, res) => {
  let {rules} = parse_query(req.query);

  // Don't initialise with all modes as unused modes will break bitwise operations
  /*
   *   {
   *     "require": {
   *       "title": Set(["a", "b"])
   *     },
   *     "exclude": {
   *       "title": Set(["c"]),
   *       "location": Set(["london"])
   *     }
   *   }
   *
   *   (title_a & title_b) & ~(title_c | location_london)
   */
  const word_rules = {};

  let search_words_count = 0;
  let last_search_term;
  for (const {field, terms} of rules) {
    for (const {mode, words} of terms) {
      if (!word_rules[mode]) {
        word_rules[mode] = {};
      }
      if (!word_rules[mode][field]) {
        word_rules[mode][field] = new Set();
      }
      for (const word of words) {
        search_words_count++;
        word_rules[mode][field].add(word);
        last_search_term = {word, field, mode};
      }
    }
  }

  let jobs;
  let overflow = false;

  if (!search_words_count) {
    jobs = JOBS;
    if (jobs.length > MAX_RESULTS) {
      overflow = true;
      jobs = jobs.slice(0, MAX_RESULTS);
    }
  } else {
    let filtered;

    if (search_words_count == 1) {
      filtered = await db_cmd("GET", [db_word_filter_key(last_search_term.field, last_search_term.word)]);
      if (last_search_term.mode == "exclude") {
        for (let i = 0; i < filtered.length; i++) {
          filtered[i] = ~filtered[i];
        }
      }
    } else {
      const batch_commands = [];
      const mode_destination_keys = [];
      const result_key = db_random_key();

      // Don't use MODES as unused modes will break bitwise operations
      for (const mode of Object.keys(word_rules)) {
        const mode_source_keys = [];
        const mode_destination_key = mode_destination_keys[mode_destination_keys.length] = db_random_key();
        for (const field of Object.keys(word_rules[mode])) {
          for (const word of word_rules[mode][field]) {
            mode_source_keys.push(db_word_filter_key(field, word));
          }
        }
        switch (mode) {
        case "require":
          batch_commands.push(["BITOP", "AND", mode_destination_key, ...mode_source_keys]);
          break;
        case "contain":
          batch_commands.push(["BITOP", "OR", mode_destination_key, ...mode_source_keys]);
          break;
        case "exclude":
          const tmp = db_random_key();
          batch_commands.push(["BITOP", "OR", tmp, ...mode_source_keys]);
          batch_commands.push(["BITOP", "NOT", mode_destination_key, tmp]);
          batch_commands.push(["DEL", tmp]);
          break;
        }
      }

      batch_commands.push(["BITOP", "AND", result_key, ...mode_destination_keys]);
      const result_idx = batch_commands.push(["GET", result_key]) - 1;
      batch_commands.push(["DEL", result_key, ...mode_destination_keys]);

      const response = await db_multi(batch_commands);
      filtered = response[result_idx];
    }

    jobs = [];
    for (let idx = 0; idx < filtered.length; idx++) {
      let anchor = idx * 8;
      let byte = filtered[idx];
      let done = false;
      for (let bit = 0; byte; bit++) {
        if (byte & 128) {
          const job = JOBS[anchor + bit];
          if (
            // Reached extra padding bits at end
            !job ||
            (overflow = jobs.length > MAX_RESULTS)
          ) {
            done = true;
            break;
          }
          jobs.push(job);
        }
        byte <<= 1;
      }
      if (done) {
        break;
      }
    }
  }
  const resultsCount = `${jobs.length}${overflow ? "+" : ""}`;
  const title = `${jobs.length == 1 ? "1 result" : `${resultsCount} results`} | Microsoft Careers`;
  const heading = jobs.length == 1 ? "1 match" : `${resultsCount} matches`;
  const description = `Find your next career at Microsoft`;
  const URL = url.format({
    protocol: req.protocol,
    host: req.get("host"),
    pathname: req.originalUrl,
  });
  const shareLinkedIn = `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(URL)}&title=${encodeURIComponent(title)}&summary=${encodeURIComponent(description)}&source=msc.wilsonl.in`;
  const shareFacebook = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(URL)}`;
  const shareTwitter = `https://twitter.com/home?status=${encodeURIComponent(title)}%20${encodeURIComponent(URL)}`;
  const shareEmail = `mailto:?&subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${title}\n${URL}`)}`;

  res.send(Page({
    // User-submitted form data
    rules: rules.map(r => ({
      ...r,
      terms: r.terms.map(t => ({
        ...t,
        words: t.words.join(" "),
      })),
    })),

    FIELDS: FIELDS,
    JOBS_COUNT: JOBS.length,

    title, heading, description, URL,
    shareLinkedIn, shareFacebook, shareTwitter, shareEmail,

    // Results
    jobs: jobs,
    noResults: !jobs.length,
    singleResult: jobs.length == 1,
  })
  // Fix :empty not working due to whitespace in empty tags
  // that minifier did not pick up or was dynamically generated
    .replace(/>\s+</g, "><"));
});
