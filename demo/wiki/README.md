# [wilsonl.in/wiki](https://wilsonl.in/wiki/)

A simple and fast English Wikipedia search, built as a demo for [Edgesearch](https://github.com/wilsonzlin/edgesearch).

## Data

The service uses monthly dumps of article titles ranked by page views to build the index, sourced from [Wikistats](https://dumps.wikimedia.org/other/pageview_complete/readme.html). The Rust program [processor](./data/processor) should be provided with the path to the data and output directory to process and output `docs.txt` and `terms.txt`, necessary for [Edgesearch](https://github.com/wilsonzlin/edgesearch) to build the worker. Other scripts expect the output directory to be `data/build`.

## Worker

The worker is built using [build.sh](./worker/build.sh) and deployed using [deploy.sh](./worker/deploy.sh). They use a release build of Edgesearch from this repository, so run `cargo build --release` at the repo root before running the scripts.

## Client

A basic web app is available in [client](./client/), built using React. It uses a deployed Edgesearch worker to find Wikipedia titles, and then uses the [Wikipedia REST API](https://en.wikipedia.org/api/rest_v1/#/Page%20content/get_page_summary__title_) to load thumbnails and descriptions of the articles.
