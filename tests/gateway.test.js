"use strict";

const assert = require("node:assert/strict");
const { once } = require("node:events");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { Writable } = require("node:stream");
const test = require("node:test");

const { createApp, DEFAULT_CORS_ORIGINS } = require("../dist/src/app");
const { loadConfig, SERVICE_ENV_KEYS } = require("../dist/src/config/dotenv");
const { PROXY_ROUTES, setupWebSocketProxy } = require("../dist/src/proxy");
const { ROUTE_DEFINITIONS, validateRouteRegistry } = require("../dist/src/config/routes");

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
  setupWebSocketProxy(server, config);
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

test("liveness and readiness respond without probing upstream", async () => {
  let probes = 0;
  const upstream = http.createServer((incoming, response) => {
    probes += 1;
    response.end(JSON.stringify({ status: "ok" }));
  });
  const target = await listen(upstream);
  const gateway = await startGateway(loadConfig({ env: makeEnv(target), loadEnvFile: false }), { logStream: false });
  try {
    const live = await request(gateway.url, "/health/live");
    assert.equal(live.status, 200);
    assert.deepEqual(JSON.parse(live.body), { status: "ok" });

    const ready = await request(gateway.url, "/health/ready");
    assert.equal(ready.status, 200);
    assert.deepEqual(JSON.parse(ready.body), { status: "ok" });
    assert.equal(probes, 0);
  } finally {
    await close(gateway.server);
    await close(upstream);
  }
});

