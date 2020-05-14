# Edgesearch Test Server

To test a built Edgesearch worker without having to deploy it:

1. Run the test KV server using `edgesearch test`.
2. Run the server that executes the worker script locally using:

```bash
npx edgesearch-test-server \
  --output-dir /path/to/edgesearch/build/output/dir/ \
  --port 8080 \
  --kv-port 9090
```
