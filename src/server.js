require('dotenv').config();

const app = require('./app');
const { testConnection } = require('./config/db');

const PORT = parseInt(process.env.PORT);

async function bootstrap() {
  await testConnection();

  app.listen(PORT, () => {
    console.log(`\n🚀  SmartShelf v2 API running`);
    console.log(`   ├─ Port        : ${PORT}`);
    console.log(`   ├─ Environment : ${process.env.NODE_ENV || 'development'}`);
    console.log(`   ├─ Health      : http://localhost:${PORT}/health`);
    console.log(`   ├─ Admin API   : /api/admin/...`);
    console.log(`   └─ Staff API   : /api/staff/...\n`);
  });
}

bootstrap().catch((err) => {
  console.error('❌  Server failed to start:', err.message);
  process.exit(1);
});