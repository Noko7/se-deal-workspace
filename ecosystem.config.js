// PM2 process manager config for the SE Deal Workspace staging server.
// Serves the production build (`npm run start` = `next start`) on port 3000
// under a daemon that auto-restarts on crash, backs off on crash loops, and
// recycles the process if it leaks memory. Build first (`npm run build`), then:
//   pm2 start ecosystem.config.js
//   pm2 save            # persist across the pm2 daemon restarting
//   pm2 logs se-deal-staging
// Deploys go through `npm run deploy`, which rebuilds and restarts this app.
module.exports = {
  apps: [
    {
      name: "se-deal-staging",
      script: "npm",
      args: "run start",
      cwd: "/home/seadmin/se-deal-workspace",
      autorestart: true,
      // Avoid a tight crash loop: require 15s of uptime to count as "started",
      // give up only after 50 rapid failures, and back off between restarts.
      min_uptime: 15000,
      max_restarts: 50,
      restart_delay: 3000,
      exp_backoff_restart_delay: 200,
      // Recycle if the server balloons past ~1.5 GB (prevents OOM hangs).
      max_memory_restart: "1500M",
      kill_timeout: 8000,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
  ],
};
