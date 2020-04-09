# [wilsonl.in/wiki](https://wilsonl.in/wiki/)

A simple and fast English Wikipedia search, built as a demo for [Edgesearch](https://github.com/wilsonzlin/edgesearch).

## Data

Uses article titles ranked by page views to build index, sourced from [Wikistats](https://dumps.wikimedia.org/other/pagecounts-ez/). [process.py](./build/data/process.py) takes the data as `raw.txt` and outputs `documents.txt`, `terms.txt`, and `default-results.txt`, necessary for [Edgesearch](https://github.com/wilsonzlin/edgesearch) to build the worker.

## Worker

The worker is built using [build.sh](./build/worker/build.sh) and deployed using [deploy.sh](./build/worker/deploy.sh).

## Client

A basic web app is available in [client](./client/), built using React. It uses a deployed Edgesearch worker to find Wikipedia titles, then uses the [Wikipedia REST API](https://en.wikipedia.org/api/rest_v1/#/Page%20content/get_page_summary__title_) to load thumbnails and descriptions of the articles.
