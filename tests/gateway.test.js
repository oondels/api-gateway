"use strict";

const assert = require("node:assert/strict");
const { once } = require("node:events");
const http = require("node:http");
const { Writable } = require("node:stream");
const test = require("node:test");

const { createApp, DEFAULT_CORS_ORIGINS } = require("../dist/src/app");
const { loadConfig, SERVICE_ENV_KEYS } = require("../dist/src/config/dotenv");
const { PROXY_ROUTES } = require("../dist/src/proxy");

const listen = async (server) => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
};

const close = async (server) => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
};

const closeAll = async (servers) => {
  for (const server of servers) await close(server);
};

const request = (baseUrl, path, { method = "GET", headers = {}, body } = {}) =>
  new Promise((resolve, reject) => {
    const target = new URL(path, baseUrl);
    const clientRequest = http.request(target, { method, headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString(),
      }));
    });
    clientRequest.on("error", reject);
    if (body) clientRequest.write(body);
    clientRequest.end();
  });

const makeEnv = (target, extra = {}) => {
  const env = { GATEWAY_PORT: "2399", ...extra };
  for (const key of SERVICE_ENV_KEYS) env[key] = target;
  return env;
};

const startGateway = async (config, options) => {
  const server = http.createServer(createApp(config, options));
  const url = await listen(server);
  return { server, url };
};

test("healthcheck responds without proxying", async () => {
  const upstream = http.createServer((_request, response) => response.end("unexpected"));
  const target = await listen(upstream);
  const gateway = await startGateway(loadConfig({ env: makeEnv(target), loadEnvFile: false }), { logStream: false });
  try {
    const response = await request(gateway.url, "/");
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), { message: "Dass API Gateway is running!" });
  } finally {
    await close(gateway.server);
    await close(upstream);
  }
});

test("every explicit proxy route preserves its service selection and removes the prefix", async () => {
  const targets = new Map();
  const servers = [];
  for (const route of PROXY_ROUTES) {
    const server = http.createServer((incoming, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ service: route.service, url: incoming.url }));
    });
    servers.push(server);
    targets.set(route.service, await listen(server));
  }
  const fallback = http.createServer((incoming, response) => response.end(JSON.stringify({ service: "MAIN_SERVICE", url: incoming.url })));
  const fallbackTarget = await listen(fallback);
  servers.push(fallback);
  const env = makeEnv(fallbackTarget);
  for (const route of PROXY_ROUTES) env[route.service] = targets.get(route.service);
  const gateway = await startGateway(loadConfig({ env, loadEnvFile: false }), { logStream: false });
  try {
    for (const route of PROXY_ROUTES) {
      const response = await request(gateway.url, `${route.prefix}/resource?keep=yes`);
      assert.equal(response.status, 200, route.prefix);
      assert.deepEqual(JSON.parse(response.body), { service: route.service, url: "/resource?keep=yes" }, route.prefix);
    }
    const fallbackResponse = await request(gateway.url, "/api/not-listed?keep=yes");
    assert.deepEqual(JSON.parse(fallbackResponse.body), { service: "MAIN_SERVICE", url: "/not-listed?keep=yes" });
  } finally {
    await close(gateway.server);
    await closeAll(servers);
  }
});

test("proxy forwards method, query, body, custom headers, cookies and multiple auth cookies", async () => {
  const upstream = http.createServer(async (incoming, response) => {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    assert.equal(incoming.method, "PATCH");
    assert.equal(incoming.url, "/session?return=%2Fhome");
    assert.equal(incoming.headers.authorization, "Bearer test-token");
    assert.equal(incoming.headers.cookie, "session=abc; theme=dark");
    assert.equal(incoming.headers["x-request-id"], "request-123");
    assert.equal(Buffer.concat(chunks).toString(), '{"name":"Ada"}');
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Set-Cookie", ["token=rotated; HttpOnly", "refresh=rotated; HttpOnly"]);
    response.end('{"ok":true}');
  });
  const target = await listen(upstream);
  const gateway = await startGateway(loadConfig({ env: makeEnv(target), loadEnvFile: false }), { logStream: false });
  try {
    const response = await request(gateway.url, "/api/session?return=%2Fhome", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength('{"name":"Ada"}'),
        authorization: "Bearer test-token",
        cookie: "session=abc; theme=dark",
        "x-request-id": "request-123",
      },
      body: '{"name":"Ada"}',
    });
    assert.equal(response.status, 200);
    assert.equal(response.body, '{"ok":true}');
    assert.deepEqual(response.headers["set-cookie"], ["token=rotated; HttpOnly", "refresh=rotated; HttpOnly"]);
  } finally {
    await close(gateway.server);
    await close(upstream);
  }
});

