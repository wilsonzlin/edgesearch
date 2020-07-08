const fs = require('fs');
const jobs = require('@wzlin/jobs');
const mkdirp = require('mkdirp');
const path = require('path');

const BUILD = path.join(__dirname, 'build');
mkdirp.sync(BUILD);

const COMPANIES = ['Apple', 'Amazon', 'Facebook', 'Google', 'Microsoft'];
const FIELDS = ['company', 'description', 'location', 'title'];

(async () => {
  const rawJobs = await jobs.fetchAndParse({
    cacheDir: path.join(__dirname, 'cache'),
    companies: COMPANIES,
  });
  const rawJobsSorted = COMPANIES.flatMap(c => rawJobs[c]).sort((a, b) => b.date.localeCompare(a.date));

  await fs.promises.writeFile(path.join(BUILD, 'jobs.json'), JSON.stringify(rawJobs));

  const documents = [];
  const terms = [];

  for (const job of rawJobsSorted) {
    job.company = company;
    documents.push(JSON.stringify(job), '\0');
    for (const field of FIELDS) {
      for (const word of (job[field] || '').split(/[^a-zA-Z0-9]+/).filter(w => w).map(w => w.toLowerCase())) {
        terms.push(`${field}_${word}`, '\0');
      }
    }
    terms.push('\0');
  }

  await Promise.all([
    fs.promises.writeFile(path.join(BUILD, 'docs.txt'), documents.join('')),
    fs.promises.writeFile(path.join(BUILD, 'terms.txt'), terms.join('')),
  ]);
})()
  .catch(console.error);
