// PM2 process manager config for the SE Deal Workspace dev server.
// Runs `npm run dev` under a daemon that auto-restarts on crash, backs off on
// crash loops, and recycles the process if it leaks memory (a common cause of a
// "stuck" dev server). Managed with:
//   pm2 start ecosystem.config.js
//   pm2 save            # persist across the pm2 daemon restarting
//   pm2 logs se-deal-dev
module.exports = {
  apps: [
    {
      name: "se-deal-dev",
      script: "npm",
      args: "run dev",
      cwd: "/home/seadmin/se-deal-workspace",
      autorestart: true,
      // Avoid a tight crash loop: require 15s of uptime to count as "started",
      // give up only after 50 rapid failures, and back off between restarts.
      min_uptime: 15000,
      max_restarts: 50,
      restart_delay: 3000,
      exp_backoff_restart_delay: 200,
      // Recycle if the dev server balloons past ~1.5 GB (prevents OOM hangs).
      max_memory_restart: "1500M",
      kill_timeout: 8000,
      watch: false,
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};
