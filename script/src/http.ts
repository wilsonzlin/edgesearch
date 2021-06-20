export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const responsePreflight = () =>
  new Response(null, {
    headers: CORS_HEADERS,
  });

export const responseError = (error: string, status: number = 400) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });

export const responseRawJson = (json: string, status = 200) =>
  new Response(json, {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });

export const responseNoResults = () =>
  responseRawJson(`{"results":[],"continuation":null,"total":0}`);
