module.exports = {
  apps: [
    {
      name: 'patrol-server',
      cwd: 'd:/patrol-report/server',
      script: 'cmd.exe',
      args: '/c npm run dev',
      interpreter: 'none', // 不让 PM2 用 node 去跑 cmd.exe
      env: {
        NODE_ENV: 'development',
      },
    },
    {
      name: 'patrol-client',
      cwd: 'd:/patrol-report/client',
      script: 'cmd.exe',
      args: '/c npm run dev',
      interpreter: 'none',
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
};
