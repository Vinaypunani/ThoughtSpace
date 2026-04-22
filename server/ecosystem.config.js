module.exports = {
  apps: [{
    name: 'blog-api',
    script: './src/server.js',
    exec_mode: 'cluster',
    instances: 'max',
    max_memory_restart: '500M',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    merge_logs: true,
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    }
  }]
};