test("proxy forwards POST, PUT, PATCH and DELETE methods", async () => {
  const received = [];
  const upstream = http.createServer(async (incoming, response) => {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    received.push({ method: incoming.method, url: incoming.url, body: Buffer.concat(chunks).toString() });
    response.end("ok");
  });
  const target = await listen(upstream);
  const gateway = await startGateway(loadConfig({ env: makeEnv(target), loadEnvFile: false }), { logStream: false });
  try {
    const calls = [
      ["POST", "/api/methods/post", '{"create":true}'],
      ["PUT", "/api/methods/put", '{"replace":true}'],
      ["PATCH", "/api/methods/patch", '{"update":true}'],
      ["DELETE", "/api/methods/delete", undefined],
    ];
    for (const [method, path, body] of calls) {
      const response = await request(gateway.url, path, {
        method,
        headers: body ? { "content-type": "application/json", "content-length": Buffer.byteLength(body) } : {},
        body,
      });
      assert.equal(response.status, 200, method);
    }
    assert.deepEqual(received, [
      { method: "POST", url: "/methods/post", body: '{"create":true}' },
      { method: "PUT", url: "/methods/put", body: '{"replace":true}' },
      { method: "PATCH", url: "/methods/patch", body: '{"update":true}' },
      { method: "DELETE", url: "/methods/delete", body: "" },
    ]);
  } finally {
    await close(gateway.server);
    await close(upstream);
  }
});

test("auth fallback routes preserve request cookies and auth cookie rotation", async () => {
  const expectedPaths = ["/auth/login", "/auth/me", "/auth/token/refresh", "/auth/logout"];
  const received = [];
  const upstream = http.createServer(async (incoming, response) => {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    received.push({ method: incoming.method, url: incoming.url, cookie: incoming.headers.cookie, body: Buffer.concat(chunks).toString() });
    response.setHeader("content-type", "application/json");
    response.setHeader("set-cookie", [
      `token=${encodeURIComponent(incoming.url)}; HttpOnly; Path=/`,
      `refresh=${encodeURIComponent(incoming.url)}; HttpOnly; Path=/`,
    ]);
    response.end(JSON.stringify({ path: incoming.url }));
  });
  const target = await listen(upstream);
  const gateway = await startGateway(loadConfig({ env: makeEnv(target), loadEnvFile: false }), { logStream: false });
  try {
    for (const path of expectedPaths) {
      const response = await request(gateway.url, `/api${path}`, {
        method: path === "/auth/login" ? "POST" : "GET",
        headers: { cookie: "token=old-token; refresh=old-refresh" },
        body: path === "/auth/login" ? '{"email":"user@example.test","password":"test"}' : undefined,
      });
      assert.equal(response.status, 200, path);
      assert.deepEqual(JSON.parse(response.body), { path });
      assert.deepEqual(response.headers["set-cookie"], [
        `token=${encodeURIComponent(path)}; HttpOnly; Path=/`,
        `refresh=${encodeURIComponent(path)}; HttpOnly; Path=/`,
      ], path);
    }
    assert.deepEqual(received.map(({ url, cookie }) => ({ url, cookie })), expectedPaths.map((url) => ({
      url,
      cookie: "token=old-token; refresh=old-refresh",
    })));
    assert.equal(received[0].method, "POST");
    assert.equal(received[0].body, '{"email":"user@example.test","password":"test"}');
  } finally {
    await close(gateway.server);
    await close(upstream);
  }
});

