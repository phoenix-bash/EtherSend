module.exports = {
  apps: [
    {
      name: "linkforge-backend",
      cwd: ".",
      script: "pnpm",
      args: "--filter @linkforge/backend start",
      env: {
        NODE_ENV: "production"
      },
      autorestart: true,
      max_memory_restart: "600M",
      out_file: "logs/pm2/backend.out.log",
      error_file: "logs/pm2/backend.err.log",
      time: true
    },
    {
      name: "linkforge-frontend",
      cwd: ".",
      script: "pnpm",
      args: "--filter @linkforge/frontend start",
      env: {
        NODE_ENV: "production"
      },
      autorestart: true,
      max_memory_restart: "700M",
      out_file: "logs/pm2/frontend.out.log",
      error_file: "logs/pm2/frontend.err.log",
      time: true
    }
  ]
};