test("route registry is the source for code, environment example and documentation", () => {
  assert.equal(PROXY_ROUTES, ROUTE_DEFINITIONS);
  assert.equal(PROXY_ROUTES.length, 22);
  assert.equal(SERVICE_ENV_KEYS.length, 23);
  assert.equal(SERVICE_ENV_KEYS[0], "MAIN_SERVICE");

  const documentedRoutes = [...fs.readFileSync(path.join(__dirname, "../docs/rotas.md"), "utf8").matchAll(
    /^\| `(\/api\/[^`]+)` \| `([A-Z0-9_]+)` \|$/gm,
  )].map(([, prefix, service]) => ({ prefix, service }));
  assert.deepEqual(documentedRoutes, PROXY_ROUTES);

  const envExample = fs.readFileSync(path.join(__dirname, "../.env.example"), "utf8");
  for (const key of SERVICE_ENV_KEYS) {
    assert.match(envExample, new RegExp(`^${key}=`, "m"), key);
  }
});

test("route registry rejects malformed, duplicate and ambiguous prefixes", () => {
  assert.throws(
    () => validateRouteRegistry([{ prefix: "/api", service: "SERVICE" }]),
    /non-empty \/api\/<prefix>/,
  );
  assert.throws(
    () => validateRouteRegistry([{ prefix: "/api/example", service: "" }]),
    /destination service/,
  );
  assert.throws(
    () => validateRouteRegistry([
      { prefix: "/api/example", service: "SERVICE_A" },
      { prefix: "/api/example", service: "SERVICE_B" },
    ]),
    /duplicated/,
  );
  assert.throws(
    () => validateRouteRegistry([
      { prefix: "/api/example", service: "SERVICE_A" },
      { prefix: "/api/example/detail", service: "SERVICE_B" },
    ]),
    /ambiguous/,
  );
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

test("auth fallback transports security headers and does not create service credentials", async () => {
  const received = [];
  const upstream = http.createServer((incoming, response) => {
    received.push({
      url: incoming.url,
      origin: incoming.headers.origin,
      csrf: incoming.headers["x-csrf-token"],
      forwardedHost: incoming.headers["x-forwarded-host"],
      forwardedFor: incoming.headers["x-forwarded-for"],
      serviceToken: incoming.headers["x-service-token"],
      cookie: incoming.headers.cookie,
    });

    if (incoming.url === "/notification/send" && incoming.headers["x-service-token"] !== "service-secret") {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ code: "NOTIFICATION_SERVICE_UNAUTHORIZED" }));
      return;
    }

    response.setHeader("set-cookie", "adminToken=rotated; HttpOnly; Path=/");
    response.end(JSON.stringify({ ok: true }));
  });
  const target = await listen(upstream);
  const gateway = await startGateway(loadConfig({ env: makeEnv(target), loadEnvFile: false }), { logStream: false });
  try {
    const headers = {
      cookie: "adminToken=old-token",
      origin: "http://localhost:5174",
      "x-csrf-token": "csrf-token",
      "x-forwarded-host": "localhost:5174",
      "x-forwarded-for": "192.0.2.10",
    };
    const admin = await request(gateway.url, "/api/auth/admin/me/email", { method: "PATCH", headers, body: "{}" });
    assert.equal(admin.status, 200);
    assert.deepEqual(admin.headers["set-cookie"], ["adminToken=rotated; HttpOnly; Path=/"]);

    const unauthorizedNotification = await request(gateway.url, "/api/notification/send", { method: "POST", headers });
    assert.equal(unauthorizedNotification.status, 401);

    const authorizedNotification = await request(gateway.url, "/api/notification/send", {
      method: "POST",
      headers: { ...headers, "x-service-token": "service-secret" },
    });
    assert.equal(authorizedNotification.status, 200);

    assert.deepEqual(received, [
      {
        url: "/auth/admin/me/email",
        origin: "http://localhost:5174",
        csrf: "csrf-token",
        forwardedHost: "localhost:5174",
        forwardedFor: "192.0.2.10",
        serviceToken: undefined,
        cookie: "adminToken=old-token",
      },
      {
        url: "/notification/send",
        origin: "http://localhost:5174",
        csrf: "csrf-token",
        forwardedHost: "localhost:5174",
        forwardedFor: "192.0.2.10",
        serviceToken: undefined,
        cookie: "adminToken=old-token",
      },
      {
        url: "/notification/send",
        origin: "http://localhost:5174",
        csrf: "csrf-token",
        forwardedHost: "localhost:5174",
        forwardedFor: "192.0.2.10",
        serviceToken: "service-secret",
        cookie: "adminToken=old-token",
      },
    ]);
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
    const cors = await request(gateway.url, "/api/example?token=secret", {
      headers: { origin: "https://app.example", "x-request-id": "request-log" },
    });
    assert.equal(cors.headers["access-control-allow-origin"], "https://app.example");
    assert.equal(cors.headers["access-control-allow-credentials"], "true");
    assert.equal(cors.headers["x-content-type-options"], "nosniff");
    assert.equal(cors.headers["x-request-id"], "request-log");
    assert.match(logs, /GET \/api\/example 200/);
    assert.match(logs, /request_id=request-log destination=MAIN_SERVICE/);
    assert.doesNotMatch(logs, /token=secret/);
    const defaultOrigin = await request(gateway.url, "/", { headers: { origin: DEFAULT_CORS_ORIGINS[0] } });
    assert.equal(defaultOrigin.headers["access-control-allow-origin"], DEFAULT_CORS_ORIGINS[0]);
  } finally {
    await close(gateway.server);
    await close(upstream);
  }
});

test("operational defaults enable bounded proxy failures", () => {
  const target = "http://127.0.0.1:2399";
  const config = loadConfig({ env: makeEnv(target), loadEnvFile: false });
  assert.equal(config.proxyTimeoutMs, 30_000);
  assert.equal(config.standardProxyErrorsEnabled, true);
  assert.equal(config.strictRouteMode, false);
});

test("strict route mode rejects unknown API paths without using MAIN_SERVICE", async () => {
  let upstreamCalls = 0;
  const upstream = http.createServer((_request, response) => {
    upstreamCalls += 1;
    response.end("unexpected");
  });
  const target = await listen(upstream);
  const gateway = await startGateway(loadConfig({
    env: makeEnv(target, { STRICT_ROUTE_MODE: "true" }),
    loadEnvFile: false,
  }), { logStream: false });
  try {
    const response = await request(gateway.url, "/api/unknown");
    assert.equal(response.status, 404);
    assert.deepEqual(JSON.parse(response.body), { message: "Rota não cadastrada no Gateway." });
    assert.equal(upstreamCalls, 0);
  } finally {
    await close(gateway.server);
    await close(upstream);
  }
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

test("standard proxy errors map an unavailable destination to 502 by default", async () => {
  const unavailable = http.createServer((incoming) => incoming.socket.destroy());
  const unavailableTarget = await listen(unavailable);
  const gateway = await startGateway(loadConfig({ env: makeEnv(unavailableTarget), loadEnvFile: false }), { logStream: false });
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


test("ERP WebSocket upgrade strips prefix and preserves query and authorization before any HTTP request", async () => {
  const upstream = http.createServer();
  let received;
  let upstreamSocket;
  upstream.on("upgrade", (incoming, socket) => {
    upstreamSocket = socket;
    received = { url: incoming.url, authorization: incoming.headers.authorization };
    socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
  });
  const target = await listen(upstream);
  const config = loadConfig({ env: makeEnv(target), loadEnvFile: false });
  const gateway = await startGateway(config, { logStream: false });
  let upgradedSocket;
  try {
    await new Promise((resolve, reject) => {
      const outgoing = http.request(new URL("/api/erp-modelagem/socket.io/?EIO=4&transport=websocket", gateway.url), {
        headers: { Connection: "Upgrade", Upgrade: "websocket", Authorization: "Bearer test-token" },
      });
      outgoing.setTimeout(3000, () => outgoing.destroy(new Error("WebSocket upgrade timed out")));
      outgoing.on("error", reject);
      outgoing.on("response", () => reject(new Error("Expected WebSocket upgrade")));
      outgoing.on("upgrade", (response, socket) => {
        upgradedSocket = socket;
        assert.equal(response.statusCode, 101);
        resolve();
      });
      outgoing.end();
    });
    assert.deepEqual(received, { url: "/socket.io/?EIO=4&transport=websocket", authorization: "Bearer test-token" });
  } finally {
    upgradedSocket?.destroy();
    upstreamSocket?.destroy();
    await close(gateway.server);
    await close(upstream);
  }
});


test("unused services may be omitted and their routes do not fall back to authentication", async () => {
  let calls = 0;
  const upstream = http.createServer((_incoming, response) => { calls += 1; response.end("auth"); });
  const target = await listen(upstream);
  const config = loadConfig({ env: { GATEWAY_PORT: "2399", MAIN_SERVICE: target }, loadEnvFile: false });
  const gateway = await startGateway(config, { logStream: false });
  try {
    for (const route of PROXY_ROUTES) {
      const response = await request(gateway.url, `${route.prefix}/resource`);
      assert.equal(response.status, 503, route.prefix);
      assert.deepEqual(JSON.parse(response.body), { message: "Serviço de destino não configurado." });
    }
    assert.equal(calls, 0);
    const auth = await request(gateway.url, "/api/auth/login");
    assert.equal(auth.status, 200);
    assert.equal(calls, 1);
  } finally {
    await close(gateway.server);
    await close(upstream);
  }
});