test("CORS, Helmet, and access logs preserve security behavior without logging query strings", async () => {
  const upstream = http.createServer((_request, response) => response.end("ok"));
  const target = await listen(upstream);
  let logs = "";
  const logStream = new Writable({ write(chunk, _encoding, callback) { logs += chunk; callback(); } });
  const gateway = await startGateway(loadConfig({ env: makeEnv(target, { CORS_ORIGINS: "https://app.example" }), loadEnvFile: false }), { logStream });
  try {
    const cors = await request(gateway.url, "/api/example?token=secret", { headers: { origin: "https://app.example" } });
    assert.equal(cors.headers["access-control-allow-origin"], "https://app.example");
    assert.equal(cors.headers["access-control-allow-credentials"], "true");
    assert.equal(cors.headers["x-content-type-options"], "nosniff");
    assert.match(logs, /GET \/api\/example 200/);
    assert.doesNotMatch(logs, /token=secret/);
    const defaultOrigin = await request(gateway.url, "/", { headers: { origin: DEFAULT_CORS_ORIGINS[0] } });
    assert.equal(defaultOrigin.headers["access-control-allow-origin"], DEFAULT_CORS_ORIGINS[0]);
  } finally {
    await close(gateway.server);
    await close(upstream);
  }
});

test("loadConfig rejects missing destinations and malformed operational settings", () => {
  assert.throws(
    () => loadConfig({ env: { GATEWAY_PORT: "0" }, loadEnvFile: false }),
    /TELAS_SERVICE is required.*GATEWAY_PORT must be an integer/s,
  );
  assert.throws(
    () => loadConfig({ env: makeEnv("not-a-url", { RATE_LIMIT_ENABLED: "maybe", PROXY_TIMEOUT_MS: "-1" }), loadEnvFile: false }),
    /RATE_LIMIT_ENABLED must be true.*PROXY_TIMEOUT_MS must be an integer/s,
  );
});

test("rate limit is disabled by default and applies only when explicitly enabled", async () => {
  const upstream = http.createServer((_request, response) => response.end("ok"));
  const target = await listen(upstream);
  const disabled = await startGateway(loadConfig({ env: makeEnv(target), loadEnvFile: false }), { logStream: false });
  const enabled = await startGateway(loadConfig({ env: makeEnv(target, { RATE_LIMIT_ENABLED: "true", RATE_LIMIT_MAX: "1", RATE_LIMIT_WINDOW_MS: "60000" }), loadEnvFile: false }), { logStream: false });
  try {
    for (const path of ["/api/first", "/api/second", "/api/third"]) {
      assert.equal((await request(disabled.url, path)).status, 200, path);
    }
    assert.equal((await request(enabled.url, "/api/first")).status, 200);
    const limited = await request(enabled.url, "/api/second");
    assert.equal(limited.status, 429);
    assert.match(limited.body, /excedeu o limite/);
  } finally {
    await close(disabled.server);
    await close(enabled.server);
    await close(upstream);
  }
});

test("standard proxy errors opt in to 502 responses", async () => {
  const unavailable = http.createServer((incoming) => incoming.socket.destroy());
  const unavailableTarget = await listen(unavailable);
  const gateway = await startGateway(loadConfig({ env: makeEnv(unavailableTarget, { STANDARD_PROXY_ERRORS_ENABLED: "true" }), loadEnvFile: false }), { logStream: false });
  try {
    const response = await request(gateway.url, "/api/unavailable");
    assert.equal(response.status, 502);
    assert.deepEqual(JSON.parse(response.body), { message: "Serviço de destino indisponível." });
  } finally {
    await close(gateway.server);
    await close(unavailable);
  }
});

test("proxy timeout maps to 504 when standard errors and a timeout are enabled", async () => {
  const slow = http.createServer(() => {});
  const target = await listen(slow);
  const gateway = await startGateway(loadConfig({ env: makeEnv(target, { STANDARD_PROXY_ERRORS_ENABLED: "true", PROXY_TIMEOUT_MS: "25" }), loadEnvFile: false }), { logStream: false });
  try {
    const response = await request(gateway.url, "/api/slow");
    assert.equal(response.status, 504);
    assert.deepEqual(JSON.parse(response.body), { message: "Tempo limite ao acessar o serviço de destino." });
  } finally {
    await close(gateway.server);
    await close(slow);
  }
});
