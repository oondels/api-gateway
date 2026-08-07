module.exports = {
  apps: [
    {
      name: "dass-api-gateway",
      script: "dist/index.js",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1_000,
    },
  ],
};
