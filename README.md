# [work-at-microsoft](https://work-at-microsoft.wilsonl.in/jobs).wilsonl.in

A web server + client that searches for careers at Microsoft.
Faster and more precise than official website, and comes with a nice UI.
The result of a weekend project trying to find a better way to search.

## Features

- Uses bit fields to search for keywords very quickly, efficiently, and accurately
- All data is stored in a few MBs of memory as code&mdash;no database or storage required
- Runs only on Cloudflare Workers and WebAssembly for extremely fast, scalable performance
- Clean, responsive UI using vanilla JS and Microsoft Fabric design

## Comparison

This app allows the combining of simple filters to form advanced, precise queries.
Combined with the performance optimisations, it delivers far more filtered results in usually under a second.

On one of my random tests, searching for "machine learning researcher engineer" returned over 3000 results, while taking around 1 second.
Searching for "title:machine+learning|~title:researcher engineer" gave 8 results in less than 50 milliseconds.

For a UI comparison, see the [screenshots folder](screenshots).
